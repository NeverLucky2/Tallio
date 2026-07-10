// src/fileStore.js
// All file I/O behind one interface: a universal download/read path, plus the
// Chrome/Edge File System Access API (pickers, handle read/write, permission) and
// persistence of the chosen handle in IndexedDB. Feature-detected; jsdom-safe.

export const DEFAULT_FILE_NAME = 'MyBudget.tallio';
export const TALLIO_FILE_TYPES = [
  { description: 'Tallio budget', accept: { 'application/x-tallio': ['.tallio'] } },
];

// --- Universal (every browser) ---
export function downloadArchive(bytes, filename = DEFAULT_FILE_NAME) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export async function readBytesFromFile(file) {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  // Fallback for environments without Blob.arrayBuffer (jsdom, older Safari).
  const buf = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsArrayBuffer(file);
  });
  return new Uint8Array(buf);
}

// --- File System Access API (Chrome/Edge) ---
export function isLiveFileSupported() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

export async function pickSaveFile(suggestedName = DEFAULT_FILE_NAME) {
  return window.showSaveFilePicker({ suggestedName, types: TALLIO_FILE_TYPES });
}

export async function pickOpenFile() {
  const [handle] = await window.showOpenFilePicker({ types: TALLIO_FILE_TYPES, multiple: false });
  return handle;
}

export async function writeHandle(handle, bytes) {
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

export async function readHandle(handle) {
  const file = await handle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

export async function ensurePermission(handle, mode = 'readwrite') {
  if (!handle || typeof handle.queryPermission !== 'function') return true;
  if ((await handle.queryPermission({ mode })) === 'granted') return true;
  return (await handle.requestPermission({ mode })) === 'granted';
}

// --- Handle persistence (IndexedDB; FileSystemFileHandle is structured-cloneable) ---
const HANDLE_DB = 'tallio-file';
const HANDLE_STORE = 'handles';
const HANDLE_KEY = 'current';

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(HANDLE_STORE)) req.result.createObjectStore(HANDLE_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function runTx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(HANDLE_STORE, mode);
    fn(t.objectStore(HANDLE_STORE));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function saveHandle(handle) {
  const db = await openHandleDb();
  try { await runTx(db, 'readwrite', s => s.put(handle, HANDLE_KEY)); } finally { db.close(); }
}

export async function loadHandle() {
  const db = await openHandleDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(HANDLE_STORE, 'readonly').objectStore(HANDLE_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

export async function clearHandle() {
  const db = await openHandleDb();
  try { await runTx(db, 'readwrite', s => s.delete(HANDLE_KEY)); } finally { db.close(); }
}
