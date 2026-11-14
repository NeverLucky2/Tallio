# Spend-by-Payee (Payee Activity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only "By payee" panel to the Reports screen: a table of money Out / In per payee (with a "(No payee)" bucket, uncategorized attributed by amount sign, and a Total row), reusing the existing period + scope controls.

**Architecture:** One new pure aggregation `payeeActivity` in `reportsModel.js` (alongside `spendingByCategory`), reusing `filterRows`, `flattenForReports`, `flowOf`, and `payeeNameOf`. One presentational `PayeeActivityTable.jsx`. `ReportsScreen.jsx` gains a `useMemo` and a new panel after "Spending by category". Read-only — no undo wiring.

**Tech Stack:** React 19, Vitest + @testing-library/react (jsdom), existing `reportsModel.js` helpers.

## Global Constraints

- Test runner: `npx vitest run <file>` (bare `npm test` is watch mode — do not use for one-shot runs).
- Sign convention (matches the P&L): `out` = −(sum of expense-flow amounts), a positive magnitude; `in` = +(sum of income-flow amounts).
- Exclusions: transfer legs (`transferId != null`) and `savings`-flow rows are always skipped.
- Uncategorized fallback (last resort): a non-transfer row with no valid flow is attributed by amount sign — `amount < 0` → `out`, `amount > 0` → `in`.
- "(No payee)" bucket: rows with no `payeeId` group into a single `payeeId: null` row named "(No payee)".
- Currency display: `new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` (matches the reports layer).
- Add new imports to EXISTING import statements where one already imports from the same module (`reportsModel.test.js` line 3; `ReportsScreen.jsx`) to avoid duplicate-import lint errors.
- Do NOT define React sub-components inside a component's render body (repo enforces `react-hooks/static-components` as an error) — keep helpers/rows at module scope or inline JSX.
- Commit message footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Branch: `feat/spend-by-payee` (already created off master; spec already committed there).

---

## File Structure

- **Modify `src/reportsModel.js`** — add `export function payeeActivity(...)`.
- **Create `src/PayeeActivityTable.jsx`** — presentational Out/In table.
- **Modify `src/App.css`** — table styles.
- **Modify `src/ReportsScreen.jsx`** — import, `useMemo`, new panel.
- **Tests:** `src/reportsModel.test.js` (append), `src/PayeeActivityTable.test.jsx` (create), `src/ReportsScreen.test.jsx` (append).

---

## Task 1: payeeActivity aggregation

**Files:**
- Modify: `src/reportsModel.js`
- Test: `src/reportsModel.test.js` (line 3 import + append describe block)

**Interfaces:**
- Consumes: `filterRows`, `flattenForReports`, `flowOf`, `payeeNameOf` (all already in `reportsModel.js`).
- Produces: `payeeActivity(transactions, categoriesById, opts = {}) → { rows, totals }`. `rows`: `[{ payeeId, name, out, in }]` sorted by `(out + in)` desc, zero-activity rows omitted; no-payee bucket is `{ payeeId: null, name: '(No payee)', ... }`. `totals`: `{ out, in }`. `opts` = `{ start, end, accountIds, payeesById }`.

- [ ] **Step 1: Write the failing test**

In `src/reportsModel.test.js`, add `payeeActivity` to the line-3 import:

```js
import { resolvePeriod, monthsInRange, scopeAccountIds, filterRows, payeeActivity } from './reportsModel.js';
```

Then append at the end of the file:

```js
describe('payeeActivity', () => {
  const cats = new Map([
    ['inc', { id: 'inc', name: 'Salary', flow: 'income' }],
    ['gro', { id: 'gro', name: 'Groceries', flow: 'expense' }],
    ['sav', { id: 'sav', name: 'Brokerage', flow: 'savings' }],
    // note: 'huh' is intentionally absent → uncategorized
  ]);
  const payeesById = new Map([
    ['p1', { id: 'p1', name: 'Amazon' }],
    ['p2', { id: 'p2', name: 'Acme Corp' }],
  ]);
  const txns = [
    { id: 'a', accountId: 'x', date: '2026-01-05', amount: -100, categoryId: 'gro', payeeId: 'p1' }, // out 100 Amazon
    { id: 'b', accountId: 'x', date: '2026-01-06', amount: -60, categoryId: 'gro', payeeId: 'p1' },  // out 60 Amazon
    { id: 'c', accountId: 'x', date: '2026-01-07', amount: 5000, categoryId: 'inc', payeeId: 'p2' }, // in 5000 Acme
    { id: 'd', accountId: 'x', date: '2026-01-08', amount: -40, categoryId: 'huh', payeeId: 'p1' },  // uncat neg → out 40 Amazon
    { id: 'e', accountId: 'x', date: '2026-01-09', amount: -25, categoryId: 'gro' },                 // no payee → out 25
    { id: 'f', accountId: 'x', date: '2026-01-10', amount: -999, categoryId: 'sav', payeeId: 'p1' }, // savings: excluded
    { id: 'g', accountId: 'x', date: '2026-01-11', amount: -70, transferId: 't1', payeeId: 'p1' },   // transfer: excluded
  ];
  const opts = { start: '2026-01-01', end: '2026-01-31', accountIds: null, payeesById };

  it('sums out/in per payee, sorts by activity, savings + transfers excluded', () => {
    const { rows, totals } = payeeActivity(txns, cats, opts);
    // Acme (5000) first, then Amazon (200), then (No payee) (25)
    expect(rows.map(r => r.name)).toEqual(['Acme Corp', 'Amazon', '(No payee)']);
    const amazon = rows.find(r => r.payeeId === 'p1');
    expect(amazon.out).toBe(200); // 100 + 60 + 40 uncategorized; savings + transfer excluded
    expect(amazon.in).toBe(0);
    const acme = rows.find(r => r.payeeId === 'p2');
    expect(acme).toMatchObject({ out: 0, in: 5000 });
    expect(totals).toEqual({ out: 225, in: 5000 });
  });

  it('groups no-payee rows into a null "(No payee)" bucket', () => {
    const { rows } = payeeActivity(txns, cats, opts);
    const none = rows.find(r => r.payeeId === null);
    expect(none).toMatchObject({ name: '(No payee)', out: 25, in: 0 });
  });

  it('attributes uncategorized rows by amount sign', () => {
    const only = [
      { id: 'u1', accountId: 'x', date: '2026-01-02', amount: -30, categoryId: 'huh', payeeId: 'p1' },
      { id: 'u2', accountId: 'x', date: '2026-01-03', amount: 200, categoryId: 'huh', payeeId: 'p1' },
    ];
    const { rows } = payeeActivity(only, cats, opts);
    expect(rows[0]).toMatchObject({ payeeId: 'p1', out: 30, in: 200 });
  });

  it('respects period + account scope and returns empty for no matches', () => {
    expect(payeeActivity(txns, cats, { ...opts, accountIds: new Set(['other']) })).toEqual({ rows: [], totals: { out: 0, in: 0 } });
    expect(payeeActivity([], cats, opts)).toEqual({ rows: [], totals: { out: 0, in: 0 } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/reportsModel.test.js`
Expected: FAIL — `payeeActivity is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/reportsModel.js`, add after the `spendingByCategory` function (it already imports nothing new — `flowOf` and `payeeNameOf` are in-file):

```js
// Money out (expense magnitude) and in (income) per payee, with a "(No payee)"
// bucket. Uncategorized non-transfer rows are attributed by amount sign as a
// last resort. Transfer legs and savings-flow rows are excluded.
export function payeeActivity(transactions, categoriesById, opts = {}) {
  const payeesById = opts.payeesById || null;
  const acc = new Map(); // key -> { payeeId, name, out, in }
  for (const t of flattenForReports(filterRows(transactions, opts))) {
    if (t.transferId != null) continue;
    const f = flowOf(t, categoriesById);
    if (f === 'savings') continue;
    const amt = Number.isFinite(t.amount) ? t.amount : 0;
    let addOut = 0, addIn = 0;
    if (f === 'income') addIn = amt;
    else if (f === 'expense') addOut = -amt;
    else if (amt < 0) addOut = -amt;   // uncategorized, money out
    else if (amt > 0) addIn = amt;     // uncategorized, money in
    if (addOut === 0 && addIn === 0) continue;
    const key = t.payeeId || '__none__';
    let rec = acc.get(key);
    if (!rec) {
      const name = t.payeeId ? (payeeNameOf(t, payeesById) || 'Unknown payee') : '(No payee)';
      rec = { payeeId: t.payeeId || null, name, out: 0, in: 0 };
      acc.set(key, rec);
    }
    rec.out += addOut;
    rec.in += addIn;
  }
  const rows = [...acc.values()].filter(r => r.out !== 0 || r.in !== 0);
  rows.sort((a, b) => (b.out + b.in) - (a.out + a.in));
  const totals = rows.reduce((s, r) => ({ out: s.out + r.out, in: s.in + r.in }), { out: 0, in: 0 });
  return { rows, totals };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/reportsModel.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reportsModel.js src/reportsModel.test.js
git commit -m "feat(payee-report): payeeActivity aggregation (out/in per payee)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: PayeeActivityTable component + styles

**Files:**
- Create: `src/PayeeActivityTable.jsx`
- Modify: `src/App.css` (append)
- Test: `src/PayeeActivityTable.test.jsx`

**Interfaces:**
- Consumes: the `payeeActivity` result (Task 1) as the `data` prop.
- Produces: `<PayeeActivityTable data={{ rows, totals }} />` — a table with Payee / Out / In columns and a Total row. A zero measure renders as `—`. Renders `No activity in this period` when `rows` is empty.

- [ ] **Step 1: Write the failing test**

Create `src/PayeeActivityTable.test.jsx`:

```js
// src/PayeeActivityTable.test.jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import PayeeActivityTable from './PayeeActivityTable.jsx';

const data = {
  rows: [
    { payeeId: 'p2', name: 'Acme Corp', out: 0, in: 5000 },
    { payeeId: 'p1', name: 'Amazon', out: 200, in: 0 },
    { payeeId: null, name: '(No payee)', out: 25, in: 0 },
  ],
  totals: { out: 225, in: 5000 },
};

describe('PayeeActivityTable', () => {
  afterEach(() => cleanup());

  it('renders payee rows, a dash for zero measures, and a Total row', () => {
    render(<PayeeActivityTable data={data} />);
    const amazon = screen.getByRole('row', { name: /Amazon/ });
    expect(within(amazon).getByText('$200.00')).toBeTruthy();
    expect(within(amazon).getByText('—')).toBeTruthy(); // In is zero

    expect(screen.getByRole('rowheader', { name: '(No payee)' })).toBeTruthy();

    const total = screen.getByRole('row', { name: /Total/ });
    expect(within(total).getByText('$225.00')).toBeTruthy();
    expect(within(total).getByText('$5,000.00')).toBeTruthy();
  });

  it('shows an empty message when there are no rows', () => {
    render(<PayeeActivityTable data={{ rows: [], totals: { out: 0, in: 0 } }} />);
    expect(screen.getByText(/no activity in this period/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/PayeeActivityTable.test.jsx`
Expected: FAIL — cannot resolve `./PayeeActivityTable.jsx`.

- [ ] **Step 3: Write the implementation**

Create `src/PayeeActivityTable.jsx`:

```jsx
// src/PayeeActivityTable.jsx
import React from 'react';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const cell = (n) => (n ? money(n) : '—');

export default function PayeeActivityTable({ data }) {
  const rows = (data && data.rows) || [];
  if (rows.length === 0) return <p className="panel-empty">No activity in this period</p>;
  const totals = (data && data.totals) || { out: 0, in: 0 };
  return (
    <div className="payee-activity-scroll">
      <table className="payee-activity-table">
        <thead>
          <tr>
            <th scope="col" className="pa-name-head">Payee</th>
            <th scope="col">Out</th>
            <th scope="col">In</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.payeeId == null ? '__none' : r.payeeId} className={r.payeeId == null ? 'pa-nopayee' : ''}>
              <th scope="row" className="pa-name">{r.name}</th>
              <td className="pa-cell">{cell(r.out)}</td>
              <td className="pa-cell">{cell(r.in)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="pa-total">
            <th scope="row" className="pa-name">Total</th>
            <td className="pa-cell">{money(totals.out)}</td>
            <td className="pa-cell">{money(totals.in)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/PayeeActivityTable.test.jsx`
Expected: PASS.

- [ ] **Step 5: Add table styles**

Append to `src/App.css`:

```css
/* Spend-by-payee (payee activity) table */
.payee-activity-scroll { overflow-x: auto; }
.payee-activity-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.payee-activity-table th, .payee-activity-table td { padding: 0.4rem 0.75rem; text-align: right; white-space: nowrap; }
.payee-activity-table .pa-name, .payee-activity-table .pa-name-head { text-align: left; font-weight: 400; }
.payee-activity-table thead th { font-size: 0.85rem; opacity: 0.75; border-bottom: 1px solid var(--border, #ddd); }
.pa-nopayee .pa-name { opacity: 0.7; font-style: italic; }
.pa-total th, .pa-total td { border-top: 2px solid var(--text, #222); font-weight: 700; }
```

- [ ] **Step 6: Commit**

```bash
git add src/PayeeActivityTable.jsx src/PayeeActivityTable.test.jsx src/App.css
git commit -m "feat(payee-report): PayeeActivityTable component + styles

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: ReportsScreen panel wiring

**Files:**
- Modify: `src/ReportsScreen.jsx` (import, `useMemo`, panel)
- Test: `src/ReportsScreen.test.jsx` (append)

**Interfaces:**
- Consumes: `payeeActivity` (Task 1), `PayeeActivityTable` (Task 2); existing `ReportsScreen` props (`transactions`, `categoriesById`, `opts`, `payeesById`).
- Produces: a "By payee" panel rendered after "Spending by category".

- [ ] **Step 1: Write the failing test**

Append to `src/ReportsScreen.test.jsx` (inside the existing top-level `describe('ReportsScreen', …)` block, after the last `it(...)`):

```js
  it('renders the By payee panel with a (No payee) row from unpayeed activity', () => {
    renderScreen();
    expect(screen.getByText(/by payee/i)).toBeTruthy();
    // The seeded transactions carry no payeeId → they land in the (No payee) bucket.
    expect(screen.getByRole('rowheader', { name: '(No payee)' })).toBeTruthy();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ReportsScreen.test.jsx -t "By payee"`
Expected: FAIL — no "By payee" text / no "(No payee)" rowheader.

- [ ] **Step 3: Add the import**

In `src/ReportsScreen.jsx`, add `payeeActivity` to the existing `reportsModel.js` import and add the component import:

```jsx
import {
  resolvePeriod, monthsInRange, scopeAccountIds,
  incomeExpenseSummary, spendingByCategory, cashFlowByMonth, netWorthByMonth,
  recurringCharges, findDuplicates, classifyRecurring, payeeActivity,
} from './reportsModel.js';
```

And alongside the other component imports (e.g. after `import CategoryBarList from './CategoryBarList.jsx';`):

```jsx
import PayeeActivityTable from './PayeeActivityTable.jsx';
```

- [ ] **Step 4: Add the useMemo**

In `src/ReportsScreen.jsx`, after the `categoryRows` memo, add:

```jsx
  const payeeSummary = useMemo(() => payeeActivity(transactions, categoriesById, { ...opts, payeesById }), [transactions, categoriesById, opts, payeesById]);
```

- [ ] **Step 5: Add the panel**

In `src/ReportsScreen.jsx`, immediately after the "Spending by category" `<section>` block, add:

```jsx
        <section className="panel">
          <div className="panel-header"><h3 className="panel-title">By payee</h3></div>
          <PayeeActivityTable data={payeeSummary} />
        </section>
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/ReportsScreen.test.jsx -t "By payee"`
Expected: PASS.

- [ ] **Step 7: Run the full suite + lint**

Run: `npx vitest run`
Expected: all tests green (prior count + the new payee-activity tests).

Run: `npx eslint src/reportsModel.js src/PayeeActivityTable.jsx src/ReportsScreen.jsx`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/ReportsScreen.jsx src/ReportsScreen.test.jsx
git commit -m "feat(payee-report): add By payee panel to Reports screen

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Manual verification (after Task 3)

Run the dev server (Playwright per webapp-testing, or by hand) and confirm:

1. Reports → the "By payee" panel appears after "Spending by category".
2. With payees on transactions: each vendor shows its Out; income payees show In; a "(No payee)" row captures unpayeed activity; an uncategorized charge with a payee still shows under that payee (by sign); the Total row sums the columns.
3. Period + scope controls re-scope the panel; a savings-flow row and a transfer never appear.

---

## Self-Review

**Spec coverage:**
- Read-only "By payee" panel after Spending-by-category → Task 3. ✓
- Out/In columns + "(No payee)" + Total row → Task 2 (view), Task 1 (model). ✓
- Sorted by (out + in) desc → Task 1 (test asserts order). ✓
- Reuses period + scope controls (no new controls) → Task 3 (passes existing `opts`). ✓
- Sign convention matches P&L → Global Constraints; Task 1. ✓
- Exclude transfers + savings; splits attribute to parent payee → Task 1 (`flattenForReports` + skips; test covers savings/transfer). ✓
- Uncategorized attributed by amount sign → Task 1 (test covers). ✓
- Empty handling → Task 1 (empty result), Task 2 (empty message). ✓
- No mutations / undo → panel is display-only. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**Type consistency:** `payeeActivity` returns `{ rows:[{payeeId,name,out,in}], totals:{out,in} }` in Task 1, consumed identically by `PayeeActivityTable` (`data.rows`, `data.totals`) in Task 2 and passed as `data={payeeSummary}` in Task 3. The no-payee bucket uses `payeeId: null` in Task 1 and is keyed/detected via `payeeId == null` in Task 2. ✓
