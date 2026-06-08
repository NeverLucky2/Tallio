import { useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'peerjs';
import { PEER_CONFIG, peerIdFor, createReassembler, FATAL_PEER_ERRORS, randomId } from './peerProtocol.js';
import { createBatchReceiver, makeImageAck } from './batchProtocol.js';

const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const RECEIVE_TIMEOUT_MS = 30 * 1000;
const EMPTY_BATCH = { id: null, count: 0, completed: 0, failed: 0, photoProgress: 0, overall: 0, status: 'idle' };

export default function useDesktopPeer({ onLibraryImage } = {}) {
  const [active, setActive] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState(null);
  const [lastImage, setLastImage] = useState(null);
  const [receiveProgress, setReceiveProgress] = useState(0);
  const [expiresAt, setExpiresAt] = useState(null);
  const [batch, setBatch] = useState(EMPTY_BATCH);

  const peerRef = useRef(null);
  const connRef = useRef(null);
  const reassemblerRef = useRef(null);
  const expiryTimerRef = useRef(null);
  const receiveTimerRef = useRef(null);
  const readerRef = useRef(null);
  const modeRef = useRef('scan');
  const batchReceiverRef = useRef(null);
  const onLibraryImageRef = useRef(onLibraryImage);
  useEffect(() => { onLibraryImageRef.current = onLibraryImage; }, [onLibraryImage]);

  const cleanup = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    if (receiveTimerRef.current) {
      clearTimeout(receiveTimerRef.current);
      receiveTimerRef.current = null;
    }
    if (readerRef.current) {
      try { readerRef.current.abort(); } catch { /* ignore */ }
      readerRef.current = null;
    }
    if (connRef.current) {
      try { connRef.current.close(); } catch { /* ignore */ }
      connRef.current = null;
    }
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch { /* ignore */ }
      peerRef.current = null;
    }
    reassemblerRef.current = null;
    batchReceiverRef.current = null;
  }, []);

  const armExpiry = useCallback(() => {
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    const expiresAtMs = Date.now() + SESSION_TIMEOUT_MS;
    setExpiresAt(expiresAtMs);
    expiryTimerRef.current = setTimeout(() => {
      setStatus('expired');
      cleanup();
    }, SESSION_TIMEOUT_MS);
  }, [cleanup]);

  const disarmExpiry = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    setExpiresAt(null);
  }, []);

  const armReceiveTimer = useCallback(() => {
    if (receiveTimerRef.current) clearTimeout(receiveTimerRef.current);
    receiveTimerRef.current = setTimeout(() => {
      // Drop all in-flight reassembler state — don't leave half-buffers around.
      reassemblerRef.current = null;
      setStatus(connRef.current && connRef.current.open ? 'paired' : 'disconnected');
      setReceiveProgress(0);
      receiveTimerRef.current = null;
    }, RECEIVE_TIMEOUT_MS);
  }, []);

  const disarmReceiveTimer = useCallback(() => {
    if (receiveTimerRef.current) {
      clearTimeout(receiveTimerRef.current);
      receiveTimerRef.current = null;
    }
  }, []);

  const handleData = useCallback((msg) => {
    if (!reassemblerRef.current) reassemblerRef.current = createReassembler();
    const r = reassemblerRef.current;
    if (msg.t === 'img-start') {
      r.onStart(msg);
      setStatus('receiving');
      setReceiveProgress(0);
      armReceiveTimer();
    } else if (msg.t === 'img-chunk') {
      const update = r.onChunk(msg);
      if (update) {
        setReceiveProgress(update.progress);
        armReceiveTimer();
      }
    } else if (msg.t === 'img-end') {
      disarmReceiveTimer();
      const buffer = r.onEnd(msg);
      if (buffer) {
        const blob = new Blob([buffer], { type: 'image/jpeg' });
        const reader = new FileReader();
        readerRef.current = reader;
        reader.onload = () => {
          if (readerRef.current !== reader) return;
          readerRef.current = null;
          setLastImage({ dataUrl: reader.result, receivedAt: Date.now() });
          setStatus('paired');
          setReceiveProgress(0);
        };
        reader.onerror = () => {
          if (readerRef.current !== reader) return;
          readerRef.current = null;
          setStatus(connRef.current && connRef.current.open ? 'paired' : 'disconnected');
          setReceiveProgress(0);
        };
        reader.readAsDataURL(blob);
      }
    }
  }, [armReceiveTimer, disarmReceiveTimer]);

  // Library mode: route batch frames through createBatchReceiver, commit each
  // completed photo via onLibraryImage, then ack per photo. markCommitted runs
  // only AFTER a confirmed commit, so a nacked photo's retry re-delivers (never
  // silently dropped). overall is computed here from committed+failed.
  const handleLibraryData = useCallback(async (msg, conn) => {
    if (!batchReceiverRef.current) batchReceiverRef.current = createBatchReceiver();
    const r = batchReceiverRef.current;
    const ev = r.onMessage(msg);
    if (!ev) return;
    if (ev.type === 'batch-start') {
      setBatch({ ...EMPTY_BATCH, id: msg.batchId, count: ev.count, status: 'receiving' });
    } else if (ev.type === 'progress') {
      setBatch(b => ({ ...b, photoProgress: ev.photoProgress }));
    } else if (ev.type === 'duplicate') {
      // Already committed (ack was lost); re-ack ok without re-committing.
      try { conn.send(makeImageAck(msg.batchId, ev.id, ev.index, true)); } catch { /* ignore */ }
    } else if (ev.type === 'image-complete') {
      let ok = false;
      try { ok = !!(await (onLibraryImageRef.current && onLibraryImageRef.current({ bytes: ev.bytes, mime: ev.mime, name: ev.name, index: ev.index, batchId: msg.batchId }))); } catch { ok = false; }
      if (ok) r.markCommitted(ev.id); // record AFTER a successful commit only
      try { conn.send(makeImageAck(msg.batchId, ev.id, ev.index, ok)); } catch { /* ignore */ }
      setBatch(b => {
        const completed = ok ? b.completed + 1 : b.completed;
        const failed = ok ? b.failed : b.failed + 1;
        const status = (completed + failed) >= b.count && b.count > 0 ? 'done' : 'receiving';
        const overall = b.count > 0 ? (completed + failed) / b.count : 0;
        return { ...b, completed, failed, overall, photoProgress: 0, status };
      });
    }
  }, []);

  const wireConnection = useCallback((conn) => {
    connRef.current = conn;
    conn.on('open', () => {
      if (connRef.current !== conn) return;
      disarmExpiry();
      setStatus('paired');
    });
    conn.on('data', (msg) => {
      if (connRef.current !== conn) return;
      if (modeRef.current === 'library') handleLibraryData(msg, conn);
      else handleData(msg);
    });
    conn.on('close', () => {
      if (connRef.current !== conn) return;
      connRef.current = null;
      reassemblerRef.current = null;
      setStatus('disconnected');
      setReceiveProgress(0);
      armExpiry();
    });
    conn.on('error', () => {
      if (connRef.current !== conn) return;
      connRef.current = null;
      reassemblerRef.current = null;
      setStatus('disconnected');
      setReceiveProgress(0);
      armExpiry();
    });
  }, [armExpiry, disarmExpiry, handleData, handleLibraryData]);

  const start = useCallback((mode = 'scan') => {
    cleanup();
    modeRef.current = mode;
    setBatch(EMPTY_BATCH);
    setLastImage(null);
    setReceiveProgress(0);
    setErrorMessage(null);
    const id = randomId();
    setSessionId(id);
    setActive(true);
    setStatus('connecting');

    const peer = new Peer(peerIdFor(id), PEER_CONFIG);
    peerRef.current = peer;

    peer.on('open', () => {
      if (peerRef.current !== peer) return;
      setStatus('waiting');
      armExpiry();
    });

    peer.on('connection', (conn) => {
      if (peerRef.current !== peer) return;
      if (connRef.current && connRef.current.open) {
        try { conn.close(); } catch { /* ignore */ }
        return;
      }
      wireConnection(conn);
    });

    peer.on('error', (err) => {
      if (peerRef.current !== peer) return;
      const type = err && err.type;
      if (!FATAL_PEER_ERRORS.has(type)) {
        console.warn('[useDesktopPeer] non-fatal PeerJS error:', type, err);
        return;
      }
      const friendlyType = (type === 'socket-error' || type === 'socket-closed') ? 'network' : type;
      const msg = friendlyType === 'network'
        ? 'Pairing service unreachable. Check your connection.'
        : `Pairing error: ${friendlyType || 'unknown'}`;
      setErrorMessage(msg);
      setStatus('error');
      cleanup();
    });

    peer.on('disconnected', () => {
      if (peerRef.current !== peer) return;
      try { peer.reconnect(); } catch { /* ignore */ }
    });
  }, [armExpiry, cleanup, wireConnection]);

  const unpair = useCallback(() => {
    cleanup();
    setActive(false);
    setSessionId(null);
    setStatus('idle');
    setExpiresAt(null);
    setReceiveProgress(0);
    setLastImage(null);
    setErrorMessage(null);
    setBatch(EMPTY_BATCH);
    modeRef.current = 'scan';
  }, [cleanup]);

  const consumeImage = useCallback(() => setLastImage(null), []);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    active,
    sessionId,
    status,
    errorMessage,
    lastImage,
    receiveProgress,
    expiresAt,
    batch,
    start,
    unpair,
    consumeImage,
  };
}
