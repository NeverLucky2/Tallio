// src/imageStore.js
// IndexedDB wrapper for large image blobs. Kept source-agnostic (file upload now,
// phone upload later). All canvas processing lives in imageProcess.js; this file
// is pure DB plumbing so it is testable with fake-indexeddb.
import { nanoid } from 'nanoid';
import { processImageFile } from './imageProcess.js';

const DB_NAME = 'tallio-images';
const STORE = 'images';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function asPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await fn(db.transaction(STORE, mode).objectStore(STORE));
  } finally {
    db.close();
  }
}

export function putRecord(record) {
  return withStore('readwrite', (s) => asPromise(s.put(record)).then(() => record));
}

export function getImage(id) {
  return withStore('readonly', (s) => asPromise(s.get(id)));
}

export function listImages() {
  return withStore('readonly', (s) => asPromise(s.getAll()))
    .then((all) => all.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
}

export async function updateImageMeta(id, patch) {
  const existing = await getImage(id);
  if (!existing) return null;
  return putRecord({ ...existing, ...patch });
}

export function deleteImage(id) {
  return withStore('readwrite', (s) => asPromise(s.delete(id)));
}

// Combines canvas processing + a DB put. The processor is injectable so tests
// can avoid canvas; production uses processImageFile.
export async function putImage(file, meta = {}, { process = processImageFile } = {}) {
  const processed = await process(file);
  const record = {
    id: nanoid(),
    createdAt: Date.now(),
    name: meta.name || (file && file.name) || 'Untitled',
    group: meta.group || 'Uncategorized',
    ...processed,
  };
  return putRecord(record);
}
