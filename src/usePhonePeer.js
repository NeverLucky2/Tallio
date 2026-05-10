import { useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'peerjs';
import { PEER_CONFIG, peerIdFor, makeImageChunks, CHUNK_SIZE } from './peerProtocol.js';

export default function usePhonePeer(sessionId) {
  const [status, setStatus] = useState('connecting');
  const [errorMessage, setErrorMessage] = useState(null);
  const [sendProgress, setSendProgress] = useState(0);

  const peerRef = useRef(null);
  const connRef = useRef(null);

  const cleanup = useCallback(() => {
    if (connRef.current) {
      try { connRef.current.close(); } catch (e) { /* ignore */ }
      connRef.current = null;
    }
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (e) { /* ignore */ }
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
      const conn = peer.connect(peerIdFor(sessionId), { reliable: true });
      connRef.current = conn;

      conn.on('open', () => setStatus('ready'));
      conn.on('close', () => {
        connRef.current = null;
        setStatus('disconnected');
      });
      conn.on('error', (err) => {
        setErrorMessage(err && err.message ? err.message : 'Connection error');
        setStatus('error');
      });
    });

    peer.on('error', (err) => {
      const type = err && err.type;
      if (type === 'peer-unavailable') {
        setErrorMessage('Desktop session not found. Make sure the pairing window is still open.');
      } else if (type === 'network') {
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

    conn.send(start);
    for (let i = 0; i < chunks.length; i++) {
      conn.send(chunks[i]);
      setSendProgress((i + 1) / chunks.length);
      // Yield to the event loop so the UI can repaint and the
      // DataChannel buffer can drain between chunks.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    conn.send(end);
    // Return to 'ready' immediately — the component handles its own
    // "✓ Sent" confirmation visual. We don't expose a 'sent' status to
    // avoid tempting components to call retry() (which destroys the peer).
    setSendProgress(0);
    setStatus('ready');
  }, []);

  useEffect(() => {
    dial();
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return { status, errorMessage, sendProgress, retry: dial, sendImage };
}
