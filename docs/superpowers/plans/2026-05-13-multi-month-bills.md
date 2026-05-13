# Multi-Month Bills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bills appear in every calendar month their items span (not just a single anchor month), so clicking February on the SpendingChart surfaces every bill that contributed to February's spending.

**Architecture:** Pure derivation, no schema change. `bill.month` keeps its slot but is reframed as the "anchor month" (fallback for items without dates). Four new pure helpers in `spendingMath.js` compute the months a bill participates in, the per-month item slice, and the primary/latest month. UI filters, the bill card, and recurring-chain logic switch from `bill.month === X` equality checks to multi-month set membership.

**Tech Stack:** React 19, Vite 7, Vitest. Existing modules: `src/spendingMath.js`, `src/App.jsx`, `src/SpendingChart.jsx`. No new dependencies.

**Branch:** Work happens on a new branch `feat/multi-month-bills`, cut off the current branch (`feat/reporting-and-export`) which has the spec commit `eec977b` as its head.

**Spec reference:** `docs/superpowers/specs/2026-05-13-multi-month-bills-design.md` is the source of truth if any task feels under-specified.

---

## Task 1: Cut the feature branch

**Files:** none

- [ ] **Step 1: Verify clean working tree on the spec branch**

```bash
git status
```

Expected: `On branch feat/reporting-and-export ... nothing to commit, working tree clean`.

- [ ] **Step 2: Cut the new branch**

```bash
git checkout -b feat/multi-month-bills
```

Expected: `Switched to a new branch 'feat/multi-month-bills'`. The spec commit (`eec977b`) is the new branch's first inherited commit.

- [ ] **Step 3: Verify**

```bash
git branch --show-current
```

Expected: `feat/multi-month-bills`.

No commit for this task — it's just branch setup.

---

## Task 2: `getPrimaryMonth` pure function (TDD)

**Files:**
- Modify: `src/spendingMath.test.js`
- Modify: `src/spendingMath.js`

- [ ] **Step 1: Write the failing tests**

Append to `src/spendingMath.test.js`:

```js
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/spendingMath.test.js
```

Expected: 6 failures with `getPrimaryMonth is not defined` / `not exported`.

- [ ] **Step 3: Implement `getPrimaryMonth`**

Open `src/spendingMath.js`. Find the existing `getItemDate` export (around line 27). Add the new function immediately after `getItemDate`'s closing brace:

```js
export function getPrimaryMonth(bill) {
  let earliest = null;
  for (const item of (bill && bill.items) || []) {
    if (item && typeof item.date === 'string' && DATE_RE.test(item.date)) {
      const m = item.date.slice(0, 7);
      if (earliest === null || m < earliest) earliest = m;
    }
  }
  if (earliest !== null) return earliest;
  if (bill && typeof bill.month === 'string' && MONTH_RE.test(bill.month)) return bill.month;
  return currentMonth();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run src/spendingMath.test.js
```

Expected: all `getPrimaryMonth` tests pass; existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "feat(multi-month): getPrimaryMonth — earliest item month with bill.month fallback"
```

---

## Task 3: `getBillMonths` pure function (TDD)

**Files:**
- Modify: `src/spendingMath.test.js`
- Modify: `src/spendingMath.js`

- [ ] **Step 1: Append the failing tests**

Append to `src/spendingMath.test.js`:

```js
import { getBillMonths } from './spendingMath.js';

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
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/spendingMath.test.js
```

Expected: 7 failures with `getBillMonths is not defined`.

- [ ] **Step 3: Implement `getBillMonths`**

Open `src/spendingMath.js`. Add immediately after `getPrimaryMonth`:

```js
export function getBillMonths(bill) {
  const months = new Set([getPrimaryMonth(bill)]);
  for (const item of (bill && bill.items) || []) {
    if (item && typeof item.date === 'string' && DATE_RE.test(item.date)) {
      months.add(item.date.slice(0, 7));
    }
  }
  return months;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run src/spendingMath.test.js
```

Expected: all `getBillMonths` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "feat(multi-month): getBillMonths — set of all months a bill spans"
```

---

## Task 4: `getLatestMonth` pure function (TDD)

**Files:**
- Modify: `src/spendingMath.test.js`
- Modify: `src/spendingMath.js`

- [ ] **Step 1: Append the failing tests**

Append to `src/spendingMath.test.js`:

```js
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/spendingMath.test.js
```

Expected: 5 failures with `getLatestMonth is not defined`.

- [ ] **Step 3: Implement `getLatestMonth`**

Add to `src/spendingMath.js` immediately after `getBillMonths`:

```js
export function getLatestMonth(bill) {
  let latest = getPrimaryMonth(bill);
  for (const item of (bill && bill.items) || []) {
    if (item && typeof item.date === 'string' && DATE_RE.test(item.date)) {
      const m = item.date.slice(0, 7);
      if (m > latest) latest = m;
    }
  }
  return latest;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run src/spendingMath.test.js
```

Expected: all `getLatestMonth` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "feat(multi-month): getLatestMonth — max month a bill spans"
```

---

## Task 5: `getBillItemsForMonth` pure function (TDD)

**Files:**
- Modify: `src/spendingMath.test.js`
- Modify: `src/spendingMath.js`

- [ ] **Step 1: Append the failing tests**

Append to `src/spendingMath.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/spendingMath.test.js
```

Expected: 6 failures with `getBillItemsForMonth is not defined`.

- [ ] **Step 3: Implement `getBillItemsForMonth`**

Add to `src/spendingMath.js` immediately after `getLatestMonth`:

```js
export function getBillItemsForMonth(bill, month) {
  if (!bill || !Array.isArray(bill.items)) return [];
  const primary = getPrimaryMonth(bill);
  return bill.items.filter(item => {
    if (!item) return false;
    if (typeof item.date === 'string' && DATE_RE.test(item.date)) {
      return item.date.slice(0, 7) === month;
    }
    return month === primary;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run src/spendingMath.test.js
```

Expected: all `getBillItemsForMonth` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "feat(multi-month): getBillItemsForMonth — per-month item projection"
```

---

## Task 6: Multi-month support in `computeCatchUp` (TDD)

**Files:**
- Modify: `src/spendingMath.test.js`
- Modify: `src/spendingMath.js`

- [ ] **Step 1: Append failing tests**

Append to `src/spendingMath.test.js`. Add these tests inside the existing `describe('computeCatchUp', ...)` block (find its closing `});` and insert immediately before it):

```js
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
    const chainSource = makeBill({
      id: 'b_apr', month: '2026-04', vendor: 'Honda',
      recurring: true, recurringChainId: 'rec_h',
      items: [{ id: 'it1', amount: 452, description: 'Auto', categoryId: 'c_auto', date: '2026-04-15' }],
    });
    // A non-chain Honda bill that spans May–June.
    const stray = makeBill({
      id: 'b_stray', month: '2026-05', vendor: 'Honda',
      items: [
        { id: 'it_a', amount: 100, description: 'something', categoryId: 'c_auto', date: '2026-05-20' },
        { id: 'it_b', amount: 50,  description: 'leak',      categoryId: 'c_auto', date: '2026-06-02' },
      ],
    });
    const out = computeCatchUp([chainSource, stray], '2026-07');
    // Conflict should be reported on May (the first target month covered by the stray bill).
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0].targetMonth).toBe('2026-05');
    expect(out.conflicts[0].existingBillId).toBe('b_stray');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/spendingMath.test.js
```

Expected: 3 new failures (existing behavior treats `b.month` as single-valued).

- [ ] **Step 3: Edit `computeCatchUp`**

Open `src/spendingMath.js`. Locate `computeCatchUp` (currently around line 422). Apply four edits.

**Edit 3a** — change the sort that finds the chain's latest bill (around line 449):

```js
// before
const sortedChain = chainBills.slice().sort((a, b) => (a.month ?? '').localeCompare(b.month ?? ''));
// after
const sortedChain = chainBills.slice().sort((a, b) => getLatestMonth(a).localeCompare(getLatestMonth(b)));
```

**Edit 3b** — base the target-month range on the source's latest spanned month (around line 458):

```js
// before
const targets = monthsBetweenExclusiveInclusive(source.month, todayMonth);
// after
const targets = monthsBetweenExclusiveInclusive(getLatestMonth(source), todayMonth);
```

**Edit 3c** — make the "already in chain" check span-aware (around line 460):

```js
// before
const alreadyInChain = working.some(b =>
  b.recurringChainId === chainId && b.month === targetMonth
);
// after
const alreadyInChain = working.some(b =>
  b.recurringChainId === chainId && getBillMonths(b).has(targetMonth)
);
```

**Edit 3d** — make the conflict check span-aware (around line 465):

```js
// before
const conflictBill = working.find(b =>
  b.month === targetMonth &&
  b.vendor === source.vendor &&
  b.recurringChainId !== chainId
);
// after
const conflictBill = working.find(b =>
  getBillMonths(b).has(targetMonth) &&
  b.vendor === source.vendor &&
  b.recurringChainId !== chainId
);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run src/spendingMath.test.js
```

Expected: the 3 new tests pass; all existing `computeCatchUp` tests still pass (single-month behavior is preserved because `getLatestMonth` of a single-month bill equals `bill.month`, and `getBillMonths(b).has(targetMonth)` matches `b.month === targetMonth`).

- [ ] **Step 5: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "feat(multi-month): computeCatchUp considers spanned months"
```

---

## Task 7: Multi-month support in `findAutoRecurringChains` (TDD)

**Files:**
- Modify: `src/spendingMath.test.js`
- Modify: `src/spendingMath.js`

- [ ] **Step 1: Append failing tests**

Append to `src/spendingMath.test.js`. Inside the existing `describe('findAutoRecurringChains', ...)` block, before its closing `});`, add:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run src/spendingMath.test.js
```

Expected: 2 new failures.

- [ ] **Step 3: Edit `findAutoRecurringChains`**

Open `src/spendingMath.js`. Locate `findAutoRecurringChains` (currently around line 540). Apply three edits.

**Edit 3a** — sort-by-latest (around line 551):

```js
// before
const sorted = chainBills.slice().sort((a, b) => (a.month ?? '').localeCompare(b.month ?? ''));
// after
const sorted = chainBills.slice().sort((a, b) => getLatestMonth(a).localeCompare(getLatestMonth(b)));
```

**Edit 3b** — month count counts spanned months (around line 581):

```js
// before
const uniqueMonths = new Set(sorted.map(b => b.month));
// after
const uniqueMonths = new Set(sorted.flatMap(b => [...getBillMonths(b)]));
```

**Edit 3c** — `firstDate` / `lastDate` use the primary / latest of the boundary bills (around lines 594-595):

```js
// before
firstDate: `${sorted[0].month}-01`,
lastDate: `${latest.month}-01`,
// after
firstDate: `${getPrimaryMonth(sorted[0])}-01`,
lastDate: `${getLatestMonth(latest)}-01`,
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run src/spendingMath.test.js
```

Expected: 2 new tests pass; all existing `findAutoRecurringChains` tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "feat(multi-month): findAutoRecurringChains counts spanned months"
```

---

## Task 8: Bill list filter in App.jsx

**Files:**
- Modify: `src/App.jsx`

This task is a one-line filter change that makes multi-month bills appear in every month they span. No new test (covered by the smoke test in Task 12). Manual smoke is the verification.

- [ ] **Step 1: Update the import**

Open `src/App.jsx`. Find the import line for `spendingMath.js` (a single import block near the top — search for `from './spendingMath.js'`). Add `getBillMonths` to the imported names. Example before/after:

```js
// before — locate this line (exact existing imports may vary, but this name is what matters)
import { migrateBills, getItemDate, getMonthItems, /* ...etc */ } from './spendingMath.js';
// after — add getBillMonths
import { migrateBills, getItemDate, getMonthItems, getBillMonths, /* ...etc */ } from './spendingMath.js';
```

- [ ] **Step 2: Update the filter**

Find this line in `src/App.jsx` (currently around line 721):

```js
const monthBills = bills.filter(bill => bill.month === selectedMonth);
```

Replace with:

```js
const monthBills = bills.filter(bill => getBillMonths(bill).has(selectedMonth));
```

- [ ] **Step 3: Run the full test suite**

```bash
npm test -- --run
```

Expected: all 356+ tests still pass. (No new tests at this step.)

- [ ] **Step 4: Manual smoke**

Start the dev server (if not already running):

```bash
npm run dev
```

1. In the app, create a new bill in February. Add two items: one dated Feb 15, one dated Mar 4.
2. Verify the bill card appears in **February's** dashboard.
3. Use the month toggle (or click March on SpendingChart) to switch to March.
4. Verify the bill card **also appears** in March's dashboard.
5. Note: the bill totals on the card may still show the full-bill total at this step — that's fixed in Task 9.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(multi-month): bill list filter surfaces bills in every spanned month"
```

---

## Task 9: Bill card collapsed header — per-month slice + span indicator

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Update the import**

Open `src/App.jsx`. Extend the `spendingMath.js` import to also bring in `getBillItemsForMonth`, `getPrimaryMonth`, and `getLatestMonth`:

```js
// before — line from Task 8 result
import { migrateBills, getItemDate, getMonthItems, getBillMonths, /* ...etc */ } from './spendingMath.js';
// after
import { migrateBills, getItemDate, getMonthItems, getBillMonths, getBillItemsForMonth, getPrimaryMonth, getLatestMonth, /* ...etc */ } from './spendingMath.js';
```

- [ ] **Step 2: Pass `selectedMonth` into `BillCard`**

Find the `<BillCard ... />` render call (currently around line 1422). Add a `selectedMonth` prop:

```jsx
<BillCard
  key={bill.id}
  bill={bill}
  selectedMonth={selectedMonth}
  defaultCategoryId={cats.otherId()}
  /* ... existing props unchanged ... */
/>
```

- [ ] **Step 3: Update `BillCard`'s signature and collapsed-header rendering**

Find `const BillCard = ({ bill, defaultCategoryId, categories, categoriesById, ...` (currently around line 191). Add `selectedMonth` to its destructured props:

```js
// before
const BillCard = ({ bill, defaultCategoryId, categories, categoriesById, otherCategoryId, onUpdate, onDelete, onDeleteItem, onMakeRecurring, onDuplicateBill, isMobile, highlighted = false, cardRef = null }) => {
// after
const BillCard = ({ bill, selectedMonth, defaultCategoryId, categories, categoriesById, otherCategoryId, onUpdate, onDelete, onDeleteItem, onMakeRecurring, onDuplicateBill, isMobile, highlighted = false, cardRef = null }) => {
```

Find the collapsed-header render (currently around lines 232-238):

```jsx
<div className="bill-info">
  <h3 className="bill-vendor">{bill.vendor || "Untitled Bill"}</h3>
  <div className="bill-meta">
    {formatMonth(bill.month)}
    <div className="bill-meta-dot" />
    {bill.items.length} item{bill.items.length !== 1 ? 's' : ''}
  </div>
</div>
```

Replace with:

```jsx
<div className="bill-info">
  <h3 className="bill-vendor">{bill.vendor || "Untitled Bill"}</h3>
  <div className="bill-meta">
    {(() => {
      const primary = getPrimaryMonth(bill);
      const latest = getLatestMonth(bill);
      return primary === latest
        ? formatMonth(primary)
        : <>{formatMonth(primary)} <span className="bill-meta-arrow">→</span> {formatMonth(latest)}</>;
    })()}
    <div className="bill-meta-dot" />
    {(() => {
      const sliceCount = selectedMonth
        ? getBillItemsForMonth(bill, selectedMonth).length
        : bill.items.length;
      return <>{sliceCount} item{sliceCount !== 1 ? 's' : ''}</>;
    })()}
  </div>
</div>
```

(`selectedMonth` may be `null` during a search-active view — fall back to `bill.items.length` in that case.)

- [ ] **Step 4: Make `direction` and `displayAmount` use the per-month slice**

Find this block at the top of `BillCard` (currently around lines 193-195):

```js
const billNet = getBillNet(bill, categoriesById);
const direction = billNet.net > 0 ? 'in' : billNet.net < 0 ? 'out' : 'flat';
const displayAmount = Math.abs(billNet.net);
```

Replace with:

```js
const slicedItems = selectedMonth
  ? getBillItemsForMonth(bill, selectedMonth)
  : (bill.items || []);
const billNet = getBillNet({ ...bill, items: slicedItems }, categoriesById);
const direction = billNet.net > 0 ? 'in' : billNet.net < 0 ? 'out' : 'flat';
const displayAmount = Math.abs(billNet.net);
```

This keeps `getBillNet`'s existing flow-aware accounting (income/expense/savings split) — we just feed it the sliced items instead of the full bill. The collapsed header total badge, which already reads `formatCurrency(displayAmount)`, will now show the per-month total automatically. No JSX change to the badge itself.

- [ ] **Step 5: Add CSS for the arrow**

Open `src/App.css`. Find the existing `.bill-meta` selector (search for `.bill-meta {`). Add this rule below it:

```css
.bill-meta-arrow {
  margin: 0 2px;
  color: var(--text-muted, #9aa3b2);
  font-size: 0.95em;
}
```

If `--text-muted` isn't defined in your theme, substitute a literal color (the codebase already uses `#9aa3b2` as a muted gray in multiple places).

- [ ] **Step 6: Run the full test suite**

```bash
npm test -- --run
```

Expected: all tests still pass.

- [ ] **Step 7: Manual smoke**

```bash
npm run dev
```

Continuing from Task 8's bill (Feb 15 + Mar 4 items):

1. In **February** view, the bill card should show `Feb 2026 → Mar 2026 · 1 item · $X` where X is the Feb item amount only.
2. In **March** view, the same bill card should show `Feb 2026 → Mar 2026 · 1 item · $Y` where Y is the Mar item amount.
3. The dashboard `Spent` stat in each month should equal the bill card's sliced total for a single-bill case (sanity check that "totals add up").
4. Click the bill card to expand it. Verify all items (Feb and Mar) are visible inside, regardless of which month you came from.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat(multi-month): bill card shows per-month slice with span indicator"
```

---

## Task 10: Add Item default date for cross-month context

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Update `addItem` in `BillCard`**

Inside `BillCard` (around line 197), find the `addItem` function:

```js
const addItem = () => {
  const newItem = { id: Date.now(), description: "", amount: 0, categoryId: defaultCategoryId, date: null };
  onUpdate({ ...bill, items: [...bill.items, newItem] });
};
```

Replace with:

```js
const addItem = () => {
  const primary = getPrimaryMonth(bill);
  const date = (selectedMonth && selectedMonth !== primary)
    ? `${selectedMonth}-01`
    : null;
  const newItem = { id: Date.now(), description: "", amount: 0, categoryId: defaultCategoryId, date };
  onUpdate({ ...bill, items: [...bill.items, newItem] });
};
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test -- --run
```

Expected: all tests still pass.

- [ ] **Step 3: Manual smoke**

```bash
npm run dev
```

1. Open the Feb–Mar Acme bill in **March** view.
2. Expand the card and click `+ Add Item`.
3. Confirm the new item's date input shows `2026-03-01` (not blank).
4. Switch to **February** view and confirm the same bill appears there too.
5. Open another single-month bill (its primary month equals selectedMonth). Click `+ Add Item` — the new item's date should be **blank** (no behavior change for single-month bills).

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(multi-month): +Add Item defaults date to viewed month when cross-month"
```

---

## Task 11: SpendingChart vendor list

**Files:**
- Modify: `src/SpendingChart.jsx`

- [ ] **Step 1: Update the import**

Open `src/SpendingChart.jsx`. Find the existing import from `./spendingMath.js` (top of file, around line 2). Add `getBillMonths`:

```js
// before
import {
  aggregateByMonth,
  aggregateByDay,
  getVendorColor,
  getMonthWindow,
} from './spendingMath.js';
// after
import {
  aggregateByMonth,
  aggregateByDay,
  getVendorColor,
  getMonthWindow,
  getBillMonths,
} from './spendingMath.js';
```

- [ ] **Step 2: Update the vendor window check**

Find the `vendors = useMemo(...)` block (currently around line 71). Inside the loop find:

```js
if (!window.has(b.month)) continue;
```

Replace with:

```js
const billMonths = getBillMonths(b);
let inWindow = false;
for (const m of billMonths) {
  if (window.has(m)) { inWindow = true; break; }
}
if (!inWindow) continue;
```

(A `[...billMonths].some(...)` one-liner also works; the explicit loop avoids the spread allocation in a tight memo.)

- [ ] **Step 3: Run the full test suite**

```bash
npm test -- --run
```

Expected: all tests still pass.

- [ ] **Step 4: Manual smoke**

```bash
npm run dev
```

1. With the Feb–Mar Acme bill in your data, open SpendingChart and verify "Acme" appears in the vendor chip list when you're in any month whose 12-month window covers Feb or Mar.
2. Click the "Acme" chip — bars should filter to Acme. Confirm both Feb and Mar bars show Acme spending.

- [ ] **Step 5: Commit**

```bash
git add src/SpendingChart.jsx
git commit -m "feat(multi-month): SpendingChart vendor list considers spanned months"
```

---

## Task 12: End-to-end smoke test + final manual smoke

**Files:**
- Modify: `src/__smoke__/setup.test.jsx`

- [ ] **Step 1: Append the E2E test**

Append to `src/__smoke__/setup.test.jsx`:

```jsx
import { getBillMonths, getBillItemsForMonth, getPrimaryMonth, getLatestMonth } from '../spendingMath.js';

describe('end-to-end: multi-month bill attribution', () => {
  it('a bill with Feb 15 + Mar 4 items participates in both Feb and Mar', () => {
    const bill = {
      id: 'b_acme', vendor: 'Acme', month: '2026-02',
      items: [
        { id: 'i1', description: 'Feb charge', amount: 60, categoryId: 'c_food', date: '2026-02-15' },
        { id: 'i2', description: 'Mar charge', amount: 40, categoryId: 'c_food', date: '2026-03-04' },
      ],
    };

    expect([...getBillMonths(bill)].sort()).toEqual(['2026-02', '2026-03']);
    expect(getPrimaryMonth(bill)).toBe('2026-02');
    expect(getLatestMonth(bill)).toBe('2026-03');

    const febSlice = getBillItemsForMonth(bill, '2026-02');
    const marSlice = getBillItemsForMonth(bill, '2026-03');
    expect(febSlice.map(i => i.id)).toEqual(['i1']);
    expect(marSlice.map(i => i.id)).toEqual(['i2']);
    expect(febSlice.reduce((s, i) => s + i.amount, 0)).toBe(60);
    expect(marSlice.reduce((s, i) => s + i.amount, 0)).toBe(40);
  });

  it('a dateless item lives in the bill primary month only', () => {
    const bill = {
      id: 'b_mix', vendor: 'Acme', month: '2026-02',
      items: [
        { id: 'i_dated_feb', amount: 30, date: '2026-02-22' },
        { id: 'i_dateless',  amount: 20, date: null },
        { id: 'i_dated_mar', amount: 40, date: '2026-03-04' },
      ],
    };

    const febSlice = getBillItemsForMonth(bill, '2026-02');
    expect(febSlice.map(i => i.id).sort()).toEqual(['i_dated_feb', 'i_dateless']);
    const marSlice = getBillItemsForMonth(bill, '2026-03');
    expect(marSlice.map(i => i.id)).toEqual(['i_dated_mar']);
  });
});
```

- [ ] **Step 2: Run the smoke tests**

```bash
npm test -- --run src/__smoke__/setup.test.jsx
```

Expected: existing smoke tests still pass + 2 new tests pass.

- [ ] **Step 3: Run the entire test suite**

```bash
npm test -- --run
```

Expected: every test passes. The final count should be the pre-multi-month count plus ~24 new helper tests plus 5 multi-month recurring/chain tests plus 2 smoke tests (≈31 new tests total).

- [ ] **Step 4: Final manual browser smoke**

```bash
npm run dev
```

Walk through:

1. **Create a multi-month bill manually**: in Feb view, create a bill "Acme" with two items, one dated 2026-02-15 ($60), one dated 2026-03-04 ($40).
2. **Feb view check**: bill card shows `Feb 2026 → Mar 2026 · 1 item · $60.00`. Dashboard `Spent` stat reflects $60 contribution.
3. **Switch to Mar via month toggle**: same bill card shows `Feb 2026 → Mar 2026 · 1 item · $40.00`. Dashboard `Spent` stat reflects $40.
4. **Switch to Mar via SpendingChart click**: same as above — clicking the Mar bar should now show the Acme bill.
5. **Expand the card** in either month: all three items visible (or all 2 if you didn't add a third), regardless of view.
6. **+ Add Item in March view**: new item's date defaults to `2026-03-01`. Verify the new dated item appears in Mar's slice.
7. **+ Add Item in Feb view (primary)**: new item's date is blank. Verify it lives in Feb's slice (since Feb is the primary).
8. **Vendor filter**: open SpendingChart, click `Acme` chip — bars filter to Acme. Both Feb and Mar bars show Acme.
9. **Reports → Recurring breakdown**: if you've toggled the bill to recurring, confirm it counts as 2 months in `monthCount`.
10. **Export**: hit `↗ Export`, unzip the bundle, verify `data.json` round-trips `bill.month` and items unchanged.

Stop the dev server with Ctrl+C.

- [ ] **Step 5: Commit the smoke test**

```bash
git add src/__smoke__/setup.test.jsx
git commit -m "test(multi-month): smoke test for cross-month bill attribution"
```

---

## Notes for the implementer

- **Branch:** Work happens on `feat/multi-month-bills`, cut from `feat/reporting-and-export` (Task 1).
- **Stop on failure:** If any TDD step's "verify it fails" doesn't fail for the expected reason, stop and check the test code. Tests should fail with a clear "not defined" / "not exported" / assertion-mismatch message — never a syntax error.
- **Order matters:** Tasks 2-5 (the four helpers) are independent of each other but all four must come before Tasks 6-11 (which consume them). Tasks 8 and 9 must come before Task 10 (Task 10 depends on `selectedMonth` being wired into `BillCard`).
- **Manual smoke matters:** Vitest doesn't catch CSS layout or visual regressions. The browser smoke steps in Tasks 8, 9, 10, 11, and 12 are the real verification for UI work.
- **Schema unchanged:** This feature does NOT touch the schema version or `migrateBills`. No localStorage migration, no export format change. Existing data works as-is; bills whose items happen to span months will silently start appearing in additional months.
- **Spec reference:** `docs/superpowers/specs/2026-05-13-multi-month-bills-design.md` is the source of truth if any task feels under-specified.
