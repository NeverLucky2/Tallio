// src/useClipboard.js
import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'tallio-clipboard';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.draft) return null;
    return { draft: parsed.draft, label: typeof parsed.label === 'string' ? parsed.label : '' };
  } catch {
    return null;
  }
}

// Single-slot copy/paste clipboard for entries. Persisted so the Paste button
// survives a reload. Follows the useReportAcks persist/error convention.
export default function useClipboard() {
  const [clipboard, setClipboard] = useState(load);
  const [storageError, setStorageError] = useState(null);

  useEffect(() => {
    try {
      if (clipboard) localStorage.setItem(STORAGE_KEY, JSON.stringify(clipboard));
      else localStorage.removeItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (storageError !== null) setStorageError(null);
    } catch (e) {
      console.error('Failed to save clipboard:', e);
      setStorageError({ message: "Couldn't save clipboard — storage full." });
    }
  }, [clipboard]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = useCallback((draft, label) => setClipboard({ draft, label: label || '' }), []);
  const clear = useCallback(() => setClipboard(null), []);
  const clearStorageError = useCallback(() => setStorageError(null), []);

  return { clipboard, copy, clear, storageError, clearStorageError };
}
