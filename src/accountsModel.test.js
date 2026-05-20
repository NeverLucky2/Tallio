// src/accountsModel.test.js
import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_TYPES, GROUP_ORDER, accountClass, layoutFor, groupFor,
  isOnBalanceSheet, flowSign,
} from './accountsModel.js';

describe('account types & classification', () => {
  it('exposes the 7 Phase-1 types', () => {
    expect(Object.keys(ACCOUNT_TYPES).sort()).toEqual(
      ['bank', 'credit_card', 'investment', 'loan', 'mortgage', 'person', 'untyped'].sort()
    );
  });

  it('classifies asset / liability / off-sheet', () => {
    expect(accountClass('bank')).toBe('asset');
    expect(accountClass('investment')).toBe('asset');
    expect(accountClass('credit_card')).toBe('liability');
    expect(accountClass('mortgage')).toBe('liability');
    expect(accountClass('person')).toBe('offsheet');
    expect(accountClass('untyped')).toBe('offsheet');
    expect(accountClass('nonsense')).toBe('offsheet'); // safe fallback
  });

  it('only bank uses the bank register layout', () => {
    expect(layoutFor('bank')).toBe('bank');
    expect(layoutFor('credit_card')).toBe('compact');
    expect(layoutFor('untyped')).toBe('compact');
  });

  it('isOnBalanceSheet is true for assets and liabilities only', () => {
    expect(isOnBalanceSheet('bank')).toBe(true);
    expect(isOnBalanceSheet('mortgage')).toBe(true);
    expect(isOnBalanceSheet('person')).toBe(false);
    expect(isOnBalanceSheet('untyped')).toBe(false);
  });

  it('groupFor maps to a header in GROUP_ORDER', () => {
    expect(GROUP_ORDER).toContain(groupFor('bank'));
    expect(groupFor('loan')).toBe('Credit cards & loans');
  });

  it('flowSign: income positive, everything else negative', () => {
    expect(flowSign('income')).toBe(1);
    expect(flowSign('expense')).toBe(-1);
    expect(flowSign('savings')).toBe(-1);
    expect(flowSign(undefined)).toBe(-1);
  });
});

import { accountBalance, computeRegister, householdTotals } from './accountsModel.js';

describe('balance math', () => {
  const checking = { id: 'a_chk', type: 'bank', openingBalance: 1000 };
  const card     = { id: 'a_cc',  type: 'credit_card', openingBalance: 0 };
  const txns = [
    { id: 't1', accountId: 'a_chk', date: '2026-05-01', amount:  3200 }, // paycheck
    { id: 't2', accountId: 'a_chk', date: '2026-04-15', amount:  -96.30 }, // electric
    { id: 't3', accountId: 'a_cc',  date: '2026-05-05', amount:  -96.20 }, // charge
    { id: 't4', accountId: 'a_cc',  date: '2026-04-02', amount:  -15.99 }, // charge
  ];

  it('accountBalance = opening + Σ amounts for that account', () => {
    expect(accountBalance(checking, txns)).toBeCloseTo(1000 + 3200 - 96.30, 2);
    expect(accountBalance(card, txns)).toBeCloseTo(-112.19, 2);
  });

  it('computeRegister returns oldest→newest with running balance after each row', () => {
    const rows = computeRegister(checking, txns);
    expect(rows.map(r => r.id)).toEqual(['t2', 't1']); // Apr 15 then May 1
    expect(rows[0].balance).toBeCloseTo(903.70, 2);    // 1000 - 96.30
    expect(rows[1].balance).toBeCloseTo(4103.70, 2);   // + 3200
  });

  it('computeRegister breaks same-day ties by array order', () => {
    const acct = { id: 'x', type: 'bank', openingBalance: 0 };
    const same = [
      { id: 'first',  accountId: 'x', date: '2026-05-10', amount: 10 },
      { id: 'second', accountId: 'x', date: '2026-05-10', amount: 5 },
    ];
    const rows = computeRegister(acct, same);
    expect(rows.map(r => r.id)).toEqual(['first', 'second']);
    expect(rows[1].balance).toBe(15);
  });

  it('householdTotals: net worth excludes person/untyped; owed is positive', () => {
    const accounts = [
      checking, card,
      { id: 'a_mom', type: 'person',  openingBalance: 0 },
      { id: 'a_u',   type: 'untyped', openingBalance: 500 },
    ];
    const withMom = [...txns, { id: 't5', accountId: 'a_mom', date: '2026-05-01', amount: -1100 }];
    const totals = householdTotals(accounts, withMom);
    expect(totals.assets).toBeCloseTo(4103.70, 2);    // checking only
    expect(totals.owed).toBeCloseTo(112.19, 2);        // |card|
    expect(totals.netWorth).toBeCloseTo(4103.70 - 112.19, 2); // mom + untyped excluded
  });
});

import { filterTransactions } from './accountsModel.js';

describe('filterTransactions', () => {
  const catsById = new Map([['c_util', { id: 'c_util', name: 'Utilities' }]]);
  const rows = [
    { id: 'r1', date: '2026-05-05', description: 'Walmart',  payee: '',        categoryId: 'c_shop', amount: -96.20 },
    { id: 'r2', date: '2026-04-15', description: 'Electric', payee: 'ComEd',   categoryId: 'c_util', amount: -96.30 },
    { id: 'r3', date: '2026-04-02', description: 'Netflix',  payee: '',        categoryId: 'c_sub',  amount: -15.99 },
  ];

  it('no filters → all rows', () => {
    expect(filterTransactions(rows, {}, catsById)).toHaveLength(3);
  });
  it('month filter keeps only that YYYY-MM', () => {
    expect(filterTransactions(rows, { month: '2026-04' }, catsById).map(r => r.id)).toEqual(['r2', 'r3']);
  });
  it('category filter matches categoryId', () => {
    expect(filterTransactions(rows, { categoryId: 'c_util' }, catsById).map(r => r.id)).toEqual(['r2']);
  });
  it('search matches description, payee, category name, or amount', () => {
    expect(filterTransactions(rows, { search: 'comed' }, catsById).map(r => r.id)).toEqual(['r2']);
    expect(filterTransactions(rows, { search: 'utilities' }, catsById).map(r => r.id)).toEqual(['r2']);
    expect(filterTransactions(rows, { search: 'walmart' }, catsById).map(r => r.id)).toEqual(['r1']);
    expect(filterTransactions(rows, { search: '15.99' }, catsById).map(r => r.id)).toEqual(['r3']);
  });
});
