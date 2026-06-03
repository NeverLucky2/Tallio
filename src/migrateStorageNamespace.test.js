import { describe, it, expect, beforeEach } from 'vitest';
import { migrateStorageNamespace } from './migrateStorageNamespace.js';

describe('migrateStorageNamespace', () => {
  beforeEach(() => localStorage.clear());

  it('copies every billtracker-* key to a tallio-* key', () => {
    localStorage.setItem('billtracker-accounts', '[{"id":"a1"}]');
    localStorage.setItem('billtracker-schema-version', '4');

    migrateStorageNamespace(localStorage);

    expect(localStorage.getItem('tallio-accounts')).toBe('[{"id":"a1"}]');
    expect(localStorage.getItem('tallio-schema-version')).toBe('4');
  });

  it('removes the old billtracker-* keys after migrating (true rename)', () => {
    localStorage.setItem('billtracker-transactions', '[]');

    migrateStorageNamespace(localStorage);

    expect(localStorage.getItem('billtracker-transactions')).toBeNull();
  });

  it('does not overwrite an existing tallio-* key, and drops the stale old one', () => {
    localStorage.setItem('billtracker-ui-scale', '1.0');
    localStorage.setItem('tallio-ui-scale', '1.3');

    migrateStorageNamespace(localStorage);

    expect(localStorage.getItem('tallio-ui-scale')).toBe('1.3');
    expect(localStorage.getItem('billtracker-ui-scale')).toBeNull();
  });

  it('leaves unrelated keys untouched', () => {
    localStorage.setItem('peerjs-id', 'xyz');

    migrateStorageNamespace(localStorage);

    expect(localStorage.getItem('peerjs-id')).toBe('xyz');
  });

  it('is idempotent — a second run is a no-op', () => {
    localStorage.setItem('billtracker-accounts', '[1]');

    migrateStorageNamespace(localStorage);
    migrateStorageNamespace(localStorage);

    expect(localStorage.getItem('tallio-accounts')).toBe('[1]');
    expect(localStorage.getItem('billtracker-accounts')).toBeNull();
  });

  it('is a no-op when there is no legacy data', () => {
    expect(() => migrateStorageNamespace(localStorage)).not.toThrow();
    expect(localStorage.length).toBe(0);
  });
});
