// src/IconLibraryProvider.jsx
// Root provider owning one image library + the <Icon> object-URL cache. The
// cache is diffed incrementally (stable urls for unchanged thumbs) so long
// lists never flicker on add/delete/recrop. Exposes the library CRUD too so the
// Appearance screen and <Icon> share one source of truth.
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import useImageLibrary from './useImageLibrary.js';
import { diffIconUrls } from './iconUrlCache.js';
import { IconLibraryContext } from './iconLibraryContext.js';

export default function IconLibraryProvider({ children }) {
  const lib = useImageLibrary();
  // prevRef holds the last map so diffing happens once in the effect body (not
  // in a state updater, which StrictMode would double-invoke and leak urls).
  const prevRef = useRef(new Map());
  const [urlMap, setUrlMap] = useState(() => new Map());

  useEffect(() => {
    const make = (blob) => { try { return URL.createObjectURL(blob); } catch { return ''; } };
    const revoke = (url) => { try { if (url) URL.revokeObjectURL(url); } catch { /* ignore */ } };
    const next = diffIconUrls(prevRef.current, lib.images, make, revoke);
    prevRef.current = next;
    setUrlMap(next);
  }, [lib.images]);
  // No unmount-wide revoke: this provider lives for the app's lifetime, and
  // diffIconUrls already revokes urls for removed/recropped images as they go.

  const urlForId = useCallback((id) => {
    const e = urlMap.get(id);
    return e ? e.url : undefined;
  }, [urlMap]);

  const value = useMemo(() => ({
    images: lib.images,
    urlForId,
    addFromFile: lib.addFromFile,
    remove: lib.remove,
    updateMeta: lib.updateMeta,
    reload: lib.reload,
  }), [lib.images, lib.addFromFile, lib.remove, lib.updateMeta, lib.reload, urlForId]);

  return <IconLibraryContext.Provider value={value}>{children}</IconLibraryContext.Provider>;
}
