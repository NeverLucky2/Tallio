// src/__smoke__/splits.test.jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLedger from '../useLedger.js';
import { spendingByCategory, incomeExpenseSummary, findDuplicates, recurringCharges } from '../reportsModel.js';

beforeEach(() => localStorage.clear());

describe('splits end-to-end: Costco with cash back', () => {
  const seed = {
    accounts: [
      { id: 'a_chase', name: 'Chase', type: 'bank', icon: '🏦', openingBalance: 1000 },
      { id: 'a_cash',  name: 'Cash',  type: 'bank', icon: '💵', openingBalance: 0 },
    ],
    transactions: [],
  };
  const categoriesById = new Map([
    ['c_grocery',   { id: 'c_grocery',   name: 'Groceries', flow: 'expense', icon: '🛒', color: '#000' }],
    ['c_household', { id: 'c_household', name: 'Household', flow: 'expense', icon: '🧴', color: '#111' }],
  ]);

  it('records, reports, and reconciles', () => {
    const { result } = renderHook(() => useLedger(seed));
    let id;
    act(() => {
      id = result.current.addTransaction({
        accountId: 'a_chase', date: '2026-05-20', amount: -180, payee: 'Costco', description: 'Weekly Costco',
        splits: [
          { id: 's1', amount: -100, categoryId: 'c_grocery',   description: 'Weekly groceries' },
          { id: 's2', amount:  -30, categoryId: 'c_household', description: 'Soap' },
          { id: 's3', amount:  -50, transferId: 'tr_cash',     description: 'ATM cash back' },
        ],
      }, { splitTargets: new Map([['s3', 'a_cash']]) });
    });

    // Counterpart was created on Cash.
    const cp = result.current.transactions.find(t => t.transferId === 'tr_cash');
    expect(cp.accountId).toBe('a_cash');
    expect(cp.amount).toBe(50);
    expect(cp.description).toBe('ATM cash back');

    // Reports: groceries $100, household $30, total spending $130 (transfer excluded).
    const byCat = Object.fromEntries(spendingByCategory(result.current.transactions, categoriesById).map(e => [e.name, e.total]));
    expect(byCat.Groceries).toBe(100);
    expect(byCat.Household).toBe(30);
    expect(incomeExpenseSummary(result.current.transactions, categoriesById).spending).toBe(130);

    // Recurring/duplicate detection sees the parent as a single charge.
    expect(findDuplicates(result.current.transactions)).toHaveLength(0);
    expect(recurringCharges(result.current.transactions, categoriesById, { now: new Date(2026, 4, 25) })).toEqual([]);

    // Deleting the parent cascades the counterpart.
    act(() => { result.current.deleteTransaction(id); });
    expect(result.current.transactions).toHaveLength(0);
  });
});
