# Sub-project B — Income & Transaction Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add support for income (paychecks, Zelle, dividends, etc.), savings/investment outflows (401k, Roth, etc.), and refunds (negative-amount lines) to BillTracker. Every category gains a `flow` property (income | expense | savings). The monthly summary becomes a 4-card strip: Income / Spent / Saved / Net. Refunds appear inline on credit card statements as negative-amount lines.

**Architecture:** Schema change is minimal — items keep their existing shape (the relaxation is just allowing negative amounts in expense-flow categories). Categories grow one `flow` field. Aggregators look up `cat.flow` via a `Map<id, category>` to bucket items. LLM extractor's prompt changes to capture refunds + paystubs + dividends; `validateResponse` relaxes its positivity filter. UI updates four surfaces: stat strip, bill card total, item refund toggle, recurring sidebar split.

**Tech Stack:** React 19, Vite, Vitest + React Testing Library, `nanoid` for ids. LocalStorage for persistence. Anthropic SDK for OCR. No new runtime dependencies.

**Branch:** `feat/income-transaction-types` (already created off `feat/categories-as-data`).

**Spec:** See `docs/superpowers/specs/2026-05-11-income-transaction-types-design.md` for the design intent.

---

## File Structure

### Files modified

| File | Purpose | Touched by tasks |
|---|---|---|
| `src/categoriesDefaults.js` | Add `flow` to all built-ins; export new income/savings seed list | T1 |
| `src/spendingMath.js` | Add `migrateToV3`, `getBillNet`; update aggregators for flow + sign awareness | T2, T5–T10 |
| `src/initializeFromStorage.js` | Chain v2→v3 migration; write categories-v2-backup; surface error | T3 |
| `src/useCategories.js` | Accept `flow` in `addCategory`; default new categories to `expense` if missing | T4 |
| `src/billExtractor.js` | Update prompt for refunds/paystubs/brokerage; relax `validateResponse` to accept negatives | T11, T12 |
| `src/App.jsx` | New stat strip (4 cards); pass `categoriesById` into aggregators; bill card uses `getBillNet`; subscriptions sidebar split into 3 sections | T13, T14, T17 |
| `src/BillItem.jsx` | Remove `min="0"`; add Credit toggle; grouped category dropdown | T15, T16 |
| `src/CategoryEditor.jsx` | Add flow segmented control + warning dialog on flow change | T18 |
| `src/ManageCategoriesScreen.jsx` | Group category list by flow; flow badge per row | T19 |
| `src/SpendingChart.jsx` | Add collapse/expand button; read/write `billtracker-chart-collapsed`; update `aggregateByMonth` callsite | T7, T20 |
| `src/App.css` | New styles for stat strip, credit toggle, flow control, collapse button | T13–T20 (inline as needed) |

### Test files

| File | Purpose |
|---|---|
| `src/spendingMath.test.js` | Add `migrateToV3`, `getBillNet`, updated aggregator tests |
| `src/initializeFromStorage.test.js` | Add v3 migration test cases |
| `src/billExtractor.test.js` | Add tests for negative amount validation + refund extraction contract |
| `src/BillItem.test.jsx` | Add tests for Credit toggle + grouped dropdown |
| `src/CategoryEditor.test.jsx` | Add tests for flow control + warning dialog |
| `src/SpendingChart.test.jsx` | New file; collapse/expand persistence test |
| `src/useCategories.test.jsx` | Add `addCategory({ flow })` round-trip test |
| `src/__smoke__/setup.test.jsx` | Add end-to-end scenario: paycheck + CC w/ refund |

### LocalStorage keys

| Key | New? |
|---|---|
| `billtracker-categories-v2-backup` | new |
| `billtracker-chart-collapsed` | new |
| `billtracker-schema-version` | exists; bumps `2 → 3` |

---

## Pre-flight

- [ ] **Verify branch and clean tree**

```bash
git branch --show-current
# Expected: feat/income-transaction-types

git status --short
# Expected: empty (clean tree)
```

If on the wrong branch: `git checkout feat/income-transaction-types`. If dirty: stash or commit before proceeding.

- [ ] **Run baseline test suite once to confirm it's green before changes**

```bash
cd bill-tracker
npm test -- --run
# Expected: all tests pass
```

If anything fails before we start, halt and investigate — don't begin layering changes on top of a broken baseline.

---

## Phase 1 — Schema + Migration (no UI changes; foundation only)

### Task 1: Add `flow` to built-in categories and export V3 seed list

**Files:**
- Modify: `src/categoriesDefaults.js` (full rewrite — small file)

- [ ] **Step 1: Replace the full contents of `src/categoriesDefaults.js`**

```js
export const OTHER_CATEGORY_NAME = 'Other';
export const OTHER_INCOME_CATEGORY_NAME = 'Other Income';

// Seed expense-flow categories. Inverts the per-category keyword mapping from
// the original autoCategorizeTx in App.jsx so that the longest-match
// auto-categorizer behaves identically to today on first load.
export const DEFAULT_CATEGORIES = [
  { name: 'Utilities',      icon: '⚡',  color: '#F59E0B', flow: 'expense', keywords: [], templates: [], builtin: true },
  { name: 'Groceries',      icon: '🛒', color: '#10B981', flow: 'expense', keywords: [], templates: [], builtin: true },
  { name: 'Healthcare',     icon: '💊', color: '#EF4444', flow: 'expense', keywords: [], templates: [], builtin: true },
  { name: 'Fitness',        icon: '🧗', color: '#84CC16', flow: 'expense', keywords: [
    'FIRST ASCENT', 'GYM', 'FITNESS', 'CLIMBING', 'CROSSFIT', 'YOGA', 'PILATES',
  ], templates: [], builtin: true },
  { name: 'Insurance',      icon: '🛡️', color: '#6366F1', flow: 'expense', keywords: [], templates: [], builtin: true },
  { name: 'Entertainment',  icon: '🎬', color: '#EC4899', flow: 'expense', keywords: [
    'BOWLERO', 'WHITE CASTLE', 'ENTERTAINMENT',
  ], templates: [], builtin: true },
  { name: 'Transportation', icon: '🚗', color: '#8B5CF6', flow: 'expense', keywords: [
    'GAS', 'SHELL', 'BP', 'EXXON',
  ], templates: [], builtin: true },
  { name: 'Dining',         icon: '🍽️', color: '#F97316', flow: 'expense', keywords: [
    'MCDONALD', 'KFC', 'POPEYES', 'KRISPY', 'RESTAURANT', 'CHINESE',
    "SHARK'S FISH", "HOY'S",
  ], templates: [], builtin: true },
  { name: 'Shopping',       icon: '🛍️', color: '#14B8A6', flow: 'expense', keywords: [
    'WAL-MART', 'WALMART', 'TARGET', 'EBAY', 'TEMU', 'AMAZON',
    'HOME DEPOT', 'LOWES',
  ], templates: [], builtin: true },
  { name: 'Subscriptions',  icon: '📱', color: '#3B82F6', flow: 'expense', keywords: [
    'CLAUDE.AI', 'SUBSCRIPTION', 'NETFLIX',
  ], templates: [], builtin: true },
  { name: 'Parking',        icon: '🅿️', color: '#64748B', flow: 'expense', keywords: [
    'LOT A', 'PARKING', 'PAY ON FOOT',
  ], templates: [], builtin: true },
  { name: 'Donations',      icon: '🙏', color: '#e879a0', flow: 'expense', keywords: [
    'CHURCH', 'CHRISTIAN', 'CHAPEL', 'MINISTRY', 'MINISTRIES', 'MISSION',
    'SALVATION ARMY', 'GOODWILL', 'HABITAT', 'RED CROSS', 'DONATION',
    'TITHE', 'PARISH', 'DIOCESE', 'SYNAGOGUE', 'MOSQUE', 'TEMPLE',
    'CHARITY', 'FOUNDATION', 'NONPROFIT', 'NON-PROFIT',
  ], templates: [], builtin: true },
  { name: 'Taxes',          icon: '🏛', color: '#EAB308', flow: 'expense', keywords: [
    'FEDERAL TAX', 'STATE TAX', 'FICA', 'SOCIAL SECURITY', 'MEDICARE',
    'TAX WITHHOLDING', 'WITHHOLDING',
  ], templates: [], builtin: true },
  { name: OTHER_CATEGORY_NAME, icon: '📋', color: '#6B7280', flow: 'expense', keywords: [], templates: [], builtin: true },
];

// Seed categories added during v2 → v3 migration. Income flow + Savings flow.
// Appended to the existing category list; skipped if a category with the same
// name already exists (so users who pre-created "Paycheck" aren't duplicated).
export const V3_SEED_CATEGORIES = [
  { name: 'Paycheck',           icon: '💼', color: '#6BD49A', flow: 'income',  keywords: [
    'PAYCHECK', 'SALARY', 'PAYROLL', 'DIRECT DEPOSIT', 'GROSS PAY',
  ], templates: [], builtin: true },
  { name: 'Zelle In',           icon: '💸', color: '#34D399', flow: 'income',  keywords: ['ZELLE FROM'], templates: [], builtin: true },
  { name: 'Dividends',          icon: '📈', color: '#22D3EE', flow: 'income',  keywords: ['DIVIDEND', 'DIV'], templates: [], builtin: true },
  { name: 'Bank Interest',      icon: '🏦', color: '#0EA5E9', flow: 'income',  keywords: ['INTEREST EARNED', 'INTEREST CREDIT'], templates: [], builtin: true },
  { name: 'Cashback',           icon: '🎁', color: '#A3E635', flow: 'income',  keywords: ['CASHBACK', 'CASH BACK', 'REWARDS', 'REWARD REDEMPTION'], templates: [], builtin: true },
  { name: 'Tax Refund',         icon: '💰', color: '#FBBF24', flow: 'income',  keywords: ['TAX REFUND', 'IRS REFUND', 'STATE REFUND'], templates: [], builtin: true },
  { name: 'Reimbursement',      icon: '🔁', color: '#67E8F9', flow: 'income',  keywords: ['REIMBURSEMENT', 'EXPENSE REIMB'], templates: [], builtin: true },
  { name: OTHER_INCOME_CATEGORY_NAME, icon: '📥', color: '#94A3B8', flow: 'income',  keywords: [], templates: [], builtin: true },
  { name: '401(k)',             icon: '📊', color: '#5B8DFF', flow: 'savings', keywords: ['401K', '401(K)'], templates: [], builtin: true },
  { name: 'Roth IRA',           icon: '🌱', color: '#7C3AED', flow: 'savings', keywords: ['ROTH', 'ROTH IRA'], templates: [], builtin: true },
  { name: 'Brokerage Transfer', icon: '📈', color: '#4F46E5', flow: 'savings', keywords: ['BROKERAGE', 'INVESTMENT TRANSFER'], templates: [], builtin: true },
  { name: 'Cash Savings',       icon: '🪙', color: '#06B6D4', flow: 'savings', keywords: ['SAVINGS DEPOSIT', 'TRANSFER TO SAVINGS'], templates: [], builtin: true },
  { name: 'Loans Lent',         icon: '🤝', color: '#9333EA', flow: 'savings', keywords: ['LOAN OUT', 'LENT TO'], templates: [], builtin: true },
];
```

- [ ] **Step 2: Run existing tests — they should still pass (this is additive)**

```bash
npm test -- --run
# Expected: all green (no behavior changed; categories array is just longer)
```

- [ ] **Step 3: Commit**

```bash
git add src/categoriesDefaults.js
git commit -m "feat(itypes): add flow to built-in categories + V3 seed list"
```

---

### Task 2: Write `migrateToV3` pure function (TDD)

**Files:**
- Test: `src/spendingMath.test.js` (add new `describe('migrateToV3')` block)
- Modify: `src/spendingMath.js` (add function + export)

- [ ] **Step 1: Add the test block at the end of `src/spendingMath.test.js`**

Add this to the bottom of the file (after the last existing `describe`):

```js
import { migrateToV3 } from './spendingMath.js';

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
    // User's existing version was preserved with its custom keyword + id.
    expect(paychecks[0].id).toBe('c_pay_user');
    expect(paychecks[0].keywords).toEqual(['CUSTOM']);
    // It still got flow backfilled — to 'expense' because that's the v2 default.
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
```

- [ ] **Step 2: Run the tests to verify they all fail**

```bash
npm test -- --run spendingMath
# Expected: all 6 new tests FAIL with "migrateToV3 is not a function" or similar
```

- [ ] **Step 3: Add `migrateToV3` to the bottom of `src/spendingMath.js`**

Add this just after the existing `migrateToV2` function (around line 310):

```js
// v2 → v3 migration: every category gets a `flow` field. Existing categories
// backfill to 'expense' (the implicit v2 behavior). Seed income + savings
// categories are appended; skipped if a category with the same name already
// exists in the user's list.
//
// Bills are unchanged — item amount-sign relaxation is additive.
//
// Idempotent: if every category already has a `flow` field of a known kind,
// inputs are returned untouched (no duplicate seed append).
export function migrateToV3(bills, categories, seedCategoriesV3) {
  const cats = Array.isArray(categories) ? categories : [];
  const allHaveFlow = cats.length > 0 && cats.every(c =>
    c && (c.flow === 'income' || c.flow === 'expense' || c.flow === 'savings')
  );
  if (allHaveFlow) {
    // Even when flows are present, we still ensure idempotency by not
    // re-appending seeds. Caller is responsible for not re-running needlessly.
    return { bills: bills || [], categories: cats };
  }

  // 1. Backfill flow on existing categories.
  const backfilled = cats.map(c => ({ ...c, flow: c.flow || 'expense' }));

  // 2. Append seeds by name (skip duplicates).
  const existingNames = new Set(backfilled.map(c => c.name));
  const newSeeds = (seedCategoriesV3 || [])
    .filter(s => !existingNames.has(s.name))
    .map(s => ({ ...s, id: nanoid(8) }));

  return {
    bills: bills || [],
    categories: [...backfilled, ...newSeeds],
  };
}
```

- [ ] **Step 4: Run tests again to verify they pass**

```bash
npm test -- --run spendingMath
# Expected: all migrateToV3 tests PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "feat(itypes): add migrateToV3 (v2 categories → v3 with flow)"
```

---

### Task 3: Chain `migrateToV3` in `initializeFromStorage` with v2 categories backup

**Files:**
- Test: `src/initializeFromStorage.test.js` (add new cases)
- Modify: `src/initializeFromStorage.js`

- [ ] **Step 1: Add test cases to `src/initializeFromStorage.test.js`**

Add these `it(...)` blocks inside the existing `describe('initializeFromStorage')` block:

```js
it('v2 → v3 migration: backfills flow on existing categories', () => {
  // Pre-populate storage with v2-shape data: bills + categories without flow + schema version 2.
  const v2Cats = [
    { id: 'c_util',  name: 'Utilities', icon: '⚡',  color: '#F59E0B', keywords: [], templates: [], builtin: true },
    { id: 'c_other', name: 'Other',     icon: '📋', color: '#6B7280', keywords: [], templates: [], builtin: true },
  ];
  const storage = makeFakeStorage({
    'billtracker-bills':           JSON.stringify([]),
    'billtracker-categories':      JSON.stringify(v2Cats),
    'billtracker-schema-version':  '2',
  });
  const result = initializeFromStorage(storage);
  expect(result.migrationError).toBeNull();
  const cats = JSON.parse(storage.getItem('billtracker-categories'));
  for (const c of cats) expect(c.flow).toBeTruthy();
  // Schema bumped to 3.
  expect(storage.getItem('billtracker-schema-version')).toBe('3');
});

it('v2 → v3 migration: writes categories-v2-backup before transforming', () => {
  const v2Cats = [
    { id: 'c_util', name: 'Utilities', icon: '⚡', color: '#F59E0B', keywords: ['COMED'], templates: [], builtin: true },
  ];
  const storage = makeFakeStorage({
    'billtracker-bills':           JSON.stringify([]),
    'billtracker-categories':      JSON.stringify(v2Cats),
    'billtracker-schema-version':  '2',
  });
  initializeFromStorage(storage);
  const backup = JSON.parse(storage.getItem('billtracker-categories-v2-backup'));
  expect(backup.categories).toEqual(v2Cats);
  expect(backup.ts).toBeTruthy();
});

it('v2 → v3 migration: appends income + savings seeds', () => {
  const v2Cats = [
    { id: 'c_other', name: 'Other', icon: '📋', color: '#6B7280', keywords: [], templates: [], builtin: true },
  ];
  const storage = makeFakeStorage({
    'billtracker-bills':           JSON.stringify([]),
    'billtracker-categories':      JSON.stringify(v2Cats),
    'billtracker-schema-version':  '2',
  });
  initializeFromStorage(storage);
  const cats = JSON.parse(storage.getItem('billtracker-categories'));
  expect(cats.some(c => c.name === 'Paycheck' && c.flow === 'income')).toBe(true);
  expect(cats.some(c => c.name === '401(k)' && c.flow === 'savings')).toBe(true);
  expect(cats.some(c => c.name === 'Other Income' && c.flow === 'income')).toBe(true);
});

it('v3 idempotency: running on already-v3 data does not re-write backup or re-migrate', () => {
  const storage = makeFakeStorage();
  // Fresh install → reaches v3 in one go.
  initializeFromStorage(storage);
  const firstCats   = storage.getItem('billtracker-categories');
  const firstBackup = storage.getItem('billtracker-categories-v2-backup');
  // Second run: nothing should change.
  initializeFromStorage(storage);
  expect(storage.getItem('billtracker-categories')).toBe(firstCats);
  expect(storage.getItem('billtracker-categories-v2-backup')).toBe(firstBackup);
  expect(storage.getItem('billtracker-schema-version')).toBe('3');
});

it('fresh install (no prior data): reaches v3 with seeds + version 3 + no backup written', () => {
  const storage = makeFakeStorage();
  const result = initializeFromStorage(storage);
  expect(result.migrationError).toBeNull();
  expect(storage.getItem('billtracker-schema-version')).toBe('3');
  const cats = JSON.parse(storage.getItem('billtracker-categories'));
  expect(cats.some(c => c.flow === 'income')).toBe(true);
  expect(cats.some(c => c.flow === 'savings')).toBe(true);
  // No pre-v3 data existed, so no backup is needed.
  expect(storage.getItem('billtracker-categories-v2-backup')).toBeNull();
});
```

- [ ] **Step 2: Existing v1→v2 test expectation update**

The existing test `"fresh install: returns empty bills, sets schema version, writes seed categories"` currently asserts `schema-version === '2'`. Update that line to `'3'`:

```diff
- expect(storage.getItem('billtracker-schema-version')).toBe('2');
+ expect(storage.getItem('billtracker-schema-version')).toBe('3');
```

Also update the `"v1 → v2 migration"` test (line ~53) where it asserts `'2'`:

```diff
- expect(storage.getItem('billtracker-schema-version')).toBe('2');
+ expect(storage.getItem('billtracker-schema-version')).toBe('3');
```

- [ ] **Step 3: Run tests — new tests should fail; the two updated ones should also fail until we wire v3 in**

```bash
npm test -- --run initializeFromStorage
# Expected: 5 new tests FAIL + 2 existing FAIL on the '3' assertion
```

- [ ] **Step 4: Update `src/initializeFromStorage.js`**

Replace the full contents of `src/initializeFromStorage.js`:

```js
import { migrateBills, migrateToV2, migrateToV3 } from './spendingMath.js';
import { DEFAULT_CATEGORIES, V3_SEED_CATEGORIES } from './categoriesDefaults.js';

const BILLS_KEY        = 'billtracker-bills';
const CATS_KEY         = 'billtracker-categories';
const VERSION_KEY      = 'billtracker-schema-version';
const V1_BACKUP_KEY    = 'billtracker-pre-categories-backup';
const V2_CATS_BACKUP_KEY = 'billtracker-categories-v2-backup';

// Returns:
//   { bills, migrationError: null }                  on success
//   { bills, migrationError: { message, recovered }} on failure
//   `recovered` is true when bills came from the backup; false when no backup existed.
export function initializeFromStorage(storage) {
  try {
    const rawBills = storage.getItem(BILLS_KEY);
    const rawCats  = storage.getItem(CATS_KEY);
    const ver      = parseInt(storage.getItem(VERSION_KEY) || '1', 10);

    const v1Bills = rawBills ? migrateBills(JSON.parse(rawBills)) : [];
    const existingCats = rawCats ? JSON.parse(rawCats) : null;

    // v1 → v2 one-time backup (existing logic).
    if (ver < 2 && rawBills && !storage.getItem(V1_BACKUP_KEY)) {
      storage.setItem(V1_BACKUP_KEY, JSON.stringify({
        ts: new Date().toISOString(),
        bills: v1Bills,
      }));
    }

    const { bills: v2Bills, categories: v2Cats } = migrateToV2(v1Bills, existingCats, DEFAULT_CATEGORIES);

    if (ver < 2) {
      storage.setItem(BILLS_KEY, JSON.stringify(v2Bills));
      storage.setItem(CATS_KEY,  JSON.stringify(v2Cats));
      storage.setItem(VERSION_KEY, '2');
    }

    // v2 → v3 one-time backup of the v2-shape categories (only when we
    // actually have v2 categories to back up — fresh installs skip this).
    if (ver < 3 && rawCats && !storage.getItem(V2_CATS_BACKUP_KEY)) {
      storage.setItem(V2_CATS_BACKUP_KEY, JSON.stringify({
        ts: new Date().toISOString(),
        categories: existingCats,
      }));
    }

    const { bills: v3Bills, categories: v3Cats } = migrateToV3(v2Bills, v2Cats, V3_SEED_CATEGORIES);

    if (ver < 3) {
      storage.setItem(BILLS_KEY, JSON.stringify(v3Bills));
      storage.setItem(CATS_KEY,  JSON.stringify(v3Cats));
      storage.setItem(VERSION_KEY, '3');
    }

    return { bills: v3Bills, migrationError: null };
  } catch (e) {
    console.error('Migration failed:', e);
    try {
      const rawBackup = storage.getItem(V1_BACKUP_KEY);
      if (rawBackup) {
        const { bills } = JSON.parse(rawBackup);
        return {
          bills: bills || [],
          migrationError: {
            message: 'Migration failed — your data was restored from backup. Please use Export to save a copy.',
            recovered: true,
          },
        };
      }
    } catch (recoveryErr) {
      console.error('Backup restore also failed:', recoveryErr);
    }
    return {
      bills: [],
      migrationError: {
        message: 'Migration failed and no backup was available. Please reload — if this persists, contact support.',
        recovered: false,
      },
    };
  }
}
```

- [ ] **Step 5: Run tests — all should pass**

```bash
npm test -- --run initializeFromStorage
# Expected: all tests in this file PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/initializeFromStorage.js src/initializeFromStorage.test.js
git commit -m "feat(itypes): chain migrateToV3 in initializeFromStorage with backup"
```

---

### Task 4: `useCategories.addCategory` accepts `flow`; round-trip test

**Files:**
- Test: `src/useCategories.test.jsx`
- Modify: `src/useCategories.js:57-69` (the `addCategory` function)

- [ ] **Step 1: Add a test to `src/useCategories.test.jsx`**

Add this `it(...)` block inside the file's existing `describe` block. (If the file doesn't have a `describe`, add a new `describe('addCategory flow', () => { ... })` at the bottom.)

```js
it('addCategory accepts flow and round-trips through localStorage', async () => {
  const { result } = renderHook(() => useCategories());

  let newId;
  await act(async () => {
    newId = result.current.addCategory({
      name: 'Side Hustle',
      icon: '💼',
      color: '#6BD49A',
      flow: 'income',
    });
  });

  const cat = result.current.getById(newId);
  expect(cat.flow).toBe('income');
  expect(cat.name).toBe('Side Hustle');
});

it('addCategory defaults flow to "expense" when omitted (backwards compatible)', async () => {
  const { result } = renderHook(() => useCategories());
  let newId;
  await act(async () => {
    newId = result.current.addCategory({ name: 'Hobby', icon: '🎨', color: '#fff' });
  });
  const cat = result.current.getById(newId);
  expect(cat.flow).toBe('expense');
});
```

If `renderHook`, `act` aren't imported, add to the top of the file: `import { renderHook, act } from '@testing-library/react';`.

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- --run useCategories
# Expected: new tests FAIL — flow is undefined on returned category
```

- [ ] **Step 3: Update `addCategory` in `src/useCategories.js` (line 57)**

```diff
-  const addCategory = useCallback(({ name, icon, color }) => {
+  const addCategory = useCallback(({ name, icon, color, flow }) => {
     const id = nanoid(8);
     setCategories(prev => [...prev, {
       id,
       name: (name || '').trim(),
       icon: icon || '📋',
       color: color || '#6B7280',
+      flow: flow === 'income' || flow === 'savings' ? flow : 'expense',
       keywords: [],
       templates: [],
       builtin: false,
     }]);
     return id;
   }, []);
```

- [ ] **Step 4: Run to verify pass**

```bash
npm test -- --run useCategories
# Expected: all useCategories tests PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/useCategories.js src/useCategories.test.jsx
git commit -m "feat(itypes): useCategories.addCategory accepts and persists flow"
```

---

## Phase 2 — Aggregator math (no UI yet)

### Task 5: `getBillNet` pure helper (TDD)

**Files:**
- Test: `src/spendingMath.test.js`
- Modify: `src/spendingMath.js`

- [ ] **Step 1: Add tests to `spendingMath.test.js`**

Append at the bottom:

```js
import { getBillNet } from './spendingMath.js';

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
```

- [ ] **Step 2: Run — should fail**

```bash
npm test -- --run spendingMath
# Expected: getBillNet tests FAIL ("getBillNet is not a function")
```

- [ ] **Step 3: Add `getBillNet` to `src/spendingMath.js`**

Append at the bottom of the file:

```js
// Pure: compute the flow-aware net of a bill.
// Returns { income, expense, savings, net } where net = income - expense - savings.
// Items with an unknown categoryId fall back to 'expense' flow (safe default).
export function getBillNet(bill, categoriesById) {
  let income = 0, expense = 0, savings = 0;
  for (const item of (bill && bill.items) || []) {
    if (!item || !Number.isFinite(item.amount)) continue;
    const cat = categoriesById && categoriesById.get(item.categoryId);
    const flow = cat && cat.flow ? cat.flow : 'expense';
    if (flow === 'income')        income  += item.amount;
    else if (flow === 'savings')  savings += item.amount;
    else                          expense += item.amount;
  }
  return { income, expense, savings, net: income - expense - savings };
}
```

- [ ] **Step 4: Run — should pass**

```bash
npm test -- --run spendingMath
# Expected: all getBillNet tests PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "feat(itypes): add getBillNet flow-aware helper"
```

---

### Task 6: `aggregateByMonth` gains `categoriesById` and 3-bucket output (TDD)

**Files:**
- Test: `src/spendingMath.test.js`
- Modify: `src/spendingMath.js:90-110` (the existing `aggregateByMonth` function)

- [ ] **Step 1: Add tests to `spendingMath.test.js`**

```js
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
```

- [ ] **Step 2: Run — new tests should fail; existing aggregateByMonth tests may also fail because the bucket shape changes (`total` removed)**

```bash
npm test -- --run spendingMath
# Expected: new tests FAIL ("undefined" on .income / .spent / .saved)
# Existing aggregateByMonth tests may FAIL if they reference `.total`
```

If existing tests reference `.total`, update them to `.spent` in step 4 below.

- [ ] **Step 3: Replace `aggregateByMonth` in `src/spendingMath.js` (line 90 onward)**

```js
export function aggregateByMonth(bills, endMonth, categoriesById, vendorFilter = null) {
  const window = getMonthWindow(endMonth);
  const windowSet = new Set(window);
  const buckets = {};
  for (const m of window) {
    buckets[m] = { month: m, income: 0, spent: 0, saved: 0, byVendor: {} };
  }

  for (const bill of bills || []) {
    if (vendorFilter && bill.vendor !== vendorFilter) continue;
    for (const item of bill.items || []) {
      if (!Number.isFinite(item.amount) || item.amount === 0) continue;
      const itemMonth = getItemDate(bill, item).slice(0, 7);
      if (!windowSet.has(itemMonth)) continue;
      const bucket = buckets[itemMonth];
      const cat = categoriesById && categoriesById.get(item.categoryId);
      const flow = cat && cat.flow ? cat.flow : 'expense';
      if (flow === 'income') {
        bucket.income += item.amount;
      } else if (flow === 'savings') {
        bucket.saved += item.amount;
      } else {
        bucket.spent += item.amount;
        const vendor = bill.vendor || 'Unknown';
        bucket.byVendor[vendor] = (bucket.byVendor[vendor] || 0) + item.amount;
      }
    }
  }

  return window.map(m => buckets[m]);
}
```

- [ ] **Step 4: Update any existing test references to `.total`**

Search `src/spendingMath.test.js` for `.total` references inside `aggregateByMonth` describes and replace with `.spent`. If existing tests pass a `vendorFilter` as the third arg, update them to pass `new Map()` (empty) as the third arg (categoriesById) and the vendor filter as the fourth.

- [ ] **Step 5: Run — should pass**

```bash
npm test -- --run spendingMath
# Expected: all aggregateByMonth tests PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "feat(itypes): aggregateByMonth returns income/spent/saved buckets"
```

---

### Task 7: Update `SpendingChart.jsx` and `App.jsx` callsites of `aggregateByMonth`

Both files currently call `aggregateByMonth(bills, endMonth, vendorFilter)`. The signature is now `(bills, endMonth, categoriesById, vendorFilter)`. We also need to fix the access of `m.total` → `m.spent` in SpendingChart.

**Files:**
- Modify: `src/SpendingChart.jsx` (lines around 77, 113-116, 168-204, 231-267)
- Modify: `src/App.jsx` (no current direct call to aggregateByMonth — verify)

- [ ] **Step 1: Update `SpendingChart.jsx` to accept `categoriesById` as a prop**

```diff
- export default function SpendingChart({ bills, selectedMonth, onSelectMonth }) {
+ export default function SpendingChart({ bills, selectedMonth, onSelectMonth, categoriesById }) {
```

- [ ] **Step 2: Update the `aggregateByMonth` call in `SpendingChart.jsx`**

Find the call (around line 77-80) and change it:

```diff
   const monthly = useMemo(
-    () => aggregateByMonth(bills, windowEnd, effectiveFilter),
+    () => aggregateByMonth(bills, windowEnd, categoriesById, effectiveFilter),
     [bills, windowEnd, effectiveFilter]
   );
```

- [ ] **Step 3: Replace `m.total` → `m.spent` throughout SpendingChart**

Inside `SpendingChart.jsx`, search for `m.total`, `d.total`, and `.total` references in the chart-rendering blocks and replace with `.spent`. Use a global replace within this file only.

Specific places to update (line numbers approximate):
- Line ~114: `daily.reduce((s, d) => s + d.total, 0)` → `daily.reduce((s, d) => s + d.spent, 0)`
- Line ~115: `monthly.reduce((s, m) => s + m.total, 0)` → `monthly.reduce((s, m) => s + m.spent, 0)`
- Line ~169: `m.total === 0` → `m.spent === 0`
- Line ~172: `Math.max(...monthly.map(m => m.total), 1)` → `Math.max(...monthly.map(m => m.spent), 1)`
- Line ~176: `(m.total / max)` → `(m.spent / max)`
- Line ~183: `${formatCurrency(m.total)}` → `${formatCurrency(m.spent)}`
- Line ~185: `formatCurrencyShort(m.total)` → `formatCurrencyShort(m.spent)`
- Line ~210: `bucket.total > 0 ? (amount / bucket.total) * 100` → `bucket.spent > 0 ? (amount / bucket.spent) * 100`
- Line ~232: `Math.max(...daily.map(d => d.total), 1)` → `Math.max(...daily.map(d => d.spent), 1)`
- Line ~233: `daily.every(d => d.total === 0)` → `daily.every(d => d.spent === 0)`
- Line ~239: `(d.total / max)` → `(d.spent / max)`
- Line ~244: `${formatCurrency(d.total)}` → `${formatCurrency(d.spent)}`

(`aggregateByDay` will be similarly updated in a later task — the bucket-shape changes ride along together so the chart works after Task 10 too.)

- [ ] **Step 4: Pass `categoriesById` from `App.jsx` to `SpendingChart`**

In `App.jsx`, locate the `<SpendingChart ... />` call (line ~961) and add the prop:

```diff
       <SpendingChart
         bills={bills}
         selectedMonth={selectedMonth}
         onSelectMonth={setSelectedMonth}
+        categoriesById={categoriesById}
       />
```

`categoriesById` is already defined in the surrounding scope (line ~771).

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

```bash
npm test -- --run
# Expected: all tests PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/SpendingChart.jsx src/App.jsx
git commit -m "feat(itypes): SpendingChart consumes flow-aware aggregateByMonth"
```

---

### Task 8: `findRecurringCharges` includes `flow` per result + removes positivity filter

**Files:**
- Test: `src/spendingMath.test.js`
- Modify: `src/spendingMath.js:138-207` (the `findRecurringCharges` function)

- [ ] **Step 1: Add tests to `spendingMath.test.js`**

```js
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
        // A one-off refund — should not appear as recurring (different description, single occurrence)
        { id: 'i3', description: 'Whole Foods refund', amount: -40, categoryId: 'c_groceries', date: '2026-05-10' },
      ]},
    ];
    const results = findRecurringCharges(bills, '2026-05', catsById);
    expect(results.find(r => r.description === 'Netflix')).toBeDefined();
    expect(results.find(r => r.description === 'Whole Foods refund')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — should fail (signature change + flow undefined)**

```bash
npm test -- --run spendingMath
# Expected: findRecurringCharges tests FAIL on flow
```

- [ ] **Step 3: Replace `findRecurringCharges` in `src/spendingMath.js` (replacing the existing function around line 138)**

```js
export function findRecurringCharges(bills, today = currentMonth(), categoriesById = null) {
  const groups = new Map();
  for (const bill of bills || []) {
    for (const item of bill.items || []) {
      if (!item || typeof item.description !== 'string') continue;
      if (!Number.isFinite(item.amount) || item.amount === 0) continue;
      const key = normalizeDescription(item.description);
      if (!key) continue;
      const date = getItemDate(bill, item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({
        date,
        month: date.slice(0, 7),
        amount: item.amount,
        vendor: bill.vendor || 'Unknown',
        categoryId: item.categoryId || null,
        description: item.description.trim(),
      });
    }
  }

  const results = [];
  for (const occurrences of groups.values()) {
    const monthsSet = new Set(occurrences.map(o => o.month));
    if (monthsSet.size < 2) continue;

    const amounts = occurrences.map(o => o.amount);
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const maxDeviation = avg !== 0
      ? Math.max(...amounts.map(a => Math.abs(a - avg) / Math.abs(avg)))
      : 0;
    const varies = maxDeviation > 0.15;

    const days = occurrences.map(o => parseInt(o.date.slice(8, 10), 10));
    const dayRange = Math.max(...days) - Math.min(...days);

    if (dayRange > 7 && varies) continue;

    const sortedByDate = [...occurrences].sort((a, b) => a.date.localeCompare(b.date));
    const firstDate = sortedByDate[0].date;
    const lastDate = sortedByDate[sortedByDate.length - 1].date;
    const lastAmount = sortedByDate[sortedByDate.length - 1].amount;
    const monthsSinceLast = monthsBetween(lastDate.slice(0, 7), today);
    const active = monthsSinceLast >= 0 && monthsSinceLast <= 1;

    const majorityCategoryId = mode(occurrences.map(o => o.categoryId));
    const majorityCat = categoriesById && categoriesById.get(majorityCategoryId);
    const flow = (majorityCat && majorityCat.flow) || 'expense';

    results.push({
      description: mode(occurrences.map(o => o.description)),
      vendor: mode(occurrences.map(o => o.vendor)),
      categoryId: majorityCategoryId,
      flow,
      avgAmount: avg,
      lastAmount,
      varies,
      monthCount: monthsSet.size,
      occurrences: occurrences.length,
      firstDate,
      lastDate,
      active,
    });
  }

  results.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return Math.abs(b.avgAmount) - Math.abs(a.avgAmount);
  });

  return results;
}
```

- [ ] **Step 4: Run — should pass**

```bash
npm test -- --run spendingMath
# Expected: all findRecurringCharges tests PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "feat(itypes): findRecurringCharges annotates results with flow"
```

---

### Task 9: `aggregateByKeyword` sign-aware + flow on result

**Files:**
- Test: `src/spendingMath.test.js`
- Modify: `src/spendingMath.js:209-246`

- [ ] **Step 1: Add tests**

```js
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
```

- [ ] **Step 2: Run — should fail**

```bash
npm test -- --run spendingMath
```

- [ ] **Step 3: Replace `aggregateByKeyword` in `src/spendingMath.js`**

```js
export function aggregateByKeyword(bills, keyword, categoriesById = null) {
  const empty = { total: 0, byMonth: {}, lastDate: null, categoryId: null, flow: 'expense', occurrences: 0 };
  if (!keyword || typeof keyword !== 'string' || !keyword.trim()) return empty;
  const needle = keyword.trim().toLowerCase();

  let total = 0;
  let occurrences = 0;
  let lastDate = null;
  const byMonth = {};
  const categoryIdCounts = new Map();

  for (const bill of bills || []) {
    for (const item of bill.items || []) {
      if (!item || typeof item.description !== 'string') continue;
      if (!Number.isFinite(item.amount) || item.amount === 0) continue;
      if (!item.description.toLowerCase().includes(needle)) continue;

      const date = getItemDate(bill, item);
      const month = date.slice(0, 7);
      total += item.amount;
      byMonth[month] = (byMonth[month] || 0) + item.amount;
      occurrences += 1;
      if (!lastDate || date > lastDate) lastDate = date;
      const cid = item.categoryId || null;
      if (cid) categoryIdCounts.set(cid, (categoryIdCounts.get(cid) || 0) + 1);
    }
  }

  if (occurrences === 0) return empty;

  let categoryId = null;
  let max = 0;
  for (const [cid, count] of categoryIdCounts) {
    if (count > max) { categoryId = cid; max = count; }
  }
  const cat = categoriesById && categoriesById.get(categoryId);
  const flow = (cat && cat.flow) || 'expense';

  return { total, byMonth, lastDate, categoryId, flow, occurrences };
}
```

- [ ] **Step 4: Run — should pass**

```bash
npm test -- --run spendingMath
```

- [ ] **Step 5: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "feat(itypes): aggregateByKeyword is sign-aware + returns flow"
```

---

### Task 10: `aggregateByDay` renames `total` → `spent` and excludes non-expense items

**Files:**
- Test: `src/spendingMath.test.js`
- Modify: `src/spendingMath.js:248-271`

- [ ] **Step 1: Add a test**

```js
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
```

- [ ] **Step 2: Run — should fail**

- [ ] **Step 3: Replace `aggregateByDay` in `src/spendingMath.js`**

```js
export function aggregateByDay(bills, targetMonth, categoriesById = null, vendorFilter = null) {
  const days = daysInMonth(targetMonth);
  const buckets = [];
  for (let d = 1; d <= days; d++) {
    buckets.push({ day: d, spent: 0, byVendor: {} });
  }

  for (const bill of bills || []) {
    if (vendorFilter && bill.vendor !== vendorFilter) continue;
    for (const item of bill.items || []) {
      if (!Number.isFinite(item.amount) || item.amount === 0) continue;
      const cat = categoriesById && categoriesById.get(item.categoryId);
      const flow = cat && cat.flow ? cat.flow : 'expense';
      if (flow !== 'expense') continue;
      const date = getItemDate(bill, item);
      if (date.slice(0, 7) !== targetMonth) continue;
      const day = parseInt(date.slice(8, 10), 10);
      if (day < 1 || day > days) continue;
      const bucket = buckets[day - 1];
      bucket.spent += item.amount;
      const vendor = bill.vendor || 'Unknown';
      bucket.byVendor[vendor] = (bucket.byVendor[vendor] || 0) + item.amount;
    }
  }

  return buckets;
}
```

- [ ] **Step 4: Update SpendingChart.jsx `aggregateByDay` callsite (around line 108)**

```diff
   const daily = useMemo(() => {
     if (!drillMonth) return null;
-    return aggregateByDay(bills, drillMonth, effectiveFilter);
+    return aggregateByDay(bills, drillMonth, categoriesById, effectiveFilter);
   }, [bills, drillMonth, effectiveFilter]);
```

- [ ] **Step 5: Run full suite**

```bash
npm test -- --run
# Expected: all tests pass
```

- [ ] **Step 6: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js src/SpendingChart.jsx
git commit -m "feat(itypes): aggregateByDay is expense-only + accepts categoriesById"
```

---

## Phase 3 — LLM extractor (no UI)

### Task 11: Relax `validateResponse` to accept negative amounts

**Files:**
- Test: `src/billExtractor.test.js`
- Modify: `src/billExtractor.js:50-84`

- [ ] **Step 1: Add tests to `billExtractor.test.js`**

```js
import { validateResponse } from './billExtractor.js';

describe('validateResponse (negative amounts)', () => {
  it('accepts negative amount (refund line)', () => {
    const parsed = {
      vendor: 'Chase',
      month: '2026-05',
      items: [{ description: 'Whole Foods refund', amount: -40, date: '2026-05-12' }],
    };
    const out = validateResponse(parsed);
    expect(out.items).toHaveLength(1);
    expect(out.items[0].amount).toBe(-40);
  });

  it('rejects amount === 0', () => {
    const parsed = {
      vendor: 'Chase',
      month: '2026-05',
      items: [
        { description: 'Real line', amount: 10, date: '2026-05-01' },
        { description: 'Zero',      amount:  0, date: '2026-05-02' },
      ],
    };
    const out = validateResponse(parsed);
    expect(out.items).toHaveLength(1);
    expect(out.items[0].description).toBe('Real line');
  });

  it('still rejects non-finite amounts', () => {
    const parsed = {
      vendor: 'V', month: '2026-05',
      items: [{ description: 'NaN', amount: NaN, date: null }],
    };
    expect(validateResponse(parsed).items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
npm test -- --run billExtractor
```

- [ ] **Step 3: Update `validateResponse` in `src/billExtractor.js`**

Find the filter (around line 58):

```diff
   const items = parsed.items
     .filter(it =>
       it &&
       typeof it.description === 'string' &&
       it.description.trim().length > 0 &&
       typeof it.amount === 'number' &&
       isFinite(it.amount) &&
-      it.amount > 0
+      it.amount !== 0
     )
```

- [ ] **Step 4: Run — should pass**

```bash
npm test -- --run billExtractor
```

- [ ] **Step 5: Commit**

```bash
git add src/billExtractor.js src/billExtractor.test.js
git commit -m "feat(itypes): validateResponse accepts negative-amount items (refunds)"
```

---

### Task 12: Update LLM prompt rules for refunds / paystubs / brokerage

**Files:**
- Modify: `src/billExtractor.js:3-26` (the PROMPT constant)

- [ ] **Step 1: Replace the `PROMPT` constant in `src/billExtractor.js`**

```js
const PROMPT = `You are extracting structured data from a bill, receipt, paystub, brokerage statement, or credit-card statement image.

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
- Extract every line-item that moves money in or out, including refunds, credits, deposits, and paycheck deductions.
- Amounts:
  - Purchases / outflows / deductions: positive (e.g., 84.20)
  - Refunds / credits / returns: NEGATIVE (e.g., -40.00)
  - Income (deposits, paycheck gross, dividends, interest, Zelle): positive
- For paystubs: extract gross pay as one positive line, then each deduction (federal tax, state tax, FICA, 401k, Roth, insurance, etc.) as a positive line using the deduction name as description. Use the current-period column, not YTD.
- For brokerage statements: extract dividends, interest, distributions as positive lines. SKIP buy/sell trades.
- For credit-card statements: each transaction is one item. Refunds / returns / credits → negative amount. Skip "PAYMENT - THANK YOU" lines (those are the user's payment to the card issuer, not a transaction).
- Always skip: statement totals/balances, sales-tax breakdown lines on single receipts, account-number headers, table-rule lines.
- If amount appears as "$12.99", "12.99", or "12,99" — normalize to 12.99.
- "month" is the statement month for credit-card / paystub / brokerage statements, or the receipt month for single-purchase receipts. Format YYYY-MM. Use null if you cannot read it.
- Each item's "date" is the transaction's posting/purchase date in YYYY-MM-DD. If the printed date omits the year, infer it from the statement period (transactions in Dec on a Jan statement use the previous year). Use null if you cannot read a date for an item.
- "vendor" should be the store/merchant name (or card name for statements, employer name for paystubs, brokerage name for brokerage statements). Use null if unclear.
- If you cannot read the image at all, return {"vendor": null, "month": null, "items": []}.`;
```

- [ ] **Step 2: Run full test suite**

```bash
npm test -- --run
# Expected: all tests still pass — prompt is data, no behavior tests directly assert on it
```

- [ ] **Step 3: Commit**

```bash
git add src/billExtractor.js
git commit -m "feat(itypes): LLM prompt extracts refunds + paystubs + dividends"
```

---

## Phase 4 — UI surfaces

### Task 13: Top stat strip → 4 cards (Income / Spent / Saved / Net)

**Files:**
- Modify: `src/App.jsx` (the stats-grid block around line 954-958, plus computation just before it around line 579-603)
- Modify: `src/App.css` (add `stat-card-amber` color variant for Net)

- [ ] **Step 1: Update the month-totals computation in `src/App.jsx`**

Find this block (around line 583-603):

```js
  const todayMonth = currentMonthKey();
  const monthBills = bills.filter(bill => bill.month === selectedMonth);
  const selectedMonthItems = getMonthItems(bills, selectedMonth);
  const selectedMonthTotal = selectedMonthItems.reduce((sum, item) => sum + item.amount, 0);
  ...
  const previousMonth = shiftMonth(selectedMonth, -1);
  const previousMonthTotal = getMonthItems(bills, previousMonth)
    .reduce((sum, item) => sum + item.amount, 0);
```

Replace with flow-aware sums:

```js
  const todayMonth = currentMonthKey();
  const monthBills = bills.filter(bill => bill.month === selectedMonth);
  const selectedMonthItems = getMonthItems(bills, selectedMonth);

  function sumByFlow(items, targetFlow) {
    let s = 0;
    for (const it of items) {
      const cat = categoriesById.get(it.categoryId);
      const flow = cat && cat.flow ? cat.flow : 'expense';
      if (flow === targetFlow) s += it.amount;
    }
    return s;
  }

  const selectedMonthIncome = sumByFlow(selectedMonthItems, 'income');
  const selectedMonthSpent  = sumByFlow(selectedMonthItems, 'expense');
  const selectedMonthSaved  = sumByFlow(selectedMonthItems, 'savings');
  const selectedMonthNet    = selectedMonthIncome - selectedMonthSpent - selectedMonthSaved;

  const monthCardTitle = selectedMonth === todayMonth ? 'This Month' : formatMonthCompact(selectedMonth);

  const previousMonth = shiftMonth(selectedMonth, -1);
  const previousMonthItems = getMonthItems(bills, previousMonth);
  const previousMonthSpent = sumByFlow(previousMonthItems, 'expense');

  let monthDelta = null;
  if (previousMonthSpent > 0) {
    const change = (selectedMonthSpent - previousMonthSpent) / previousMonthSpent;
    monthDelta = {
      pct: Math.round(Math.abs(change) * 100),
      direction: change > 0.005 ? 'up' : change < -0.005 ? 'down' : 'flat',
      prevLabel: formatMonthCompact(previousMonth),
    };
  }
```

Note: `categoriesById` is already in scope (defined around line 771).

Also remove the old `totalExpenses` and `selectedMonthTotal` variables — they're no longer referenced.

- [ ] **Step 2: Replace the stats-grid JSX (around line 954)**

```diff
         {/* Stats */}
         <div className="stats-grid">
-          <SummaryCard title="Total Expenses" amount={totalExpenses} colorKey="blue" />
-          <SummaryCard title={monthCardTitle}  amount={selectedMonthTotal} colorKey="green" delta={monthDelta} />
-          <SummaryCard title="Total Bills"    amount={bills.length} isCount={true} colorKey="purple" />
+          <SummaryCard title="Income" amount={selectedMonthIncome} colorKey="green" />
+          <SummaryCard title="Spent"  amount={selectedMonthSpent}  colorKey="red"   delta={monthDelta} />
+          <SummaryCard title="Saved"  amount={selectedMonthSaved}  colorKey="blue"  />
+          <SummaryCard title="Net"    amount={selectedMonthNet}    colorKey="amber" />
         </div>
```

The "Total Bills" count is already shown in the existing section heading (`<span className="section-count">{visibleBills.length}</span>` at line 1006) — no card needed.

- [ ] **Step 3: Add the amber + red color variants to `src/App.css`**

If they don't already exist, append to the bottom of `src/App.css`:

```css
.stat-card-amber { border-color: rgba(212, 168, 83, 0.20); }
.stat-card-amber .stat-value { color: #d4a853; }
.stat-dot-amber { background: #d4a853; }

.stat-card-red { border-color: rgba(224, 108, 108, 0.20); }
.stat-card-red .stat-value { color: #e0928a; }
.stat-dot-red { background: #e0928a; }

/* 4-card grid layout — adjust existing .stats-grid to accommodate 4 cards on desktop */
.stats-grid { grid-template-columns: repeat(4, 1fr); }
@media (max-width: 768px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}
```

(If the project's `App.css` already has `.stats-grid` defined, find that selector and update `grid-template-columns` rather than appending a duplicate rule.)

- [ ] **Step 4: Manual browser smoke** (no automated UI test in this task)

```bash
npm run dev
# Open the app in browser, verify:
# - Four stat cards appear: Income / Spent / Saved / Net
# - Numbers are reasonable for your data (Saved & Income will be $0 until you add income/savings items)
# - Mobile layout (resize browser narrow): 2x2 grid
```

- [ ] **Step 5: Run tests to confirm none of the existing tests broke**

```bash
npm test -- --run
```

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat(itypes): 4-card stat strip (Income/Spent/Saved/Net)"
```

---

### Task 14: BillCard header uses `getBillNet` with directional indicator

**Files:**
- Modify: `src/App.jsx` (the `BillCard` component, around line 183-269)
- Modify: `src/App.css` (add directional styling)

- [ ] **Step 1: Update the `BillCard` props and total computation**

Find the `BillCard` definition (around line 183):

```diff
-const BillCard = ({ bill, defaultCategoryId, categories, otherCategoryId, onUpdate, onDelete, onDeleteItem, isMobile, highlighted = false, cardRef = null }) => {
+const BillCard = ({ bill, defaultCategoryId, categories, categoriesById, otherCategoryId, onUpdate, onDelete, onDeleteItem, isMobile, highlighted = false, cardRef = null }) => {
   const [isExpanded, setIsExpanded] = useState(highlighted);
-  const total = bill.items.reduce((sum, item) => sum + item.amount, 0);
+  const billNet = getBillNet(bill, categoriesById);
+  const direction = billNet.net > 0 ? 'in' : billNet.net < 0 ? 'out' : 'flat';
+  const displayAmount = Math.abs(billNet.net);
```

Add this import near the top of `App.jsx`:

```diff
-import { migrateBills, getItemDate, findRecurringCharges, aggregateByKeyword, getMonthItems } from './spendingMath.js';
+import { migrateBills, getItemDate, findRecurringCharges, aggregateByKeyword, getMonthItems, getBillNet } from './spendingMath.js';
```

- [ ] **Step 2: Update the JSX where the total is displayed (around line 220-223)**

```diff
         <div className="bill-right">
-          <span className="bill-total">{formatCurrency(total)}</span>
+          <span className={`bill-total bill-total-${direction}`}>
+            {direction === 'in' ? '↑' : direction === 'out' ? '↓' : ''}
+            {formatCurrency(displayAmount)}
+          </span>
           <span className={`bill-chevron${isExpanded ? ' bill-chevron-open' : ''}`}>▾</span>
         </div>
```

- [ ] **Step 3: Pass `categoriesById` to every `<BillCard ... />` callsite**

Find the BillCard call (around line 1057-1071):

```diff
               <BillCard
                 key={bill.id}
                 bill={bill}
                 defaultCategoryId={cats.otherId()}
                 categories={cats.categories}
+                categoriesById={categoriesById}
                 otherCategoryId={cats.otherId()}
                 onUpdate={updateBill}
                 onDelete={deleteBill}
                 onDeleteItem={handleDeleteItem}
                 isMobile={isMobile}
                 highlighted={bill.id === newlyAddedBillId}
                 cardRef={bill.id === newlyAddedBillId ? newBillRef : null}
               />
```

- [ ] **Step 4: Add CSS for directional total colors**

Append to `src/App.css`:

```css
.bill-total-in  { color: #6bd49a; }
.bill-total-out { color: #e6e7ea; }
.bill-total-flat { color: #8a8d94; }
```

- [ ] **Step 5: Manual browser smoke**

```bash
npm run dev
# Verify: expense bills show ↓ + dollar amount in neutral color
# Verify: when you have a paycheck-style bill (test by manually editing a bill to add an income-flow item), shows ↑ in green
```

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat(itypes): BillCard header shows directional net total"
```

---

### Task 15: BillItem — remove `min="0"`, add Credit toggle

**Files:**
- Test: `src/BillItem.test.jsx`
- Modify: `src/BillItem.jsx`

- [ ] **Step 1: Add tests to `BillItem.test.jsx`**

```js
it('renders Credit toggle button on each item row', () => {
  renderItem();
  expect(screen.getByRole('button', { name: /credit/i })).toBeTruthy();
});

it('clicking Credit toggle flips the sign of amount', async () => {
  const { onUpdate, item } = renderItem({ item: { amount: 84.20 } });
  await userEvent.click(screen.getByRole('button', { name: /credit/i }));
  expect(onUpdate).toHaveBeenCalledWith({ ...item, amount: -84.20 });
});

it('row gets credit-active class when amount is negative', () => {
  renderItem({ item: { amount: -40 } });
  expect(document.querySelector('.item-row-credit, .item-row-mobile-credit')).toBeTruthy();
});

it('amount input accepts negative values (no min=0)', () => {
  renderItem({ item: { amount: -40 } });
  const inputs = document.querySelectorAll('input[type="number"]');
  for (const i of inputs) {
    expect(i.getAttribute('min')).not.toBe('0');
  }
});
```

- [ ] **Step 2: Run — should fail**

```bash
npm test -- --run BillItem
```

- [ ] **Step 3: Update `src/BillItem.jsx`**

The full updated file (replace contents):

```jsx
import { getItemDate } from './spendingMath.js';

const FALLBACK = { name: 'Other', icon: '📋', color: '#6B7280', templates: [] };

function lookup(categories, categoryId, fallbackId) {
  const found = categories.find(c => c.id === categoryId);
  if (found) return found;
  const fallback = categories.find(c => c.id === fallbackId);
  return fallback || FALLBACK;
}

function TemplateChips({ templates, item, onUpdate }) {
  if (!templates || templates.length === 0) return null;
  return (
    <div className="item-template-chips">
      {templates.map(t => (
        <button
          key={t}
          type="button"
          className="template-chip"
          onClick={() => onUpdate({ ...item, description: t })}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function CreditToggle({ item, onUpdate, active }) {
  return (
    <button
      type="button"
      className={`credit-toggle${active ? ' credit-toggle-active' : ''}`}
      onClick={() => onUpdate({ ...item, amount: -item.amount })}
      aria-pressed={active}
      title={active ? 'Refund (click to remove credit)' : 'Mark as refund / credit'}
    >
      Credit
    </button>
  );
}

function groupCategoriesByFlow(categories) {
  const groups = { income: [], expense: [], savings: [] };
  for (const c of categories) {
    const flow = c.flow || 'expense';
    if (groups[flow]) groups[flow].push(c);
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => a.name.localeCompare(b.name));
  }
  return groups;
}

function CategorySelect({ value, onChange, categories }) {
  const groups = groupCategoriesByFlow(categories);
  return (
    <select value={value} onChange={onChange} className="select">
      {groups.income.length > 0 && (
        <optgroup label="Income">
          {groups.income.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>)}
        </optgroup>
      )}
      {groups.expense.length > 0 && (
        <optgroup label="Expense">
          {groups.expense.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>)}
        </optgroup>
      )}
      {groups.savings.length > 0 && (
        <optgroup label="Savings">
          {groups.savings.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>)}
        </optgroup>
      )}
    </select>
  );
}

export default function BillItem({ item, bill, categories, otherCategoryId, onUpdate, onDelete, isMobile }) {
  const category = lookup(categories, item.categoryId, otherCategoryId);
  const itemDate = item.date || getItemDate(bill, item);
  const isCredit = Number.isFinite(item.amount) && item.amount < 0;

  if (isMobile) {
    return (
      <div className={`item-row-mobile${isCredit ? ' item-row-mobile-credit' : ''}`}>
        <div className="item-row-mobile-top">
          <div className="item-row-mobile-top-left">
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
          </div>
          <button className="btn-delete" onClick={onDelete}>×</button>
        </div>
        <div className="item-row-mobile-bottom">
          <input
            type="date"
            value={itemDate}
            onChange={(e) => onUpdate({ ...item, date: e.target.value })}
            className="input item-date"
            style={{ width: '140px', flexShrink: 0 }}
          />
          <CategorySelect
            value={item.categoryId}
            onChange={(e) => onUpdate({ ...item, categoryId: e.target.value })}
            categories={categories}
          />
          <CreditToggle item={item} onUpdate={onUpdate} active={isCredit} />
          <div className="input-amount-wrap" style={{ width: '110px', flexShrink: 0 }}>
            <span className="input-amount-prefix">$</span>
            <input
              type="number"
              value={item.amount}
              onChange={(e) => onUpdate({ ...item, amount: parseFloat(e.target.value) || 0 })}
              className="input-amount"
              step="0.01"
            />
          </div>
        </div>
        <TemplateChips templates={category.templates} item={item} onUpdate={onUpdate} />
      </div>
    );
  }

  return (
    <>
      <div className={`item-row${isCredit ? ' item-row-credit' : ''}`}>
        <div
          className="item-icon"
          style={{ background: `${category.color}18`, border: `1px solid ${category.color}28` }}
        >
          {category.icon}
        </div>
        <input
          type="date"
          value={itemDate}
          onChange={(e) => onUpdate({ ...item, date: e.target.value })}
          className="input item-date"
        />
        <CategorySelect
          value={item.categoryId}
          onChange={(e) => onUpdate({ ...item, categoryId: e.target.value })}
          categories={categories}
        />
        <input
          type="text"
          value={item.description}
          onChange={(e) => onUpdate({ ...item, description: e.target.value })}
          className="input-transparent"
          placeholder="Description"
        />
        <CreditToggle item={item} onUpdate={onUpdate} active={isCredit} />
        <div className="input-amount-wrap">
          <span className="input-amount-prefix">$</span>
          <input
            type="number"
            value={item.amount}
            onChange={(e) => onUpdate({ ...item, amount: parseFloat(e.target.value) || 0 })}
            className="input-amount"
            step="0.01"
          />
        </div>
        <button className="btn-delete" onClick={onDelete}>×</button>
      </div>
      <TemplateChips templates={category.templates} item={item} onUpdate={onUpdate} />
    </>
  );
}
```

- [ ] **Step 4: Add CSS for credit toggle and credit row in `src/App.css`**

```css
.credit-toggle {
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: 99px;
  background: transparent;
  color: var(--text-tertiary, #8a8d94);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: all 0.15s ease;
  font-weight: 600;
}
.credit-toggle:hover {
  border-color: rgba(107, 212, 154, 0.4);
  color: #6bd49a;
}
.credit-toggle-active {
  background: rgba(107, 212, 154, 0.15);
  color: #6bd49a;
  border-color: rgba(107, 212, 154, 0.35);
}
.item-row-credit, .item-row-mobile-credit {
  background: rgba(107, 212, 154, 0.04);
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --run BillItem
# Expected: all BillItem tests PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/BillItem.jsx src/App.css src/BillItem.test.jsx
git commit -m "feat(itypes): BillItem Credit toggle + accept negative amounts"
```

---

### Task 16: BillItem — grouped `<optgroup>` category dropdown

This is already implemented in Task 15 via the new `CategorySelect` component. This task is just for the explicit test coverage.

**Files:**
- Test: `src/BillItem.test.jsx`

- [ ] **Step 1: Add a test for grouped dropdown**

```js
it('category dropdown renders <optgroup> sections by flow', () => {
  const catsWithFlow = [
    { id: 'c_pay',  name: 'Paycheck',  icon: '💼', color: '#fff', flow: 'income',  keywords: [], templates: [], builtin: true },
    { id: 'c_food', name: 'Groceries', icon: '🛒', color: '#fff', flow: 'expense', keywords: [], templates: [], builtin: true },
    { id: 'c_401k', name: '401(k)',    icon: '📊', color: '#fff', flow: 'savings', keywords: [], templates: [], builtin: true },
    { id: 'c_other', name: 'Other',    icon: '📋', color: '#fff', flow: 'expense', keywords: [], templates: [], builtin: true },
  ];
  const item = { id: 'i1', description: '', amount: 10, categoryId: 'c_food', date: '2026-04-15' };
  render(
    <BillItem
      item={item}
      bill={bill}
      categories={catsWithFlow}
      otherCategoryId="c_other"
      onUpdate={() => {}}
      onDelete={() => {}}
      isMobile={false}
    />
  );
  const groups = document.querySelectorAll('optgroup');
  expect(groups.length).toBe(3);
  const labels = Array.from(groups).map(g => g.getAttribute('label'));
  expect(labels).toEqual(['Income', 'Expense', 'Savings']);
});
```

- [ ] **Step 2: Run — should pass (already implemented in Task 15)**

```bash
npm test -- --run BillItem
```

- [ ] **Step 3: Commit**

```bash
git add src/BillItem.test.jsx
git commit -m "test(itypes): assert grouped optgroup category dropdown"
```

---

### Task 17: Recurring sidebar split into 3 flow sections

**Files:**
- Modify: `src/App.jsx` (the `Subscriptions` component around line 385-433 — rename + restructure)

- [ ] **Step 1: Replace the `Subscriptions` component in `src/App.jsx`**

Find the existing component (around line 385). Replace it with this `RecurringPanels` component:

```jsx
// ---- Recurring Panels (split by flow) ----

const RecurringSection = ({ title, charges, totalLabel, categoriesById, fallbackCategory }) => {
  if (charges.length === 0) return null;
  const total = charges.filter(c => c.active).reduce((s, c) => s + Math.abs(c.lastAmount), 0);
  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="panel-title">{title}</h3>
        <span className="panel-sub">~{formatCurrency(total)}/mo {totalLabel}</span>
      </div>
      <div className="sub-list">
        {charges.map(c => {
          const cat = categoriesById.get(c.categoryId) || fallbackCategory;
          return (
            <div key={`${c.vendor}-${c.description}`} className={`sub-row${c.active ? '' : ' sub-row-inactive'}`}>
              <div className="sub-row-main">
                <span className="sub-icon" style={{ background: `${cat.color}18`, border: `1px solid ${cat.color}28` }}>
                  {cat.icon}
                </span>
                <div className="sub-row-text">
                  <div className="sub-row-desc">{c.description}</div>
                  <div className="sub-row-meta">
                    {c.vendor} · {c.monthCount} mo · last {c.lastDate}
                  </div>
                </div>
              </div>
              <div className="sub-row-right">
                <div className="sub-amount">
                  {formatCurrency(Math.abs(c.lastAmount))}
                  {c.varies && <span className="sub-varies" title={`Avg ${formatCurrency(Math.abs(c.avgAmount))}`}>varies</span>}
                </div>
                <span className={`sub-badge${c.active ? ' sub-badge-active' : ' sub-badge-inactive'}`}>
                  {c.active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const RecurringPanels = ({ bills, today, trackedKeywords = [], categoriesById, fallbackCategory }) => {
  const all = findRecurringCharges(bills, today, categoriesById);
  const filtered = all.filter(c => !trackedKeywords.some(kw =>
    c.description.toUpperCase().includes(kw.toUpperCase())
  ));
  if (filtered.length === 0) return null;

  const income   = filtered.filter(c => c.flow === 'income');
  const expense  = filtered.filter(c => c.flow === 'expense');
  const savings  = filtered.filter(c => c.flow === 'savings');

  return (
    <>
      <RecurringSection
        title="Recurring · Income"
        charges={income}
        totalLabel="in"
        categoriesById={categoriesById}
        fallbackCategory={fallbackCategory}
      />
      <RecurringSection
        title="Recurring · Expenses"
        charges={expense}
        totalLabel="out"
        categoriesById={categoriesById}
        fallbackCategory={fallbackCategory}
      />
      <RecurringSection
        title="Recurring · Savings"
        charges={savings}
        totalLabel="saved"
        categoriesById={categoriesById}
        fallbackCategory={fallbackCategory}
      />
    </>
  );
};
```

- [ ] **Step 2: Replace the `<Subscriptions ... />` usage in the JSX (around line 1093)**

```diff
-            <Subscriptions
+            <RecurringPanels
               bills={bills}
               today={todayMonth}
               trackedKeywords={trackedKeywords}
               categoriesById={categoriesById}
               fallbackCategory={fallbackCategory}
             />
```

- [ ] **Step 3: Manual browser smoke**

```bash
npm run dev
# Verify with mock data:
# - Add a bi-weekly recurring "Paycheck" item across 3+ months → "Recurring · Income" appears
# - Existing recurring expenses still appear under "Recurring · Expenses"
# - 401k items across 3+ months → "Recurring · Savings" appears
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --run
```

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(itypes): split Subscriptions into 3 flow-aware Recurring panels"
```

---

### Task 18: CategoryEditor — flow segmented control + warning dialog

**Files:**
- Test: `src/CategoryEditor.test.jsx`
- Modify: `src/CategoryEditor.jsx`
- Modify: `src/App.css` (segmented control styles)

- [ ] **Step 1: Add tests to `src/CategoryEditor.test.jsx`**

If the file doesn't exist, create it with a minimal harness similar to `BillItem.test.jsx`. Otherwise add inside the existing `describe` block:

```js
it('renders flow segmented control with 3 options', () => {
  const category = { id: 'c1', name: 'Groceries', icon: '🛒', color: '#10B981', flow: 'expense', keywords: [], templates: [], builtin: true };
  render(
    <CategoryEditor
      category={category}
      itemCount={0}
      otherCategories={[]}
      onMoveAll={() => {}}
      onUpdate={() => {}}
      onAddKeyword={() => {}}
      onRemoveKeyword={() => {}}
      onAddTemplate={() => {}}
      onRemoveTemplate={() => {}}
      onDelete={() => {}}
    />
  );
  expect(screen.getByRole('radio', { name: /income/i })).toBeTruthy();
  expect(screen.getByRole('radio', { name: /expense/i })).toBeTruthy();
  expect(screen.getByRole('radio', { name: /savings/i })).toBeTruthy();
});

it('changing flow on a category with zero items calls onUpdate immediately (no warning)', async () => {
  const onUpdate = vi.fn();
  const category = { id: 'c1', name: 'Hobby', icon: '🎨', color: '#fff', flow: 'expense', keywords: [], templates: [], builtin: false };
  render(
    <CategoryEditor
      category={category}
      itemCount={0}
      otherCategories={[]}
      onMoveAll={() => {}}
      onUpdate={onUpdate}
      onAddKeyword={() => {}}
      onRemoveKeyword={() => {}}
      onAddTemplate={() => {}}
      onRemoveTemplate={() => {}}
      onDelete={() => {}}
    />
  );
  await userEvent.click(screen.getByRole('radio', { name: /income/i }));
  expect(onUpdate).toHaveBeenCalledWith({ flow: 'income' });
});

it('changing flow on a category with items shows warning before calling onUpdate', async () => {
  const onUpdate = vi.fn();
  const category = { id: 'c1', name: 'Cash Savings', icon: '🪙', color: '#fff', flow: 'savings', keywords: [], templates: [], builtin: true };
  render(
    <CategoryEditor
      category={category}
      itemCount={14}
      otherCategories={[]}
      onMoveAll={() => {}}
      onUpdate={onUpdate}
      onAddKeyword={() => {}}
      onRemoveKeyword={() => {}}
      onAddTemplate={() => {}}
      onRemoveTemplate={() => {}}
      onDelete={() => {}}
    />
  );
  await userEvent.click(screen.getByRole('radio', { name: /expense/i }));
  // onUpdate not called yet — pending confirmation
  expect(onUpdate).not.toHaveBeenCalled();
  // Warning dialog visible
  expect(screen.getByText(/14 items/i)).toBeTruthy();
  // Click Continue
  await userEvent.click(screen.getByRole('button', { name: /continue/i }));
  expect(onUpdate).toHaveBeenCalledWith({ flow: 'expense' });
});
```

If `vi` isn't imported in this file, add `import { describe, it, expect, vi, afterEach } from 'vitest';` to the top. Also ensure `userEvent` and RTL are imported.

- [ ] **Step 2: Run — should fail**

```bash
npm test -- --run CategoryEditor
```

- [ ] **Step 3: Update `src/CategoryEditor.jsx`**

Replace the file contents:

```jsx
import { useState, useEffect } from 'react';
import IconPicker from './IconPicker.jsx';
import ColorPicker from './ColorPicker.jsx';
import ChipEditor from './ChipEditor.jsx';

const FLOW_OPTIONS = [
  { key: 'income',  label: 'Income'  },
  { key: 'expense', label: 'Expense' },
  { key: 'savings', label: 'Savings' },
];

function FlowControl({ value, onChange }) {
  return (
    <div className="flow-control" role="radiogroup" aria-label="Category flow">
      {FLOW_OPTIONS.map(opt => (
        <label
          key={opt.key}
          className={`flow-control-option${value === opt.key ? ' active' : ''}`}
        >
          <input
            type="radio"
            name="flow"
            value={opt.key}
            checked={value === opt.key}
            onChange={() => onChange(opt.key)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function FlowChangeDialog({ category, fromFlow, toFlow, itemCount, onConfirm, onCancel }) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">Change flow on "{category.name}"?</h2>
        <p className="dialog-body">
          Changing this category from <strong>{fromFlow}</strong> to <strong>{toFlow}</strong> will reclassify <strong>{itemCount} item{itemCount === 1 ? '' : 's'}</strong> into the {toFlow === 'income' ? 'Income' : toFlow === 'savings' ? 'Saved' : 'Spent'} bucket. This affects past months too.
        </p>
        <div className="dialog-actions">
          <button className="btn dialog-btn-cancel" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary dialog-btn-confirm" onClick={onConfirm} autoFocus>Continue</button>
        </div>
      </div>
    </div>
  );
}

export default function CategoryEditor({
  category,
  itemCount,
  otherCategories,
  onMoveAll,
  onUpdate,
  onAddKeyword,
  onRemoveKeyword,
  onAddTemplate,
  onRemoveTemplate,
  onDelete,
}) {
  const [name, setName] = useState(category.name);
  const [nameError, setNameError] = useState('');
  const [moveTarget, setMoveTarget] = useState('');
  const [pendingFlow, setPendingFlow] = useState(null);

  useEffect(() => {
    setName(category.name);
    setNameError('');
    setMoveTarget('');
    setPendingFlow(null);
  }, [category.id, category.name]);

  const commitName = () => {
    const v = name.trim();
    if (!v) { setNameError('Name required'); return; }
    setNameError('');
    if (v !== category.name) onUpdate({ name: v });
  };

  const handleFlowSelect = (nextFlow) => {
    if (nextFlow === category.flow) return;
    if (itemCount === 0) {
      onUpdate({ flow: nextFlow });
    } else {
      setPendingFlow(nextFlow);
    }
  };

  const confirmFlowChange = () => {
    if (pendingFlow) onUpdate({ flow: pendingFlow });
    setPendingFlow(null);
  };

  return (
    <div className="cat-editor">
      <div className="cat-editor-header">
        <span className="cat-editor-icon" style={{ background: `${category.color}22` }}>
          {category.icon}
        </span>
        <span className="cat-editor-title">Editing: {category.name}</span>
      </div>

      <div className="cat-editor-fields">
        <label className="cat-editor-field">
          <span className="cat-editor-label">Name</span>
          <input
            type="text"
            className="cat-editor-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
          />
          {nameError && <span className="cat-editor-error">{nameError}</span>}
        </label>

        <label className="cat-editor-field">
          <span className="cat-editor-label">Flow</span>
          <FlowControl value={category.flow || 'expense'} onChange={handleFlowSelect} />
        </label>

        <label className="cat-editor-field">
          <span className="cat-editor-label">Icon</span>
          <IconPicker value={category.icon} onChange={(icon) => onUpdate({ icon })} />
        </label>

        <label className="cat-editor-field">
          <span className="cat-editor-label">Color</span>
          <ColorPicker value={category.color} onChange={(color) => onUpdate({ color })} />
        </label>
      </div>

      <div className="cat-editor-section">
        <div className="cat-editor-section-title">
          Auto-categorize keywords <span className="cat-editor-section-hint">(longest match wins)</span>
        </div>
        <ChipEditor
          values={category.keywords}
          onAdd={onAddKeyword}
          onRemove={onRemoveKeyword}
          placeholder="Add keyword (e.g. PEOPLES GAS)"
        />
      </div>

      <div className="cat-editor-section">
        <div className="cat-editor-section-title">
          Description templates <span className="cat-editor-section-hint">(quick-pick chips when entering items)</span>
        </div>
        <ChipEditor
          values={category.templates}
          onAdd={onAddTemplate}
          onRemove={onRemoveTemplate}
          placeholder="Add template (e.g. Gas)"
        />
      </div>

      <div className="cat-editor-footer">
        <button
          type="button"
          className="btn btn-danger"
          onClick={onDelete}
          disabled={itemCount > 0}
        >
          Delete
        </button>
        {itemCount > 0 && (
          <div className="cat-editor-move-all">
            <span className="cat-editor-delete-hint">
              Move {itemCount} item{itemCount === 1 ? '' : 's'} to:
            </span>
            <select
              className="cat-editor-input"
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
            >
              <option value="">— pick a category —</option>
              {(otherCategories || []).map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              disabled={!moveTarget}
              onClick={() => { onMoveAll(moveTarget); setMoveTarget(''); }}
            >
              Move all
            </button>
          </div>
        )}
      </div>

      {pendingFlow && (
        <FlowChangeDialog
          category={category}
          fromFlow={category.flow || 'expense'}
          toFlow={pendingFlow}
          itemCount={itemCount}
          onConfirm={confirmFlowChange}
          onCancel={() => setPendingFlow(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add CSS for `.flow-control`**

```css
.flow-control {
  display: inline-flex;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 8px;
  overflow: hidden;
}
.flow-control-option {
  position: relative;
  padding: 6px 14px;
  font-size: 0.75rem;
  cursor: pointer;
  color: var(--text-secondary, #8a8d94);
  transition: all 0.15s ease;
}
.flow-control-option:not(:last-child) {
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}
.flow-control-option input { position: absolute; opacity: 0; pointer-events: none; }
.flow-control-option:hover { color: var(--text-primary, #e6e7ea); }
.flow-control-option.active {
  background: rgba(212, 168, 83, 0.12);
  color: #d4a853;
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --run CategoryEditor
# Expected: all CategoryEditor tests PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/CategoryEditor.jsx src/CategoryEditor.test.jsx src/App.css
git commit -m "feat(itypes): CategoryEditor flow segmented control + warning"
```

---

### Task 19: ManageCategoriesScreen — group by flow with badge

**Files:**
- Modify: `src/ManageCategoriesScreen.jsx`
- Modify: `src/App.css`

- [ ] **Step 1: Update the list rendering in `src/ManageCategoriesScreen.jsx`**

Replace the `<aside className="manage-list">` block (around line 64-86) with a grouped version:

```jsx
        <aside className="manage-list">
          <div className="manage-list-title">{categories.length} categories</div>
          {(['income', 'expense', 'savings']).map(flow => {
            const inFlow = categories.filter(c => (c.flow || 'expense') === flow);
            if (inFlow.length === 0) return null;
            return (
              <div key={flow} className="manage-list-flow-group">
                <div className="manage-list-flow-label">{flow}</div>
                {inFlow.map(cat => {
                  const count = itemCounts.get(cat.id) || 0;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`manage-list-row${cat.id === selectedId ? ' active' : ''}`}
                      onClick={() => setSelectedId(cat.id)}
                    >
                      <span
                        className="manage-list-icon"
                        style={{ background: `${cat.color}22`, border: `1px solid ${cat.color}44` }}
                      >
                        {cat.icon}
                      </span>
                      <span className="manage-list-name">{cat.name}</span>
                      <span className="manage-list-count">{count}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </aside>
```

- [ ] **Step 2: Add CSS**

```css
.manage-list-flow-group { margin-top: 0.5rem; }
.manage-list-flow-label {
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-tertiary, #6b6e74);
  padding: 0.4rem 0.75rem 0.2rem;
  font-weight: 600;
}
```

- [ ] **Step 3: Manual smoke**

```bash
npm run dev
# Open Categories screen — verify list is grouped Income / Expense / Savings
# Verify all existing categories still listed; new income/savings seeds visible
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --run ManageCategoriesScreen
```

- [ ] **Step 5: Commit**

```bash
git add src/ManageCategoriesScreen.jsx src/App.css
git commit -m "feat(itypes): ManageCategoriesScreen groups categories by flow"
```

---

### Task 20: SpendingChart — collapse/expand button + localStorage persistence

**Files:**
- Test: `src/SpendingChart.test.jsx` (new file)
- Modify: `src/SpendingChart.jsx`
- Modify: `src/App.css`

- [ ] **Step 1: Create `src/SpendingChart.test.jsx`**

```jsx
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpendingChart from './SpendingChart.jsx';

afterEach(() => cleanup());
beforeEach(() => { localStorage.clear(); });

const billsWithSpend = [
  { id: 'b1', vendor: 'Chase', month: '2026-05', items: [
    { id: 'i1', description: 'X', amount: 50, categoryId: 'c_food', date: '2026-05-10' },
  ]},
];
const catsById = new Map([
  ['c_food', { id: 'c_food', flow: 'expense' }],
]);

describe('SpendingChart collapse/expand', () => {
  it('renders chart body by default (not collapsed)', () => {
    render(
      <SpendingChart
        bills={billsWithSpend}
        selectedMonth="2026-05"
        onSelectMonth={() => {}}
        categoriesById={catsById}
      />
    );
    expect(document.querySelector('.spending-bars')).toBeTruthy();
  });

  it('clicking collapse button hides the chart body and sets localStorage', async () => {
    render(
      <SpendingChart
        bills={billsWithSpend}
        selectedMonth="2026-05"
        onSelectMonth={() => {}}
        categoriesById={catsById}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /collapse/i }));
    expect(document.querySelector('.spending-bars')).toBeFalsy();
    expect(localStorage.getItem('billtracker-chart-collapsed')).toBe('true');
  });

  it('reads localStorage on mount and starts collapsed when "true"', () => {
    localStorage.setItem('billtracker-chart-collapsed', 'true');
    render(
      <SpendingChart
        bills={billsWithSpend}
        selectedMonth="2026-05"
        onSelectMonth={() => {}}
        categoriesById={catsById}
      />
    );
    expect(document.querySelector('.spending-bars')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
npm test -- --run SpendingChart
```

- [ ] **Step 3: Update `src/SpendingChart.jsx`**

Add a `collapsed` state at the top of the component (just after the existing `useState` calls at line ~35-46):

```js
const COLLAPSE_KEY = 'billtracker-chart-collapsed';

// ... inside the component, after vendorColors useState:
const [collapsed, setCollapsed] = useState(() => {
  try { return localStorage.getItem(COLLAPSE_KEY) === 'true'; } catch { return false; }
});

useEffect(() => {
  try { localStorage.setItem(COLLAPSE_KEY, collapsed ? 'true' : 'false'); }
  catch (e) { console.error('Failed to persist chart collapsed state:', e); }
}, [collapsed]);
```

Update the header JSX (around line 299-307):

```diff
       <div className="spending-header">
         <h2 className="spending-title">Spending</h2>
+        <button
+          type="button"
+          className="spending-collapse-btn"
+          onClick={() => setCollapsed(c => !c)}
+          aria-label={collapsed ? 'Expand chart' : 'Collapse chart'}
+          aria-expanded={!collapsed}
+        >
+          {collapsed ? '▾' : '▴'}
+        </button>
         <div>
           <span className="spending-total-label">{totalLabel}</span>
           <span className="spending-total">{formatCurrency(filteredTotal)}</span>
         </div>
       </div>
-      {renderChips()}
-      {renderLegend()}
-      {drillMonth ? (
-        <>
-          {renderDailyHeader()}
-          {renderDailyBars()}
-        </>
-      ) : (
-        renderMonthlyBars()
-      )}
+      {!collapsed && (
+        <>
+          {renderChips()}
+          {renderLegend()}
+          {drillMonth ? (
+            <>
+              {renderDailyHeader()}
+              {renderDailyBars()}
+            </>
+          ) : (
+            renderMonthlyBars()
+          )}
+        </>
+      )}
```

- [ ] **Step 4: Add CSS**

```css
.spending-collapse-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: var(--text-secondary, #8a8d94);
  font-size: 0.9rem;
}
.spending-collapse-btn:hover {
  color: var(--text-primary, #e6e7ea);
  border-color: rgba(212, 168, 83, 0.25);
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --run SpendingChart
# Expected: all PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/SpendingChart.jsx src/SpendingChart.test.jsx src/App.css
git commit -m "feat(itypes): SpendingChart collapse/expand with localStorage persistence"
```

---

## Phase 5 — Integration smoke + final verification

### Task 21: Integration smoke — migration + flow-aware aggregation end-to-end

This task validates the full Phase 1+2 chain without rendering `<App />` (which would pull in browser-only `peerjs` and crash in jsdom). It exercises the same paths but at a layer below the React root.

**Files:**
- Modify: `src/__smoke__/setup.test.jsx`

- [ ] **Step 1: Replace the smoke test file**

```jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { initializeFromStorage } from '../initializeFromStorage.js';
import {
  aggregateByMonth,
  findRecurringCharges,
  getBillNet,
} from '../spendingMath.js';

function makeFakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
  };
}

describe('end-to-end: migration + flow-aware math', () => {
  it('v2 → v3 chain: storage gets migrated, schema bumps to 3, seeds present', () => {
    const v2Cats = [
      { id: 'c_food',  name: 'Groceries', icon: '🛒', color: '#10B981', keywords: [], templates: [], builtin: true },
      { id: 'c_other', name: 'Other',     icon: '📋', color: '#6B7280', keywords: [], templates: [], builtin: true },
    ];
    const storage = makeFakeStorage({
      'billtracker-bills':           JSON.stringify([]),
      'billtracker-categories':      JSON.stringify(v2Cats),
      'billtracker-schema-version':  '2',
    });
    const { migrationError } = initializeFromStorage(storage);
    expect(migrationError).toBeNull();
    expect(storage.getItem('billtracker-schema-version')).toBe('3');

    const cats = JSON.parse(storage.getItem('billtracker-categories'));
    for (const c of cats) expect(c.flow).toBeTruthy();
    expect(cats.some(c => c.name === 'Paycheck' && c.flow === 'income')).toBe(true);
    expect(cats.some(c => c.name === '401(k)'   && c.flow === 'savings')).toBe(true);
  });

  it('paycheck bill nets to deposit amount; aggregateByMonth splits buckets correctly', () => {
    const cats = [
      { id: 'c_pay',  name: 'Paycheck', flow: 'income'  },
      { id: 'c_tax',  name: 'Taxes',    flow: 'expense' },
      { id: 'c_401k', name: '401(k)',   flow: 'savings' },
      { id: 'c_food', name: 'Groceries', flow: 'expense' },
    ];
    const catsById = new Map(cats.map(c => [c.id, c]));

    const paycheckBill = {
      id: 'b1', vendor: 'Acme', month: '2026-05',
      items: [
        { id: 'i1', description: 'Gross',       amount: 5200, categoryId: 'c_pay',  date: '2026-05-15' },
        { id: 'i2', description: 'Federal tax', amount:  687, categoryId: 'c_tax',  date: '2026-05-15' },
        { id: 'i3', description: '401(k)',      amount:  260, categoryId: 'c_401k', date: '2026-05-15' },
      ],
    };
    const ccBill = {
      id: 'b2', vendor: 'Chase', month: '2026-05',
      items: [
        { id: 'i4', description: 'Whole Foods',        amount:  84, categoryId: 'c_food', date: '2026-05-02' },
        { id: 'i5', description: 'Whole Foods refund', amount: -40, categoryId: 'c_food', date: '2026-05-12' },
      ],
    };

    // Bill nets.
    expect(getBillNet(paycheckBill, catsById).net).toBe(4253);
    expect(getBillNet(ccBill,       catsById).net).toBe(-44);

    // Monthly aggregation.
    const out = aggregateByMonth([paycheckBill, ccBill], '2026-05', catsById);
    const may = out.find(b => b.month === '2026-05');
    expect(may.income).toBe(5200);
    expect(may.spent).toBe(731);   // 687 + 84 - 40
    expect(may.saved).toBe(260);
  });

  it('bi-weekly paycheck across 3 months surfaces in findRecurringCharges with flow=income', () => {
    const cats = [
      { id: 'c_pay', name: 'Paycheck', flow: 'income' },
    ];
    const catsById = new Map(cats.map(c => [c.id, c]));
    const paycheckItem = (idPrefix, date) => ({
      id: `${idPrefix}-g`, description: 'Bi-weekly paycheck',
      amount: 2600, categoryId: 'c_pay', date,
    });
    const bills = [
      { id: 'b1', vendor: 'Acme', month: '2026-03', items: [paycheckItem('b1', '2026-03-15')] },
      { id: 'b2', vendor: 'Acme', month: '2026-04', items: [paycheckItem('b2', '2026-04-15')] },
      { id: 'b3', vendor: 'Acme', month: '2026-05', items: [paycheckItem('b3', '2026-05-15')] },
    ];
    const results = findRecurringCharges(bills, '2026-05', catsById);
    const paycheck = results.find(r => r.description === 'Bi-weekly paycheck');
    expect(paycheck).toBeDefined();
    expect(paycheck.flow).toBe('income');
    expect(paycheck.active).toBe(true);
  });
});
```

- [ ] **Step 2: Run smoke tests**

```bash
npm test -- --run setup.test
# Expected: all 3 tests PASS
```

- [ ] **Step 3: Run full suite**

```bash
npm test -- --run
# Expected: every test PASSES
```

- [ ] **Step 4: Commit**

```bash
git add src/__smoke__/setup.test.jsx
git commit -m "test(itypes): smoke covers migration + bucket math + recurring income"
```

---

### Task 22: Manual browser smoke (developer task)

This is a non-automated verification step. Run through the app in a browser to confirm everything works end-to-end before merging.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Migration test (use existing localStorage data)**

If you've been using the app, you should have v2 data. On first load on this branch, the migration runs automatically. Open DevTools → Application → Local Storage and verify:
- `billtracker-schema-version` is `"3"`
- `billtracker-categories-v2-backup` exists with a `ts` and `categories` array
- `billtracker-categories` includes the 14 new seeds (Paycheck, Zelle In, Dividends, etc.)

- [ ] **Step 3: Stat strip + chart**

- Four cards visible: Income / Spent / Saved / Net
- SpendingChart collapse button works; reload page → state persists
- Resize narrow → 2x2 stat grid on mobile

- [ ] **Step 4: Add a paycheck manually**

- Click "+ Manual"
- Set vendor to "Test Employer", month to current
- Add items:
  - Description "Gross", amount 5200, category "Paycheck" (income flow — should appear under Income optgroup)
  - Description "Federal tax", amount 687, category "Taxes" (under Expense optgroup)
  - Description "401(k)", amount 260, category "401(k)" (under Savings optgroup)
- The bill card header should show "↑ $4,253" in green (5200 − 687 − 260)
- The stat strip should reflect: Income +5200, Spent +687, Saved +260, Net = +4253

- [ ] **Step 5: Add a refund**

- On any expense bill (or add a new one), add an item with category "Groceries"
- Click the "Credit" toggle on that row — the amount flips to negative, row gets green tint
- Bill card net updates accordingly

- [ ] **Step 6: Edit category flow with warning**

- Open Manage Categories
- Pick a category with items (e.g., Groceries)
- Click a different flow option (e.g., Savings)
- Verify the warning dialog appears with the item count
- Cancel → category unchanged
- Re-click → Continue → category re-flows; stat strip and breakdown update

- [ ] **Step 7: Verify no console errors throughout**

If any console error appears during the above steps, stop and investigate before continuing.

---

## Completion checklist

- [ ] All 21 automated tasks committed on `feat/income-transaction-types`
- [ ] Manual browser smoke (Task 22) passes
- [ ] `npm test -- --run` is fully green
- [ ] Spec is the single source of truth — design doc at `docs/superpowers/specs/2026-05-11-income-transaction-types-design.md` matches behavior

After all of the above:
- Decide whether to merge into `feat/categories-as-data` (stacked) or land both into `master` together.
- Don't push to remote unless explicitly approved — confirm intent with the project owner first.
