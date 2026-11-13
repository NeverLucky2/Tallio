// src/storageWriter.js
import { useRef, useCallback } from 'react';

// Returns write(value) for one localStorage key. It writes the JSON only when it
// differs from what this window last knew was stored, starting with what was there
// when the window loaded. A freshly (re)loaded window therefore never blind-writes its
// startup copy, which could erase a save another Tallio window made a moment later
// (see crossWindowSync.js). Throws like setItem (quota) so each store keeps its own
// error handling; returns true when it wrote.
export default function useStorageWriter(key) {
  const last = useRef(null);
  if (last.current === null) last.current = { json: window.localStorage.getItem(key) };
  return useCallback((value) => {
    const json = JSON.stringify(value);
    if (json === last.current.json) return false;
    window.localStorage.setItem(key, json);
    last.current.json = json;
    return true;
  }, [key]);
}
