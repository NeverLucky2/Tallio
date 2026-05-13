# Sub-project D — Reporting & Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Reports screen with three reports (YoY by category, MoM by category, recurring vs one-off Spent split), upgrade SpendingChart with a flow toggle, and replace bare JSON export with a ZIP bundle (data.json + items.csv).

**Architecture:** Two new pure modules — `reportingMath.js` for aggregators and `exportArchive.js` for slice extraction + zip building via `fflate`. New `ReportsScreen.jsx` mirrors the existing `ManageCategoriesScreen` pattern (full-screen view triggered by a toolbar button). The dashboard Spent stat card gains an inline recurring/one-off split bar. SpendingChart gains internal `flow` state with a chip strip. No new persisted localStorage slices and no schema version bump.

**Tech Stack:** React 19 · Vite 7 · Vitest 4 (`@testing-library/react`, jsdom) · `fflate` (new dependency, ~15 KB)

**Spec:** `docs/superpowers/specs/2026-05-12-reporting-and-export-design.md`

---

## Task 1: Add `fflate` dependency

**Files:**
- Modify: `package.json` (root scripts) — npm will update this and `package-lock.json`

- [ ] **Step 1: Install fflate**

```bash
npm install fflate@^0.8.2
```

Expected: package.json's `dependencies` block gains `"fflate": "^0.8.2"`.

- [ ] **Step 2: Verify install**

```bash
npm test -- --run src/spendingMath.test.js
```

Expected: all existing tests still pass. This confirms the dep installed without breaking the project.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(reporting): add fflate dependency for zip archive export"
```

---

## Task 2: `buildItemsCsv` pure function (TDD)

**Files:**
- Create: `src/exportArchive.js`
- Create: `src/exportArchive.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/exportArchive.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/exportArchive.test.js
```

Expected: FAIL with `Cannot find module './exportArchive.js'` (file does not exist yet).

- [ ] **Step 3: Implement `buildItemsCsv`**

Create `src/exportArchive.js`:

```js
import { getItemDate } from './spendingMath.js';

const CSV_HEADER = 'date,vendor,description,amount,category,flow,recurring';

function escapeCsv(value) {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildItemsCsv(bills, categoriesById) {
  const rows = [];
  for (const bill of bills || []) {
    if (!bill || !Array.isArray(bill.items)) continue;
    const recurring = bill.recurringChainId ? 'yes' : 'no';
    for (const item of bill.items) {
      if (!item || !Number.isFinite(item.amount) || item.amount === 0) continue;
      const cat = categoriesById && categoriesById.get(item.categoryId);
      const categoryName = cat ? cat.name : 'Uncategorized';
      const flow = (cat && cat.flow) || 'expense';
      const date = getItemDate(bill, item);
      rows.push({
        date,
        vendor: bill.vendor || '',
        description: item.description || '',
        amount: item.amount.toFixed(2),
        category: categoryName,
        flow,
        recurring,
      });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));

  const lines = [CSV_HEADER];
  for (const r of rows) {
    lines.push([
      escapeCsv(r.date),
      escapeCsv(r.vendor),
      escapeCsv(r.description),
      r.amount, // numeric — never needs escaping
      escapeCsv(r.category),
      r.flow,
      r.recurring,
    ].join(','));
  }
  return '﻿' + lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run src/exportArchive.test.js
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/exportArchive.js src/exportArchive.test.js
git commit -m "feat(reporting): buildItemsCsv — flat items.csv export with CSV escaping"
```

---

## Task 3: `buildDataJson` pure function (TDD)

**Files:**
- Modify: `src/exportArchive.js`
- Modify: `src/exportArchive.test.js`

- [ ] **Step 1: Append failing tests**

Append to `src/exportArchive.test.js`:

```js
import { buildDataJson } from './exportArchive.js';

describe('buildDataJson', () => {
  const fixedNow = new Date('2026-05-12T18:42:01.234Z');
  const bills = [{ id: 'b1', vendor: 'Chase', month: '2026-05', items: [], recurring: true, recurringChainId: 'rec_x' }];
  const categories = [{ id: 'c_food', name: 'Groceries', flow: 'expense', keywords: ['WHOLE'], templates: [], icon: '🛒', color: '#10B981', builtin: true }];
  const trackedKeywords = ['CHURCH'];

  it('returns parseable JSON with top-level keys in declared order', () => {
    const str = buildDataJson(bills, categories, trackedKeywords, 3, '1.0.0', fixedNow);
    const parsed = JSON.parse(str);
    expect(Object.keys(parsed)).toEqual([
      'schemaVersion', 'exportedAt', 'appVersion', 'bills', 'categories', 'trackedKeywords',
    ]);
  });

  it('uses the input schemaVersion as an integer', () => {
    const parsed = JSON.parse(buildDataJson(bills, categories, trackedKeywords, 3, '1.0.0', fixedNow));
    expect(parsed.schemaVersion).toBe(3);
  });

  it('formats exportedAt as ISO 8601 UTC', () => {
    const parsed = JSON.parse(buildDataJson(bills, categories, trackedKeywords, 3, '1.0.0', fixedNow));
    expect(parsed.exportedAt).toBe('2026-05-12T18:42:01.234Z');
  });

  it('preserves bills, categories, and trackedKeywords byte-identically', () => {
    const parsed = JSON.parse(buildDataJson(bills, categories, trackedKeywords, 3, '1.0.0', fixedNow));
    expect(parsed.bills).toEqual(bills);
    expect(parsed.categories).toEqual(categories);
    expect(parsed.trackedKeywords).toEqual(trackedKeywords);
  });

  it('handles empty trackedKeywords array', () => {
    const parsed = JSON.parse(buildDataJson(bills, categories, [], 3, '1.0.0', fixedNow));
    expect(parsed.trackedKeywords).toEqual([]);
  });

  it('serializes with 2-space indent (human-readable)', () => {
    const str = buildDataJson(bills, categories, trackedKeywords, 3, '1.0.0', fixedNow);
    expect(str).toContain('\n  "schemaVersion"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/exportArchive.test.js
```

Expected: 6 new tests FAIL (existing 8 pass). Failure message references `buildDataJson` not exported.

- [ ] **Step 3: Implement `buildDataJson`**

Append to `src/exportArchive.js`:

```js
export function buildDataJson(bills, categories, trackedKeywords, schemaVersion, appVersion, now) {
  const payload = {
    schemaVersion,
    exportedAt: now.toISOString(),
    appVersion,
    bills: bills || [],
    categories: categories || [],
    trackedKeywords: trackedKeywords || [],
  };
  return JSON.stringify(payload, null, 2);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run src/exportArchive.test.js
```

Expected: all 14 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/exportArchive.js src/exportArchive.test.js
git commit -m "feat(reporting): buildDataJson — schema-versioned data.json with stable key order"
```

---

## Task 4: `buildArchive` + zip roundtrip test (TDD)

**Files:**
- Modify: `src/exportArchive.js`
- Modify: `src/exportArchive.test.js`

- [ ] **Step 1: Append failing tests**

Append to `src/exportArchive.test.js`:

```js
import { buildArchive } from './exportArchive.js';
import { unzipSync, strFromU8 } from 'fflate';

describe('buildArchive', () => {
  const fixedNow = new Date('2026-05-12T18:42:01.234Z');
  const bills = [{ id: 'b1', vendor: 'Chase', month: '2026-05', items: [
    { id: 'i1', description: 'Coffee', amount: 5, categoryId: 'c_food', date: '2026-05-02' },
  ]}];
  const categories = [{ id: 'c_food', name: 'Groceries', flow: 'expense' }];
  const trackedKeywords = ['CHURCH'];

  it('returns a Uint8Array', () => {
    const bytes = buildArchive({ bills, categories, trackedKeywords, schemaVersion: 3, appVersion: '1.0.0', now: fixedNow });
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it('zip contains exactly data.json and items.csv', () => {
    const bytes = buildArchive({ bills, categories, trackedKeywords, schemaVersion: 3, appVersion: '1.0.0', now: fixedNow });
    const unzipped = unzipSync(bytes);
    expect(Object.keys(unzipped).sort()).toEqual(['data.json', 'items.csv']);
  });

  it('data.json round-trips through JSON.parse', () => {
    const bytes = buildArchive({ bills, categories, trackedKeywords, schemaVersion: 3, appVersion: '1.0.0', now: fixedNow });
    const unzipped = unzipSync(bytes);
    const data = JSON.parse(strFromU8(unzipped['data.json']));
    expect(data.schemaVersion).toBe(3);
    expect(data.bills).toEqual(bills);
  });

  it('items.csv starts with BOM and header row', () => {
    const bytes = buildArchive({ bills, categories, trackedKeywords, schemaVersion: 3, appVersion: '1.0.0', now: fixedNow });
    const unzipped = unzipSync(bytes);
    const csv = strFromU8(unzipped['items.csv']);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv.split('\n')[0].slice(1)).toBe('date,vendor,description,amount,category,flow,recurring');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/exportArchive.test.js
```

Expected: 4 new tests FAIL with `buildArchive is not exported`.

- [ ] **Step 3: Implement `buildArchive`**

Append to `src/exportArchive.js`:

```js
import { zipSync, strToU8 } from 'fflate';

export function buildArchive({ bills, categories, trackedKeywords, schemaVersion, appVersion, now }) {
  const categoriesById = new Map((categories || []).map(c => [c.id, c]));
  const jsonString = buildDataJson(bills, categories, trackedKeywords, schemaVersion, appVersion, now);
  const csvString  = buildItemsCsv(bills, categoriesById);
  return zipSync({
    'data.json': strToU8(jsonString),
    'items.csv': strToU8(csvString),
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run src/exportArchive.test.js
```

Expected: all 18 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/exportArchive.js src/exportArchive.test.js
git commit -m "feat(reporting): buildArchive — zipSync wrapper combining data.json + items.csv"
```

---

## Task 5: Wire `buildArchive` into App.jsx export button

**Files:**
- Modify: `src/App.jsx` (the `exportData` function, currently at ~line 1034; imports at line 9)

- [ ] **Step 1: Add the import**

In `src/App.jsx`, find the existing line:

```js
import { migrateBills, getItemDate, findRecurringCharges, findAutoRecurringChains, aggregateByKeyword, getMonthItems, getBillNet, shiftItemDate, computeCatchUp } from './spendingMath.js';
```

Add this line immediately after the imports block (after the `import './App.css';` line):

```js
import { buildArchive } from './exportArchive.js';
import pkg from '../package.json';
```

- [ ] **Step 2: Replace the `exportData` function**

Find the existing `exportData` function in `src/App.jsx`:

```js
const exportData = () => {
  const dataStr = JSON.stringify(bills, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `billtracker-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
```

Replace it with:

```js
const exportData = () => {
  const bytes = buildArchive({
    bills,
    categories: cats.categories,
    trackedKeywords,
    schemaVersion: 3,
    appVersion: pkg.version,
    now: new Date(),
  });
  const blob = new Blob([bytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `billtracker-${new Date().toISOString().split('T')[0]}.zip`;
  a.click();
  URL.revokeObjectURL(url);
};
```

- [ ] **Step 3: Run all tests to verify nothing broke**

```bash
npm test -- --run
```

Expected: all existing tests still pass. (The new `exportArchive` tests pass; no test directly exercises `exportData` since it touches the DOM.)

- [ ] **Step 4: Manual browser smoke**

```bash
npm run dev
```

In the browser:
- Click the `↗ Export` button in the header.
- A file `billtracker-2026-05-12.zip` downloads.
- Unzip it. Confirm there are exactly two files: `data.json` and `items.csv`.
- Open `data.json` in a text editor. Top-level keys appear in order: `schemaVersion`, `exportedAt`, `appVersion`, `bills`, `categories`, `trackedKeywords`.
- Open `items.csv` in a text editor. First line is the header row (after BOM).

Stop dev server with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(reporting): export emits ZIP bundle (data.json + items.csv) instead of bare JSON"
```

---

## Task 6: `aggregateYoYByCategory` (TDD)

**Files:**
- Create: `src/reportingMath.js`
- Create: `src/reportingMath.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/reportingMath.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { aggregateYoYByCategory } from './reportingMath.js';

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/reportingMath.test.js
```

Expected: FAIL with `Cannot find module './reportingMath.js'`.

- [ ] **Step 3: Implement `aggregateYoYByCategory`**

Create `src/reportingMath.js`:

```js
import { getItemDate } from './spendingMath.js';

const FLOW_ORDER = { income: 0, expense: 1, savings: 2 };

// today: "YYYY-MM" or "YYYY-MM-DD". Only year + month components are used.
export function aggregateYoYByCategory(bills, today, categoriesById) {
  if (!Array.isArray(bills) || bills.length === 0) return [];
  const yearStr = today.slice(0, 4);
  const monthStr = today.slice(5, 7);
  const currentYear = parseInt(yearStr, 10);
  const priorYear = currentYear - 1;
  const upperMonth = monthStr; // inclusive cap

  // Per-category totals: { categoryId → { current, prior } }
  const totals = new Map();
  for (const bill of bills) {
    if (!bill || !Array.isArray(bill.items)) continue;
    for (const item of bill.items) {
      if (!item || !Number.isFinite(item.amount) || item.amount === 0) continue;
      const cid = item.categoryId;
      if (!cid || !categoriesById || !categoriesById.has(cid)) continue;
      const date = getItemDate(bill, item);
      const itemYear = parseInt(date.slice(0, 4), 10);
      const itemMonth = date.slice(5, 7);
      if (itemMonth > upperMonth) continue; // outside the window in both years
      let bucket;
      if (itemYear === currentYear) bucket = 'current';
      else if (itemYear === priorYear) bucket = 'prior';
      else continue;
      let entry = totals.get(cid);
      if (!entry) { entry = { current: 0, prior: 0 }; totals.set(cid, entry); }
      entry[bucket] += item.amount;
    }
  }

  const rows = [];
  for (const [categoryId, { current, prior }] of totals) {
    if (current === 0 && prior === 0) continue;
    const cat = categoriesById.get(categoryId);
    const deltaAbs = current - prior;
    const deltaPct = prior === 0 ? null : Math.round((deltaAbs / Math.abs(prior)) * 100);
    rows.push({
      categoryId,
      name: cat.name,
      flow: cat.flow || 'expense',
      currentYTD: current,
      priorYTD: prior,
      deltaPct,
      deltaAbs,
    });
  }

  rows.sort((a, b) => {
    const fa = FLOW_ORDER[a.flow] ?? 1;
    const fb = FLOW_ORDER[b.flow] ?? 1;
    if (fa !== fb) return fa - fb;
    return Math.abs(b.currentYTD) - Math.abs(a.currentYTD);
  });
  return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run src/reportingMath.test.js
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/reportingMath.js src/reportingMath.test.js
git commit -m "feat(reporting): aggregateYoYByCategory — YTD vs same-period-last-year per category"
```

---

## Task 7: `aggregateMonthByCategory` (TDD)

**Files:**
- Modify: `src/reportingMath.js`
- Modify: `src/reportingMath.test.js`

- [ ] **Step 1: Append failing tests**

Append to `src/reportingMath.test.js`:

```js
import { aggregateMonthByCategory } from './reportingMath.js';

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/reportingMath.test.js
```

Expected: 6 new tests FAIL with `aggregateMonthByCategory is not exported`.

- [ ] **Step 3: Implement `aggregateMonthByCategory`**

First, extend the import at the top of `src/reportingMath.js`. Find:

```js
import { getItemDate } from './spendingMath.js';
```

Replace with:

```js
import { getItemDate, getMonthWindow } from './spendingMath.js';
```

Then append this function to the end of `src/reportingMath.js`:

```js
export function aggregateMonthByCategory(bills, endMonth, categoryId) {
  const window = getMonthWindow(endMonth);
  const buckets = window.map(m => ({ month: m, total: 0 }));
  const byMonth = new Map(buckets.map(b => [b.month, b]));

  for (const bill of bills || []) {
    if (!bill || !Array.isArray(bill.items)) continue;
    for (const item of bill.items) {
      if (!item || !Number.isFinite(item.amount) || item.amount === 0) continue;
      if (item.categoryId !== categoryId) continue;
      const date = getItemDate(bill, item);
      const m = date.slice(0, 7);
      const bucket = byMonth.get(m);
      if (bucket) bucket.total += item.amount;
    }
  }
  return buckets;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run src/reportingMath.test.js
```

Expected: all 14 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/reportingMath.js src/reportingMath.test.js
git commit -m "feat(reporting): aggregateMonthByCategory — 12-month series for a single category"
```

---

## Task 8: `partitionSpentByRecurring` (TDD)

**Files:**
- Modify: `src/reportingMath.js`
- Modify: `src/reportingMath.test.js`

- [ ] **Step 1: Append failing tests**

Append to `src/reportingMath.test.js`:

```js
import { partitionSpentByRecurring } from './reportingMath.js';

describe('partitionSpentByRecurring', () => {
  it('puts bills with recurringChainId into recurring', () => {
    const bills = [
      { id: 'b1', vendor: 'Honda', month: '2026-05', recurringChainId: 'rec_x',
        items: [{ id: 'i1', description: 'Loan', amount: 470, categoryId: 'c_food', date: '2026-05-15' }] },
    ];
    const result = partitionSpentByRecurring(bills, '2026-05', catsById);
    expect(result.recurring).toBe(470);
    expect(result.oneOff).toBe(0);
    expect(result.total).toBe(470);
  });

  it('puts bills without recurringChainId into oneOff', () => {
    const bills = [
      { id: 'b1', vendor: 'Coffee', month: '2026-05',
        items: [{ id: 'i1', description: 'Latte', amount: 5, categoryId: 'c_food', date: '2026-05-02' }] },
    ];
    const result = partitionSpentByRecurring(bills, '2026-05', catsById);
    expect(result.recurring).toBe(0);
    expect(result.oneOff).toBe(5);
    expect(result.total).toBe(5);
  });

  it('excludes income and savings flows', () => {
    const bills = [
      { id: 'b1', vendor: 'Acme', month: '2026-05', items: [
        { id: 'i1', description: 'Pay',  amount: 5000, categoryId: 'c_pay',  date: '2026-05-15' },
        { id: 'i2', description: '401k', amount:  260, categoryId: 'c_401k', date: '2026-05-15' },
        { id: 'i3', description: 'Food', amount:  100, categoryId: 'c_food', date: '2026-05-10' },
      ]},
    ];
    const result = partitionSpentByRecurring(bills, '2026-05', catsById);
    expect(result.oneOff).toBe(100);
    expect(result.recurring).toBe(0);
  });

  it('refunds reduce within the matching bucket', () => {
    const bills = [
      { id: 'b1', vendor: 'Chase', month: '2026-05', items: [
        { id: 'i1', description: 'Whole Foods',        amount: 100, categoryId: 'c_food', date: '2026-05-02' },
        { id: 'i2', description: 'Whole Foods refund', amount: -30, categoryId: 'c_food', date: '2026-05-12' },
      ]},
    ];
    const result = partitionSpentByRecurring(bills, '2026-05', catsById);
    expect(result.oneOff).toBe(70);
  });

  it('only includes items in the specified month', () => {
    const bills = [
      { id: 'b1', vendor: 'Coffee', month: '2026-05',
        items: [{ id: 'i1', description: 'L', amount: 5, categoryId: 'c_food', date: '2026-05-02' }] },
      { id: 'b2', vendor: 'Coffee', month: '2026-04',
        items: [{ id: 'i2', description: 'L', amount: 99, categoryId: 'c_food', date: '2026-04-02' }] },
    ];
    const result = partitionSpentByRecurring(bills, '2026-05', catsById);
    expect(result.total).toBe(5);
  });

  it('empty input returns zero buckets', () => {
    expect(partitionSpentByRecurring([], '2026-05', catsById)).toEqual({ recurring: 0, oneOff: 0, total: 0 });
  });

  it('total invariant: total === recurring + oneOff', () => {
    const bills = [
      { id: 'b1', vendor: 'Honda', month: '2026-05', recurringChainId: 'rec_x',
        items: [{ id: 'i1', description: 'Loan', amount: 470, categoryId: 'c_food', date: '2026-05-15' }] },
      { id: 'b2', vendor: 'Coffee', month: '2026-05',
        items: [{ id: 'i2', description: 'Latte', amount: 5, categoryId: 'c_food', date: '2026-05-02' }] },
    ];
    const result = partitionSpentByRecurring(bills, '2026-05', catsById);
    expect(result.total).toBe(result.recurring + result.oneOff);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/reportingMath.test.js
```

Expected: 7 new tests FAIL with `partitionSpentByRecurring is not exported`.

- [ ] **Step 3: Implement `partitionSpentByRecurring`**

Append to `src/reportingMath.js`:

```js
export function partitionSpentByRecurring(bills, month, categoriesById) {
  let recurring = 0;
  let oneOff = 0;
  for (const bill of bills || []) {
    if (!bill || !Array.isArray(bill.items)) continue;
    const isRecurring = !!bill.recurringChainId;
    for (const item of bill.items) {
      if (!item || !Number.isFinite(item.amount) || item.amount === 0) continue;
      const date = getItemDate(bill, item);
      if (date.slice(0, 7) !== month) continue;
      const cat = categoriesById && categoriesById.get(item.categoryId);
      const flow = (cat && cat.flow) || 'expense';
      if (flow !== 'expense') continue;
      if (isRecurring) recurring += item.amount;
      else oneOff += item.amount;
    }
  }
  return { recurring, oneOff, total: recurring + oneOff };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run src/reportingMath.test.js
```

Expected: all 21 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/reportingMath.js src/reportingMath.test.js
git commit -m "feat(reporting): partitionSpentByRecurring — split monthly Spent into recurring vs one-off"
```

---

## Task 9: Dashboard Spent card inline split

**Files:**
- Modify: `src/App.jsx` (SummaryCard component at ~line 313, stats-grid render at ~line 1266, imports at line 9)
- Modify: `src/App.css` (add `.spent-split-bar` styles)

- [ ] **Step 1: Add the import**

In `src/App.jsx`, find the existing line:

```js
import { migrateBills, getItemDate, findRecurringCharges, findAutoRecurringChains, aggregateByKeyword, getMonthItems, getBillNet, shiftItemDate, computeCatchUp } from './spendingMath.js';
```

Add this line immediately after:

```js
import { partitionSpentByRecurring } from './reportingMath.js';
```

- [ ] **Step 2: Extend `SummaryCard` to render the split bar**

Find the existing `SummaryCard` component (around line 313):

```jsx
const SummaryCard = ({ title, amount, isCount, colorKey, delta }) => (
  <div className={`stat-card stat-card-${colorKey}`}>
    <div className="stat-label">
      <div className={`stat-dot stat-dot-${colorKey}`} />
      {title}
    </div>
    <div className="stat-value">
      {isCount ? amount : formatCurrency(amount)}
    </div>
    {delta && (
      <div className={`stat-delta stat-delta-${delta.direction}`}>
        {delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '·'} {delta.pct}%
        <span className="stat-delta-ref"> vs {delta.prevLabel}</span>
      </div>
    )}
  </div>
);
```

Replace it with:

```jsx
const SummaryCard = ({ title, amount, isCount, colorKey, delta, split }) => {
  const showSplit = split && split.total > 0;
  const recPct = showSplit ? (split.recurring / split.total) * 100 : 0;
  return (
    <div className={`stat-card stat-card-${colorKey}`}>
      <div className="stat-label">
        <div className={`stat-dot stat-dot-${colorKey}`} />
        {title}
      </div>
      <div className="stat-value">
        {isCount ? amount : formatCurrency(amount)}
      </div>
      {delta && (
        <div className={`stat-delta stat-delta-${delta.direction}`}>
          {delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '·'} {delta.pct}%
          <span className="stat-delta-ref"> vs {delta.prevLabel}</span>
        </div>
      )}
      {showSplit && (
        <>
          <div className="spent-split-bar">
            <div className="spent-split-recurring" style={{ width: `${recPct}%` }} />
          </div>
          <div className="spent-split-labels">
            <span><span className="spent-split-dot-recurring" /> recurring {formatCurrency(split.recurring)}</span>
            <span><span className="spent-split-dot-oneoff" /> one-off {formatCurrency(split.oneOff)}</span>
          </div>
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Compute `spentSplit` in `BillTracker` and pass to the Spent card**

Find the section in `BillTracker` (the main component, around line 714) that computes `selectedMonthIncome` / `selectedMonthSpent` etc. After those lines, add:

```js
const spentSplit = useMemo(
  () => partitionSpentByRecurring(bills, selectedMonth, categoriesById),
  [bills, selectedMonth, categoriesById]
);
```

Then find the `stats-grid` block (around line 1266):

```jsx
<div className="stats-grid">
  <SummaryCard title="Income" amount={selectedMonthIncome} colorKey="green" />
  <SummaryCard title="Spent"  amount={selectedMonthSpent}  colorKey="red"   delta={monthDelta} />
  <SummaryCard title="Saved"  amount={selectedMonthSaved}  colorKey="blue"  />
  <SummaryCard title="Net"    amount={selectedMonthNet}    colorKey="amber" />
</div>
```

Replace the Spent card with:

```jsx
<SummaryCard title="Spent"  amount={selectedMonthSpent}  colorKey="red"   delta={monthDelta} split={spentSplit} />
```

- [ ] **Step 4: Replace the split-bar markup with a clean two-div pattern**

Go back to the `SummaryCard` you wrote in Step 2 and replace the single-div split bar with two explicit divs (one for recurring, one for one-off). Find this fragment inside `SummaryCard`:

```jsx
{showSplit && (
  <>
    <div className="spent-split-bar">
      <div className="spent-split-recurring" style={{ width: `${recPct}%` }} />
    </div>
    <div className="spent-split-labels">
```

Replace with:

```jsx
{showSplit && (
  <>
    <div className="spent-split-bar">
      <div className="spent-split-recurring" style={{ width: `${recPct}%` }} />
      <div className="spent-split-oneoff" style={{ width: `${100 - recPct}%` }} />
    </div>
    <div className="spent-split-labels">
```

- [ ] **Step 5: Add CSS for the split bar**

Append to `src/App.css`:

```css
.spent-split-bar {
  margin-top: 8px;
  height: 4px;
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 2px;
  overflow: hidden;
  display: flex;
}
.spent-split-recurring {
  background: #5b8dff;
  height: 100%;
}
.spent-split-oneoff {
  background: #a47dea;
  height: 100%;
}
.spent-split-labels {
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: #9aa3b2;
  font-family: 'JetBrains Mono', monospace;
}
.spent-split-dot-recurring,
.spent-split-dot-oneoff {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 3px;
  vertical-align: middle;
}
.spent-split-dot-recurring { background: #5b8dff; }
.spent-split-dot-oneoff    { background: #a47dea; }
```

- [ ] **Step 6: Run all existing tests to confirm nothing broke**

```bash
npm test -- --run
```

Expected: all existing tests pass (no test directly covers SummaryCard UI; the math is tested via `partitionSpentByRecurring` in Task 8).

- [ ] **Step 7: Manual browser smoke**

```bash
npm run dev
```

In the browser:
- The Spent card now has a thin stacked bar under the value, plus two labels (e.g., `recurring $3,180 / one-off $2,240`).
- Income / Saved / Net cards are unchanged.
- If `bills` is empty, the Spent card renders without the split bar (no zero-divide).
- Switch months via the header MonthToggle — the split bar updates with `selectedMonth`.

Stop dev server with Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat(reporting): inline recurring/one-off split bar on dashboard Spent card"
```

---

## Task 10: ReportsScreen skeleton + toolbar button + screen routing

**Files:**
- Create: `src/ReportsScreen.jsx`
- Create: `src/ReportsScreen.test.jsx`
- Modify: `src/App.jsx` (toolbar at ~line 1244, screen branches at ~line 1049, imports)
- Modify: `src/App.css` (reports-screen, tabs styles)

- [ ] **Step 1: Write the failing component test**

Create `src/ReportsScreen.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReportsScreen from './ReportsScreen.jsx';

describe('ReportsScreen — skeleton', () => {
  it('renders three tab buttons with role=tab', () => {
    render(<ReportsScreen bills={[]} categories={[]} categoriesById={new Map()} selectedMonth="2026-05" onClose={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(3);
    expect(tabs.map(t => t.textContent.trim())).toEqual(['Year-over-year', 'Month trend', 'Recurring breakdown']);
  });

  it('opens on the Year-over-year tab', () => {
    render(<ReportsScreen bills={[]} categories={[]} categoriesById={new Map()} selectedMonth="2026-05" onClose={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(tabs[2].getAttribute('aria-selected')).toBe('false');
  });

  it('clicking a tab switches aria-selected', () => {
    render(<ReportsScreen bills={[]} categories={[]} categoriesById={new Map()} selectedMonth="2026-05" onClose={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[1]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    render(<ReportsScreen bills={[]} categories={[]} categoriesById={new Map()} selectedMonth="2026-05" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ESC key calls onClose', () => {
    const onClose = vi.fn();
    render(<ReportsScreen bills={[]} categories={[]} categoriesById={new Map()} selectedMonth="2026-05" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/ReportsScreen.test.jsx
```

Expected: FAIL with `Cannot find module './ReportsScreen.jsx'`.

- [ ] **Step 3: Implement the skeleton**

Create `src/ReportsScreen.jsx`:

```jsx
import React, { useState, useEffect } from 'react';

const TABS = [
  { id: 'yoy',       label: 'Year-over-year' },
  { id: 'month',     label: 'Month trend' },
  { id: 'recurring', label: 'Recurring breakdown' },
];

export default function ReportsScreen({ bills, categories, categoriesById, selectedMonth, onClose }) {
  const [activeTab, setActiveTab] = useState('yoy');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="reports-screen">
      <div className="reports-header">
        <h1 className="reports-title">Reports</h1>
        <button onClick={onClose} className="btn-icon" aria-label="Close reports">×</button>
      </div>

      <div className="reports-tabs" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`reports-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="reports-body">
        {activeTab === 'yoy' && <div className="reports-tab-content" data-testid="tab-yoy">YoY content placeholder</div>}
        {activeTab === 'month' && <div className="reports-tab-content" data-testid="tab-month">Month trend content placeholder</div>}
        {activeTab === 'recurring' && <div className="reports-tab-content" data-testid="tab-recurring">Recurring breakdown content placeholder</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the toolbar button + screen branch in App.jsx**

In `src/App.jsx`:

a) Add the import after the existing imports block:

```js
import ReportsScreen from './ReportsScreen.jsx';
```

b) Find the toolbar buttons section (around line 1244):

```jsx
<button
  type="button"
  onClick={() => setScreen('manage-categories')}
  className="btn"
  aria-label="Manage Categories"
>
  ☰ Categories
</button>
<button
  onClick={undo}
  ...
```

Add a new Reports button immediately AFTER the Categories button (before the Undo button):

```jsx
<button
  type="button"
  onClick={() => setScreen('reports')}
  className="btn btn-reports"
  aria-label="Open reports"
>
  📊 Reports
</button>
```

c) Find the manage-categories screen branch (around line 1049):

```jsx
{screen === 'manage-categories' && (
  <ManageCategoriesScreen
    ...
  />
)}
```

Add a new branch immediately after it:

```jsx
{screen === 'reports' && (
  <ReportsScreen
    bills={bills}
    categories={cats.categories}
    categoriesById={categoriesById}
    selectedMonth={selectedMonth}
    onClose={() => setScreen('main')}
  />
)}
```

- [ ] **Step 5: Add CSS for the reports screen**

Append to `src/App.css`:

```css
.reports-screen {
  position: fixed;
  inset: 0;
  background: #0b0e16;
  z-index: 100;
  overflow-y: auto;
  padding: 24px 32px;
}
.reports-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.reports-title {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 32px;
  margin: 0;
}
.reports-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 20px;
}
.reports-tab {
  background: transparent;
  border: 0;
  color: #9aa3b2;
  font-size: 13px;
  padding: 10px 18px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  font-family: 'Outfit', sans-serif;
}
.reports-tab:hover { color: #d4a853; }
.reports-tab.active {
  color: #d4a853;
  border-bottom-color: #d4a853;
}
.reports-tab-content {
  font-family: 'Outfit', sans-serif;
}
.btn-reports {
  background: rgba(212, 168, 83, 0.12);
  color: #d4a853;
  border-color: rgba(212, 168, 83, 0.35);
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test -- --run src/ReportsScreen.test.jsx
```

Expected: all 5 tests pass.

- [ ] **Step 7: Manual browser smoke**

```bash
npm run dev
```

In the browser:
- The header has a new `📊 Reports` button.
- Click it — a full-screen Reports view appears.
- Three tabs at the top: Year-over-year (active), Month trend, Recurring breakdown.
- Click each tab — content swaps to the placeholder text for that tab.
- Click the × button OR press ESC — returns to the main dashboard.

Stop dev server with Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add src/ReportsScreen.jsx src/ReportsScreen.test.jsx src/App.jsx src/App.css
git commit -m "feat(reporting): ReportsScreen skeleton + toolbar button + tab switching"
```

---

## Task 11: YoY tab content

**Files:**
- Modify: `src/ReportsScreen.jsx`
- Modify: `src/ReportsScreen.test.jsx`
- Modify: `src/App.css` (yoy-table styles)

- [ ] **Step 1: Append failing tests**

Append to `src/ReportsScreen.test.jsx`:

```jsx
const cats = [
  { id: 'c_food', name: 'Groceries', flow: 'expense' },
  { id: 'c_util', name: 'Utilities', flow: 'expense' },
  { id: 'c_pay',  name: 'Paycheck',  flow: 'income'  },
];
const catsById = new Map(cats.map(c => [c.id, c]));

describe('ReportsScreen — Year-over-year tab', () => {
  it('shows "Not enough history yet" when bills have less than 13 months of data', () => {
    const bills = [
      { id: 'b1', vendor: 'V', month: '2026-04', items: [
        { id: 'i1', description: 'A', amount: 100, categoryId: 'c_food', date: '2026-04-15' },
      ]},
    ];
    render(<ReportsScreen bills={bills} categories={cats} categoriesById={catsById} selectedMonth="2026-05" onClose={() => {}} />);
    expect(screen.getByText(/Not enough history yet/i)).toBeTruthy();
  });

  it('renders rows grouped by flow when there is data', () => {
    const bills = [];
    for (let y of [2025, 2026]) {
      bills.push({ id: `b_${y}`, vendor: 'V', month: `${y}-04`, items: [
        { id: `i_${y}_1`, description: 'Food', amount: 100, categoryId: 'c_food', date: `${y}-04-15` },
        { id: `i_${y}_2`, description: 'Util', amount:  50, categoryId: 'c_util', date: `${y}-04-15` },
      ]});
    }
    render(<ReportsScreen bills={bills} categories={cats} categoriesById={catsById} selectedMonth="2026-05" onClose={() => {}} />);
    const tab = screen.getByTestId('tab-yoy');
    expect(tab.textContent).toContain('Groceries');
    expect(tab.textContent).toContain('Utilities');
    expect(tab.textContent).toContain('Expense');
  });

  it('renders — for priorYTD when there is no apples-to-apples comparison', () => {
    const bills = [];
    // 14 months of bills so we pass the "not enough history" gate
    for (let i = 0; i < 14; i++) {
      const y = 2025 + Math.floor((i + 5) / 12);
      const m = ((i + 5) % 12) + 1;
      const month = `${y}-${String(m).padStart(2, '0')}`;
      bills.push({ id: `b${i}`, vendor: 'V', month, items: [] });
    }
    // Only current-year food data — no prior-year
    bills.push({ id: 'cur', vendor: 'V', month: '2026-04', items: [
      { id: 'icur', description: 'A', amount: 100, categoryId: 'c_food', date: '2026-04-15' },
    ]});
    render(<ReportsScreen bills={bills} categories={cats} categoriesById={catsById} selectedMonth="2026-05" onClose={() => {}} />);
    const tab = screen.getByTestId('tab-yoy');
    expect(tab.textContent).toContain('—');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/ReportsScreen.test.jsx
```

Expected: 3 new tests FAIL — the YoY tab still renders only placeholder text.

- [ ] **Step 3: Implement the YoY tab**

In `src/ReportsScreen.jsx`, at the top of the file, add imports:

```jsx
import { aggregateYoYByCategory } from './reportingMath.js';
```

Add a helper near the top of the file (above `TABS`):

```jsx
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function uniqueMonthsCount(bills) {
  const set = new Set();
  for (const b of bills || []) if (b && b.month) set.add(b.month);
  return set.size;
}

const FLOW_LABELS = { income: 'Income', expense: 'Expense', savings: 'Savings' };

const formatCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

function YoyTab({ bills, categoriesById }) {
  const monthsCount = uniqueMonthsCount(bills);
  if (monthsCount < 13) {
    return (
      <div className="reports-tab-content" data-testid="tab-yoy">
        <p className="reports-empty">Not enough history yet — come back when you have a full year of data.</p>
      </div>
    );
  }

  const today = currentMonth();
  const todayLabel = new Date(`${today}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const priorWindowStart = `${parseInt(today.slice(0, 4), 10) - 1}-01`;
  const priorWindowEnd   = `${parseInt(today.slice(0, 4), 10) - 1}-${today.slice(5, 7)}`;
  const priorLabel = `${new Date(`${priorWindowStart}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short' })}–${new Date(`${priorWindowEnd}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;

  const rows = aggregateYoYByCategory(bills, today, categoriesById);

  // Group rows by flow.
  const byFlow = { income: [], expense: [], savings: [] };
  for (const r of rows) (byFlow[r.flow] || byFlow.expense).push(r);

  return (
    <div className="reports-tab-content" data-testid="tab-yoy">
      <p className="reports-subtitle">YTD through {todayLabel} vs {priorLabel}</p>
      <table className="yoy-table">
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">Current</th>
            <th className="num">Prior</th>
            <th className="num">Δ%</th>
          </tr>
        </thead>
        <tbody>
          {['income', 'expense', 'savings'].map(flow => (
            byFlow[flow].length > 0 ? (
              <React.Fragment key={flow}>
                <tr className="yoy-flow-header"><td colSpan={4}>{FLOW_LABELS[flow]}</td></tr>
                {byFlow[flow].map(r => (
                  <tr key={r.categoryId}>
                    <td>{r.name}</td>
                    <td className="num">{formatCurrency(r.currentYTD)}</td>
                    <td className="num">{formatCurrency(r.priorYTD)}</td>
                    <td className={`num delta-${r.deltaPct == null ? 'flat' : r.deltaPct > 0 ? 'up' : 'down'}`}>
                      {r.deltaPct == null ? '—' : `${r.deltaPct > 0 ? '+' : ''}${r.deltaPct}%`}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ) : null
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Then replace the YoY placeholder in `ReportsScreen`'s body:

```jsx
{activeTab === 'yoy' && <YoyTab bills={bills} categoriesById={categoriesById} />}
```

- [ ] **Step 4: Add YoY-table CSS**

Append to `src/App.css`:

```css
.reports-subtitle {
  color: #9aa3b2;
  font-size: 12px;
  font-family: 'Outfit', sans-serif;
  margin: 0 0 16px;
}
.reports-empty {
  color: #9aa3b2;
  font-size: 13px;
  text-align: center;
  padding: 40px 0;
  font-family: 'Outfit', sans-serif;
}
.yoy-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
}
.yoy-table th {
  text-align: left;
  font-weight: 500;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9aa3b2;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.yoy-table th.num,
.yoy-table td.num {
  text-align: right;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: -0.02em;
}
.yoy-table td {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.yoy-table .yoy-flow-header td {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #d4a853;
  padding-top: 16px;
  padding-bottom: 4px;
  border: 0;
}
.yoy-table .delta-up    { color: #e0928a; }
.yoy-table .delta-down  { color: #6BD49A; }
.yoy-table .delta-flat  { color: #9aa3b2; }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- --run src/ReportsScreen.test.jsx
```

Expected: all 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ReportsScreen.jsx src/ReportsScreen.test.jsx src/App.css
git commit -m "feat(reporting): Year-over-year tab — grouped table + empty state"
```

---

## Task 12: Month trend tab content

**Files:**
- Modify: `src/ReportsScreen.jsx`
- Modify: `src/ReportsScreen.test.jsx`
- Modify: `src/App.css` (month-trend-chart styles)

- [ ] **Step 1: Append failing tests**

Append to `src/ReportsScreen.test.jsx`:

```jsx
describe('ReportsScreen — Month trend tab', () => {
  const bills = [
    { id: 'b1', vendor: 'V', month: '2026-04', items: [
      { id: 'i1', description: 'F', amount: 100, categoryId: 'c_food', date: '2026-04-10' },
      { id: 'i2', description: 'U', amount:  50, categoryId: 'c_util', date: '2026-04-15' },
    ]},
  ];

  it('renders the category picker grouped by flow', () => {
    render(<ReportsScreen bills={bills} categories={cats} categoriesById={catsById} selectedMonth="2026-05" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Month trend' }));
    const picker = screen.getByTestId('month-trend-picker');
    expect(picker.querySelectorAll('optgroup').length).toBe(3);
  });

  it('defaults to the first expense-flow category', () => {
    render(<ReportsScreen bills={bills} categories={cats} categoriesById={catsById} selectedMonth="2026-05" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Month trend' }));
    const picker = screen.getByTestId('month-trend-picker');
    expect(picker.value).toBe('c_food');
  });

  it('changing the picker updates the chart', () => {
    render(<ReportsScreen bills={bills} categories={cats} categoriesById={catsById} selectedMonth="2026-05" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Month trend' }));
    const picker = screen.getByTestId('month-trend-picker');
    fireEvent.change(picker, { target: { value: 'c_util' } });
    expect(picker.value).toBe('c_util');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/ReportsScreen.test.jsx
```

Expected: 3 new tests FAIL.

- [ ] **Step 3: Implement the Month trend tab**

In `src/ReportsScreen.jsx`, add the import:

```jsx
import { aggregateMonthByCategory } from './reportingMath.js';
```

Add the component (below `YoyTab`):

```jsx
const formatMonthShort = (month) => {
  const [y, m] = month.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
};

function MonthTrendTab({ bills, categories, categoriesById }) {
  const firstExpense = (categories || []).find(c => c.flow === 'expense');
  const defaultCatId = firstExpense ? firstExpense.id : (categories && categories[0] && categories[0].id) || null;
  const [categoryId, setCategoryId] = React.useState(defaultCatId);

  const endMonth = currentMonth();
  const series = aggregateMonthByCategory(bills, endMonth, categoryId);
  const max = Math.max(...series.map(b => b.total), 1);
  const avg = series.reduce((s, b) => s + b.total, 0) / 12;

  // Group categories by flow for the picker.
  const groups = { income: [], expense: [], savings: [] };
  for (const c of categories || []) (groups[c.flow] || groups.expense).push(c);

  return (
    <div className="reports-tab-content" data-testid="tab-month">
      <select
        data-testid="month-trend-picker"
        className="month-trend-picker"
        value={categoryId || ''}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        {['income', 'expense', 'savings'].map(flow => (
          groups[flow].length > 0 ? (
            <optgroup key={flow} label={FLOW_LABELS[flow]}>
              {groups[flow].map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ) : null
        ))}
      </select>
      <div className="month-trend-chart">
        {series.map(b => {
          const pct = (b.total / max) * 88;
          return (
            <div key={b.month} className="month-trend-bar" title={`${b.month} — ${formatCurrency(b.total)}`}>
              <div className="month-trend-bar-fill" style={{ height: `${pct}%` }} />
              <span className="month-trend-bar-label">{formatMonthShort(b.month)}</span>
            </div>
          );
        })}
      </div>
      <p className="reports-subtitle">avg {formatCurrency(avg)}/mo · last 12 months</p>
    </div>
  );
}
```

Replace the Month trend placeholder in `ReportsScreen`'s body:

```jsx
{activeTab === 'month' && <MonthTrendTab bills={bills} categories={categories} categoriesById={categoriesById} />}
```

- [ ] **Step 4: Add month-trend CSS**

Append to `src/App.css`:

```css
.month-trend-picker {
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.04);
  color: #e8eaed;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 6px 12px;
  border-radius: 4px;
  margin-bottom: 16px;
}
.month-trend-chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 200px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  margin-bottom: 8px;
}
.month-trend-bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  height: 100%;
}
.month-trend-bar-fill {
  width: 100%;
  background: #a47dea;
  border-radius: 2px 2px 0 0;
  min-height: 2px;
}
.month-trend-bar-label {
  font-size: 10px;
  color: #9aa3b2;
  margin-top: 4px;
  font-family: 'Outfit', sans-serif;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- --run src/ReportsScreen.test.jsx
```

Expected: all 11 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ReportsScreen.jsx src/ReportsScreen.test.jsx src/App.css
git commit -m "feat(reporting): Month trend tab — 12-month series with category picker"
```

---

## Task 13: Recurring breakdown tab content

**Files:**
- Modify: `src/ReportsScreen.jsx`
- Modify: `src/ReportsScreen.test.jsx`
- Modify: `src/App.css` (recurring-breakdown styles)

- [ ] **Step 1: Append failing tests**

Append to `src/ReportsScreen.test.jsx`:

```jsx
describe('ReportsScreen — Recurring breakdown tab', () => {
  it('shows the partition header bar with recurring + one-off totals', () => {
    const bills = [
      { id: 'b1', vendor: 'Honda', month: '2026-05', recurringChainId: 'rec_x',
        items: [{ id: 'i1', description: 'Loan', amount: 470, categoryId: 'c_food', date: '2026-05-15' }] },
      { id: 'b2', vendor: 'Coffee', month: '2026-05',
        items: [{ id: 'i2', description: 'L', amount: 30, categoryId: 'c_food', date: '2026-05-02' }] },
    ];
    render(<ReportsScreen bills={bills} categories={cats} categoriesById={catsById} selectedMonth="2026-05" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Recurring breakdown' }));
    const tab = screen.getByTestId('tab-recurring');
    expect(tab.textContent).toContain('$470');
    expect(tab.textContent).toContain('$30');
  });

  it('lists active recurring chains with vendor name', () => {
    const bills = [
      { id: 'b1', vendor: 'Honda', month: '2026-04', recurring: true, recurringChainId: 'rec_x',
        items: [{ id: 'i1', description: 'Loan', amount: 470, categoryId: 'c_food', date: '2026-04-15' }] },
      { id: 'b2', vendor: 'Honda', month: '2026-05', recurring: true, recurringChainId: 'rec_x',
        items: [{ id: 'i2', description: 'Loan', amount: 470, categoryId: 'c_food', date: '2026-05-15' }] },
    ];
    render(<ReportsScreen bills={bills} categories={cats} categoriesById={catsById} selectedMonth="2026-05" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Recurring breakdown' }));
    const tab = screen.getByTestId('tab-recurring');
    expect(tab.textContent).toContain('Honda');
  });

  it('shows empty-state message when there are no active chains', () => {
    const bills = [
      { id: 'b1', vendor: 'Coffee', month: '2026-05',
        items: [{ id: 'i1', description: 'L', amount: 5, categoryId: 'c_food', date: '2026-05-02' }] },
    ];
    render(<ReportsScreen bills={bills} categories={cats} categoriesById={catsById} selectedMonth="2026-05" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Recurring breakdown' }));
    expect(screen.getByText(/No active recurring bills yet/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/ReportsScreen.test.jsx
```

Expected: 3 new tests FAIL.

- [ ] **Step 3: Implement the Recurring breakdown tab**

In `src/ReportsScreen.jsx`, add the imports:

```jsx
import { partitionSpentByRecurring } from './reportingMath.js';
import { findAutoRecurringChains } from './spendingMath.js';
```

Add the component (below `MonthTrendTab`):

```jsx
function RecurringBreakdownTab({ bills, categoriesById, selectedMonth }) {
  const partition = partitionSpentByRecurring(bills, selectedMonth, categoriesById);
  const chains = findAutoRecurringChains(bills, categoriesById);
  const recPct = partition.total > 0 ? (partition.recurring / partition.total) * 100 : 0;

  const byFlow = { income: [], expense: [], savings: [] };
  for (const c of chains) (byFlow[c.flow] || byFlow.expense).push(c);

  return (
    <div className="reports-tab-content" data-testid="tab-recurring">
      <p className="reports-subtitle">Spent breakdown for {selectedMonth}</p>
      <div className="recurring-partition-bar">
        <div className="recurring-partition-recurring" style={{ width: `${recPct}%` }}>
          {recPct > 12 && <span>{formatCurrency(partition.recurring)}</span>}
        </div>
        <div className="recurring-partition-oneoff" style={{ width: `${100 - recPct}%` }}>
          {100 - recPct > 12 && <span>{formatCurrency(partition.oneOff)}</span>}
        </div>
      </div>
      <div className="recurring-partition-legend">
        <span><span className="spent-split-dot-recurring" /> recurring</span>
        <span><span className="spent-split-dot-oneoff" /> one-off</span>
      </div>

      {chains.length === 0 ? (
        <p className="reports-empty">No active recurring bills yet — toggle a bill to recurring or click Make recurring on an inferred pattern.</p>
      ) : (
        <table className="yoy-table" style={{ marginTop: 24 }}>
          <thead>
            <tr>
              <th>Vendor</th>
              <th className="num">Months</th>
              <th className="num">Last</th>
              <th className="num">Avg</th>
            </tr>
          </thead>
          <tbody>
            {['income', 'expense', 'savings'].map(flow => (
              byFlow[flow].length > 0 ? (
                <React.Fragment key={flow}>
                  <tr className="yoy-flow-header"><td colSpan={4}>{FLOW_LABELS[flow]}</td></tr>
                  {byFlow[flow].map(c => (
                    <tr key={c.chainId}>
                      <td>{c.vendor}</td>
                      <td className="num">{c.monthCount}</td>
                      <td className="num">{formatCurrency(c.lastAmount)}</td>
                      <td className="num">{formatCurrency(c.avgAmount)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ) : null
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

Replace the Recurring breakdown placeholder in `ReportsScreen`'s body:

```jsx
{activeTab === 'recurring' && <RecurringBreakdownTab bills={bills} categoriesById={categoriesById} selectedMonth={selectedMonth} />}
```

- [ ] **Step 4: Add recurring-breakdown CSS**

Append to `src/App.css`:

```css
.recurring-partition-bar {
  display: flex;
  height: 32px;
  border-radius: 4px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  margin-bottom: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}
.recurring-partition-recurring {
  background: #5b8dff;
  display: flex;
  align-items: center;
  padding: 0 10px;
  color: #0b0e16;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
}
.recurring-partition-oneoff {
  background: #a47dea;
  display: flex;
  align-items: center;
  padding: 0 10px;
  color: #0b0e16;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
}
.recurring-partition-legend {
  display: flex;
  gap: 24px;
  font-size: 11px;
  color: #9aa3b2;
  margin-bottom: 16px;
  font-family: 'Outfit', sans-serif;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- --run src/ReportsScreen.test.jsx
```

Expected: all 14 tests pass.

- [ ] **Step 6: Manual browser smoke**

```bash
npm run dev
```

In the browser:
- Open Reports → cycle through all three tabs.
- YoY tab: with little data, shows "Not enough history yet". With data, shows a grouped table.
- Month trend tab: picker switches the chart.
- Recurring breakdown tab: shows the stacked partition bar + per-chain rows (or empty state).

Stop dev server with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add src/ReportsScreen.jsx src/ReportsScreen.test.jsx src/App.css
git commit -m "feat(reporting): Recurring breakdown tab — partition bar + per-chain rows"
```

---

## Task 14: SpendingChart flow toggle

**Files:**
- Modify: `src/SpendingChart.jsx`
- Modify: `src/SpendingChart.test.jsx`
- Modify: `src/App.css` (flow-chips styles)

- [ ] **Step 1: Append failing tests**

Open `src/SpendingChart.test.jsx`. Append:

```jsx
describe('SpendingChart — flow toggle', () => {
  const bills = [
    { id: 'b1', vendor: 'Acme', month: '2026-05', items: [
      { id: 'i1', description: 'Pay',   amount: 5000, categoryId: 'c_pay',  date: '2026-05-15' },
      { id: 'i2', description: 'Food',  amount:  100, categoryId: 'c_food', date: '2026-05-02' },
      { id: 'i3', description: '401k',  amount:  260, categoryId: 'c_401k', date: '2026-05-15' },
    ]},
  ];
  const cats = [
    { id: 'c_food', name: 'Groceries', flow: 'expense' },
    { id: 'c_pay',  name: 'Paycheck',  flow: 'income'  },
    { id: 'c_401k', name: '401(k)',    flow: 'savings' },
  ];
  const catsById = new Map(cats.map(c => [c.id, c]));

  it('renders four flow chips', () => {
    render(<SpendingChart bills={bills} selectedMonth="2026-05" onSelectMonth={() => {}} categoriesById={catsById} />);
    expect(screen.getByRole('button', { name: 'Spent' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Income' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Net' })).toBeTruthy();
  });

  it('hides vendor legend when flow is not Spent', () => {
    const { container } = render(
      <SpendingChart bills={bills} selectedMonth="2026-05" onSelectMonth={() => {}} categoriesById={catsById} />
    );
    expect(container.querySelector('.spending-legend')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Income' }));
    expect(container.querySelector('.spending-legend')).toBeFalsy();
  });

  it('hides per-vendor chips when flow is not Spent', () => {
    const { container } = render(
      <SpendingChart bills={bills} selectedMonth="2026-05" onSelectMonth={() => {}} categoriesById={catsById} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
    // chips include flow chips + the "All" vendor chip, but per-vendor chips should be gone
    const vendorChips = container.querySelectorAll('.spending-chip:not(.flow-chip)');
    // "All" chip stays only when there's vendor switching context; in non-spent mode we hide vendor chips entirely.
    expect(vendorChips.length).toBe(0);
  });

  it('clicking a bar when flow !== spent is a no-op (no drill)', () => {
    const onSelectMonth = vi.fn();
    const { container } = render(
      <SpendingChart bills={bills} selectedMonth="2026-05" onSelectMonth={onSelectMonth} categoriesById={catsById} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Net' }));
    const bars = container.querySelectorAll('.spending-bar');
    if (bars.length > 0) fireEvent.click(bars[0]);
    expect(onSelectMonth).not.toHaveBeenCalled();
  });
});
```

If the existing `SpendingChart.test.jsx` does not already import `vi` from vitest or `fireEvent` from testing-library, ensure those imports exist at the top of the file:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/SpendingChart.test.jsx
```

Expected: the 4 new tests FAIL — flow chips not rendered, vendor legend not gated.

- [ ] **Step 3: Implement the flow toggle**

In `src/SpendingChart.jsx`:

a) Add the flow state inside the component. Find:

```jsx
const [collapsed, setCollapsed] = useState(() => {
```

Add immediately above:

```jsx
const [flow, setFlow] = useState('spent');
```

b) Modify the `renderMonthlyBars` function to use the active flow. Find:

```jsx
const max = Math.max(...monthly.map(m => m.spent), 1);
```

Replace with:

```jsx
const value = (m) => {
  if (flow === 'income') return m.income;
  if (flow === 'saved')  return m.saved;
  if (flow === 'net')    return m.income - m.spent - m.saved;
  return m.spent;
};
const max = Math.max(...monthly.map(m => Math.abs(value(m))), 1);
```

Also in `renderMonthlyBars`, find the existing bar height computation:

```jsx
const pct = (m.spent / max) * STACK_HEADROOM_PCT;
```

Replace with:

```jsx
const v = value(m);
const pct = (Math.abs(v) / max) * STACK_HEADROOM_PCT;
```

Find the part that renders the stack OR a single solid segment:

```jsx
{isAll ? renderStack(m) : (
  <div
    className="spending-bar-segment"
    style={{
      background: effectiveFilter
        ? resolveVendorColor(effectiveFilter)
        : '#5b8dff',
      height: '100%',
    }}
  />
)}
```

Replace with:

```jsx
{flow === 'spent' && isAll ? renderStack(m) : (
  <div
    className="spending-bar-segment"
    style={{
      background:
        flow === 'income' ? '#6BD49A'
        : flow === 'saved' ? '#5B8DFF'
        : flow === 'net'   ? '#D4A853'
        : effectiveFilter ? resolveVendorColor(effectiveFilter)
        : '#5b8dff',
      height: '100%',
    }}
  />
)}
```

Also find the `spending-bar-total` label render:

```jsx
<span className="spending-bar-total">{formatCurrencyShort(m.spent)}</span>
```

Replace with:

```jsx
<span className="spending-bar-total">{formatCurrencyShort(Math.abs(value(m)))}</span>
```

c) Gate the drill-down by flow. Find:

```jsx
const enterDrill = (month) => {
  if (drillMonth === null) previousMonthRef.current = selectedMonth;
  setDrillMonth(month);
  if (onSelectMonth) onSelectMonth(month);
};
```

Replace with:

```jsx
const enterDrill = (month) => {
  if (flow !== 'spent') return; // drill-down is expense-only
  if (drillMonth === null) previousMonthRef.current = selectedMonth;
  setDrillMonth(month);
  if (onSelectMonth) onSelectMonth(month);
};
```

d) Gate the legend and vendor chips. Find the existing `renderLegend` function:

```jsx
const renderLegend = () => {
  if (!isAll || vendors.length === 0) return null;
  ...
```

Replace the first line with:

```jsx
const renderLegend = () => {
  if (flow !== 'spent' || !isAll || vendors.length === 0) return null;
```

Find `renderChips`:

```jsx
const renderChips = () => (
  <div className="spending-chips">
    <button
      className={`spending-chip${isAll ? ' active' : ''}`}
      onClick={() => setVendorFilter(null)}
    >
      All
    </button>
    {vendors.map(v => (
      ...
```

Replace with:

```jsx
const renderFlowChips = () => (
  <div className="spending-chips flow-chips">
    {['spent', 'income', 'saved', 'net'].map(f => (
      <button
        key={f}
        className={`spending-chip flow-chip${flow === f ? ' active' : ''}`}
        onClick={() => { setFlow(f); setDrillMonth(null); }}
      >
        {f.charAt(0).toUpperCase() + f.slice(1)}
      </button>
    ))}
  </div>
);

const renderVendorChips = () => {
  if (flow !== 'spent') return null;
  return (
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
          className={`spending-chip${effectiveFilter === v ? ' active' : ''}`}
          onClick={() => setVendorFilter(v)}
          style={effectiveFilter === v ? { background: resolveVendorColor(v), color: '#0b0e16' } : null}
        >
          {v}
        </button>
      ))}
    </div>
  );
};
```

In the JSX at the bottom of the component, find:

```jsx
{!collapsed && (
  <>
    {renderChips()}
    {renderLegend()}
    ...
```

Replace with:

```jsx
{!collapsed && (
  <>
    {renderFlowChips()}
    {renderVendorChips()}
    {renderLegend()}
    ...
```

- [ ] **Step 4: Add flow-chips CSS**

Append to `src/App.css`:

```css
.flow-chips {
  margin-bottom: 8px;
}
.flow-chip.active {
  background: #d4a853;
  color: #0b0e16;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- --run src/SpendingChart.test.jsx
```

Expected: all SpendingChart tests pass (old ones still green, 4 new ones green).

- [ ] **Step 6: Manual browser smoke**

```bash
npm run dev
```

In the browser:
- The 12-month chart has a new flow chip strip: Spent / Income / Saved / Net.
- Clicking each chip changes the bar values and colors.
- For Income / Saved / Net, the vendor legend and vendor chips disappear; bars are solid color.
- Clicking a bar in Spent drills to daily; clicking a bar in Income / Saved / Net does nothing.
- Switching back to Spent restores vendor chips, legend, and the drill-down.

Stop dev server with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add src/SpendingChart.jsx src/SpendingChart.test.jsx src/App.css
git commit -m "feat(reporting): SpendingChart flow toggle (Spent / Income / Saved / Net)"
```

---

## Task 15: Integration smoke test + final manual smoke

**Files:**
- Modify: `src/__smoke__/setup.test.jsx`

- [ ] **Step 1: Append a smoke test that exercises Reports + Export**

Append to `src/__smoke__/setup.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { unzipSync, strFromU8 } from 'fflate';
import { buildArchive } from '../exportArchive.js';

describe('end-to-end: reports + export', () => {
  const cats = [
    { id: 'c_food', name: 'Groceries', flow: 'expense' },
    { id: 'c_pay',  name: 'Paycheck',  flow: 'income'  },
  ];
  const catsById = new Map(cats.map(c => [c.id, c]));

  it('export archive contains data.json + items.csv with expected shapes', () => {
    const bills = [
      { id: 'b1', vendor: 'Acme', month: '2026-05', items: [
        { id: 'i1', description: 'Gross pay', amount: 5200, categoryId: 'c_pay', date: '2026-05-15' },
      ]},
      { id: 'b2', vendor: 'Chase', month: '2026-05', items: [
        { id: 'i2', description: 'Whole Foods', amount: 84, categoryId: 'c_food', date: '2026-05-02' },
      ]},
    ];
    const bytes = buildArchive({
      bills, categories: cats, trackedKeywords: ['CHURCH'],
      schemaVersion: 3, appVersion: '1.0.0', now: new Date('2026-05-12T12:00:00Z'),
    });
    const unzipped = unzipSync(bytes);
    expect(Object.keys(unzipped).sort()).toEqual(['data.json', 'items.csv']);
    const data = JSON.parse(strFromU8(unzipped['data.json']));
    expect(data.schemaVersion).toBe(3);
    expect(data.bills.length).toBe(2);
    expect(data.trackedKeywords).toEqual(['CHURCH']);
    const csv = strFromU8(unzipped['items.csv']);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv.split('\n')[0].slice(1)).toBe('date,vendor,description,amount,category,flow,recurring');
    expect(csv).toContain('Gross pay,5200.00,Paycheck,income,no');
  });
});
```

- [ ] **Step 2: Run the smoke test**

```bash
npm test -- --run src/__smoke__/setup.test.jsx
```

Expected: existing smoke tests still pass + the new one passes.

- [ ] **Step 3: Run the entire test suite**

```bash
npm test -- --run
```

Expected: every test in the project passes. Take note of the final count — it should match the pre-D count plus all new tests from this plan (~46 new tests across the four test files).

- [ ] **Step 4: Final manual browser smoke**

```bash
npm run dev
```

Walk through the full flow:
1. Open the app. Verify the Spent stat card shows the inline split bar.
2. Click `📊 Reports`.
3. YoY tab: verify the table renders with grouped rows (or empty state if < 13 months data).
4. Month trend tab: change the category picker, watch the chart update.
5. Recurring breakdown tab: verify the partition bar + per-chain rows (or empty state).
6. Press ESC — returns to dashboard.
7. Click SpendingChart's `Income` chip — bars switch to income values, single solid color, no vendor legend.
8. Click `Spent` chip — returns to default.
9. Click `↗ Export` — confirm `billtracker-YYYY-MM-DD.zip` downloads. Unzip and inspect `data.json` and `items.csv`.

Stop dev server with Ctrl+C.

- [ ] **Step 5: Commit the smoke test**

```bash
git add src/__smoke__/setup.test.jsx
git commit -m "test(reporting): smoke test for export archive shape"
```

---

## Notes for the implementer

- **Branch:** Work happens on `feat/reporting-and-export`. The spec was committed on this branch as commit `ed638a0`.
- **Stop on failure:** If any TDD step's "verify it fails" doesn't fail for the expected reason, stop and check the test code. Tests should fail with a clear "not defined" / "not exported" / assertion-mismatch message — never a syntax error.
- **Order matters:** Tasks 6, 7, 8 are pure-math and independent of each other but must come before Task 9 (which uses 8) and Task 13 (which uses 8). Tasks 11-13 fill in tabs that Task 10 stubs out.
- **Manual smoke matters:** Vitest doesn't catch CSS layout issues or visual regressions. The browser smoke steps in Tasks 5, 9, 10, 13, 14, and 15 are the real verification for UI work.
- **Spec reference:** `docs/superpowers/specs/2026-05-12-reporting-and-export-design.md` is the source of truth if any task feels under-specified.
