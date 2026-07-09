// src/useLiveFile.js
// Manage a linked .tallio file (Chrome/Edge): link (save-as), open, unlink,
// debounced autosave, and silent reattach on mount. Browser storage stays the
// working store; the file is an auto-synced mirror.
import { useState, useEffect, useRef, useCallback } from 'react';
import * as fileStore from './fileStore.js';

export const SAVE_DEBOUNCE_MS = 1500;

export default function useLiveFile({ getBytes, applyBytes }) {
  const supported = fileStore.isLiveFileSupported();
  const [handle, setHandle] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const timerRef = useRef(null);
  const handleRef = useRef(null);
  handleRef.current = handle;

  // Reattach a previously linked file on mount (no import — storage is source of truth).
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      const saved = await fileStore.loadHandle();
      if (cancelled || !saved) return;
      if (await fileStore.ensurePermission(saved)) { setHandle(saved); setFileName(saved.name); }
    })();
    return () => { cancelled = true; };
  }, [supported]);

  const saveNow = useCallback(async () => {
    const h = handleRef.current;
    if (!h) return;
    await fileStore.writeHandle(h, await getBytes());
    setLastSavedAt(Date.now());
  }, [getBytes]);

  const scheduleSave = useCallback(() => {
    if (!handleRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { saveNow(); }, SAVE_DEBOUNCE_MS);
  }, [saveNow]);

  const linkNewFile = useCallback(async () => {
    const h = await fileStore.pickSaveFile();
    await fileStore.writeHandle(h, await getBytes());
    await fileStore.saveHandle(h);
    setHandle(h); setFileName(h.name); setLastSavedAt(Date.now());
  }, [getBytes]);

  const openFile = useCallback(async () => {
    const h = await fileStore.pickOpenFile();
    if (!(await fileStore.ensurePermission(h))) return;
    const bytes = await fileStore.readHandle(h);
    await fileStore.saveHandle(h);
    await applyBytes(bytes); // caller restores + reloads
  }, [applyBytes]);

  const unlink = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await fileStore.clearHandle();
    setHandle(null); setFileName(null); setLastSavedAt(null);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return {
    supported,
    status: handle ? 'linked' : 'unlinked',
    fileName, lastSavedAt,
    linkNewFile, openFile, unlink, scheduleSave,
  };
}
