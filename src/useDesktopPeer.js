import { useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'peerjs';
import { PEER_CONFIG, peerIdFor, createReassembler } from './peerProtocol.js';

const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

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

  const cleanup = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
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

  const handleData = useCallback((msg) => {
    if (!reassemblerRef.current) reassemblerRef.current = createReassembler();
    const r = reassemblerRef.current;
    if (msg.t === 'img-start') {
      r.onStart(msg);
      setStatus('receiving');
      setReceiveProgress(0);
    } else if (msg.t === 'img-chunk') {
      const update = r.onChunk(msg);
      if (update) setReceiveProgress(update.progress);
    } else if (msg.t === 'img-end') {
      const buffer = r.onEnd(msg);
      if (buffer) {
        const blob = new Blob([buffer], { type: 'image/jpeg' });
        const reader = new FileReader();
        reader.onload = () => {
          setLastImage({ dataUrl: reader.result, receivedAt: Date.now() });
          setStatus('paired');
          setReceiveProgress(0);
        };
        reader.readAsDataURL(blob);
      }
    }
  }, []);

  const wireConnection = useCallback((conn) => {
    connRef.current = conn;
    conn.on('open', () => {
      disarmExpiry();
      setStatus('paired');
    });
    conn.on('data', handleData);
    conn.on('close', () => {
      connRef.current = null;
      reassemblerRef.current = null;
      setStatus('disconnected');
      setReceiveProgress(0);
      armExpiry();
    });
    conn.on('error', () => {
      connRef.current = null;
      setStatus('disconnected');
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
      setStatus('waiting');
      armExpiry();
    });

    peer.on('connection', (conn) => {
      if (connRef.current && connRef.current.open) {
        try { conn.close(); } catch (e) { /* ignore */ }
        return;
      }
      wireConnection(conn);
    });

    peer.on('error', (err) => {
      const msg = err && err.type === 'network'
        ? 'Pairing service unreachable. Check your connection.'
        : `Pairing error: ${err && err.type ? err.type : 'unknown'}`;
      setErrorMessage(msg);
      setStatus('error');
      cleanup();
    });

    peer.on('disconnected', () => {
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
