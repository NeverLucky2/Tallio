// src/reportsModel.test.js
import { describe, it, expect } from 'vitest';
import { resolvePeriod, monthsInRange, scopeAccountIds, filterRows } from './reportsModel.js';

const NOW = new Date(2026, 4, 20); // May 20, 2026 (local)

describe('resolvePeriod', () => {
  it('this-month → first of month .. today', () => {
    expect(resolvePeriod('this-month', { now: NOW })).toEqual({ start: '2026-05-01', end: '2026-05-20' });
  });
  it('last-3-months → first of the month two months back .. today', () => {
    expect(resolvePeriod('last-3-months', { now: NOW })).toEqual({ start: '2026-03-01', end: '2026-05-20' });
  });
  it('this-year → Jan 1 .. today', () => {
    expect(resolvePeriod('this-year', { now: NOW })).toEqual({ start: '2026-01-01', end: '2026-05-20' });
  });
  it('last-12-months → first of the month 11 back .. today (crosses year)', () => {
    expect(resolvePeriod('last-12-months', { now: NOW })).toEqual({ start: '2025-06-01', end: '2026-05-20' });
  });
  it('all-time → open bounds', () => {
    expect(resolvePeriod('all-time', { now: NOW })).toEqual({ start: null, end: null });
  });
  it('custom → passes the given bounds', () => {
    expect(resolvePeriod('custom', { now: NOW, customStart: '2025-01-01', customEnd: '2025-06-30' }))
      .toEqual({ start: '2025-01-01', end: '2025-06-30' });
  });
});

describe('monthsInRange', () => {
  it('inclusive ascending list between concrete bounds', () => {
    expect(monthsInRange('2026-03-15', '2026-06-02')).toEqual(['2026-03', '2026-04', '2026-05', '2026-06']);
  });
  it('open bounds derive from transaction min/max month', () => {
    const txns = [{ date: '2026-01-10' }, { date: '2026-03-31' }, { date: '2026-02-02' }];
    expect(monthsInRange(null, null, txns)).toEqual(['2026-01', '2026-02', '2026-03']);
  });
});

describe('scopeAccountIds', () => {
  const accounts = [
    { id: 'a1', type: 'bank' }, { id: 'a2', type: 'credit_card' }, { id: 'a3', type: 'bank' },
  ];
  it('all → null (no restriction)', () => {
    expect(scopeAccountIds(accounts, { kind: 'all' })).toBeNull();
  });
  it('account → just that id', () => {
    expect([...scopeAccountIds(accounts, { kind: 'account', id: 'a2' })]).toEqual(['a2']);
  });
  it('type → all accounts of that type', () => {
    expect([...scopeAccountIds(accounts, { kind: 'type', typeId: 'bank' })].sort()).toEqual(['a1', 'a3']);
  });
  it('group → all accounts whose type maps to that sidebar group', () => {
    // bank → 'Cash & Bank'; credit_card → 'Credit cards & loans'
    expect([...scopeAccountIds(accounts, { kind: 'group', group: 'Cash & Bank' })].sort()).toEqual(['a1', 'a3']);
  });
});

describe('filterRows', () => {
  const txns = [
    { id: 't1', accountId: 'a1', date: '2026-04-15', amount: 1 },
    { id: 't2', accountId: 'a2', date: '2026-05-01', amount: 2 },
    { id: 't3', accountId: 'a1', date: '2026-06-20', amount: 3 },
  ];
  it('filters by inclusive date bounds', () => {
    expect(filterRows(txns, { start: '2026-05-01', end: '2026-05-31' }).map(t => t.id)).toEqual(['t2']);
  });
  it('filters by accountIds set', () => {
    expect(filterRows(txns, { accountIds: new Set(['a1']) }).map(t => t.id)).toEqual(['t1', 't3']);
  });
  it('null bounds / null accountIds = open', () => {
    expect(filterRows(txns, {}).map(t => t.id)).toEqual(['t1', 't2', 't3']);
  });
});

import { incomeExpenseSummary, spendingByCategory } from './reportsModel.js';

const cats = new Map([
  ['c_inc', { id: 'c_inc', name: 'Salary',    icon: '💰', color: '#0a0', flow: 'income' }],
  ['c_gro', { id: 'c_gro', name: 'Groceries', icon: '🛒', color: '#a00', flow: 'expense' }],
  ['c_din', { id: 'c_din', name: 'Dining',    icon: '🍽️', color: '#b50', flow: 'expense' }],
  ['c_sav', { id: 'c_sav', name: 'Brokerage', icon: '📈', color: '#05a', flow: 'savings' }],
]);

const txns = [
  { id: 'i1', accountId: 'a1', date: '2026-05-02', amount:  5000, categoryId: 'c_inc' },
  { id: 'g1', accountId: 'a1', date: '2026-05-03', amount:  -600, categoryId: 'c_gro' },
  { id: 'g2', accountId: 'a1', date: '2026-05-09', amount:   -50, categoryId: 'c_gro' },
  { id: 'r1', accountId: 'a1', date: '2026-05-10', amount:    20, categoryId: 'c_gro' }, // grocery refund
  { id: 'd1', accountId: 'a1', date: '2026-05-12', amount:  -400, categoryId: 'c_din' },
  { id: 's1', accountId: 'a1', date: '2026-05-15', amount: -1000, categoryId: 'c_sav' }, // savings outflow
  { id: 'x1', accountId: 'a1', date: '2026-05-20', amount:  -300, categoryId: null, transferId: 'tr1' }, // transfer leg
];

describe('incomeExpenseSummary', () => {
  it('savings = income − spending; transfers + savings-flow excluded from spending; refunds net', () => {
    const s = incomeExpenseSummary(txns, cats, {});
    expect(s.income).toBeCloseTo(5000, 2);
    expect(s.spending).toBeCloseTo(1030, 2); // 600 + 50 − 20 (refund) + 400
    expect(s.savings).toBeCloseTo(3970, 2);  // 5000 − 1030
    expect(s.savingsRate).toBeCloseTo(3970 / 5000, 4);
    expect(s.earmarked).toBeCloseTo(1000, 2); // savings-flow magnitude (informational, not subtracted)
  });
  it('savingsRate guarded when no income', () => {
    expect(incomeExpenseSummary([txns[1]], cats, {}).savingsRate).toBe(0);
  });
});

describe('spendingByCategory', () => {
  it('expense-flow only, descending, pct sums ~100, transfers/savings excluded', () => {
    const rows = spendingByCategory(txns, cats, {});
    expect(rows.map(r => r.categoryId)).toEqual(['c_gro', 'c_din']); // 630 then 400
    expect(rows[0]).toMatchObject({ name: 'Groceries', total: 630 });
    expect(rows[1]).toMatchObject({ name: 'Dining', total: 400 });
    expect(Math.round(rows.reduce((s, r) => s + r.pct, 0))).toBe(100);
  });
  it('empty when no expenses', () => {
    expect(spendingByCategory([txns[0]], cats, {})).toEqual([]);
  });
});

import { cashFlowByMonth, netWorthByMonth } from './reportsModel.js';

describe('cashFlowByMonth', () => {
  const cats2 = new Map([
    ['inc', { flow: 'income' }],
    ['exp', { flow: 'expense' }],
  ]);
  const t = [
    { id: '1', accountId: 'a', date: '2026-01-10', amount: 1000, categoryId: 'inc' },
    { id: '2', accountId: 'a', date: '2026-01-20', amount: -300, categoryId: 'exp' },
    { id: '3', accountId: 'a', date: '2026-03-05', amount: -200, categoryId: 'exp' },
    { id: '4', accountId: 'a', date: '2026-02-01', amount: -50, categoryId: null, transferId: 'x' }, // transfer
  ];
  it('one bucket per month with per-month net; empty months are zero; transfers ignored', () => {
    const rows = cashFlowByMonth(t, cats2, {}, ['2026-01', '2026-02', '2026-03']);
    expect(rows).toEqual([
      { month: '2026-01', income: 1000, spending: 300, net: 700 },
      { month: '2026-02', income: 0, spending: 0, net: 0 },
      { month: '2026-03', income: 0, spending: 200, net: -200 },
    ]);
  });
});

describe('netWorthByMonth', () => {
  const typesById = undefined; // use built-in defaults: bank=asset, credit_card=liability, person=offsheet
  const accounts = [
    { id: 'bank', type: 'bank', openingBalance: 1000 },
    { id: 'card', type: 'credit_card', openingBalance: 0 },
    { id: 'fren', type: 'person', openingBalance: 999 }, // off-sheet, must be ignored
  ];
  const txns2 = [
    { id: 'p', accountId: 'bank', date: '2026-02-15', amount: 500 },   // raises assets from Feb on
    { id: 'c', accountId: 'card', date: '2026-03-10', amount: -200 },  // owes from Mar on
  ];
  it('as-of each month-end; off-sheet excluded; later txns only affect later months', () => {
    const rows = netWorthByMonth(accounts, txns2, typesById, {}, ['2026-01', '2026-02', '2026-03']);
    expect(rows).toEqual([
      { month: '2026-01', assets: 1000, owed: 0, netWorth: 1000 },
      { month: '2026-02', assets: 1500, owed: 0, netWorth: 1500 },
      { month: '2026-03', assets: 1500, owed: 200, netWorth: 1300 },
    ]);
  });
  it('on-sheet → on-sheet transfer leaves net worth flat', () => {
    const transferTxns = [
      { id: 'o', accountId: 'bank', date: '2026-02-10', amount: -400, transferId: 'tr', categoryId: null },
      { id: 'i', accountId: 'card', date: '2026-02-10', amount: 400, transferId: 'tr', categoryId: null },
    ];
    const rows = netWorthByMonth(accounts.slice(0, 2), transferTxns, typesById, {}, ['2026-01', '2026-02']);
    expect(rows[0].netWorth).toBe(rows[1].netWorth); // 1000 both months
  });
});

import { recurringCharges, findDuplicates } from './reportsModel.js';

describe('recurringCharges', () => {
  const cats3 = new Map([['exp', { flow: 'expense' }], ['inc', { flow: 'income' }]]);
  const now = new Date(2026, 4, 20); // May 2026
  const recTxns = [
    // Netflix every month Mar/Apr/May → active
    { id: 'n1', accountId: 'a', date: '2026-03-04', amount: -15.99, categoryId: 'exp', payee: 'Netflix' },
    { id: 'n2', accountId: 'a', date: '2026-04-04', amount: -15.99, categoryId: 'exp', payee: 'Netflix' },
    { id: 'n3', accountId: 'a', date: '2026-05-04', amount: -15.99, categoryId: 'exp', payee: 'Netflix' },
    // OldApp Jan/Feb only → stale (not active in May)
    { id: 'o1', accountId: 'a', date: '2026-01-09', amount: -9.99, categoryId: 'exp', payee: 'OldApp' },
    { id: 'o2', accountId: 'a', date: '2026-02-09', amount: -9.99, categoryId: 'exp', payee: 'OldApp' },
    // single-month coffee → not recurring
    { id: 'c1', accountId: 'a', date: '2026-05-01', amount: -4.50, categoryId: 'exp', payee: 'Cafe' },
    // income ignored
    { id: 'p1', accountId: 'a', date: '2026-05-01', amount: 4000, categoryId: 'inc', payee: 'Work' },
  ];
  it('groups ≥2-month expense charges, flags active vs stale, active-first', () => {
    const rows = recurringCharges(recTxns, cats3, { now });
    expect(rows.map(r => r.label)).toEqual(['Netflix', 'OldApp']); // active first
    const netflix = rows[0];
    expect(netflix).toMatchObject({ active: true, occurrences: 3, monthCount: 3 });
    expect(netflix.avgAmount).toBeCloseTo(15.99, 2);
    expect(rows[1]).toMatchObject({ label: 'OldApp', active: false });
  });
});

describe('findDuplicates', () => {
  const dupTxns = [
    { id: 'd1', accountId: 'a', date: '2026-04-03', amount: -54.10, payee: 'Amazon', categoryId: 'exp' },
    { id: 'd2', accountId: 'a', date: '2026-04-03', amount: -54.10, payee: 'Amazon', categoryId: 'exp' }, // dup
    { id: 'n1', accountId: 'a', date: '2026-04-04', amount: -54.10, payee: 'Amazon', categoryId: 'exp' }, // diff day
    { id: 'tr', accountId: 'a', date: '2026-04-03', amount: -54.10, payee: null, transferId: 'x', categoryId: null },
  ];
  it('flags same account+date+amount+label collisions; ignores diff-day and transfers', () => {
    const dups = findDuplicates(dupTxns, {});
    expect(dups).toHaveLength(1);
    expect(dups[0]).toMatchObject({ accountId: 'a', amount: -54.10, date: '2026-04-03', label: 'Amazon' });
    expect(dups[0].ids.sort()).toEqual(['d1', 'd2']);
  });
});

import { sparklinePath, barLayout } from './reportsModel.js';

describe('sparklinePath', () => {
  it('maps higher values to smaller y; first cmd is M, rest L', () => {
    const { d, points } = sparklinePath([0, 10], { width: 100, height: 20, pad: 0 });
    expect(points).toHaveLength(2);
    expect(points[0].x).toBeCloseTo(0, 2);
    expect(points[1].x).toBeCloseTo(100, 2);
    expect(points[0].y).toBeGreaterThan(points[1].y); // value 10 sits higher (smaller y)
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain('L');
  });
  it('single point centers x; empty → empty path', () => {
    expect(sparklinePath([5], { width: 100, height: 20, pad: 0 }).points[0].x).toBeCloseTo(50, 2);
    expect(sparklinePath([], {})).toEqual({ d: '', points: [] });
  });
});

describe('barLayout', () => {
  it('baseline at mid-height; negatives flagged and drawn below', () => {
    const bars = barLayout([10, -10], { width: 100, height: 40, gap: 0 });
    expect(bars).toHaveLength(2);
    expect(bars[0].negative).toBe(false);
    expect(bars[1].negative).toBe(true);
    expect(bars[0].y + bars[0].height).toBeCloseTo(20, 2); // top bar ends at baseline
    expect(bars[1].y).toBeCloseTo(20, 2);                  // bottom bar starts at baseline
  });
  it('empty → []', () => {
    expect(barLayout([], {})).toEqual([]);
  });
});

import { classifyRecurring } from './reportsModel.js';

describe('recurringCharges key', () => {
  const cats4 = new Map([['exp', { flow: 'expense' }]]);
  const now2 = new Date(2026, 4, 20);
  const t = [
    { id: 'n1', accountId: 'a', date: '2026-03-04', amount: -15.99, categoryId: 'exp', payee: 'Netflix' },
    { id: 'n2', accountId: 'a', date: '2026-04-04', amount: -15.99, categoryId: 'exp', payee: 'Netflix' },
  ];
  it('exposes a normalized key for acknowledgments', () => {
    const rows = recurringCharges(t, cats4, { now: now2 });
    expect(rows[0].key).toBe('NETFLIX');
  });
});

describe('classifyRecurring', () => {
  const rows = [
    { key: 'NETFLIX', label: 'Netflix', lastDate: '2026-05-04' },
    { key: 'SPOTIFY', label: 'Spotify', lastDate: '2026-03-10' },
    { key: 'OLDGYM', label: 'OldGym', lastDate: '2026-01-15' },
    { key: 'NEWCHARGE', label: 'NewCharge', lastDate: '2026-05-01' },
  ];
  const subs = {
    NETFLIX: { status: 'ongoing' },
    SPOTIFY: { status: 'cancelled', cancelledAsOf: '2026-01' }, // last charge Mar > Jan → zombie
    OLDGYM: { status: 'cancelled', cancelledAsOf: '2026-01' },  // last charge in Jan == cancel month → clean
  };
  it('buckets by status; zombie only when charged strictly after the cancel month', () => {
    const { alerts, ongoing, cancelled, review } = classifyRecurring(rows, subs);
    expect(ongoing.map(r => r.key)).toEqual(['NETFLIX']);
    expect(alerts.map(r => r.key)).toEqual(['SPOTIFY']);
    expect(alerts[0].alert).toBe('zombie');
    expect(alerts[0].cancelledAsOf).toBe('2026-01');
    expect(cancelled.map(r => r.key)).toEqual(['OLDGYM']);
    expect(review.map(r => r.key)).toEqual(['NEWCHARGE']);
  });
  it('no subscriptions → everything is review', () => {
    expect(classifyRecurring(rows, {}).review).toHaveLength(4);
  });
});

describe('findDuplicates signature + dismissed', () => {
  const txns = [
    { id: 'd1', accountId: 'a', date: '2026-04-03', amount: -54.10, payee: 'Amazon', categoryId: 'exp' },
    { id: 'd2', accountId: 'a', date: '2026-04-03', amount: -54.10, payee: 'Amazon', categoryId: 'exp' },
  ];
  it('emits a sorted-id signature', () => {
    expect(findDuplicates(txns, {})[0].signature).toBe('d1|d2');
  });
  it('excludes dismissed signatures', () => {
    expect(findDuplicates(txns, { dismissed: new Set(['d1|d2']) })).toHaveLength(0);
  });
});

describe('transfers stay out of reports even when categorized', () => {
  it('a transfer leg with a transfer-flow category contributes nothing to income/spending', () => {
    const categoriesById = new Map([['ct', { id: 'ct', name: 'Credit Card Payment', flow: 'transfer' }]]);
    const txns = [
      { id: 'o', accountId: 'a', date: '2026-05-10', amount: -300, transferId: 'tr', categoryId: 'ct' },
      { id: 'i', accountId: 'b', date: '2026-05-10', amount:  300, transferId: 'tr', categoryId: 'ct' },
    ];
    const sum = incomeExpenseSummary(txns, categoriesById, {});
    expect(sum.income).toBeCloseTo(0);
    expect(sum.spending).toBeCloseTo(0);
  });

  it('defensively, a non-transfer row carrying a transfer-flow category is also non-countable', () => {
    const categoriesById = new Map([['ct', { id: 'ct', name: 'Credit Card Payment', flow: 'transfer' }]]);
    const txns = [{ id: 'n', accountId: 'a', date: '2026-05-10', amount: -300, categoryId: 'ct' }];
    const sum = incomeExpenseSummary(txns, categoriesById, {});
    expect(sum.income).toBeCloseTo(0);
    expect(sum.spending).toBeCloseTo(0);
  });
});

import { flattenForReports } from './reportsModel.js';

describe('flattenForReports', () => {
  it('yields non-split transactions unchanged', () => {
    const txns = [{ id: 't1', amount: -10, categoryId: 'c1', date: '2026-05-01', accountId: 'a1' }];
    expect([...flattenForReports(txns)]).toEqual(txns);
  });

  it('treats splits=null as non-split', () => {
    const txns = [{ id: 't1', amount: -10, categoryId: 'c1', date: '2026-05-01', accountId: 'a1', splits: null }];
    expect([...flattenForReports(txns)]).toEqual(txns);
  });

  it('explodes a split parent into one virtual row per category line', () => {
    const txns = [{
      id: 't1', amount: -180, accountId: 'a1', date: '2026-05-20', payee: 'Costco', description: 'Costco run',
      splits: [
        { id: 's1', amount: -100, categoryId: 'c_groceries', description: 'Groceries' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: 'Soap' },
      ],
    }];
    const flat = [...flattenForReports(txns)];
    expect(flat).toHaveLength(2);
    expect(flat[0]).toMatchObject({ accountId: 'a1', date: '2026-05-20', categoryId: 'c_groceries', amount: -100, description: 'Groceries', _parentId: 't1', _splitId: 's1' });
    expect(flat[1]).toMatchObject({ categoryId: 'c_household', amount: -80, description: 'Soap' });
  });

  it('drops transfer split lines (they net out, like top-level transfers do today)', () => {
    const txns = [{
      id: 't1', amount: -180, accountId: 'a1', date: '2026-05-20',
      splits: [
        { id: 's1', amount: -100, categoryId: 'c_groceries', description: '' },
        { id: 's2', amount:  -30, categoryId: 'c_household', description: '' },
        { id: 's3', amount:  -50, transferId: 'tr1',         description: 'cash back' },
      ],
    }];
    const flat = [...flattenForReports(txns)];
    expect(flat).toHaveLength(2);
    expect(flat.every(r => r.transferId == null)).toBe(true);
  });

  it('falls back to parent.description when a line has no description', () => {
    const txns = [{
      id: 't1', amount: -10, accountId: 'a1', date: '2026-05-20', description: 'Parent desc',
      splits: [
        { id: 's1', amount: -5, categoryId: 'c1', description: '' },
        { id: 's2', amount: -5, categoryId: 'c1', description: '' },
      ],
    }];
    const [r0] = [...flattenForReports(txns)];
    expect(r0.description).toBe('Parent desc');
  });
});
