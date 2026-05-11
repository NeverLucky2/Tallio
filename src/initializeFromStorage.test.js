import { describe, it, expect, beforeEach } from 'vitest';
import { initializeFromStorage } from './initializeFromStorage.js';

function makeFakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
    _dump: () => ({ ...store }),
  };
}

describe('initializeFromStorage', () => {
  it('fresh install: returns empty bills, sets schema version, writes seed categories', () => {
    const storage = makeFakeStorage();
    const result = initializeFromStorage(storage);
    expect(result.bills).toEqual([]);
    expect(result.migrationError).toBeNull();
    expect(storage.getItem('billtracker-schema-version')).toBe('2');
    const cats = JSON.parse(storage.getItem('billtracker-categories'));
    expect(cats.length).toBeGreaterThan(0);
    for (const c of cats) expect(typeof c.id).toBe('string');
  });

  it('fresh install: does NOT write a backup (nothing to back up)', () => {
    const storage = makeFakeStorage();
    initializeFromStorage(storage);
    expect(storage.getItem('billtracker-pre-categories-backup')).toBeNull();
  });

  it('v1 → v2 migration: writes backup, migrates items, bumps version', () => {
    const v1Bills = [
      { id: 'b1', vendor: 'V', month: '2026-04', items: [
        { id: 'i1', description: 'X', amount: 10, category: 'Utilities', date: null },
      ]},
    ];
    const storage = makeFakeStorage({
      'billtracker-bills': JSON.stringify(v1Bills),
    });
    const result = initializeFromStorage(storage);
    expect(result.migrationError).toBeNull();

    // Bills now have categoryId, not category
    expect(result.bills[0].items[0].categoryId).toBeTruthy();
    expect(result.bills[0].items[0].category).toBeUndefined();

    // Backup written
    const backup = JSON.parse(storage.getItem('billtracker-pre-categories-backup'));
    expect(backup.bills).toEqual(v1Bills);
    expect(backup.ts).toBeTruthy();

    // Schema bumped
    expect(storage.getItem('billtracker-schema-version')).toBe('2');

    // Categories persisted
    const cats = JSON.parse(storage.getItem('billtracker-categories'));
    expect(cats.length).toBeGreaterThan(0);
  });

  it('idempotent: running on already-v2 data does not re-migrate or re-write backup', () => {
    // First run: produces v2 state
    const storage = makeFakeStorage({
      'billtracker-bills': JSON.stringify([
        { id: 'b1', vendor: 'V', month: '2026-04', items: [
          { id: 'i1', description: 'X', amount: 10, category: 'Dining', date: null },
        ]},
      ]),
    });
    initializeFromStorage(storage);
    const firstBills = storage.getItem('billtracker-bills');
    const firstCats  = storage.getItem('billtracker-categories');
    const firstBackup = storage.getItem('billtracker-pre-categories-backup');

    // Second run: state is now v2 (schema version is '2')
    const result = initializeFromStorage(storage);
    expect(result.migrationError).toBeNull();
    expect(storage.getItem('billtracker-bills')).toBe(firstBills);
    expect(storage.getItem('billtracker-categories')).toBe(firstCats);
    expect(storage.getItem('billtracker-pre-categories-backup')).toBe(firstBackup);
  });

  it('migration failure WITH backup: restores bills from backup and reports recovered=true', () => {
    const goodBills = [{ id: 'b_old', vendor: 'V', month: '2026-04', items: [] }];
    const storage = makeFakeStorage({
      'billtracker-bills': 'NOT VALID JSON',
      'billtracker-pre-categories-backup': JSON.stringify({
        ts: '2026-05-09T00:00:00Z',
        bills: goodBills,
      }),
    });
    const result = initializeFromStorage(storage);
    expect(result.migrationError).not.toBeNull();
    expect(result.migrationError.recovered).toBe(true);
    expect(result.bills).toEqual(goodBills);
  });

  it('migration failure WITHOUT backup: returns empty bills and reports recovered=false', () => {
    const storage = makeFakeStorage({
      'billtracker-bills': 'NOT VALID JSON',
    });
    const result = initializeFromStorage(storage);
    expect(result.migrationError).not.toBeNull();
    expect(result.migrationError.recovered).toBe(false);
    expect(result.bills).toEqual([]);
  });
});
