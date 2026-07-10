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
  it('fresh install: empty accounts + transactions, schema 5, seed categories', () => {
    const storage = makeFakeStorage();
    const out = initializeFromStorage(storage);
    expect(out.migrationError).toBeNull();
    expect(out.accounts).toEqual([]);
    expect(out.transactions).toEqual([]);
    expect(storage.getItem('tallio-schema-version')).toBe('5');
    const cats = JSON.parse(storage.getItem('tallio-categories'));
    expect(cats.length).toBeGreaterThan(0);
  });

  it('migrates legacy v1 bills all the way to v4 accounts', () => {
    const v1Bills = [
      { id: 'b1', vendor: 'Mastercard', month: '2026-04', items: [
        { id: 'i1', description: 'Costco', amount: 50, category: 'Groceries', date: '2026-04-03' },
      ]},
    ];
    const storage = makeFakeStorage({ 'tallio-bills': JSON.stringify(v1Bills) });
    const out = initializeFromStorage(storage);
    expect(out.migrationError).toBeNull();
    expect(out.accounts).toHaveLength(1);
    expect(out.accounts[0].name).toBe('Mastercard');
    expect(out.accounts[0].type).toBe('untyped');
    expect(out.transactions).toHaveLength(1);
    expect(out.transactions[0].amount).toBe(-50); // expense → negative delta

    // Persisted under the new keys + version bumped.
    expect(JSON.parse(storage.getItem('tallio-accounts'))).toHaveLength(1);
    expect(JSON.parse(storage.getItem('tallio-transactions'))).toHaveLength(1);
    expect(storage.getItem('tallio-schema-version')).toBe('5');

    // Pre-accounts backup written once.
    const backup = JSON.parse(storage.getItem('tallio-pre-accounts-backup'));
    expect(backup.bills).toBeTruthy();
    expect(backup.ts).toBeTruthy();
  });

  it('idempotent: re-running on v4 storage does not double-migrate', () => {
    const storage = makeFakeStorage({
      'tallio-accounts': JSON.stringify([{ id: 'a1', name: 'Chase', type: 'bank', icon: '🏦', openingBalance: 0 }]),
      'tallio-transactions': JSON.stringify([{ id: 't1', accountId: 'a1', date: '2026-05-01', amount: 100, categoryId: 'c', description: 'x', payee: null, checkNumber: null, transferId: null }]),
      'tallio-categories': JSON.stringify([{ id: 'c', name: 'Other', flow: 'expense', icon: '📋', color: '#6B7280', keywords: [], templates: [], builtin: true }]),
      'tallio-schema-version': '4',
    });
    const out = initializeFromStorage(storage);
    expect(out.accounts).toHaveLength(1);
    expect(out.transactions).toHaveLength(1);
    expect(out.transactions[0].amount).toBe(100); // untouched
  });

  it('migration failure with backup → recovered flag, empty ledger', () => {
    const storage = makeFakeStorage({
      'tallio-bills': '{ this is not json',
      'tallio-pre-accounts-backup': JSON.stringify({ ts: 't', bills: [] }),
    });
    const out = initializeFromStorage(storage);
    expect(out.migrationError).not.toBeNull();
    expect(out.accounts).toEqual([]);
  });
});

describe('payees migration (v4 → v5)', () => {
  const v4Txns = [
    { id: 't1', accountId: 'a1', date: '2026-01-05', amount: -10, categoryId: 'c1', description: '', payee: 'Costco', checkNumber: null, transferId: null },
    { id: 't2', accountId: 'a1', date: '2026-01-06', amount: -20, categoryId: 'c1', description: '', payee: 'costco', checkNumber: null, transferId: null },
  ];

  it('migrates a v4 store: creates payees, rewrites txns + templates, sets version 5', () => {
    const storage = makeFakeStorage({
      'tallio-schema-version': '4',
      'tallio-accounts': JSON.stringify([{ id: 'a1', name: 'Chase' }]),
      'tallio-transactions': JSON.stringify(v4Txns),
      'tallio-templates': JSON.stringify([{ id: 'tpl1', name: 'G', kind: 'transaction', payload: { payee: 'Costco', amount: -5, categoryId: 'c1', description: '', checkNumber: null, splits: null } }]),
    });
    const { accounts, transactions, migrationError } = initializeFromStorage(storage);
    expect(migrationError).toBeNull();
    expect(accounts).toHaveLength(1);
    const payees = JSON.parse(storage.getItem('tallio-payees'));
    expect(payees).toHaveLength(1);
    expect(payees[0].name).toBe('Costco');
    expect(payees[0].defaultCategoryId).toBe('c1'); // 2 categorized txns, unanimous
    expect(transactions.every(t => t.payeeId === payees[0].id && !('payee' in t))).toBe(true);
    expect(JSON.parse(storage.getItem('tallio-transactions'))[0].payeeId).toBe(payees[0].id);
    expect(JSON.parse(storage.getItem('tallio-templates'))[0].payload.payeeId).toBe(payees[0].id);
    expect(storage.getItem('tallio-schema-version')).toBe('5');
  });

  it('leaves a v5 store completely alone', () => {
    const storage = makeFakeStorage({
      'tallio-schema-version': '5',
      'tallio-accounts': '[]',
      'tallio-transactions': JSON.stringify([{ id: 't1', accountId: 'a1', date: '2026-01-05', amount: -1, categoryId: null, description: '', payeeId: 'p1', checkNumber: null, transferId: null }]),
      'tallio-payees': JSON.stringify([{ id: 'p1', name: 'Kept', defaultCategoryId: null, defaultSubcategoryId: null }]),
    });
    const { transactions } = initializeFromStorage(storage);
    expect(transactions[0].payeeId).toBe('p1');
    expect(JSON.parse(storage.getItem('tallio-payees'))).toHaveLength(1);
  });

  it('a fresh/legacy (< v4) store still runs the old chain, then payees, landing on v5', () => {
    const storage = makeFakeStorage({});
    const { migrationError } = initializeFromStorage(storage);
    expect(migrationError).toBeNull();
    expect(storage.getItem('tallio-schema-version')).toBe('5');
    expect(JSON.parse(storage.getItem('tallio-payees'))).toEqual([]);
  });
});
