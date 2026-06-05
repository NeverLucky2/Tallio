// src/useImageLibrary.js
import { useState, useEffect, useCallback } from 'react';
import * as store from './imageStore.js';

// deps lets tests inject store functions (e.g. a canvas-free putImage).
export default function useImageLibrary(deps = {}) {
  const api = {
    listImages: deps.listImages || store.listImages,
    putImage: deps.putImage || store.putImage,
    deleteImage: deps.deleteImage || store.deleteImage,
    updateImageMeta: deps.updateImageMeta || store.updateImageMeta,
    replaceAllImages: deps.replaceAllImages || store.replaceAllImages,
  };
  const [images, setImages] = useState([]);

  const reload = useCallback(async () => {
    try {
      setImages(await api.listImages());
    } catch {
      setImages([]); // IndexedDB unavailable (e.g. privacy mode) — degrade gracefully
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const addFromFile = useCallback(async (file, meta) => {
    const saved = await api.putImage(file, meta);
    await reload();
    return saved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const remove = useCallback(async (id) => {
    await api.deleteImage(id);
    await reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const updateMeta = useCallback(async (id, patch) => {
    await api.updateImageMeta(id, patch);
    await reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  // For undo: snapshot the current records (by reference — records are replaced,
  // not mutated, so this is a valid point-in-time copy); restore overwrites the
  // whole store back to that set.
  const snapshot = useCallback(() => images, [images]);
  const restore = useCallback(async (records) => {
    await api.replaceAllImages(records || []);
    await reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  return { images, reload, addFromFile, remove, updateMeta, snapshot, restore };
}
