import { useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'peerjs';
import { PEER_CONFIG, peerIdFor, makeImageChunks, FATAL_PEER_ERRORS } from './peerProtocol.js';

export default function usePhonePeer(sessionId) {
  const [status, setStatus] = useState('connecting');
  const [errorMessage, setErrorMessage] = useState(null);
  const [sendProgress, setSendProgress] = useState(0);

  const peerRef = useRef(null);
  const connRef = useRef(null);

  const cleanup = useCallback(() => {
    if (connRef.current) {
      try { connRef.current.close(); } catch { /* ignore */ }
      connRef.current = null;
    }
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch { /* ignore */ }
      peerRef.current = null;
    }
  }, []);

  const dial = useCallback(() => {
    if (!sessionId) {
      setStatus('error');
      setErrorMessage('Invalid pairing link.');
      return;
    }
    cleanup();
    setStatus('connecting');
    setErrorMessage(null);

    const peer = new Peer(undefined, PEER_CONFIG);
    peerRef.current = peer;

    peer.on('open', () => {
      if (peerRef.current !== peer) return;
      const conn = peer.connect(peerIdFor(sessionId), { reliable: true });
      connRef.current = conn;

      conn.on('open', () => {
        if (connRef.current !== conn) return;
        setStatus('ready');
      });
      conn.on('close', () => {
        if (connRef.current !== conn) return;
        connRef.current = null;
        setStatus('disconnected');
      });
      conn.on('error', (err) => {
        if (connRef.current !== conn) return;
        setErrorMessage(err && err.message ? err.message : 'Connection error');
        setStatus('error');
      });
    });

    peer.on('error', (err) => {
      if (peerRef.current !== peer) return;
      const type = err && err.type;
      // peer-unavailable is informational — don't tear down the peer (user can retry).
      if (type === 'peer-unavailable') {
        setErrorMessage('Desktop session not found. Make sure the pairing window is still open.');
        setStatus('error');
        return;
      }
      // Non-fatal types: log and ignore.
      if (!FATAL_PEER_ERRORS.has(type)) {
        console.warn('[usePhonePeer] non-fatal PeerJS error:', type, err);
        return;
      }
      if (type === 'network' || type === 'socket-error' || type === 'socket-closed') {
        setErrorMessage('Cannot reach the pairing service.');
      } else {
        setErrorMessage(`Pairing error: ${type || 'unknown'}`);
      }
      setStatus('error');
      cleanup();
    });
  }, [cleanup, sessionId]);

  const sendImage = useCallback(async (bytes) => {
    const conn = connRef.current;
    if (!conn || !conn.open) throw new Error('Not connected');

    const { start, chunks, end } = makeImageChunks(bytes, 'image/jpeg');
    setSendProgress(0);
    setStatus('sending');

    try {
      conn.send(start);
      for (let i = 0; i < chunks.length; i++) {
        if (connRef.current !== conn || !conn.open) {
          throw new Error('Connection lost mid-send');
        }
        conn.send(chunks[i]);
        setSendProgress((i + 1) / chunks.length);
        // Yield to the event loop so the UI can repaint and the
        // DataChannel buffer can drain between chunks.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (connRef.current !== conn || !conn.open) {
        throw new Error('Connection lost mid-send');
      }
      conn.send(end);
    } finally {
      // Only restore 'ready' state if THIS connection is still active.
      // Otherwise leave whatever newer state (disconnected/error) is in place.
      if (connRef.current === conn) {
        setSendProgress(0);
        setStatus('ready');
      } else {
        setSendProgress(0);
      }
    }
  }, []);

  useEffect(() => {
    dial();
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return { status, errorMessage, sendProgress, retry: dial, sendImage };
}
