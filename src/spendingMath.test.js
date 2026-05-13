import { describe, it, expect } from 'vitest';
import { migrateBills, getItemDate, getVendorColor, VENDOR_PALETTE, getMonthWindow, aggregateByMonth, aggregateByDay, findRecurringCharges, aggregateByKeyword, getMonthItems, migrateToV3, getBillNet } from './spendingMath.js';
import { computeCatchUp } from './spendingMath.js';
import { findAutoRecurringChains } from './spendingMath.js';

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
    const result = aggregateByMonth(bills, '2026-05', new Map());
    expect(result).toHaveLength(12);
    const may = result.find(m => m.month === '2026-05');
    expect(may.spent).toBe(47);
    expect(may.byVendor.Chase).toBe(17);
    expect(may.byVendor.Amex).toBe(30);
    const apr = result.find(m => m.month === '2026-04');
    expect(apr.spent).toBe(80);
    expect(apr.byVendor.Chase).toBe(80);
  });

  it('returns zero totals for months with no spending', () => {
    const result = aggregateByMonth(bills, '2026-05', new Map());
    const jan = result.find(m => m.month === '2026-01');
    expect(jan.spent).toBe(0);
    expect(jan.byVendor).toEqual({});
  });

  it('respects vendor filter (single vendor)', () => {
    const result = aggregateByMonth(bills, '2026-05', new Map(), 'Chase');
    const may = result.find(m => m.month === '2026-05');
    expect(may.spent).toBe(17);
    expect(may.byVendor).toEqual({ Chase: 17 });
  });

  it('aggregates items by their own date, not bill month', () => {
    const cross = [{
      id: 'b1', vendor: 'Chase', month: '2026-05',
      items: [{ description: 'Late Apr', amount: 10, date: '2026-04-29' }],
    }];
    const result = aggregateByMonth(cross, '2026-05', new Map());
    expect(result.find(m => m.month === '2026-04').spent).toBe(10);
    expect(result.find(m => m.month === '2026-05').spent).toBe(0);
  });

  it('uses bill-month fallback for items without dates', () => {
    const noDates = [{
      id: 'b1', vendor: 'Chase', month: '2026-05',
      items: [{ description: 'X', amount: 7 }],
    }];
    const result = aggregateByMonth(noDates, '2026-05', new Map());
    expect(result.find(m => m.month === '2026-05').spent).toBe(7);
  });

  it('excludes items outside the 12-month window', () => {
    const old = [{
      id: 'b1', vendor: 'Chase', month: '2024-01',
      items: [{ description: 'Old', amount: 999, date: '2024-01-15' }],
    }];
    const result = aggregateByMonth(old, '2026-05', new Map());
    expect(result.every(m => m.spent === 0)).toBe(true);
  });
});

describe('aggregateByMonth (flow-aware)', () => {
  const catsById = new Map([
    ['c_paycheck',  { id: 'c_paycheck',  flow: 'income'  }],
    ['c_groceries', { id: 'c_groceries', flow: 'expense' }],
    ['c_401k',      { id: 'c_401k',      flow: 'savings' }],
  ]);

  it('returns separate income/spent/saved per month bucket', () => {
    const bills = [
      { id: 'b1', vendor: 'Acme',  month: '2026-05', items: [
        { id: 'i1', amount: 5200, categoryId: 'c_paycheck' },
        { id: 'i2', amount:  260, categoryId: 'c_401k'     },
      ]},
      { id: 'b2', vendor: 'Chase', month: '2026-05', items: [
        { id: 'i3', amount:   84, categoryId: 'c_groceries' },
        { id: 'i4', amount:  -40, categoryId: 'c_groceries' }, // refund
      ]},
    ];
    const out = aggregateByMonth(bills, '2026-05', catsById);
    const may = out.find(b => b.month === '2026-05');
    expect(may.income).toBe(5200);
    expect(may.spent).toBe(44);  // 84 - 40
    expect(may.saved).toBe(260);
  });

  it('byVendor only accumulates expense-flow items', () => {
    const bills = [
      { id: 'b1', vendor: 'Acme', month: '2026-05', items: [
        { id: 'i1', amount: 5200, categoryId: 'c_paycheck'  },
        { id: 'i2', amount:   84, categoryId: 'c_groceries' },
      ]},
    ];
    const out = aggregateByMonth(bills, '2026-05', catsById);
    const may = out.find(b => b.month === '2026-05');
    expect(may.byVendor).toEqual({ Acme: 84 });
  });

  it('vendorFilter still works for expense breakdowns', () => {
    const bills = [
      { id: 'b1', vendor: 'Chase',  month: '2026-05', items: [{ id: 'i1', amount: 50, categoryId: 'c_groceries' }] },
      { id: 'b2', vendor: 'Capital', month: '2026-05', items: [{ id: 'i2', amount: 30, categoryId: 'c_groceries' }] },
    ];
    const out = aggregateByMonth(bills, '2026-05', catsById, 'Chase');
    const may = out.find(b => b.month === '2026-05');
    expect(may.spent).toBe(50);
    expect(may.byVendor).toEqual({ Chase: 50 });
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
    expect(result[2].spent).toBe(9); // day 3
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
    const result = aggregateByDay(more, '2026-05', new Map(), 'Chase');
    expect(result[14].spent).toBe(12); // day 15, only Chase
  });

  it('ignores items outside the target month', () => {
    const cross = [{
      id: 'b1', vendor: 'Chase', month: '2026-05',
      items: [{ description: 'X', amount: 999, date: '2026-04-30' }],
    }];
    const result = aggregateByDay(cross, '2026-05');
    expect(result.every(d => d.spent === 0)).toBe(true);
  });
});

describe('aggregateByDay (expense-only)', () => {
  const catsById = new Map([
    ['c_paycheck',  { id: 'c_paycheck',  flow: 'income'  }],
    ['c_groceries', { id: 'c_groceries', flow: 'expense' }],
  ]);

  it('sums spent (expense-flow only), ignoring income and savings', () => {
    const bills = [
      { id: 'b1', vendor: 'Acme',  month: '2026-05', items: [
        { id: 'i1', amount: 5200, categoryId: 'c_paycheck',  date: '2026-05-15' },
      ]},
      { id: 'b2', vendor: 'Chase', month: '2026-05', items: [
        { id: 'i2', amount: 84,   categoryId: 'c_groceries', date: '2026-05-15' },
      ]},
    ];
    const out = aggregateByDay(bills, '2026-05', catsById);
    const d15 = out[14];
    expect(d15.day).toBe(15);
    expect(d15.spent).toBe(84);
    expect(d15.byVendor).toEqual({ Chase: 84 });
  });
});

describe('findRecurringCharges', () => {
  const subscription = (month, day, amount = 15.99, description = 'NETFLIX', vendor = 'Chase') => ({
    id: `${month}-${description}`, vendor, month,
    items: [{ id: `${month}-${description}`, description, amount, date: `${month}-${String(day).padStart(2, '0')}`, categoryId: 'c_subs' }],
  });

  it('detects a charge that recurs across 3 distinct months', () => {
    const bills = [
      subscription('2026-03', 5),
      subscription('2026-04', 5),
      subscription('2026-05', 5),
    ];
    const result = findRecurringCharges(bills, '2026-05');
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('NETFLIX');
    expect(result[0].monthCount).toBe(3);
  });

  it('ignores items that appear in only one month', () => {
    const bills = [
      { id: '1', vendor: 'Chase', month: '2026-05', items: [
        { description: 'COFFEE', amount: 5, date: '2026-05-01', categoryId: 'c_dining' },
        { description: 'COFFEE', amount: 5, date: '2026-05-15', categoryId: 'c_dining' },
      ]},
    ];
    expect(findRecurringCharges(bills, '2026-05')).toEqual([]);
  });

  it('reports the average amount across occurrences', () => {
    const bills = [
      subscription('2026-04', 5, 9.99),
      subscription('2026-05', 5, 10.99),
    ];
    const [r] = findRecurringCharges(bills, '2026-05');
    expect(r.avgAmount).toBeCloseTo(10.49, 2);
  });

  it('rejects charges with scattered days AND varying amounts', () => {
    const bills = [
      { id: '1', vendor: 'Chase', month: '2026-04', items: [
        { description: 'GROCERIES', amount: 50, date: '2026-04-03', categoryId: 'c_groceries' },
      ]},
      { id: '2', vendor: 'Chase', month: '2026-05', items: [
        { description: 'GROCERIES', amount: 120, date: '2026-05-22', categoryId: 'c_groceries' },
      ]},
    ];
    expect(findRecurringCharges(bills, '2026-05')).toEqual([]);
  });

  it('detects recurring charges with consistent day even when amount varies (e.g. donations)', () => {
    const bills = [
      { id: '1', vendor: 'Chase', month: '2026-03', items: [
        { description: 'CHURCH OFFERING', amount: 450, date: '2026-03-01', categoryId: 'c_donations' },
      ]},
      { id: '2', vendor: 'Chase', month: '2026-04', items: [
        { description: 'CHURCH OFFERING', amount: 620, date: '2026-04-02', categoryId: 'c_donations' },
      ]},
      { id: '3', vendor: 'Chase', month: '2026-05', items: [
        { description: 'CHURCH OFFERING', amount: 525, date: '2026-05-01', categoryId: 'c_donations' },
      ]},
    ];
    const result = findRecurringCharges(bills, '2026-05');
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('CHURCH OFFERING');
  });

  it('returns lastAmount as the amount of the most recent occurrence', () => {
    const bills = [
      { id: '1', vendor: 'Chase', month: '2026-04', items: [
        { description: 'CHURCH', amount: 400, date: '2026-04-01', categoryId: 'c_donations' },
      ]},
      { id: '2', vendor: 'Chase', month: '2026-05', items: [
        { description: 'CHURCH', amount: 600, date: '2026-05-01', categoryId: 'c_donations' },
      ]},
    ];
    const [r] = findRecurringCharges(bills, '2026-05');
    expect(r.lastAmount).toBe(600);
  });

  it('flags varies=true when amounts differ by more than 15%', () => {
    const bills = [
      { id: '1', vendor: 'Chase', month: '2026-04', items: [
        { description: 'CHURCH', amount: 400, date: '2026-04-01', categoryId: 'c_donations' },
      ]},
      { id: '2', vendor: 'Chase', month: '2026-05', items: [
        { description: 'CHURCH', amount: 600, date: '2026-05-01', categoryId: 'c_donations' },
      ]},
    ];
    const [r] = findRecurringCharges(bills, '2026-05');
    expect(r.varies).toBe(true);
  });

  it('flags varies=false when amounts are within 15%', () => {
    const bills = [
      subscription('2026-04', 5, 15.99),
      subscription('2026-05', 5, 15.99),
    ];
    const [r] = findRecurringCharges(bills, '2026-05');
    expect(r.varies).toBe(false);
  });

  it('marks active when last seen in selected month', () => {
    const bills = [
      subscription('2026-04', 5),
      subscription('2026-05', 5),
    ];
    const [r] = findRecurringCharges(bills, '2026-05');
    expect(r.active).toBe(true);
  });

  it('marks active when last seen one month before today', () => {
    const bills = [
      subscription('2026-03', 5),
      subscription('2026-04', 5),
    ];
    const [r] = findRecurringCharges(bills, '2026-05');
    expect(r.active).toBe(true);
  });

  it('marks inactive when last seen more than one month ago', () => {
    const bills = [
      subscription('2026-01', 5),
      subscription('2026-02', 5),
    ];
    const [r] = findRecurringCharges(bills, '2026-05');
    expect(r.active).toBe(false);
  });

  it('treats descriptions as case-insensitive', () => {
    const bills = [
      { id: '1', vendor: 'Chase', month: '2026-04', items: [
        { description: 'netflix', amount: 15.99, date: '2026-04-05', categoryId: 'c_subs' },
      ]},
      { id: '2', vendor: 'Chase', month: '2026-05', items: [
        { description: 'NETFLIX', amount: 15.99, date: '2026-05-05', categoryId: 'c_subs' },
      ]},
    ];
    const result = findRecurringCharges(bills, '2026-05');
    expect(result).toHaveLength(1);
    expect(result[0].monthCount).toBe(2);
  });

  it('sorts active charges before inactive ones', () => {
    const bills = [
      subscription('2026-01', 5, 5, 'OLDSUB'),
      subscription('2026-02', 5, 5, 'OLDSUB'),
      subscription('2026-04', 5, 10, 'NEWSUB'),
      subscription('2026-05', 5, 10, 'NEWSUB'),
    ];
    const result = findRecurringCharges(bills, '2026-05');
    expect(result[0].description).toBe('NEWSUB');
    expect(result[1].description).toBe('OLDSUB');
  });

  it('returns lastDate as the most recent transaction date', () => {
    const bills = [
      subscription('2026-04', 5),
      subscription('2026-05', 12),
    ];
    const [r] = findRecurringCharges(bills, '2026-05');
    expect(r.lastDate).toBe('2026-05-12');
  });

  it('reports the vendor most commonly associated with the charge', () => {
    const bills = [
      subscription('2026-03', 5, 15.99, 'NETFLIX', 'Chase'),
      subscription('2026-04', 5, 15.99, 'NETFLIX', 'Chase'),
      subscription('2026-05', 5, 15.99, 'NETFLIX', 'Amex'),
    ];
    const [r] = findRecurringCharges(bills, '2026-05');
    expect(r.vendor).toBe('Chase');
  });
});

describe('aggregateByKeyword', () => {
  const billWithItems = (month, items) => ({
    id: month, vendor: 'Chase', month,
    items: items.map((it, i) => ({ id: `${month}-${i}`, ...it })),
  });

  it('returns null/empty summary when keyword is blank', () => {
    const bills = [billWithItems('2026-05', [{ description: 'X', amount: 1, date: '2026-05-01', categoryId: 'c_other' }])];
    expect(aggregateByKeyword(bills, '')).toEqual({ total: 0, byMonth: {}, lastDate: null, categoryId: null, flow: 'expense', occurrences: 0 });
  });

  it('matches items by case-insensitive substring on description', () => {
    const bills = [
      billWithItems('2026-04', [
        { description: 'Church of Saint Mary', amount: 400, date: '2026-04-01', categoryId: 'c_donations' },
      ]),
      billWithItems('2026-05', [
        { description: 'CHURCH', amount: 600, date: '2026-05-01', categoryId: 'c_donations' },
        { description: 'BURGER KING', amount: 12, date: '2026-05-04', categoryId: 'c_dining' },
      ]),
    ];
    const result = aggregateByKeyword(bills, 'church');
    expect(result.total).toBe(1000);
    expect(result.occurrences).toBe(2);
  });

  it('breaks down totals by month', () => {
    const bills = [
      billWithItems('2026-04', [{ description: 'McDonald', amount: 8, date: '2026-04-03', categoryId: 'c_dining' }]),
      billWithItems('2026-05', [
        { description: 'McDonalds Drive Thru', amount: 12, date: '2026-05-02', categoryId: 'c_dining' },
        { description: 'McDONALD\'S', amount: 9, date: '2026-05-15', categoryId: 'c_dining' },
      ]),
    ];
    const result = aggregateByKeyword(bills, 'mcdonald');
    expect(result.byMonth['2026-04']).toBe(8);
    expect(result.byMonth['2026-05']).toBe(21);
  });

  it('returns the last (most recent) matching date', () => {
    const bills = [
      billWithItems('2026-03', [{ description: 'CHURCH', amount: 400, date: '2026-03-01', categoryId: 'c_donations' }]),
      billWithItems('2026-05', [{ description: 'CHURCH', amount: 600, date: '2026-05-15', categoryId: 'c_donations' }]),
    ];
    expect(aggregateByKeyword(bills, 'CHURCH').lastDate).toBe('2026-05-15');
  });

  it('returns the most common category among matching items', () => {
    const bills = [
      billWithItems('2026-04', [{ description: 'AMAZON', amount: 30, date: '2026-04-01', categoryId: 'c_shopping' }]),
      billWithItems('2026-05', [
        { description: 'AMAZON', amount: 12, date: '2026-05-01', categoryId: 'c_shopping' },
        { description: 'AMAZON PRIME', amount: 14.99, date: '2026-05-05', categoryId: 'c_subs' },
      ]),
    ];
    expect(aggregateByKeyword(bills, 'AMAZON').categoryId).toBe('c_shopping');
  });

  it('ignores items with zero amounts but sums negative amounts (refunds)', () => {
    const bills = [
      billWithItems('2026-05', [
        { description: 'CHURCH', amount: 600, date: '2026-05-01', category: 'Donations' },
        { description: 'CHURCH REFUND', amount: -50, date: '2026-05-15', category: 'Donations' },
        { description: 'CHURCH NOOP', amount: 0, date: '2026-05-20', category: 'Donations' },
      ]),
    ];
    expect(aggregateByKeyword(bills, 'CHURCH').total).toBe(550);
  });
});

describe('getMonthItems', () => {
  it('attributes items to their item.date month, not the bill.month', () => {
    const bills = [
      { id: '1', vendor: 'AmEx', month: '2026-03', items: [
        { id: 'a', description: 'Coffee', amount: 5, category: 'Dining', date: '2026-02-28' },
        { id: 'b', description: 'Gas', amount: 40, category: 'Transportation', date: '2026-03-02' },
      ]},
    ];
    const febItems = getMonthItems(bills, '2026-02');
    const marItems = getMonthItems(bills, '2026-03');
    expect(febItems.map(i => i.id)).toEqual(['a']);
    expect(marItems.map(i => i.id)).toEqual(['b']);
  });

  it('falls back to bill.month when item.date is missing', () => {
    const bills = [
      { id: '1', vendor: 'AmEx', month: '2026-03', items: [
        { id: 'a', description: 'X', amount: 10, category: 'Other' },
      ]},
    ];
    expect(getMonthItems(bills, '2026-03').map(i => i.id)).toEqual(['a']);
    expect(getMonthItems(bills, '2026-02')).toEqual([]);
  });

  it('returns [] for empty bills array', () => {
    expect(getMonthItems([], '2026-03')).toEqual([]);
  });

  it('returns [] for null/undefined bills', () => {
    expect(getMonthItems(null, '2026-03')).toEqual([]);
    expect(getMonthItems(undefined, '2026-03')).toEqual([]);
  });

  it('handles bills with missing items array', () => {
    const bills = [{ id: '1', vendor: 'AmEx', month: '2026-03' }];
    expect(getMonthItems(bills, '2026-03')).toEqual([]);
  });

  it('skips null items without crashing', () => {
    const bills = [
      { id: '1', vendor: 'AmEx', month: '2026-03', items: [
        null,
        { id: 'b', description: 'Y', amount: 7, category: 'Other', date: '2026-03-15' },
      ]},
    ];
    expect(getMonthItems(bills, '2026-03').map(i => i.id)).toEqual(['b']);
  });
});

describe('findRecurringCharges (post-categoryId)', () => {
  it('groups recurring items and reports categoryId', () => {
    const bills = [
      { id: 'b1', vendor: 'Netflix', month: '2026-02', items: [
        { id: 'i1', description: 'Netflix', amount: 15, categoryId: 'c_subs', date: '2026-02-10' },
      ]},
      { id: 'b2', vendor: 'Netflix', month: '2026-03', items: [
        { id: 'i2', description: 'Netflix', amount: 15, categoryId: 'c_subs', date: '2026-03-10' },
      ]},
      { id: 'b3', vendor: 'Netflix', month: '2026-04', items: [
        { id: 'i3', description: 'Netflix', amount: 15, categoryId: 'c_subs', date: '2026-04-10' },
      ]},
    ];
    const out = findRecurringCharges(bills, '2026-05');
    expect(out).toHaveLength(1);
    expect(out[0].categoryId).toBe('c_subs');
  });
});

describe('findRecurringCharges (flow-aware)', () => {
  const catsById = new Map([
    ['c_paycheck',  { id: 'c_paycheck',  flow: 'income'  }],
    ['c_groceries', { id: 'c_groceries', flow: 'expense' }],
    ['c_401k',      { id: 'c_401k',      flow: 'savings' }],
  ]);

  it('annotates each recurring result with flow from majority category', () => {
    const bills = [
      { id: 'b1', vendor: 'Acme', month: '2026-04', items: [
        { id: 'i1', description: 'Bi-weekly paycheck', amount: 2600, categoryId: 'c_paycheck', date: '2026-04-15' },
      ]},
      { id: 'b2', vendor: 'Acme', month: '2026-04', items: [
        { id: 'i2', description: 'Bi-weekly paycheck', amount: 2600, categoryId: 'c_paycheck', date: '2026-04-29' },
      ]},
      { id: 'b3', vendor: 'Acme', month: '2026-05', items: [
        { id: 'i3', description: 'Bi-weekly paycheck', amount: 2600, categoryId: 'c_paycheck', date: '2026-05-13' },
      ]},
    ];
    const results = findRecurringCharges(bills, '2026-05', catsById);
    const paycheck = results.find(r => r.description === 'Bi-weekly paycheck');
    expect(paycheck).toBeDefined();
    expect(paycheck.flow).toBe('income');
  });

  it('accepts negative-amount items but groups by description (refunds do not pollute)', () => {
    const bills = [
      { id: 'b1', vendor: 'Chase', month: '2026-04', items: [
        { id: 'i1', description: 'Netflix', amount:  15.99, categoryId: 'c_groceries', date: '2026-04-05' },
      ]},
      { id: 'b2', vendor: 'Chase', month: '2026-05', items: [
        { id: 'i2', description: 'Netflix', amount:  15.99, categoryId: 'c_groceries', date: '2026-05-05' },
      ]},
      { id: 'b3', vendor: 'Chase', month: '2026-05', items: [
        { id: 'i3', description: 'Whole Foods refund', amount: -40, categoryId: 'c_groceries', date: '2026-05-10' },
      ]},
    ];
    const results = findRecurringCharges(bills, '2026-05', catsById);
    expect(results.find(r => r.description === 'Netflix')).toBeDefined();
    expect(results.find(r => r.description === 'Whole Foods refund')).toBeUndefined();
  });
});

describe('aggregateByKeyword (post-categoryId)', () => {
  it('returns categoryId of the most-frequent matching item', () => {
    const bills = [
      { id: 'b1', vendor: 'V', month: '2026-04', items: [
        { id: 'i1', description: 'CHURCH OF X', amount: 50, categoryId: 'c_don', date: null },
        { id: 'i2', description: 'CHURCH OF Y', amount: 60, categoryId: 'c_don', date: null },
        { id: 'i3', description: 'CHURCH cafe', amount: 5, categoryId: 'c_dine', date: null },
      ]},
    ];
    const summary = aggregateByKeyword(bills, 'CHURCH');
    expect(summary.occurrences).toBe(3);
    expect(summary.categoryId).toBe('c_don');
  });
});

describe('aggregateByKeyword (sign-aware)', () => {
  const catsById = new Map([
    ['c_groceries', { id: 'c_groceries', flow: 'expense' }],
  ]);

  it('sums signed amounts (refunds reduce the total)', () => {
    const bills = [
      { id: 'b1', vendor: 'Chase', month: '2026-05', items: [
        { id: 'i1', description: 'Whole Foods',        amount:  84, categoryId: 'c_groceries', date: '2026-05-02' },
        { id: 'i2', description: 'Whole Foods refund', amount: -40, categoryId: 'c_groceries', date: '2026-05-12' },
      ]},
    ];
    const out = aggregateByKeyword(bills, 'WHOLE FOODS', catsById);
    expect(out.total).toBe(44);
    expect(out.occurrences).toBe(2);
  });

  it('returns flow from the majority category', () => {
    const bills = [
      { id: 'b1', vendor: 'Chase', month: '2026-05', items: [
        { id: 'i1', description: 'Whole Foods', amount: 84, categoryId: 'c_groceries', date: '2026-05-02' },
      ]},
    ];
    const out = aggregateByKeyword(bills, 'WHOLE FOODS', catsById);
    expect(out.flow).toBe('expense');
  });
});

import { shiftItemDate } from './spendingMath.js';

describe('shiftItemDate', () => {
  it('preserves day-of-month when target month has enough days', () => {
    expect(shiftItemDate('2026-05-15', '2026-06')).toBe('2026-06-15');
  });

  it('clamps Jan 31 → Feb 28 in a non-leap year', () => {
    expect(shiftItemDate('2026-01-31', '2026-02')).toBe('2026-02-28');
  });

  it('clamps Jan 31 → Feb 29 in a leap year', () => {
    expect(shiftItemDate('2024-01-31', '2024-02')).toBe('2024-02-29');
  });

  it('clamps Aug 31 → Sep 30', () => {
    expect(shiftItemDate('2026-08-31', '2026-09')).toBe('2026-09-30');
  });

  it('returns null for null / undefined / malformed input', () => {
    expect(shiftItemDate(null,        '2026-05')).toBeNull();
    expect(shiftItemDate(undefined,   '2026-05')).toBeNull();
    expect(shiftItemDate('not-a-date','2026-05')).toBeNull();
    expect(shiftItemDate('',          '2026-05')).toBeNull();
  });

  it('returns null for out-of-range months (13, 00)', () => {
    expect(shiftItemDate('2026-05-15', '2026-13')).toBeNull();
    expect(shiftItemDate('2026-05-15', '2026-00')).toBeNull();
  });

  it('same-month target is a no-op', () => {
    expect(shiftItemDate('2026-05-15', '2026-05')).toBe('2026-05-15');
  });

  it('works across year boundaries', () => {
    expect(shiftItemDate('2026-12-31', '2027-01')).toBe('2027-01-31');
    expect(shiftItemDate('2026-12-31', '2027-02')).toBe('2027-02-28');
  });
});

import { migrateToV2 } from './spendingMath.js';
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_NAME } from './categoriesDefaults.js';

describe('migrateToV2', () => {
  it('produces v2 categories with stable ids and seeded keywords', () => {
    const { categories } = migrateToV2([], null, DEFAULT_CATEGORIES);
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);
    for (const cat of categories) {
      expect(typeof cat.id).toBe('string');
      expect(cat.id.length).toBeGreaterThan(0);
    }
    const dining = categories.find(c => c.name === 'Dining');
    expect(dining.keywords).toContain('MCDONALD');
  });

  it('rewrites items: item.category string becomes item.categoryId', () => {
    const v1Bills = [
      { id: 'b1', vendor: 'V', month: '2026-04', items: [
        { id: 'i1', description: 'X', amount: 10, category: 'Utilities', date: null },
        { id: 'i2', description: 'Y', amount: 20, category: 'Dining',    date: '2026-04-15' },
      ]},
    ];
    const { bills, categories } = migrateToV2(v1Bills, null, DEFAULT_CATEGORIES);
    const utilId = categories.find(c => c.name === 'Utilities').id;
    const dineId = categories.find(c => c.name === 'Dining').id;

    expect(bills[0].items[0].categoryId).toBe(utilId);
    expect(bills[0].items[1].categoryId).toBe(dineId);
    // Old string field stripped:
    expect(bills[0].items[0].category).toBeUndefined();
    expect(bills[0].items[1].category).toBeUndefined();
    // Other item fields preserved:
    expect(bills[0].items[0].description).toBe('X');
    expect(bills[0].items[0].amount).toBe(10);
    expect(bills[0].items[1].date).toBe('2026-04-15');
  });

  it('maps unrecognized category strings to "Other"', () => {
    const v1Bills = [
      { id: 'b1', vendor: 'V', month: '2026-04', items: [
        { id: 'i1', description: 'X', amount: 10, category: 'NONEXISTENT', date: null },
      ]},
    ];
    const { bills, categories } = migrateToV2(v1Bills, null, DEFAULT_CATEGORIES);
    const otherId = categories.find(c => c.name === OTHER_CATEGORY_NAME).id;
    expect(bills[0].items[0].categoryId).toBe(otherId);
  });

  it('falls back to first category when "Other" is somehow missing from seed', () => {
    const seedNoOther = DEFAULT_CATEGORIES.filter(c => c.name !== OTHER_CATEGORY_NAME);
    const v1Bills = [{ id: 'b1', vendor: 'V', month: '2026-04', items: [
      { id: 'i1', description: 'X', amount: 10, category: 'NONEXISTENT', date: null },
    ]}];
    const { bills, categories } = migrateToV2(v1Bills, null, seedNoOther);
    expect(bills[0].items[0].categoryId).toBe(categories[0].id);
  });

  it('is idempotent when given v2 bills + existing categories', () => {
    // First pass: produces v2 bills + categories.
    const v1Bills = [{ id: 'b1', vendor: 'V', month: '2026-04', items: [
      { id: 'i1', description: 'X', amount: 10, category: 'Dining', date: null },
    ]}];
    const first = migrateToV2(v1Bills, null, DEFAULT_CATEGORIES);
    // Second pass: pass v2 bills back in WITH the categories from the first pass.
    const second = migrateToV2(first.bills, first.categories, DEFAULT_CATEGORIES);
    expect(second.bills).toEqual(first.bills);
    expect(second.categories).toEqual(first.categories);
  });

  it('preserves bill-level fields (vendor, month, id)', () => {
    const v1Bills = [{ id: 'b1', vendor: 'Acme', month: '2026-04', items: [
      { id: 'i1', description: 'X', amount: 10, category: 'Other', date: null },
    ]}];
    const { bills } = migrateToV2(v1Bills, null, DEFAULT_CATEGORIES);
    expect(bills[0].id).toBe('b1');
    expect(bills[0].vendor).toBe('Acme');
    expect(bills[0].month).toBe('2026-04');
  });

  it('returns empty bills + seed categories when input bills is null/undefined', () => {
    const a = migrateToV2(null, null, DEFAULT_CATEGORIES);
    expect(a.bills).toEqual([]);
    expect(a.categories).toHaveLength(DEFAULT_CATEGORIES.length);
  });
});

describe('migrateToV3', () => {
  const v2Cats = [
    { id: 'c_util',  name: 'Utilities', icon: '⚡',  color: '#F59E0B', keywords: ['COMED'],     templates: [], builtin: true },
    { id: 'c_food',  name: 'Groceries', icon: '🛒', color: '#10B981', keywords: ['WHOLE FOODS'], templates: [], builtin: true },
    { id: 'c_other', name: 'Other',     icon: '📋', color: '#6B7280', keywords: [],              templates: [], builtin: true },
  ];

  const seedV3 = [
    { name: 'Paycheck',     icon: '💼', color: '#6BD49A', flow: 'income',  keywords: ['PAYCHECK'], templates: [], builtin: true },
    { name: 'Other Income', icon: '📥', color: '#94A3B8', flow: 'income',  keywords: [],            templates: [], builtin: true },
    { name: '401(k)',       icon: '📊', color: '#5B8DFF', flow: 'savings', keywords: ['401K'],     templates: [], builtin: true },
  ];

  it('backfills flow="expense" on every existing v2 category', () => {
    const { categories } = migrateToV3([], v2Cats, seedV3);
    for (const c of v2Cats) {
      const out = categories.find(x => x.id === c.id);
      expect(out).toBeDefined();
      expect(out.flow).toBe('expense');
    }
  });

  it('preserves keywords, templates, name, icon, color, id on existing categories', () => {
    const { categories } = migrateToV3([], v2Cats, seedV3);
    const util = categories.find(c => c.id === 'c_util');
    expect(util).toMatchObject({
      id: 'c_util', name: 'Utilities', icon: '⚡', color: '#F59E0B',
      keywords: ['COMED'], templates: [], builtin: true, flow: 'expense',
    });
  });

  it('appends seed categories with fresh nanoid ids', () => {
    const { categories } = migrateToV3([], v2Cats, seedV3);
    const paycheck = categories.find(c => c.name === 'Paycheck');
    expect(paycheck).toBeDefined();
    expect(paycheck.flow).toBe('income');
    expect(typeof paycheck.id).toBe('string');
    expect(paycheck.id.length).toBeGreaterThan(0);
  });

  it('appends all seeds when categories is empty', () => {
    const { categories } = migrateToV3([], [], seedV3);
    expect(categories.map(c => c.name)).toEqual(['Paycheck', 'Other Income', '401(k)']);
  });

  it('does NOT duplicate a seed when a category with the same name already exists', () => {
    const withPaycheck = [
      ...v2Cats,
      { id: 'c_pay_user', name: 'Paycheck', icon: '💼', color: '#fff', keywords: ['CUSTOM'], templates: [], builtin: false },
    ];
    const { categories } = migrateToV3([], withPaycheck, seedV3);
    const paychecks = categories.filter(c => c.name === 'Paycheck');
    expect(paychecks).toHaveLength(1);
    expect(paychecks[0].id).toBe('c_pay_user');
    expect(paychecks[0].keywords).toEqual(['CUSTOM']);
    expect(paychecks[0].flow).toBe('expense');
  });

  it('idempotent: re-running on v3 output produces identical categories', () => {
    const first  = migrateToV3([], v2Cats, seedV3);
    const second = migrateToV3([], first.categories, seedV3);
    expect(second.categories).toEqual(first.categories);
  });

  it('passes bills through unchanged', () => {
    const bills = [
      { id: 'b1', vendor: 'V', month: '2026-04', items: [
        { id: 'i1', description: 'x', amount: 10, categoryId: 'c_food', date: null },
      ]},
    ];
    const { bills: outBills } = migrateToV3(bills, v2Cats, seedV3);
    expect(outBills).toEqual(bills);
  });
});

describe('getBillNet', () => {
  const categoriesById = new Map([
    ['c_paycheck',  { id: 'c_paycheck',  flow: 'income'  }],
    ['c_groceries', { id: 'c_groceries', flow: 'expense' }],
    ['c_tax',       { id: 'c_tax',       flow: 'expense' }],
    ['c_401k',      { id: 'c_401k',      flow: 'savings' }],
  ]);

  it('paycheck bill nets to deposit amount (income - expense - savings)', () => {
    const bill = {
      id: 'b1', vendor: 'Acme', month: '2026-05',
      items: [
        { id: 'i1', description: 'Gross',   amount: 5200, categoryId: 'c_paycheck' },
        { id: 'i2', description: 'Fed tax', amount:  687, categoryId: 'c_tax'      },
        { id: 'i3', description: '401(k)',  amount:  260, categoryId: 'c_401k'     },
      ],
    };
    const result = getBillNet(bill, categoriesById);
    expect(result.income).toBe(5200);
    expect(result.expense).toBe(687);
    expect(result.savings).toBe(260);
    expect(result.net).toBe(4253); // 5200 - 687 - 260
  });

  it('credit card bill with refund nets negative (outflow)', () => {
    const bill = {
      id: 'b2', vendor: 'Chase', month: '2026-05',
      items: [
        { id: 'i1', description: 'Whole Foods',        amount:  84, categoryId: 'c_groceries' },
        { id: 'i2', description: 'Whole Foods refund', amount: -40, categoryId: 'c_groceries' },
      ],
    };
    const result = getBillNet(bill, categoriesById);
    expect(result.income).toBe(0);
    expect(result.expense).toBe(44);
    expect(result.savings).toBe(0);
    expect(result.net).toBe(-44);
  });

  it('empty bill yields zeros', () => {
    const result = getBillNet({ items: [] }, categoriesById);
    expect(result).toEqual({ income: 0, expense: 0, savings: 0, net: 0 });
  });

  it('items with unknown categoryId are treated as expense (safe default)', () => {
    const bill = { items: [{ id: 'i1', amount: 10, categoryId: 'unknown' }] };
    const result = getBillNet(bill, categoriesById);
    expect(result.expense).toBe(10);
    expect(result.net).toBe(-10);
  });
});

function makeBill(over = {}) {
  return {
    id: over.id || 'bill_' + Math.random().toString(36).slice(2, 8),
    vendor: over.vendor ?? 'Honda Finance',
    month: over.month ?? '2026-04',
    items: over.items ?? [
      { id: 'it_' + Math.random().toString(36).slice(2, 8),
        description: 'Auto loan', amount: 452, categoryId: 'c_auto',
        date: `${over.month ?? '2026-04'}-15` },
    ],
    ...(over.recurring !== undefined ? { recurring: over.recurring } : {}),
    ...(over.recurringChainId !== undefined ? { recurringChainId: over.recurringChainId } : {}),
  };
}

describe('computeCatchUp', () => {
  it('no recurring chains → input unchanged, empty conflicts', () => {
    const bills = [
      makeBill({ id: 'b1', month: '2026-04', vendor: 'Honda' }),
      makeBill({ id: 'b2', month: '2026-05', vendor: 'Comed' }),
    ];
    const out = computeCatchUp(bills, '2026-07');
    expect(out.bills).toBe(bills);
    expect(out.conflicts).toEqual([]);
  });

  it('one chain, source April, today July, no other bills → three clean spawns', () => {
    const source = makeBill({
      id: 'b_apr', month: '2026-04', vendor: 'Honda',
      recurring: true, recurringChainId: 'rec_h',
      items: [{ id: 'it1', description: 'Auto loan', amount: 452, categoryId: 'c_auto', date: '2026-04-15' }],
    });
    const out = computeCatchUp([source], '2026-07');
    expect(out.conflicts).toEqual([]);
    const months = out.bills.map(b => b.month).sort();
    expect(months).toEqual(['2026-04', '2026-05', '2026-06', '2026-07']);
    const newBills = out.bills.filter(b => b.id !== 'b_apr');
    for (const nb of newBills) {
      expect(nb.recurring).toBe(true);
      expect(nb.recurringChainId).toBe('rec_h');
      expect(nb.vendor).toBe('Honda');
      expect(nb.id).not.toBe('b_apr');
      expect(nb.items[0].id).not.toBe('it1');  // fresh item id
      expect(nb.items[0].date).toBe(`${nb.month}-15`);  // date shifted
      expect(nb.items[0].amount).toBe(452);
    }
  });

  it('skips months already linked to the chain id', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: 'Honda', recurring: true,  recurringChainId: 'rec_h' });
    const may = makeBill({ id: 'b_may', month: '2026-05', vendor: 'Honda', recurring: true,  recurringChainId: 'rec_h' });
    const out = computeCatchUp([apr, may], '2026-05');
    expect(out.bills).toHaveLength(2);
    expect(out.conflicts).toEqual([]);
  });

  it('same-vendor non-chain bill → conflict queued, no spawn, stops further months for that chain', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: 'Honda', recurring: true, recurringChainId: 'rec_h' });
    const may = makeBill({ id: 'b_may_manual', month: '2026-05', vendor: 'Honda' });  // no chain id
    const out = computeCatchUp([apr, may], '2026-07');
    expect(out.bills).toHaveLength(2);  // no spawns
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0]).toEqual({
      chainId: 'rec_h',
      chainSourceBillId: 'b_apr',
      targetMonth: '2026-05',
      existingBillId: 'b_may_manual',
    });
  });

  it('two chains, one clean / one conflicted → clean fully materialized; conflicted queued', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: 'Honda',   recurring: true, recurringChainId: 'rec_h' });
    const mar = makeBill({ id: 'b_mar', month: '2026-03', vendor: 'Verizon', recurring: true, recurringChainId: 'rec_v' });
    const conflict = makeBill({ id: 'b_v_may', month: '2026-05', vendor: 'Verizon' });
    const out = computeCatchUp([apr, mar, conflict], '2026-05');
    const hondaMonths = out.bills.filter(b => b.recurringChainId === 'rec_h').map(b => b.month).sort();
    expect(hondaMonths).toEqual(['2026-04', '2026-05']);
    const verizonChain = out.bills.filter(b => b.recurringChainId === 'rec_v');
    expect(verizonChain).toHaveLength(2);  // mar + a clean April spawn (no conflict in April)
    const verizonMonths = verizonChain.map(b => b.month).sort();
    expect(verizonMonths).toEqual(['2026-03', '2026-04']);
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0].chainId).toBe('rec_v');
    expect(out.conflicts[0].targetMonth).toBe('2026-05');
  });

  it('source month equals today → no spawns', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: 'Honda', recurring: true, recurringChainId: 'rec_h' });
    const out = computeCatchUp([apr], '2026-04');
    expect(out.bills).toHaveLength(1);
    expect(out.conflicts).toEqual([]);
  });

  it('latest source has recurring=false (chain dormant) → ignored', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: 'Honda', recurring: true,  recurringChainId: 'rec_h' });
    const may = makeBill({ id: 'b_may', month: '2026-05', vendor: 'Honda', recurring: false, recurringChainId: 'rec_h' });
    const out = computeCatchUp([apr, may], '2026-07');
    expect(out.bills).toHaveLength(2);  // chain dormant since latest has recurring=false
    expect(out.conflicts).toEqual([]);
  });

  it('multiple recurring=true instances in chain → latest is used as source', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: 'Honda', recurring: true, recurringChainId: 'rec_h',
      items: [{ id: 'it1', description: 'Auto', amount: 452, categoryId: 'c_a', date: '2026-04-15' }] });
    const may = makeBill({ id: 'b_may', month: '2026-05', vendor: 'Honda', recurring: true, recurringChainId: 'rec_h',
      items: [{ id: 'it2', description: 'Auto', amount: 470, categoryId: 'c_a', date: '2026-05-15' }] });
    const out = computeCatchUp([apr, may], '2026-06');
    expect(out.bills).toHaveLength(3);
    const jun = out.bills.find(b => b.month === '2026-06');
    expect(jun.items[0].amount).toBe(470);  // inherited from May (latest), not April
  });

  it('idempotency: running twice on the same input is a no-op the second time', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: 'Honda', recurring: true, recurringChainId: 'rec_h' });
    const out1 = computeCatchUp([apr], '2026-06');
    const out2 = computeCatchUp(out1.bills, '2026-06');
    expect(out2.bills).toHaveLength(out1.bills.length);
    expect(out2.conflicts).toEqual([]);
  });

  it('backward clock (today < source.month) → no spawns', () => {
    const may = makeBill({ id: 'b_may', month: '2026-05', vendor: 'Honda', recurring: true, recurringChainId: 'rec_h' });
    const out = computeCatchUp([may], '2026-03');
    expect(out.bills).toHaveLength(1);
    expect(out.conflicts).toEqual([]);
  });

  it('empty-vendor source matches empty-vendor existing bill → conflict', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: '', recurring: true, recurringChainId: 'rec_h' });
    const may = makeBill({ id: 'b_other', month: '2026-05', vendor: '' });
    const out = computeCatchUp([apr, may], '2026-05');
    expect(out.conflicts).toHaveLength(1);
  });

  it('items in spawned bill get fresh ids', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: 'Honda', recurring: true, recurringChainId: 'rec_h',
      items: [
        { id: 'orig1', description: 'A', amount: 10, categoryId: 'c', date: '2026-04-05' },
        { id: 'orig2', description: 'B', amount: 20, categoryId: 'c', date: '2026-04-15' },
      ],
    });
    const out = computeCatchUp([apr], '2026-05');
    const may = out.bills.find(b => b.month === '2026-05');
    expect(may.items.map(i => i.id)).not.toContain('orig1');
    expect(may.items.map(i => i.id)).not.toContain('orig2');
    expect(may.items[0].date).toBe('2026-05-05');
    expect(may.items[1].date).toBe('2026-05-15');
  });

  it('source bill with no items field still spawns cleanly (items: [])', () => {
    const apr = {
      id: 'b_apr', vendor: 'Honda', month: '2026-04',
      recurring: true, recurringChainId: 'rec_h',
      // items field intentionally absent
    };
    const out = computeCatchUp([apr], '2026-05');
    expect(out.conflicts).toEqual([]);
    expect(out.bills).toHaveLength(2);
    const may = out.bills.find(b => b.month === '2026-05');
    expect(may.items).toEqual([]);
  });

  it('multi-month source: next catch-up target is after the source\'s latest month', () => {
    // Source spans Apr–May (recurring=true). Today is July. Expect spawns for June, July only.
    const source = makeBill({
      id: 'b_aprmay', month: '2026-04', vendor: 'Honda',
      recurring: true, recurringChainId: 'rec_h',
      items: [
        { id: 'it1', description: 'Auto loan', amount: 452, categoryId: 'c_auto', date: '2026-04-15' },
        { id: 'it2', description: 'Auto loan tail', amount: 0, categoryId: 'c_auto', date: '2026-05-03' },
      ],
    });
    const out = computeCatchUp([source], '2026-07');
    expect(out.conflicts).toEqual([]);
    const spawns = out.bills.filter(b => b.id !== 'b_aprmay');
    const months = spawns.map(b => b.month).sort();
    expect(months).toEqual(['2026-06', '2026-07']);
  });

  it('multi-month bill in the chain already covers a target month → no spawn for that month', () => {
    // Source bill spans Apr–May. Today July. June + July should still spawn; April and May are covered.
    const source = makeBill({
      id: 'b_aprmay', month: '2026-04', vendor: 'Honda',
      recurring: true, recurringChainId: 'rec_h',
      items: [
        { id: 'it1', amount: 452, description: 'Auto', categoryId: 'c_auto', date: '2026-04-15' },
        { id: 'it2', amount: 0,   description: 'tail', categoryId: 'c_auto', date: '2026-05-04' },
      ],
    });
    const out = computeCatchUp([source], '2026-07');
    const aprMay = out.bills.filter(b => b.recurringChainId === 'rec_h' && b.id === 'b_aprmay');
    expect(aprMay).toHaveLength(1);  // source unchanged
    const spawnMonths = out.bills
      .filter(b => b.recurringChainId === 'rec_h' && b.id !== 'b_aprmay')
      .map(b => b.month).sort();
    expect(spawnMonths).toEqual(['2026-06', '2026-07']);
  });

  it('conflict check considers spans: a same-vendor multi-month non-chain bill blocks catch-up', () => {
    // Chain source is April. Catch-up targets are May, June, July.
    // The stray bill has month='2026-04' (so OLD logic's `b.month === targetMonth` would never match May)
    // but has an item dated 2026-05-02 (so NEW logic's `getBillMonths(b).has('2026-05')` matches).
    // This test only passes under span-aware conflict logic.
    const chainSource = makeBill({
      id: 'b_apr', month: '2026-04', vendor: 'Honda',
      recurring: true, recurringChainId: 'rec_h',
      items: [{ id: 'it1', amount: 452, description: 'Auto', categoryId: 'c_auto', date: '2026-04-15' }],
    });
    const stray = makeBill({
      id: 'b_stray', month: '2026-04', vendor: 'Honda',
      items: [
        { id: 'it_a', amount: 100, description: 'late Apr',  categoryId: 'c_auto', date: '2026-04-30' },
        { id: 'it_b', amount: 50,  description: 'early May', categoryId: 'c_auto', date: '2026-05-02' },
      ],
    });
    const out = computeCatchUp([chainSource, stray], '2026-07');
    // Span-aware conflict: stray covers May → conflict on May → stops further targets.
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0].targetMonth).toBe('2026-05');
    expect(out.conflicts[0].existingBillId).toBe('b_stray');
    // No catch-up spawns produced because the chain halted at the May conflict.
    const chainSpawns = out.bills.filter(b => b.recurringChainId === 'rec_h' && b.id !== 'b_apr');
    expect(chainSpawns).toHaveLength(0);
  });
});

describe('findAutoRecurringChains', () => {
  const cats = [
    { id: 'c_auto',  name: 'Auto Loan', flow: 'expense' },
    { id: 'c_pay',   name: 'Paycheck',  flow: 'income'  },
    { id: 'c_401k',  name: '401(k)',    flow: 'savings' },
  ];
  const catsById = new Map(cats.map(c => [c.id, c]));

  function chainBill(month, chainId, recurring, amount = 452, categoryId = 'c_auto', vendor = 'Honda') {
    return {
      id: 'b_' + month, vendor, month,
      recurring, recurringChainId: chainId,
      items: [{ id: 'it_' + month, description: 'Auto loan', amount, categoryId, date: `${month}-15` }],
    };
  }

  it('no recurringChainId anywhere → empty array', () => {
    const bills = [{ id: 'b1', vendor: 'X', month: '2026-05', items: [] }];
    expect(findAutoRecurringChains(bills, catsById)).toEqual([]);
  });

  it('returns empty array for null/undefined bills', () => {
    expect(findAutoRecurringChains(null, catsById)).toEqual([]);
    expect(findAutoRecurringChains(undefined, catsById)).toEqual([]);
  });

  it('falls back to expense flow when categoriesById is null', () => {
    const bills = [
      {
        id: 'b1', vendor: 'Honda', month: '2026-05',
        recurring: true, recurringChainId: 'rec_h',
        items: [{ id: 'it1', description: 'Auto', amount: 100, categoryId: 'c_auto', date: '2026-05-15' }],
      },
    ];
    const out = findAutoRecurringChains(bills, null);
    expect(out).toHaveLength(1);
    expect(out[0].flow).toBe('expense');
  });

  it('single 3-month chain returns one entry with correct shape', () => {
    const bills = [
      chainBill('2026-04', 'rec_h', true),
      chainBill('2026-05', 'rec_h', true),
      chainBill('2026-06', 'rec_h', true),
    ];
    const out = findAutoRecurringChains(bills, catsById);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: 'auto',
      chainId: 'rec_h',
      vendor: 'Honda',
      flow: 'expense',
      monthCount: 3,
      occurrences: 3,
      firstDate: '2026-04-01',
      lastDate: '2026-06-01',
      active: true,
    });
    expect(out[0].lastAmount).toBe(452);
    expect(out[0].avgAmount).toBe(452);
  });

  it('chain whose latest instance has recurring=false → not returned (dormant)', () => {
    const bills = [
      chainBill('2026-04', 'rec_h', true),
      chainBill('2026-05', 'rec_h', false),
    ];
    expect(findAutoRecurringChains(bills, catsById)).toEqual([]);
  });

  it('paycheck chain derives flow=income from category', () => {
    const bills = [
      chainBill('2026-04', 'rec_p', true, 5200, 'c_pay', 'Acme'),
      chainBill('2026-05', 'rec_p', true, 5200, 'c_pay', 'Acme'),
    ];
    const out = findAutoRecurringChains(bills, catsById);
    expect(out[0].flow).toBe('income');
    expect(out[0].vendor).toBe('Acme');
  });

  it('lastAmount uses flow-aligned net via getBillNet', () => {
    const bills = [
      chainBill('2026-04', 'rec_k', true, 260, 'c_401k', 'Fidelity'),
      chainBill('2026-05', 'rec_k', true, 270, 'c_401k', 'Fidelity'),
    ];
    const out = findAutoRecurringChains(bills, catsById);
    expect(out[0].flow).toBe('savings');
    expect(out[0].lastAmount).toBe(270);
    expect(out[0].avgAmount).toBe(265);
  });

  it('two chains return two entries (active first behavior is the panel\'s job, not this fn)', () => {
    const bills = [
      chainBill('2026-04', 'rec_h', true),
      chainBill('2026-04', 'rec_v', true, 80, 'c_auto', 'Verizon'),
    ];
    const out = findAutoRecurringChains(bills, catsById);
    expect(out).toHaveLength(2);
    const ids = out.map(e => e.chainId).sort();
    expect(ids).toEqual(['rec_h', 'rec_v']);
  });

  it('chain with both flagged + un-flagged history instances, latest flagged → returned', () => {
    const bills = [
      chainBill('2026-04', 'rec_h', false),
      chainBill('2026-05', 'rec_h', true),
    ];
    const out = findAutoRecurringChains(bills, catsById);
    expect(out).toHaveLength(1);
    expect(out[0].monthCount).toBe(2);
    expect(out[0].occurrences).toBe(2);
  });

  it('multi-month bills contribute every spanned month to monthCount', () => {
    const aprMay = makeBill({
      id: 'b_aprmay', month: '2026-04', vendor: 'Honda',
      recurring: true, recurringChainId: 'rec_h',
      items: [
        { id: 'i1', description: 'Auto', amount: 100, categoryId: 'c_auto', date: '2026-04-15' },
        { id: 'i2', description: 'tail', amount: 50,  categoryId: 'c_auto', date: '2026-05-04' },
      ],
    });
    const jun = makeBill({
      id: 'b_jun', month: '2026-06', vendor: 'Honda',
      recurring: true, recurringChainId: 'rec_h',
      items: [{ id: 'i3', description: 'Auto', amount: 150, categoryId: 'c_auto', date: '2026-06-15' }],
    });
    const catsById = new Map([['c_auto', { id: 'c_auto', name: 'Auto', flow: 'expense' }]]);
    const chains = findAutoRecurringChains([aprMay, jun], catsById);
    expect(chains).toHaveLength(1);
    expect(chains[0].monthCount).toBe(3);   // Apr, May, Jun
    expect(chains[0].occurrences).toBe(2);  // two bill rows
  });

  it('multi-month chain lastDate reflects the latest spanned month, not bill.month', () => {
    // Single chain bill spanning Apr–May; "latest" should be May not Apr.
    const aprMay = makeBill({
      id: 'b_aprmay', month: '2026-04', vendor: 'Honda',
      recurring: true, recurringChainId: 'rec_h',
      items: [
        { id: 'i1', description: 'Auto', amount: 100, categoryId: 'c_auto', date: '2026-04-15' },
        { id: 'i2', description: 'tail', amount: 50,  categoryId: 'c_auto', date: '2026-05-04' },
      ],
    });
    const catsById = new Map([['c_auto', { id: 'c_auto', name: 'Auto', flow: 'expense' }]]);
    const chains = findAutoRecurringChains([aprMay], catsById);
    expect(chains).toHaveLength(1);
    expect(chains[0].lastDate).toBe('2026-05-01');
    expect(chains[0].firstDate).toBe('2026-04-01');
  });

  it('firstDate reflects earliest primary across the chain, even when a later anchor has earlier primary', () => {
    // Chain: an Apr-only bill, then a bill anchored Apr but with items spanning Feb-Apr (multi-month backwards).
    // sort-by-latest places Apr-only first (latest=Apr) and the Feb-Apr bill second (also latest=Apr).
    // Either way, the chain's actually-earliest activity is Feb, so firstDate should be 2026-02-01.
    const aprOnly = makeBill({
      id: 'b_apr', month: '2026-04', vendor: 'Honda',
      recurring: true, recurringChainId: 'rec_h',
      items: [{ id: 'i1', amount: 100, description: 'Auto', categoryId: 'c_auto', date: '2026-04-15' }],
    });
    const febToApr = makeBill({
      id: 'b_febapr', month: '2026-04', vendor: 'Honda',
      recurring: true, recurringChainId: 'rec_h',
      items: [
        { id: 'i2', amount: 50, description: 'early', categoryId: 'c_auto', date: '2026-02-28' },
        { id: 'i3', amount: 50, description: 'late',  categoryId: 'c_auto', date: '2026-04-10' },
      ],
    });
    const catsById = new Map([['c_auto', { id: 'c_auto', name: 'Auto', flow: 'expense' }]]);
    const chains = findAutoRecurringChains([aprOnly, febToApr], catsById);
    expect(chains).toHaveLength(1);
    expect(chains[0].firstDate).toBe('2026-02-01');
  });
});

import { getPrimaryMonth } from './spendingMath.js';

describe('getPrimaryMonth', () => {
  it('returns the earliest dated item month', () => {
    const bill = {
      month: '2026-04',
      items: [
        { date: '2026-05-04' },
        { date: '2026-04-22' },
        { date: '2026-04-15' },
      ],
    };
    expect(getPrimaryMonth(bill)).toBe('2026-04');
  });

  it('falls back to bill.month when no items are dated', () => {
    const bill = { month: '2026-07', items: [{ date: null }, { amount: 5 }] };
    expect(getPrimaryMonth(bill)).toBe('2026-07');
  });

  it('falls back to bill.month when items array is empty', () => {
    expect(getPrimaryMonth({ month: '2026-03', items: [] })).toBe('2026-03');
  });

  it('ignores malformed item dates', () => {
    const bill = {
      month: '2026-04',
      items: [{ date: 'May 1, 2026' }, { date: '2026-03-09' }],
    };
    expect(getPrimaryMonth(bill)).toBe('2026-03');
  });

  it('handles a null bill gracefully (returns currentMonth fallback shape)', () => {
    expect(getPrimaryMonth(null)).toMatch(/^\d{4}-\d{2}$/);
  });

  it('handles a bill with no items array (returns bill.month)', () => {
    expect(getPrimaryMonth({ month: '2026-09' })).toBe('2026-09');
  });

  it('falls back to currentMonth when bill.month is a malformed string', () => {
    expect(getPrimaryMonth({ month: 'not-a-month', items: [] })).toMatch(/^\d{4}-\d{2}$/);
  });
});

import { getBillMonths } from './spendingMath.js';
import { getLatestMonth } from './spendingMath.js';

describe('getLatestMonth', () => {
  it('returns the latest dated item month', () => {
    const bill = {
      month: '2026-04',
      items: [
        { date: '2026-04-15' },
        { date: '2026-05-04' },
        { date: '2026-04-22' },
      ],
    };
    expect(getLatestMonth(bill)).toBe('2026-05');
  });

  it('equals primary month when bill is single-month', () => {
    const bill = { month: '2026-03', items: [{ date: '2026-03-10' }] };
    expect(getLatestMonth(bill)).toBe('2026-03');
  });

  it('falls back to bill.month when no items are dated', () => {
    expect(getLatestMonth({ month: '2026-07', items: [{ date: null }] })).toBe('2026-07');
  });

  it('handles null bill gracefully', () => {
    expect(getLatestMonth(null)).toMatch(/^\d{4}-\d{2}$/);
  });

  it('handles three-month spans', () => {
    const bill = {
      month: '2026-01',
      items: [
        { date: '2026-01-30' },
        { date: '2026-03-02' },
      ],
    };
    expect(getLatestMonth(bill)).toBe('2026-03');
  });

  it('falls back to currentMonth when bill.month is malformed and no items are dated', () => {
    expect(getLatestMonth({ month: 'bad', items: [] })).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('getBillMonths', () => {
  it('returns a single month when all items are in one month', () => {
    const bill = {
      month: '2026-04',
      items: [
        { date: '2026-04-03' },
        { date: '2026-04-22' },
      ],
    };
    const months = getBillMonths(bill);
    expect([...months].sort()).toEqual(['2026-04']);
  });

  it('returns two months when items span them', () => {
    const bill = {
      month: '2026-02',
      items: [
        { date: '2026-02-15' },
        { date: '2026-03-04' },
      ],
    };
    expect([...getBillMonths(bill)].sort()).toEqual(['2026-02', '2026-03']);
  });

  it('returns three months when items span them', () => {
    const bill = {
      month: '2026-01',
      items: [
        { date: '2026-01-30' },
        { date: '2026-02-14' },
        { date: '2026-03-02' },
      ],
    };
    expect([...getBillMonths(bill)].sort()).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('returns bill.month when no items are dated', () => {
    const bill = { month: '2026-06', items: [{ date: null }, { date: null }] };
    expect([...getBillMonths(bill)]).toEqual(['2026-06']);
  });

  it('returns bill.month when items array is empty', () => {
    expect([...getBillMonths({ month: '2026-08', items: [] })]).toEqual(['2026-08']);
  });

  it('includes the primary month plus every dated item month (dateless do not add)', () => {
    const bill = {
      month: '2026-04',
      items: [
        { date: '2026-04-15' },
        { date: null },
        { date: '2026-05-03' },
      ],
    };
    expect([...getBillMonths(bill)].sort()).toEqual(['2026-04', '2026-05']);
  });

  it('handles null bill gracefully', () => {
    const months = getBillMonths(null);
    expect(months.size).toBe(1);
    expect([...months][0]).toMatch(/^\d{4}-\d{2}$/);
  });

  it('falls back to currentMonth when bill.month is malformed and no items are dated', () => {
    const months = getBillMonths({ month: 'bad', items: [] });
    expect(months.size).toBe(1);
    expect([...months][0]).toMatch(/^\d{4}-\d{2}$/);
  });
});

import { getBillItemsForMonth } from './spendingMath.js';

describe('getBillItemsForMonth', () => {
  it('returns only items dated in the requested month', () => {
    const bill = {
      month: '2026-02',
      items: [
        { id: 'a', date: '2026-02-15' },
        { id: 'b', date: '2026-02-22' },
        { id: 'c', date: '2026-03-04' },
      ],
    };
    const feb = getBillItemsForMonth(bill, '2026-02');
    expect(feb.map(i => i.id).sort()).toEqual(['a', 'b']);
    const mar = getBillItemsForMonth(bill, '2026-03');
    expect(mar.map(i => i.id)).toEqual(['c']);
  });

  it('returns dateless items only when the requested month is the primary', () => {
    const bill = {
      month: '2026-02',
      items: [
        { id: 'a', date: '2026-02-15' },
        { id: 'b', date: null },
        { id: 'c', date: '2026-03-04' },
      ],
    };
    // primary = 2026-02 (earliest dated)
    expect(getBillItemsForMonth(bill, '2026-02').map(i => i.id).sort()).toEqual(['a', 'b']);
    expect(getBillItemsForMonth(bill, '2026-03').map(i => i.id)).toEqual(['c']);
  });

  it('returns dateless items in bill.month when no items are dated', () => {
    const bill = {
      month: '2026-05',
      items: [{ id: 'a', date: null }, { id: 'b' }],
    };
    expect(getBillItemsForMonth(bill, '2026-05').map(i => i.id).sort()).toEqual(['a', 'b']);
    expect(getBillItemsForMonth(bill, '2026-06').map(i => i.id)).toEqual([]);
  });

  it('returns empty array when no items match', () => {
    const bill = { month: '2026-04', items: [{ date: '2026-04-10' }] };
    expect(getBillItemsForMonth(bill, '2026-09')).toEqual([]);
  });

  it('handles null bill gracefully', () => {
    expect(getBillItemsForMonth(null, '2026-04')).toEqual([]);
  });

  it('handles bill with no items array', () => {
    expect(getBillItemsForMonth({ month: '2026-04' }, '2026-04')).toEqual([]);
  });
});
