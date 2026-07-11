# Profit & Loss Statement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated, read-only Profit & Loss screen: a trended statement with income/expense category line items over Month/Quarter/Year columns plus a Total column, Net Profit = income − expense, with CSV + print export.

**Architecture:** A new pure module `pnlModel.js` reuses the existing reports plumbing (`filterRows`, `flattenForReports`, `monthsInRange`, `flowOf`, `resolvePeriod`, `scopeAccountIds`) so it counts money identically to the rest of Reports. Two presentational React components (`PnlStatement`, `ProfitLossScreen`) compose those with the existing `PeriodControl`/`ScopeControl` and a local granularity toggle. App gets a "P&L" nav entry and screen route. The screen is display-only — no undo/pushHistory wiring.

**Tech Stack:** React 19, Vitest + @testing-library/react (jsdom), existing `reportsModel.js` helpers, `fileStore.js` for downloads.

## Global Constraints

- Test runner: `npx vitest run <file>` (bare `npm test` is watch mode — do not use for one-shot runs).
- Storage schema version key is `tallio-schema-version`, current value `'5'`. Any App-level smoke test that seeds `tallio-accounts` MUST also seed `tallio-schema-version` = `'5'` (known gotcha — otherwise load-time migration mangles seeded data).
- Sign convention (matches `reportsModel.js`): income amounts are positive in the ledger; expense amounts are negative. Expense **magnitude** = −(sum). **Net Profit = Total income − Total expense.**
- `savings`-flow rows, transfer legs, and uncategorized/non-flow rows are excluded from the P&L — identical to every other flow summary.
- Currency display uses `new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` (matches `SummaryScorecard.jsx`). CSV uses plain `.toFixed(2)` numbers (no symbol/commas).
- Commit message footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Branch: `feat/pnl` (already created off master; spec already committed there).

---

## File Structure

- **Create `src/pnlModel.js`** — pure aggregation + CSV. Exports `bucketsInRange`, `bucketKeyForMonth`, `profitAndLoss`, `buildPnlCsv`.
- **Modify `src/reportsModel.js`** — add `export` to the existing internal `flowOf` so `pnlModel` can reuse the exact flow test.
- **Create `src/PnlStatement.jsx`** — presentational table (rows × bucket columns + Total).
- **Create `src/ProfitLossScreen.jsx`** — controls (period/scope/granularity) + composition + export/print.
- **Modify `src/fileStore.js`** — add `downloadTextFile(text, filename, mime)`.
- **Modify `src/App.jsx`** — import + nav link + `screen === 'pnl'` route.
- **Modify `src/App.css`** — statement table styles, granularity control, `@media print`.
- **Tests:** `src/pnlModel.test.js`, `src/PnlStatement.test.jsx`, `src/ProfitLossScreen.test.jsx`, `src/fileStore.test.js` (append), `src/App.test.jsx` (append nav smoke test).

---

## Task 1: pnlModel — period bucketing

**Files:**
- Modify: `src/reportsModel.js` (export `flowOf`)
- Create: `src/pnlModel.js`
- Test: `src/pnlModel.test.js`

**Interfaces:**
- Consumes: `monthsInRange(start, end, transactions)` from `reportsModel.js` (returns ascending `['YYYY-MM', …]`).
- Produces:
  - `bucketsInRange(start, end, transactions=[], granularity='month') → [{ key, label }]` (ascending, deduped, insertion-ordered).
  - `bucketKeyForMonth(month, granularity) → string|null` maps a `'YYYY-MM'` to its bucket key. Keys: month → `'YYYY-MM'`; quarter → `'YYYY-Qn'`; year → `'YYYY'`.

- [ ] **Step 1: Export `flowOf` from reportsModel.js**

Change the existing declaration (currently `function flowOf(t, categoriesById) {`) to add `export`:

```js
// Internal: a row's countable flow, or null for transfer legs / uncategorized rows.
export function flowOf(t, categoriesById) {
  if (!t || t.transferId != null) return null;
  const cat = categoriesById && categoriesById.get(t.categoryId);
  const f = cat && cat.flow;
  return (f === 'income' || f === 'expense' || f === 'savings') ? f : null;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/pnlModel.test.js`:

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/pnlModel.test.js`
Expected: FAIL — `Failed to resolve import "./pnlModel.js"` / functions not defined.

- [ ] **Step 4: Write the minimal implementation**

Create `src/pnlModel.js`:

```js
// src/pnlModel.js
// Pure Profit & Loss aggregation + CSV. No React, no storage.
// Reuses reportsModel's period/scope/flow plumbing so it counts money identically.
import { filterRows, flattenForReports, monthsInRange, flowOf } from './reportsModel.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Map a 'YYYY-MM' month to its bucket key for the chosen granularity.
export function bucketKeyForMonth(month, granularity = 'month') {
  if (typeof month !== 'string' || month.length < 7) return null;
  const y = month.slice(0, 4);
  const m = parseInt(month.slice(5, 7), 10);
  if (!y || !Number.isFinite(m)) return null;
  if (granularity === 'year') return y;
  if (granularity === 'quarter') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  return month; // 'YYYY-MM'
}

// Ascending, deduped bucket list. Open bounds derive from transaction min/max month.
export function bucketsInRange(start, end, transactions = [], granularity = 'month') {
  const months = monthsInRange(start || null, end || null, transactions);
  if (months.length === 0) return [];
  const multiYear = months[0].slice(0, 4) !== months[months.length - 1].slice(0, 4);
  const seen = new Map(); // key -> label, insertion order = ascending
  for (const mo of months) {
    const key = bucketKeyForMonth(mo, granularity);
    if (!key || seen.has(key)) continue;
    const y = mo.slice(0, 4);
    const m = parseInt(mo.slice(5, 7), 10);
    let label;
    if (granularity === 'year') label = y;
    else if (granularity === 'quarter') label = `Q${Math.floor((m - 1) / 3) + 1} '${y.slice(2)}`;
    else label = multiYear ? `${MONTHS[m - 1]} '${y.slice(2)}` : MONTHS[m - 1];
    seen.set(key, label);
  }
  return [...seen.entries()].map(([key, label]) => ({ key, label }));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/pnlModel.test.js`
Expected: PASS (all bucketing tests green).

- [ ] **Step 6: Commit**

```bash
git add src/reportsModel.js src/pnlModel.js src/pnlModel.test.js
git commit -m "feat(pnl): period bucketing (month/quarter/year)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: pnlModel — profitAndLoss aggregation

**Files:**
- Modify: `src/pnlModel.js`
- Test: `src/pnlModel.test.js` (append)

**Interfaces:**
- Consumes: `filterRows`, `flattenForReports`, `flowOf` (reportsModel), `bucketsInRange`, `bucketKeyForMonth` (Task 1).
- Produces: `profitAndLoss(transactions, categoriesById, opts={}) → { buckets, income, expense, netByBucket, netTotal }` where `opts` = `{ start, end, accountIds, granularity }`. `income`/`expense` are each `{ rows, totalsByBucket, total }`; a `row` is `{ categoryId, name, icon, color, byBucket:{[key]:number}, total }`. Income amounts positive; expense amounts positive magnitudes. Rows sorted by descending `total`; rows with no activity anywhere are omitted. `netByBucket[key] = income − expense`; `netTotal = income.total − expense.total`.

- [ ] **Step 1: Write the failing test**

Append to `src/pnlModel.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pnlModel.test.js`
Expected: FAIL — `profitAndLoss is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/pnlModel.js`:

```js
export function profitAndLoss(transactions, categoriesById, opts = {}) {
  const granularity = opts.granularity || 'month';
  const buckets = bucketsInRange(opts.start ?? null, opts.end ?? null, transactions, granularity);
  const keys = buckets.map(b => b.key);
  const keySet = new Set(keys);
  const zero = () => Object.fromEntries(keys.map(k => [k, 0]));

  // categoryId -> { byBucket: {key: signedSum}, total: signedSum }
  const incomeAcc = new Map();
  const expenseAcc = new Map();

  for (const t of flattenForReports(filterRows(transactions, opts))) {
    const f = flowOf(t, categoriesById);
    if (f !== 'income' && f !== 'expense') continue;
    const month = typeof t.date === 'string' ? t.date.slice(0, 7) : '';
    const key = bucketKeyForMonth(month, granularity);
    if (!key || !keySet.has(key)) continue;
    const amt = Number.isFinite(t.amount) ? t.amount : 0;
    const acc = f === 'income' ? incomeAcc : expenseAcc;
    let rec = acc.get(t.categoryId);
    if (!rec) { rec = { byBucket: zero(), total: 0 }; acc.set(t.categoryId, rec); }
    rec.byBucket[key] += amt;
    rec.total += amt;
  }

  // sign: +1 for income (deposits positive), -1 for expense (magnitude)
  const buildSection = (acc, sign) => {
    const rows = [];
    const totalsByBucket = zero();
    let total = 0;
    for (const [categoryId, rec] of acc) {
      const cat = (categoriesById && categoriesById.get(categoryId)) || {};
      const byBucket = {};
      for (const k of keys) byBucket[k] = sign * rec.byBucket[k];
      const rowTotal = sign * rec.total;
      const hasActivity = rowTotal !== 0 || keys.some(k => byBucket[k] !== 0);
      if (!hasActivity) continue;
      rows.push({
        categoryId,
        name: cat.name || 'Uncategorized',
        icon: cat.icon || '📋',
        color: cat.color || '#6B7280',
        byBucket,
        total: rowTotal,
      });
      for (const k of keys) totalsByBucket[k] += byBucket[k];
      total += rowTotal;
    }
    rows.sort((a, b) => b.total - a.total);
    return { rows, totalsByBucket, total };
  };

  const income = buildSection(incomeAcc, 1);
  const expense = buildSection(expenseAcc, -1);
  const netByBucket = {};
  for (const k of keys) netByBucket[k] = income.totalsByBucket[k] - expense.totalsByBucket[k];
  const netTotal = income.total - expense.total;

  return { buckets, income, expense, netByBucket, netTotal };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pnlModel.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pnlModel.js src/pnlModel.test.js
git commit -m "feat(pnl): profitAndLoss aggregation with net profit

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: pnlModel — buildPnlCsv

**Files:**
- Modify: `src/pnlModel.js`
- Test: `src/pnlModel.test.js` (append)

**Interfaces:**
- Consumes: the `profitAndLoss` result shape (Task 2).
- Produces: `buildPnlCsv(pnl) → string` — a UTF-8-BOM CSV: header row (`''`, bucket labels…, `Total`), an `INCOME` section line, income item rows, `Total income` row, an `EXPENSES` section line, expense item rows, `Total expense` row, and a `NET PROFIT` row. Amounts are `.toFixed(2)` plain numbers.

Note: a local `escapeCsv` is duplicated here (6 trivial lines) rather than imported from `exportArchive.js`, to keep `pnlModel` free of a dependency on the archive/zip layer.

- [ ] **Step 1: Write the failing test**

Append to `src/pnlModel.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pnlModel.test.js`
Expected: FAIL — `buildPnlCsv is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/pnlModel.js`:

```js
function escapeCsv(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function buildPnlCsv(pnl) {
  const { buckets, income, expense, netByBucket, netTotal } = pnl;
  const keys = buckets.map(b => b.key);
  const fmt = (n) => (Number.isFinite(n) ? n : 0).toFixed(2);
  const dataRow = (label, byBucket, total) =>
    [escapeCsv(label), ...keys.map(k => fmt(byBucket[k])), fmt(total)].join(',');

  const lines = [];
  lines.push(['', ...buckets.map(b => b.label), 'Total'].map(escapeCsv).join(','));
  lines.push('INCOME');
  for (const r of income.rows) lines.push(dataRow(r.name, r.byBucket, r.total));
  lines.push(dataRow('Total income', income.totalsByBucket, income.total));
  lines.push('EXPENSES');
  for (const r of expense.rows) lines.push(dataRow(r.name, r.byBucket, r.total));
  lines.push(dataRow('Total expense', expense.totalsByBucket, expense.total));
  lines.push(dataRow('NET PROFIT', netByBucket, netTotal));
  return '﻿' + lines.join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pnlModel.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pnlModel.js src/pnlModel.test.js
git commit -m "feat(pnl): CSV export of the P&L statement

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: PnlStatement component + table styles

**Files:**
- Create: `src/PnlStatement.jsx`
- Modify: `src/App.css` (append)
- Test: `src/PnlStatement.test.jsx`

**Interfaces:**
- Consumes: `profitAndLoss` result (Task 2) as the `pnl` prop.
- Produces: `<PnlStatement pnl={…} />` — a table with a bucket-label header + `Total`, an Income section (item rows + Total income), an Expenses section (item rows + Total expense), and a Net profit row. Renders `No activity in this period` when `pnl` has no buckets.

- [ ] **Step 1: Write the failing test**

Create `src/PnlStatement.test.jsx`:

```js
// src/PnlStatement.test.jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import PnlStatement from './PnlStatement.jsx';

const pnl = {
  buckets: [{ key: '2026-01', label: 'Jan' }, { key: '2026-02', label: 'Feb' }],
  income: {
    rows: [{ categoryId: 'sal', name: 'Sales', icon: '💰', color: '#0a0', byBucket: { '2026-01': 2100, '2026-02': 1900 }, total: 4000 }],
    totalsByBucket: { '2026-01': 2100, '2026-02': 1900 }, total: 4000,
  },
  expense: {
    rows: [{ categoryId: 'rent', name: 'Rent', icon: '🏠', color: '#a00', byBucket: { '2026-01': 1000, '2026-02': 1000 }, total: 2000 }],
    totalsByBucket: { '2026-01': 1000, '2026-02': 1000 }, total: 2000,
  },
  netByBucket: { '2026-01': 1100, '2026-02': 900 }, netTotal: 2000,
};

describe('PnlStatement', () => {
  afterEach(() => cleanup());

  it('renders bucket columns, line items, and a net profit row', () => {
    render(<PnlStatement pnl={pnl} />);
    expect(screen.getByRole('columnheader', { name: 'Jan' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Feb' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Total' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Sales' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Rent' })).toBeTruthy();

    const net = screen.getByRole('row', { name: /net profit/i });
    expect(within(net).getByText('$2,000.00')).toBeTruthy();
    expect(within(net).getByText('$1,100.00')).toBeTruthy();
  });

  it('shows an empty message when there are no buckets', () => {
    render(<PnlStatement pnl={{ buckets: [], income: { rows: [], totalsByBucket: {}, total: 0 }, expense: { rows: [], totalsByBucket: {}, total: 0 }, netByBucket: {}, netTotal: 0 }} />);
    expect(screen.getByText(/no activity in this period/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/PnlStatement.test.jsx`
Expected: FAIL — cannot resolve `./PnlStatement.jsx`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/PnlStatement.jsx`:

```jsx
// src/PnlStatement.jsx
import React from 'react';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

export default function PnlStatement({ pnl }) {
  if (!pnl || !pnl.buckets || pnl.buckets.length === 0) {
    return <p className="panel-empty">No activity in this period</p>;
  }
  const { buckets, income, expense, netByBucket, netTotal } = pnl;
  const keys = buckets.map(b => b.key);

  const DataRow = ({ label, byBucket, total, className }) => (
    <tr className={className}>
      <th scope="row" className="pnl-row-label">{label}</th>
      {keys.map(k => <td key={k} className="pnl-cell">{money(byBucket[k])}</td>)}
      <td className="pnl-cell pnl-total-cell">{money(total)}</td>
    </tr>
  );
  const SectionRow = ({ label }) => (
    <tr className="pnl-section"><th scope="row" colSpan={keys.length + 2}>{label}</th></tr>
  );

  return (
    <div className="pnl-scroll">
      <table className="pnl-table">
        <thead>
          <tr>
            <th className="pnl-corner" />
            {buckets.map(b => <th key={b.key} scope="col" className="pnl-col-head">{b.label}</th>)}
            <th scope="col" className="pnl-col-head pnl-total-cell">Total</th>
          </tr>
        </thead>
        <tbody>
          <SectionRow label="Income" />
          {income.rows.map(r => <DataRow key={r.categoryId} label={r.name} byBucket={r.byBucket} total={r.total} className="pnl-item" />)}
          <DataRow label="Total income" byBucket={income.totalsByBucket} total={income.total} className="pnl-subtotal" />
          <SectionRow label="Expenses" />
          {expense.rows.map(r => <DataRow key={r.categoryId} label={r.name} byBucket={r.byBucket} total={r.total} className="pnl-item" />)}
          <DataRow label="Total expense" byBucket={expense.totalsByBucket} total={expense.total} className="pnl-subtotal" />
          <DataRow label="Net profit" byBucket={netByBucket} total={netTotal} className="pnl-net" />
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/PnlStatement.test.jsx`
Expected: PASS.

- [ ] **Step 5: Add table styles**

Append to `src/App.css`:

```css
/* Profit & Loss statement */
.pnl-scroll { overflow-x: auto; }
.pnl-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.pnl-table th, .pnl-table td { padding: 0.4rem 0.75rem; text-align: right; white-space: nowrap; }
.pnl-table .pnl-row-label, .pnl-table .pnl-col-head:first-child { text-align: left; }
.pnl-col-head { font-size: 0.85rem; opacity: 0.75; border-bottom: 1px solid var(--border, #ddd); }
.pnl-row-label { text-align: left; font-weight: 400; }
.pnl-section th { text-align: left; font-weight: 700; padding-top: 0.9rem; letter-spacing: 0.03em; }
.pnl-subtotal { font-weight: 600; }
.pnl-subtotal td, .pnl-subtotal th { border-top: 1px solid var(--border, #ddd); }
.pnl-total-cell { font-weight: 600; border-left: 1px solid var(--border, #ddd); }
.pnl-net { font-weight: 700; font-size: 1.05rem; }
.pnl-net td, .pnl-net th { border-top: 2px solid var(--text, #222); border-bottom: 3px double var(--text, #222); }
```

- [ ] **Step 6: Commit**

```bash
git add src/PnlStatement.jsx src/PnlStatement.test.jsx src/App.css
git commit -m "feat(pnl): statement table component + styles

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: fileStore — downloadTextFile

**Files:**
- Modify: `src/fileStore.js`
- Test: `src/fileStore.test.js` (append; create if absent)

**Interfaces:**
- Produces: `downloadTextFile(text, filename, mime='text/plain')` — creates a Blob, an object URL, and clicks a temporary anchor with `download=filename`, then revokes the URL. Mirrors the existing `downloadArchive`.

- [ ] **Step 1: Write the failing test**

Append to `src/fileStore.test.js` (create the file with this content if it does not exist):

```js
// src/fileStore.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadTextFile } from './fileStore.js';

afterEach(() => vi.restoreAllMocks());

describe('downloadTextFile', () => {
  it('creates a download anchor with the given filename and revokes the url', () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:1', revokeObjectURL: vi.fn() });
    const click = vi.fn();
    const anchor = { href: '', download: '', click };
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    downloadTextFile('hello,world', 'out.csv', 'text/csv');

    expect(anchor.download).toBe('out.csv');
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/fileStore.test.js`
Expected: FAIL — `downloadTextFile is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Add to `src/fileStore.js` immediately after `downloadArchive`:

```js
export function downloadTextFile(text, filename, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/fileStore.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fileStore.js src/fileStore.test.js
git commit -m "feat(pnl): downloadTextFile helper in fileStore

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: ProfitLossScreen component + controls/print styles

**Files:**
- Create: `src/ProfitLossScreen.jsx`
- Modify: `src/App.css` (append print + granularity styles)
- Test: `src/ProfitLossScreen.test.jsx`

**Interfaces:**
- Consumes: `resolvePeriod`, `scopeAccountIds` (reportsModel), `profitAndLoss`, `buildPnlCsv` (pnlModel), `downloadTextFile` (fileStore), `PeriodControl`, `ScopeControl`, `PnlStatement`.
- Produces: `<ProfitLossScreen accounts transactions categories types typesById onClose now? />` — a full-screen overlay with period/scope/granularity controls and the statement, plus Export CSV / Print / Done buttons. Default period `last-12-months`, default granularity `month`.

- [ ] **Step 1: Write the failing test**

Create `src/ProfitLossScreen.test.jsx`:

```js
// src/ProfitLossScreen.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_ACCOUNT_TYPES, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';
import ProfitLossScreen from './ProfitLossScreen.jsx';

vi.mock('./fileStore.js', () => ({ downloadTextFile: vi.fn() }));
import { downloadTextFile } from './fileStore.js';

const accounts = [{ id: 'a1', name: 'Biz', type: 'bank', openingBalance: 0 }];
const categories = [
  { id: 'sal', name: 'Sales', icon: '💰', color: '#0a0', flow: 'income' },
  { id: 'rent', name: 'Rent', icon: '🏠', color: '#a00', flow: 'expense' },
];
const transactions = [
  { id: 'i1', accountId: 'a1', date: '2026-01-10', amount: 3000, categoryId: 'sal' },
  { id: 'i2', accountId: 'a1', date: '2026-02-10', amount: 2000, categoryId: 'sal' },
  { id: 'e1', accountId: 'a1', date: '2026-01-01', amount: -1000, categoryId: 'rent' },
];
const NOW = new Date(2026, 1, 20); // Feb 2026

function renderScreen(extra = {}) {
  return render(
    <ProfitLossScreen accounts={accounts} transactions={transactions} categories={categories}
      types={DEFAULT_ACCOUNT_TYPES} typesById={DEFAULT_ACCOUNT_TYPES_BY_ID} now={NOW} onClose={() => {}} {...extra} />
  );
}

describe('ProfitLossScreen', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('renders the statement with a net profit row', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: /profit & loss/i })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Sales' })).toBeTruthy();
    const net = screen.getByRole('row', { name: /net profit/i });
    expect(within(net).getByText('$4,000.00')).toBeTruthy(); // 5000 income − 1000 rent
  });

  it('switching granularity to Year collapses to a single column', async () => {
    renderScreen();
    // monthly: distinct Jan and Feb columns exist
    expect(screen.getByRole('columnheader', { name: 'Jan' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Year' }));
    expect(screen.queryByRole('columnheader', { name: 'Jan' })).toBeNull();
    expect(screen.getByRole('columnheader', { name: '2026' })).toBeTruthy();
  });

  it('Export CSV triggers a download of the statement', async () => {
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: /export csv/i }));
    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [text, filename] = downloadTextFile.mock.calls[0];
    expect(text).toContain('NET PROFIT');
    expect(filename).toMatch(/\.csv$/);
  });

  it('Print calls window.print', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: /print/i }));
    expect(print).toHaveBeenCalled();
  });

  it('Done calls onClose', async () => {
    const onClose = vi.fn();
    renderScreen({ onClose });
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ProfitLossScreen.test.jsx`
Expected: FAIL — cannot resolve `./ProfitLossScreen.jsx`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/ProfitLossScreen.jsx`:

```jsx
// src/ProfitLossScreen.jsx
import React, { useMemo, useState } from 'react';
import { resolvePeriod, scopeAccountIds } from './reportsModel.js';
import { profitAndLoss, buildPnlCsv } from './pnlModel.js';
import { downloadTextFile } from './fileStore.js';
import PeriodControl from './PeriodControl.jsx';
import ScopeControl from './ScopeControl.jsx';
import PnlStatement from './PnlStatement.jsx';

const GRANULARITIES = [['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']];

export default function ProfitLossScreen({ accounts, transactions, categories, types, typesById, onClose, now }) {
  const [period, setPeriod] = useState({ preset: 'last-12-months', customStart: '', customEnd: '' });
  const [scope, setScope] = useState({ kind: 'all' });
  const [granularity, setGranularity] = useState('month');
  const nowDate = useMemo(() => now || new Date(), [now]);

  const categoriesById = useMemo(() => new Map((categories || []).map(c => [c.id, c])), [categories]);
  const { start, end } = useMemo(
    () => resolvePeriod(period.preset, { now: nowDate, customStart: period.customStart, customEnd: period.customEnd }),
    [period, nowDate]
  );
  const accountIds = useMemo(() => scopeAccountIds(accounts, scope, typesById), [accounts, scope, typesById]);
  const opts = useMemo(() => ({ start, end, accountIds, granularity }), [start, end, accountIds, granularity]);
  const pnl = useMemo(() => profitAndLoss(transactions, categoriesById, opts), [transactions, categoriesById, opts]);

  const exportCsv = () => {
    const stamp = nowDate.toISOString().split('T')[0];
    downloadTextFile(buildPnlCsv(pnl), `Tallio-P&L-${stamp}.csv`, 'text/csv');
  };

  return (
    <div className="screen-overlay">
      <div className="screen pnl-screen">
        <div className="screen-header">
          <h2 className="screen-title">Profit &amp; Loss</h2>
          <button type="button" className="btn" onClick={exportCsv}>Export CSV</button>
          <button type="button" className="btn" onClick={() => window.print()}>Print</button>
          <button type="button" className="btn" onClick={onClose}>Done</button>
        </div>

        <div className="reports-controls">
          <PeriodControl period={period} onChange={setPeriod} />
          <ScopeControl accounts={accounts} types={types} typesById={typesById} scope={scope} onChange={setScope} />
          <div className="period-chips granularity-control" role="group" aria-label="Column granularity">
            {GRANULARITIES.map(([value, label]) => (
              <button key={value} type="button"
                className={`period-chip${granularity === value ? ' period-chip-active' : ''}`}
                aria-pressed={granularity === value}
                onClick={() => setGranularity(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <section className="panel pnl-panel">
          <PnlStatement pnl={pnl} />
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ProfitLossScreen.test.jsx`
Expected: PASS (all five cases).

- [ ] **Step 5: Add granularity + print styles**

Append to `src/App.css`:

```css
.granularity-control { margin-top: 0.25rem; }

@media print {
  .top-nav, .header-actions, .brand, .reports-controls,
  .pnl-screen .screen-header .btn { display: none !important; }
  .screen-overlay { position: static; background: none; }
  .pnl-screen { box-shadow: none; max-height: none; overflow: visible; }
  .pnl-scroll { overflow: visible; }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/ProfitLossScreen.jsx src/ProfitLossScreen.test.jsx src/App.css
git commit -m "feat(pnl): Profit & Loss screen with period/scope/granularity + export

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: App nav wiring

**Files:**
- Modify: `src/App.jsx` (import, nav link, screen route)
- Test: `src/App.test.jsx` (append)

**Interfaces:**
- Consumes: `ProfitLossScreen` (Task 6); existing App state `screen`/`setScreen`, `ledger`, `cats`, `accountTypes`.
- Produces: a "P&L" nav button that sets `screen === 'pnl'`, rendering `<ProfitLossScreen …/>`.

- [ ] **Step 1: Write the failing test**

Append a test to `src/App.test.jsx` (match the file's existing import/render style; the block below is self-contained — adapt the seeding helper name if the file already defines one):

```js
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';

describe('App — P&L navigation', () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('opens the Profit & Loss screen from the nav', async () => {
    localStorage.setItem('tallio-schema-version', '5'); // known gotcha: seed alongside accounts
    localStorage.setItem('tallio-accounts', JSON.stringify([{ id: 'a1', name: 'Biz', type: 'bank', openingBalance: 0 }]));
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /^P&L$/ }));
    expect(screen.getByRole('heading', { name: /profit & loss/i })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(screen.queryByRole('heading', { name: /profit & loss/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/App.test.jsx -t "P&L navigation"`
Expected: FAIL — no `P&L` nav button exists.

- [ ] **Step 3: Add the import**

In `src/App.jsx`, next to the other screen imports (near `import ReportsScreen from './ReportsScreen.jsx';`):

```jsx
import ProfitLossScreen from './ProfitLossScreen.jsx';
```

- [ ] **Step 4: Add the nav link**

In the `.top-nav` block, add the P&L button after the Reports link:

```jsx
          <button type="button" className="top-nav-link" onClick={() => setScreen('reports')}>Reports</button>
          <button type="button" className="top-nav-link" onClick={() => setScreen('pnl')}>P&amp;L</button>
```

- [ ] **Step 5: Add the screen route**

After the `{screen === 'reports' && ( … )}` block, add:

```jsx
      {screen === 'pnl' && (
        <ProfitLossScreen
          accounts={ledger.accounts}
          transactions={ledger.transactions}
          categories={cats.categories}
          types={accountTypes.types}
          typesById={accountTypes.typesById}
          onClose={() => setScreen('main')}
        />
      )}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/App.test.jsx -t "P&L navigation"`
Expected: PASS.

- [ ] **Step 7: Run the full suite + lint**

Run: `npx vitest run`
Expected: all tests green (prior count + the new P&L tests).

Run: `npx eslint src/pnlModel.js src/PnlStatement.jsx src/ProfitLossScreen.jsx`
Expected: no new errors (pre-existing repo lint debt aside).

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/App.test.jsx
git commit -m "feat(pnl): add P&L screen to app navigation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Manual verification (after Task 7)

Run the dev server and confirm end-to-end (Playwright per webapp-testing, or by hand):

1. Nav shows **P&L**; clicking opens the statement.
2. Seed a bank account with a few income + expense transactions across ≥2 months; the statement shows income line items, expense line items, and a Net Profit row = income − expense.
3. Month/Quarter/Year toggle re-buckets the columns; a `savings`-flow transaction never appears; a transfer never appears.
4. Period + scope controls re-scope the statement.
5. **Export CSV** downloads a file whose grid matches the on-screen numbers.
6. Browser **Print** preview shows only the statement (nav/controls hidden).

---

## Self-Review

**Spec coverage:**
- Dedicated read-only screen + nav → Task 6, Task 7. ✓
- Trended income/expense category line items over bucket columns + Total → Task 2 (model), Task 4 (view). ✓
- Net Profit = income − expense per bucket + overall → Task 2. ✓
- Month/Quarter/Year toggle independent of period → Task 1 (bucketing), Task 6 (toggle). ✓
- Period + scope reuse → Task 6. ✓
- savings/transfer/uncategorized exclusion; splits exploded → Task 2 (tests assert all four). ✓
- Row omission for no-activity categories; empty-range zeros → Task 2, Task 4. ✓
- CSV export → Task 3 (build), Task 5 (download), Task 6 (wire). ✓
- Print stylesheet → Task 6. ✓
- No undo/mutations → screen is display-only (no pushHistory anywhere). ✓
- Sign convention, currency idiom, schema-seed gotcha → Global Constraints; enforced in Task 2/4/7. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**Type consistency:** `profitAndLoss` result shape (`buckets`, `income/expense.{rows,totalsByBucket,total}`, `netByBucket`, `netTotal`) is defined in Task 2 and consumed identically in Tasks 3, 4, 6. `row.byBucket` keyed by bucket `key`; `bucketKeyForMonth`/`bucketsInRange` agree on key formats (`YYYY-MM`, `YYYY-Qn`, `YYYY`) across Tasks 1–3. `downloadTextFile(text, filename, mime)` defined in Task 5, called with that arity in Task 6. ✓
