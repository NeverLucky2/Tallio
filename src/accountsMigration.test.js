// src/accountsMigration.test.js
import { describe, it, expect } from 'vitest';
import { migrateToV4 } from './accountsMigration.js';

const categories = [
  { id: 'c_food', name: 'Groceries', flow: 'expense' },
  { id: 'c_pay',  name: 'Paycheck',  flow: 'income'  },
];

describe('migrateToV4', () => {
  it('each distinct vendor becomes one untyped account', () => {
    const bills = [
      { id: 'b1', vendor: 'Mastercard', month: '2026-05', items: [
        { id: 'i1', description: 'Costco', amount: 182.40, categoryId: 'c_food', date: '2026-05-03' },
      ]},
      { id: 'b2', vendor: 'Mastercard', month: '2026-04', items: [
        { id: 'i2', description: 'Netflix', amount: 15.99, categoryId: 'c_food', date: '2026-04-02' },
      ]},
      { id: 'b3', vendor: 'Chase', month: '2026-05', items: [
        { id: 'i3', description: 'Paycheck', amount: 3200, categoryId: 'c_pay', date: '2026-05-01' },
      ]},
    ];
    const { accounts, transactions } = migrateToV4(bills, categories);
    expect(accounts.map(a => a.name).sort()).toEqual(['Chase', 'Mastercard']);
    for (const a of accounts) {
      expect(a.type).toBe('untyped');
      expect(a.openingBalance).toBe(0);
      expect(typeof a.id).toBe('string');
    }
    // Two Mastercard bills merge into one account's register.
    const mc = accounts.find(a => a.name === 'Mastercard');
    expect(transactions.filter(t => t.accountId === mc.id)).toHaveLength(2);
  });

  it('converts amounts to SIGNED deltas via flowSign', () => {
    const bills = [
      { id: 'b1', vendor: 'Chase', month: '2026-05', items: [
        { id: 'i1', description: 'Groceries', amount: 84,   categoryId: 'c_food', date: '2026-05-02' }, // expense → -84
        { id: 'i2', description: 'Paycheck',  amount: 3200, categoryId: 'c_pay',  date: '2026-05-01' }, // income  → +3200
      ]},
    ];
    const { transactions } = migrateToV4(bills, categories);
    const byDesc = Object.fromEntries(transactions.map(t => [t.description, t.amount]));
    expect(byDesc['Groceries']).toBe(-84);
    expect(byDesc['Paycheck']).toBe(3200);
  });

  it('preserves dates; dateless items fall back to the bill anchor month', () => {
    const bills = [
      { id: 'b1', vendor: 'Chase', month: '2026-02', items: [
        { id: 'i1', description: 'Dateless', amount: 10, categoryId: 'c_food', date: null },
      ]},
    ];
    const { transactions } = migrateToV4(bills, categories);
    expect(transactions[0].date).toBe('2026-02-01');
    expect(transactions[0].payee).toBeNull();
    expect(transactions[0].checkNumber).toBeNull();
    expect(transactions[0].transferId).toBeNull();
  });

  it('empty / missing input → empty arrays', () => {
    expect(migrateToV4([], categories)).toEqual({ accounts: [], transactions: [] });
    expect(migrateToV4(undefined, categories)).toEqual({ accounts: [], transactions: [] });
  });
});
