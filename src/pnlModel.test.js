// src/pnlModel.test.js
import { describe, it, expect } from 'vitest';
import { bucketsInRange, bucketKeyForMonth } from './pnlModel.js';

const txns = [
  { id: 't1', date: '2026-01-15', amount: -10, categoryId: 'c1' },
  { id: 't2', date: '2026-04-15', amount: -10, categoryId: 'c1' },
];

describe('bucketKeyForMonth', () => {
  it('maps a month to month/quarter/year keys', () => {
    expect(bucketKeyForMonth('2026-01', 'month')).toBe('2026-01');
    expect(bucketKeyForMonth('2026-01', 'quarter')).toBe('2026-Q1');
    expect(bucketKeyForMonth('2026-04', 'quarter')).toBe('2026-Q2');
    expect(bucketKeyForMonth('2026-12', 'quarter')).toBe('2026-Q4');
    expect(bucketKeyForMonth('2026-07', 'year')).toBe('2026');
    expect(bucketKeyForMonth('', 'month')).toBeNull();
  });
});

describe('bucketsInRange', () => {
  it('monthly buckets within a single year drop the year suffix', () => {
    const b = bucketsInRange('2026-01-01', '2026-03-31', [], 'month');
    expect(b).toEqual([
      { key: '2026-01', label: 'Jan' },
      { key: '2026-02', label: 'Feb' },
      { key: '2026-03', label: 'Mar' },
    ]);
  });

  it('monthly labels gain a year suffix when the range spans years', () => {
    const b = bucketsInRange('2025-12-01', '2026-01-31', [], 'month');
    expect(b).toEqual([
      { key: '2025-12', label: "Dec '25" },
      { key: '2026-01', label: "Jan '26" },
    ]);
  });

  it('quarterly buckets dedupe months into quarters', () => {
    const b = bucketsInRange('2026-01-01', '2026-06-30', [], 'quarter');
    expect(b).toEqual([
      { key: '2026-Q1', label: "Q1 '26" },
      { key: '2026-Q2', label: "Q2 '26" },
    ]);
  });

  it('yearly buckets dedupe months into years', () => {
    const b = bucketsInRange('2025-06-01', '2026-06-30', [], 'year');
    expect(b).toEqual([
      { key: '2025', label: '2025' },
      { key: '2026', label: '2026' },
    ]);
  });

  it('derives open-ended (all-time) bounds from transactions', () => {
    const b = bucketsInRange(null, null, txns, 'quarter');
    expect(b).toEqual([
      { key: '2026-Q1', label: "Q1 '26" },
      { key: '2026-Q2', label: "Q2 '26" },
    ]);
  });
});

import { profitAndLoss } from './pnlModel.js';

const catsById = new Map([
  ['sal', { id: 'sal', name: 'Sales', icon: '💰', color: '#0a0', flow: 'income' }],
  ['int', { id: 'int', name: 'Interest', icon: '🏦', color: '#0aa', flow: 'income' }],
  ['rent', { id: 'rent', name: 'Rent', icon: '🏠', color: '#a00', flow: 'expense' }],
  ['sup', { id: 'sup', name: 'Supplies', icon: '📦', color: '#a0a', flow: 'expense' }],
  ['brk', { id: 'brk', name: 'Brokerage', icon: '📈', color: '#00a', flow: 'savings' }],
]);

const ledger = [
  { id: 'a', accountId: 'x', date: '2026-01-10', amount: 2100, categoryId: 'sal' },
  { id: 'b', accountId: 'x', date: '2026-02-10', amount: 1900, categoryId: 'sal' },
  { id: 'c', accountId: 'x', date: '2026-01-05', amount: 20, categoryId: 'int' },
  { id: 'd', accountId: 'x', date: '2026-01-01', amount: -1000, categoryId: 'rent' },
  { id: 'e', accountId: 'x', date: '2026-02-01', amount: -1000, categoryId: 'rent' },
  { id: 'f', accountId: 'x', date: '2026-01-20', amount: -120, categoryId: 'sup' },
  { id: 'g', accountId: 'x', date: '2026-01-25', amount: -500, categoryId: 'brk' }, // savings: excluded
  { id: 'h', accountId: 'x', date: '2026-01-26', amount: -75, transferId: 'tr1', categoryId: 'rent' }, // transfer: excluded
];

const monthOpts = { start: '2026-01-01', end: '2026-02-28', accountIds: null, granularity: 'month' };

describe('profitAndLoss', () => {
  it('builds income and expense sections with per-bucket + total, savings/transfers excluded', () => {
    const pnl = profitAndLoss(ledger, catsById, monthOpts);
    expect(pnl.buckets.map(b => b.key)).toEqual(['2026-01', '2026-02']);

    // income rows sorted desc by total: Sales (4000) before Interest (20)
    expect(pnl.income.rows.map(r => r.name)).toEqual(['Sales', 'Interest']);
    const sales = pnl.income.rows[0];
    expect(sales.byBucket).toEqual({ '2026-01': 2100, '2026-02': 1900 });
    expect(sales.total).toBe(4000);
    expect(pnl.income.totalsByBucket).toEqual({ '2026-01': 2120, '2026-02': 1900 });
    expect(pnl.income.total).toBe(4020);

    // expense magnitudes are positive
    const rent = pnl.expense.rows.find(r => r.name === 'Rent');
    expect(rent.byBucket).toEqual({ '2026-01': 1000, '2026-02': 1000 });
    expect(rent.total).toBe(2000);
    expect(pnl.expense.total).toBe(2120); // 2000 rent + 120 supplies (brokerage + transfer excluded)

    // net = income − expense
    expect(pnl.netByBucket).toEqual({ '2026-01': 1000, '2026-02': 900 });
    expect(pnl.netTotal).toBe(1900);
  });

  it('rolls up into quarter buckets', () => {
    const pnl = profitAndLoss(ledger, catsById, { ...monthOpts, granularity: 'quarter' });
    expect(pnl.buckets.map(b => b.key)).toEqual(['2026-Q1']);
    expect(pnl.income.total).toBe(4020);
    expect(pnl.netByBucket).toEqual({ '2026-Q1': 1900 });
  });

  it('explodes splits into both sections via the parent line categories', () => {
    const withSplit = [{
      id: 's1', accountId: 'x', date: '2026-01-15', amount: 400, categoryId: 'sal',
      splits: [
        { id: 'l1', amount: 900, categoryId: 'sal' },
        { id: 'l2', amount: -500, categoryId: 'sup' },
      ],
    }];
    const pnl = profitAndLoss(withSplit, catsById, monthOpts);
    expect(pnl.income.total).toBe(900);
    expect(pnl.expense.total).toBe(500);
    expect(pnl.netTotal).toBe(400);
  });

  it('omits categories with no activity and handles an empty ledger', () => {
    const pnl = profitAndLoss([], catsById, monthOpts);
    expect(pnl.income.rows).toEqual([]);
    expect(pnl.expense.rows).toEqual([]);
    expect(pnl.netTotal).toBe(0);
    expect(pnl.income.totalsByBucket).toEqual({ '2026-01': 0, '2026-02': 0 });
  });

  it('respects account scope via opts.accountIds', () => {
    const pnl = profitAndLoss(ledger, catsById, { ...monthOpts, accountIds: new Set(['other']) });
    expect(pnl.income.total).toBe(0);
    expect(pnl.expense.total).toBe(0);
  });
});

import { buildPnlCsv } from './pnlModel.js';

describe('buildPnlCsv', () => {
  it('renders the statement grid with a BOM, labels, and Net profit row', () => {
    const pnl = profitAndLoss(ledger, catsById, monthOpts);
    const csv = buildPnlCsv(pnl);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    const lines = csv.slice(1).split('\n');
    expect(lines[0]).toBe(',Jan,Feb,Total');
    expect(lines).toContain('INCOME');
    expect(lines).toContain('Sales,2100.00,1900.00,4000.00');
    expect(lines).toContain('Total income,2120.00,1900.00,4020.00');
    expect(lines).toContain('EXPENSES');
    expect(lines).toContain('Total expense,1120.00,1000.00,2120.00');
    expect(lines).toContain('NET PROFIT,1000.00,900.00,1900.00');
  });

  it('quotes labels containing commas', () => {
    const cats = new Map([['c', { id: 'c', name: 'Meals, travel', flow: 'expense' }]]);
    const t = [{ id: 't', accountId: 'x', date: '2026-01-01', amount: -50, categoryId: 'c' }];
    const csv = buildPnlCsv(profitAndLoss(t, cats, monthOpts));
    expect(csv.slice(1).split('\n')).toContain('"Meals, travel",50.00,0.00,50.00');
  });
});
