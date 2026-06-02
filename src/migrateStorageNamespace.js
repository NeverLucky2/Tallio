// src/migrateStorageNamespace.js
// One-time rename of the localStorage namespace: billtracker-* -> tallio-*.
// Prefix-based so it covers every key (ledger, categories, settings, backups,
// account types, report acks) without enumerating them. Must run before any
// React hook reads storage (see main.jsx). Idempotent and crash-safe.
const OLD_PREFIX = 'billtracker-';
const NEW_PREFIX = 'tallio-';

export function migrateStorageNamespace(storage) {
  const target = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return;

  try {
    // Collect first: removing keys mid-iteration shifts indices.
    const oldKeys = [];
    for (let i = 0; i < target.length; i++) {
      const k = target.key(i);
      if (k && k.startsWith(OLD_PREFIX)) oldKeys.push(k);
    }

    for (const oldKey of oldKeys) {
      const newKey = NEW_PREFIX + oldKey.slice(OLD_PREFIX.length);
      // Never clobber data already written under the new namespace.
      if (target.getItem(newKey) === null) {
        target.setItem(newKey, target.getItem(oldKey));
      }
      target.removeItem(oldKey);
    }
  } catch (e) {
    console.error('Storage namespace migration failed:', e);
  }
}
