# Split Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Quicken-style split transactions: a transaction can carry a list of category/transfer lines, each with its own description and signed amount, summing to the parent's bank-debit amount; the register collapses each split parent into an expandable row; reports attribute spending per-line.

**Architecture:** Splits are stored as an optional array on the parent transaction. A small pure-validation helper (`validateSplits`) enforces invariants at the `useLedger` boundary. A small generator (`flattenForReports`) explodes splits into virtual per-line rows that the four flow-aware report functions consume; balance, net-worth, recurring, and duplicate-detection functions stay on raw transactions. A new `SplitsEditor` modal is opened from both `TransactionEditor` and `TransferEditor` via a "Split…" / "Edit splits…" button. `TransactionRow` gains a chevron that toggles per-row local React state to render line sub-rows. Transfer-line counterparts on other accounts continue to use the existing `transferId` pair model.

**Tech Stack:** React 19, Vite 7, Vitest 4, @testing-library/react 16, jsdom, nanoid. Tests are co-located alongside source files (`*.test.js` / `*.test.jsx`).

**Spec:** `docs/superpowers/specs/2026-05-28-split-transactions-design.md`. Read it once before starting — the data model, invariants, and worked examples referenced here are defined there.

**Test runner cheatsheet:**
- Run the full suite: `npm test -- run`
- Run a single file: `npx vitest run src/accountsModel.test.js`
- Run by name pattern: `npx vitest run -t "validateSplits"`
- Watch one file during TDD: `npx vitest src/accountsModel.test.js`

**Commit convention** (from recent history): `type(scope): subject`, e.g., `feat(splits): add validateSplits invariant helper`.

---

## Task 1: `validateSplits` — happy paths

**Files:**
- Modify: `src/accountsModel.js` — add `validateSplits` export at end of file
- Modify: `src/accountsModel.test.js` — add a `describe('validateSplits', …)` block

- [ ] **Step 1: Write the failing tests**

Append to `src/accountsModel.test.js`:

```js
import { validateSplits } from './accountsModel.js';

describe('validateSplits', () => {
  it('accepts a transaction with no splits field (today\'s shape)', () => {
    expect(() => validateSplits({ id: 't1', amount: -42, categoryId: 'c1' })).not.toThrow();
  });

  it('accepts a transaction with splits=null', () => {
    expect(() => validateSplits({ id: 't1', amount: -42, categoryId: 'c1', splits: null })).not.toThrow();
  });

  it('accepts a well-formed Camry down-payment (category-only splits)', () => {
    const txn = {
      id: 't_cam_down', amount: -10000,
      splits: [
        { id: 's1', amount: -9000, categoryId: 'c_auto',   description: 'Down payment principal' },
        { id: 's2', amount:  -900, categoryId: 'c_fees',   description: 'Doc / dealer fees' },
        { id: 's3', amount: -1100, categoryId: 'c_tax',    description: 'TX 6.25% sales tax' },
        { id: 's4', amount: +1000, categoryId: 'c_credit', description: 'IRS EV credit' },
      ],
    };
    expect(() => validateSplits(txn)).not.toThrow();
  });

  it('accepts a Costco split with a transfer line (cash back)', () => {
    const txn = {
      id: 't_costco', amount: -180,
      splits: [
        { id: 's1', amount: -100, categoryId: 'c_groceries', description: 'Groceries' },
        { id: 's2', amount:  -30, categoryId: 'c_household', description: 'Soap' },
        { id: 's3', amount:  -50, transferId: 'tr_cash',     description: 'ATM cash back' },
      ],
    };
    expect(() => validateSplits(txn)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/accountsModel.test.js -t "validateSplits"`
Expected: FAIL — `validateSplits is not a function`.

- [ ] **Step 3: Implement `validateSplits`**

Append to `src/accountsModel.js`:

```js
// Throws an Error if `transaction.splits` is set and violates any invariant.
// No-op when splits is absent or null. Pure; used at the useLedger boundary.
export function validateSplits(transaction) {
  const t = transaction || {};
  if (t.splits == null) return;
  if (!Array.isArray(t.splits)) throw new Error('splits must be an array');
  if (t.splits.length < 2) throw new Error('splits must have at least 2 lines');

  const ids = new Set();
  const transferIds = new Set();
  let cents = 0;
  for (const s of t.splits) {
    if (!s || typeof s.id !== 'string') throw new Error('split line missing id');
    if (ids.has(s.id)) throw new Error(`duplicate split line id: ${s.id}`);
    ids.add(s.id);
    if (!Number.isFinite(s.amount)) throw new Error(`split line ${s.id} amount not finite`);
    const hasCat = typeof s.categoryId === 'string' && s.categoryId.length > 0;
    const hasTransfer = typeof s.transferId === 'string' && s.transferId.length > 0;
    if (hasCat === hasTransfer) {
      throw new Error(`split line ${s.id} must have exactly one of categoryId or transferId`);
    }
    if (hasTransfer) {
      if (transferIds.has(s.transferId)) throw new Error(`duplicate transferId in splits: ${s.transferId}`);
      transferIds.add(s.transferId);
    }
    cents += Math.round(s.amount * 100);
  }
  const parentCents = Math.round((Number.isFinite(t.amount) ? t.amount : 0) * 100);
  if (cents !== parentCents) {
    throw new Error(`splits sum (${cents / 100}) does not match transaction amount (${parentCents / 100})`);
  }
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run src/accountsModel.test.js -t "validateSplits"`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/accountsModel.js src/accountsModel.test.js
git commit -m "feat(splits): add validateSplits invariant helper with happy-path tests"
```

---

## Task 2: `validateSplits` — rejection cases

**Files:**
- Modify: `src/accountsModel.test.js` — extend the `describe('validateSplits', …)` block

- [ ] **Step 1: Write the failing tests**

Append inside `describe('validateSplits', …)` from Task 1:

```js
it('rejects a single-line split', () => {
  const txn = { id: 't1', amount: -10, splits: [{ id: 's1', amount: -10, categoryId: 'c1', description: '' }] };
  expect(() => validateSplits(txn)).toThrow(/at least 2/i);
});

it('rejects a line missing both categoryId and transferId', () => {
  const txn = {
    id: 't1', amount: -10,
    splits: [
      { id: 's1', amount:  -5, description: 'orphan' },
      { id: 's2', amount:  -5, categoryId: 'c1', description: '' },
    ],
  };
  expect(() => validateSplits(txn)).toThrow(/exactly one of categoryId or transferId/i);
});

it('rejects a line with BOTH categoryId and transferId', () => {
  const txn = {
    id: 't1', amount: -10,
    splits: [
      { id: 's1', amount: -5, categoryId: 'c1', transferId: 'tr1', description: '' },
      { id: 's2', amount: -5, categoryId: 'c1', description: '' },
    ],
  };
  expect(() => validateSplits(txn)).toThrow(/exactly one/i);
});

it('rejects a sum mismatch (category-only)', () => {
  const txn = {
    id: 't1', amount: -10,
    splits: [
      { id: 's1', amount: -6, categoryId: 'c1', description: '' },
      { id: 's2', amount: -3, categoryId: 'c1', description: '' },
    ],
  };
  expect(() => validateSplits(txn)).toThrow(/does not match/i);
});

it('rejects a sum mismatch caused by a transfer line, not just category lines', () => {
  const txn = {
    id: 't1', amount: -180,
    splits: [
      { id: 's1', amount: -100, categoryId: 'c1', description: '' },
      { id: 's2', amount:  -30, categoryId: 'c2', description: '' },
      { id: 's3', amount:  -49, transferId: 'tr1', description: '' }, // off by $1
    ],
  };
  expect(() => validateSplits(txn)).toThrow(/does not match/i);
});

it('rejects duplicate line ids', () => {
  const txn = {
    id: 't1', amount: -10,
    splits: [
      { id: 'dup', amount: -5, categoryId: 'c1', description: '' },
      { id: 'dup', amount: -5, categoryId: 'c1', description: '' },
    ],
  };
  expect(() => validateSplits(txn)).toThrow(/duplicate split line id/i);
});

it('rejects duplicate transferIds within one parent', () => {
  const txn = {
    id: 't1', amount: -10,
    splits: [
      { id: 's1', amount: -5, transferId: 'tr1', description: '' },
      { id: 's2', amount: -5, transferId: 'tr1', description: '' },
    ],
  };
  expect(() => validateSplits(txn)).toThrow(/duplicate transferId/i);
});
```

- [ ] **Step 2: Run tests, confirm they pass**

Run: `npx vitest run src/accountsModel.test.js -t "validateSplits"`
Expected: PASS, all 11 validateSplits tests.

(Implementation from Task 1 already handles every rejection. No code change needed.)

- [ ] **Step 3: Commit**

```bash
git add src/accountsModel.test.js
git commit -m "test(splits): cover validateSplits rejection cases"
```

---

## Task 3: `flattenForReports` generator

**Files:**
- Modify: `src/reportsModel.js` — add `flattenForReports` export
- Modify: `src/reportsModel.test.js` — add `describe('flattenForReports', …)` block

- [ ] **Step 1: Write the failing tests**

Append to `src/reportsModel.test.js`:

```js
import { flattenForReports } from './reportsModel.js';

describe('flattenForReports', () => {
  it('yields non-split transactions unchanged', () => {
    const txns = [{ id: 't1', amount: -10, categoryId: 'c1', date: '2026-05-01', accountId: 'a1' }];
    expect([...flattenForReports(txns)]).toEqual(txns);
  });

  it('treats splits=null as non-split', () => {
    const txns = [{ id: 't1', amount: -10, categoryId: 'c1', date: '2026-05-01', accountId: 'a1', splits: null }];
    expect([...flattenForReports(txns)]).toEqual(txns);
  });

  it('explodes a split parent into one virtual row per category line', () => {
    const txns = [{
      id: 't1', amount: -180, accountId: 'a1', date: '2026-05-20', payee: 'Costco', description: 'Costco run',
      splits: [
        { id: 's1', amount: -100, categoryId: 'c_groceries', description: 'Groceries' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: 'Soap' },
      ],
    }];
    const flat = [...flattenForReports(txns)];
    expect(flat).toHaveLength(2);
    expect(flat[0]).toMatchObject({ accountId: 'a1', date: '2026-05-20', categoryId: 'c_groceries', amount: -100, description: 'Groceries', _parentId: 't1', _splitId: 's1' });
    expect(flat[1]).toMatchObject({ categoryId: 'c_household', amount: -80, description: 'Soap' });
  });

  it('drops transfer split lines (they net out, like top-level transfers do today)', () => {
    const txns = [{
      id: 't1', amount: -180, accountId: 'a1', date: '2026-05-20',
      splits: [
        { id: 's1', amount: -100, categoryId: 'c_groceries', description: '' },
        { id: 's2', amount:  -30, categoryId: 'c_household', description: '' },
        { id: 's3', amount:  -50, transferId: 'tr1',         description: 'cash back' },
      ],
    }];
    const flat = [...flattenForReports(txns)];
    expect(flat).toHaveLength(2);
    expect(flat.every(r => r.transferId == null)).toBe(true);
  });

  it('falls back to parent.description when a line has no description', () => {
    const txns = [{
      id: 't1', amount: -10, accountId: 'a1', date: '2026-05-20', description: 'Parent desc',
      splits: [
        { id: 's1', amount: -5, categoryId: 'c1', description: '' },
        { id: 's2', amount: -5, categoryId: 'c1', description: '' },
      ],
    }];
    const [r0] = [...flattenForReports(txns)];
    expect(r0.description).toBe('Parent desc');
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/reportsModel.test.js -t "flattenForReports"`
Expected: FAIL — `flattenForReports is not a function`.

- [ ] **Step 3: Implement `flattenForReports`**

Append to `src/reportsModel.js`:

```js
// Yields one "virtual row" per category-bearing unit. Splits explode into one
// row per category line; transfer splits are dropped (they net out, same as
// top-level transfers do for flow). Non-split transactions yield as-is.
export function* flattenForReports(transactions) {
  for (const t of transactions || []) {
    if (!Array.isArray(t.splits) || t.splits.length === 0) {
      yield t;
      continue;
    }
    for (const s of t.splits) {
      if (s.transferId) continue;
      yield {
        id: `${t.id}#${s.id}`,
        accountId: t.accountId,
        date: t.date,
        payee: t.payee,
        description: s.description || t.description,
        categoryId: s.categoryId,
        amount: s.amount,
        transferId: null,
        _parentId: t.id,
        _splitId: s.id,
      };
    }
  }
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run src/reportsModel.test.js -t "flattenForReports"`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/reportsModel.js src/reportsModel.test.js
git commit -m "feat(splits): add flattenForReports generator for per-line report attribution"
```

---

## Task 4: Wire `incomeExpenseSummary`, `spendingByCategory`, `cashFlowByMonth` to flatten

**Files:**
- Modify: `src/reportsModel.js` — switch the three functions to consume `flattenForReports`
- Modify: `src/reportsModel.test.js` — add per-function split-aware tests

- [ ] **Step 1: Write the failing tests**

Append to `src/reportsModel.test.js`:

```js
import { incomeExpenseSummary, spendingByCategory, cashFlowByMonth } from './reportsModel.js';

describe('reports with split transactions', () => {
  const categoriesById = new Map([
    ['c_groceries',    { id: 'c_groceries',    name: 'Groceries',         flow: 'expense', icon: '🛒', color: '#000' }],
    ['c_household',    { id: 'c_household',    name: 'Household',         flow: 'expense', icon: '🧴', color: '#111' }],
    ['c_home_improve', { id: 'c_home_improve', name: 'Home Improvement',  flow: 'expense', icon: '🏠', color: '#222' }],
    ['c_credit',       { id: 'c_credit',       name: 'Tax Credit',        flow: 'income',  icon: '↩', color: '#333' }],
  ]);

  const bigCostco = {
    id: 't_costco_big', accountId: 'a_chase', date: '2026-05-20', amount: -4300,
    payee: 'Costco', description: 'Costco big shop',
    splits: [
      { id: 's1', amount:  -180, categoryId: 'c_groceries',    description: 'Weekly groceries' },
      { id: 's2', amount:   -40, categoryId: 'c_household',    description: 'Soap' },
      { id: 's3', amount: -4080, categoryId: 'c_home_improve', description: 'Solar kit' },
    ],
  };

  it('spendingByCategory attributes each split line to its own category', () => {
    const out = spendingByCategory([bigCostco], categoriesById);
    const byName = Object.fromEntries(out.map(e => [e.name, e.total]));
    expect(byName.Groceries).toBe(180);
    expect(byName.Household).toBe(40);
    expect(byName['Home Improvement']).toBe(4080);
  });

  it('incomeExpenseSummary counts a positive (refund) split as income when its category is income-flow', () => {
    const refund = {
      id: 't_refund', accountId: 'a1', date: '2026-05-05', amount: -120,
      splits: [
        { id: 's1', amount: -200, categoryId: 'c_groceries', description: 'Items' },
        { id: 's2', amount:  +80, categoryId: 'c_credit',    description: 'Coupon refund' },
      ],
    };
    const sum = incomeExpenseSummary([refund], categoriesById);
    expect(sum.spending).toBe(200);
    expect(sum.income).toBe(80);
  });

  it('cashFlowByMonth assigns split lines to the parent\'s month', () => {
    const months = ['2026-05'];
    const out = cashFlowByMonth([bigCostco], categoriesById, { start: '2026-05-01', end: '2026-05-31' }, months);
    expect(out[0].spending).toBe(180 + 40 + 4080);
  });

  it('a transfer split line is excluded from spending totals', () => {
    const costcoCashBack = {
      id: 't_cashback', accountId: 'a1', date: '2026-05-20', amount: -180,
      splits: [
        { id: 's1', amount: -100, categoryId: 'c_groceries', description: 'Groceries' },
        { id: 's2', amount:  -30, categoryId: 'c_household', description: 'Soap' },
        { id: 's3', amount:  -50, transferId: 'tr_cash',     description: 'Cash back' },
      ],
    };
    expect(spendingByCategory([costcoCashBack], categoriesById)
      .reduce((s, e) => s + e.total, 0)).toBe(130);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/reportsModel.test.js -t "reports with split transactions"`
Expected: FAIL — the report functions still iterate raw transactions and won't see split lines.

- [ ] **Step 3: Update the three report functions**

In `src/reportsModel.js`, change the three function bodies to iterate `flattenForReports(filterRows(transactions, opts))` instead of `filterRows(transactions, opts)` directly:

```js
// incomeExpenseSummary — replace the loop header (~line 91):
for (const t of flattenForReports(filterRows(transactions, opts))) {

// spendingByCategory — replace the loop header (~line 108):
for (const t of flattenForReports(filterRows(transactions, opts))) {

// cashFlowByMonth — replace the loop header (~line 134):
for (const t of flattenForReports(filterRows(transactions, opts))) {
```

Each `for ... of` already references `filterRows(transactions, opts)`; wrap that expression in `flattenForReports(...)`. Do not touch `findDuplicates` (~line 235) or `recurringCharges` (~line 188) — those continue to operate on raw rows per decision 8 in the spec.

- [ ] **Step 4: Run all reportsModel tests, confirm they all pass**

Run: `npx vitest run src/reportsModel.test.js`
Expected: PASS — both new split-aware tests AND the existing legacy tests (since `flattenForReports` is a passthrough for non-split rows).

- [ ] **Step 5: Commit**

```bash
git add src/reportsModel.js src/reportsModel.test.js
git commit -m "feat(splits): attribute spending per split line in report aggregations"
```

---

## Task 5: Confirm `findDuplicates` and `recurringCharges` ignore splits

**Files:**
- Modify: `src/reportsModel.test.js` — pin the parent-level grouping behavior

- [ ] **Step 1: Write the failing tests**

Append to `src/reportsModel.test.js`:

```js
import { findDuplicates, recurringCharges } from './reportsModel.js';

describe('duplicate/recurring detection ignores split lines', () => {
  const categoriesById = new Map([
    ['c_groceries', { id: 'c_groceries', name: 'Groceries', flow: 'expense', icon: '🛒', color: '#000' }],
  ]);
  const split = {
    id: 't1', accountId: 'a1', date: '2026-05-20', amount: -180,
    payee: 'Costco', description: 'Costco',
    splits: [
      { id: 's1', amount: -100, categoryId: 'c_groceries', description: 'Groceries' },
      { id: 's2', amount:  -80, categoryId: 'c_groceries', description: 'Soap' },
    ],
  };
  const dupe = { ...split, id: 't2' };

  it('findDuplicates groups by parent payee+amount, not by split lines', () => {
    const out = findDuplicates([split, dupe]);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(-180);
    expect(out[0].ids).toEqual(['t1', 't2']);
  });

  it('recurringCharges groups by parent label, not by split lines', () => {
    const may = { ...split, id: 't_may', date: '2026-05-20' };
    const jun = { ...split, id: 't_jun', date: '2026-06-20' };
    const out = recurringCharges([may, jun], categoriesById, { now: new Date(2026, 5, 25) });
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('Costco');
    expect(out[0].monthCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests, confirm they pass**

Run: `npx vitest run src/reportsModel.test.js -t "duplicate/recurring detection"`
Expected: PASS — Task 4 left these functions untouched, which is the desired behavior.

- [ ] **Step 3: Commit**

```bash
git add src/reportsModel.test.js
git commit -m "test(splits): pin parent-level grouping for duplicate/recurring detection"
```

---

## Task 6: Extend `filterTransactions` — text search matches split lines

**Files:**
- Modify: `src/accountsModel.js` — extend `filterTransactions` (~line 107)
- Modify: `src/accountsModel.test.js` — add `describe('filterTransactions with splits', …)` block

- [ ] **Step 1: Write the failing tests**

Append to `src/accountsModel.test.js`:

```js
import { filterTransactions } from './accountsModel.js';

describe('filterTransactions with splits', () => {
  const categoriesById = new Map([
    ['c_grocery', { id: 'c_grocery', name: 'Groceries',       flow: 'expense' }],
    ['c_solar',   { id: 'c_solar',   name: 'Home Improvement', flow: 'expense' }],
  ]);
  const split = {
    id: 't1', accountId: 'a1', date: '2026-05-20', amount: -4300,
    payee: 'Costco', description: 'Costco big shop', categoryId: null,
    splits: [
      { id: 's1', amount:  -180, categoryId: 'c_grocery', description: 'Weekly groceries' },
      { id: 's2', amount: -4120, categoryId: 'c_solar',   description: '5kW solar panel kit' },
    ],
  };
  const other = {
    id: 't2', accountId: 'a1', date: '2026-05-19', amount: -22,
    payee: 'Starbucks', description: 'Coffee', categoryId: 'c_grocery',
  };

  it('search term matches a split line description', () => {
    const out = filterTransactions([split, other], { search: 'solar' }, categoriesById);
    expect(out.map(r => r.id)).toEqual(['t1']);
  });

  it('search term matches the name of a category referenced by a split line', () => {
    const out = filterTransactions([split, other], { search: 'home improvement' }, categoriesById);
    expect(out.map(r => r.id)).toEqual(['t1']);
  });

  it('search term that matches a parent-level field still works', () => {
    const out = filterTransactions([split, other], { search: 'costco' }, categoriesById);
    expect(out.map(r => r.id)).toEqual(['t1']);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/accountsModel.test.js -t "filterTransactions with splits"`
Expected: FAIL — current `filterTransactions` only inspects parent-level fields.

- [ ] **Step 3: Extend `filterTransactions`**

In `src/accountsModel.js`, locate `filterTransactions` (~line 107) and add a split-line match branch before the final `return false`:

```js
export function filterTransactions(rows, { search = '', month = null, categoryId = null } = {}, categoriesById = null) {
  const term = (search || '').trim().toLowerCase();
  const num = parseFloat(term);
  return (rows || []).filter(r => {
    if (month && (r.date || '').slice(0, 7) !== month) return false;
    if (categoryId && r.categoryId !== categoryId
        && !(Array.isArray(r.splits) && r.splits.some(s => s.categoryId === categoryId))) {
      return false;
    }
    if (!term) return true;
    if ((r.description || '').toLowerCase().includes(term)) return true;
    if ((r.payee || '').toLowerCase().includes(term)) return true;
    const cat = categoriesById && categoriesById.get(r.categoryId);
    if (cat && (cat.name || '').toLowerCase().includes(term)) return true;
    if (Number.isFinite(num) && Math.abs(Math.abs(r.amount || 0) - Math.abs(num)) < 0.01) return true;
    if (Array.isArray(r.splits)) {
      for (const s of r.splits) {
        if ((s.description || '').toLowerCase().includes(term)) return true;
        const sCat = categoriesById && s.categoryId && categoriesById.get(s.categoryId);
        if (sCat && (sCat.name || '').toLowerCase().includes(term)) return true;
      }
    }
    return false;
  });
}
```

(The `categoryId` filter on line 4 of the filter callback now also accepts split-line matches — this prepares Task 7's category-filter test as well.)

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run src/accountsModel.test.js -t "filterTransactions"`
Expected: PASS — both the new "with splits" describe and the existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/accountsModel.js src/accountsModel.test.js
git commit -m "feat(splits): filterTransactions matches split-line descriptions and categories"
```

---

## Task 7: `filterTransactions` — category-filter dropdown matches split lines

**Files:**
- Modify: `src/accountsModel.test.js` — add a category-filter test

- [ ] **Step 1: Write the failing test**

Append to `describe('filterTransactions with splits', …)` from Task 6:

```js
it('categoryId filter matches a split-line categoryId on a parent', () => {
  const out = filterTransactions([split, other], { categoryId: 'c_solar' }, categoriesById);
  expect(out.map(r => r.id)).toEqual(['t1']);
});

it('categoryId filter still matches a top-level categoryId on non-split rows', () => {
  const out = filterTransactions([split, other], { categoryId: 'c_grocery' }, categoriesById);
  // t1 matches because split has c_grocery in s1; t2 matches via its top-level categoryId
  expect(out.map(r => r.id).sort()).toEqual(['t1', 't2']);
});
```

- [ ] **Step 2: Run tests, confirm they pass**

Run: `npx vitest run src/accountsModel.test.js -t "filterTransactions with splits"`
Expected: PASS — the categoryId branch added in Task 6 covers this.

- [ ] **Step 3: Commit**

```bash
git add src/accountsModel.test.js
git commit -m "test(splits): cover category-filter dropdown match on split lines"
```

---

## Task 8: `sortRows` category-column places split parents in a deterministic group

**Files:**
- Modify: `src/accountsModel.js` — extend the category-sort key in `sortRows` (~line 137)
- Modify: `src/accountsModel.test.js` — add a sort-with-splits test

- [ ] **Step 1: Write the failing test**

Append to `src/accountsModel.test.js`:

```js
import { sortRows } from './accountsModel.js';

describe('sortRows handles split parents predictably', () => {
  const categoriesById = new Map([
    ['c_grocery', { id: 'c_grocery', name: 'Groceries' }],
    ['c_zebra',   { id: 'c_zebra',   name: 'Zebra' }],
  ]);
  const rows = [
    { id: 't_g',     categoryId: 'c_grocery', date: '2026-05-01', amount: -10, balance: 0 },
    { id: 't_z',     categoryId: 'c_zebra',   date: '2026-05-02', amount: -10, balance: 0 },
    { id: 't_split', categoryId: null,        date: '2026-05-03', amount: -10, balance: 0,
      splits: [
        { id: 's1', amount: -5, categoryId: 'c_grocery', description: '' },
        { id: 's2', amount: -5, categoryId: 'c_zebra',   description: '' },
      ] },
  ];

  it('ascending category sort puts split parents AFTER all real categories', () => {
    const sorted = sortRows(rows, { key: 'category', dir: 'asc' }, categoriesById);
    expect(sorted.map(r => r.id)).toEqual(['t_g', 't_z', 't_split']);
  });

  it('descending category sort puts split parents BEFORE all real categories', () => {
    const sorted = sortRows(rows, { key: 'category', dir: 'desc' }, categoriesById);
    expect(sorted.map(r => r.id)).toEqual(['t_split', 't_z', 't_g']);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/accountsModel.test.js -t "sortRows handles split parents"`
Expected: FAIL — today split parents have no `categoryId` so they sort as empty (which puts them last when ascending, but it's by accident, not by design, and the descending case is wrong).

- [ ] **Step 3: Extend the category-sort key**

In `src/accountsModel.js` `sortRows` (~line 137), update the `if (key === 'category') { … }` block so split parents are recognized explicitly (independent of any leftover top-level `categoryId`):

```js
if (key === 'category') {
  const SPLIT_KEY = '￿—SPLIT—'; // sorts after every printable category name
  const aSplit = Array.isArray(a.splits) && a.splits.length > 0;
  const bSplit = Array.isArray(b.splits) && b.splits.length > 0;
  if (aSplit) {
    sa = SPLIT_KEY;
  } else {
    const ca = categoriesById && categoriesById.get(a.categoryId);
    sa = (ca && ca.name ? ca.name : '').toLowerCase();
  }
  if (bSplit) {
    sb = SPLIT_KEY;
  } else {
    const cb = categoriesById && categoriesById.get(b.categoryId);
    sb = (cb && cb.name ? cb.name : '').toLowerCase();
  }
}
```

`￿` is a valid BMP code point that compares larger than any normal printable category name, so ascending sort places `SPLIT_KEY` rows last and descending places them first. The existing empty-string handling at lines 149-151 stays out of the way because the split key is non-empty.

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run src/accountsModel.test.js -t "sortRows"`
Expected: PASS — both the existing and new sort tests.

- [ ] **Step 5: Commit**

```bash
git add src/accountsModel.js src/accountsModel.test.js
git commit -m "feat(splits): sortRows groups split parents predictably in the category column"
```

---

## Task 9: `useLedger.addTransaction` — validate + create transfer counterparts

**Files:**
- Modify: `src/useLedger.js` — extend `addTransaction` (~line 43)
- Modify: `src/useLedger.test.jsx` — add `describe('addTransaction with splits', …)` block

- [ ] **Step 1: Write the failing tests**

Append to `src/useLedger.test.jsx`:

```js
describe('addTransaction with splits', () => {
  const seed = {
    accounts: [
      { id: 'a_chase', name: 'Chase', type: 'bank', icon: '🏦', openingBalance: 1000 },
      { id: 'a_cash',  name: 'Cash',  type: 'bank', icon: '💵', openingBalance: 0 },
    ],
    transactions: [],
  };

  it('persists the parent with splits intact', () => {
    const { result } = renderHook(() => useLedger(seed));
    let id;
    act(() => {
      id = result.current.addTransaction({
        accountId: 'a_chase', date: '2026-05-20', amount: -180, payee: 'Costco', description: 'Costco',
        splits: [
          { id: 's1', amount: -100, categoryId: 'c_grocery', description: 'Groceries' },
          { id: 's2', amount:  -80, categoryId: 'c_household', description: 'Soap' },
        ],
      });
    });
    const parent = result.current.transactions.find(t => t.id === id);
    expect(parent.splits).toHaveLength(2);
    expect(parent.amount).toBe(-180);
  });

  it('creates one counterpart transaction per transfer split line on the target account', () => {
    const { result } = renderHook(() => useLedger(seed));
    act(() => {
      result.current.addTransaction({
        accountId: 'a_chase', date: '2026-05-20', amount: -180, payee: 'Costco',
        splits: [
          { id: 's1', amount: -100, categoryId: 'c_grocery', description: 'Groceries' },
          { id: 's2', amount:  -30, categoryId: 'c_household', description: 'Soap' },
          { id: 's3', amount:  -50, transferId: 'tr_cash',    description: 'ATM cash back' },
        ],
      });
    });
    const counterparts = result.current.transactions.filter(t => t.transferId === 'tr_cash');
    expect(counterparts).toHaveLength(1);
    const cp = counterparts[0];
    expect(cp.accountId).toBe('a_cash');
    expect(cp.amount).toBe(50);
    expect(cp.description).toBe('ATM cash back');
    expect(cp.date).toBe('2026-05-20');
  });

  it('addTransaction throws and persists nothing when validateSplits fails', () => {
    const { result } = renderHook(() => useLedger(seed));
    expect(() => act(() => {
      result.current.addTransaction({
        accountId: 'a_chase', date: '2026-05-20', amount: -180,
        splits: [
          { id: 's1', amount: -10, categoryId: 'c1', description: '' }, // sum != parent.amount
          { id: 's2', amount: -10, categoryId: 'c1', description: '' },
        ],
      });
    })).toThrow(/does not match/i);
    expect(result.current.transactions).toHaveLength(0);
  });
});
```

The counterpart sign convention is `counterpart.amount = -1 * splitLine.amount`; the third test expects `+50` for a source line of `-50`.

Each transfer split needs a target `accountId`. Because today's split-line shape (per the spec) only carries `transferId`, the **caller must also pass a parallel `splitTargets` map** keyed by line id → target accountId. Wire it now (the editor will provide it in Task 18):

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/useLedger.test.jsx -t "addTransaction with splits"`
Expected: FAIL — `addTransaction` ignores `splits`.

- [ ] **Step 3: Extend `addTransaction`**

In `src/useLedger.js`, import `validateSplits` and replace `addTransaction` (~line 43) with:

```js
import { nanoid } from 'nanoid';
import { validateSplits } from './accountsModel.js';

// ... (imports above)

const addTransaction = useCallback((txn, opts = {}) => {
  // opts.splitTargets: Map<lineId, targetAccountId> for transfer split lines.
  const id = nanoid(8);
  const splits = Array.isArray(txn.splits) && txn.splits.length > 0
    ? txn.splits.map(s => ({
        id: s.id || nanoid(8),
        amount: Number.isFinite(s.amount) ? s.amount : 0,
        description: s.description || '',
        ...(s.categoryId ? { categoryId: s.categoryId } : {}),
        ...(s.transferId ? { transferId: s.transferId } : {}),
      }))
    : null;
  const parent = {
    id,
    accountId: txn.accountId,
    date: txn.date,
    amount: Number.isFinite(txn.amount) ? txn.amount : 0,
    categoryId: txn.categoryId ?? null,
    description: txn.description || '',
    payee: txn.payee ?? null,
    checkNumber: txn.checkNumber ?? null,
    transferId: txn.transferId ?? null,
    ...(splits ? { splits } : {}),
  };
  validateSplits(parent); // throws on invariant violation; caller's act() surfaces it

  setTransactions(prev => {
    const next = [...prev, parent];
    if (!splits) return next;
    const targets = opts.splitTargets || new Map();
    for (const s of splits) {
      if (!s.transferId) continue;
      const targetAccountId = targets.get(s.id);
      if (!targetAccountId) continue; // editor didn't supply target; orphan-tolerant
      next.push({
        id: nanoid(8),
        accountId: targetAccountId,
        date: parent.date,
        amount: -1 * s.amount,
        categoryId: null,
        description: s.description || '',
        payee: parent.payee,
        checkNumber: null,
        transferId: s.transferId,
      });
    }
    return next;
  });
  return id;
}, []);
```

Note the import line moves to the top. The test passes target via the public API; for the test to compile, also extend the call to thread through `opts`:

```js
// Test invocation example (used in Step 1's test 2):
result.current.addTransaction({ ...txn }, { splitTargets: new Map([['s3', 'a_cash']]) });
```

Update the test in Step 1 to pass `{ splitTargets: new Map([['s3', 'a_cash']]) }` as the second argument where the transfer counterpart is expected.

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run src/useLedger.test.jsx -t "addTransaction with splits"`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/useLedger.js src/useLedger.test.jsx
git commit -m "feat(splits): addTransaction creates transfer counterparts for split lines"
```

---

## Task 10: `useLedger.updateTransaction` — diff splits, sync counterparts

**Files:**
- Modify: `src/useLedger.js` — extend `updateTransaction` (~line 59)
- Modify: `src/useLedger.test.jsx` — add diff-and-sync tests

- [ ] **Step 1: Write the failing tests**

Append to `src/useLedger.test.jsx`:

```js
describe('updateTransaction with splits', () => {
  const seed = {
    accounts: [
      { id: 'a_chase', name: 'Chase', type: 'bank', icon: '🏦', openingBalance: 1000 },
      { id: 'a_cash',  name: 'Cash',  type: 'bank', icon: '💵', openingBalance: 0 },
      { id: 'a_savings', name: 'Savings', type: 'bank', icon: '🏦', openingBalance: 0 },
    ],
    transactions: [],
  };

  function addCostcoCashBack(result) {
    let id;
    act(() => {
      id = result.current.addTransaction({
        accountId: 'a_chase', date: '2026-05-20', amount: -180, payee: 'Costco',
        splits: [
          { id: 's1', amount: -100, categoryId: 'c_grocery', description: 'Groceries' },
          { id: 's2', amount:  -30, categoryId: 'c_household', description: 'Soap' },
          { id: 's3', amount:  -50, transferId: 'tr_cash',    description: 'Cash back' },
        ],
      }, { splitTargets: new Map([['s3', 'a_cash']]) });
    });
    return id;
  }

  it('changing a transfer line amount updates the counterpart amount (negated)', () => {
    const { result } = renderHook(() => useLedger(seed));
    const id = addCostcoCashBack(result);
    act(() => {
      result.current.updateTransaction(id, {
        amount: -200,
        splits: [
          { id: 's1', amount: -100, categoryId: 'c_grocery', description: 'Groceries' },
          { id: 's2', amount:  -30, categoryId: 'c_household', description: 'Soap' },
          { id: 's3', amount:  -70, transferId: 'tr_cash',    description: 'Cash back' },
        ],
      });
    });
    const cp = result.current.transactions.find(t => t.transferId === 'tr_cash');
    expect(cp.amount).toBe(70);
  });

  it('removing a transfer split line deletes the counterpart', () => {
    const { result } = renderHook(() => useLedger(seed));
    const id = addCostcoCashBack(result);
    act(() => {
      result.current.updateTransaction(id, {
        amount: -130,
        splits: [
          { id: 's1', amount: -100, categoryId: 'c_grocery', description: 'Groceries' },
          { id: 's2', amount:  -30, categoryId: 'c_household', description: 'Soap' },
        ],
      });
    });
    expect(result.current.transactions.find(t => t.transferId === 'tr_cash')).toBeUndefined();
  });

  it('adding a new transfer split line creates a new counterpart', () => {
    const { result } = renderHook(() => useLedger(seed));
    const id = addCostcoCashBack(result);
    act(() => {
      result.current.updateTransaction(id, {
        amount: -200,
        splits: [
          { id: 's1', amount: -100, categoryId: 'c_grocery', description: 'Groceries' },
          { id: 's2', amount:  -30, categoryId: 'c_household', description: 'Soap' },
          { id: 's3', amount:  -50, transferId: 'tr_cash',    description: 'Cash back' },
          { id: 's4', amount:  -20, transferId: 'tr_save',    description: 'Savings transfer' },
        ],
      }, { splitTargets: new Map([['s3', 'a_cash'], ['s4', 'a_savings']]) });
    });
    const savings = result.current.transactions.find(t => t.transferId === 'tr_save');
    expect(savings.accountId).toBe('a_savings');
    expect(savings.amount).toBe(20);
  });

  it('changing a transfer line\'s target account moves the counterpart', () => {
    const { result } = renderHook(() => useLedger(seed));
    const id = addCostcoCashBack(result);
    act(() => {
      result.current.updateTransaction(id, {
        amount: -180,
        splits: [
          { id: 's1', amount: -100, categoryId: 'c_grocery', description: 'Groceries' },
          { id: 's2', amount:  -30, categoryId: 'c_household', description: 'Soap' },
          { id: 's3', amount:  -50, transferId: 'tr_cash',    description: 'Cash back (to savings)' },
        ],
      }, { splitTargets: new Map([['s3', 'a_savings']]) });
    });
    const cp = result.current.transactions.find(t => t.transferId === 'tr_cash');
    expect(cp.accountId).toBe('a_savings');
    expect(cp.description).toBe('Cash back (to savings)');
  });

  it('flipping a category line → transfer line creates a counterpart', () => {
    const { result } = renderHook(() => useLedger(seed));
    let id;
    act(() => {
      id = result.current.addTransaction({
        accountId: 'a_chase', date: '2026-05-20', amount: -130, payee: 'Costco',
        splits: [
          { id: 's1', amount: -100, categoryId: 'c_grocery', description: 'Groceries' },
          { id: 's2', amount:  -30, categoryId: 'c_household', description: 'Soap' },
        ],
      });
    });
    act(() => {
      result.current.updateTransaction(id, {
        amount: -130,
        splits: [
          { id: 's1', amount: -100, categoryId: 'c_grocery', description: 'Groceries' },
          { id: 's2', amount:  -30, transferId: 'tr_new', description: 'transfer instead' },
        ],
      }, { splitTargets: new Map([['s2', 'a_cash']]) });
    });
    expect(result.current.transactions.filter(t => t.transferId === 'tr_new')).toHaveLength(1);
  });

  it('flipping a transfer line → category line deletes the counterpart', () => {
    const { result } = renderHook(() => useLedger(seed));
    const id = addCostcoCashBack(result);
    act(() => {
      result.current.updateTransaction(id, {
        amount: -180,
        splits: [
          { id: 's1', amount: -100, categoryId: 'c_grocery',   description: 'Groceries' },
          { id: 's2', amount:  -30, categoryId: 'c_household', description: 'Soap' },
          { id: 's3', amount:  -50, categoryId: 'c_household', description: 'Was transfer' },
        ],
      });
    });
    expect(result.current.transactions.find(t => t.transferId === 'tr_cash')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/useLedger.test.jsx -t "updateTransaction with splits"`
Expected: FAIL — `updateTransaction` ignores splits today.

- [ ] **Step 3: Extend `updateTransaction`**

In `src/useLedger.js`, replace `updateTransaction` (~line 59) with:

```js
const updateTransaction = useCallback((id, patch, opts = {}) => {
  setTransactions(prev => {
    const idx = prev.findIndex(t => t.id === id);
    if (idx < 0) return prev;
    const before = prev[idx];
    const next = { ...before, ...patch, id: before.id };
    if (next.splits === undefined) next.splits = before.splits;
    if (next.splits === null) delete next.splits;
    validateSplits(next);

    // Diff transfer lines vs. previous splits[].
    const prevLines = Array.isArray(before.splits) ? before.splits : [];
    const nextLines = Array.isArray(next.splits)  ? next.splits  : [];
    const prevTransferByLineId = new Map(prevLines.filter(s => s.transferId).map(s => [s.id, s]));
    const nextTransferByLineId = new Map(nextLines.filter(s => s.transferId).map(s => [s.id, s]));
    const targets = opts.splitTargets || new Map();

    let out = prev.map((t, i) => (i === idx ? next : t));

    // Removed (or flipped) transfer lines: delete their counterparts by transferId.
    for (const [lineId, prevLine] of prevTransferByLineId) {
      if (!nextTransferByLineId.has(lineId)
          || nextTransferByLineId.get(lineId).transferId !== prevLine.transferId) {
        out = out.filter(t => t.transferId !== prevLine.transferId);
      }
    }

    // Added (or flipped) transfer lines: create their counterparts.
    for (const [lineId, nextLine] of nextTransferByLineId) {
      const wasTransfer = prevTransferByLineId.get(lineId)?.transferId === nextLine.transferId;
      if (wasTransfer) continue;
      const targetAccountId = targets.get(lineId);
      if (!targetAccountId) continue;
      out = [...out, {
        id: nanoid(8),
        accountId: targetAccountId,
        date: next.date,
        amount: -1 * nextLine.amount,
        categoryId: null,
        description: nextLine.description || '',
        payee: next.payee ?? null,
        checkNumber: null,
        transferId: nextLine.transferId,
      }];
    }

    // Unchanged transfer lines whose amount/account/description changed: patch the counterpart.
    for (const [lineId, nextLine] of nextTransferByLineId) {
      const prevLine = prevTransferByLineId.get(lineId);
      if (!prevLine || prevLine.transferId !== nextLine.transferId) continue;
      const newTarget = targets.get(lineId);
      out = out.map(t => {
        if (t.transferId !== nextLine.transferId) return t;
        return {
          ...t,
          accountId: newTarget || t.accountId,
          amount: -1 * nextLine.amount,
          description: nextLine.description || '',
          date: next.date,
          payee: next.payee ?? null,
        };
      });
    }
    return out;
  });
}, []);
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run src/useLedger.test.jsx -t "updateTransaction with splits"`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/useLedger.js src/useLedger.test.jsx
git commit -m "feat(splits): updateTransaction diffs split lines and syncs counterparts"
```

---

## Task 11: `useLedger.deleteTransaction` — cascade transfer counterparts

**Files:**
- Modify: `src/useLedger.js` — extend `deleteTransaction` (~line 63)
- Modify: `src/useLedger.test.jsx` — add cascade-delete test

- [ ] **Step 1: Write the failing test**

Append to `src/useLedger.test.jsx`:

```js
describe('deleteTransaction with splits', () => {
  const seed = {
    accounts: [
      { id: 'a_chase', name: 'Chase', type: 'bank', icon: '🏦', openingBalance: 1000 },
      { id: 'a_cash',  name: 'Cash',  type: 'bank', icon: '💵', openingBalance: 0 },
    ],
    transactions: [],
  };

  it('deleting a split parent cascades the transfer counterparts', () => {
    const { result } = renderHook(() => useLedger(seed));
    let id;
    act(() => {
      id = result.current.addTransaction({
        accountId: 'a_chase', date: '2026-05-20', amount: -180, payee: 'Costco',
        splits: [
          { id: 's1', amount: -100, categoryId: 'c1', description: '' },
          { id: 's2', amount:  -30, categoryId: 'c1', description: '' },
          { id: 's3', amount:  -50, transferId: 'tr_cash', description: 'Cash back' },
        ],
      }, { splitTargets: new Map([['s3', 'a_cash']]) });
    });
    expect(result.current.transactions.find(t => t.transferId === 'tr_cash')).toBeDefined();
    act(() => { result.current.deleteTransaction(id); });
    expect(result.current.transactions.find(t => t.id === id)).toBeUndefined();
    expect(result.current.transactions.find(t => t.transferId === 'tr_cash')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx vitest run src/useLedger.test.jsx -t "deleteTransaction with splits"`
Expected: FAIL — today's `deleteTransaction` only removes by id.

- [ ] **Step 3: Extend `deleteTransaction`**

In `src/useLedger.js`, replace `deleteTransaction` (~line 63) with:

```js
const deleteTransaction = useCallback((id) => {
  setTransactions(prev => {
    const target = prev.find(t => t.id === id);
    if (!target) return prev;
    const transferIdsToCascade = new Set(
      Array.isArray(target.splits) ? target.splits.filter(s => s.transferId).map(s => s.transferId) : []
    );
    return prev.filter(t => {
      if (t.id === id) return false;
      if (t.transferId && transferIdsToCascade.has(t.transferId)) return false;
      return true;
    });
  });
}, []);
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx vitest run src/useLedger.test.jsx -t "deleteTransaction with splits"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/useLedger.js src/useLedger.test.jsx
git commit -m "feat(splits): deleteTransaction cascades transfer counterparts"
```

---

## Task 12: `useLedger.addTransfer` / `updateTransfer` — accept splits on source leg

**Files:**
- Modify: `src/useLedger.js` — extend `addTransfer` and `updateTransfer` (~lines 70, 81)
- Modify: `src/useLedger.test.jsx` — add transfer-with-splits tests

- [ ] **Step 1: Write the failing tests**

Append to `src/useLedger.test.jsx`:

```js
describe('addTransfer / updateTransfer with source-leg splits', () => {
  const tseed = {
    accounts: [
      { id: 'a_chase', name: 'Chase', type: 'bank', icon: '🏦', openingBalance: 1000 },
      { id: 'a_loan',  name: 'Camry Loan', type: 'loan', icon: '🏷️', openingBalance: -20000 },
    ],
    transactions: [],
  };

  it('addTransfer stores splits on the source leg only', () => {
    const { result } = renderHook(() => useLedger(tseed));
    let tid;
    act(() => {
      tid = result.current.addTransfer({
        fromId: 'a_chase', toId: 'a_loan', amount: 325.40, date: '2026-06-28',
        description: 'Monthly payment',
        splits: [
          { id: 's1', amount: -250.00, categoryId: 'c_principal', description: 'Principal' },
          { id: 's2', amount:  -75.40, categoryId: 'c_interest',  description: 'Interest' },
        ],
      });
    });
    const legs = result.current.transactions.filter(t => t.transferId === tid);
    const from = legs.find(l => l.accountId === 'a_chase');
    const to   = legs.find(l => l.accountId === 'a_loan');
    expect(from.splits).toHaveLength(2);
    expect(from.amount).toBe(-325.40);
    expect(to.splits).toBeUndefined();
    expect(to.amount).toBe(325.40);
  });

  it('updateTransfer replaces the source leg\'s splits', () => {
    const { result } = renderHook(() => useLedger(tseed));
    let tid;
    act(() => {
      tid = result.current.addTransfer({
        fromId: 'a_chase', toId: 'a_loan', amount: 325.40, date: '2026-06-28', description: 'Pay',
      });
    });
    act(() => {
      result.current.updateTransfer(tid, {
        fromId: 'a_chase', toId: 'a_loan', amount: 325.40, date: '2026-06-28', description: 'Pay',
        splits: [
          { id: 's1', amount: -250.00, categoryId: 'c_principal', description: 'Principal' },
          { id: 's2', amount:  -75.40, categoryId: 'c_interest',  description: 'Interest' },
        ],
      });
    });
    const from = result.current.transactions.find(t => t.transferId === tid && t.accountId === 'a_chase');
    expect(from.splits).toHaveLength(2);
  });

  it('addTransfer throws when splits sum mismatches -magnitude', () => {
    const { result } = renderHook(() => useLedger(tseed));
    expect(() => act(() => {
      result.current.addTransfer({
        fromId: 'a_chase', toId: 'a_loan', amount: 325.40, date: '2026-06-28',
        splits: [
          { id: 's1', amount: -200.00, categoryId: 'c_principal', description: 'Principal' },
          { id: 's2', amount: -100.00, categoryId: 'c_interest',  description: 'Interest' },
        ],
      });
    })).toThrow(/does not match/i);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/useLedger.test.jsx -t "addTransfer / updateTransfer with source-leg splits"`
Expected: FAIL — today's `addTransfer`/`updateTransfer` discard a `splits` field.

- [ ] **Step 3: Extend `addTransfer` and `updateTransfer`**

In `src/useLedger.js`, replace `addTransfer` (~line 70) and `updateTransfer` (~line 81):

```js
const addTransfer = useCallback(({ fromId, toId, amount, date, description = '', categoryId = null, splits = null }) => {
  const transferId = nanoid(8);
  const mag = Math.abs(Number(amount)) || 0;
  const note = description || '';
  const base = { date, categoryId: categoryId ?? null, description: note, payee: null, checkNumber: null, transferId };
  const sourceSplits = Array.isArray(splits) && splits.length > 0
    ? splits.map(s => ({
        id: s.id || nanoid(8),
        amount: Number.isFinite(s.amount) ? s.amount : 0,
        description: s.description || '',
        ...(s.categoryId ? { categoryId: s.categoryId } : {}),
        ...(s.transferId ? { transferId: s.transferId } : {}),
      }))
    : null;
  const fromLeg = { id: nanoid(8), accountId: fromId, amount: -mag, ...base, ...(sourceSplits ? { splits: sourceSplits } : {}) };
  const toLeg   = { id: nanoid(8), accountId: toId,   amount:  mag, ...base };
  validateSplits(fromLeg); // throws if sourceSplits sum != -mag
  setTransactions(prev => [...prev, fromLeg, toLeg]);
  return transferId;
}, []);

const updateTransfer = useCallback((transferId, { fromId, toId, amount, date, description = '', categoryId = null, splits = null }) => {
  if (!transferId) return;
  const mag = Math.abs(Number(amount)) || 0;
  const note = description || '';
  const cid = categoryId ?? null;
  const sourceSplits = Array.isArray(splits) && splits.length > 0
    ? splits.map(s => ({
        id: s.id || nanoid(8),
        amount: Number.isFinite(s.amount) ? s.amount : 0,
        description: s.description || '',
        ...(s.categoryId ? { categoryId: s.categoryId } : {}),
        ...(s.transferId ? { transferId: s.transferId } : {}),
      }))
    : null;
  // Validate upfront so a bad input doesn't half-apply.
  validateSplits({ amount: -mag, splits: sourceSplits });

  setTransactions(prev => {
    const legs = prev.filter(t => t.transferId === transferId);
    if (legs.length === 0) return prev;
    const fromLegId = legs[0].id;
    const toLegId = legs[1] ? legs[1].id : null;
    return prev.map(t => {
      if (t.id === fromLegId) {
        const base = { ...t, accountId: fromId, amount: -mag, date, categoryId: cid, description: note, payee: null, checkNumber: null, transferId };
        if (sourceSplits) base.splits = sourceSplits;
        else delete base.splits;
        return base;
      }
      if (toLegId && t.id === toLegId) {
        return { ...t, accountId: toId, amount: mag, date, categoryId: cid, description: note, payee: null, checkNumber: null, transferId };
      }
      return t;
    });
  });
}, []);
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run src/useLedger.test.jsx -t "addTransfer / updateTransfer with source-leg splits"`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/useLedger.js src/useLedger.test.jsx
git commit -m "feat(splits): addTransfer/updateTransfer accept splits on source leg"
```

**v1 scope note:** if the source-leg `splits` array contains a *transfer-typed*
line (a transfer within a transfer's source leg), Task 12 stores it but does
**not** auto-create a grand-counterpart transaction on the third account.
This is a rare scenario (the spec calls it out as "rare in practice"). The
user can record the third account's leg as a separate transaction manually.
Adding auto-cascade for this case is a YAGNI deferral for v1.

---

## Task 13: `useLedger.deleteAccount` — strip orphan transferIds from split lines

**Files:**
- Modify: `src/useLedger.js` — extend `deleteAccount` (~line 38)
- Modify: `src/useLedger.test.jsx` — add an orphan-cleanup test

- [ ] **Step 1: Write the failing test**

Append to `src/useLedger.test.jsx`:

```js
describe('deleteAccount with split-line counterparts on other accounts', () => {
  const seed = {
    accounts: [
      { id: 'a_chase', name: 'Chase', type: 'bank', icon: '🏦', openingBalance: 1000 },
      { id: 'a_cash',  name: 'Cash',  type: 'bank', icon: '💵', openingBalance: 0 },
    ],
    transactions: [],
  };

  it('strips orphan transferIds from split lines on remaining transactions', () => {
    const { result } = renderHook(() => useLedger(seed));
    let parentId;
    act(() => {
      parentId = result.current.addTransaction({
        accountId: 'a_chase', date: '2026-05-20', amount: -180, payee: 'Costco',
        splits: [
          { id: 's1', amount: -100, categoryId: 'c_grocery',   description: 'Groceries' },
          { id: 's2', amount:  -30, categoryId: 'c_household', description: 'Soap' },
          { id: 's3', amount:  -50, transferId: 'tr_cash',     description: 'Cash back' },
        ],
      }, { splitTargets: new Map([['s3', 'a_cash']]) });
    });
    expect(result.current.transactions.find(t => t.transferId === 'tr_cash')).toBeDefined();

    act(() => { result.current.deleteAccount('a_cash'); });

    const parent = result.current.transactions.find(t => t.id === parentId);
    expect(parent).toBeDefined();
    const s3 = parent.splits.find(s => s.id === 's3');
    expect(s3.transferId).toBeUndefined();
    expect(s3.description).toBe('Cash back'); // description preserved
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx vitest run src/useLedger.test.jsx -t "deleteAccount with split-line counterparts"`
Expected: FAIL — current `deleteAccount` removes Cash's row but the parent's `s3.transferId` still points at a missing counterpart.

- [ ] **Step 3: Extend `deleteAccount`**

In `src/useLedger.js`, replace `deleteAccount` (~line 38):

```js
const deleteAccount = useCallback((id) => {
  setAccounts(prev => prev.filter(a => a.id !== id));
  setTransactions(prev => {
    const survivingByTransferId = new Map();
    for (const t of prev) {
      if (t.accountId === id) continue;
      if (t.transferId) {
        const list = survivingByTransferId.get(t.transferId) || [];
        list.push(t);
        survivingByTransferId.set(t.transferId, list);
      }
    }
    return prev
      .filter(t => t.accountId !== id)
      .map(t => {
        if (!Array.isArray(t.splits)) return t;
        const cleaned = t.splits.map(s => {
          if (!s.transferId) return s;
          const peers = survivingByTransferId.get(s.transferId) || [];
          // If no surviving non-self counterpart exists, strip the transferId.
          const hasCounterpart = peers.some(p => p.id !== t.id);
          if (hasCounterpart) return s;
          const { transferId, ...rest } = s;
          return rest;
        });
        return { ...t, splits: cleaned };
      });
  });
}, []);
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx vitest run src/useLedger.test.jsx -t "deleteAccount with split-line counterparts"`
Expected: PASS.

Note: a transferId-less line is no longer a valid split per `validateSplits` (it has neither categoryId nor transferId). Since this is an interactive recovery state (the user must re-edit the parent to assign a category or new transfer), `validateSplits` is **not** called during account deletion. The parent stays loaded but the editor will refuse to save until the user fixes the orphaned line.

- [ ] **Step 5: Commit**

```bash
git add src/useLedger.js src/useLedger.test.jsx
git commit -m "feat(splits): deleteAccount strips orphan transferIds from split lines"
```

---

## Task 14: `SplitsEditor` component — table skeleton + lines

**Files:**
- Create: `src/SplitsEditor.jsx`
- Create: `src/SplitsEditor.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/SplitsEditor.test.jsx`:

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SplitsEditor from './SplitsEditor.jsx';

const categories = [
  { id: 'c_grocery',   name: 'Groceries', icon: '🛒', flow: 'expense' },
  { id: 'c_household', name: 'Household', icon: '🧴', flow: 'expense' },
];
const accounts = [
  { id: 'a_chase', name: 'Chase',  type: 'bank' },
  { id: 'a_cash',  name: 'Cash',   type: 'bank' },
];

function setup(props = {}) {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  render(
    <SplitsEditor
      parentAccountId="a_chase"
      parentAmount={-180}
      parentPayee="Costco"
      parentDate="2026-05-20"
      categories={categories}
      accounts={accounts}
      initialSplits={props.initialSplits ?? [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: 'Groceries' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: 'Soap' },
      ]}
      initialSplitTargets={props.initialSplitTargets ?? new Map()}
      onDone={onDone}
      onCancel={onCancel}
    />
  );
  return { onDone, onCancel };
}

describe('SplitsEditor', () => {
  afterEach(() => cleanup());

  it('renders one row per initial split line', () => {
    setup();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 lines
  });

  it('shows the parent header (payee + date)', () => {
    setup();
    expect(screen.getByText(/Costco/)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-20/)).toBeInTheDocument();
  });

  it('Cancel fires onCancel without returning lines', async () => {
    const { onCancel, onDone } = setup();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/SplitsEditor.test.jsx`
Expected: FAIL — `SplitsEditor.jsx` does not exist.

- [ ] **Step 3: Create the skeleton component**

Create `src/SplitsEditor.jsx`:

```jsx
import React, { useState } from 'react';

export default function SplitsEditor({
  parentAccountId,
  parentAmount,
  parentPayee = '',
  parentDate = '',
  categories = [],
  accounts = [],
  initialSplits = [],
  initialSplitTargets = new Map(),
  onDone,
  onCancel,
}) {
  const [lines, setLines] = useState(initialSplits);
  const [targets, setTargets] = useState(new Map(initialSplitTargets));

  const sum = lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0), 0);
  const sumOk = Math.round(sum * 100) === Math.round(parentAmount * 100);

  return (
    <div className="dialog-overlay split-editor" onClick={onCancel}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">Edit splits — {parentPayee || parentDate} · {parentDate}</h2>
        <table className="split-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Category / Account</th>
              <th>Description</th>
              <th className="right">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={line.id} className="split-line-row">
                <td>{line.transferId ? 'Transfer' : 'Category'}</td>
                <td>{line.transferId ? (accounts.find(a => a.id === targets.get(line.id))?.name || '—') : (categories.find(c => c.id === line.categoryId)?.name || '—')}</td>
                <td>{line.description}</td>
                <td className="right">{Number(line.amount).toFixed(2)}</td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={`split-sum ${sumOk ? 'ok' : 'mismatch'}`}>
          Sum of lines: {sum.toFixed(2)} · Bank impact: {parentAmount.toFixed(2)}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => onDone({ splits: lines, splitTargets: targets })}>Done</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run src/SplitsEditor.test.jsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/SplitsEditor.jsx src/SplitsEditor.test.jsx
git commit -m "feat(splits): SplitsEditor skeleton with line table, header, sum footer"
```

---

## Task 15: `SplitsEditor` — editable amount, description, category, type toggle

**Files:**
- Modify: `src/SplitsEditor.jsx`
- Modify: `src/SplitsEditor.test.jsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/SplitsEditor.test.jsx`:

```jsx
describe('SplitsEditor editing', () => {
  afterEach(() => cleanup());

  it('editing an amount input updates the sum footer', async () => {
    setup();
    const amount0 = screen.getAllByLabelText(/line amount/i)[0];
    await userEvent.clear(amount0);
    await userEvent.type(amount0, '-50');
    expect(screen.getByText(/sum of lines: -130/i)).toBeInTheDocument(); // -50 + -80
  });

  it('flipping a row from Category to Transfer swaps picker controls', async () => {
    setup();
    const typeBtns = screen.getAllByRole('button', { name: /transfer/i });
    await userEvent.click(typeBtns[0]); // first line becomes Transfer
    // After toggle: line 0 has account picker instead of category picker
    expect(screen.getAllByLabelText(/target account/i)).toHaveLength(1);
  });

  it('selecting a category sets the line\'s categoryId', async () => {
    const { onDone } = setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    const selects = screen.getAllByLabelText(/category/i);
    await userEvent.selectOptions(selects[0], 'c_household');
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onDone.mock.calls[0][0].splits[0].categoryId).toBe('c_household');
  });

  it('selecting a transfer target sets the target in splitTargets', async () => {
    const { onDone } = setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery', description: '' },
        { id: 's2', amount:  -80, transferId: 'tr1',       description: '' },
      ],
      initialSplitTargets: new Map([['s2', '']]),
    });
    const select = screen.getByLabelText(/target account/i);
    await userEvent.selectOptions(select, 'a_cash');
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onDone.mock.calls[0][0].splitTargets.get('s2')).toBe('a_cash');
  });

  it('per-line description editing flows through to onDone payload', async () => {
    const { onDone } = setup();
    const descInputs = screen.getAllByLabelText(/line description/i);
    await userEvent.type(descInputs[0], 'Solar panels');
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onDone.mock.calls[0][0].splits[0].description).toContain('Solar panels');
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/SplitsEditor.test.jsx -t "SplitsEditor editing"`
Expected: FAIL — controls are not editable yet.

- [ ] **Step 3: Replace the line-row rendering with editable controls**

In `src/SplitsEditor.jsx`, replace the `<tbody>` block:

```jsx
<tbody>
  {lines.map((line, idx) => {
    const isTransfer = !!line.transferId;
    const updateLine = (patch) => setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
    const setTarget = (accId) => setTargets(prev => { const next = new Map(prev); next.set(line.id, accId); return next; });
    const toggleType = () => {
      if (isTransfer) {
        updateLine({ transferId: undefined, categoryId: categories[0]?.id || '' });
      } else {
        updateLine({ categoryId: undefined, transferId: line.transferId || `tr_${line.id}` });
      }
    };
    return (
      <tr key={line.id} className="split-line-row">
        <td>
          <button type="button" className={`dir-btn${!isTransfer ? ' active' : ''}`} onClick={() => isTransfer && toggleType()}>Category</button>
          <button type="button" className={`dir-btn${isTransfer ? ' active' : ''}`} onClick={() => !isTransfer && toggleType()}>Transfer</button>
        </td>
        <td>
          {isTransfer ? (
            <select aria-label="Target account" className="select" value={targets.get(line.id) || ''} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Select account…</option>
              {accounts.filter(a => a.id !== parentAccountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          ) : (
            <select aria-label="Category" className="select" value={line.categoryId || ''} onChange={(e) => updateLine({ categoryId: e.target.value })}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          )}
        </td>
        <td>
          <input type="text" aria-label="Line description" className="input" value={line.description || ''} onChange={(e) => updateLine({ description: e.target.value })} />
        </td>
        <td className="right">
          <input type="number" step="0.01" aria-label="Line amount" className="input" value={line.amount} onChange={(e) => updateLine({ amount: parseFloat(e.target.value) || 0 })} />
        </td>
        <td></td>
      </tr>
    );
  })}
</tbody>
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run src/SplitsEditor.test.jsx`
Expected: PASS, all SplitsEditor tests.

- [ ] **Step 5: Commit**

```bash
git add src/SplitsEditor.jsx src/SplitsEditor.test.jsx
git commit -m "feat(splits): SplitsEditor editable lines (type/category/account/description/amount)"
```

---

## Task 16: `SplitsEditor` — +Add line, ×Delete line, ≥2-line invariant

**Files:**
- Modify: `src/SplitsEditor.jsx`
- Modify: `src/SplitsEditor.test.jsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/SplitsEditor.test.jsx`:

```jsx
describe('SplitsEditor +Add / ×Delete', () => {
  afterEach(() => cleanup());

  it('Add line appends a row with zero amount and default category', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /add line/i }));
    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3 lines
  });

  it('Delete line removes a row', async () => {
    const { onDone } = setup({
      initialSplits: [
        { id: 's1', amount: -60, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount: -60, categoryId: 'c_household', description: '' },
        { id: 's3', amount: -60, categoryId: 'c_household', description: '' },
      ],
    });
    const deleteBtns = screen.getAllByRole('button', { name: /delete line/i });
    await userEvent.click(deleteBtns[0]);
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 remaining
  });

  it('Delete is disabled when there are exactly 2 lines', () => {
    setup();
    const deleteBtns = screen.getAllByRole('button', { name: /delete line/i });
    expect(deleteBtns[0]).toBeDisabled();
    expect(deleteBtns[1]).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/SplitsEditor.test.jsx -t "Add / .Delete"`
Expected: FAIL — no buttons exist yet.

- [ ] **Step 3: Add the buttons**

In `src/SplitsEditor.jsx`, add a `+ Add line` button below the table and a `×` delete button in each row:

```jsx
// In the row's 5th <td>:
<td>
  <button
    type="button"
    aria-label="Delete line"
    className="btn-icon"
    disabled={lines.length <= 2}
    onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
  >×</button>
</td>

// After </table>:
<div>
  <button type="button" className="btn" onClick={() => {
    const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setLines(prev => [...prev, { id, amount: 0, categoryId: categories[0]?.id || '', description: '' }]);
  }}>+ Add line</button>
</div>
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run src/SplitsEditor.test.jsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/SplitsEditor.jsx src/SplitsEditor.test.jsx
git commit -m "feat(splits): SplitsEditor add/delete line with at-least-2 invariant"
```

---

## Task 17: `SplitsEditor` — Done validates, surfaces error; Unsplit button

**Files:**
- Modify: `src/SplitsEditor.jsx`
- Modify: `src/SplitsEditor.test.jsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/SplitsEditor.test.jsx`:

```jsx
describe('SplitsEditor Done validation and Unsplit', () => {
  afterEach(() => cleanup());

  it('Done shows an inline error when the sum does not match parent amount', async () => {
    const { onDone } = setup({
      initialSplits: [
        { id: 's1', amount: -50, categoryId: 'c_grocery',   description: '' }, // total -130, parent -180
        { id: 's2', amount: -80, categoryId: 'c_household', description: '' },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText(/does not match/i)).toBeInTheDocument();
  });

  it('Done succeeds when the sum matches', async () => {
    const { onDone } = setup();
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Unsplit calls onDone with splits cleared and parent.categoryId set to the largest category line', async () => {
    const { onDone } = setup({
      initialSplits: [
        { id: 's1', amount:  -80, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount: -100, categoryId: 'c_household', description: '' }, // largest
      ],
    });
    window.confirm = vi.fn(() => true);
    await userEvent.click(screen.getByRole('button', { name: /unsplit/i }));
    expect(onDone.mock.calls[0][0]).toMatchObject({ splits: null, categoryId: 'c_household' });
  });

  it('Unsplit is disabled when every line is a transfer (no category to promote)', () => {
    setup({
      initialSplits: [
        { id: 's1', amount:  -50, transferId: 'tr1', description: '' },
        { id: 's2', amount: -130, transferId: 'tr2', description: '' },
      ],
    });
    expect(screen.getByRole('button', { name: /unsplit/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/SplitsEditor.test.jsx -t "Done validation and Unsplit"`
Expected: FAIL — Done doesn't validate, Unsplit doesn't exist.

- [ ] **Step 3: Add validation and Unsplit**

In `src/SplitsEditor.jsx`, add an error state and the Unsplit button, and gate Done:

```jsx
import { validateSplits } from './accountsModel.js';

// ... inside the component, after useState calls:
const [error, setError] = useState(null);

const tryDone = () => {
  setError(null);
  try {
    validateSplits({ amount: parentAmount, splits: lines });
  } catch (e) {
    setError(e.message);
    return;
  }
  onDone({ splits: lines, splitTargets: targets });
};

const categoryLines = lines.filter(l => l.categoryId);
const canUnsplit = categoryLines.length > 0;
const doUnsplit = () => {
  if (!canUnsplit) return;
  if (!window.confirm('Turn this back into a single-category transaction? Transfer lines and their counterparts will be deleted.')) return;
  const biggest = [...categoryLines].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
  onDone({ splits: null, categoryId: biggest.categoryId });
};

// ... in JSX, replace the dialog-actions block:
<div className="dialog-actions">
  <button type="button" className="btn" onClick={doUnsplit} disabled={!canUnsplit}>Unsplit</button>
  <button type="button" className="btn" onClick={onCancel}>Cancel</button>
  <button type="button" className="btn btn-primary" onClick={tryDone}>Done</button>
</div>
{error && <p className="field-error">{error}</p>}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run src/SplitsEditor.test.jsx`
Expected: PASS, all SplitsEditor tests.

- [ ] **Step 5: Commit**

```bash
git add src/SplitsEditor.jsx src/SplitsEditor.test.jsx
git commit -m "feat(splits): SplitsEditor Done validation + Unsplit conversion"
```

---

## Task 18: `TransactionEditor` — Split… button + summary chip + Edit splits…

**Files:**
- Modify: `src/TransactionEditor.jsx`
- Modify: `src/TransactionEditor.test.jsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/TransactionEditor.test.jsx`:

```jsx
describe('TransactionEditor split wire-up', () => {
  afterEach(() => cleanup());

  function setupSplit(transaction = null) {
    const onSave = vi.fn();
    render(
      <TransactionEditor
        account={{ id: 'a_chase', name: 'Chase', type: 'bank' }}
        transaction={transaction}
        categories={categories}
        accounts={[{ id: 'a_chase', name: 'Chase', type: 'bank' }, { id: 'a_cash', name: 'Cash', type: 'bank' }]}
        onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()}
      />
    );
    return { onSave };
  }

  it('shows the Split… button for a non-split transaction', () => {
    setupSplit();
    expect(screen.getByRole('button', { name: /^split…?$/i })).toBeInTheDocument();
  });

  it('opening Split… mounts SplitsEditor', async () => {
    setupSplit();
    await userEvent.click(screen.getByRole('button', { name: /^split…?$/i }));
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
  });

  it('an existing split transaction shows the summary chip and a hidden category field', () => {
    setupSplit({
      id: 't1', accountId: 'a_chase', date: '2026-05-20', amount: -180,
      categoryId: null, description: 'Costco', payee: 'Costco',
      splits: [
        { id: 's1', amount: -100, categoryId: 'c_shop', description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_pay',  description: '' },
      ],
    });
    expect(screen.getByText(/2 split lines/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^category$/i)).not.toBeInTheDocument();
  });

  it('saving with splits returned from SplitsEditor includes them in the payload', async () => {
    const { onSave } = setupSplit();
    await userEvent.type(screen.getByLabelText(/description/i), 'Costco');
    await userEvent.clear(screen.getByLabelText(/amount/i));
    await userEvent.type(screen.getByLabelText(/amount/i), '180');
    await userEvent.click(screen.getByRole('button', { name: /^split…?$/i }));
    // Two pre-seeded lines: line 1 -180 with current category; line 2 0 with no category.
    // Editor seed in this test: line 1 -180 c_shop, line 2 0 c_shop (sum -180 ✓ by default).
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    const payload = onSave.mock.calls[0][0];
    expect(payload.splits).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/TransactionEditor.test.jsx -t "split wire-up"`
Expected: FAIL.

- [ ] **Step 3: Wire SplitsEditor into TransactionEditor**

Modify `src/TransactionEditor.jsx`:

```jsx
import React, { useState } from 'react';
import { layoutFor, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';
import SplitsEditor from './SplitsEditor.jsx';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function TransactionEditor({ account, transaction, categories, accounts = [], typesById = DEFAULT_ACCOUNT_TYPES_BY_ID, onSave, onDelete, onClose }) {
  const isEdit = !!transaction;
  const initialAmount = transaction ? Math.abs(transaction.amount) : '';
  const initialDir = transaction ? (transaction.amount >= 0 ? 'in' : 'out') : 'out';

  const [date, setDate] = useState(transaction?.date || todayISO());
  const [description, setDescription] = useState(transaction?.description || '');
  const [magnitude, setMagnitude] = useState(initialAmount);
  const [direction, setDirection] = useState(initialDir);
  const [categoryId, setCategoryId] = useState(transaction?.categoryId || (categories[0] && categories[0].id) || '');
  const [payee, setPayee] = useState(transaction?.payee || '');
  const [checkNumber, setCheckNumber] = useState(transaction?.checkNumber || '');
  const [splits, setSplits] = useState(transaction?.splits ?? null);
  const [splitTargets, setSplitTargets] = useState(new Map());
  const [splitsOpen, setSplitsOpen] = useState(false);

  const hasSplits = Array.isArray(splits) && splits.length > 0;
  const isBank = layoutFor(account.type, typesById) === 'bank';

  const parentAmount = (() => {
    const mag = Math.abs(parseFloat(magnitude) || 0);
    return direction === 'in' ? mag : -mag;
  })();

  const openSplits = () => {
    if (!hasSplits) {
      const id1 = 's_' + Date.now().toString(36);
      const id2 = id1 + '_2';
      setSplits([
        { id: id1, amount: parentAmount || 0, categoryId, description: '' },
        { id: id2, amount: 0,                 categoryId, description: '' },
      ]);
    }
    setSplitsOpen(true);
  };

  const onSplitsDone = ({ splits: nextSplits, splitTargets: nextTargets, categoryId: promotedCategoryId }) => {
    if (nextSplits === null) {
      // Unsplit
      setSplits(null);
      setSplitTargets(new Map());
      if (promotedCategoryId) setCategoryId(promotedCategoryId);
    } else {
      setSplits(nextSplits);
      if (nextTargets) setSplitTargets(nextTargets);
    }
    setSplitsOpen(false);
  };

  const save = () => {
    const amount = hasSplits ? splits.reduce((s, l) => s + l.amount, 0) : parentAmount;
    onSave({
      ...(transaction || {}),
      accountId: account.id,
      date,
      amount,
      categoryId: hasSplits ? null : categoryId,
      description: description.trim(),
      payee: isBank ? (payee.trim() || null) : null,
      checkNumber: isBank ? (checkNumber.trim() || null) : null,
      ...(hasSplits ? { splits, splitTargets } : {}),
    });
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">{isEdit ? 'Edit transaction' : 'New transaction'} · {account.name}</h2>

        <label className="field"><span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </label>
        <label className="field"><span>Description</span>
          <input type="text" aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="input" />
        </label>

        {isBank && (
          <>
            <label className="field"><span>Payee</span>
              <input type="text" aria-label="Payee" value={payee} onChange={(e) => setPayee(e.target.value)} className="input" />
            </label>
            <label className="field"><span>Check #</span>
              <input type="text" aria-label="Check number" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} className="input" />
            </label>
          </>
        )}

        {hasSplits ? (
          <div className="field">
            <span>Category</span>
            <span className="split-summary">▼ {splits.length} split lines</span>
            <button type="button" className="btn" onClick={openSplits}>Edit splits…</button>
          </div>
        ) : (
          <label className="field"><span>Category</span>
            <select aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="select">
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
            <button type="button" className="btn" onClick={openSplits}>Split…</button>
          </label>
        )}

        <div className="field">
          <span>Amount</span>
          <div className="amount-row">
            <div className="dir-toggle" role="group" aria-label="Direction">
              <button type="button" className={`dir-btn${direction === 'out' ? ' active' : ''}`} aria-label="Money out" disabled={hasSplits} onClick={() => setDirection('out')}>− Out</button>
              <button type="button" className={`dir-btn${direction === 'in' ? ' active' : ''}`} aria-label="Money in" disabled={hasSplits} onClick={() => setDirection('in')}>+ In</button>
            </div>
            <input type="number" step="0.01" aria-label="Amount" value={hasSplits ? Math.abs(splits.reduce((s, l) => s + l.amount, 0)) : magnitude} onChange={(e) => setMagnitude(e.target.value)} disabled={hasSplits} className="input" />
          </div>
        </div>

        <div className="dialog-actions">
          {isEdit && <button type="button" className="btn btn-danger" onClick={() => onDelete(transaction.id)}>Delete</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save</button>
        </div>

        {splitsOpen && (
          <SplitsEditor
            parentAccountId={account.id}
            parentAmount={hasSplits ? splits.reduce((s, l) => s + l.amount, 0) : parentAmount}
            parentPayee={payee}
            parentDate={date}
            categories={categories}
            accounts={accounts}
            initialSplits={splits || []}
            initialSplitTargets={splitTargets}
            onDone={onSplitsDone}
            onCancel={() => setSplitsOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run src/TransactionEditor.test.jsx`
Expected: PASS, all tests including the new split wire-up suite.

- [ ] **Step 5: Commit**

```bash
git add src/TransactionEditor.jsx src/TransactionEditor.test.jsx
git commit -m "feat(splits): TransactionEditor Split… button, summary chip, locked amount"
```

---

## Task 19: `TransferEditor` — Split source leg… button + summary chip

**Files:**
- Modify: `src/TransferEditor.jsx`
- Modify: `src/TransferEditor.test.jsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/TransferEditor.test.jsx` (mirror the existing setup pattern from the file):

```jsx
import SplitsEditor from './SplitsEditor.jsx';

describe('TransferEditor split source-leg wire-up', () => {
  afterEach(() => cleanup());

  function setupTransfer(transfer = null) {
    const onSave = vi.fn();
    render(
      <TransferEditor
        accounts={[
          { id: 'a_chase', name: 'Chase', type: 'bank' },
          { id: 'a_loan',  name: 'Camry Loan', type: 'loan' },
        ]}
        categories={[
          { id: 'c_pay',       name: 'Loan Payment', icon: '🏷️', flow: 'transfer' },
          { id: 'c_principal', name: 'Principal',    icon: '💵', flow: 'expense'  },
        ]}
        fromAccountId="a_chase"
        toAccountId="a_loan"
        transfer={transfer}
        onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()}
      />
    );
    return { onSave };
  }

  it('shows "Split source leg…" button when there are no splits', () => {
    setupTransfer();
    expect(screen.getByRole('button', { name: /split source leg…?/i })).toBeInTheDocument();
  });

  it('opening it mounts SplitsEditor balanced against the source leg amount', async () => {
    setupTransfer();
    await userEvent.type(screen.getByLabelText(/amount/i), '325.40');
    await userEvent.click(screen.getByRole('button', { name: /split source leg…?/i }));
    expect(screen.getByText(/bank impact: -325.40/i)).toBeInTheDocument();
  });

  it('saving with splits returns a payload with the splits array', async () => {
    const { onSave } = setupTransfer();
    await userEvent.type(screen.getByLabelText(/amount/i), '325.40');
    await userEvent.click(screen.getByRole('button', { name: /split source leg…?/i }));
    // Seed: line 1 -325.40, line 2 0 → sum -325.40 ✓
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    await userEvent.click(screen.getByRole('button', { name: /save transfer/i }));
    expect(onSave.mock.calls[0][0].splits).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/TransferEditor.test.jsx -t "split source-leg"`
Expected: FAIL — no split button on TransferEditor today.

- [ ] **Step 3: Wire SplitsEditor into TransferEditor**

In `src/TransferEditor.jsx`, add state for splits and a button. Insert near the top of the component body:

```jsx
import SplitsEditor from './SplitsEditor.jsx';

// ... existing useState block, add:
const [splits, setSplits] = useState(transfer?.fromLeg?.splits ?? null);
const [splitTargets, setSplitTargets] = useState(new Map());
const [splitsOpen, setSplitsOpen] = useState(false);

const hasSplits = Array.isArray(splits) && splits.length > 0;
const sourceAmount = -1 * (Math.abs(parseFloat(magnitude) || 0));

const openSplits = () => {
  if (!hasSplits) {
    const id1 = 's_' + Date.now().toString(36);
    const id2 = id1 + '_2';
    setSplits([
      { id: id1, amount: sourceAmount, categoryId: categoryId || '', description: '' },
      { id: id2, amount: 0,            categoryId: categoryId || '', description: '' },
    ]);
  }
  setSplitsOpen(true);
};

// Update save() to include splits:
const save = () => {
  if (!valid) return;
  onSave({
    ...(transfer ? { transferId: transfer.transferId } : {}),
    fromId, toId, amount: mag, date, description: description.trim(),
    categoryId: categoryId || null,
    ...(hasSplits ? { splits, splitTargets } : {}),
  });
};
```

Place the Split button below the Type field, before `{sameAccount && ...}`:

```jsx
{hasSplits ? (
  <div className="field">
    <span>Source leg</span>
    <span className="split-summary">▼ {splits.length} split lines</span>
    <button type="button" className="btn" onClick={openSplits}>Edit splits…</button>
  </div>
) : (
  <div className="field">
    <button type="button" className="btn" onClick={openSplits}>Split source leg…</button>
  </div>
)}

{splitsOpen && (
  <SplitsEditor
    parentAccountId={fromId}
    parentAmount={hasSplits ? splits.reduce((s, l) => s + l.amount, 0) : sourceAmount}
    parentPayee=""
    parentDate={date}
    categories={categories}
    accounts={accounts}
    initialSplits={splits || []}
    initialSplitTargets={splitTargets}
    onDone={({ splits: ns, splitTargets: nt }) => { setSplits(ns); if (nt) setSplitTargets(nt); setSplitsOpen(false); }}
    onCancel={() => setSplitsOpen(false)}
  />
)}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run src/TransferEditor.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/TransferEditor.jsx src/TransferEditor.test.jsx
git commit -m "feat(splits): TransferEditor Split source leg… button + SplitsEditor wire-up"
```

---

## Task 20: `TransactionRow` — chevron + line count for split parents

**Files:**
- Modify: `src/TransactionRow.jsx`
- Modify: `src/TransactionRow.test.jsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/TransactionRow.test.jsx`:

```jsx
describe('TransactionRow split parent', () => {
  afterEach(() => cleanup());
  const categoriesById = new Map([
    ['c_grocery',   { id: 'c_grocery',   name: 'Groceries', icon: '🛒' }],
    ['c_household', { id: 'c_household', name: 'Household', icon: '🧴' }],
  ]);
  const splitRow = {
    id: 't1', accountId: 'a1', date: '2026-05-20', amount: -180, balance: 820,
    payee: 'Costco', description: 'Costco big shop', categoryId: null,
    splits: [
      { id: 's1', amount: -100, categoryId: 'c_grocery',   description: 'Groceries' },
      { id: 's2', amount:  -80, categoryId: 'c_household', description: 'Soap' },
    ],
  };

  it('renders "▶ N split lines" in the category cell (collapsed)', () => {
    render(<table><tbody><TransactionRow layout="bank" row={splitRow} categoriesById={categoriesById} onEdit={vi.fn()} /></tbody></table>);
    expect(screen.getByText(/2 split lines/)).toBeInTheDocument();
  });

  it('clicking the chevron expands and shows per-line sub-rows', async () => {
    render(<table><tbody><TransactionRow layout="bank" row={splitRow} categoriesById={categoriesById} onEdit={vi.fn()} /></tbody></table>);
    await userEvent.click(screen.getByRole('button', { name: /expand splits/i }));
    expect(screen.getByText(/Groceries/)).toBeInTheDocument();
    expect(screen.getByText(/Soap/)).toBeInTheDocument();
  });

  it('clicking elsewhere on the row still opens the editor', async () => {
    const onEdit = vi.fn();
    render(<table><tbody><TransactionRow layout="bank" row={splitRow} categoriesById={categoriesById} onEdit={onEdit} /></tbody></table>);
    await userEvent.click(screen.getByText('Costco big shop'));
    expect(onEdit).toHaveBeenCalledWith(splitRow);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/TransactionRow.test.jsx -t "split parent"`
Expected: FAIL.

- [ ] **Step 3: Render the split-aware parent row**

In `src/TransactionRow.jsx`, add a `useState` import and the split rendering:

```jsx
import React, { useState } from 'react';

// existing helpers stay …

function SplitChevron({ expanded, onClick, count }) {
  return (
    <button type="button" aria-label={expanded ? 'Collapse splits' : 'Expand splits'} className="split-chevron" onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {expanded ? '▼' : '▶'} {count} split lines
    </button>
  );
}

export default function TransactionRow({ layout, row, categoriesById, transfer = null, onNavigate, onEdit, expandSplitHint = null }) {
  const isSplit = Array.isArray(row.splits) && row.splits.length > 0;
  // null = follow the hint; true/false = user override. Updates to expandSplitHint
  // (e.g. a fresh search match) re-show the hint state when the user hasn't toggled.
  const [userExpanded, setUserExpanded] = useState(null);
  const expanded = userExpanded ?? !!expandSplitHint;
  const setExpanded = (next) => setUserExpanded(next);

  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—');

  const categoryCell = isSplit
    ? <SplitChevron expanded={expanded} onClick={() => setExpanded(!expanded)} count={row.splits.length} />
    : (transfer ? <TransferChip info={transfer} category={null} onNavigate={onNavigate} /> : <CategoryCell categoriesById={categoriesById} categoryId={row.categoryId} />);

  if (layout === 'bank') {
    const isPayment = row.amount < 0;
    return (
      <>
        <tr className={`txn-row${isSplit ? ' txn-row-split' : ''}`} onClick={() => onEdit(row)}>
          <td className="txn-date">{fmtDate(row.date)}</td>
          <td className="txn-check">{row.checkNumber || '—'}</td>
          <td className="txn-payee">{row.payee || '—'}</td>
          <td>{categoryCell}</td>
          <td className="txn-notes">{row.description}</td>
          <td className="txn-amt neg">{isPayment ? plain(row.amount) : ''}</td>
          <td className="txn-amt pos">{!isPayment ? plain(row.amount) : ''}</td>
          <td className={`txn-bal${row.balance < 0 ? ' neg' : ''}`}>{money(row.balance)}</td>
        </tr>
        {isSplit && expanded && row.splits.map(s => (
          <tr key={s.id} className="txn-split-line">
            <td></td>
            <td></td>
            <td></td>
            <td>{s.categoryId ? (categoriesById?.get(s.categoryId)?.name || '—') : '⇄ Transfer'}</td>
            <td className="txn-notes">{s.description}</td>
            <td className="txn-amt neg">{s.amount < 0 ? plain(s.amount) : ''}</td>
            <td className="txn-amt pos">{s.amount >= 0 ? plain(s.amount) : ''}</td>
            <td></td>
          </tr>
        ))}
      </>
    );
  }
  // compact layout
  return (
    <>
      <tr className={`txn-row${isSplit ? ' txn-row-split' : ''}`} onClick={() => onEdit(row)}>
        <td className="txn-date">{fmtDate(row.date)}</td>
        <td className="txn-desc">{row.description}</td>
        <td>{categoryCell}</td>
        <td className={`txn-amt${row.amount < 0 ? ' neg' : ' pos'}`}>{row.amount < 0 ? '-' : '+'}{money(Math.abs(row.amount))}</td>
        <td className={`txn-bal${row.balance < 0 ? ' neg' : ''}`}>{money(row.balance)}</td>
      </tr>
      {isSplit && expanded && row.splits.map(s => (
        <tr key={s.id} className="txn-split-line">
          <td></td>
          <td className="txn-desc">{s.description}</td>
          <td>{s.categoryId ? (categoriesById?.get(s.categoryId)?.name || '—') : '⇄ Transfer'}</td>
          <td className={`txn-amt${s.amount < 0 ? ' neg' : ' pos'}`}>{s.amount < 0 ? '-' : '+'}{money(Math.abs(s.amount))}</td>
          <td></td>
        </tr>
      ))}
    </>
  );
}
```

The existing `CategoryCell` and `TransferChip` helpers stay defined above the component as in the current file.

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run src/TransactionRow.test.jsx`
Expected: PASS, all TransactionRow tests including the new split-parent suite.

- [ ] **Step 5: Commit**

```bash
git add src/TransactionRow.jsx src/TransactionRow.test.jsx
git commit -m "feat(splits): TransactionRow renders expandable parent + per-line sub-rows"
```

---

## Task 21: `Register` — pass `expandSplitHint` based on search match

**Files:**
- Modify: `src/accountsModel.js` — extend `filterTransactions` to return matching split line id
- Modify: `src/Register.jsx` — pass the hint to TransactionRow
- Modify: `src/Register.test.jsx` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/Register.test.jsx`:

```jsx
describe('Register with split transactions', () => {
  afterEach(() => cleanup());

  const splitAccount = { id: 'a_chase', name: 'Chase', type: 'bank', icon: '🏦', openingBalance: 1000 };
  const splitCats = [
    { id: 'c_grocery', name: 'Groceries',         icon: '🛒' },
    { id: 'c_solar',   name: 'Home Improvement',  icon: '🏠' },
  ];
  const splitCatsById = new Map(splitCats.map(c => [c.id, c]));
  const splitTxns = [{
    id: 't1', accountId: 'a_chase', date: '2026-05-20', amount: -4300,
    payee: 'Costco', checkNumber: null, transferId: null,
    description: 'Costco big shop', categoryId: null,
    splits: [
      { id: 's1', amount:  -180, categoryId: 'c_grocery', description: 'Weekly groceries' },
      { id: 's2', amount: -4120, categoryId: 'c_solar',   description: '5kW solar panel kit' },
    ],
  }];

  it('search matching a split line auto-expands the parent', async () => {
    render(
      <Register
        account={splitAccount}
        transactions={splitTxns}
        categories={splitCats}
        categoriesById={splitCatsById}
        onEditTransaction={() => {}}
        onAddTransaction={() => {}}
      />
    );
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'solar');
    // Without auto-expand, the split sub-rows aren't in the DOM.
    expect(screen.getByText('5kW solar panel kit')).toBeInTheDocument();
  });
});
```

(The fixture mirrors the existing `Register.test.jsx` pattern: same render-with-props shape, no helper function needed for one test.)

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx vitest run src/Register.test.jsx -t "auto-expand"`
Expected: FAIL — search doesn't propagate a hint yet.

- [ ] **Step 3: Pass the hint through**

In `src/accountsModel.js`, refine `filterTransactions` so each returned row carries `_matchedSplitId` when the match came from a split line. Replace the inner block from Task 6:

```js
if (Array.isArray(r.splits)) {
  for (const s of r.splits) {
    if ((s.description || '').toLowerCase().includes(term)) return Object.assign(r, { _matchedSplitId: s.id }), true;
    const sCat = categoriesById && s.categoryId && categoriesById.get(s.categoryId);
    if (sCat && (sCat.name || '').toLowerCase().includes(term)) return Object.assign(r, { _matchedSplitId: s.id }), true;
  }
}
```

(`Object.assign` mutates the row object in the filter — acceptable since `computeRegister` already returns a fresh array. Alternatively, build a new object with the field; either way works.)

In `src/Register.jsx`, pass it through:

```jsx
<TransactionRow
  key={r.id}
  layout={layout}
  row={r}
  categoriesById={categoriesById}
  transfer={transferInfo(r, transactions, accountsById, typesById)}
  onNavigate={onSelectAccount}
  onEdit={onEditTransaction}
  expandSplitHint={r._matchedSplitId || null}
/>
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx vitest run src/Register.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/accountsModel.js src/Register.jsx src/Register.test.jsx
git commit -m "feat(splits): Register auto-expands matching split lines on search"
```

---

## Task 22: `App.jsx` — thread `splitTargets` through save handlers

**Files:**
- Modify: `src/App.jsx` — pass `splitTargets` from the editor payload to `addTransaction`/`updateTransaction`/`addTransfer`/`updateTransfer`

- [ ] **Step 1: Update `saveTransaction` (line 203)**

Find `saveTransaction` at `src/App.jsx:203`. Today it reads:

```jsx
const saveTransaction = (data) => {
  pushHistory();
  if (data.id) ledger.updateTransaction(data.id, data);
  else ledger.addTransaction(data);
  setEditingTxn(null);
};
```

Replace with:

```jsx
const saveTransaction = (data) => {
  pushHistory();
  const { splitTargets, ...rest } = data;
  const opts = splitTargets ? { splitTargets } : {};
  if (rest.id) ledger.updateTransaction(rest.id, rest, opts);
  else ledger.addTransaction(rest, opts);
  setEditingTxn(null);
};
```

- [ ] **Step 2: `saveTransfer` already forwards the whole payload**

Find `saveTransfer` at `src/App.jsx:212`. It currently spreads `data` into `addTransfer` / `updateTransfer`. Since Task 12 made those methods accept `splits` as a destructured field, no change is needed — confirm by inspection that `data` flows through unchanged.

- [ ] **Step 3: Run the full suite**

Run: `npm test -- run`
Expected: PASS — all tests including useLedger and editor tests.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(splits): App.jsx threads splitTargets to useLedger via saveTransaction"
```

---

## Task 23: `exportArchive.js` — pass `splits` through verbatim

**Files:**
- Modify: `src/exportArchive.js`
- Modify: `src/exportArchive.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/exportArchive.test.js`:

```js
it('preserves splits[] verbatim in the data.json payload', () => {
  const accounts = [{ id: 'a1', name: 'Chase', type: 'bank', icon: '🏦', openingBalance: 0 }];
  const transactions = [{
    id: 't1', accountId: 'a1', date: '2026-05-20', amount: -180,
    categoryId: null, description: 'Costco', payee: 'Costco', checkNumber: null, transferId: null,
    splits: [
      { id: 's1', amount: -100, categoryId: 'c_grocery', description: 'Groceries' },
      { id: 's2', amount:  -80, categoryId: 'c_household', description: 'Soap' },
    ],
  }];
  const bytes = buildArchive({ accounts, transactions, categories: [], schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-21') });
  const files = unzipSync(bytes);
  const data = JSON.parse(strFromU8(files['data.json']));
  expect(data.transactions[0].splits).toEqual(transactions[0].splits);
});
```

(Reuse this file's existing `unzipSync` / `strFromU8` imports.)

- [ ] **Step 2: Run test, confirm it passes (or fails)**

Run: `npx vitest run src/exportArchive.test.js`
Expected: PASS if `buildArchive` already does a structural clone via `JSON.stringify`; FAIL if it explicitly whitelists fields.

- [ ] **Step 3: If failing, update `buildArchive`**

Inspect `src/exportArchive.js`. If transactions are mapped via field whitelist, add `splits: t.splits || undefined` to the projection. Otherwise this task is a no-op.

- [ ] **Step 4: Commit**

```bash
git add src/exportArchive.js src/exportArchive.test.js
git commit -m "test(splits): pin export-archive passthrough for splits field"
```

---

## Task 24: CSS — `.txn-row-split`, `.txn-split-line`, `.split-editor`

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Add the rules near the existing `.txn-row` block**

Search `src/App.css` for `.txn-row` to find the right neighborhood. Add:

```css
.txn-row-split {
  box-shadow: inset 4px 0 0 0 var(--accent-purple, #a47dea);
}
.split-chevron {
  background: transparent;
  border: none;
  color: var(--text-dim, #94a3b8);
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
  padding: 2px 6px;
}
.txn-split-line {
  background: rgba(148, 163, 184, 0.05);
  font-size: 0.92em;
}
.txn-split-line td:first-child {
  padding-left: 28px;
}
.split-editor .dialog-card {
  max-width: 720px;
  z-index: 50;
}
.split-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95em;
}
.split-table th,
.split-table td {
  padding: 4px 6px;
}
.split-table th.right,
.split-table td.right {
  text-align: right;
}
.split-sum.ok { color: var(--good, #10b981); }
.split-sum.mismatch { color: var(--bad, #f87171); }
.split-summary {
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--accent-warning, #fbbf24);
}
```

(If your theme uses different CSS variables, look at sibling rules nearby and reuse them — match the existing palette.)

- [ ] **Step 2: Run the suite to make sure nothing broke**

Run: `npm test -- run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/App.css
git commit -m "style(splits): CSS for split parents, line sub-rows, and SplitsEditor"
```

---

## Task 25: End-to-end smoke test

**Files:**
- Create: `src/__smoke__/splits.test.jsx`

- [ ] **Step 1: Write the smoke test**

Create `src/__smoke__/splits.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLedger from '../useLedger.js';
import { spendingByCategory, incomeExpenseSummary, findDuplicates, recurringCharges } from '../reportsModel.js';

describe('splits end-to-end: Costco with cash back', () => {
  const seed = {
    accounts: [
      { id: 'a_chase', name: 'Chase', type: 'bank', icon: '🏦', openingBalance: 1000 },
      { id: 'a_cash',  name: 'Cash',  type: 'bank', icon: '💵', openingBalance: 0 },
    ],
    transactions: [],
  };
  const categoriesById = new Map([
    ['c_grocery',   { id: 'c_grocery',   name: 'Groceries', flow: 'expense', icon: '🛒', color: '#000' }],
    ['c_household', { id: 'c_household', name: 'Household', flow: 'expense', icon: '🧴', color: '#111' }],
  ]);

  it('records, reports, and reconciles', () => {
    const { result } = renderHook(() => useLedger(seed));
    let id;
    act(() => {
      id = result.current.addTransaction({
        accountId: 'a_chase', date: '2026-05-20', amount: -180, payee: 'Costco', description: 'Weekly Costco',
        splits: [
          { id: 's1', amount: -100, categoryId: 'c_grocery',   description: 'Weekly groceries' },
          { id: 's2', amount:  -30, categoryId: 'c_household', description: 'Soap' },
          { id: 's3', amount:  -50, transferId: 'tr_cash',     description: 'ATM cash back' },
        ],
      }, { splitTargets: new Map([['s3', 'a_cash']]) });
    });

    // Counterpart was created on Cash.
    const cp = result.current.transactions.find(t => t.transferId === 'tr_cash');
    expect(cp.accountId).toBe('a_cash');
    expect(cp.amount).toBe(50);
    expect(cp.description).toBe('ATM cash back');

    // Reports: groceries $100, household $30, total spending $130, transfer line excluded.
    const byCat = Object.fromEntries(spendingByCategory(result.current.transactions, categoriesById).map(e => [e.name, e.total]));
    expect(byCat.Groceries).toBe(100);
    expect(byCat.Household).toBe(30);
    expect(incomeExpenseSummary(result.current.transactions, categoriesById).spending).toBe(130);

    // Recurring/duplicate detection sees the parent, not three rows.
    expect(findDuplicates(result.current.transactions)).toHaveLength(0); // no dupes
    expect(recurringCharges(result.current.transactions, categoriesById, { now: new Date(2026, 4, 25) })).toEqual([]);

    // Deleting the parent cascades the counterpart.
    act(() => { result.current.deleteTransaction(id); });
    expect(result.current.transactions).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the smoke test**

Run: `npx vitest run src/__smoke__/splits.test.jsx`
Expected: PASS.

- [ ] **Step 3: Run the full suite**

Run: `npm test -- run`
Expected: PASS — every existing test plus all the new ones.

- [ ] **Step 4: Commit**

```bash
git add src/__smoke__/splits.test.jsx
git commit -m "test(splits): end-to-end smoke test for Costco-with-cash-back"
```

---

## Self-review checklist (after all tasks complete)

Run these before declaring the feature done:

- [ ] `npm test -- run` — full suite passes.
- [ ] `npm run lint` — clean.
- [ ] `npm run build` — production build succeeds.
- [ ] Manual smoke in the dev server (`npm run dev`):
  - Create a transaction, click Split…, add 3 lines (2 category + 1 transfer to another account), save. Verify Chase register shows the expandable parent and the other account shows the counterpart.
  - Edit the same transaction, change the transfer target account, save. Verify the counterpart moved.
  - Delete the parent. Verify the counterpart was removed.
  - Click Unsplit on a 3-line split; confirm the parent reverts to single-category and any transfer counterpart was removed.
  - Open an existing transfer (e.g., a loan payment); click Split source leg…; add principal/interest lines; save. Verify the source leg has splits and the destination leg stays single.
  - Search for a word that only appears in a split line description; verify the parent shows with that line auto-expanded.
  - Delete an account that has a transfer-split counterpart on another account; verify the source-side line keeps its description and gracefully renders without the transfer chip.
