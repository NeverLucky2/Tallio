// src/crossWindowSync.js
// Keeps several open Tallio windows from overwriting each other. Each window holds
// its own in-memory copy and saves the whole copy on every edit, so a window that
// missed a change made elsewhere would silently clobber it. The browser's `storage`
// event fires only in OTHER same-origin windows; on a main-data change we reload.
import { reloadApp } from './reloadApp.js';

// Whole-blob stores a stale window could clobber. Deliberately excluded: the
// copy/paste clipboard and celebration counters (harmless if stale) and settings
// (useSettings.save writes only the fields being changed).
const IMAGES_REV_KEY = 'tallio-images-rev';
export const SYNCED_KEYS = [
  'tallio-accounts',
  'tallio-transactions',
  'tallio-categories',
  'tallio-payees',
  'tallio-templates',
  'tallio-account-types',
  'tallio-report-acks',
  'tallio-appearance',
  IMAGES_REV_KEY,
];

const NOTE_KEY = 'tallio-reloaded-by-other-window';

// The image library lives in IndexedDB, which fires no `storage` event, and Undo
// restores it wholesale, so a stale window could delete another window's uploads.
// Every library change therefore writes a fresh marker here for other windows to see.
export function markImagesChanged(storage = window.localStorage) {
  try {
    storage.setItem(IMAGES_REV_KEY, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  } catch { /* quota: other windows just won't reload for this change */ }
}

// Calls onChange(key) when another window changes a synced key, or clears storage
// (key null). Returns an unsubscribe function.
export function watchOtherWindows(onChange, { target = window, storage = window.localStorage } = {}) {
  const handler = (e) => {
    if (e.storageArea !== storage) return;
    if (e.key === null || SYNCED_KEYS.includes(e.key)) onChange(e.key);
  };
  target.addEventListener('storage', handler);
  return () => target.removeEventListener('storage', handler);
}

// Called from main.jsx BEFORE React renders, so there is no gap between the stores
// reading storage and this window listening for changes made elsewhere.
export function startCrossWindowSync({ reload = reloadApp } = {}) {
  return watchOtherWindows(() => { noteReloadFromOtherWindow(); reload(); });
}

// One-shot note carried across the reload so the fresh page can say why it jumped.
// sessionStorage may be unavailable (privacy modes): the reload matters, the note doesn't.
export function noteReloadFromOtherWindow(session = window.sessionStorage) {
  try { session.setItem(NOTE_KEY, '1'); } catch { /* note is best-effort */ }
}

export function takeReloadNote(session = window.sessionStorage) {
  try {
    if (session.getItem(NOTE_KEY) === null) return false;
    session.removeItem(NOTE_KEY);
    return true;
  } catch {
    return false;
  }
}
