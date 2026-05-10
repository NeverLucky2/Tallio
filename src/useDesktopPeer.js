import { useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'peerjs';
import { PEER_CONFIG, peerIdFor, createReassembler, FATAL_PEER_ERRORS } from './peerProtocol.js';

const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const RECEIVE_TIMEOUT_MS = 30 * 1000;

export default function useDesktopPeer() {
  const [active, setActive] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState(null);
  const [lastImage, setLastImage] = useState(null);
  const [receiveProgress, setReceiveProgress] = useState(0);
  const [expiresAt, setExpiresAt] = useState(null);

  const peerRef = useRef(null);
  const connRef = useRef(null);
  const reassemblerRef = useRef(null);
  const expiryTimerRef = useRef(null);
  const receiveTimerRef = useRef(null);
  const readerRef = useRef(null);

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
      try { readerRef.current.abort(); } catch (e) { /* ignore */ }
      readerRef.current = null;
    }
    if (connRef.current) {
      try { connRef.current.close(); } catch (e) { /* ignore */ }
      connRef.current = null;
    }
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (e) { /* ignore */ }
      peerRef.current = null;
    }
    reassemblerRef.current = null;
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

  const armReceiveTimer = useCallback((id) => {
    if (receiveTimerRef.current) clearTimeout(receiveTimerRef.current);
    receiveTimerRef.current = setTimeout(() => {
      if (reassemblerRef.current) reassemblerRef.current.drop(id);
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
      armReceiveTimer(msg.id);
    } else if (msg.t === 'img-chunk') {
      const update = r.onChunk(msg);
      if (update) {
        setReceiveProgress(update.progress);
        armReceiveTimer(msg.id);
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

  const wireConnection = useCallback((conn) => {
    connRef.current = conn;
    conn.on('open', () => {
      if (connRef.current !== conn) return;
      disarmExpiry();
      setStatus('paired');
    });
    conn.on('data', (msg) => {
      if (connRef.current !== conn) return;
      handleData(msg);
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
  }, [armExpiry, disarmExpiry, handleData]);

  const start = useCallback(() => {
    cleanup();
    setLastImage(null);
    setReceiveProgress(0);
    setErrorMessage(null);
    const id = crypto.randomUUID();
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
        try { conn.close(); } catch (e) { /* ignore */ }
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
      try { peer.reconnect(); } catch (e) { /* ignore */ }
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
    start,
    unpair,
    consumeImage,
  };
}
