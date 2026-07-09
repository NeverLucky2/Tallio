// src/storagePersist.js
// Ask the browser not to evict Tallio's data, and report storage usage.
// Every call is feature-detected so it is safe under jsdom (benign defaults).

export async function requestPersistentStorage() {
  const s = typeof navigator !== 'undefined' && navigator.storage;
  if (!s || typeof s.persist !== 'function') return { supported: false, persisted: false };
  let persisted = typeof s.persisted === 'function' ? await s.persisted() : false;
  if (!persisted) persisted = await s.persist();
  return { supported: true, persisted: !!persisted };
}

export async function getStorageEstimate() {
  const s = typeof navigator !== 'undefined' && navigator.storage;
  if (!s || typeof s.estimate !== 'function') return { supported: false, usage: 0, quota: 0 };
  const { usage = 0, quota = 0 } = await s.estimate();
  return { supported: true, usage, quota };
}
