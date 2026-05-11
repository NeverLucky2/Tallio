import { describe, it, expect } from 'vitest';
import { migrateBills, getItemDate, getVendorColor, VENDOR_PALETTE, getMonthWindow, aggregateByMonth, aggregateByDay, findRecurringCharges, aggregateByKeyword, getMonthItems, migrateToV3 } from './spendingMath.js';

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
    expect(aggregateByKeyword(bills, '')).toEqual({ total: 0, byMonth: {}, lastDate: null, categoryId: null, occurrences: 0 });
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

  it('ignores items with non-positive amounts', () => {
    const bills = [
      billWithItems('2026-05', [
        { description: 'CHURCH', amount: 600, date: '2026-05-01', category: 'Donations' },
        { description: 'CHURCH REFUND', amount: -50, date: '2026-05-15', category: 'Donations' },
      ]),
    ];
    expect(aggregateByKeyword(bills, 'CHURCH').total).toBe(600);
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
