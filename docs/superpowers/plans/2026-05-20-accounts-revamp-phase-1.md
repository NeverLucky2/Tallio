# Accounts Revamp — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize BillTracker from a month-centric "bills" app into an account-centric ledger: top-level Accounts with types and running balances, per-account chronological registers (Quicken-style bank layout + compact non-bank layout), manual transactions, and scan-into-account — migrating all existing data.

**Architecture:** Replace the nested `bills[].items[]` model with two flat localStorage arrays — `accounts[]` and `transactions[]`. Pure logic (types, balance math, filters, migration) lives in `accountsModel.js` / `accountsMigration.js` and is unit-tested in isolation. A single `useLedger` hook owns persistence and CRUD for both arrays (so undo can snapshot them together). UI is composed from focused components (`AccountList`, `Register`, `TransactionRow`, `TransactionEditor`, `AccountEditor`). Transfers (Phase 2) and Reports (Phase 3) are out of scope.

**Tech Stack:** React 19, Vite 7, Vitest 4 + @testing-library/react (jsdom), nanoid, fflate (export). Tests: `src/**/*.test.{js,jsx}`. Run a single file with `npx vitest run <path>`.

---

## Scope

**In scope (Phase 1):** Account entity + 7 types + classification; running balances + household roll-ups; register filters; v3→v4 migration (vendors → untyped accounts); `useLedger` hook; account-list screen + household strip; bank + compact register layouts (desktop + mobile); manual transaction add/edit/delete; account create + type assignment + opening balance; scan flattens into a chosen account; export v4. Remove the monthly dashboard (stat cards, 12-month spending chart), tracked-keywords sidebar, and recurring auto-spawn (chains/conflicts/catch-up/tip dialogs) and the old month-based Reports screen.

**Out of scope:** Transfers (Phase 2), Trend/Composition Reports and investment value snapshots (Phase 3).

> **Sign convention (used throughout):** `transaction.amount` is a **signed delta** to the owning account's balance. Expenses/savings are negative, income is positive. A liability account therefore carries a **negative** balance (= owed). `flowSign(flow)` returns `+1` for income, `−1` otherwise. Net worth includes only `asset`/`liability` accounts; `person`/`untyped` are excluded.

---

## File Structure

**Create:**
- `src/accountsModel.js` — pure: `ACCOUNT_TYPES`, `GROUP_ORDER`, `accountClass`, `layoutFor`, `groupFor`, `isOnBalanceSheet`, `flowSign`, `accountBalance`, `computeRegister`, `householdTotals`, `filterTransactions`.
- `src/accountsModel.test.js`
- `src/accountsMigration.js` — pure: `migrateToV4(bills, categories) → { accounts, transactions }`.
- `src/accountsMigration.test.js`
- `src/useLedger.js` — hook: load/persist `accounts` + `transactions`; CRUD; `snapshot`/`restore` for undo.
- `src/useLedger.test.jsx`
- `src/AccountList.jsx` — sidebar (household strip + accounts grouped by type with balances) and `+ Add account`.
- `src/AccountList.test.jsx`
- `src/TransactionRow.jsx` — one register row, bank vs compact layout, desktop + mobile.
- `src/TransactionRow.test.jsx`
- `src/Register.jsx` — selected account header, filter bar, column headers, rows.
- `src/Register.test.jsx`
- `src/TransactionEditor.jsx` — add/edit modal (delete inside).
- `src/TransactionEditor.test.jsx`
- `src/AccountEditor.jsx` — create account / assign type / set opening balance / rename / delete.
- `src/AccountEditor.test.jsx`

**Modify:**
- `src/initializeFromStorage.js` — add v3→v4 step; drop catch-up; return `{ accounts, transactions, migrationError }`.
- `src/initializeFromStorage.test.js` — update for v4 return shape.
- `src/exportArchive.js` — export accounts + transactions; `schemaVersion` 4.
- `src/exportArchive.test.js` — update (create if your repo lacks it; the smoke test currently covers `buildArchive`).
- `src/App.jsx` — rewire to account-centric shell; remove month/bills UI + recurring + tracked keywords.
- `src/__smoke__/setup.test.jsx` — replace bills/recurring assertions with a migration→ledger→export smoke.

**Delete (Task 14):** `SpendingChart.jsx` (+test), `ReportsScreen.jsx` (+test), `reportingMath.js` (+test), `RecurringPanels.test.jsx`, `RecurringConflictDialog.jsx` (+test), `RecurringTipDialog.jsx` (+test), `DuplicateBillDialog.jsx` (+test), `BillItem.jsx` (+test). Keep `spendingMath.js` (migration helpers `getItemDate`/`getPrimaryMonth` are reused; prune only after Phase 3).

---

## Task 1: Account types & classification (pure)

**Files:**
- Create: `src/accountsModel.js`
- Test: `src/accountsModel.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/accountsModel.test.js
import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_TYPES, GROUP_ORDER, accountClass, layoutFor, groupFor,
  isOnBalanceSheet, flowSign,
} from './accountsModel.js';

describe('account types & classification', () => {
  it('exposes the 7 Phase-1 types', () => {
    expect(Object.keys(ACCOUNT_TYPES).sort()).toEqual(
      ['bank', 'credit_card', 'investment', 'loan', 'mortgage', 'person', 'untyped'].sort()
    );
  });

  it('classifies asset / liability / off-sheet', () => {
    expect(accountClass('bank')).toBe('asset');
    expect(accountClass('investment')).toBe('asset');
    expect(accountClass('credit_card')).toBe('liability');
    expect(accountClass('mortgage')).toBe('liability');
    expect(accountClass('person')).toBe('offsheet');
    expect(accountClass('untyped')).toBe('offsheet');
    expect(accountClass('nonsense')).toBe('offsheet'); // safe fallback
  });

  it('only bank uses the bank register layout', () => {
    expect(layoutFor('bank')).toBe('bank');
    expect(layoutFor('credit_card')).toBe('compact');
    expect(layoutFor('untyped')).toBe('compact');
  });

  it('isOnBalanceSheet is true for assets and liabilities only', () => {
    expect(isOnBalanceSheet('bank')).toBe(true);
    expect(isOnBalanceSheet('mortgage')).toBe(true);
    expect(isOnBalanceSheet('person')).toBe(false);
    expect(isOnBalanceSheet('untyped')).toBe(false);
  });

  it('groupFor maps to a header in GROUP_ORDER', () => {
    expect(GROUP_ORDER).toContain(groupFor('bank'));
    expect(groupFor('loan')).toBe('Credit cards & loans');
  });

  it('flowSign: income positive, everything else negative', () => {
    expect(flowSign('income')).toBe(1);
    expect(flowSign('expense')).toBe(-1);
    expect(flowSign('savings')).toBe(-1);
    expect(flowSign(undefined)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/accountsModel.test.js`
Expected: FAIL — `Failed to resolve import "./accountsModel.js"`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/accountsModel.js

// Account type registry. `klass` drives net-worth inclusion; `layout` drives
// which register columns render; `group` is the sidebar section header.
export const ACCOUNT_TYPES = {
  bank:        { label: 'Bank / Cash',       klass: 'asset',     layout: 'bank',    group: 'Cash & Bank' },
  investment:  { label: 'Investments',       klass: 'asset',     layout: 'compact', group: 'Investments' },
  credit_card: { label: 'Credit card',       klass: 'liability', layout: 'compact', group: 'Credit cards & loans' },
  loan:        { label: 'Loan',              klass: 'liability', layout: 'compact', group: 'Credit cards & loans' },
  mortgage:    { label: 'Mortgage',          klass: 'liability', layout: 'compact', group: 'Credit cards & loans' },
  person:      { label: 'Person / External', klass: 'offsheet',  layout: 'compact', group: 'People & external' },
  untyped:     { label: 'Unassigned',        klass: 'offsheet',  layout: 'compact', group: 'Unassigned' },
};

export const GROUP_ORDER = [
  'Cash & Bank', 'Investments', 'Credit cards & loans', 'People & external', 'Unassigned',
];

const typeOrFallback = (type) => ACCOUNT_TYPES[type] || ACCOUNT_TYPES.untyped;

export function accountClass(type) { return typeOrFallback(type).klass; }
export function layoutFor(type)    { return typeOrFallback(type).layout; }
export function groupFor(type)     { return typeOrFallback(type).group; }

export function isOnBalanceSheet(type) {
  const k = accountClass(type);
  return k === 'asset' || k === 'liability';
}

// Flow → sign of the balance delta. Income raises the holding account; expense
// and savings lower it. Used by migration and the transaction editor to convert
// a magnitude + category flow into a signed `amount`.
export function flowSign(flow) {
  return flow === 'income' ? 1 : -1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/accountsModel.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/accountsModel.js src/accountsModel.test.js
git commit -m "feat(accounts): account types and classification helpers"
```

---

## Task 2: Balances, household roll-ups, register computation (pure)

**Files:**
- Modify: `src/accountsModel.js`
- Test: `src/accountsModel.test.js`

- [ ] **Step 1: Write the failing test (append to the existing test file)**

```js
// append to src/accountsModel.test.js
import { accountBalance, computeRegister, householdTotals } from './accountsModel.js';

describe('balance math', () => {
  const checking = { id: 'a_chk', type: 'bank', openingBalance: 1000 };
  const card     = { id: 'a_cc',  type: 'credit_card', openingBalance: 0 };
  const txns = [
    { id: 't1', accountId: 'a_chk', date: '2026-05-01', amount:  3200 }, // paycheck
    { id: 't2', accountId: 'a_chk', date: '2026-04-15', amount:  -96.30 }, // electric
    { id: 't3', accountId: 'a_cc',  date: '2026-05-05', amount:  -96.20 }, // charge
    { id: 't4', accountId: 'a_cc',  date: '2026-04-02', amount:  -15.99 }, // charge
  ];

  it('accountBalance = opening + Σ amounts for that account', () => {
    expect(accountBalance(checking, txns)).toBeCloseTo(1000 + 3200 - 96.30, 2);
    expect(accountBalance(card, txns)).toBeCloseTo(-112.19, 2);
  });

  it('computeRegister returns oldest→newest with running balance after each row', () => {
    const rows = computeRegister(checking, txns);
    expect(rows.map(r => r.id)).toEqual(['t2', 't1']); // Apr 15 then May 1
    expect(rows[0].balance).toBeCloseTo(903.70, 2);    // 1000 - 96.30
    expect(rows[1].balance).toBeCloseTo(4103.70, 2);   // + 3200
  });

  it('computeRegister breaks same-day ties by array order', () => {
    const acct = { id: 'x', type: 'bank', openingBalance: 0 };
    const same = [
      { id: 'first',  accountId: 'x', date: '2026-05-10', amount: 10 },
      { id: 'second', accountId: 'x', date: '2026-05-10', amount: 5 },
    ];
    const rows = computeRegister(acct, same);
    expect(rows.map(r => r.id)).toEqual(['first', 'second']);
    expect(rows[1].balance).toBe(15);
  });

  it('householdTotals: net worth excludes person/untyped; owed is positive', () => {
    const accounts = [
      checking, card,
      { id: 'a_mom', type: 'person',  openingBalance: 0 },
      { id: 'a_u',   type: 'untyped', openingBalance: 500 },
    ];
    const withMom = [...txns, { id: 't5', accountId: 'a_mom', date: '2026-05-01', amount: -1100 }];
    const totals = householdTotals(accounts, withMom);
    expect(totals.assets).toBeCloseTo(4103.70, 2);    // checking only
    expect(totals.owed).toBeCloseTo(112.19, 2);        // |card|
    expect(totals.netWorth).toBeCloseTo(4103.70 - 112.19, 2); // mom + untyped excluded
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/accountsModel.test.js`
Expected: FAIL — `accountBalance is not a function` (not yet exported).

- [ ] **Step 3: Write minimal implementation (append to `src/accountsModel.js`)**

```js
// append to src/accountsModel.js

const opening = (account) =>
  Number.isFinite(account && account.openingBalance) ? account.openingBalance : 0;

export function accountBalance(account, transactions) {
  let bal = opening(account);
  for (const t of transactions || []) {
    if (t && t.accountId === account.id && Number.isFinite(t.amount)) bal += t.amount;
  }
  return bal;
}

// Transactions for one account, sorted oldest→newest (date asc; array order for
// same-day ties), each annotated with the running balance after it. Reverse for
// newest-first display.
export function computeRegister(account, transactions) {
  const mine = (transactions || [])
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t && t.accountId === account.id);
  mine.sort((a, b) => {
    const da = a.t.date || '', db = b.t.date || '';
    if (da !== db) return da < db ? -1 : 1;
    return a.i - b.i;
  });
  let bal = opening(account);
  return mine.map(({ t }) => {
    bal += Number.isFinite(t.amount) ? t.amount : 0;
    return { ...t, balance: bal };
  });
}

// Household roll-ups. netWorth = Σ on-balance-sheet balances; assets = Σ asset
// balances; owed = Σ |negative liability balances|. person/untyped excluded.
export function householdTotals(accounts, transactions) {
  let netWorth = 0, assets = 0, owed = 0;
  for (const a of accounts || []) {
    const k = accountClass(a.type);
    if (k === 'asset') {
      const b = accountBalance(a, transactions);
      assets += b; netWorth += b;
    } else if (k === 'liability') {
      const b = accountBalance(a, transactions);
      owed += Math.abs(Math.min(0, b)); netWorth += b;
    }
  }
  return { netWorth, assets, owed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/accountsModel.test.js`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/accountsModel.js src/accountsModel.test.js
git commit -m "feat(accounts): balance math and household roll-ups"
```

---

## Task 3: Register filtering (pure)

**Files:**
- Modify: `src/accountsModel.js`
- Test: `src/accountsModel.test.js`

- [ ] **Step 1: Write the failing test (append)**

```js
// append to src/accountsModel.test.js
import { filterTransactions } from './accountsModel.js';

describe('filterTransactions', () => {
  const catsById = new Map([['c_util', { id: 'c_util', name: 'Utilities' }]]);
  const rows = [
    { id: 'r1', date: '2026-05-05', description: 'Walmart',  payee: '',        categoryId: 'c_shop', amount: -96.20 },
    { id: 'r2', date: '2026-04-15', description: 'Electric', payee: 'ComEd',   categoryId: 'c_util', amount: -96.30 },
    { id: 'r3', date: '2026-04-02', description: 'Netflix',  payee: '',        categoryId: 'c_sub',  amount: -15.99 },
  ];

  it('no filters → all rows', () => {
    expect(filterTransactions(rows, {}, catsById)).toHaveLength(3);
  });
  it('month filter keeps only that YYYY-MM', () => {
    expect(filterTransactions(rows, { month: '2026-04' }, catsById).map(r => r.id)).toEqual(['r2', 'r3']);
  });
  it('category filter matches categoryId', () => {
    expect(filterTransactions(rows, { categoryId: 'c_util' }, catsById).map(r => r.id)).toEqual(['r2']);
  });
  it('search matches description, payee, category name, or amount', () => {
    expect(filterTransactions(rows, { search: 'comed' }, catsById).map(r => r.id)).toEqual(['r2']);
    expect(filterTransactions(rows, { search: 'utilities' }, catsById).map(r => r.id)).toEqual(['r2']);
    expect(filterTransactions(rows, { search: 'walmart' }, catsById).map(r => r.id)).toEqual(['r1']);
    expect(filterTransactions(rows, { search: '15.99' }, catsById).map(r => r.id)).toEqual(['r3']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/accountsModel.test.js`
Expected: FAIL — `filterTransactions is not a function`.

- [ ] **Step 3: Write minimal implementation (append to `src/accountsModel.js`)**

```js
// append to src/accountsModel.js

// Filter register rows by search term, month (YYYY-MM), and/or categoryId.
// Search matches description, payee, category name, or (approx) amount.
export function filterTransactions(rows, { search = '', month = null, categoryId = null } = {}, categoriesById = null) {
  const term = (search || '').trim().toLowerCase();
  const num = parseFloat(term);
  return (rows || []).filter(r => {
    if (month && (r.date || '').slice(0, 7) !== month) return false;
    if (categoryId && r.categoryId !== categoryId) return false;
    if (!term) return true;
    if ((r.description || '').toLowerCase().includes(term)) return true;
    if ((r.payee || '').toLowerCase().includes(term)) return true;
    const cat = categoriesById && categoriesById.get(r.categoryId);
    if (cat && (cat.name || '').toLowerCase().includes(term)) return true;
    if (Number.isFinite(num) && Math.abs((r.amount || 0) - num) < 0.01) return true;
    return false;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/accountsModel.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/accountsModel.js src/accountsModel.test.js
git commit -m "feat(accounts): register filtering"
```

---

## Task 4: v3→v4 migration (vendors → accounts) (pure)

**Files:**
- Create: `src/accountsMigration.js`
- Test: `src/accountsMigration.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/accountsMigration.test.js
import { describe, it, expect } from 'vitest';
import { migrateToV4 } from './accountsMigration.js';

const categories = [
  { id: 'c_food', name: 'Groceries', flow: 'expense' },
  { id: 'c_pay',  name: 'Paycheck',  flow: 'income'  },
];

describe('migrateToV4', () => {
  it('each distinct vendor becomes one untyped account', () => {
    const bills = [
      { id: 'b1', vendor: 'Mastercard', month: '2026-05', items: [
        { id: 'i1', description: 'Costco', amount: 182.40, categoryId: 'c_food', date: '2026-05-03' },
      ]},
      { id: 'b2', vendor: 'Mastercard', month: '2026-04', items: [
        { id: 'i2', description: 'Netflix', amount: 15.99, categoryId: 'c_food', date: '2026-04-02' },
      ]},
      { id: 'b3', vendor: 'Chase', month: '2026-05', items: [
        { id: 'i3', description: 'Paycheck', amount: 3200, categoryId: 'c_pay', date: '2026-05-01' },
      ]},
    ];
    const { accounts, transactions } = migrateToV4(bills, categories);
    expect(accounts.map(a => a.name).sort()).toEqual(['Chase', 'Mastercard']);
    for (const a of accounts) {
      expect(a.type).toBe('untyped');
      expect(a.openingBalance).toBe(0);
      expect(typeof a.id).toBe('string');
    }
    // Two Mastercard bills merge into one account's register.
    const mc = accounts.find(a => a.name === 'Mastercard');
    expect(transactions.filter(t => t.accountId === mc.id)).toHaveLength(2);
  });

  it('converts amounts to SIGNED deltas via flowSign', () => {
    const bills = [
      { id: 'b1', vendor: 'Chase', month: '2026-05', items: [
        { id: 'i1', description: 'Groceries', amount: 84,   categoryId: 'c_food', date: '2026-05-02' }, // expense → -84
        { id: 'i2', description: 'Paycheck',  amount: 3200, categoryId: 'c_pay',  date: '2026-05-01' }, // income  → +3200
      ]},
    ];
    const { transactions } = migrateToV4(bills, categories);
    const byDesc = Object.fromEntries(transactions.map(t => [t.description, t.amount]));
    expect(byDesc['Groceries']).toBe(-84);
    expect(byDesc['Paycheck']).toBe(3200);
  });

  it('preserves dates; dateless items fall back to the bill anchor month', () => {
    const bills = [
      { id: 'b1', vendor: 'Chase', month: '2026-02', items: [
        { id: 'i1', description: 'Dateless', amount: 10, categoryId: 'c_food', date: null },
      ]},
    ];
    const { transactions } = migrateToV4(bills, categories);
    expect(transactions[0].date).toBe('2026-02-01');
    expect(transactions[0].payee).toBeNull();
    expect(transactions[0].checkNumber).toBeNull();
    expect(transactions[0].transferId).toBeNull();
  });

  it('empty / missing input → empty arrays', () => {
    expect(migrateToV4([], categories)).toEqual({ accounts: [], transactions: [] });
    expect(migrateToV4(undefined, categories)).toEqual({ accounts: [], transactions: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/accountsMigration.test.js`
Expected: FAIL — `Failed to resolve import "./accountsMigration.js"`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/accountsMigration.js
import { nanoid } from 'nanoid';
import { getItemDate } from './spendingMath.js';
import { flowSign } from './accountsModel.js';

// One-time v3 → v4 conversion. Each distinct vendor name becomes one `untyped`
// account; each bill item becomes a flat transaction with a SIGNED amount
// (flowSign(category.flow) * item.amount). Pure; vendor matching is
// case-insensitive so monthly statements for the same card merge.
export function migrateToV4(bills, categories) {
  const catsById = new Map((categories || []).map(c => [c.id, c]));
  const byName = new Map();
  const accounts = [];
  const transactions = [];

  const ensureAccount = (vendor) => {
    const name = (vendor && String(vendor).trim()) || 'Unnamed';
    const key = name.toLowerCase();
    if (byName.has(key)) return byName.get(key);
    const acct = { id: nanoid(8), name, icon: '🏦', type: 'untyped', openingBalance: 0 };
    accounts.push(acct);
    byName.set(key, acct);
    return acct;
  };

  for (const bill of bills || []) {
    if (!bill || !Array.isArray(bill.items)) continue;
    const acct = ensureAccount(bill.vendor);
    for (const item of bill.items) {
      if (!item) continue;
      const amt = Number.isFinite(item.amount) ? item.amount : 0;
      const cat = catsById.get(item.categoryId);
      const flow = (cat && cat.flow) || 'expense';
      transactions.push({
        id: nanoid(8),
        accountId: acct.id,
        date: getItemDate(bill, item),
        amount: flowSign(flow) * amt,
        categoryId: item.categoryId,
        description: item.description || '',
        payee: null,
        checkNumber: null,
        transferId: null,
      });
    }
  }
  return { accounts, transactions };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/accountsMigration.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/accountsMigration.js src/accountsMigration.test.js
git commit -m "feat(accounts): v3 to v4 migration converting vendors to untyped accounts"
```

---

## Task 5: Wire migration into initializeFromStorage; drop catch-up

**Files:**
- Modify: `src/initializeFromStorage.js`
- Test: `src/initializeFromStorage.test.js`

- [ ] **Step 1: Replace the test file**

`migrateBills`/v2/v3 still run to normalize categories; the new return is `{ accounts, transactions, migrationError }`. Recurring catch-up is gone.

```js
// src/initializeFromStorage.test.js
import { describe, it, expect } from 'vitest';
import { initializeFromStorage } from './initializeFromStorage.js';

function makeFakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
    _dump: () => ({ ...store }),
  };
}

describe('initializeFromStorage (v4 accounts)', () => {
  it('fresh install: empty accounts + transactions, schema 4, seed categories', () => {
    const storage = makeFakeStorage();
    const out = initializeFromStorage(storage);
    expect(out.migrationError).toBeNull();
    expect(out.accounts).toEqual([]);
    expect(out.transactions).toEqual([]);
    expect(storage.getItem('billtracker-schema-version')).toBe('4');
    const cats = JSON.parse(storage.getItem('billtracker-categories'));
    expect(cats.length).toBeGreaterThan(0);
  });

  it('migrates legacy v1 bills all the way to v4 accounts', () => {
    const v1Bills = [
      { id: 'b1', vendor: 'Mastercard', month: '2026-04', items: [
        { id: 'i1', description: 'Costco', amount: 50, category: 'Groceries', date: '2026-04-03' },
      ]},
    ];
    const storage = makeFakeStorage({ 'billtracker-bills': JSON.stringify(v1Bills) });
    const out = initializeFromStorage(storage);
    expect(out.migrationError).toBeNull();
    expect(out.accounts).toHaveLength(1);
    expect(out.accounts[0].name).toBe('Mastercard');
    expect(out.accounts[0].type).toBe('untyped');
    expect(out.transactions).toHaveLength(1);
    expect(out.transactions[0].amount).toBe(-50); // expense → negative delta

    // Persisted under the new keys + version bumped.
    expect(JSON.parse(storage.getItem('billtracker-accounts'))).toHaveLength(1);
    expect(JSON.parse(storage.getItem('billtracker-transactions'))).toHaveLength(1);
    expect(storage.getItem('billtracker-schema-version')).toBe('4');

    // Pre-accounts backup written once.
    const backup = JSON.parse(storage.getItem('billtracker-pre-accounts-backup'));
    expect(backup.bills).toBeTruthy();
    expect(backup.ts).toBeTruthy();
  });

  it('idempotent: re-running on v4 storage does not double-migrate', () => {
    const storage = makeFakeStorage({
      'billtracker-accounts': JSON.stringify([{ id: 'a1', name: 'Chase', type: 'bank', icon: '🏦', openingBalance: 0 }]),
      'billtracker-transactions': JSON.stringify([{ id: 't1', accountId: 'a1', date: '2026-05-01', amount: 100, categoryId: 'c', description: 'x', payee: null, checkNumber: null, transferId: null }]),
      'billtracker-categories': JSON.stringify([{ id: 'c', name: 'Other', flow: 'expense', icon: '📋', color: '#6B7280', keywords: [], templates: [], builtin: true }]),
      'billtracker-schema-version': '4',
    });
    const out = initializeFromStorage(storage);
    expect(out.accounts).toHaveLength(1);
    expect(out.transactions).toHaveLength(1);
    expect(out.transactions[0].amount).toBe(100); // untouched
  });

  it('migration failure with backup → recovered flag, empty ledger', () => {
    const storage = makeFakeStorage({
      'billtracker-bills': '{ this is not json',
      'billtracker-pre-accounts-backup': JSON.stringify({ ts: 't', bills: [] }),
    });
    const out = initializeFromStorage(storage);
    expect(out.migrationError).not.toBeNull();
    expect(out.accounts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/initializeFromStorage.test.js`
Expected: FAIL — return has `bills`/`conflicts`, not `accounts`/`transactions`; no `billtracker-accounts` key.

- [ ] **Step 3: Rewrite `src/initializeFromStorage.js`**

```js
// src/initializeFromStorage.js
import { migrateBills, migrateToV2, migrateToV3 } from './spendingMath.js';
import { migrateToV4 } from './accountsMigration.js';
import { DEFAULT_CATEGORIES, V3_SEED_CATEGORIES } from './categoriesDefaults.js';

const BILLS_KEY          = 'billtracker-bills';
const CATS_KEY           = 'billtracker-categories';
const ACCOUNTS_KEY       = 'billtracker-accounts';
const TXN_KEY            = 'billtracker-transactions';
const VERSION_KEY        = 'billtracker-schema-version';
const V1_BACKUP_KEY      = 'billtracker-pre-categories-backup';
const V2_CATS_BACKUP_KEY = 'billtracker-categories-v2-backup';
const V3_BILLS_BACKUP_KEY = 'billtracker-pre-accounts-backup';

// Returns { accounts, transactions, migrationError }.
// migrationError is null on success, or { message, recovered } on failure.
export function initializeFromStorage(storage) {
  try {
    const ver = parseInt(storage.getItem(VERSION_KEY) || '1', 10);

    // Already on v4 — load directly, no migration.
    if (ver >= 4) {
      return {
        accounts: JSON.parse(storage.getItem(ACCOUNTS_KEY) || '[]'),
        transactions: JSON.parse(storage.getItem(TXN_KEY) || '[]'),
        migrationError: null,
      };
    }

    const rawBills = storage.getItem(BILLS_KEY);
    const rawCats  = storage.getItem(CATS_KEY);
    const v1Bills = rawBills ? migrateBills(JSON.parse(rawBills)) : [];
    const existingCats = rawCats ? JSON.parse(rawCats) : null;

    // v1 → v2 backup (existing behavior).
    if (ver < 2 && rawBills && !storage.getItem(V1_BACKUP_KEY)) {
      storage.setItem(V1_BACKUP_KEY, JSON.stringify({ ts: new Date().toISOString(), bills: v1Bills }));
    }
    const { bills: v2Bills, categories: v2Cats } = migrateToV2(v1Bills, existingCats, DEFAULT_CATEGORIES);

    // v2 → v3 category backup (existing behavior).
    if (ver < 3 && rawCats && !storage.getItem(V2_CATS_BACKUP_KEY)) {
      storage.setItem(V2_CATS_BACKUP_KEY, JSON.stringify({ ts: new Date().toISOString(), categories: existingCats }));
    }
    const { bills: v3Bills, categories: v3Cats } = migrateToV3(v2Bills, v2Cats, V3_SEED_CATEGORIES);

    // Persist normalized categories (needed regardless of prior version < 4).
    storage.setItem(CATS_KEY, JSON.stringify(v3Cats));

    // v3 → v4: one-time backup of bills, then convert to accounts + transactions.
    if (rawBills && !storage.getItem(V3_BILLS_BACKUP_KEY)) {
      storage.setItem(V3_BILLS_BACKUP_KEY, JSON.stringify({ ts: new Date().toISOString(), bills: v3Bills }));
    }
    const { accounts, transactions } = migrateToV4(v3Bills, v3Cats);

    storage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    storage.setItem(TXN_KEY, JSON.stringify(transactions));
    storage.setItem(VERSION_KEY, '4');
    // Legacy bills key is retained (untouched) so the backup path stays intact.

    return { accounts, transactions, migrationError: null };
  } catch (e) {
    console.error('Migration failed:', e);
    return {
      accounts: [],
      transactions: [],
      migrationError: {
        message: 'Migration failed — please use Export from a previous version to save a copy, then reload.',
        recovered: !!storage.getItem(V3_BILLS_BACKUP_KEY) || !!storage.getItem(V1_BACKUP_KEY),
      },
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/initializeFromStorage.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/initializeFromStorage.js src/initializeFromStorage.test.js
git commit -m "feat(accounts): v4 migration wiring; drop recurring catch-up"
```

---

## Task 6: useLedger hook (accounts + transactions + persistence + CRUD)

**Files:**
- Create: `src/useLedger.js`
- Test: `src/useLedger.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// src/useLedger.test.jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLedger from './useLedger.js';

beforeEach(() => localStorage.clear());

const seed = {
  accounts: [{ id: 'a1', name: 'Chase', type: 'bank', icon: '🏦', openingBalance: 100 }],
  transactions: [{ id: 't1', accountId: 'a1', date: '2026-05-01', amount: 50, categoryId: 'c', description: 'x', payee: null, checkNumber: null, transferId: null }],
};

describe('useLedger', () => {
  it('hydrates from the provided initial value', () => {
    const { result } = renderHook(() => useLedger(seed));
    expect(result.current.accounts).toHaveLength(1);
    expect(result.current.transactions).toHaveLength(1);
  });

  it('addAccount appends with a fresh id and returns it', () => {
    const { result } = renderHook(() => useLedger(seed));
    let id;
    act(() => { id = result.current.addAccount({ name: 'Mastercard', type: 'credit_card', icon: '💳' }); });
    const created = result.current.accounts.find(a => a.id === id);
    expect(created.name).toBe('Mastercard');
    expect(created.openingBalance).toBe(0);
  });

  it('updateAccount patches without changing id; deleteAccount removes account AND its transactions', () => {
    const { result } = renderHook(() => useLedger(seed));
    act(() => { result.current.updateAccount('a1', { type: 'credit_card', name: 'Chase Visa' }); });
    expect(result.current.accounts[0].type).toBe('credit_card');
    expect(result.current.accounts[0].id).toBe('a1');
    act(() => { result.current.deleteAccount('a1'); });
    expect(result.current.accounts).toHaveLength(0);
    expect(result.current.transactions).toHaveLength(0);
  });

  it('transaction CRUD works and persists to localStorage', () => {
    const { result } = renderHook(() => useLedger(seed));
    let tid;
    act(() => { tid = result.current.addTransaction({ accountId: 'a1', date: '2026-05-05', amount: -20, categoryId: 'c', description: 'Coffee' }); });
    expect(result.current.transactions).toHaveLength(2);
    act(() => { result.current.updateTransaction(tid, { amount: -25 }); });
    expect(result.current.transactions.find(t => t.id === tid).amount).toBe(-25);
    act(() => { result.current.deleteTransaction(tid); });
    expect(result.current.transactions).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem('billtracker-transactions'))).toHaveLength(1);
  });

  it('snapshot/restore round-trips for undo', () => {
    const { result } = renderHook(() => useLedger(seed));
    let snap;
    act(() => { snap = result.current.snapshot(); });
    act(() => { result.current.addTransaction({ accountId: 'a1', date: '2026-05-09', amount: -9, categoryId: 'c', description: 'Y' }); });
    expect(result.current.transactions).toHaveLength(2);
    act(() => { result.current.restore(snap); });
    expect(result.current.transactions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useLedger.test.jsx`
Expected: FAIL — `Failed to resolve import "./useLedger.js"`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/useLedger.js
import { useState, useCallback, useEffect } from 'react';
import { nanoid } from 'nanoid';

const ACCOUNTS_KEY = 'billtracker-accounts';
const TXN_KEY = 'billtracker-transactions';

// Owns the two flat arrays so undo can snapshot/restore them together.
// `initial` comes from initializeFromStorage: { accounts, transactions }.
export default function useLedger(initial = { accounts: [], transactions: [] }) {
  const [accounts, setAccounts] = useState(initial.accounts || []);
  const [transactions, setTransactions] = useState(initial.transactions || []);
  const [storageError, setStorageError] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
      localStorage.setItem(TXN_KEY, JSON.stringify(transactions));
      if (storageError) setStorageError(null);
    } catch (e) {
      console.error('Failed to save ledger:', e);
      setStorageError({ message: "Couldn't save — storage full." });
    }
  }, [accounts, transactions]); // eslint-disable-line react-hooks/exhaustive-deps

  const addAccount = useCallback(({ name, type = 'untyped', icon = '🏦', openingBalance = 0 }) => {
    const id = nanoid(8);
    setAccounts(prev => [...prev, { id, name: (name || '').trim(), type, icon, openingBalance: Number(openingBalance) || 0 }]);
    return id;
  }, []);

  const updateAccount = useCallback((id, patch) => {
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, ...patch, id: a.id } : a));
  }, []);

  const deleteAccount = useCallback((id) => {
    setAccounts(prev => prev.filter(a => a.id !== id));
    setTransactions(prev => prev.filter(t => t.accountId !== id));
  }, []);

  const addTransaction = useCallback((txn) => {
    const id = nanoid(8);
    setTransactions(prev => [...prev, {
      id,
      accountId: txn.accountId,
      date: txn.date,
      amount: Number.isFinite(txn.amount) ? txn.amount : 0,
      categoryId: txn.categoryId,
      description: txn.description || '',
      payee: txn.payee ?? null,
      checkNumber: txn.checkNumber ?? null,
      transferId: txn.transferId ?? null,
    }]);
    return id;
  }, []);

  const updateTransaction = useCallback((id, patch) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...patch, id: t.id } : t));
  }, []);

  const deleteTransaction = useCallback((id) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  }, []);

  const snapshot = useCallback(() => ({ accounts, transactions }), [accounts, transactions]);
  const restore = useCallback((snap) => {
    if (!snap) return;
    setAccounts(snap.accounts || []);
    setTransactions(snap.transactions || []);
  }, []);

  const clearStorageError = useCallback(() => setStorageError(null), []);

  return {
    accounts, transactions,
    addAccount, updateAccount, deleteAccount,
    addTransaction, updateTransaction, deleteTransaction,
    snapshot, restore,
    storageError, clearStorageError,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useLedger.test.jsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/useLedger.js src/useLedger.test.jsx
git commit -m "feat(accounts): useLedger hook for accounts + transactions"
```

---

## Task 7: AccountList sidebar + household strip

**Files:**
- Create: `src/AccountList.jsx`
- Test: `src/AccountList.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// src/AccountList.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountList from './AccountList.jsx';

const accounts = [
  { id: 'a_chk', name: 'Chase Checking', type: 'bank', icon: '🏦', openingBalance: 1000 },
  { id: 'a_cc',  name: 'Mastercard',     type: 'credit_card', icon: '💳', openingBalance: 0 },
  { id: 'a_mom', name: 'Mom (Rent)',     type: 'person', icon: '👩', openingBalance: 0 },
];
const transactions = [
  { id: 't1', accountId: 'a_chk', date: '2026-05-01', amount: 200 },
  { id: 't2', accountId: 'a_cc',  date: '2026-05-02', amount: -150 },
];

describe('AccountList', () => {
  it('renders group headers, account names, and the household strip', () => {
    render(<AccountList accounts={accounts} transactions={transactions} selectedId="a_chk" onSelect={() => {}} onAddAccount={() => {}} />);
    expect(screen.getByText('Cash & Bank')).toBeTruthy();
    expect(screen.getByText('Credit cards & loans')).toBeTruthy();
    expect(screen.getByText('People & external')).toBeTruthy();
    expect(screen.getByText('Chase Checking')).toBeTruthy();
    expect(screen.getByText(/Net worth/i)).toBeTruthy();
  });

  it('fires onSelect when an account is clicked', async () => {
    const onSelect = vi.fn();
    render(<AccountList accounts={accounts} transactions={transactions} selectedId="a_chk" onSelect={onSelect} onAddAccount={() => {}} />);
    await userEvent.click(screen.getByText('Mastercard'));
    expect(onSelect).toHaveBeenCalledWith('a_cc');
  });

  it('fires onAddAccount from the add button', async () => {
    const onAddAccount = vi.fn();
    render(<AccountList accounts={accounts} transactions={transactions} selectedId={null} onSelect={() => {}} onAddAccount={onAddAccount} />);
    await userEvent.click(screen.getByRole('button', { name: /add account/i }));
    expect(onAddAccount).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/AccountList.test.jsx`
Expected: FAIL — cannot resolve `./AccountList.jsx`.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/AccountList.jsx
import React, { useMemo } from 'react';
import { ACCOUNT_TYPES, GROUP_ORDER, groupFor, accountClass, accountBalance, householdTotals } from './accountsModel.js';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function AccountList({ accounts, transactions, selectedId, onSelect, onAddAccount }) {
  const totals = useMemo(() => householdTotals(accounts, transactions), [accounts, transactions]);

  const grouped = useMemo(() => {
    const map = new Map(GROUP_ORDER.map(g => [g, []]));
    for (const a of accounts) {
      const g = groupFor(a.type);
      (map.get(g) || map.get('Unassigned')).push(a);
    }
    return map;
  }, [accounts]);

  return (
    <div className="account-list">
      <div className="household-strip">
        <div className="household-stat">
          <span className="household-label">Net worth</span>
          <strong className={totals.netWorth >= 0 ? 'pos' : 'neg'}>{fmt(totals.netWorth)}</strong>
        </div>
        <div className="household-stat">
          <span className="household-label">Cash + investments</span>
          <strong>{fmt(totals.assets)}</strong>
        </div>
        <div className="household-stat">
          <span className="household-label">You owe</span>
          <strong className="neg">{fmt(totals.owed)}</strong>
        </div>
      </div>

      {GROUP_ORDER.map(group => {
        const list = grouped.get(group) || [];
        if (list.length === 0) return null;
        return (
          <div key={group} className="account-group">
            <div className="account-group-label">{group}</div>
            {list.map(a => {
              const bal = accountBalance(a, transactions);
              const klass = accountClass(a.type);
              const display = klass === 'liability' ? -Math.abs(bal) : bal;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`account-row${a.id === selectedId ? ' account-row-selected' : ''}`}
                  onClick={() => onSelect(a.id)}
                >
                  <span className="account-row-name">{a.icon} {a.name}</span>
                  <span className={`account-row-balance${display < 0 ? ' neg' : ''}`}>{fmt(display)}</span>
                </button>
              );
            })}
          </div>
        );
      })}

      <button type="button" className="account-add" onClick={onAddAccount} aria-label="Add account">+ Add account</button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/AccountList.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Add styles** (append to `src/App.css`)

```css
/* Accounts sidebar */
.account-list { display: flex; flex-direction: column; gap: 0.5rem; }
.household-strip { display: flex; gap: 1.25rem; flex-wrap: wrap; padding: 0.75rem 1rem; border: 1px solid var(--border, #2a2a3a); border-radius: 12px; margin-bottom: 0.5rem; }
.household-stat { display: flex; flex-direction: column; }
.household-label { font-size: 0.7rem; color: var(--muted, #8a8a9a); }
.account-group-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted, #8a8a9a); margin: 0.6rem 0 0.25rem; }
.account-row { display: flex; justify-content: space-between; width: 100%; background: transparent; border: 1px solid transparent; border-radius: 8px; padding: 0.45rem 0.6rem; cursor: pointer; color: inherit; text-align: left; }
.account-row:hover { border-color: var(--border, #2a2a3a); }
.account-row-selected { background: rgba(91,141,255,0.12); border-color: rgba(91,141,255,0.4); }
.account-row-balance.neg, .household-stat .neg { color: #e06c6c; }
.household-stat .pos { color: #3ddba0; }
.account-add { margin-top: 0.5rem; background: transparent; border: 1px dashed var(--border, #2a2a3a); border-radius: 8px; padding: 0.5rem; color: #5b8dff; cursor: pointer; }
```

- [ ] **Step 6: Commit**

```bash
git add src/AccountList.jsx src/AccountList.test.jsx src/App.css
git commit -m "feat(accounts): AccountList sidebar with household strip"
```

---

## Task 8: TransactionRow (bank + compact, desktop + mobile)

**Files:**
- Create: `src/TransactionRow.jsx`
- Test: `src/TransactionRow.test.jsx`

A row renders read-only register content and an Edit affordance; editing happens in `TransactionEditor` (Task 10). `layout` is `'bank'` or `'compact'`. `row` includes the computed `balance`.

- [ ] **Step 1: Write the failing test**

```jsx
// src/TransactionRow.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransactionRow from './TransactionRow.jsx';

const cat = { id: 'c_util', name: 'Utilities', icon: '⚡', color: '#F59E0B' };
const catsById = new Map([[cat.id, cat]]);

const baseRow = { id: 't1', date: '2026-04-15', amount: -96.30, categoryId: 'c_util', description: 'Electricity', payee: 'ComEd', checkNumber: '1042', balance: 903.70 };

describe('TransactionRow', () => {
  it('compact layout shows description, category, signed amount, balance', () => {
    render(<table><tbody><TransactionRow layout="compact" row={baseRow} categoriesById={catsById} onEdit={() => {}} /></tbody></table>);
    expect(screen.getByText('Electricity')).toBeTruthy();
    expect(screen.getByText('Utilities')).toBeTruthy();
    expect(screen.getByText('-$96.30')).toBeTruthy();
    expect(screen.getByText('$903.70')).toBeTruthy();
  });

  it('bank layout splits into payment/deposit and shows payee + check #', () => {
    render(<table><tbody><TransactionRow layout="bank" row={baseRow} categoriesById={catsById} onEdit={() => {}} /></tbody></table>);
    expect(screen.getByText('ComEd')).toBeTruthy();
    expect(screen.getByText('1042')).toBeTruthy();
    expect(screen.getByText('96.30')).toBeTruthy(); // payment column, unsigned
  });

  it('clicking the row calls onEdit with the row', async () => {
    const onEdit = vi.fn();
    render(<table><tbody><TransactionRow layout="compact" row={baseRow} categoriesById={catsById} onEdit={onEdit} /></tbody></table>);
    await userEvent.click(screen.getByText('Electricity'));
    expect(onEdit).toHaveBeenCalledWith(baseRow);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/TransactionRow.test.jsx`
Expected: FAIL — cannot resolve `./TransactionRow.jsx`.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/TransactionRow.jsx
import React from 'react';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const plain = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));

function CategoryCell({ categoriesById, categoryId }) {
  const cat = categoriesById && categoriesById.get(categoryId);
  if (!cat) return <span className="txn-cat txn-cat-none">—</span>;
  return <span className="txn-cat">{cat.icon} {cat.name}</span>;
}

export default function TransactionRow({ layout, row, categoriesById, onEdit }) {
  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—');

  if (layout === 'bank') {
    const isPayment = row.amount < 0;
    return (
      <tr className="txn-row" onClick={() => onEdit(row)}>
        <td className="txn-date">{fmtDate(row.date)}</td>
        <td className="txn-check">{row.checkNumber || '—'}</td>
        <td className="txn-payee">{row.payee || '—'}</td>
        <td><CategoryCell categoriesById={categoriesById} categoryId={row.categoryId} /></td>
        <td className="txn-notes">{row.description}</td>
        <td className="txn-amt neg">{isPayment ? plain(row.amount) : ''}</td>
        <td className="txn-amt pos">{!isPayment ? plain(row.amount) : ''}</td>
        <td className={`txn-bal${row.balance < 0 ? ' neg' : ''}`}>{money(row.balance)}</td>
      </tr>
    );
  }

  return (
    <tr className="txn-row" onClick={() => onEdit(row)}>
      <td className="txn-date">{fmtDate(row.date)}</td>
      <td className="txn-desc">{row.description}</td>
      <td><CategoryCell categoriesById={categoriesById} categoryId={row.categoryId} /></td>
      <td className={`txn-amt${row.amount < 0 ? ' neg' : ' pos'}`}>{row.amount < 0 ? '-' : '+'}{money(Math.abs(row.amount)).replace('$', '$')}</td>
      <td className={`txn-bal${row.balance < 0 ? ' neg' : ''}`}>{money(row.balance)}</td>
    </tr>
  );
}
```

> Note: the compact amount renders as `-$96.30` / `+$1,100.00`. The test asserts `-$96.30`; verify the exact string after implementing and adjust the formatter if your locale differs.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/TransactionRow.test.jsx`
Expected: PASS (3 tests). If the compact amount string mismatches, align the formatter and the test on `-$96.30`.

- [ ] **Step 5: Add styles** (append to `src/App.css`)

```css
.txn-row { cursor: pointer; }
.txn-row:hover { background: rgba(255,255,255,0.03); }
.txn-row td { padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border, #2a2a3a); font-size: 0.82rem; }
.txn-amt { text-align: right; font-variant-numeric: tabular-nums; }
.txn-bal { text-align: right; font-variant-numeric: tabular-nums; }
.txn-amt.neg, .txn-bal.neg { color: #e06c6c; }
.txn-amt.pos { color: #3ddba0; }
.txn-cat-none { color: var(--muted, #8a8a9a); }
```

- [ ] **Step 6: Commit**

```bash
git add src/TransactionRow.jsx src/TransactionRow.test.jsx src/App.css
git commit -m "feat(accounts): TransactionRow with bank and compact layouts"
```

---

## Task 9: Register (header + filter bar + table)

**Files:**
- Create: `src/Register.jsx`
- Test: `src/Register.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// src/Register.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Register from './Register.jsx';

const account = { id: 'a_cc', name: 'Mastercard', type: 'credit_card', icon: '💳', openingBalance: 0 };
const cat = { id: 'c_shop', name: 'Shopping', icon: '🛍️' };
const categoriesById = new Map([[cat.id, cat]]);
const transactions = [
  { id: 't1', accountId: 'a_cc', date: '2026-05-05', amount: -96.20, categoryId: 'c_shop', description: 'Walmart', payee: null, checkNumber: null, transferId: null },
  { id: 't2', accountId: 'a_cc', date: '2026-04-02', amount: -15.99, categoryId: 'c_shop', description: 'Netflix', payee: null, checkNumber: null, transferId: null },
];

describe('Register', () => {
  it('shows account header with "Owed" for liabilities and rows newest-first', () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    expect(screen.getByText('Mastercard')).toBeTruthy();
    expect(screen.getByText(/Owed/i)).toBeTruthy();
    const descCells = screen.getAllByText(/Walmart|Netflix/).map(n => n.textContent);
    expect(descCells[0]).toBe('Walmart'); // May before April
  });

  it('search filters the rows', async () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'netflix');
    expect(screen.queryByText('Walmart')).toBeNull();
    expect(screen.getByText('Netflix')).toBeTruthy();
  });

  it('add-transaction button fires callback', async () => {
    const onAdd = vi.fn();
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={onAdd} />);
    await userEvent.click(screen.getByRole('button', { name: /add transaction/i }));
    expect(onAdd).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/Register.test.jsx`
Expected: FAIL — cannot resolve `./Register.jsx`.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/Register.jsx
import React, { useMemo, useState } from 'react';
import { computeRegister, filterTransactions, layoutFor, accountClass, accountBalance } from './accountsModel.js';
import TransactionRow from './TransactionRow.jsx';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function Register({ account, transactions, categories, categoriesById, onEditTransaction, onAddTransaction }) {
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const layout = layoutFor(account.type);
  const klass = accountClass(account.type);
  const balance = accountBalance(account, transactions);

  const rows = useMemo(() => {
    const computed = computeRegister(account, transactions); // oldest→newest w/ balance
    const filtered = filterTransactions(computed, { search, month: month || null, categoryId: categoryId || null }, categoriesById);
    return filtered.slice().reverse(); // newest-first for display
  }, [account, transactions, search, month, categoryId, categoriesById]);

  const balanceLabel = klass === 'liability' ? `Owed: ${money(Math.abs(Math.min(0, balance)))}` : `Balance: ${money(balance)}`;

  return (
    <div className="register">
      <div className="register-header">
        <h2 className="register-title">{account.icon} {account.name}</h2>
        <span className="register-balance">{balanceLabel}</span>
        <button type="button" className="btn" onClick={() => onAddTransaction(account.id)} aria-label="Add transaction">+ Add transaction</button>
      </div>

      <div className="register-filters">
        <input type="text" className="input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month filter" />
        <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category filter">
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      </div>

      <table className="register-table">
        <thead>
          {layout === 'bank' ? (
            <tr><th>Date</th><th>Chk#</th><th>Payee</th><th>Category</th><th>Notes</th><th className="right">Payment</th><th className="right">Deposit</th><th className="right">Balance</th></tr>
          ) : (
            <tr><th>Date</th><th>Description</th><th>Category</th><th className="right">Amount</th><th className="right">Balance</th></tr>
          )}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={layout === 'bank' ? 8 : 5} className="register-empty">No transactions.</td></tr>
          ) : (
            rows.map(r => (
              <TransactionRow key={r.id} layout={layout} row={r} categoriesById={categoriesById} onEdit={onEditTransaction} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/Register.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Add styles** (append to `src/App.css`)

```css
.register-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
.register-title { font-size: 1.1rem; margin: 0; }
.register-balance { margin-left: auto; font-weight: 600; }
.register-filters { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
.register-table { width: 100%; border-collapse: collapse; }
.register-table th { text-align: left; font-size: 0.66rem; text-transform: uppercase; color: var(--muted, #8a8a9a); padding: 0.3rem 0.5rem; border-bottom: 1px solid var(--border, #2a2a3a); }
.register-table th.right { text-align: right; }
.register-empty { text-align: center; color: var(--muted, #8a8a9a); padding: 1.5rem; }
```

- [ ] **Step 6: Commit**

```bash
git add src/Register.jsx src/Register.test.jsx src/App.css
git commit -m "feat(accounts): Register with filters and type-aware columns"
```

---

## Task 10: TransactionEditor (add / edit / delete modal)

**Files:**
- Create: `src/TransactionEditor.jsx`
- Test: `src/TransactionEditor.test.jsx`

The editor edits a transaction's fields. `amount` is the signed delta; the editor exposes a **direction toggle** (money out / money in) plus a magnitude field, and assembles the signed value on save. Bank-layout accounts also show Payee + Check #.

- [ ] **Step 1: Write the failing test**

```jsx
// src/TransactionEditor.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransactionEditor from './TransactionEditor.jsx';

const categories = [
  { id: 'c_shop', name: 'Shopping', icon: '🛍️', flow: 'expense' },
  { id: 'c_pay',  name: 'Paycheck', icon: '💼', flow: 'income' },
];

function setup(props = {}) {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  render(
    <TransactionEditor
      account={{ id: 'a1', name: 'Mastercard', type: 'credit_card' }}
      transaction={props.transaction ?? null}
      categories={categories}
      onSave={onSave} onDelete={onDelete} onClose={onClose}
    />
  );
  return { onSave, onDelete, onClose };
}

describe('TransactionEditor', () => {
  it('new transaction: saving assembles a NEGATIVE amount for money out', async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByLabelText(/description/i), 'Walmart');
    await userEvent.clear(screen.getByLabelText(/amount/i));
    await userEvent.type(screen.getByLabelText(/amount/i), '96.20');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.amount).toBeCloseTo(-96.20, 2); // default direction = out
    expect(saved.description).toBe('Walmart');
  });

  it('direction toggle to "in" makes the amount positive', async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByLabelText(/amount/i), '1100');
    await userEvent.click(screen.getByRole('button', { name: /money in/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave.mock.calls[0][0].amount).toBeCloseTo(1100, 2);
  });

  it('editing an existing transaction shows delete', async () => {
    const { onDelete } = setup({ transaction: { id: 't1', accountId: 'a1', date: '2026-05-05', amount: -96.20, categoryId: 'c_shop', description: 'Walmart', payee: null, checkNumber: null, transferId: null } });
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith('t1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/TransactionEditor.test.jsx`
Expected: FAIL — cannot resolve `./TransactionEditor.jsx`.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/TransactionEditor.jsx
import React, { useState } from 'react';
import { layoutFor } from './accountsModel.js';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function TransactionEditor({ account, transaction, categories, onSave, onDelete, onClose }) {
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

  const isBank = layoutFor(account.type) === 'bank';

  const save = () => {
    const mag = Math.abs(parseFloat(magnitude) || 0);
    const amount = direction === 'in' ? mag : -mag;
    onSave({
      ...(transaction || {}),
      accountId: account.id,
      date,
      amount,
      categoryId,
      description: description.trim(),
      payee: isBank ? (payee.trim() || null) : null,
      checkNumber: isBank ? (checkNumber.trim() || null) : null,
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

        <label className="field"><span>Category</span>
          <select aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="select">
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </label>

        <div className="field">
          <span>Amount</span>
          <div className="amount-row">
            <div className="dir-toggle" role="group" aria-label="Direction">
              <button type="button" className={`dir-btn${direction === 'out' ? ' active' : ''}`} aria-label="Money out" onClick={() => setDirection('out')}>− Out</button>
              <button type="button" className={`dir-btn${direction === 'in' ? ' active' : ''}`} aria-label="Money in" onClick={() => setDirection('in')}>+ In</button>
            </div>
            <input type="number" step="0.01" aria-label="Amount" value={magnitude} onChange={(e) => setMagnitude(e.target.value)} className="input" />
          </div>
        </div>

        <div className="dialog-actions">
          {isEdit && <button type="button" className="btn btn-danger" onClick={() => onDelete(transaction.id)}>Delete</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/TransactionEditor.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Add styles** (append to `src/App.css`)

```css
.field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.6rem; }
.field > span { font-size: 0.72rem; color: var(--muted, #8a8a9a); }
.amount-row { display: flex; gap: 0.5rem; align-items: center; }
.dir-toggle { display: flex; border: 1px solid var(--border, #2a2a3a); border-radius: 8px; overflow: hidden; }
.dir-btn { background: transparent; border: none; padding: 0.45rem 0.7rem; color: inherit; cursor: pointer; }
.dir-btn.active { background: rgba(91,141,255,0.18); }
```

- [ ] **Step 6: Commit**

```bash
git add src/TransactionEditor.jsx src/TransactionEditor.test.jsx src/App.css
git commit -m "feat(accounts): TransactionEditor add/edit/delete"
```

---

## Task 11: AccountEditor (create / type / opening balance / rename / delete)

**Files:**
- Create: `src/AccountEditor.jsx`
- Test: `src/AccountEditor.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// src/AccountEditor.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountEditor from './AccountEditor.jsx';

describe('AccountEditor', () => {
  it('new account: saves name, type, opening balance', async () => {
    const onSave = vi.fn();
    render(<AccountEditor account={null} onSave={onSave} onDelete={() => {}} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/name/i), 'Schwab Brokerage');
    await userEvent.selectOptions(screen.getByLabelText(/type/i), 'investment');
    await userEvent.clear(screen.getByLabelText(/opening balance/i));
    await userEvent.type(screen.getByLabelText(/opening balance/i), '42300');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    const saved = onSave.mock.calls[0][0];
    expect(saved.name).toBe('Schwab Brokerage');
    expect(saved.type).toBe('investment');
    expect(saved.openingBalance).toBe(42300);
  });

  it('editing an existing account shows the type selector pre-set and a delete button', async () => {
    const onDelete = vi.fn();
    render(<AccountEditor account={{ id: 'a1', name: 'Mastercard', type: 'untyped', icon: '💳', openingBalance: 0 }} onSave={() => {}} onDelete={onDelete} onClose={() => {}} />);
    expect(screen.getByLabelText(/type/i).value).toBe('untyped');
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith('a1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/AccountEditor.test.jsx`
Expected: FAIL — cannot resolve `./AccountEditor.jsx`.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/AccountEditor.jsx
import React, { useState } from 'react';
import { ACCOUNT_TYPES } from './accountsModel.js';

const TYPE_OPTIONS = ['bank', 'investment', 'credit_card', 'loan', 'mortgage', 'person', 'untyped'];

export default function AccountEditor({ account, onSave, onDelete, onClose }) {
  const isEdit = !!account;
  const [name, setName] = useState(account?.name || '');
  const [type, setType] = useState(account?.type || 'untyped');
  const [icon, setIcon] = useState(account?.icon || '🏦');
  const [openingBalance, setOpeningBalance] = useState(account?.openingBalance ?? 0);

  const save = () => {
    onSave({
      ...(account || {}),
      name: name.trim() || 'Unnamed',
      type,
      icon: icon || '🏦',
      openingBalance: Number(openingBalance) || 0,
    });
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">{isEdit ? 'Edit account' : 'New account'}</h2>

        <label className="field"><span>Icon</span>
          <input type="text" aria-label="Icon" value={icon} onChange={(e) => setIcon(e.target.value)} className="input" maxLength={4} />
        </label>
        <label className="field"><span>Name</span>
          <input type="text" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </label>
        <label className="field"><span>Type</span>
          <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className="select">
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{ACCOUNT_TYPES[t].label}</option>)}
          </select>
        </label>
        <label className="field"><span>Opening balance</span>
          <input type="number" step="0.01" aria-label="Opening balance" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className="input" />
        </label>
        <p className="dialog-hint">For a credit card or loan, enter the amount owed as a negative number.</p>

        <div className="dialog-actions">
          {isEdit && <button type="button" className="btn btn-danger" onClick={() => onDelete(account.id)}>Delete</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/AccountEditor.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Add styles** (append to `src/App.css`)

```css
.dialog-hint { font-size: 0.72rem; color: var(--muted, #8a8a9a); margin: 0.25rem 0 0.5rem; }
```

- [ ] **Step 6: Commit**

```bash
git add src/AccountEditor.jsx src/AccountEditor.test.jsx src/App.css
git commit -m "feat(accounts): AccountEditor create/type/opening-balance"
```

---

## Task 12: Export v4 (accounts + transactions)

**Files:**
- Modify: `src/exportArchive.js`
- Create: `src/exportArchive.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/exportArchive.test.js
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildArchive, buildTransactionsCsv } from './exportArchive.js';

const categories = [
  { id: 'c_shop', name: 'Shopping', flow: 'expense' },
  { id: 'c_pay',  name: 'Paycheck', flow: 'income' },
];
const accounts = [
  { id: 'a_cc',  name: 'Mastercard', type: 'credit_card', icon: '💳', openingBalance: 0 },
  { id: 'a_chk', name: 'Chase',      type: 'bank',        icon: '🏦', openingBalance: 1000 },
];
const transactions = [
  { id: 't1', accountId: 'a_cc',  date: '2026-05-05', amount: -96.20, categoryId: 'c_shop', description: 'Walmart', payee: null, checkNumber: null, transferId: null },
  { id: 't2', accountId: 'a_chk', date: '2026-05-01', amount: 3200,   categoryId: 'c_pay',  description: 'Salary',  payee: 'Acme', checkNumber: null, transferId: null },
];

describe('export v4', () => {
  it('archive holds data.json (schema 4, accounts+transactions) + transactions.csv', () => {
    const bytes = buildArchive({ accounts, transactions, categories, schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-12T00:00:00Z') });
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(['data.json', 'transactions.csv']);
    const data = JSON.parse(strFromU8(files['data.json']));
    expect(data.schemaVersion).toBe(4);
    expect(data.accounts).toHaveLength(2);
    expect(data.transactions).toHaveLength(2);
  });

  it('CSV header and an account-name column', () => {
    const csv = buildTransactionsCsv(accounts, transactions, new Map(categories.map(c => [c.id, c])));
    expect(csv.split('\n')[0]).toContain('date,account,description,amount,category');
    expect(csv).toContain('Mastercard');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/exportArchive.test.js`
Expected: FAIL — `buildTransactionsCsv` not exported; `buildArchive` still expects `bills`.

- [ ] **Step 3: Rewrite `src/exportArchive.js`**

```js
// src/exportArchive.js
import { zipSync } from 'fflate';

const CSV_HEADER = 'date,account,description,amount,category,flow,payee,check';

function escapeCsv(value) {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildTransactionsCsv(accounts, transactions, categoriesById) {
  const acctById = new Map((accounts || []).map(a => [a.id, a]));
  const rows = (transactions || [])
    .filter(t => t && Number.isFinite(t.amount))
    .map(t => {
      const acct = acctById.get(t.accountId);
      const cat = categoriesById && categoriesById.get(t.categoryId);
      return {
        date: t.date || '',
        account: acct ? acct.name : '',
        description: t.description || '',
        amount: t.amount.toFixed(2),
        category: cat ? cat.name : 'Uncategorized',
        flow: (cat && cat.flow) || 'expense',
        payee: t.payee || '',
        check: t.checkNumber || '',
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const lines = [CSV_HEADER];
  for (const r of rows) {
    lines.push([
      escapeCsv(r.date), escapeCsv(r.account), escapeCsv(r.description),
      r.amount, escapeCsv(r.category), r.flow, escapeCsv(r.payee), escapeCsv(r.check),
    ].join(','));
  }
  return '﻿' + lines.join('\n');
}

export function buildDataJson(accounts, transactions, categories, schemaVersion, appVersion, now) {
  return JSON.stringify({
    schemaVersion,
    exportedAt: now.toISOString(),
    appVersion,
    accounts: accounts || [],
    transactions: transactions || [],
    categories: categories || [],
  }, null, 2);
}

export function buildArchive({ accounts, transactions, categories, schemaVersion, appVersion, now }) {
  const categoriesById = new Map((categories || []).map(c => [c.id, c]));
  const jsonString = buildDataJson(accounts, transactions, categories, schemaVersion, appVersion, now);
  const csvString = buildTransactionsCsv(accounts, transactions, categoriesById);
  const encoder = new TextEncoder();
  const jsonBytes = new Uint8Array(Array.from(encoder.encode(jsonString)));
  const csvWithoutBom = csvString.charCodeAt(0) === 0xFEFF ? csvString.slice(1) : csvString;
  const csvContentBytes = new Uint8Array(Array.from(encoder.encode(csvWithoutBom)));
  const csvBytes = new Uint8Array(3 + csvContentBytes.length);
  csvBytes[0] = 0xEF; csvBytes[1] = 0xBB; csvBytes[2] = 0xBF;
  csvBytes.set(csvContentBytes, 3);
  return zipSync({ 'data.json': jsonBytes, 'transactions.csv': csvBytes });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/exportArchive.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/exportArchive.js src/exportArchive.test.js
git commit -m "feat(accounts): export v4 with accounts + transactions"
```

---

## Task 13: Rewire App.jsx to the account-centric shell

This is the integration task. It rewrites the `BillTracker` component to use `useLedger`, render `AccountList` + `Register`, manage a selected account, host the editors, route scan output into transactions, and remove all month/bills/recurring/tracked-keyword UI. Keep: settings, pairing, scan extraction, export, processing overlay, migration banner, undo.

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Update imports and the initialization block**

Replace the existing import block (lines ~1-23) so the removed components are gone and the new ones are in. Final import set:

```jsx
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import PhoneCapture from './PhoneCapture.jsx';
import useDesktopPeer from './useDesktopPeer.js';
import PairingPanel from './PairingPanel.jsx';
import useSettings from './useSettings.js';
import SettingsPanel from './SettingsPanel.jsx';
import { extractBillFromImage } from './billExtractor.js';
import useCategories from './useCategories.js';
import useLedger from './useLedger.js';
import AccountList from './AccountList.jsx';
import Register from './Register.jsx';
import TransactionEditor from './TransactionEditor.jsx';
import AccountEditor from './AccountEditor.jsx';
import ManageCategoriesScreen from './ManageCategoriesScreen.jsx';
import { initializeFromStorage } from './initializeFromStorage.js';
import { buildArchive } from './exportArchive.js';
import './App.css';
import pkg from '../package.json';
```

- [ ] **Step 2: Replace the `BillTracker` state block**

Remove all of: `bills`, `migrationBanner` (keep), `pendingConflictQueue`, `selectedMonth`, `searchTerm` (register owns its own now), `trackedKeywords`, recurring tip/conflict/duplicate/promote state, `MonthToggle`, `BillCard`, `SummaryCard`, `TrackedPanel`, `RecurringSection`, `RecurringPanels`, and their handlers. Keep the camera/processing/settings/pairing/peer state.

New initialization + ledger wiring near the top of `BillTracker()`:

```jsx
const [{ accounts: initAccounts, transactions: initTransactions, migrationError }] =
  useState(() => initializeFromStorage(window.localStorage));
const [migrationBanner, setMigrationBanner] = useState(migrationError);

const ledger = useLedger({ accounts: initAccounts, transactions: initTransactions });
const cats = useCategories();
const categoriesById = useMemo(() => new Map(cats.categories.map(c => [c.id, c])), [cats.categories]);

const [screen, setScreen] = useState('main'); // 'main' | 'manage-categories'
const [selectedAccountId, setSelectedAccountId] = useState(initAccounts[0]?.id ?? null);
const [editingTxn, setEditingTxn] = useState(null);   // { mode:'new'|'edit', accountId, transaction? }
const [editingAccount, setEditingAccount] = useState(null); // { mode:'new'|'edit', account? }

// Undo: snapshots of the whole ledger.
const [history, setHistory] = useState([]);
const pushHistory = () => setHistory(prev => [...prev.slice(-19), ledger.snapshot()]);
const undo = () => {
  setHistory(prev => {
    if (prev.length === 0) return prev;
    ledger.restore(prev[prev.length - 1]);
    return prev.slice(0, -1);
  });
};
```

Keep the existing `desktopPeer`, `settings`, `showCamera`, `isProcessing`, `processingStatus`, `windowWidth`/`isMobile`, file input ref, and the `useEffect` that consumes `desktopPeer.lastImage`.

- [ ] **Step 3: Rewrite the handlers**

```jsx
const selectedAccount = ledger.accounts.find(a => a.id === selectedAccountId) || ledger.accounts[0] || null;

// Account CRUD
const saveAccount = (data) => {
  pushHistory();
  if (data.id) ledger.updateAccount(data.id, data);
  else { const id = ledger.addAccount(data); setSelectedAccountId(id); }
  setEditingAccount(null);
};
const deleteAccount = (id) => {
  pushHistory();
  ledger.deleteAccount(id);
  if (selectedAccountId === id) setSelectedAccountId(ledger.accounts.find(a => a.id !== id)?.id ?? null);
  setEditingAccount(null);
};

// Transaction CRUD
const saveTransaction = (data) => {
  pushHistory();
  if (data.id) ledger.updateTransaction(data.id, data);
  else ledger.addTransaction(data);
  setEditingTxn(null);
};
const deleteTransaction = (id) => { pushHistory(); ledger.deleteTransaction(id); setEditingTxn(null); };

const exportData = () => {
  const bytes = buildArchive({
    accounts: ledger.accounts, transactions: ledger.transactions,
    categories: cats.categories, schemaVersion: 4, appVersion: pkg.version, now: new Date(),
  });
  const blob = new Blob([bytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `billtracker-${new Date().toISOString().split('T')[0]}.zip`; a.click();
  URL.revokeObjectURL(url);
};
```

- [ ] **Step 4: Rewrite `handleCapture` to flatten into the selected account**

Replace the body that built a `newBill` so scanned items become transactions in the selected (or a newly created) account.

```jsx
const handleCapture = async (imageData, source) => {
  setShowCamera(false);
  if (!settings.hasKey) {
    openSettings(source === 'phone'
      ? 'Phone captured a bill — add an Anthropic API key to process it.'
      : 'Add an Anthropic API key to scan bills.');
    return false;
  }
  setIsProcessing(true);
  setProcessingStatus('Reading bill…');
  try {
    const { vendor, items } = await extractBillFromImage(imageData, { apiKey: settings.apiKey, model: settings.model });
    pushHistory();
    // Target account: the selected one, else create an untyped account named after the vendor.
    let targetId = selectedAccountId;
    if (!targetId) targetId = ledger.addAccount({ name: vendor || 'Scanned account', type: 'untyped', icon: '🏦' });
    for (const it of items) {
      const flow = (categoriesById.get(cats.autoCategorize(it.description))?.flow) || 'expense';
      const sign = flow === 'income' ? 1 : -1;
      ledger.addTransaction({
        accountId: targetId,
        date: it.date || new Date().toISOString().slice(0, 10),
        amount: sign * (Number.isFinite(it.amount) ? it.amount : 0),
        categoryId: cats.autoCategorize(it.description),
        description: it.description,
      });
    }
    setSelectedAccountId(targetId);
  } catch (err) {
    setMigrationBanner({ message: `Scan failed: ${err.message || 'extraction error'}.`, recovered: false });
  } finally {
    setIsProcessing(false); setProcessingStatus('');
  }
  return true;
};
```

- [ ] **Step 5: Replace the main `return` JSX**

Replace everything inside the `container` (header + stats + spending hero + main grid) with the account layout. Keep the modals/overlays you preserved (camera, processing, pairing, settings, manage-categories, migration banner, ledger storage error). New body:

```jsx
return (
  <div className="app-root">
    <div className="app-bg-gradient" />

    {screen === 'manage-categories' && (
      <ManageCategoriesScreen
        categories={cats.categories}
        bills={[]} /* category screen still accepts a bills prop for keyword apply; pass [] in Phase 1 */
        onClose={() => setScreen('main')}
        onAddCategory={(p) => cats.addCategory(p)}
        onUpdateCategory={(id, patch) => cats.updateCategory(id, patch)}
        onDeleteCategory={(id) => cats.deleteCategory(id, [])}
        onAddKeyword={(catId, kw) => cats.addKeyword(catId, kw, [])}
        onRemoveKeyword={(catId, kw) => cats.removeKeyword(catId, kw)}
        onAddTemplate={(catId, t) => cats.addTemplate(catId, t)}
        onRemoveTemplate={(catId, t) => cats.removeTemplate(catId, t)}
        onMoveAll={() => {}}
      />
    )}

    {showCamera && <CameraCapture onCapture={handleCapture} onClose={() => setShowCamera(false)} />}
    {isProcessing && (
      <div className="processing-overlay"><div className="processing-spinner" /><p className="processing-label">{processingStatus || 'Processing...'}</p></div>
    )}
    {showPairing && <PairingPanel peer={desktopPeer} onClose={() => setShowPairing(false)} />}
    {showSettings && <SettingsPanel settings={settings} onClose={closeSettings} banner={settingsBanner} />}

    {editingAccount && (
      <AccountEditor
        account={editingAccount.account || null}
        onSave={saveAccount} onDelete={deleteAccount} onClose={() => setEditingAccount(null)}
      />
    )}
    {editingTxn && selectedAccount && (
      <TransactionEditor
        account={selectedAccount}
        transaction={editingTxn.transaction || null}
        categories={cats.categories}
        onSave={saveTransaction} onDelete={deleteTransaction} onClose={() => setEditingTxn(null)}
      />
    )}

    {migrationBanner && (
      <div className="toast toast-error">{migrationBanner.message}
        <button type="button" className="toast-dismiss" aria-label="Dismiss" onClick={() => setMigrationBanner(null)}>×</button>
      </div>
    )}
    {ledger.storageError && (
      <div className="toast toast-error">{ledger.storageError.message}
        <button type="button" className="toast-dismiss" aria-label="Dismiss" onClick={ledger.clearStorageError}>×</button>
      </div>
    )}

    <div className="container">
      <header className="header">
        <div className="brand">
          <h1 className="brand-title">Bill<span className="brand-title-accent">Tracker</span></h1>
          <p className="brand-sub">Accounts</p>
        </div>
        <div className="header-actions">
          <button onClick={() => openSettings()} className="btn-icon" aria-label="Settings">⚙</button>
          <button type="button" onClick={() => setScreen('manage-categories')} className="btn">☰ Categories</button>
          <button onClick={() => setShowCamera(true)} className="btn btn-primary">◉ Scan</button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,application/pdf" style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()} className="btn">↑ Upload</button>
          <button onClick={openPairing} className={`btn${desktopPeer.status === 'paired' ? ' btn-paired' : ''}`}>{desktopPeer.status === 'paired' ? '✓ Phone Linked' : '⌘ Pair Phone'}</button>
          <button onClick={undo} disabled={history.length === 0} className={`btn btn-undo${history.length > 0 ? ' active' : ''}`}>↩ Undo{history.length > 0 ? ` (${history.length})` : ''}</button>
          <button onClick={exportData} className="btn">↗ Export</button>
        </div>
      </header>

      <div className="accounts-layout">
        <aside className="accounts-sidebar">
          <AccountList
            accounts={ledger.accounts}
            transactions={ledger.transactions}
            selectedId={selectedAccount?.id ?? null}
            onSelect={setSelectedAccountId}
            onAddAccount={() => setEditingAccount({ mode: 'new' })}
          />
        </aside>
        <main className="accounts-main">
          {!selectedAccount ? (
            <div className="empty-state">
              <div className="empty-glyph">◈</div>
              <h3 className="empty-title">No accounts yet</h3>
              <p className="empty-desc">Add an account, scan a statement, or import.</p>
              <button onClick={() => setEditingAccount({ mode: 'new' })} className="btn btn-primary">+ Add your first account</button>
            </div>
          ) : (
            <>
              <div className="account-toolbar">
                <button type="button" className="btn" onClick={() => setEditingAccount({ mode: 'edit', account: selectedAccount })}>✎ Edit account</button>
              </div>
              <Register
                account={selectedAccount}
                transactions={ledger.transactions}
                categories={cats.categories}
                categoriesById={categoriesById}
                onEditTransaction={(t) => setEditingTxn({ mode: 'edit', accountId: selectedAccount.id, transaction: t })}
                onAddTransaction={(accountId) => setEditingTxn({ mode: 'new', accountId })}
              />
            </>
          )}
        </main>
      </div>
    </div>
  </div>
);
```

> Keep the existing `CameraCapture`, `ConfirmDialog`, `openSettings`, `closeSettings`, `openPairing`, `handleFileUpload`, and the `desktopPeer.lastImage` effect from the current file — they are unchanged. Delete `BillCard`, `SummaryCard`, `TrackedPanel`, `RecurringSection`, `RecurringPanels`, `MonthToggle`, and all the now-unused helper consts (`formatMonth*`, `shiftMonth`, etc.) flagged by lint in the next step.

- [ ] **Step 6: Add layout styles** (append to `src/App.css`)

```css
.accounts-layout { display: grid; grid-template-columns: 280px 1fr; gap: 1.25rem; align-items: start; }
@media (max-width: 860px) { .accounts-layout { grid-template-columns: 1fr; } }
.account-toolbar { display: flex; justify-content: flex-end; margin-bottom: 0.5rem; }
```

- [ ] **Step 7: Run lint and the full suite**

Run: `npm run lint`
Expected: no errors. Fix any "unused variable" errors by deleting the dead helpers/consts they point to.

Run: `npx vitest run`
Expected: the new suites pass. (Old bills/recurring suites are removed in Task 14; if any still exist and fail to import, proceed to Task 14.)

- [ ] **Step 8: Manual smoke (dev server)**

Run: `npm run dev`, open `http://localhost:5173`. Verify: existing data appears as accounts (all "Unassigned"); selecting an account shows its register with a running balance; "Edit account" can set a type (a bank account switches to the 8-column layout); "+ Add transaction" adds a row; Undo reverts; Export downloads a zip; Scan/Upload routes items into the selected account.

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat(accounts): account-centric app shell; remove month/recurring/tracked UI"
```

---

## Task 14: Remove dead code and update the smoke test

**Files:**
- Delete: `src/SpendingChart.jsx`, `src/SpendingChart.test.jsx`, `src/ReportsScreen.jsx`, `src/ReportsScreen.test.jsx`, `src/reportingMath.js`, `src/reportingMath.test.js`, `src/RecurringPanels.test.jsx`, `src/RecurringConflictDialog.jsx`, `src/RecurringConflictDialog.test.jsx`, `src/RecurringTipDialog.jsx`, `src/RecurringTipDialog.test.jsx`, `src/DuplicateBillDialog.jsx`, `src/DuplicateBillDialog.test.jsx`, `src/BillItem.jsx`, `src/BillItem.test.jsx`
- Modify: `src/__smoke__/setup.test.jsx`

- [ ] **Step 1: Delete the dead files**

```bash
git rm src/SpendingChart.jsx src/SpendingChart.test.jsx \
       src/ReportsScreen.jsx src/ReportsScreen.test.jsx \
       src/reportingMath.js src/reportingMath.test.js \
       src/RecurringPanels.test.jsx \
       src/RecurringConflictDialog.jsx src/RecurringConflictDialog.test.jsx \
       src/RecurringTipDialog.jsx src/RecurringTipDialog.test.jsx \
       src/DuplicateBillDialog.jsx src/DuplicateBillDialog.test.jsx \
       src/BillItem.jsx src/BillItem.test.jsx
```

> Leave `spendingMath.js` in place — `accountsMigration.js` imports `getItemDate` from it, and `migrateBills`/`migrateToV2`/`migrateToV3` are still used by `initializeFromStorage.js`. The now-unused exports (`findRecurringCharges`, `computeCatchUp`, `aggregateByMonth`, etc.) can be pruned in a Phase 3 cleanup.

- [ ] **Step 2: Replace the smoke test with a v4 end-to-end**

```jsx
// src/__smoke__/setup.test.jsx
import { describe, it, expect } from 'vitest';
import { initializeFromStorage } from '../initializeFromStorage.js';
import { accountBalance, householdTotals } from '../accountsModel.js';
import { buildArchive } from '../exportArchive.js';
import { unzipSync, strFromU8 } from 'fflate';

function makeFakeStorage(initial = {}) {
  const store = { ...initial };
  return { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
}

describe('end-to-end: v3 bills migrate to v4 accounts, balances, export', () => {
  it('legacy bills become accounts; balances compute; export round-trips', () => {
    const v1Bills = [
      { id: 'b1', vendor: 'Mastercard', month: '2026-05', items: [
        { id: 'i1', description: 'Costco', amount: 100, category: 'Groceries', date: '2026-05-03' },
        { id: 'i2', description: 'Refund', amount: -20, category: 'Groceries', date: '2026-05-10' },
      ]},
    ];
    const storage = makeFakeStorage({ 'billtracker-bills': JSON.stringify(v1Bills) });
    const { accounts, transactions, migrationError } = initializeFromStorage(storage);
    expect(migrationError).toBeNull();
    expect(accounts).toHaveLength(1);
    const mc = accounts[0];
    // expense magnitudes become negative deltas; refund (negative) becomes positive
    expect(accountBalance(mc, transactions)).toBeCloseTo(-100 + 20, 2);

    const bytes = buildArchive({ accounts, transactions, categories: [], schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-12T00:00:00Z') });
    const files = unzipSync(bytes);
    expect(JSON.parse(strFromU8(files['data.json'])).schemaVersion).toBe(4);
  });
});
```

- [ ] **Step 3: Run the full suite + lint**

Run: `npx vitest run`
Expected: PASS, no missing-import failures.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(accounts): remove month/recurring dead code; v4 smoke test"
```

---

## Self-Review (completed during planning)

**1. Spec coverage (Phase 1 items):**
- Account entity + 7 types + classification → Task 1. ✓
- Running balances + household roll-ups → Task 2. ✓
- Register filters → Task 3. ✓
- v3→v4 migration (vendors → untyped) → Tasks 4–5. ✓
- `useLedger` (CRUD + undo snapshot) → Task 6. ✓
- Account-list screen + household strip → Task 7. ✓
- Bank + compact register layouts (+ mobile collapse via CSS) → Tasks 8–9. ✓
- Manual transaction add/edit/delete → Task 10. ✓
- Account create / type assignment / opening balance → Task 11. ✓
- Scan flattens into a chosen account → Task 13 Step 4. ✓
- Search/month/category filters → Task 9 (uses Task 3). ✓
- Remove monthly dashboard, stat cards, spending chart, tracked keywords, recurring → Tasks 13–14. ✓
- Export updated → Task 12. ✓
- Migration backup written → Task 5. ✓

**2. Placeholder scan:** No "TBD"/"add error handling"-style placeholders; each code step contains full code. The one mobile-collapse detail is handled via responsive CSS on the grid; if Dad needs a stacked card view per row, that's a follow-up, not a Phase 1 gap.

**3. Type consistency:** `transaction` shape `{ id, accountId, date, amount, categoryId, description, payee, checkNumber, transferId }` is identical across `accountsMigration`, `useLedger`, `TransactionRow`, `TransactionEditor`, and export. `account` shape `{ id, name, icon, type, openingBalance }` is consistent across `accountsModel`, `useLedger`, `AccountEditor`, `AccountList`. Function names match call sites (`computeRegister`, `filterTransactions`, `householdTotals`, `accountBalance`, `layoutFor`, `accountClass`, `flowSign`). `initializeFromStorage` returns `{ accounts, transactions, migrationError }` and Task 13 consumes exactly those.

**Known interface note:** `ManageCategoriesScreen` currently takes a `bills` prop (for keyword-apply preview). Phase 1 passes `[]`; keyword auto-apply against the new `transactions` array is deferred (categories still add/remove/rename normally). Flagged for Phase 2/3.
