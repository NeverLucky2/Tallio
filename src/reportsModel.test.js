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
