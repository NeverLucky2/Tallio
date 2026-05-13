import { describe, it, expect } from 'vitest';
import { buildItemsCsv } from './exportArchive.js';

const cats = [
  { id: 'c_food', name: 'Groceries',  flow: 'expense' },
  { id: 'c_pay',  name: 'Paycheck',   flow: 'income'  },
  { id: 'c_401k', name: '401(k)',     flow: 'savings' },
];
const catsById = new Map(cats.map(c => [c.id, c]));

describe('buildItemsCsv', () => {
  it('starts with UTF-8 BOM and the header row', () => {
    const csv = buildItemsCsv([], catsById);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv.split('\n')[0].slice(1)).toBe('date,vendor,description,amount,category,flow,recurring');
  });

  it('renders one row per item, sorted by date ascending', () => {
    const bills = [
      { id: 'b1', vendor: 'Chase', month: '2026-05', items: [
        { id: 'i2', description: 'Whole Foods', amount: 84.21, categoryId: 'c_food', date: '2026-05-02' },
      ]},
      { id: 'b2', vendor: 'Acme', month: '2026-05', items: [
        { id: 'i1', description: 'Gross pay', amount: 5200, categoryId: 'c_pay', date: '2026-05-15' },
      ]},
    ];
    const lines = buildItemsCsv(bills, catsById).split('\n').filter(Boolean);
    expect(lines.length).toBe(3); // header + 2 rows
    expect(lines[1]).toContain('2026-05-02');
    expect(lines[1]).toContain('Whole Foods');
    expect(lines[2]).toContain('2026-05-15');
    expect(lines[2]).toContain('Gross pay');
  });

  it('formats amount with toFixed(2) and preserves negatives', () => {
    const bills = [{ id: 'b1', vendor: 'Chase', month: '2026-05', items: [
      { id: 'i1', description: 'Whole Foods refund', amount: -40, categoryId: 'c_food', date: '2026-05-12' },
      { id: 'i2', description: 'Coffee',             amount: 5,   categoryId: 'c_food', date: '2026-05-03' },
    ]}];
    const csv = buildItemsCsv(bills, catsById);
    expect(csv).toContain(',-40.00,');
    expect(csv).toContain(',5.00,');
  });

  it('escapes commas, quotes, and newlines in fields', () => {
    const bills = [{ id: 'b1', vendor: 'Chase', month: '2026-05', items: [
      { id: 'i1', description: 'Whole Foods, refund', amount: 10, categoryId: 'c_food', date: '2026-05-02' },
      { id: 'i2', description: 'He said "ok"',        amount: 20, categoryId: 'c_food', date: '2026-05-03' },
      { id: 'i3', description: 'line1\nline2',        amount: 30, categoryId: 'c_food', date: '2026-05-04' },
    ]}];
    const csv = buildItemsCsv(bills, catsById);
    expect(csv).toContain('"Whole Foods, refund"');
    expect(csv).toContain('"He said ""ok"""');
    expect(csv).toContain('"line1\nline2"');
  });

  it('renders recurring as yes/no based on bill.recurringChainId', () => {
    const bills = [
      { id: 'b1', vendor: 'Honda', month: '2026-05', recurringChainId: 'rec_x',
        items: [{ id: 'i1', description: 'Loan', amount: 470, categoryId: 'c_food', date: '2026-05-15' }] },
      { id: 'b2', vendor: 'Coffee Shop', month: '2026-05',
        items: [{ id: 'i2', description: 'Latte', amount: 5, categoryId: 'c_food', date: '2026-05-02' }] },
    ];
    const lines = buildItemsCsv(bills, catsById).split('\n');
    expect(lines[1]).toMatch(/,no$/);   // sorted by date — coffee first
    expect(lines[2]).toMatch(/,yes$/);  // honda second
  });

  it('falls back to Uncategorized + expense for unknown categoryId', () => {
    const bills = [{ id: 'b1', vendor: 'Chase', month: '2026-05', items: [
      { id: 'i1', description: 'Mystery', amount: 9, categoryId: 'c_missing', date: '2026-05-02' },
    ]}];
    const csv = buildItemsCsv(bills, catsById);
    expect(csv).toContain(',Uncategorized,expense,');
  });

  it('falls back to bill.month-01 when item.date is null', () => {
    const bills = [{ id: 'b1', vendor: 'Chase', month: '2026-05', items: [
      { id: 'i1', description: 'Old item', amount: 5, categoryId: 'c_food', date: null },
    ]}];
    const csv = buildItemsCsv(bills, catsById);
    expect(csv).toContain('2026-05-01');
  });

  it('skips items with amount === 0', () => {
    const bills = [{ id: 'b1', vendor: 'Chase', month: '2026-05', items: [
      { id: 'i1', description: 'Zero',  amount: 0, categoryId: 'c_food', date: '2026-05-02' },
      { id: 'i2', description: 'Real',  amount: 5, categoryId: 'c_food', date: '2026-05-03' },
    ]}];
    const lines = buildItemsCsv(bills, catsById).split('\n').filter(Boolean);
    expect(lines.length).toBe(2); // header + 1 row
    expect(lines[1]).toContain('Real');
  });
});
