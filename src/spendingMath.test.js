import { describe, it, expect } from 'vitest';
import { migrateBills, getItemDate, getVendorColor, VENDOR_PALETTE, getMonthWindow, aggregateByMonth, aggregateByDay } from './spendingMath.js';

describe('migrateBills', () => {
  it('converts bill.date YYYY-MM-DD to bill.month YYYY-MM', () => {
    const input = [{ id: '1', vendor: 'Chase', date: '2026-05-09', items: [] }];
    const result = migrateBills(input);
    expect(result[0].month).toBe('2026-05');
    expect(result[0].date).toBeUndefined();
  });

  it('leaves bills that already have month untouched', () => {
    const input = [{ id: '1', vendor: 'Chase', month: '2026-05', items: [] }];
    const result = migrateBills(input);
    expect(result[0].month).toBe('2026-05');
    expect(result[0].date).toBeUndefined();
  });

  it('falls back to current month when date is invalid', () => {
    const input = [{ id: '1', vendor: 'Chase', date: 'not-a-date', items: [] }];
    const result = migrateBills(input);
    expect(result[0].month).toMatch(/^\d{4}-\d{2}$/);
  });

  it('falls back to current month when neither date nor month is present', () => {
    const input = [{ id: '1', vendor: 'Chase', items: [] }];
    const result = migrateBills(input);
    expect(result[0].month).toMatch(/^\d{4}-\d{2}$/);
  });

  it('preserves vendor, items, and id', () => {
    const input = [{
      id: '1', vendor: 'Chase', date: '2026-05-09',
      items: [{ id: 'a', description: 'Coffee', amount: 4.5, category: 'Dining' }],
    }];
    const result = migrateBills(input);
    expect(result[0].id).toBe('1');
    expect(result[0].vendor).toBe('Chase');
    expect(result[0].items).toHaveLength(1);
  });

  it('does not mutate input', () => {
    const input = [{ id: '1', vendor: 'Chase', date: '2026-05-09', items: [] }];
    const snapshot = JSON.parse(JSON.stringify(input));
    migrateBills(input);
    expect(input).toEqual(snapshot);
  });
});

describe('getItemDate', () => {
  it('returns item.date when it is a valid YYYY-MM-DD', () => {
    const bill = { month: '2026-05' };
    const item = { date: '2026-05-15' };
    expect(getItemDate(bill, item)).toBe('2026-05-15');
  });

  it('falls back to bill.month + "-01" when item.date is missing', () => {
    const bill = { month: '2026-05' };
    const item = { description: 'Coffee', amount: 4.5 };
    expect(getItemDate(bill, item)).toBe('2026-05-01');
  });

  it('falls back when item.date is null', () => {
    const bill = { month: '2026-05' };
    const item = { date: null };
    expect(getItemDate(bill, item)).toBe('2026-05-01');
  });

  it('falls back when item.date is malformed', () => {
    const bill = { month: '2026-05' };
    const item = { date: 'May 9' };
    expect(getItemDate(bill, item)).toBe('2026-05-01');
  });

  it('honors item dates outside bill month (cycles can span months)', () => {
    const bill = { month: '2026-05' };
    const item = { date: '2026-04-28' };
    expect(getItemDate(bill, item)).toBe('2026-04-28');
  });
});

describe('getVendorColor', () => {
  it('returns the same color for the same vendor across calls', () => {
    expect(getVendorColor('Chase Sapphire')).toBe(getVendorColor('Chase Sapphire'));
  });

  it('returns a color from the palette', () => {
    expect(VENDOR_PALETTE).toContain(getVendorColor('Chase Sapphire'));
  });

  it('returns the same color for case-equivalent names (case-insensitive)', () => {
    expect(getVendorColor('chase')).toBe(getVendorColor('CHASE'));
  });

  it('returns the same color for names differing only in surrounding whitespace', () => {
    expect(getVendorColor('  Amex  ')).toBe(getVendorColor('Amex'));
  });

  it('returns a fallback color for null/empty vendor', () => {
    expect(VENDOR_PALETTE).toContain(getVendorColor(null));
    expect(VENDOR_PALETTE).toContain(getVendorColor(''));
  });
});

describe('getMonthWindow', () => {
  it('returns 12 months ending with the given month', () => {
    const window = getMonthWindow('2026-05');
    expect(window).toHaveLength(12);
    expect(window[11]).toBe('2026-05');
    expect(window[0]).toBe('2025-06');
  });

  it('handles year boundaries', () => {
    const window = getMonthWindow('2026-02');
    expect(window[11]).toBe('2026-02');
    expect(window[0]).toBe('2025-03');
  });

  it('returns months in chronological order', () => {
    const window = getMonthWindow('2026-05');
    for (let i = 1; i < window.length; i++) {
      expect(window[i] > window[i - 1]).toBe(true);
    }
  });
});

describe('aggregateByMonth', () => {
  const bills = [
    {
      id: 'b1', vendor: 'Chase', month: '2026-05',
      items: [
        { description: 'Coffee', amount: 5, date: '2026-05-03' },
        { description: 'Lunch',  amount: 12, date: '2026-05-15' },
      ],
    },
    {
      id: 'b2', vendor: 'Amex', month: '2026-05',
      items: [
        { description: 'Books', amount: 30, date: '2026-05-20' },
      ],
    },
    {
      id: 'b3', vendor: 'Chase', month: '2026-04',
      items: [
        { description: 'Groceries', amount: 80, date: '2026-04-10' },
      ],
    },
  ];

  it('returns one entry per month in the window with totals and per-vendor breakdown', () => {
    const result = aggregateByMonth(bills, '2026-05');
    expect(result).toHaveLength(12);
    const may = result.find(m => m.month === '2026-05');
    expect(may.total).toBe(47);
    expect(may.byVendor.Chase).toBe(17);
    expect(may.byVendor.Amex).toBe(30);
    const apr = result.find(m => m.month === '2026-04');
    expect(apr.total).toBe(80);
    expect(apr.byVendor.Chase).toBe(80);
  });

  it('returns zero totals for months with no spending', () => {
    const result = aggregateByMonth(bills, '2026-05');
    const jan = result.find(m => m.month === '2026-01');
    expect(jan.total).toBe(0);
    expect(jan.byVendor).toEqual({});
  });

  it('respects vendor filter (single vendor)', () => {
    const result = aggregateByMonth(bills, '2026-05', 'Chase');
    const may = result.find(m => m.month === '2026-05');
    expect(may.total).toBe(17);
    expect(may.byVendor).toEqual({ Chase: 17 });
  });

  it('aggregates items by their own date, not bill month', () => {
    const cross = [{
      id: 'b1', vendor: 'Chase', month: '2026-05',
      items: [{ description: 'Late Apr', amount: 10, date: '2026-04-29' }],
    }];
    const result = aggregateByMonth(cross, '2026-05');
    expect(result.find(m => m.month === '2026-04').total).toBe(10);
    expect(result.find(m => m.month === '2026-05').total).toBe(0);
  });

  it('uses bill-month fallback for items without dates', () => {
    const noDates = [{
      id: 'b1', vendor: 'Chase', month: '2026-05',
      items: [{ description: 'X', amount: 7 }],
    }];
    const result = aggregateByMonth(noDates, '2026-05');
    expect(result.find(m => m.month === '2026-05').total).toBe(7);
  });

  it('excludes items outside the 12-month window', () => {
    const old = [{
      id: 'b1', vendor: 'Chase', month: '2024-01',
      items: [{ description: 'Old', amount: 999, date: '2024-01-15' }],
    }];
    const result = aggregateByMonth(old, '2026-05');
    expect(result.every(m => m.total === 0)).toBe(true);
  });
});

describe('aggregateByDay', () => {
  const bills = [
    {
      id: 'b1', vendor: 'Chase', month: '2026-05',
      items: [
        { description: 'Coffee', amount: 5, date: '2026-05-03' },
        { description: 'Coffee', amount: 4, date: '2026-05-03' },
        { description: 'Lunch',  amount: 12, date: '2026-05-15' },
      ],
    },
  ];

  it('returns one entry per day in the month (28-31 entries)', () => {
    const result = aggregateByDay(bills, '2026-05');
    expect(result).toHaveLength(31); // May has 31 days
    expect(result[0].day).toBe(1);
    expect(result[30].day).toBe(31);
  });

  it('returns 28 entries for non-leap February', () => {
    const result = aggregateByDay([], '2025-02');
    expect(result).toHaveLength(28);
  });

  it('returns 29 entries for leap February', () => {
    const result = aggregateByDay([], '2024-02');
    expect(result).toHaveLength(29);
  });

  it('sums multiple items on the same day', () => {
    const result = aggregateByDay(bills, '2026-05');
    expect(result[2].total).toBe(9); // day 3
  });

  it('includes per-vendor breakdown', () => {
    const result = aggregateByDay(bills, '2026-05');
    expect(result[2].byVendor.Chase).toBe(9);
  });

  it('respects vendor filter', () => {
    const more = [
      ...bills,
      {
        id: 'b2', vendor: 'Amex', month: '2026-05',
        items: [{ description: 'X', amount: 50, date: '2026-05-15' }],
      },
    ];
    const result = aggregateByDay(more, '2026-05', 'Chase');
    expect(result[14].total).toBe(12); // day 15, only Chase
  });

  it('ignores items outside the target month', () => {
    const cross = [{
      id: 'b1', vendor: 'Chase', month: '2026-05',
      items: [{ description: 'X', amount: 999, date: '2026-04-30' }],
    }];
    const result = aggregateByDay(cross, '2026-05');
    expect(result.every(d => d.total === 0)).toBe(true);
  });
});
