// src/useBackgroundPhotos.js
import { useState, useEffect, useRef } from 'react';
import { listImages, getImage } from './imageStore.js';
import { resolvePhotoIds } from './backgroundPhotos.js';

function reducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// deps: { list, get } injectable for tests; defaults to the real imageStore.
export default function useBackgroundPhotos(background, deps = {}) {
  const list = deps.list || listImages;
  const get = deps.get || getImage;

  const [photos, setPhotos] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const urlsRef = useRef([]);

  const isPhotos = (background && background.base) === 'photos';
  // Re-run the loader whenever the selection identity changes.
  const selectionKey = isPhotos
    ? JSON.stringify([background.photoIds || [], background.photoGroup || null])
    : '';

  useEffect(() => {
    let cancelled = false;
    if (!isPhotos) { setPhotos([]); setActiveIndex(0); return undefined; }

    (async () => {
      const metas = await list();
      const ids = resolvePhotoIds(background, metas);
      const loaded = [];
      for (const id of ids) {
        const rec = await get(id);
        if (rec && rec.blob) {
          loaded.push({ id, url: URL.createObjectURL(rec.blob), palette: rec.palette || [] });
        }
      }
      if (cancelled) { loaded.forEach(p => URL.revokeObjectURL(p.url)); return; }
      urlsRef.current.forEach(u => URL.revokeObjectURL(u));
      urlsRef.current = loaded.map(p => p.url);
      setPhotos(loaded);
      setActiveIndex(0);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPhotos, selectionKey]);

  const slideshow = isPhotos
    && (background.mode === 'slideshow')
    && photos.length > 1
    && !reducedMotion();
  const intervalMs = Math.max(5, Number(background && background.intervalSec) || 30) * 1000;

  useEffect(() => {
    if (!slideshow) return undefined;
    const t = setInterval(() => setActiveIndex(i => (i + 1) % photos.length), intervalMs);
    return () => clearInterval(t);
  }, [slideshow, intervalMs, photos.length]);

  // Revoke any outstanding URLs on unmount.
  useEffect(() => () => { urlsRef.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  return { photos, activeIndex };
}
