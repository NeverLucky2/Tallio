import { useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'peerjs';
import { PEER_CONFIG, peerIdFor, makeImageChunks, FATAL_PEER_ERRORS, randomId } from './peerProtocol.js';
import { makeBatchStart, createBatchSender } from './batchProtocol.js';

const SEND_ACK_TIMEOUT_MS = 30 * 1000;

export default function usePhonePeer(sessionId) {
  const [status, setStatus] = useState('connecting');
  const [errorMessage, setErrorMessage] = useState(null);
  const [sendProgress, setSendProgress] = useState(0);

  const peerRef = useRef(null);
  const connRef = useRef(null);
  const ackWaitersRef = useRef(new Map()); // imageId -> (ok) => void

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
      conn.on('data', (msg) => {
        if (connRef.current !== conn) return;
        if (msg && msg.t === 'img-ack') {
          const resolve = ackWaitersRef.current.get(msg.id);
          if (resolve) { ackWaitersRef.current.delete(msg.id); resolve(!!msg.ok); }
        }
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

  // Sends one image's frames and resolves with the desktop's ack (true/false).
  // Resolves false on connection loss or ack timeout so the batch can continue.
  // item.id is the caller's stable id, used as the wire id + ack-waiter key.
  const sendOneImage = useCallback((conn, batchId, item, index, onProgress) => {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => { if (!settled) { settled = true; ackWaitersRef.current.delete(item.id); resolve(ok); } };
      const { start, chunks, end } = makeImageChunks(item.bytes, item.mime, { id: item.id, batchId, index, name: item.name });
      ackWaitersRef.current.set(item.id, finish);
      const timer = setTimeout(() => finish(false), SEND_ACK_TIMEOUT_MS);
      (async () => {
        try {
          conn.send(start);
          for (let i = 0; i < chunks.length; i++) {
            if (connRef.current !== conn || !conn.open) throw new Error('lost');
            conn.send(chunks[i]);
            if (onProgress) onProgress((i + 1) / chunks.length);
            // Yield so the UI can repaint and the DataChannel buffer can drain.
            await new Promise(r => setTimeout(r, 0));
          }
          if (connRef.current !== conn || !conn.open) throw new Error('lost');
          conn.send(end);
        } catch {
          clearTimeout(timer);
          finish(false);
        }
      })();
    });
  }, []);

  // Sends a batch of images sequentially (ack-gated): each photo waits for the
  // desktop's per-photo ack before the next is sent. Returns the failed ids so
  // the caller can offer a retry. Reuses the same item ids across a retry so the
  // desktop dedups already-committed photos.
  const sendBatch = useCallback(async (items, { onProgress, onAck } = {}) => {
    const conn = connRef.current;
    if (!conn || !conn.open) throw new Error('Not connected');
    const batchId = randomId();
    const sender = createBatchSender(items); // keyed on caller-supplied item.id
    setStatus('sending');
    try {
      conn.send(makeBatchStart(batchId, items.length));
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (sender.statusOf(item.id) !== 'pending') continue;
        const ok = await sendOneImage(conn, batchId, item, index, (p) => onProgress && onProgress(item.id, p));
        sender.onAck({ id: item.id, ok });
        if (onAck) onAck(item.id, ok);
      }
    } finally {
      if (connRef.current === conn) setStatus('ready');
    }
    return { failed: sender.failed() };
  }, [sendOneImage]);

  useEffect(() => {
    dial();
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return { status, errorMessage, sendProgress, retry: dial, sendImage, sendBatch };
}
