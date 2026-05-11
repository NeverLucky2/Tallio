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
    expect(storage.getItem('billtracker-schema-version')).toBe('3');
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
    expect(storage.getItem('billtracker-schema-version')).toBe('3');

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

  it('v2 → v3 migration: backfills flow on existing categories', () => {
    const v2Cats = [
      { id: 'c_util',  name: 'Utilities', icon: '⚡',  color: '#F59E0B', keywords: [], templates: [], builtin: true },
      { id: 'c_other', name: 'Other',     icon: '📋', color: '#6B7280', keywords: [], templates: [], builtin: true },
    ];
    const storage = makeFakeStorage({
      'billtracker-bills':           JSON.stringify([]),
      'billtracker-categories':      JSON.stringify(v2Cats),
      'billtracker-schema-version':  '2',
    });
    const result = initializeFromStorage(storage);
    expect(result.migrationError).toBeNull();
    const cats = JSON.parse(storage.getItem('billtracker-categories'));
    for (const c of cats) expect(c.flow).toBeTruthy();
    expect(storage.getItem('billtracker-schema-version')).toBe('3');
  });

  it('v2 → v3 migration: writes categories-v2-backup before transforming', () => {
    const v2Cats = [
      { id: 'c_util', name: 'Utilities', icon: '⚡', color: '#F59E0B', keywords: ['COMED'], templates: [], builtin: true },
    ];
    const storage = makeFakeStorage({
      'billtracker-bills':           JSON.stringify([]),
      'billtracker-categories':      JSON.stringify(v2Cats),
      'billtracker-schema-version':  '2',
    });
    initializeFromStorage(storage);
    const backup = JSON.parse(storage.getItem('billtracker-categories-v2-backup'));
    expect(backup.categories).toEqual(v2Cats);
    expect(backup.ts).toBeTruthy();
  });

  it('v2 → v3 migration: appends income + savings seeds', () => {
    const v2Cats = [
      { id: 'c_other', name: 'Other', icon: '📋', color: '#6B7280', keywords: [], templates: [], builtin: true },
    ];
    const storage = makeFakeStorage({
      'billtracker-bills':           JSON.stringify([]),
      'billtracker-categories':      JSON.stringify(v2Cats),
      'billtracker-schema-version':  '2',
    });
    initializeFromStorage(storage);
    const cats = JSON.parse(storage.getItem('billtracker-categories'));
    expect(cats.some(c => c.name === 'Paycheck' && c.flow === 'income')).toBe(true);
    expect(cats.some(c => c.name === '401(k)' && c.flow === 'savings')).toBe(true);
    expect(cats.some(c => c.name === 'Other Income' && c.flow === 'income')).toBe(true);
  });

  it('v3 idempotency: running on already-v3 data does not re-write backup or re-migrate', () => {
    const storage = makeFakeStorage();
    initializeFromStorage(storage);
    const firstCats   = storage.getItem('billtracker-categories');
    const firstBackup = storage.getItem('billtracker-categories-v2-backup');
    initializeFromStorage(storage);
    expect(storage.getItem('billtracker-categories')).toBe(firstCats);
    expect(storage.getItem('billtracker-categories-v2-backup')).toBe(firstBackup);
    expect(storage.getItem('billtracker-schema-version')).toBe('3');
  });

  it('fresh install (no prior data): reaches v3 with seeds + version 3 + no backup written', () => {
    const storage = makeFakeStorage();
    const result = initializeFromStorage(storage);
    expect(result.migrationError).toBeNull();
    expect(storage.getItem('billtracker-schema-version')).toBe('3');
    const cats = JSON.parse(storage.getItem('billtracker-categories'));
    expect(cats.some(c => c.flow === 'income')).toBe(true);
    expect(cats.some(c => c.flow === 'savings')).toBe(true);
    expect(storage.getItem('billtracker-categories-v2-backup')).toBeNull();
  });
});

describe('initializeFromStorage — catch-up integration', () => {
  it('returns conflicts: [] when there are no chains', () => {
    const storage = makeFakeStorage({
      'billtracker-bills':           JSON.stringify([]),
      'billtracker-categories':      JSON.stringify([{ id: 'c1', name: 'Other', icon: '📋', color: '#6B7280', flow: 'expense', keywords: [], templates: [], builtin: true }]),
      'billtracker-schema-version':  '3',
    });
    const out = initializeFromStorage(storage, '2026-07');
    expect(out.migrationError).toBeNull();
    expect(out.conflicts).toEqual([]);
  });

  it('catch-up spawns missed months for an active chain', () => {
    const apr = {
      id: 'b_apr', vendor: 'Honda', month: '2026-04',
      recurring: true, recurringChainId: 'rec_h',
      items: [{ id: 'it1', description: 'Auto', amount: 452, categoryId: 'c_other', date: '2026-04-15' }],
    };
    const storage = makeFakeStorage({
      'billtracker-bills':           JSON.stringify([apr]),
      'billtracker-categories':      JSON.stringify([{ id: 'c_other', name: 'Other', icon: '📋', color: '#6B7280', flow: 'expense', keywords: [], templates: [], builtin: true }]),
      'billtracker-schema-version':  '3',
    });
    const out = initializeFromStorage(storage, '2026-07');
    expect(out.migrationError).toBeNull();
    expect(out.conflicts).toEqual([]);
    expect(out.bills).toHaveLength(4);
    const months = out.bills.map(b => b.month).sort();
    expect(months).toEqual(['2026-04', '2026-05', '2026-06', '2026-07']);
  });

  it('schema version stays at 3 (no bump for sub-project C)', () => {
    const storage = makeFakeStorage({
      'billtracker-bills':           JSON.stringify([]),
      'billtracker-categories':      JSON.stringify([{ id: 'c1', name: 'Other', icon: '📋', color: '#6B7280', flow: 'expense', keywords: [], templates: [], builtin: true }]),
      'billtracker-schema-version':  '3',
    });
    initializeFromStorage(storage, '2026-07');
    expect(storage.getItem('billtracker-schema-version')).toBe('3');
  });
});
