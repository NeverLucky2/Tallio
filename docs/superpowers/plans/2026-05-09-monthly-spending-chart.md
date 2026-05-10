# Monthly Spending Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-transaction date extraction via Haiku OCR and a full-width "Spending" chart panel with monthly bars, daily drill-in, and a card-name (vendor) filter.

**Architecture:** Bill data model changes from a single `date` to a `month` field (`YYYY-MM`); items gain an optional `date` (`YYYY-MM-DD`). A new pure helper module `spendingMath.js` owns date fallback, vendor-color hashing, and chart aggregation; a new presentational component `SpendingChart.jsx` renders the chart. `App.jsx` migrates existing localStorage on load and mounts the chart above the existing two-column grid.

**Tech Stack:** React 19 + Vite, Vitest for unit tests, Anthropic SDK for OCR.

**Working directory for all commands:** `bill-tracker/` (the inner directory containing `package.json`).

**Spec:** `docs/superpowers/specs/2026-05-09-monthly-spending-chart-design.md`

---

## File Structure

**Create:**
- `src/spendingMath.js` — pure helpers: `getItemDate`, `getVendorColor`, `aggregateByMonth`, `aggregateByDay`, `getMonthWindow`, `migrateBills`.
- `src/spendingMath.test.js` — unit tests for the helpers.
- `src/SpendingChart.jsx` — presentational chart component.

**Modify:**
- `src/billExtractor.js` — update `PROMPT` schema, update `validateResponse` to return `month` and item `date`.
- `src/billExtractor.test.js` — update existing tests for new shape; add new tests for item dates and `month` truncation.
- `src/App.jsx` — apply migration on load; rename `bill.date` → `bill.month` reads/writes; wire `SpendingChart`; add `formatMonth` helper; update "this month" math; add date input to `BillItem`; replace date input with month input in `BillCard`; rename `CategoryBreakdown` panel title.
- `src/App.css` — add styles for `.spending-panel`, `.spending-chips`, `.spending-legend`, `.spending-bars`, `.spending-bar`, `.spending-bar-segment`, `.spending-tooltip`, `.spending-back`.

---

## Task 1: Bill data migration helper

Migration is the foundation — every other change assumes bills have `month`, not `date`. Build it pure and tested first.

**Files:**
- Create: `src/spendingMath.js`
- Test: `src/spendingMath.test.js`

- [ ] **Step 1: Write failing tests for `migrateBills`**

Create `src/spendingMath.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { migrateBills } from './spendingMath.js';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- spendingMath`
Expected: FAIL with "Cannot find module './spendingMath.js'" (file not yet created).

- [ ] **Step 3: Implement `migrateBills`**

Create `src/spendingMath.js`:

```js
const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function migrateBills(bills) {
  if (!Array.isArray(bills)) return [];
  return bills.map(bill => {
    if (bill && typeof bill.month === 'string' && MONTH_RE.test(bill.month)) {
      const { date, ...rest } = bill;
      return rest;
    }
    let month = currentMonth();
    if (bill && typeof bill.date === 'string' && DATE_RE.test(bill.date)) {
      month = bill.date.slice(0, 7);
    }
    const { date, ...rest } = bill || {};
    return { ...rest, month };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- spendingMath`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "feat(spending): add migrateBills helper for date→month conversion"
```

---

## Task 2: `getItemDate` fallback helper

Pure helper used by chart aggregation and "This Month" math. Returns the item's date if present, else the bill's month + day 01.

**Files:**
- Modify: `src/spendingMath.js`
- Modify: `src/spendingMath.test.js`

- [ ] **Step 1: Write failing tests for `getItemDate`**

Append to `src/spendingMath.test.js`:

```js
import { getItemDate } from './spendingMath.js';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- spendingMath`
Expected: FAIL with "getItemDate is not a function" (or import error).

- [ ] **Step 3: Implement `getItemDate`**

Append to `src/spendingMath.js`:

```js
export function getItemDate(bill, item) {
  if (item && typeof item.date === 'string' && DATE_RE.test(item.date)) {
    return item.date;
  }
  const month = (bill && typeof bill.month === 'string' && MONTH_RE.test(bill.month))
    ? bill.month
    : currentMonth();
  return `${month}-01`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- spendingMath`
Expected: PASS, 11 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "feat(spending): add getItemDate fallback helper"
```

---

## Task 3: `getVendorColor` deterministic palette

Stable color assignment per vendor name so chips, bars, and legend stay aligned. 8-color palette tuned for the Nocturne dark theme.

**Files:**
- Modify: `src/spendingMath.js`
- Modify: `src/spendingMath.test.js`

- [ ] **Step 1: Write failing tests for `getVendorColor`**

Append to `src/spendingMath.test.js`:

```js
import { getVendorColor, VENDOR_PALETTE } from './spendingMath.js';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- spendingMath`
Expected: FAIL with "VENDOR_PALETTE is not defined" or similar.

- [ ] **Step 3: Implement `getVendorColor`**

Append to `src/spendingMath.js`:

```js
export const VENDOR_PALETTE = [
  '#5b8dff', // blue
  '#3ddba0', // green
  '#d4a853', // accent gold
  '#a47dea', // purple
  '#e06c6c', // red
  '#46c2c8', // teal
  '#e89a4f', // orange
  '#c97ac8', // magenta
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getVendorColor(vendor) {
  const key = (typeof vendor === 'string' ? vendor : '').trim().toLowerCase();
  const idx = hashString(key) % VENDOR_PALETTE.length;
  return VENDOR_PALETTE[idx];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- spendingMath`
Expected: PASS, 16 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "feat(spending): add getVendorColor with deterministic palette"
```

---

## Task 4: Chart aggregation helpers

`getMonthWindow` returns the rolling 12-month list. `aggregateByMonth` and `aggregateByDay` produce the data the chart renders.

**Files:**
- Modify: `src/spendingMath.js`
- Modify: `src/spendingMath.test.js`

- [ ] **Step 1: Write failing tests for `getMonthWindow`**

Append to `src/spendingMath.test.js`:

```js
import { getMonthWindow } from './spendingMath.js';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- spendingMath`
Expected: FAIL with "getMonthWindow is not a function".

- [ ] **Step 3: Implement `getMonthWindow`**

Append to `src/spendingMath.js`:

```js
export function getMonthWindow(endMonth) {
  const [yStr, mStr] = endMonth.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10); // 1-12
  const out = [];
  for (let i = 11; i >= 0; i--) {
    let y = year;
    let m = month - i;
    while (m <= 0) { m += 12; y -= 1; }
    out.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- spendingMath`
Expected: PASS, 19 tests total.

- [ ] **Step 5: Write failing tests for `aggregateByMonth`**

Append to `src/spendingMath.test.js`:

```js
import { aggregateByMonth } from './spendingMath.js';

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
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test -- spendingMath`
Expected: FAIL with "aggregateByMonth is not a function".

- [ ] **Step 7: Implement `aggregateByMonth`**

Append to `src/spendingMath.js`:

```js
export function aggregateByMonth(bills, endMonth, vendorFilter = null) {
  const window = getMonthWindow(endMonth);
  const windowSet = new Set(window);
  const buckets = {};
  for (const m of window) buckets[m] = { month: m, total: 0, byVendor: {} };

  for (const bill of bills || []) {
    if (vendorFilter && bill.vendor !== vendorFilter) continue;
    for (const item of bill.items || []) {
      if (!Number.isFinite(item.amount) || item.amount <= 0) continue;
      const itemMonth = getItemDate(bill, item).slice(0, 7);
      if (!windowSet.has(itemMonth)) continue;
      const bucket = buckets[itemMonth];
      bucket.total += item.amount;
      const vendor = bill.vendor || 'Unknown';
      bucket.byVendor[vendor] = (bucket.byVendor[vendor] || 0) + item.amount;
    }
  }

  return window.map(m => buckets[m]);
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- spendingMath`
Expected: PASS, 25 tests total.

- [ ] **Step 9: Write failing tests for `aggregateByDay`**

Append to `src/spendingMath.test.js`:

```js
import { aggregateByDay } from './spendingMath.js';

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
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `npm test -- spendingMath`
Expected: FAIL with "aggregateByDay is not a function".

- [ ] **Step 11: Implement `aggregateByDay`**

Append to `src/spendingMath.js`:

```js
function daysInMonth(month) {
  const [y, m] = month.split('-').map(n => parseInt(n, 10));
  return new Date(y, m, 0).getDate();
}

export function aggregateByDay(bills, targetMonth, vendorFilter = null) {
  const days = daysInMonth(targetMonth);
  const buckets = [];
  for (let d = 1; d <= days; d++) {
    buckets.push({ day: d, total: 0, byVendor: {} });
  }

  for (const bill of bills || []) {
    if (vendorFilter && bill.vendor !== vendorFilter) continue;
    for (const item of bill.items || []) {
      if (!Number.isFinite(item.amount) || item.amount <= 0) continue;
      const date = getItemDate(bill, item);
      if (date.slice(0, 7) !== targetMonth) continue;
      const day = parseInt(date.slice(8, 10), 10);
      if (day < 1 || day > days) continue;
      const bucket = buckets[day - 1];
      bucket.total += item.amount;
      const vendor = bill.vendor || 'Unknown';
      bucket.byVendor[vendor] = (bucket.byVendor[vendor] || 0) + item.amount;
    }
  }

  return buckets;
}
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `npm test -- spendingMath`
Expected: PASS, 32 tests total.

- [ ] **Step 13: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "feat(spending): add monthly and daily aggregation helpers"
```

---

## Task 5: OCR — per-item date extraction

Update the prompt and validator so Haiku returns transaction dates per item and a `month` for the bill.

**Files:**
- Modify: `src/billExtractor.js`
- Modify: `src/billExtractor.test.js`

- [ ] **Step 1: Update existing `validateResponse` tests for the new shape**

In `src/billExtractor.test.js`, replace every `date:` in the test bodies that targets the bill-level field with `month:` and update assertions.

Find:

```js
  it('accepts a complete valid object', () => {
    const result = validateResponse({
      vendor: 'Costco',
      date: '2026-05-09',
      items: [{ description: 'Eggs', amount: 4.99 }],
    });
    expect(result.vendor).toBe('Costco');
    expect(result.date).toBe('2026-05-09');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].amount).toBe(4.99);
  });
```

Replace with:

```js
  it('accepts a complete valid object', () => {
    const result = validateResponse({
      vendor: 'Costco',
      month: '2026-05',
      items: [{ description: 'Eggs', amount: 4.99, date: '2026-05-09' }],
    });
    expect(result.vendor).toBe('Costco');
    expect(result.month).toBe('2026-05');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].amount).toBe(4.99);
    expect(result.items[0].date).toBe('2026-05-09');
  });
```

Find:

```js
  it('accepts null vendor and date', () => {
    const result = validateResponse({
      vendor: null,
      date: null,
      items: [],
    });
    expect(result.vendor).toBeNull();
    expect(result.date).toBeNull();
    expect(result.items).toEqual([]);
  });
```

Replace with:

```js
  it('accepts null vendor and month', () => {
    const result = validateResponse({
      vendor: null,
      month: null,
      items: [],
    });
    expect(result.vendor).toBeNull();
    expect(result.month).toBeNull();
    expect(result.items).toEqual([]);
  });
```

Find every other test in `validateResponse` describe block referencing `date: null` or `date: '   '` and rename `date` to `month`. Find:

```js
  it('throws when items is missing', () => {
    expect(() => validateResponse({ vendor: 'X', date: null })).toThrow();
  });

  it('throws when items is not an array', () => {
    expect(() => validateResponse({ vendor: 'X', date: null, items: 'oops' })).toThrow();
  });

  it('drops items with non-numeric amount', () => {
    const result = validateResponse({
      vendor: 'X',
      date: null,
      items: [
        { description: 'Good', amount: 5.99 },
        { description: 'Bad', amount: 'NaN' },
      ],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toBe('Good');
  });

  it('drops items with negative or zero amount', () => {
    const result = validateResponse({
      vendor: 'X',
      date: null,
      items: [
        { description: 'Free sample', amount: 0 },
        { description: 'Refund', amount: -2.50 },
        { description: 'Real item', amount: 1.99 },
      ],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toBe('Real item');
  });

  it('drops items with empty description', () => {
    const result = validateResponse({
      vendor: 'X',
      date: null,
      items: [
        { description: '', amount: 5.99 },
        { description: 'Real', amount: 5.99 },
      ],
    });
    expect(result.items).toHaveLength(1);
  });
```

Replace with the same blocks but with each `date: null` swapped for `month: null`.

Find:

```js
  it('coerces empty/whitespace vendor and date to null', () => {
    const result = validateResponse({
      vendor: '',
      date: '   ',
      items: [],
    });
    expect(result.vendor).toBeNull();
    expect(result.date).toBeNull();
  });
```

Replace with:

```js
  it('coerces empty/whitespace vendor and month to null', () => {
    const result = validateResponse({
      vendor: '',
      month: '   ',
      items: [],
    });
    expect(result.vendor).toBeNull();
    expect(result.month).toBeNull();
  });
```

- [ ] **Step 2: Add new `validateResponse` tests covering item dates and month truncation**

Append inside the `describe('validateResponse', ...)` block in `src/billExtractor.test.js`:

```js
  it('truncates a YYYY-MM-DD month value to YYYY-MM', () => {
    const result = validateResponse({
      vendor: 'X',
      month: '2026-05-09',
      items: [],
    });
    expect(result.month).toBe('2026-05');
  });

  it('passes through a YYYY-MM month value', () => {
    const result = validateResponse({
      vendor: 'X',
      month: '2026-05',
      items: [],
    });
    expect(result.month).toBe('2026-05');
  });

  it('rejects a malformed month string', () => {
    const result = validateResponse({
      vendor: 'X',
      month: 'May 2026',
      items: [],
    });
    expect(result.month).toBeNull();
  });

  it('keeps item.date when it is a valid YYYY-MM-DD', () => {
    const result = validateResponse({
      vendor: 'X',
      month: '2026-05',
      items: [{ description: 'Coffee', amount: 5, date: '2026-05-09' }],
    });
    expect(result.items[0].date).toBe('2026-05-09');
  });

  it('drops item.date when it is malformed', () => {
    const result = validateResponse({
      vendor: 'X',
      month: '2026-05',
      items: [{ description: 'Coffee', amount: 5, date: 'May 9' }],
    });
    expect(result.items[0].date).toBeNull();
  });

  it('sets item.date to null when missing', () => {
    const result = validateResponse({
      vendor: 'X',
      month: '2026-05',
      items: [{ description: 'Coffee', amount: 5 }],
    });
    expect(result.items[0].date).toBeNull();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- billExtractor`
Expected: FAIL — `validateResponse` still returns `date` not `month`, and item dates are not handled.

- [ ] **Step 4: Update `validateResponse` and the prompt in `src/billExtractor.js`**

Replace the current `PROMPT` constant:

```js
const PROMPT = `You are extracting structured data from a bill, receipt, or credit-card statement image.

Return ONLY a JSON object matching this schema, with no surrounding prose:
{
  "vendor": string | null,
  "month": string | null,
  "items": [
    {
      "description": string,
      "amount": number,
      "date": string | null
    }
  ]
}

Rules:
- Extract every line-item charge you can identify.
- Skip subtotals, totals, tax-only lines, payment/balance lines, and headers.
- For credit-card statements: each transaction is one item. Skip "PAYMENT - THANK YOU" and similar.
- If amount appears as "$12.99", "12.99", or "12,99" — normalize to 12.99.
- "month" is the statement month for credit-card statements, or the receipt month for single-purchase receipts. Format YYYY-MM. Use null if you cannot read it.
- Each item's "date" is the transaction's posting/purchase date in YYYY-MM-DD. If the printed date omits the year, infer it from the statement period (transactions in Dec on a Jan statement use the previous year). Use null if you cannot read a date for an item.
- "vendor" should be the store/merchant name (or card name for statements), null if unclear.
- If you cannot read the image at all, return {"vendor": null, "month": null, "items": []}.`;
```

Replace the current `validateResponse` function:

```js
const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateResponse(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Response is not an object');
  }
  if (!Array.isArray(parsed.items)) {
    throw new Error('Response.items must be an array');
  }
  const items = parsed.items
    .filter(it =>
      it &&
      typeof it.description === 'string' &&
      it.description.trim().length > 0 &&
      typeof it.amount === 'number' &&
      isFinite(it.amount) &&
      it.amount > 0
    )
    .map(it => ({
      description: it.description.trim(),
      amount: it.amount,
      date: (typeof it.date === 'string' && DATE_RE.test(it.date.trim())) ? it.date.trim() : null,
    }));

  let month = null;
  if (typeof parsed.month === 'string') {
    const trimmed = parsed.month.trim();
    if (MONTH_RE.test(trimmed)) month = trimmed;
    else if (DATE_RE.test(trimmed)) month = trimmed.slice(0, 7);
  }

  return {
    vendor: (typeof parsed.vendor === 'string' && parsed.vendor.trim()) ? parsed.vendor.trim() : null,
    month,
    items,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- billExtractor`
Expected: PASS, all `validateResponse` tests including new ones.

- [ ] **Step 6: Commit**

```bash
git add src/billExtractor.js src/billExtractor.test.js
git commit -m "feat(ocr): extract per-item transaction dates and bill month"
```

---

## Task 6: Run migration on load and persist bills with `month`

Wire `migrateBills` into the localStorage load path in `App.jsx` so existing data converts immediately.

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Import `migrateBills` and apply it on load**

In `src/App.jsx`, find:

```js
import { extractBillFromImage } from './billExtractor.js';
```

Add directly below:

```js
import { migrateBills } from './spendingMath.js';
```

Find the load `useEffect`:

```js
  useEffect(() => {
    try {
      const saved = localStorage.getItem('billtracker-bills');
      if (saved) setBills(JSON.parse(saved));
    } catch (e) {
      // No saved bills yet
    } finally {
      hasLoaded.current = true;
    }
  }, []);
```

Replace with:

```js
  useEffect(() => {
    try {
      const saved = localStorage.getItem('billtracker-bills');
      if (saved) setBills(migrateBills(JSON.parse(saved)));
    } catch (e) {
      // No saved bills yet
    } finally {
      hasLoaded.current = true;
    }
  }, []);
```

- [ ] **Step 2: Verify by loading the dev app once**

Run: `npm run dev`
Open the URL printed in the terminal. If you previously had bills with `date`, open the browser console and run `JSON.parse(localStorage.getItem('billtracker-bills'))`. Each bill object should now have `month` and no `date`. Stop the dev server with `Ctrl+C`.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat(spending): migrate localStorage bills on load"
```

---

## Task 7: Replace `bill.date` with `bill.month` everywhere in App.jsx

After this task, `bill.date` no longer exists in the source.

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add `formatMonth` helper alongside `formatDate`**

In `src/App.jsx`, find:

```js
const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};
```

Add directly below:

```js
const formatMonth = (monthString) => {
  if (!monthString || !/^\d{4}-\d{2}$/.test(monthString)) return '';
  const [y, m] = monthString.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });
};
```

- [ ] **Step 2: Update `BillCard` to use `bill.month`**

In `BillCard`, find:

```js
        <div className="bill-info">
          <h3 className="bill-vendor">{bill.vendor || "Untitled Bill"}</h3>
          <div className="bill-meta">
            {formatDate(bill.date)}
            <div className="bill-meta-dot" />
            {bill.items.length} item{bill.items.length !== 1 ? 's' : ''}
          </div>
        </div>
```

Replace with:

```js
        <div className="bill-info">
          <h3 className="bill-vendor">{bill.vendor || "Untitled Bill"}</h3>
          <div className="bill-meta">
            {formatMonth(bill.month)}
            <div className="bill-meta-dot" />
            {bill.items.length} item{bill.items.length !== 1 ? 's' : ''}
          </div>
        </div>
```

Find the bill detail-fields block:

```js
            <input
              type="date"
              value={bill.date}
              onChange={(e) => onUpdate({ ...bill, date: e.target.value })}
              className="input"
              style={{ width: isMobile ? '100%' : '160px', flex: isMobile ? '1 1 auto' : '0 0 auto' }}
            />
```

Replace with:

```js
            <input
              type="month"
              value={bill.month}
              onChange={(e) => onUpdate({ ...bill, month: e.target.value })}
              className="input"
              style={{ width: isMobile ? '100%' : '160px', flex: isMobile ? '1 1 auto' : '0 0 auto' }}
            />
```

- [ ] **Step 3: Update `handleCapture` to write `month`**

Find:

```js
      const newBill = {
        id: crypto.randomUUID(),
        vendor: vendor || 'Scanned Bill',
        date: date || new Date().toISOString().split('T')[0],
        items: mappedItems.length > 0 ? mappedItems : [{
          id: crypto.randomUUID(),
          description: 'No items detected — add manually',
          amount: 0,
          category: 'Other',
        }],
      };
```

Replace with:

```js
      const newBill = {
        id: crypto.randomUUID(),
        vendor: vendor || 'Scanned Bill',
        month: month || new Date().toISOString().slice(0, 7),
        items: mappedItems.length > 0 ? mappedItems : [{
          id: crypto.randomUUID(),
          description: 'No items detected — add manually',
          amount: 0,
          category: 'Other',
          date: null,
        }],
      };
```

In the same function, find:

```js
      const { vendor, date, items } = await extractBillFromImage(imageData, {
        apiKey: settings.apiKey,
        model: settings.model,
      });

      const mappedItems = items.map(it => ({
        id: crypto.randomUUID(),
        description: it.description,
        amount: it.amount,
        category: autoCategorizeTx(it.description),
      }));
```

Replace with:

```js
      const { vendor, month, items } = await extractBillFromImage(imageData, {
        apiKey: settings.apiKey,
        model: settings.model,
      });

      const mappedItems = items.map(it => ({
        id: crypto.randomUUID(),
        description: it.description,
        amount: it.amount,
        date: it.date || null,
        category: autoCategorizeTx(it.description),
      }));
```

In the catch block, find:

```js
      const newBill = {
        id: crypto.randomUUID(),
        vendor: 'Scanned Bill',
        date: new Date().toISOString().split('T')[0],
        items: [{
          id: crypto.randomUUID(),
          description: `${(err.message || 'Extraction failed').replace(/\.$/, '')} — add items manually`,
          amount: 0,
          category: 'Other',
        }],
      };
```

Replace with:

```js
      const newBill = {
        id: crypto.randomUUID(),
        vendor: 'Scanned Bill',
        month: new Date().toISOString().slice(0, 7),
        items: [{
          id: crypto.randomUUID(),
          description: `${(err.message || 'Extraction failed').replace(/\.$/, '')} — add items manually`,
          amount: 0,
          category: 'Other',
          date: null,
        }],
      };
```

- [ ] **Step 4: Update `addManualBill`**

Find:

```js
  const addManualBill = () => {
    pushHistory(bills);
    const newBill = {
      id: Date.now(),
      vendor: "",
      date: new Date().toISOString().split('T')[0],
      items: [{ id: Date.now(), description: "", amount: 0, category: "Other" }]
    };
    setBills(prev => [newBill, ...prev]);
  };
```

Replace with:

```js
  const addManualBill = () => {
    pushHistory(bills);
    const newBill = {
      id: Date.now(),
      vendor: "",
      month: new Date().toISOString().slice(0, 7),
      items: [{ id: Date.now(), description: "", amount: 0, category: "Other", date: null }]
    };
    setBills(prev => [newBill, ...prev]);
  };
```

- [ ] **Step 5: Confirm there are no remaining `bill.date` references**

Run: `grep -n "bill\.date\|\.date =\|date: " src/App.jsx`
Expected: no `bill.date`, no `date:` writes (only the older `formatDate` helper, which can stay since it's still used by nothing — leave it for now).

If `formatDate` is unused after this task, leave it; we'll clean up at the end.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "refactor(spending): use bill.month everywhere in App.jsx"
```

---

## Task 8: Add per-item date input in `BillItem`

Each transaction row gets a `<input type="date">`. Desktop: between description and category. Mobile: in the bottom row, left of category.

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.css`

- [ ] **Step 1: Pass `bill` into `BillItem` so the row knows the fallback month**

In `BillCard`, find where `BillItem` is rendered:

```js
            {bill.items.map(item => (
              <BillItem
                key={item.id}
                item={item}
                onUpdate={updateItem}
                onDelete={() => deleteItem(item.id)}
                isMobile={isMobile}
              />
            ))}
```

Replace with:

```js
            {bill.items.map(item => (
              <BillItem
                key={item.id}
                item={item}
                bill={bill}
                onUpdate={updateItem}
                onDelete={() => deleteItem(item.id)}
                isMobile={isMobile}
              />
            ))}
```

- [ ] **Step 2: Import `getItemDate` in App.jsx**

Find:

```js
import { migrateBills } from './spendingMath.js';
```

Replace with:

```js
import { migrateBills, getItemDate } from './spendingMath.js';
```

- [ ] **Step 3: Add the date input to the desktop layout in `BillItem`**

Find the function signature:

```js
const BillItem = ({ item, onUpdate, onDelete, isMobile }) => {
```

Replace with:

```js
const BillItem = ({ item, bill, onUpdate, onDelete, isMobile }) => {
  const itemDate = item.date || getItemDate(bill, item);
```

Find the desktop return block:

```js
  return (
    <div className="item-row">
      <div
        className="item-icon"
        style={{ background: `${category.color}18`, border: `1px solid ${category.color}28` }}
      >
        {category.icon}
      </div>
      <input
        type="text"
        value={item.description}
        onChange={(e) => onUpdate({ ...item, description: e.target.value })}
        className="input-transparent"
        placeholder="Description"
      />
      <select
        value={item.category}
        onChange={(e) => onUpdate({ ...item, category: e.target.value })}
        className="select"
      >
        {categories.map(cat => (
          <option key={cat.name} value={cat.name}>{cat.icon} {cat.name}</option>
        ))}
      </select>
      <div className="input-amount-wrap">
        <span className="input-amount-prefix">$</span>
        <input
          type="number"
          value={item.amount}
          onChange={(e) => onUpdate({ ...item, amount: parseFloat(e.target.value) || 0 })}
          className="input-amount"
          step="0.01"
          min="0"
        />
      </div>
      <button className="btn-delete" onClick={onDelete}>×</button>
    </div>
  );
```

Replace with:

```js
  return (
    <div className="item-row">
      <div
        className="item-icon"
        style={{ background: `${category.color}18`, border: `1px solid ${category.color}28` }}
      >
        {category.icon}
      </div>
      <input
        type="text"
        value={item.description}
        onChange={(e) => onUpdate({ ...item, description: e.target.value })}
        className="input-transparent"
        placeholder="Description"
      />
      <input
        type="date"
        value={itemDate}
        onChange={(e) => onUpdate({ ...item, date: e.target.value })}
        className="input item-date"
      />
      <select
        value={item.category}
        onChange={(e) => onUpdate({ ...item, category: e.target.value })}
        className="select"
      >
        {categories.map(cat => (
          <option key={cat.name} value={cat.name}>{cat.icon} {cat.name}</option>
        ))}
      </select>
      <div className="input-amount-wrap">
        <span className="input-amount-prefix">$</span>
        <input
          type="number"
          value={item.amount}
          onChange={(e) => onUpdate({ ...item, amount: parseFloat(e.target.value) || 0 })}
          className="input-amount"
          step="0.01"
          min="0"
        />
      </div>
      <button className="btn-delete" onClick={onDelete}>×</button>
    </div>
  );
```

- [ ] **Step 4: Add the date input to the mobile layout in `BillItem`**

Find the mobile bottom row:

```js
        <div className="item-row-mobile-bottom">
          <select
            value={item.category}
            onChange={(e) => onUpdate({ ...item, category: e.target.value })}
            className="select"
          >
            {categories.map(cat => (
              <option key={cat.name} value={cat.name}>{cat.icon} {cat.name}</option>
            ))}
          </select>
          <div className="input-amount-wrap" style={{ width: '110px', flexShrink: 0 }}>
            <span className="input-amount-prefix">$</span>
            <input
              type="number"
              value={item.amount}
              onChange={(e) => onUpdate({ ...item, amount: parseFloat(e.target.value) || 0 })}
              className="input-amount"
              step="0.01"
              min="0"
            />
          </div>
        </div>
```

Replace with:

```js
        <div className="item-row-mobile-bottom">
          <input
            type="date"
            value={itemDate}
            onChange={(e) => onUpdate({ ...item, date: e.target.value })}
            className="input item-date"
            style={{ width: '140px', flexShrink: 0 }}
          />
          <select
            value={item.category}
            onChange={(e) => onUpdate({ ...item, category: e.target.value })}
            className="select"
          >
            {categories.map(cat => (
              <option key={cat.name} value={cat.name}>{cat.icon} {cat.name}</option>
            ))}
          </select>
          <div className="input-amount-wrap" style={{ width: '110px', flexShrink: 0 }}>
            <span className="input-amount-prefix">$</span>
            <input
              type="number"
              value={item.amount}
              onChange={(e) => onUpdate({ ...item, amount: parseFloat(e.target.value) || 0 })}
              className="input-amount"
              step="0.01"
              min="0"
            />
          </div>
        </div>
```

- [ ] **Step 5: Add `.item-date` styling to App.css**

Append to `src/App.css`:

```css
/* ---- Item Date Input ---- */

.item-date {
  width: 140px;
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
}

.item-date:focus {
  color: var(--text);
}
```

- [ ] **Step 6: Visually verify in the dev server**

Run: `npm run dev`
Open the URL. Expand a bill. Confirm:
- Each item row shows a date field between description and category.
- On mobile width (resize browser <768px), the date appears in the bottom row left of category.
- Editing the date persists (refresh and reopen the bill — the date should remain).
Stop the server.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat(bills): add per-transaction date input to BillItem"
```

---

## Task 9: Update "This Month" SummaryCard math

Use `getItemDate` to count items in the current calendar month, regardless of which bill they belong to.

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Replace `thisMonthBills` and `thisMonthTotal`**

Find:

```js
  const thisMonthBills = bills.filter(bill => {
    const billDate = new Date(bill.date);
    const now = new Date();
    return billDate.getMonth() === now.getMonth() && billDate.getFullYear() === now.getFullYear();
  });

  const thisMonthTotal = thisMonthBills.reduce((sum, bill) =>
    sum + bill.items.reduce((itemSum, item) => itemSum + item.amount, 0), 0
  );
```

Replace with:

```js
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonthTotal = bills.reduce((sum, bill) => {
    return sum + bill.items.reduce((itemSum, item) => {
      const itemMonth = getItemDate(bill, item).slice(0, 7);
      return itemMonth === currentMonthKey ? itemSum + item.amount : itemSum;
    }, 0);
  }, 0);
```

- [ ] **Step 2: Verify in the dev server**

Run: `npm run dev`
Add a manual bill set to the current month with a single item. Confirm "This Month" reflects the item amount. Add another item dated to a previous month — it should not affect "This Month." Stop the server.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat(spending): use item dates for This Month total"
```

---

## Task 10: SpendingChart component — filter chips and monthly view

Build the component starting with chips and the monthly bar view. Daily drill-in comes next.

**Files:**
- Create: `src/SpendingChart.jsx`
- Modify: `src/App.css`

- [ ] **Step 1: Create `SpendingChart.jsx` with chips + monthly view**

Create `src/SpendingChart.jsx`:

```jsx
import React, { useState, useMemo } from 'react';
import {
  aggregateByMonth,
  aggregateByDay,
  getVendorColor,
} from './spendingMath.js';

const formatMonthShort = (month) => {
  const [y, m] = month.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
};

const formatMonthLong = (month) => {
  const [y, m] = month.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const formatCurrency = (amount) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD',
}).format(amount);

export default function SpendingChart({ bills }) {
  const [vendorFilter, setVendorFilter] = useState(null); // null = all
  const [drillMonth, setDrillMonth] = useState(null);     // null = monthly view

  const vendors = useMemo(() => {
    const set = new Set();
    for (const b of bills) if (b.vendor) set.add(b.vendor);
    return Array.from(set).sort();
  }, [bills]);

  const currentMonthKey = new Date().toISOString().slice(0, 7);

  const monthly = useMemo(
    () => aggregateByMonth(bills, currentMonthKey, vendorFilter),
    [bills, currentMonthKey, vendorFilter]
  );

  const daily = useMemo(() => {
    if (!drillMonth) return null;
    return aggregateByDay(bills, drillMonth, vendorFilter);
  }, [bills, drillMonth, vendorFilter]);

  const isAll = vendorFilter === null;

  if (bills.length === 0) {
    return (
      <div className="spending-panel">
        <div className="spending-empty">Scan a bill to see your spending here.</div>
      </div>
    );
  }

  const renderChips = () => (
    <div className="spending-chips">
      <button
        className={`spending-chip${isAll ? ' active' : ''}`}
        onClick={() => setVendorFilter(null)}
      >
        All
      </button>
      {vendors.map(v => (
        <button
          key={v}
          className={`spending-chip${vendorFilter === v ? ' active' : ''}`}
          onClick={() => setVendorFilter(v)}
          style={vendorFilter === v ? { background: getVendorColor(v), color: '#0b0e16' } : null}
        >
          {v}
        </button>
      ))}
    </div>
  );

  const renderLegend = () => {
    if (!isAll || vendors.length === 0) return null;
    return (
      <div className="spending-legend">
        {vendors.map(v => (
          <span key={v} className="spending-legend-item">
            <span className="spending-legend-swatch" style={{ background: getVendorColor(v) }} />
            {v}
          </span>
        ))}
      </div>
    );
  };

  const renderMonthlyBars = () => {
    const max = Math.max(...monthly.map(m => m.total), 1);
    return (
      <div className="spending-bars">
        {monthly.map(m => {
          const pct = (m.total / max) * 100;
          const isCurrent = m.month === currentMonthKey;
          return (
            <button
              key={m.month}
              className={`spending-bar${isCurrent ? ' current' : ''}`}
              onClick={() => setDrillMonth(m.month)}
              title={`${formatMonthLong(m.month)} — ${formatCurrency(m.total)}`}
            >
              <div className="spending-bar-stack" style={{ height: `${pct}%` }}>
                {isAll ? renderStack(m) : (
                  <div
                    className="spending-bar-segment"
                    style={{
                      background: vendorFilter
                        ? getVendorColor(vendorFilter)
                        : '#5b8dff',
                      height: '100%',
                    }}
                  />
                )}
              </div>
              <span className="spending-bar-label">{formatMonthShort(m.month)}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderStack = (bucket) => {
    const sorted = Object.entries(bucket.byVendor).sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([vendor, amount]) => {
      const segPct = bucket.total > 0 ? (amount / bucket.total) * 100 : 0;
      return (
        <div
          key={vendor}
          className="spending-bar-segment"
          style={{ background: getVendorColor(vendor), height: `${segPct}%` }}
        />
      );
    });
  };

  return (
    <div className="spending-panel">
      <div className="spending-header">
        <h2 className="spending-title">Spending</h2>
      </div>
      {renderChips()}
      {renderLegend()}
      {renderMonthlyBars()}
    </div>
  );
}
```

- [ ] **Step 2: Add styles to `src/App.css`**

Append:

```css
/* ---- Spending Panel ---- */

.spending-panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 22px 24px;
  margin-bottom: 28px;
  box-shadow: var(--shadow-card);
}

.spending-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 14px;
}

.spending-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 500;
  color: var(--text);
  margin: 0;
  letter-spacing: 0.01em;
}

.spending-empty {
  text-align: center;
  color: var(--text-muted);
  padding: 40px 0;
  font-size: 13px;
}

.spending-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.spending-chip {
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
}

.spending-chip:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.spending-chip.active {
  background: var(--accent);
  color: #0b0e16;
  border-color: var(--accent);
}

.spending-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 8px 0 14px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 18px;
}

.spending-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted);
}

.spending-legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}

.spending-bars {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 220px;
  padding-top: 8px;
  border-bottom: 1px solid var(--border);
}

.spending-bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  height: 100%;
  justify-content: flex-end;
  position: relative;
}

.spending-bar-stack {
  width: 100%;
  display: flex;
  flex-direction: column-reverse;
  border-radius: 4px 4px 0 0;
  overflow: hidden;
  min-height: 2px;
  transition: opacity var(--transition);
}

.spending-bar:hover .spending-bar-stack {
  opacity: 0.85;
}

.spending-bar.current .spending-bar-stack {
  outline: 1px solid var(--accent-border);
}

.spending-bar-segment {
  width: 100%;
}

.spending-bar-label {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
}

.spending-bar:hover .spending-bar-label,
.spending-bar.current .spending-bar-label {
  color: var(--text);
}
```

- [ ] **Step 3: Wire `SpendingChart` into `App.jsx`**

In `src/App.jsx`, find:

```js
import SettingsPanel from './SettingsPanel.jsx';
```

Add directly below:

```js
import SpendingChart from './SpendingChart.jsx';
```

Find the main grid:

```js
        {/* Main Grid */}
        <div className="main-grid">
```

Insert directly above:

```js
        {/* Spending Hero */}
        <SpendingChart bills={bills} />

        {/* Main Grid */}
        <div className="main-grid">
```

- [ ] **Step 4: Verify in the dev server**

Run: `npm run dev`
Open the URL. Confirm:
- "Spending" panel appears as a full-width hero above the bills/sidebar grid.
- Chip row shows "All" + each unique vendor name across your bills.
- Bars render across 12 months; current month is highlighted.
- Clicking a chip switches between solid bars (single vendor color) and stacked bars (with legend).
- Hovering a bar shows the month total in a native tooltip.
Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/SpendingChart.jsx src/App.jsx src/App.css
git commit -m "feat(spending): SpendingChart with chips and monthly bars"
```

---

## Task 11: SpendingChart — daily drill-in view

Tap a monthly bar → see daily bars for that month with back/prev/next navigation.

**Files:**
- Modify: `src/SpendingChart.jsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add daily-view rendering and navigation to `SpendingChart`**

In `src/SpendingChart.jsx`, find:

```js
import {
  aggregateByMonth,
  aggregateByDay,
  getVendorColor,
} from './spendingMath.js';
```

Add directly below:

```js
import { getMonthWindow } from './spendingMath.js';
```

(If your import lines combined into one, add `getMonthWindow` to the existing list.)

Inside the component, find:

```js
  return (
    <div className="spending-panel">
      <div className="spending-header">
        <h2 className="spending-title">Spending</h2>
      </div>
      {renderChips()}
      {renderLegend()}
      {renderMonthlyBars()}
    </div>
  );
```

Replace with:

```js
  const months = getMonthWindow(currentMonthKey);
  const drillIdx = drillMonth ? months.indexOf(drillMonth) : -1;
  const canPrev = drillIdx > 0;
  const canNext = drillIdx >= 0 && drillIdx < months.length - 1;

  const renderDailyBars = () => {
    const max = Math.max(...daily.map(d => d.total), 1);
    if (daily.every(d => d.total === 0)) {
      return <div className="spending-empty">No spending recorded for {formatMonthLong(drillMonth)}.</div>;
    }
    return (
      <div className="spending-bars spending-bars-daily">
        {daily.map(d => {
          const pct = (d.total / max) * 100;
          return (
            <div
              key={d.day}
              className="spending-bar"
              title={`${formatMonthLong(drillMonth)} ${d.day} — ${formatCurrency(d.total)}`}
            >
              <div className="spending-bar-stack" style={{ height: `${pct}%` }}>
                {isAll ? renderStack(d) : (
                  <div
                    className="spending-bar-segment"
                    style={{
                      background: vendorFilter
                        ? getVendorColor(vendorFilter)
                        : '#5b8dff',
                      height: '100%',
                    }}
                  />
                )}
              </div>
              {(d.day === 1 || d.day % 7 === 0 || d.day === daily.length) && (
                <span className="spending-bar-label">{d.day}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderDailyHeader = () => (
    <div className="spending-drill-header">
      <button className="spending-back" onClick={() => setDrillMonth(null)} aria-label="Back to monthly">
        ← Back
      </button>
      <div className="spending-drill-nav">
        <button
          className="spending-back"
          onClick={() => canPrev && setDrillMonth(months[drillIdx - 1])}
          disabled={!canPrev}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="spending-drill-month">{formatMonthLong(drillMonth)}</span>
        <button
          className="spending-back"
          onClick={() => canNext && setDrillMonth(months[drillIdx + 1])}
          disabled={!canNext}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <span /> {/* spacer for alignment */}
    </div>
  );

  return (
    <div className="spending-panel">
      <div className="spending-header">
        <h2 className="spending-title">Spending</h2>
      </div>
      {renderChips()}
      {renderLegend()}
      {drillMonth ? (
        <>
          {renderDailyHeader()}
          {renderDailyBars()}
        </>
      ) : (
        renderMonthlyBars()
      )}
    </div>
  );
```

- [ ] **Step 2: Add daily-view styles to `App.css`**

Append:

```css
/* ---- Spending Drill ---- */

.spending-drill-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
}

.spending-drill-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
}

.spending-drill-month {
  font-family: var(--font-display);
  font-size: 16px;
  color: var(--text);
}

.spending-back {
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 4px 10px;
  border-radius: var(--r-sm);
  font-size: 12px;
  cursor: pointer;
  transition: var(--transition);
}

.spending-back:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}

.spending-back:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.spending-bars-daily {
  gap: 2px;
  height: 200px;
}
```

- [ ] **Step 3: Verify drill-in in the dev server**

Run: `npm run dev`
Open the URL. Confirm:
- Tapping a monthly bar enters daily view; daily bars render for that month.
- Back returns to monthly. ‹ › steps to adjacent months. Buttons disable at window edges.
- Switching chips while in drill-in view re-renders the daily bars correctly.
- A month with no spending shows "No spending recorded for {Month Year}."
Stop the server.

- [ ] **Step 4: Commit**

```bash
git add src/SpendingChart.jsx src/App.css
git commit -m "feat(spending): add daily drill-in view with month navigation"
```

---

## Task 12: Rename CategoryBreakdown panel title to "Categories"

The new panel owns "Spending" — disambiguate the sidebar.

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Update `CategoryBreakdown` title**

In `src/App.jsx`, find:

```js
      <div className="panel-header">
        <h3 className="panel-title">Spending</h3>
      </div>
```

(inside the `CategoryBreakdown` component)

Replace with:

```js
      <div className="panel-header">
        <h3 className="panel-title">Categories</h3>
      </div>
```

- [ ] **Step 2: Verify**

Run: `npm run dev`
Open the URL. Sidebar panel reads "Categories." Stop the server.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "refactor(ui): rename sidebar Spending panel to Categories"
```

---

## Task 13: Final cleanup and full-suite verification

Confirm no stale `formatDate` calls remain on bill data, then run the full test suite and lint.

**Files:**
- Modify: `src/App.jsx` (possibly)

- [ ] **Step 1: Confirm `formatDate` is unused**

Run: `grep -n "formatDate" src/App.jsx`
Expected: only the `const formatDate = ...` declaration (no callers).

If only the declaration remains, remove the declaration:

```js
const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};
```

Delete the entire block.

If `formatDate` is still called somewhere on bill data, replace with `formatMonth(bill.month)` and then delete the unused declaration.

- [ ] **Step 2: Run the full test suite**

Run: `npm test -- --run`
Expected: all tests pass (existing peerProtocol + updated billExtractor + new spendingMath).

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: no errors. If lint complains about an unused `bill` prop or similar, fix that specific issue and re-run.

- [ ] **Step 4: Manual end-to-end smoke test**

Run: `npm run dev`
- Add a manual bill, set its month, add two items with different dates → confirm both show in the chart on their respective days.
- Scan a real credit-card bill image (if you have an API key configured) and confirm Haiku returns per-item dates.
- Drill into a month, switch chips, navigate prev/next.
- Edit an item's date in the bill row → chart updates live.
- Edit a bill's month → bill card subtitle updates to the new month.
Stop the server.

- [ ] **Step 5: Commit any cleanup**

```bash
git add src/App.jsx
git commit -m "chore: remove unused formatDate helper"
```

(Skip this commit if `formatDate` was already removed in step 1 with no other changes.)

---

## Done

All tasks complete. The app now stores bills as monthly buckets with per-transaction dates, and the new Spending hero panel lets you compare months, drill into individual months, and filter by card.
