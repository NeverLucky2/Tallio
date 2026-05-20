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
