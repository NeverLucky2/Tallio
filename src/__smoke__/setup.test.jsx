// src/__smoke__/setup.test.jsx
import { describe, it, expect } from 'vitest';
import { initializeFromStorage } from '../initializeFromStorage.js';
import { accountBalance } from '../accountsModel.js';
import { buildArchive } from '../exportArchive.js';
import { unzipSync, strFromU8 } from 'fflate';

function makeFakeStorage(initial = {}) {
  const store = { ...initial };
  return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
}

describe('end-to-end: v3 bills migrate to v4 accounts, balances, export', () => {
  it('legacy bills become accounts; balances compute; export round-trips', () => {
    const v1Bills = [
      { id: 'b1', vendor: 'Mastercard', month: '2026-05', items: [
        { id: 'i1', description: 'Costco', amount: 100, category: 'Groceries', date: '2026-05-03' },
        { id: 'i2', description: 'Refund', amount: -20, category: 'Groceries', date: '2026-05-10' },
      ]},
    ];
    const storage = makeFakeStorage({ 'billtracker-bills': JSON.stringify(v1Bills) });
    const { accounts, transactions, migrationError } = initializeFromStorage(storage);
    expect(migrationError).toBeNull();
    expect(accounts).toHaveLength(1);
    const mc = accounts[0];
    // expense magnitudes become negative deltas; refund (negative) becomes positive
    expect(accountBalance(mc, transactions)).toBeCloseTo(-100 + 20, 2);

    const bytes = buildArchive({ accounts, transactions, categories: [], schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-12T00:00:00Z') });
    const files = unzipSync(bytes);
    expect(JSON.parse(strFromU8(files['data.json'])).schemaVersion).toBe(4);
  });
});
