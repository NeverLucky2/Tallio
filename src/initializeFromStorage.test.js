// src/initializeFromStorage.test.js
import { describe, it, expect } from 'vitest';
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

describe('initializeFromStorage (v4 accounts)', () => {
  it('fresh install: empty accounts + transactions, schema 4, seed categories', () => {
    const storage = makeFakeStorage();
    const out = initializeFromStorage(storage);
    expect(out.migrationError).toBeNull();
    expect(out.accounts).toEqual([]);
    expect(out.transactions).toEqual([]);
    expect(storage.getItem('billtracker-schema-version')).toBe('4');
    const cats = JSON.parse(storage.getItem('billtracker-categories'));
    expect(cats.length).toBeGreaterThan(0);
  });

  it('migrates legacy v1 bills all the way to v4 accounts', () => {
    const v1Bills = [
      { id: 'b1', vendor: 'Mastercard', month: '2026-04', items: [
        { id: 'i1', description: 'Costco', amount: 50, category: 'Groceries', date: '2026-04-03' },
      ]},
    ];
    const storage = makeFakeStorage({ 'billtracker-bills': JSON.stringify(v1Bills) });
    const out = initializeFromStorage(storage);
    expect(out.migrationError).toBeNull();
    expect(out.accounts).toHaveLength(1);
    expect(out.accounts[0].name).toBe('Mastercard');
    expect(out.accounts[0].type).toBe('untyped');
    expect(out.transactions).toHaveLength(1);
    expect(out.transactions[0].amount).toBe(-50); // expense → negative delta

    // Persisted under the new keys + version bumped.
    expect(JSON.parse(storage.getItem('billtracker-accounts'))).toHaveLength(1);
    expect(JSON.parse(storage.getItem('billtracker-transactions'))).toHaveLength(1);
    expect(storage.getItem('billtracker-schema-version')).toBe('4');

    // Pre-accounts backup written once.
    const backup = JSON.parse(storage.getItem('billtracker-pre-accounts-backup'));
    expect(backup.bills).toBeTruthy();
    expect(backup.ts).toBeTruthy();
  });

  it('idempotent: re-running on v4 storage does not double-migrate', () => {
    const storage = makeFakeStorage({
      'billtracker-accounts': JSON.stringify([{ id: 'a1', name: 'Chase', type: 'bank', icon: '🏦', openingBalance: 0 }]),
      'billtracker-transactions': JSON.stringify([{ id: 't1', accountId: 'a1', date: '2026-05-01', amount: 100, categoryId: 'c', description: 'x', payee: null, checkNumber: null, transferId: null }]),
      'billtracker-categories': JSON.stringify([{ id: 'c', name: 'Other', flow: 'expense', icon: '📋', color: '#6B7280', keywords: [], templates: [], builtin: true }]),
      'billtracker-schema-version': '4',
    });
    const out = initializeFromStorage(storage);
    expect(out.accounts).toHaveLength(1);
    expect(out.transactions).toHaveLength(1);
    expect(out.transactions[0].amount).toBe(100); // untouched
  });

  it('migration failure with backup → recovered flag, empty ledger', () => {
    const storage = makeFakeStorage({
      'billtracker-bills': '{ this is not json',
      'billtracker-pre-accounts-backup': JSON.stringify({ ts: 't', bills: [] }),
    });
    const out = initializeFromStorage(storage);
    expect(out.migrationError).not.toBeNull();
    expect(out.accounts).toEqual([]);
  });
});
