// src/payeesMigration.test.js
import { describe, it, expect } from 'vitest';
import { migrateToPayees } from './payeesMigration.js';

const txn = (over = {}) => ({
  id: 't1', accountId: 'a1', date: '2026-01-05', amount: -10,
  categoryId: 'cat1', description: '', payee: null, checkNumber: null, transferId: null,
  ...over,
});

describe('migrateToPayees', () => {
  it('creates one entity per distinct trimmed name, case-insensitively, first-seen casing wins', () => {
    const { payees, transactions } = migrateToPayees({ transactions: [
      txn({ id: 't1', payee: 'Costco' }),
      txn({ id: 't2', payee: '  costco ' }),
      txn({ id: 't3', payee: 'COSTCO' }),
      txn({ id: 't4', payee: 'Safeway' }),
    ] });
    expect(payees).toHaveLength(2);
    const costco = payees.find(p => p.name === 'Costco');
    expect(costco).toBeTruthy();
    expect(transactions.map(t => t.payeeId)).toEqual([costco.id, costco.id, costco.id, payees.find(p => p.name === 'Safeway').id]);
    expect(transactions.every(t => !('payee' in t))).toBe(true);
  });

  it('skips empty/whitespace/null payees → payeeId null', () => {
    const { payees, transactions } = migrateToPayees({ transactions: [
      txn({ id: 't1', payee: null }), txn({ id: 't2', payee: '   ' }), txn({ id: 't3', payee: '' }),
    ] });
    expect(payees).toHaveLength(0);
    expect(transactions.map(t => t.payeeId)).toEqual([null, null, null]);
  });

  it('is a no-op on already-migrated transactions (preserves payeeId, creates nothing)', () => {
    const already = { ...txn({ id: 't1' }), payeeId: 'p9' };
    delete already.payee;
    const { payees, transactions } = migrateToPayees({ transactions: [already] });
    expect(payees).toHaveLength(0);
    expect(transactions[0].payeeId).toBe('p9');
  });

  it('rewrites transaction-kind template payloads, sharing entities with transactions', () => {
    const templates = [
      { id: 'tpl1', name: 'Gas', kind: 'transaction', payload: { description: '', amount: -40, categoryId: 'cat1', subId: null, payee: 'Shell', checkNumber: null, splits: null } },
      { id: 'tpl2', name: 'Move', kind: 'transfer', payload: { fromId: 'a1', toId: 'a2', amount: 100, categoryId: null, description: '', splits: null } },
    ];
    const out = migrateToPayees({ transactions: [txn({ id: 't1', payee: 'shell' })], templates });
    expect(out.payees).toHaveLength(1);
    expect(out.templates[0].payload.payeeId).toBe(out.payees[0].id);
    expect('payee' in out.templates[0].payload).toBe(false);
    expect(out.templates[1]).toEqual(templates[1]); // transfer payloads untouched
  });

  it('seeds default category from a strict majority of ≥2 categorized transactions', () => {
    const { payees } = migrateToPayees({ transactions: [
      txn({ id: 't1', payee: 'Costco', categoryId: 'groceries', subId: 'food' }),
      txn({ id: 't2', payee: 'Costco', categoryId: 'groceries', subId: 'food' }),
      txn({ id: 't3', payee: 'Costco', categoryId: 'household' }),
    ] });
    const costco = payees[0];
    expect(costco.defaultCategoryId).toBe('groceries');
    expect(costco.defaultSubcategoryId).toBe('food');
  });

  it('does NOT seed defaults on a tie, a single transaction, or uncategorized history', () => {
    const { payees } = migrateToPayees({ transactions: [
      txn({ id: 't1', payee: 'Tied', categoryId: 'a' }),
      txn({ id: 't2', payee: 'Tied', categoryId: 'b' }),
      txn({ id: 't3', payee: 'Once', categoryId: 'a' }),
      txn({ id: 't4', payee: 'Uncat', categoryId: null }),
      txn({ id: 't5', payee: 'Uncat', categoryId: null }),
    ] });
    for (const p of payees) {
      expect(p.defaultCategoryId).toBeNull();
      expect(p.defaultSubcategoryId).toBeNull();
    }
  });
});
