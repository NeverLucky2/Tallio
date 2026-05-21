// src/accountsModel.test.js
import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_TYPES, GROUP_ORDER, accountClass, layoutFor, groupFor,
  isOnBalanceSheet, flowSign, transferDraftForAccount, payFromUpdate,
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

import { sortRows } from './accountsModel.js';

describe('sortRows', () => {
  const catsById = new Map([
    ['c_a', { id: 'c_a', name: 'Apples' }],
    ['c_z', { id: 'c_z', name: 'Zebra' }],
  ]);
  // computeRegister output shape: chronological order, each with a running balance.
  const rows = [
    { id: 'r1', date: '2026-04-02', description: 'Netflix', payee: '',      checkNumber: '',     categoryId: 'c_z', amount: -15.99, balance: 84.01 },
    { id: 'r2', date: '2026-04-15', description: 'Apple',   payee: 'ComEd', checkNumber: '1042', categoryId: 'c_a', amount: -96.30, balance: -12.29 },
    { id: 'r3', date: '2026-05-01', description: 'Zelle',   payee: '',      checkNumber: '',     categoryId: 'c_a', amount: 3200,   balance: 3187.71 },
  ];

  it('date descending is the default and reverses chronological order', () => {
    expect(sortRows(rows, { key: 'date', dir: 'desc' }).map(r => r.id)).toEqual(['r3', 'r2', 'r1']);
  });
  it('date ascending keeps chronological order', () => {
    expect(sortRows(rows, { key: 'date', dir: 'asc' }).map(r => r.id)).toEqual(['r1', 'r2', 'r3']);
  });
  it('amount sorts numerically by signed value', () => {
    expect(sortRows(rows, { key: 'amount', dir: 'desc' }).map(r => r.id)).toEqual(['r3', 'r1', 'r2']); // 3200, -15.99, -96.30
    expect(sortRows(rows, { key: 'amount', dir: 'asc' }).map(r => r.id)).toEqual(['r2', 'r1', 'r3']);
  });
  it('description sorts case-insensitively; ascending A→Z', () => {
    expect(sortRows(rows, { key: 'description', dir: 'asc' }).map(r => r.id)).toEqual(['r2', 'r1', 'r3']); // Apple, Netflix, Zelle
  });
  it('category sorts by category name via categoriesById', () => {
    expect(sortRows(rows, { key: 'category', dir: 'asc' }, catsById).map(r => r.id)).toEqual(['r2', 'r3', 'r1']); // Apples, Apples, Zebra (stable)
  });
  it('empty payee/check values sort last when ascending', () => {
    expect(sortRows(rows, { key: 'payee', dir: 'asc' }).map(r => r.id)).toEqual(['r2', 'r1', 'r3']); // ComEd, then empties in chronological order
  });
  it('does not mutate the input array and leaves each row balance untouched', () => {
    const copy = rows.slice();
    const out = sortRows(rows, { key: 'amount', dir: 'asc' });
    expect(rows).toEqual(copy);
    expect(out.find(r => r.id === 'r2').balance).toBe(-12.29);
  });
});

import { DEFAULT_ACCOUNT_TYPES, groupOrder } from './accountsModel.js';

describe('account types as data', () => {
  it('DEFAULT_ACCOUNT_TYPES is an ordered array of the 7 built-ins with ids', () => {
    expect(DEFAULT_ACCOUNT_TYPES.map(t => t.id)).toEqual(
      ['bank', 'investment', 'credit_card', 'loan', 'mortgage', 'person', 'untyped']
    );
    for (const t of DEFAULT_ACCOUNT_TYPES) {
      expect(typeof t.label).toBe('string');
      expect(['asset', 'liability', 'offsheet']).toContain(t.klass);
      expect(['bank', 'compact']).toContain(t.layout);
      expect(t.builtin).toBe(true);
    }
  });

  it('helpers resolve against a custom typesById registry', () => {
    const custom = new Map([['hsa', { id: 'hsa', label: 'HSA', klass: 'asset', layout: 'bank', group: 'Health', icon: '🏥' }]]);
    expect(accountClass('hsa', custom)).toBe('asset');
    expect(layoutFor('hsa', custom)).toBe('bank');
    expect(groupFor('hsa', custom)).toBe('Health');
    expect(isOnBalanceSheet('hsa', custom)).toBe(true);
  });

  it('unknown / deleted type ids fall back to off-sheet / compact / Unassigned', () => {
    const empty = new Map();
    expect(accountClass('gone', empty)).toBe('offsheet');
    expect(layoutFor('gone', empty)).toBe('compact');
    expect(groupFor('gone', empty)).toBe('Unassigned');
    expect(isOnBalanceSheet('gone', empty)).toBe(false);
  });

  it('householdTotals honors a custom registry', () => {
    const types = new Map([
      ['cash', { id: 'cash', klass: 'asset',     layout: 'bank',    group: 'Cash' }],
      ['card', { id: 'card', klass: 'liability', layout: 'compact', group: 'Debt' }],
    ]);
    const accounts = [
      { id: 'a1', type: 'cash', openingBalance: 1000 },
      { id: 'a2', type: 'card', openingBalance: -200 },
    ];
    const totals = householdTotals(accounts, [], types);
    expect(totals.assets).toBe(1000);
    expect(totals.owed).toBe(200);
    expect(totals.netWorth).toBe(800);
  });

  it('groupOrder lists groups in first-seen order with Unassigned last', () => {
    const types = [
      { id: 'a', group: 'Cash' },
      { id: 'b', group: 'Unassigned' },
      { id: 'c', group: 'Investments' },
      { id: 'd', group: 'Cash' },
    ];
    expect(groupOrder(types)).toEqual(['Cash', 'Investments', 'Unassigned']);
  });
});

import { transferCounterpart, transferInfo, resolveTransfer } from './accountsModel.js';

describe('transfers', () => {
  const txns = [
    { id: 'tf', accountId: 'a1', date: '2026-05-20', amount: -500, categoryId: null, transferId: 'x' },
    { id: 'tt', accountId: 'a2', date: '2026-05-20', amount:  500, categoryId: null, transferId: 'x' },
    { id: 'n1', accountId: 'a1', date: '2026-05-01', amount:  -20, categoryId: 'c',  transferId: null },
  ];
  const accountsById = new Map([
    ['a1', { id: 'a1', name: 'Checking' }],
    ['a2', { id: 'a2', name: 'Savings' }],
  ]);

  it('transferCounterpart finds the partner leg, null for non-transfers', () => {
    expect(transferCounterpart(txns[0], txns).id).toBe('tt');
    expect(transferCounterpart(txns[1], txns).id).toBe('tf');
    expect(transferCounterpart(txns[2], txns)).toBeNull();
  });

  it('transferInfo gives direction + counterpart name; null when unresolved', () => {
    expect(transferInfo(txns[0], txns, accountsById)).toMatchObject({ counterpartName: 'Savings', direction: 'out', counterpartId: 'a2' });
    expect(transferInfo(txns[1], txns, accountsById)).toMatchObject({ counterpartName: 'Checking', direction: 'in', counterpartId: 'a1' });
    expect(transferInfo(txns[2], txns, accountsById)).toBeNull(); // not a transfer
    const orphan = { id: 'o', accountId: 'a1', amount: -10, transferId: 'gone' };
    expect(transferInfo(orphan, [orphan], accountsById)).toBeNull(); // partner missing
    expect(transferInfo(txns[0], txns, new Map([['a1', { id: 'a1', name: 'Checking' }]]))).toBeNull(); // account not in map
  });

  it('resolveTransfer returns the from/to pair, null for non-transfers', () => {
    const pair = resolveTransfer(txns[1], txns); // start from the + leg
    expect(pair.transferId).toBe('x');
    expect(pair.fromLeg.id).toBe('tf'); // negative leg
    expect(pair.toLeg.id).toBe('tt');   // positive leg
    expect(resolveTransfer(txns[2], txns)).toBeNull();
  });

  it('transferInfo includes the counterpart money-class for color coding', () => {
    const typed = [
      { id: 'tf', accountId: 'a1', amount: -500, transferId: 'x' },
      { id: 'tt', accountId: 'a2', amount:  500, transferId: 'x' },
    ];
    const accts = new Map([
      ['a1', { id: 'a1', name: 'Checking', type: 'bank' }],        // asset
      ['a2', { id: 'a2', name: 'Visa',     type: 'credit_card' }], // liability
    ]);
    expect(transferInfo(typed[0], typed, accts).counterpartClass).toBe('liability'); // counterpart = Visa
    expect(transferInfo(typed[1], typed, accts).counterpartClass).toBe('asset');     // counterpart = Checking
  });
});

describe('net-worth neutrality of transfers', () => {
  const accounts = [
    { id: 'a1', type: 'bank', openingBalance: 1000 },
    { id: 'a2', type: 'bank', openingBalance: 0 },
  ];
  it('an on-sheet→on-sheet transfer leaves netWorth unchanged', () => {
    const base = householdTotals(accounts, []);
    const withTransfer = householdTotals(accounts, [
      { id: 'tf', accountId: 'a1', amount: -500, transferId: 'x' },
      { id: 'tt', accountId: 'a2', amount:  500, transferId: 'x' },
    ]);
    expect(withTransfer.netWorth).toBeCloseTo(base.netWorth, 2);
    expect(withTransfer.netWorth).toBeCloseTo(1000, 2);
  });
});

import { groupAccounts, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';

describe('groupAccounts', () => {
  it('groups accounts by type group in groupOrder, omitting empty groups', () => {
    const accts = [
      { id: 'a_chk', name: 'Checking', type: 'bank' },
      { id: 'a_cc',  name: 'Visa',     type: 'credit_card' },
      { id: 'a_chk2',name: 'Savings',  type: 'bank' },
    ];
    const out = groupAccounts(accts, DEFAULT_ACCOUNT_TYPES, DEFAULT_ACCOUNT_TYPES_BY_ID);
    expect(out.map(g => g.group)).toEqual(['Cash & Bank', 'Credit cards & loans']);
    expect(out[0].accounts.map(a => a.id)).toEqual(['a_chk', 'a_chk2']);
    expect(out[1].accounts.map(a => a.id)).toEqual(['a_cc']);
  });

  it('puts accounts with unknown types under the Unassigned fallback group', () => {
    const out = groupAccounts([{ id: 'x', name: 'Mystery', type: 'gone' }], DEFAULT_ACCOUNT_TYPES, DEFAULT_ACCOUNT_TYPES_BY_ID);
    expect(out.map(g => g.group)).toEqual(['Unassigned']);
  });
});

describe('transferDraftForAccount', () => {
  const accounts = [
    { id: 'chk', name: 'Checking',  type: 'bank',        openingBalance: 1000 },
    { id: 'inv', name: 'Brokerage', type: 'investment',  openingBalance: 5000 },
    { id: 'cc',  name: 'Visa',      type: 'credit_card', openingBalance: -300 },
  ];

  it('liability with a balance owed: To = self, amount = owed, From = first asset account', () => {
    const cc = accounts.find(a => a.id === 'cc');
    expect(transferDraftForAccount(cc, [], accounts)).toEqual({
      fromAccountId: 'chk', toAccountId: 'cc', initialAmount: 300,
    });
  });

  it('uses defaultPayFromId for From when it still resolves', () => {
    const cc = { ...accounts.find(a => a.id === 'cc'), defaultPayFromId: 'inv' };
    const draft = transferDraftForAccount(cc, [], [accounts[0], accounts[1], cc]);
    expect(draft.fromAccountId).toBe('inv');
    expect(draft.toAccountId).toBe('cc');
  });

  it('falls back to first asset account when defaultPayFromId points to a deleted account', () => {
    const cc = { ...accounts.find(a => a.id === 'cc'), defaultPayFromId: 'gone' };
    const draft = transferDraftForAccount(cc, [], [accounts[0], accounts[1], cc]);
    expect(draft.fromAccountId).toBe('chk');
  });

  it('liability with nothing owed: amount is null but To is still the liability', () => {
    const cc = { id: 'cc0', name: 'Paid Card', type: 'credit_card', openingBalance: 0 };
    const draft = transferDraftForAccount(cc, [], [accounts[0], cc]);
    expect(draft).toEqual({ fromAccountId: 'chk', toAccountId: 'cc0', initialAmount: null });
  });

  it('owed amount reflects transactions, not just opening balance', () => {
    const cc = { id: 'cc', name: 'Visa', type: 'credit_card', openingBalance: -300 };
    const txns = [{ id: 't', accountId: 'cc', amount: -50, date: '2026-05-10' }]; // now owes 350
    expect(transferDraftForAccount(cc, txns, [accounts[0], cc]).initialAmount).toBe(350);
  });

  it('treats a custom liability type (via typesById) as a liability', () => {
    const typesById = new Map([
      ['store_card', { id: 'store_card', klass: 'liability' }],
      ['bank',       { id: 'bank',       klass: 'asset' }],
    ]);
    const sc = { id: 'sc', name: 'Store Card', type: 'store_card', openingBalance: -50 };
    const list = [{ id: 'chk', type: 'bank', openingBalance: 0 }, sc];
    expect(transferDraftForAccount(sc, [], list, typesById)).toEqual({
      fromAccountId: 'chk', toAccountId: 'sc', initialAmount: 50,
    });
  });

  it('non-liability account keeps todays behavior: From = self, To/amount empty', () => {
    const chk = accounts.find(a => a.id === 'chk');
    expect(transferDraftForAccount(chk, [], accounts)).toEqual({
      fromAccountId: 'chk', toAccountId: undefined, initialAmount: null,
    });
  });
});

describe('payFromUpdate', () => {
  const accounts = [
    { id: 'chk', type: 'bank' },
    { id: 'cc',  type: 'credit_card' },
  ];

  it('returns a defaultPayFromId patch when the To account is a liability', () => {
    expect(payFromUpdate('cc', 'chk', accounts)).toEqual({ defaultPayFromId: 'chk' });
  });

  it('returns null when the To account is not a liability', () => {
    expect(payFromUpdate('chk', 'cc', accounts)).toBeNull();
  });

  it('returns null when the To account is not found', () => {
    expect(payFromUpdate('nope', 'chk', accounts)).toBeNull();
  });

  it('honors a custom liability type via typesById', () => {
    const typesById = new Map([['store_card', { id: 'store_card', klass: 'liability' }]]);
    const list = [{ id: 'sc', type: 'store_card' }, { id: 'chk', type: 'bank' }];
    expect(payFromUpdate('sc', 'chk', list, typesById)).toEqual({ defaultPayFromId: 'chk' });
  });
});
