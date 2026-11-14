// src/storesNoBlindWrite.test.jsx
// A window that (re)loads must not write its startup copy back to storage: another
// Tallio window may have saved in the moment between this window reading storage and
// its save effects running, and the blind write would erase that save.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import useLedger from './useLedger.js';
import useCategories from './useCategories.js';
import usePayees from './usePayees.js';
import useTemplates from './useTemplates.js';
import useAccountTypes from './useAccountTypes.js';
import useReportAcks from './useReportAcks.js';

const STORES = [
  ['tallio-categories', () => useCategories()],
  ['tallio-payees', () => usePayees()],
  ['tallio-templates', () => useTemplates()],
  ['tallio-account-types', () => useAccountTypes()],
  ['tallio-report-acks', () => useReportAcks()],
];

describe('stores do not blind-write on load', () => {
  let setItem;
  beforeEach(() => { localStorage.clear(); setItem = vi.spyOn(Storage.prototype, 'setItem'); });
  afterEach(() => setItem.mockRestore());
  const writesTo = (key) => setItem.mock.calls.filter(([k]) => k === key).length;

  it.each(STORES)('%s is not rewritten when a window reloads unchanged', (key, useStore) => {
    renderHook(useStore).unmount(); // first load may seed or normalize — that write is wanted
    setItem.mockClear();
    renderHook(useStore);           // the reload
    expect(writesTo(key)).toBe(0);
  });

  it('the ledger is not rewritten when a window reloads unchanged', () => {
    const accounts = [{ id: 'a1', name: 'Checking', type: 'untyped', icon: '🏦', openingBalance: 0 }];
    const transactions = [{ id: 't1', accountId: 'a1', date: '2026-11-01', amount: -5, categoryId: null, description: 'x', payeeId: null }];
    localStorage.setItem('tallio-accounts', JSON.stringify(accounts));
    localStorage.setItem('tallio-transactions', JSON.stringify(transactions));
    setItem.mockClear();
    renderHook(() => useLedger({ accounts, transactions }));
    expect(writesTo('tallio-accounts')).toBe(0);
    expect(writesTo('tallio-transactions')).toBe(0);
  });
});
