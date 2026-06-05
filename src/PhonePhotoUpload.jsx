import React, { useCallback, useEffect, useRef, useState } from 'react';
import usePhonePeer from './usePhonePeer.js';
import { parsePairHash } from './pairLink.js';
import { downscaleImageFile, decodeHeicIfNeeded } from './imageProcess.js';
import PhotoTray from './PhotoTray.jsx';

export default function PhonePhotoUpload() {
  const { sessionId } = parsePairHash(window.location.hash);
  const peer = usePhonePeer(sessionId);
  const [photos, setPhotos] = useState([]); // { id, file, name, previewUrl, state, progress }
  const idCounter = useRef(0);

  // The phone page must not inherit the desktop's --ui-scale zoom (applied on
  // #root). At >1 it scales the 100dvh layout past the viewport and clips the
  // bottom action bar, so pin it to 1 here.
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', '1');
  }, []);

  const patch = useCallback((id, fields) => {
    setPhotos(prev => prev.map(p => (p.id === id ? { ...p, ...fields } : p)));
  }, []);

  const onPick = useCallback((files) => {
    const added = files.map((file, i) => ({
      id: `pick-${idCounter.current++}`,
      file,
      name: file.name || `Phone photo ${i + 1}`,
      previewUrl: URL.createObjectURL(file),
      state: 'pending',
      progress: 0,
    }));
    setPhotos(prev => [...prev, ...added]);
  }, []);

  const onRemove = useCallback((id) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  }, []);

  const send = useCallback(async (targets) => {
    if (!targets || !targets.length) return;
    // Downscale each picked file, then send. item.id === the tray id (stable), so
    // the onProgress/onAck callbacks patch tray state directly by id.
    const items = [];
    for (const p of targets) {
      patch(p.id, { state: 'sending', progress: 0 });
      try {
        const source = await decodeHeicIfNeeded(p.file); // HEIC -> JPEG (lazy heic2any)
        const blob = await downscaleImageFile(source);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        items.push({ id: p.id, bytes, mime: 'image/jpeg', name: p.name });
      } catch {
        // Browser can't decode this file (e.g. HEIC on non-Safari). Fail just
        // this photo and keep the rest of the batch going.
        patch(p.id, { state: 'failed', progress: 0 });
      }
    }
    if (!items.length) return;
    await peer.sendBatch(items, {
      onProgress: (id, prog) => patch(id, { progress: prog }),
      onAck: (id, ok) => patch(id, { state: ok ? 'done' : 'failed', progress: ok ? 1 : 0 }),
    });
  }, [peer, patch]);

  // Revoke object-URLs for photos no longer present (and all on unmount).
  const prevUrls = useRef(new Set());
  useEffect(() => {
    const current = new Set(photos.map(p => p.previewUrl));
    for (const url of prevUrls.current) if (!current.has(url)) { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }
    prevUrls.current = current;
  }, [photos]);
  useEffect(() => () => { for (const url of prevUrls.current) { try { URL.revokeObjectURL(url); } catch { /* ignore */ } } }, []);

  if (!sessionId) {
    return (<div className="phone-root phone-error"><h1>Invalid pairing link</h1><p>This link is missing a session ID.</p></div>);
  }
  if (peer.status === 'error') {
    return (<div className="phone-root phone-error"><h1>Couldn't pair</h1><p>{peer.errorMessage}</p><button className="phone-btn phone-btn-primary" onClick={peer.retry}>Retry</button></div>);
  }
  if (peer.status === 'connecting') {
    return (<div className="phone-root"><div className="phone-spinner" /><h1>Connecting…</h1><p className="phone-sub">Linking to your desktop</p></div>);
  }
  const allDone = photos.length > 0 && photos.every(p => p.state === 'done');
  if (allDone) {
    return (<div className="phone-root"><div className="phone-check">✓</div><h1>Added to your library</h1><p className="phone-sub">{photos.length} photos sent</p><button className="phone-btn" onClick={() => setPhotos([])}>Send more</button></div>);
  }

  return (
    <PhotoTray
      photos={photos}
      connected={peer.status === 'ready' || peer.status === 'sending'}
      sending={peer.status === 'sending'}
      onPick={onPick}
      onSend={() => send(photos.filter(p => p.state === 'pending' || p.state === 'failed'))}
      onRetry={() => send(photos.filter(p => p.state === 'failed'))}
      onClear={() => setPhotos([])}
      onRemove={onRemove}
    />
  );
}
