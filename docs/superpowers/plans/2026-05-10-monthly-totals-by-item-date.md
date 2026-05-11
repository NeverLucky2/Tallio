# Monthly Totals by Item Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "This Month" stat card, previous-month delta, and Categories panel attribute spending by **item date** (using `getItemDate`), not by `bill.month`.

**Architecture:** Add one helper `getMonthItems(bills, month)` to `spendingMath.js`, then change three spots in `App.jsx` (two inline totals + one `CategoryBreakdown` call) and the `CategoryBreakdown` component to take `items` instead of `bills`. TDD on the helper because it's pure logic.

**Tech Stack:** React 19 + Vite, Vitest (node env).

**Spec:** `docs/superpowers/specs/2026-05-10-monthly-totals-by-item-date-design.md`

**Working directory for all paths and commands:** `bill-tracker/bill-tracker/`.

**Base SHA:** `dc65139`

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/spendingMath.js` | Modify | Add `getMonthItems(bills, month)` export |
| `src/spendingMath.test.js` | Modify | Add unit tests for `getMonthItems` |
| `src/App.jsx` | Modify | Import `getMonthItems`; rewrite `selectedMonthTotal` and `previousMonthTotal`; change `CategoryBreakdown` signature + body + call site |

No new files.

---

## Task 1: Add failing tests for `getMonthItems` (TDD)

**Files:**
- Modify: `src/spendingMath.test.js` (append a new describe block at the end)

- [ ] **Step 1: Append the failing tests**

Use the Edit tool. Open `src/spendingMath.test.js` and APPEND at the end (after the last `});`):

```js
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
```

Also update the import at line 2 of the same file. Find this line:

```js
import { migrateBills, getItemDate, getVendorColor, VENDOR_PALETTE, getMonthWindow, aggregateByMonth, aggregateByDay, findRecurringCharges, aggregateByKeyword } from './spendingMath.js';
```

Replace with:

```js
import { migrateBills, getItemDate, getVendorColor, VENDOR_PALETTE, getMonthWindow, aggregateByMonth, aggregateByDay, findRecurringCharges, aggregateByKeyword, getMonthItems } from './spendingMath.js';
```

- [ ] **Step 2: Verify the tests FAIL (helper doesn't exist yet)**

Run: `npm test -- --run`
Expected: 6 new tests fail with errors about `getMonthItems is not a function` or similar. Other 101 tests still pass.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/spendingMath.test.js
git commit -m "test(spending): add failing tests for getMonthItems helper"
```

---

## Task 2: Implement `getMonthItems`

**Files:**
- Modify: `src/spendingMath.js` (add export after `getItemDate`, around line 32)

- [ ] **Step 1: Add the helper**

Find this exact block (around lines 24-32):

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

Append immediately AFTER this function (before the `export const VENDOR_PALETTE` block):

```js

export function getMonthItems(bills, month) {
  const out = [];
  for (const bill of bills || []) {
    for (const item of (bill && bill.items) || []) {
      if (!item) continue;
      if (getItemDate(bill, item).slice(0, 7) === month) {
        out.push(item);
      }
    }
  }
  return out;
}
```

- [ ] **Step 2: Verify all tests pass**

Run: `npm test -- --run`
Expected: 101 prior tests + 6 new tests = 107 passing.

- [ ] **Step 3: Commit**

```bash
git add src/spendingMath.js
git commit -m "feat(spending): add getMonthItems helper for item-date attribution"
```

---

## Task 3: Switch `selectedMonthTotal` and `previousMonthTotal` to item-date attribution

**Files:**
- Modify: `src/App.jsx` in two places:
  - Import line near line 9
  - `BillTracker` totals near lines 779-794

- [ ] **Step 1: Update the import**

Find this exact line near line 9:

```js
import { migrateBills, getItemDate, findRecurringCharges, aggregateByKeyword } from './spendingMath.js';
```

Replace with:

```js
import { migrateBills, getItemDate, findRecurringCharges, aggregateByKeyword, getMonthItems } from './spendingMath.js';
```

- [ ] **Step 2: Replace the totals computation**

Find this exact block in `BillTracker` (around lines 779-794):

```js
  const todayMonth = currentMonthKey();
  const monthBills = bills.filter(bill => bill.month === selectedMonth);
  const selectedMonthTotal = monthBills.reduce((sum, bill) =>
    sum + bill.items.reduce((itemSum, item) => itemSum + item.amount, 0), 0
  );
  const monthCardTitle = selectedMonth === todayMonth
    ? 'This Month'
    : formatMonthCompact(selectedMonth);

  const previousMonth = shiftMonth(selectedMonth, -1);
  const previousMonthTotal = bills
    .filter(bill => bill.month === previousMonth)
    .reduce((sum, bill) =>
      sum + bill.items.reduce((itemSum, item) => itemSum + item.amount, 0), 0
    );
```

Replace with:

```js
  const todayMonth = currentMonthKey();
  const monthBills = bills.filter(bill => bill.month === selectedMonth);
  const selectedMonthItems = getMonthItems(bills, selectedMonth);
  const selectedMonthTotal = selectedMonthItems.reduce((sum, item) => sum + item.amount, 0);
  const monthCardTitle = selectedMonth === todayMonth
    ? 'This Month'
    : formatMonthCompact(selectedMonth);

  const previousMonth = shiftMonth(selectedMonth, -1);
  const previousMonthTotal = getMonthItems(bills, previousMonth)
    .reduce((sum, item) => sum + item.amount, 0);
```

Two things to note:
- `monthBills` is **kept** — the bills LIST still groups by `bill.month`. Don't remove it.
- `selectedMonthItems` is computed once and reused in Task 4 by the `CategoryBreakdown` caller.

- [ ] **Step 3: Run tests**

Run: `npm test -- --run`
Expected: 107 tests pass. No regressions.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "fix(bills): attribute monthly totals by item date, not bill month"
```

---

## Task 4: Refactor `CategoryBreakdown` to take items and update call site

**Files:**
- Modify: `src/App.jsx` in two places:
  - `CategoryBreakdown` component (around lines 438-445)
  - Call site in `BillTracker`'s render (around line 1184)

- [ ] **Step 1: Update `CategoryBreakdown` signature and body**

Find this exact block (around lines 438-445):

```js
const CategoryBreakdown = ({ bills, selectedMonth }) => {
  const categoryTotals = {};
  bills.forEach(bill => {
    bill.items.forEach(item => {
      if (!categoryTotals[item.category]) categoryTotals[item.category] = 0;
      categoryTotals[item.category] += item.amount;
    });
  });
```

Replace with:

```js
const CategoryBreakdown = ({ items, selectedMonth }) => {
  const categoryTotals = {};
  items.forEach(item => {
    if (!categoryTotals[item.category]) categoryTotals[item.category] = 0;
    categoryTotals[item.category] += item.amount;
  });
```

The rest of the component (the JSX from line 446 onward, and `selectedMonth` handling) is unchanged.

- [ ] **Step 2: Update the call site**

Find this exact line (around line 1184) in `BillTracker`'s render:

```jsx
            <CategoryBreakdown bills={searchActive ? visibleBills : monthBills} selectedMonth={searchActive ? null : selectedMonth} />
```

Replace with:

```jsx
            <CategoryBreakdown items={searchActive ? visibleBills.flatMap(b => b.items) : selectedMonthItems} selectedMonth={searchActive ? null : selectedMonth} />
```

- Search mode: flattens the matched bills' items (same set the user sees in the visible bills list).
- Normal mode: uses the `selectedMonthItems` computed in Task 3 — items dated in the selected month, regardless of which bill they came from.

- [ ] **Step 3: Run tests**

Run: `npm test -- --run`
Expected: 107 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "fix(bills): Categories panel attributes by item date"
```

---

## Task 5: Final verification and commit spec/plan

**Files:**
- No code changes.

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --run`
Expected: 107 / 107 tests pass.

- [ ] **Step 2: Commit the spec and plan**

```bash
git add docs/superpowers/specs/2026-05-10-monthly-totals-by-item-date-design.md docs/superpowers/plans/2026-05-10-monthly-totals-by-item-date.md
git commit -m "docs: monthly totals by item date design and plan"
```

- [ ] **Step 3: Final history review**

Run: `git log --oneline -8`

Expected recent commits (most recent first):
- `docs: monthly totals by item date design and plan`
- `fix(bills): Categories panel attributes by item date`
- `fix(bills): attribute monthly totals by item date, not bill month`
- `feat(spending): add getMonthItems helper for item-date attribution`
- `test(spending): add failing tests for getMonthItems helper`

---

## Acceptance Criteria

After all tasks complete:

1. **February shows correct total.** Given a March bill with Feb-dated items, the "This Month" card shows the sum of Feb-dated items when February is selected.
2. **Previous-month delta correct.** The delta % vs prior month uses item-date attribution for both numerator and denominator.
3. **Categories panel correct.** With February selected, Categories shows breakdown of Feb-dated items, ignoring March-dated items in the same bills.
4. **Bills list unchanged.** A March-statement bill still appears under March in the bills list (you can expand it to see Feb items inside).
5. **Search mode unchanged.** When searching, CategoryBreakdown still shows categories of all items in the matching bills, and the "this period" label appears (no month).
6. **All other panels unchanged.** SpendingChart, TrackedPanel, Subscriptions, "Total Expenses", "Total Bills" all behave exactly as before.
7. **107 / 107 unit tests pass.**

## Manual Verification (controller does after all subagents complete)

In the running app:
1. Create or find a bill dated `2026-03` with at least one item dated `2026-02-XX`.
2. Use the month toggle to navigate to February 2026.
3. Confirm the "This Month" (or "Feb 2026") stat card shows the Feb-dated item amounts, not `$0`.
4. Confirm the Categories panel lists the category of that Feb-dated item.
5. Navigate back to March — the bill is still in the bills list, but the totals/categories reflect only March-dated items.
6. With the same setup, type something in the search bar — Categories panel still shows breakdown across all matched bills, label shows no month.
