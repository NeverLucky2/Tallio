import { describe, it, expect } from 'vitest';
import { aggregateYoYByCategory, aggregateMonthByCategory } from './reportingMath.js';

const cats = [
  { id: 'c_food', name: 'Groceries', flow: 'expense' },
  { id: 'c_util', name: 'Utilities', flow: 'expense' },
  { id: 'c_pay',  name: 'Paycheck',  flow: 'income'  },
  { id: 'c_401k', name: '401(k)',    flow: 'savings' },
];
const catsById = new Map(cats.map(c => [c.id, c]));

function mkBill(month, items) {
  return { id: 'b_' + month, vendor: 'V', month, items: items.map((x, i) => ({ id: `i_${month}_${i}`, ...x })) };
}

describe('aggregateYoYByCategory', () => {
  it('returns YTD-through-current-month vs same period last year', () => {
    const bills = [
      mkBill('2025-03', [{ description: 'A', amount: 100, categoryId: 'c_food', date: '2025-03-15' }]),
      mkBill('2025-07', [{ description: 'B', amount: 200, categoryId: 'c_food', date: '2025-07-15' }]),
      mkBill('2026-04', [{ description: 'C', amount: 150, categoryId: 'c_food', date: '2026-04-15' }]),
    ];
    const rows = aggregateYoYByCategory(bills, '2026-05-12', catsById);
    const food = rows.find(r => r.categoryId === 'c_food');
    expect(food.currentYTD).toBe(150);
    expect(food.priorYTD).toBe(100); // July 2025 is OUTSIDE Jan-May window
  });

  it('deltaPct is null when priorYTD === 0', () => {
    const bills = [
      mkBill('2026-03', [{ description: 'A', amount: 100, categoryId: 'c_food', date: '2026-03-15' }]),
    ];
    const rows = aggregateYoYByCategory(bills, '2026-05-12', catsById);
    const food = rows.find(r => r.categoryId === 'c_food');
    expect(food.priorYTD).toBe(0);
    expect(food.deltaPct).toBeNull();
  });

  it('deltaPct is a rounded integer percent', () => {
    const bills = [
      mkBill('2025-04', [{ description: 'A', amount: 100, categoryId: 'c_food', date: '2025-04-15' }]),
      mkBill('2026-04', [{ description: 'B', amount: 112, categoryId: 'c_food', date: '2026-04-15' }]),
    ];
    const rows = aggregateYoYByCategory(bills, '2026-05-12', catsById);
    const food = rows.find(r => r.categoryId === 'c_food');
    expect(food.deltaPct).toBe(12);
    expect(food.deltaAbs).toBe(12);
  });

  it('refunds reduce currentYTD', () => {
    const bills = [
      mkBill('2026-04', [
        { description: 'A', amount: 100, categoryId: 'c_food', date: '2026-04-15' },
        { description: 'R', amount: -30, categoryId: 'c_food', date: '2026-04-20' },
      ]),
    ];
    const rows = aggregateYoYByCategory(bills, '2026-05-12', catsById);
    const food = rows.find(r => r.categoryId === 'c_food');
    expect(food.currentYTD).toBe(70);
  });

  it('omits categories with both totals at zero', () => {
    const bills = [
      mkBill('2026-04', [{ description: 'A', amount: 100, categoryId: 'c_food', date: '2026-04-15' }]),
    ];
    const rows = aggregateYoYByCategory(bills, '2026-05-12', catsById);
    expect(rows.find(r => r.categoryId === 'c_util')).toBeUndefined();
  });

  it('sorts by flow (income → expense → savings) then by currentYTD desc', () => {
    const bills = [
      mkBill('2026-04', [
        { description: 'P', amount: 5000, categoryId: 'c_pay',  date: '2026-04-15' },
        { description: 'F', amount:  300, categoryId: 'c_food', date: '2026-04-15' },
        { description: 'U', amount:  500, categoryId: 'c_util', date: '2026-04-15' },
        { description: 'R', amount:  260, categoryId: 'c_401k', date: '2026-04-15' },
      ]),
    ];
    const rows = aggregateYoYByCategory(bills, '2026-05-12', catsById);
    expect(rows.map(r => r.categoryId)).toEqual(['c_pay', 'c_util', 'c_food', 'c_401k']);
  });

  it('skips items with null/unknown categoryId', () => {
    const bills = [
      mkBill('2026-04', [
        { description: 'A', amount: 100, categoryId: 'c_food',    date: '2026-04-15' },
        { description: 'B', amount: 999, categoryId: null,         date: '2026-04-16' },
        { description: 'C', amount: 999, categoryId: 'c_missing',  date: '2026-04-17' },
      ]),
    ];
    const rows = aggregateYoYByCategory(bills, '2026-05-12', catsById);
    expect(rows.length).toBe(1);
    expect(rows[0].currentYTD).toBe(100);
  });

  it('returns [] for empty bills array', () => {
    expect(aggregateYoYByCategory([], '2026-05-12', catsById)).toEqual([]);
  });
});

describe('aggregateMonthByCategory', () => {
  it('returns exactly 12 buckets matching the 12-month window ending at endMonth', () => {
    const buckets = aggregateMonthByCategory([], '2026-05', 'c_food');
    expect(buckets.length).toBe(12);
    expect(buckets[0].month).toBe('2025-06');
    expect(buckets[11].month).toBe('2026-05');
  });

  it('all months zero when category has no items', () => {
    const bills = [mkBill('2026-04', [{ description: 'A', amount: 100, categoryId: 'c_util', date: '2026-04-15' }])];
    const buckets = aggregateMonthByCategory(bills, '2026-05', 'c_food');
    expect(buckets.every(b => b.total === 0)).toBe(true);
  });

  it('sums amounts in the matching month', () => {
    const bills = [
      mkBill('2026-03', [
        { description: 'A', amount: 100, categoryId: 'c_food', date: '2026-03-15' },
        { description: 'B', amount:  50, categoryId: 'c_food', date: '2026-03-20' },
      ]),
      mkBill('2026-04', [{ description: 'C', amount: 80, categoryId: 'c_food', date: '2026-04-15' }]),
    ];
    const buckets = aggregateMonthByCategory(bills, '2026-05', 'c_food');
    expect(buckets.find(b => b.month === '2026-03').total).toBe(150);
    expect(buckets.find(b => b.month === '2026-04').total).toBe(80);
    expect(buckets.find(b => b.month === '2026-05').total).toBe(0);
  });

  it('refunds (negative amounts) subtract within their month', () => {
    const bills = [mkBill('2026-04', [
      { description: 'A', amount: 100, categoryId: 'c_food', date: '2026-04-10' },
      { description: 'R', amount: -30, categoryId: 'c_food', date: '2026-04-20' },
    ])];
    const buckets = aggregateMonthByCategory(bills, '2026-05', 'c_food');
    expect(buckets.find(b => b.month === '2026-04').total).toBe(70);
  });

  it('items in the same month from multiple bills sum together', () => {
    const bills = [
      { id: 'b1', vendor: 'A', month: '2026-04', items: [{ id: 'i1', description: 'X', amount: 50, categoryId: 'c_food', date: '2026-04-10' }] },
      { id: 'b2', vendor: 'B', month: '2026-04', items: [{ id: 'i2', description: 'Y', amount: 60, categoryId: 'c_food', date: '2026-04-20' }] },
    ];
    const buckets = aggregateMonthByCategory(bills, '2026-05', 'c_food');
    expect(buckets.find(b => b.month === '2026-04').total).toBe(110);
  });

  it('ignores months outside the 12-month window', () => {
    const bills = [
      mkBill('2024-05', [{ description: 'A', amount: 999, categoryId: 'c_food', date: '2024-05-10' }]),
      mkBill('2026-04', [{ description: 'B', amount: 100, categoryId: 'c_food', date: '2026-04-10' }]),
    ];
    const buckets = aggregateMonthByCategory(bills, '2026-05', 'c_food');
    expect(buckets.find(b => b.month === '2026-04').total).toBe(100);
    expect(buckets.find(b => b.month === '2024-05')).toBeUndefined();
  });
});
