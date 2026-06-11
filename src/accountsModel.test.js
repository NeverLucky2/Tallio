// src/accountsModel.test.js
import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_TYPES, GROUP_ORDER, accountClass, layoutFor, groupFor,
  isOnBalanceSheet, flowSign, transferDraftForAccount, payFromUpdate,
  monthToDateDelta, DEFAULT_ACCOUNT_TYPES_BY_ID, netWorthSeries,
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

  it('rounds the owed amount to cents (no floating-point tail)', () => {
    const cc = { id: 'cc', name: 'Visa', type: 'credit_card', openingBalance: 0 };
    const txns = [
      { id: 't1', accountId: 'cc', amount: -0.1 },
      { id: 't2', accountId: 'cc', amount: -0.2 }, // raw sum drifts to -0.30000000000000004
    ];
    expect(transferDraftForAccount(cc, txns, [cc]).initialAmount).toBe(0.3);
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

import { suggestTransferCategoryId } from './accountsModel.js';

describe('suggestTransferCategoryId', () => {
  const transferCats = [
    { id: 'cc', name: 'Credit Card Payment', flow: 'transfer' },
    { id: 'ln', name: 'Loan Payment', flow: 'transfer' },
    { id: 'iv', name: 'Investment Transfer', flow: 'transfer' },
  ];

  it('maps destination account type to the matching transfer category id', () => {
    expect(suggestTransferCategoryId({ id: 'a', type: 'credit_card' }, transferCats)).toBe('cc');
    expect(suggestTransferCategoryId({ id: 'a', type: 'loan' }, transferCats)).toBe('ln');
    expect(suggestTransferCategoryId({ id: 'a', type: 'mortgage' }, transferCats)).toBe('ln');
    expect(suggestTransferCategoryId({ id: 'a', type: 'investment' }, transferCats)).toBe('iv');
  });

  it('returns null for ambiguous / unmapped destination types', () => {
    expect(suggestTransferCategoryId({ id: 'a', type: 'bank' }, transferCats)).toBeNull();
    expect(suggestTransferCategoryId({ id: 'a', type: 'person' }, transferCats)).toBeNull();
    expect(suggestTransferCategoryId({ id: 'a', type: 'untyped' }, transferCats)).toBeNull();
    expect(suggestTransferCategoryId({ id: 'a', type: 'custom_xyz' }, transferCats)).toBeNull();
  });

  it('returns null gracefully when no account or the seed was renamed/removed', () => {
    expect(suggestTransferCategoryId(null, transferCats)).toBeNull();
    expect(suggestTransferCategoryId({ id: 'a', type: 'credit_card' }, [])).toBeNull();
  });
});

import { validateSplits } from './accountsModel.js';

describe('validateSplits', () => {
  it('accepts a transaction with no splits field (today\'s shape)', () => {
    expect(() => validateSplits({ id: 't1', amount: -42, categoryId: 'c1' })).not.toThrow();
  });

  it('accepts a transaction with splits=null', () => {
    expect(() => validateSplits({ id: 't1', amount: -42, categoryId: 'c1', splits: null })).not.toThrow();
  });

  it('accepts a well-formed Camry down-payment (category-only splits)', () => {
    const txn = {
      id: 't_cam_down', amount: -10000,
      splits: [
        { id: 's1', amount: -9000, categoryId: 'c_auto',   description: 'Down payment principal' },
        { id: 's2', amount:  -900, categoryId: 'c_fees',   description: 'Doc / dealer fees' },
        { id: 's3', amount: -1100, categoryId: 'c_tax',    description: 'TX 6.25% sales tax' },
        { id: 's4', amount: +1000, categoryId: 'c_credit', description: 'IRS EV credit' },
      ],
    };
    expect(() => validateSplits(txn)).not.toThrow();
  });

  it('accepts a Costco split with a transfer line (cash back)', () => {
    const txn = {
      id: 't_costco', amount: -180,
      splits: [
        { id: 's1', amount: -100, categoryId: 'c_groceries', description: 'Groceries' },
        { id: 's2', amount:  -30, categoryId: 'c_household', description: 'Soap' },
        { id: 's3', amount:  -50, transferId: 'tr_cash',     description: 'ATM cash back' },
      ],
    };
    expect(() => validateSplits(txn)).not.toThrow();
  });

  it('rejects a single-line split', () => {
    const txn = { id: 't1', amount: -10, splits: [{ id: 's1', amount: -10, categoryId: 'c1', description: '' }] };
    expect(() => validateSplits(txn)).toThrow(/at least 2/i);
  });

  it('rejects a line missing both categoryId and transferId', () => {
    const txn = {
      id: 't1', amount: -10,
      splits: [
        { id: 's1', amount:  -5, description: 'orphan' },
        { id: 's2', amount:  -5, categoryId: 'c1', description: '' },
      ],
    };
    expect(() => validateSplits(txn)).toThrow(/exactly one of categoryId or transferId/i);
  });

  it('rejects a line with BOTH categoryId and transferId', () => {
    const txn = {
      id: 't1', amount: -10,
      splits: [
        { id: 's1', amount: -5, categoryId: 'c1', transferId: 'tr1', description: '' },
        { id: 's2', amount: -5, categoryId: 'c1', description: '' },
      ],
    };
    expect(() => validateSplits(txn)).toThrow(/exactly one/i);
  });

  it('rejects a sum mismatch (category-only)', () => {
    const txn = {
      id: 't1', amount: -10,
      splits: [
        { id: 's1', amount: -6, categoryId: 'c1', description: '' },
        { id: 's2', amount: -3, categoryId: 'c1', description: '' },
      ],
    };
    expect(() => validateSplits(txn)).toThrow(/does not match/i);
  });

  it('rejects a sum mismatch caused by a transfer line, not just category lines', () => {
    const txn = {
      id: 't1', amount: -180,
      splits: [
        { id: 's1', amount: -100, categoryId: 'c1', description: '' },
        { id: 's2', amount:  -30, categoryId: 'c2', description: '' },
        { id: 's3', amount:  -49, transferId: 'tr1', description: '' },
      ],
    };
    expect(() => validateSplits(txn)).toThrow(/does not match/i);
  });

  it('rejects duplicate line ids', () => {
    const txn = {
      id: 't1', amount: -10,
      splits: [
        { id: 'dup', amount: -5, categoryId: 'c1', description: '' },
        { id: 'dup', amount: -5, categoryId: 'c1', description: '' },
      ],
    };
    expect(() => validateSplits(txn)).toThrow(/duplicate split line id/i);
  });

  it('rejects duplicate transferIds within one parent', () => {
    const txn = {
      id: 't1', amount: -10,
      splits: [
        { id: 's1', amount: -5, transferId: 'tr1', description: '' },
        { id: 's2', amount: -5, transferId: 'tr1', description: '' },
      ],
    };
    expect(() => validateSplits(txn)).toThrow(/duplicate transferId/i);
  });
});

describe('filterTransactions with splits', () => {
  const categoriesById = new Map([
    ['c_grocery', { id: 'c_grocery', name: 'Groceries',         flow: 'expense' }],
    ['c_solar',   { id: 'c_solar',   name: 'Home Improvement',  flow: 'expense' }],
  ]);
  const split = {
    id: 't1', accountId: 'a1', date: '2026-05-20', amount: -4300,
    payee: 'Costco', description: 'Costco big shop', categoryId: null,
    splits: [
      { id: 's1', amount:  -180, categoryId: 'c_grocery', description: 'Weekly groceries' },
      { id: 's2', amount: -4120, categoryId: 'c_solar',   description: '5kW solar panel kit' },
    ],
  };
  const other = {
    id: 't2', accountId: 'a1', date: '2026-05-19', amount: -22,
    payee: 'Starbucks', description: 'Coffee', categoryId: 'c_grocery',
  };

  it('search term matches a split line description', () => {
    const out = filterTransactions([split, other], { search: 'solar' }, categoriesById);
    expect(out.map(r => r.id)).toEqual(['t1']);
  });

  it('search term matches the name of a category referenced by a split line', () => {
    const out = filterTransactions([split, other], { search: 'home improvement' }, categoriesById);
    expect(out.map(r => r.id)).toEqual(['t1']);
  });

  it('search term that matches a parent-level field still works', () => {
    const out = filterTransactions([split, other], { search: 'costco' }, categoriesById);
    expect(out.map(r => r.id)).toEqual(['t1']);
  });

  it('categoryId filter matches a split-line categoryId on a parent', () => {
    const out = filterTransactions([split, other], { categoryId: 'c_solar' }, categoriesById);
    expect(out.map(r => r.id)).toEqual(['t1']);
  });

  it('categoryId filter still matches a top-level categoryId on non-split rows', () => {
    const out = filterTransactions([split, other], { categoryId: 'c_grocery' }, categoriesById);
    expect(out.map(r => r.id).sort()).toEqual(['t1', 't2']);
  });
});

describe('sortRows handles split parents predictably', () => {
  const categoriesById = new Map([
    ['c_grocery', { id: 'c_grocery', name: 'Groceries' }],
    ['c_zebra',   { id: 'c_zebra',   name: 'Zebra' }],
  ]);
  const rows = [
    { id: 't_g',     categoryId: 'c_grocery', date: '2026-05-01', amount: -10, balance: 0 },
    { id: 't_z',     categoryId: 'c_zebra',   date: '2026-05-02', amount: -10, balance: 0 },
    { id: 't_split', categoryId: null,        date: '2026-05-03', amount: -10, balance: 0,
      splits: [
        { id: 's1', amount: -5, categoryId: 'c_grocery', description: '' },
        { id: 's2', amount: -5, categoryId: 'c_zebra',   description: '' },
      ] },
  ];

  it('ascending category sort puts split parents AFTER all real categories', () => {
    const sorted = sortRows(rows, { key: 'category', dir: 'asc' }, categoriesById);
    expect(sorted.map(r => r.id)).toEqual(['t_g', 't_z', 't_split']);
  });

  it('descending category sort puts split parents BEFORE all real categories', () => {
    const sorted = sortRows(rows, { key: 'category', dir: 'desc' }, categoriesById);
    expect(sorted.map(r => r.id)).toEqual(['t_split', 't_z', 't_g']);
  });

  it('a split parent with a leftover top-level categoryId still groups as a split', () => {
    const rowsWithLeftover = rows.map(r => r.id === 't_split' ? { ...r, categoryId: 'c_grocery' } : r);
    const sorted = sortRows(rowsWithLeftover, { key: 'category', dir: 'asc' }, categoriesById);
    expect(sorted.map(r => r.id)).toEqual(['t_g', 't_z', 't_split']);
  });
});

describe('monthToDateDelta', () => {
  const types = DEFAULT_ACCOUNT_TYPES_BY_ID;
  const accounts = [
    { id: 'a_chk', name: 'Checking', type: 'bank', openingBalance: 1000 },
    { id: 'a_sav', name: 'Savings',  type: 'bank', openingBalance: 0 },
    { id: 'a_cc',  name: 'Card',     type: 'credit_card', openingBalance: 0 },
    { id: 'a_mom', name: 'Mom',      type: 'person', openingBalance: 0 },
  ];
  const now = new Date('2026-06-15T12:00:00');

  it('sums current-month transactions across asset and liability accounts', () => {
    const txns = [
      { id: 't1', accountId: 'a_chk', date: '2026-06-06', amount: 3184.52 },
      { id: 't2', accountId: 'a_chk', date: '2026-06-10', amount: -142.87 },
      { id: 't3', accountId: 'a_cc',  date: '2026-06-09', amount: -89.40 },
    ];
    expect(monthToDateDelta(accounts, txns, types, now)).toBeCloseTo(2952.25, 2);
  });

  it('excludes transactions from other months and years', () => {
    const txns = [
      { id: 't1', accountId: 'a_chk', date: '2026-05-31', amount: 500 },
      { id: 't2', accountId: 'a_chk', date: '2025-06-15', amount: 500 },
      { id: 't3', accountId: 'a_chk', date: '2026-06-01', amount: 25 },
    ];
    expect(monthToDateDelta(accounts, txns, types, now)).toBeCloseTo(25, 2);
  });

  it('transfers between on-sheet accounts net to zero', () => {
    const txns = [
      { id: 'tf', accountId: 'a_chk', date: '2026-06-09', amount: -1500, transferId: 'x' },
      { id: 'tt', accountId: 'a_sav', date: '2026-06-09', amount:  1500, transferId: 'x' },
    ];
    expect(monthToDateDelta(accounts, txns, types, now)).toBe(0);
  });

  it('ignores off-balance-sheet accounts', () => {
    const txns = [{ id: 't1', accountId: 'a_mom', date: '2026-06-05', amount: 800 }];
    expect(monthToDateDelta(accounts, txns, types, now)).toBe(0);
  });

  it('returns 0 for empty inputs', () => {
    expect(monthToDateDelta([], [], types, now)).toBe(0);
    expect(monthToDateDelta(accounts, [], types, now)).toBe(0);
  });
});

describe('netWorthSeries', () => {
  const typesById = new Map([['checking', { id: 'checking', klass: 'asset', group: 'Cash' }]]);
  const accounts = [{ id: 'a1', type: 'checking' }];

  it('returns one point per month, ending at current net worth', () => {
    const txns = [
      { id: 't1', accountId: 'a1', date: '2026-04-10', amount: 1000 },
      { id: 't2', accountId: 'a1', date: '2026-05-10', amount: 500 },
      { id: 't3', accountId: 'a1', date: '2026-06-05', amount: 250 },
    ];
    const series = netWorthSeries(accounts, txns, typesById, 3, new Date('2026-06-15'));
    expect(series).toHaveLength(3);
    expect(series[2]).toBe(1750);      // through June
    expect(series[1]).toBe(1500);      // through May
    expect(series[0]).toBe(1000);      // through April
  });

  it('is safe with no transactions', () => {
    expect(netWorthSeries(accounts, [], typesById, 4, new Date('2026-06-15'))).toEqual([0, 0, 0, 0]);
  });
});
