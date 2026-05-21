# Custom Account Types & Register Column Sorting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clickable column-sorting to the account register, and turn the hardcoded account-type registry into user-editable, stored data managed from a dedicated "Account Types" screen.

**Architecture:** Sorting is a pure `sortRows` helper in `accountsModel.js` wired into `Register.jsx` (reorders rows only; the running balance stays each row's true chronological value). Custom types make `accountsModel`'s classification helpers take a `typesById` registry (defaulting to the built-in seed so existing callers keep working), backed by a new `useAccountTypes` hook (load/seed/persist/CRUD) and an `AccountTypesScreen` + `AccountTypeEditor`. Deleting an in-use type reassigns its accounts via `ledger.updateAccount` in `App`.

**Tech Stack:** React 19, Vite 7, Vitest 4 + @testing-library/react (jsdom), nanoid, fflate. Run a single file with `npx vitest run <path>`.

---

## Scope

**In scope:** register column sorting (all data columns, click to sort / click again to reverse, default date-descending, balance stays per-row); account types as editable stored data (label + class + layout + group + icon); `useAccountTypes` hook; `AccountTypesScreen` + `AccountTypeEditor`; reassign-on-delete; threading the type registry through `AccountList`/`Register`/`TransactionEditor`/`AccountEditor`; export of `accountTypes`.

**Out of scope:** Transfers (Phase 2), Reports (Phase 3), multi-column sort, persisting sort across reloads.

> **Backward-compatibility convention (used throughout):** The model helpers `accountClass`/`layoutFor`/`groupFor`/`isOnBalanceSheet`/`householdTotals` and the new component props `types`/`typesById` all **default to the built-in registry** (`DEFAULT_ACCOUNT_TYPES` / `DEFAULT_ACCOUNT_TYPES_BY_ID`). This keeps every Phase-1 caller and test working unchanged while consumers are migrated to pass the live registry.

---

## File Structure

**Create:**
- `src/useAccountTypes.js` — hook: load/seed/persist account types; `addType`/`updateType`/`deleteType`; `typesById`.
- `src/useAccountTypes.test.jsx`
- `src/AccountTypeEditor.jsx` — create/edit dialog (icon, label, class, layout, group) + delete.
- `src/AccountTypeEditor.test.jsx`
- `src/AccountTypesScreen.jsx` — manage types; `+ New type`; edit; delete-with-reassign.
- `src/AccountTypesScreen.test.jsx`

**Modify:**
- `src/accountsModel.js` — add `sortRows`; replace `ACCOUNT_TYPES`/`GROUP_ORDER` constants with `DEFAULT_ACCOUNT_TYPES` (array) + derived back-compat exports; add `FALLBACK_TYPE`, `groupOrder`; make `accountClass`/`layoutFor`/`groupFor`/`isOnBalanceSheet`/`householdTotals` take an optional `typesById`.
- `src/accountsModel.test.js` — add `sortRows`, `groupOrder`, custom-`typesById`, and fallback tests.
- `src/Register.jsx` — sortable headers + sort state; accept `typesById`.
- `src/Register.test.jsx` — sorting tests.
- `src/AccountList.jsx` — accept `types`; use `groupOrder(types)` + `typesById`.
- `src/AccountList.test.jsx` — pass `types`; custom-type grouping.
- `src/TransactionEditor.jsx` — accept `typesById` for `layoutFor`.
- `src/AccountEditor.jsx` — populate type `<select>` from a `types` prop.
- `src/AccountEditor.test.jsx` — (no change needed; `types` defaults to built-ins).
- `src/exportArchive.js` — include `accountTypes` in `data.json`.
- `src/exportArchive.test.js` — assert `accountTypes` present.
- `src/App.jsx` — `useAccountTypes`; `account-types` screen + header button; thread registry; delete-with-reassign handler; export `accountTypes`.
- `src/App.css` — sort-header + Account-Types-screen styles.

---

## Task 1: `sortRows` pure helper (sorting feature)

**Files:**
- Modify: `src/accountsModel.js`
- Test: `src/accountsModel.test.js`

- [ ] **Step 1: Write the failing test (append to `src/accountsModel.test.js`)**

```js
// append to src/accountsModel.test.js
import { sortRows } from './accountsModel.js';

describe('sortRows', () => {
  const catsById = new Map([
    ['c_a', { id: 'c_a', name: 'Apples' }],
    ['c_z', { id: 'c_z', name: 'Zebra' }],
  ]);
  // computeRegister output shape: chronological order, each with a running balance.
  const rows = [
    { id: 'r1', date: '2026-04-02', description: 'Netflix', payee: '',      checkNumber: '',     categoryId: 'c_z', amount: -15.99, balance: 84.01 },
    { id: 'r2', date: '2026-04-15', description: 'Apple',   payee: 'ComEd', checkNumber: '1042', categoryId: 'c_a', amount: -96.30, balance: -12.29 },
    { id: 'r3', date: '2026-05-01', description: 'Zelle',   payee: '',      checkNumber: '',     categoryId: 'c_a', amount: 3200,   balance: 3187.71 },
  ];

  it('date descending is the default and reverses chronological order', () => {
    expect(sortRows(rows, { key: 'date', dir: 'desc' }).map(r => r.id)).toEqual(['r3', 'r2', 'r1']);
  });
  it('date ascending keeps chronological order', () => {
    expect(sortRows(rows, { key: 'date', dir: 'asc' }).map(r => r.id)).toEqual(['r1', 'r2', 'r3']);
  });
  it('amount sorts numerically by signed value', () => {
    expect(sortRows(rows, { key: 'amount', dir: 'desc' }).map(r => r.id)).toEqual(['r3', 'r1', 'r2']); // 3200, -15.99, -96.30
    expect(sortRows(rows, { key: 'amount', dir: 'asc' }).map(r => r.id)).toEqual(['r2', 'r1', 'r3']);
  });
  it('description sorts case-insensitively; ascending A→Z', () => {
    expect(sortRows(rows, { key: 'description', dir: 'asc' }).map(r => r.id)).toEqual(['r2', 'r1', 'r3']); // Apple, Netflix, Zelle
  });
  it('category sorts by category name via categoriesById', () => {
    expect(sortRows(rows, { key: 'category', dir: 'asc' }, catsById).map(r => r.id)).toEqual(['r2', 'r3', 'r1']); // Apples, Apples, Zebra (stable)
  });
  it('empty payee/check values sort last when ascending', () => {
    expect(sortRows(rows, { key: 'payee', dir: 'asc' }).map(r => r.id)).toEqual(['r2', 'r1', 'r3']); // ComEd, then empties in chronological order
  });
  it('does not mutate the input array and leaves each row balance untouched', () => {
    const copy = rows.slice();
    const out = sortRows(rows, { key: 'amount', dir: 'asc' });
    expect(rows).toEqual(copy);
    expect(out.find(r => r.id === 'r2').balance).toBe(-12.29);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/accountsModel.test.js`
Expected: FAIL — `sortRows is not a function`.

- [ ] **Step 3: Write minimal implementation (append to `src/accountsModel.js`)**

```js
// append to src/accountsModel.js

// Reorder already-computed register rows by one column. Pure; returns a new
// array; stable (ties fall back to the input's chronological order). Each row's
// `balance` is left untouched — sorting never recomputes the running balance.
export function sortRows(rows, { key = 'date', dir = 'desc' } = {}, categoriesById = null) {
  const indexed = (rows || []).map((r, i) => ({ r, i }));

  const compare = (a, b) => {
    let cmp;
    if (key === 'amount' || key === 'balance') {
      const na = Number.isFinite(a[key]) ? a[key] : 0;
      const nb = Number.isFinite(b[key]) ? b[key] : 0;
      cmp = na - nb;
    } else {
      let sa, sb;
      if (key === 'category') {
        const ca = categoriesById && categoriesById.get(a.categoryId);
        const cb = categoriesById && categoriesById.get(b.categoryId);
        sa = (ca && ca.name ? ca.name : '').toLowerCase();
        sb = (cb && cb.name ? cb.name : '').toLowerCase();
      } else if (key === 'payee' || key === 'checkNumber' || key === 'description') {
        sa = (a[key] || '').toLowerCase();
        sb = (b[key] || '').toLowerCase();
      } else { // 'date' (default)
        sa = a.date || '';
        sb = b.date || '';
      }
      if (sa === sb) cmp = 0;
      else if (sa === '') cmp = 1;   // empty/missing sorts last when ascending
      else if (sb === '') cmp = -1;
      else cmp = sa < sb ? -1 : 1;
    }
    return cmp;
  };

  indexed.sort((a, b) => {
    let cmp = compare(a.r, b.r);
    if (cmp === 0) cmp = a.i - b.i; // stable tie-break on chronological index
    return dir === 'asc' ? cmp : -cmp;
  });
  return indexed.map(({ r }) => r);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/accountsModel.test.js`
Expected: PASS (all blocks, including the Phase-1 ones).

- [ ] **Step 5: Commit**

```bash
git add src/accountsModel.js src/accountsModel.test.js
git commit -m "feat(register): sortRows pure helper for column sorting"
```

---

## Task 2: Wire sorting into the Register (sorting feature)

**Files:**
- Modify: `src/Register.jsx`
- Modify: `src/App.css`
- Test: `src/Register.test.jsx`

- [ ] **Step 1: Add the failing tests (append inside the existing `describe('Register', …)` block in `src/Register.test.jsx`, before its closing `});`)**

```jsx
  it('defaults to date-descending (newest first)', () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    const descCells = screen.getAllByText(/Walmart|Netflix/).map(n => n.textContent);
    expect(descCells[0]).toBe('Walmart'); // May 5 before Apr 2
  });

  it('clicking the Date header reverses to oldest-first, and again restores newest-first', async () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /date/i }));
    expect(screen.getAllByText(/Walmart|Netflix/).map(n => n.textContent)[0]).toBe('Netflix'); // asc → Apr first
    await userEvent.click(screen.getByRole('button', { name: /date/i }));
    expect(screen.getAllByText(/Walmart|Netflix/).map(n => n.textContent)[0]).toBe('Walmart'); // desc again
  });

  it('clicking the Amount header sorts by amount (desc first, then asc)', async () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /amount/i }));
    // amounts: Walmart -96.20, Netflix -15.99 → desc puts the larger (-15.99) first
    expect(screen.getAllByText(/Walmart|Netflix/).map(n => n.textContent)[0]).toBe('Netflix');
    await userEvent.click(screen.getByRole('button', { name: /amount/i }));
    expect(screen.getAllByText(/Walmart|Netflix/).map(n => n.textContent)[0]).toBe('Walmart');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/Register.test.jsx`
Expected: FAIL — no `button` named `/date/i` (headers aren't clickable yet).

- [ ] **Step 3: Replace `src/Register.jsx` with the sortable version**

```jsx
// src/Register.jsx
import React, { useMemo, useState } from 'react';
import { computeRegister, filterTransactions, sortRows, layoutFor, accountClass, accountBalance } from './accountsModel.js';
import TransactionRow from './TransactionRow.jsx';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

// Column definitions per layout. `key` is the sortRows key; `defaultDir` is the
// direction used the first time a column is clicked.
const COLUMNS = {
  compact: [
    { key: 'date',        label: 'Date',        defaultDir: 'desc' },
    { key: 'description', label: 'Description', defaultDir: 'asc'  },
    { key: 'category',    label: 'Category',    defaultDir: 'asc'  },
    { key: 'amount',      label: 'Amount',      defaultDir: 'desc', right: true },
    { key: 'balance',     label: 'Balance',     defaultDir: 'desc', right: true },
  ],
  bank: [
    { key: 'date',        label: 'Date',    defaultDir: 'desc' },
    { key: 'checkNumber', label: 'Chk#',    defaultDir: 'asc'  },
    { key: 'payee',       label: 'Payee',   defaultDir: 'asc'  },
    { key: 'category',    label: 'Category',defaultDir: 'asc'  },
    { key: 'description', label: 'Notes',   defaultDir: 'asc'  },
    { key: 'amount',      label: 'Payment', defaultDir: 'asc',  right: true },
    { key: 'amount',      label: 'Deposit', defaultDir: 'desc', right: true },
    { key: 'balance',     label: 'Balance', defaultDir: 'desc', right: true },
  ],
};

export default function Register({ account, transactions, categories, categoriesById, typesById, onEditTransaction, onAddTransaction }) {
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });

  const layout = layoutFor(account.type, typesById);
  const klass = accountClass(account.type, typesById);
  const balance = accountBalance(account, transactions);
  const columns = COLUMNS[layout] || COLUMNS.compact;

  const rows = useMemo(() => {
    const computed = computeRegister(account, transactions);
    const filtered = filterTransactions(computed, { search, month: month || null, categoryId: categoryId || null }, categoriesById);
    return sortRows(filtered, sort, categoriesById);
  }, [account, transactions, search, month, categoryId, categoriesById, sort]);

  const onHeaderClick = (col) => {
    setSort(prev => prev.key === col.key
      ? { key: col.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key: col.key, dir: col.defaultDir });
  };

  const balanceLabel = klass === 'liability' ? `Owed: ${money(Math.abs(Math.min(0, balance)))}` : `Balance: ${money(balance)}`;

  return (
    <div className="register">
      <div className="register-header">
        <h2 className="register-title"><span className="register-icon" aria-hidden="true">{account.icon}</span> {account.name}</h2>
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
          <tr>
            {columns.map((col, idx) => {
              const active = sort.key === col.key;
              const arrow = active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
              return (
                <th key={`${col.key}-${idx}`} className={col.right ? 'right' : undefined}>
                  <button type="button" className={`th-sort${active ? ' th-sort-active' : ''}`} onClick={() => onHeaderClick(col)}>
                    {col.label}{arrow}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="register-empty">No transactions.</td></tr>
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

> Note: `typesById` is optional; when omitted, `layoutFor`/`accountClass` fall back to the built-in registry (so this task works before App is updated to pass it in Task 8).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/Register.test.jsx`
Expected: PASS (existing + 3 new sorting tests).

- [ ] **Step 5: Add styles (append to `src/App.css`)**

```css
/* Sortable register headers */
.th-sort { background: transparent; border: none; color: inherit; font: inherit; text-transform: inherit; letter-spacing: inherit; cursor: pointer; padding: 0; }
.register-table th.right .th-sort { width: 100%; text-align: right; }
.th-sort:hover { color: #5b8dff; }
.th-sort-active { color: #5b8dff; }
```

- [ ] **Step 6: Commit**

```bash
git add src/Register.jsx src/Register.test.jsx src/App.css
git commit -m "feat(register): clickable column sorting with direction toggle"
```

---

## Task 3: Account types as data — `accountsModel` foundation

**Files:**
- Modify: `src/accountsModel.js`
- Test: `src/accountsModel.test.js`

This replaces the hardcoded `ACCOUNT_TYPES`/`GROUP_ORDER` constants with a default **array** seed plus derived back-compat exports, adds a safe fallback and `groupOrder`, and makes the classification helpers accept an optional `typesById`. All Phase-1 calls keep working via defaults.

- [ ] **Step 1: Add the failing tests (append to `src/accountsModel.test.js`)**

```js
// append to src/accountsModel.test.js
import { DEFAULT_ACCOUNT_TYPES, groupOrder } from './accountsModel.js';

describe('account types as data', () => {
  it('DEFAULT_ACCOUNT_TYPES is an ordered array of the 7 built-ins with ids', () => {
    expect(DEFAULT_ACCOUNT_TYPES.map(t => t.id)).toEqual(
      ['bank', 'investment', 'credit_card', 'loan', 'mortgage', 'person', 'untyped']
    );
    for (const t of DEFAULT_ACCOUNT_TYPES) {
      expect(typeof t.label).toBe('string');
      expect(['asset', 'liability', 'offsheet']).toContain(t.klass);
      expect(['bank', 'compact']).toContain(t.layout);
      expect(t.builtin).toBe(true);
    }
  });

  it('helpers resolve against a custom typesById registry', () => {
    const custom = new Map([['hsa', { id: 'hsa', label: 'HSA', klass: 'asset', layout: 'bank', group: 'Health', icon: '🏥' }]]);
    expect(accountClass('hsa', custom)).toBe('asset');
    expect(layoutFor('hsa', custom)).toBe('bank');
    expect(groupFor('hsa', custom)).toBe('Health');
    expect(isOnBalanceSheet('hsa', custom)).toBe(true);
  });

  it('unknown / deleted type ids fall back to off-sheet / compact / Unassigned', () => {
    const empty = new Map();
    expect(accountClass('gone', empty)).toBe('offsheet');
    expect(layoutFor('gone', empty)).toBe('compact');
    expect(groupFor('gone', empty)).toBe('Unassigned');
    expect(isOnBalanceSheet('gone', empty)).toBe(false);
  });

  it('householdTotals honors a custom registry', () => {
    const types = new Map([
      ['cash', { id: 'cash', klass: 'asset',     layout: 'bank',    group: 'Cash' }],
      ['card', { id: 'card', klass: 'liability', layout: 'compact', group: 'Debt' }],
    ]);
    const accounts = [
      { id: 'a1', type: 'cash', openingBalance: 1000 },
      { id: 'a2', type: 'card', openingBalance: -200 },
    ];
    const totals = householdTotals(accounts, [], types);
    expect(totals.assets).toBe(1000);
    expect(totals.owed).toBe(200);
    expect(totals.netWorth).toBe(800);
  });

  it('groupOrder lists groups in first-seen order with Unassigned last', () => {
    const types = [
      { id: 'a', group: 'Cash' },
      { id: 'b', group: 'Unassigned' },
      { id: 'c', group: 'Investments' },
      { id: 'd', group: 'Cash' },
    ];
    expect(groupOrder(types)).toEqual(['Cash', 'Investments', 'Unassigned']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/accountsModel.test.js`
Expected: FAIL — `DEFAULT_ACCOUNT_TYPES`/`groupOrder` not exported; helpers ignore the second arg.

- [ ] **Step 3: Edit the top of `src/accountsModel.js`**

Replace the existing `ACCOUNT_TYPES` / `GROUP_ORDER` / `typeOrFallback` / `accountClass` / `layoutFor` / `groupFor` / `isOnBalanceSheet` block (everything from `export const ACCOUNT_TYPES = {` through the end of `export function isOnBalanceSheet`) with:

```js
// Default (built-in) account types as an ordered array — the seed for
// useAccountTypes. `klass` drives net-worth inclusion; `layout` drives register
// columns; `group` is the sidebar section header. Ids are stable so existing
// accounts (which store `type: '<id>'`) keep resolving.
export const DEFAULT_ACCOUNT_TYPES = [
  { id: 'bank',        label: 'Bank / Cash',       klass: 'asset',     layout: 'bank',    group: 'Cash & Bank',          icon: '🏦', builtin: true },
  { id: 'investment',  label: 'Investments',       klass: 'asset',     layout: 'compact', group: 'Investments',          icon: '📈', builtin: true },
  { id: 'credit_card', label: 'Credit card',       klass: 'liability', layout: 'compact', group: 'Credit cards & loans', icon: '💳', builtin: true },
  { id: 'loan',        label: 'Loan',              klass: 'liability', layout: 'compact', group: 'Credit cards & loans', icon: '🏷️', builtin: true },
  { id: 'mortgage',    label: 'Mortgage',          klass: 'liability', layout: 'compact', group: 'Credit cards & loans', icon: '🏠', builtin: true },
  { id: 'person',      label: 'Person / External', klass: 'offsheet',  layout: 'compact', group: 'People & external',    icon: '👤', builtin: true },
  { id: 'untyped',     label: 'Unassigned',        klass: 'offsheet',  layout: 'compact', group: 'Unassigned',           icon: '🏦', builtin: true },
];

// Returned for any account whose type id is not in the registry (e.g. a deleted
// type). Keeps balances and layout safe.
const FALLBACK_TYPE = { id: 'untyped', label: 'Unassigned', klass: 'offsheet', layout: 'compact', group: 'Unassigned', icon: '🏦', builtin: true };

export const DEFAULT_ACCOUNT_TYPES_BY_ID = new Map(DEFAULT_ACCOUNT_TYPES.map(t => [t.id, t]));

// Back-compat exports (built-in registry as an object + fixed group order).
export const ACCOUNT_TYPES = Object.fromEntries(DEFAULT_ACCOUNT_TYPES.map(t => [t.id, t]));

const resolveType = (typeId, typesById) =>
  (typesById || DEFAULT_ACCOUNT_TYPES_BY_ID).get(typeId) || FALLBACK_TYPE;

export function accountClass(typeId, typesById) { return resolveType(typeId, typesById).klass; }
export function layoutFor(typeId, typesById)    { return resolveType(typeId, typesById).layout; }
export function groupFor(typeId, typesById)     { return resolveType(typeId, typesById).group; }

export function isOnBalanceSheet(typeId, typesById) {
  const k = accountClass(typeId, typesById);
  return k === 'asset' || k === 'liability';
}

// Sidebar group order, derived from the types array: first-seen order, with the
// fallback group ('Unassigned') always present and last.
export function groupOrder(types) {
  const FALLBACK_GROUP = 'Unassigned';
  const seen = [];
  for (const t of types || []) {
    if (t && t.group && t.group !== FALLBACK_GROUP && !seen.includes(t.group)) seen.push(t.group);
  }
  return [...seen, FALLBACK_GROUP];
}

export const GROUP_ORDER = groupOrder(DEFAULT_ACCOUNT_TYPES);
```

- [ ] **Step 4: Update `householdTotals` to accept `typesById`**

In `src/accountsModel.js`, change the `householdTotals` signature and its `accountClass` call:

```js
export function householdTotals(accounts, transactions, typesById) {
  let netWorth = 0, assets = 0, owed = 0;
  for (const a of accounts || []) {
    const k = accountClass(a.type, typesById);
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

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/accountsModel.test.js`
Expected: PASS (Phase-1 tests still pass via defaults; new ones pass).

- [ ] **Step 6: Commit**

```bash
git add src/accountsModel.js src/accountsModel.test.js
git commit -m "feat(accounts): account types as data with safe fallback and groupOrder"
```

---

## Task 4: `useAccountTypes` hook

**Files:**
- Create: `src/useAccountTypes.js`
- Test: `src/useAccountTypes.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// src/useAccountTypes.test.jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useAccountTypes from './useAccountTypes.js';

beforeEach(() => localStorage.clear());

describe('useAccountTypes', () => {
  it('seeds the 7 built-ins when storage is empty', () => {
    const { result } = renderHook(() => useAccountTypes());
    expect(result.current.types).toHaveLength(7);
    expect(result.current.typesById.get('bank').label).toBe('Bank / Cash');
  });

  it('hydrates from storage when present', () => {
    localStorage.setItem('billtracker-account-types', JSON.stringify([
      { id: 'hsa', label: 'HSA', klass: 'asset', layout: 'compact', group: 'Health', icon: '🏥', builtin: false },
    ]));
    const { result } = renderHook(() => useAccountTypes());
    expect(result.current.types).toHaveLength(1);
    expect(result.current.types[0].label).toBe('HSA');
  });

  it('addType appends a non-builtin type and returns its id; updateType patches; deleteType removes', () => {
    const { result } = renderHook(() => useAccountTypes());
    let id;
    act(() => { id = result.current.addType({ label: 'HSA', klass: 'asset', layout: 'compact', group: 'Health', icon: '🏥' }); });
    expect(result.current.types).toHaveLength(8);
    const created = result.current.typesById.get(id);
    expect(created.label).toBe('HSA');
    expect(created.builtin).toBe(false);
    act(() => { result.current.updateType(id, { label: 'HSA (Fidelity)' }); });
    expect(result.current.typesById.get(id).label).toBe('HSA (Fidelity)');
    expect(result.current.typesById.get(id).id).toBe(id);
    act(() => { result.current.deleteType(id); });
    expect(result.current.types).toHaveLength(7);
  });

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useAccountTypes());
    act(() => { result.current.addType({ label: 'HSA', klass: 'asset', layout: 'compact', group: 'Health' }); });
    expect(JSON.parse(localStorage.getItem('billtracker-account-types'))).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useAccountTypes.test.jsx`
Expected: FAIL — `Failed to resolve import "./useAccountTypes.js"`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/useAccountTypes.js
import { useState, useCallback, useEffect, useMemo } from 'react';
import { nanoid } from 'nanoid';
import { DEFAULT_ACCOUNT_TYPES } from './accountsModel.js';

const TYPES_KEY = 'billtracker-account-types';

// Owns the account-type registry: load/seed/persist + CRUD. Mirrors useCategories.
export default function useAccountTypes() {
  const [types, setTypes] = useState(() => {
    try {
      const saved = localStorage.getItem(TYPES_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* fall through to seed */ }
    return DEFAULT_ACCOUNT_TYPES.map(t => ({ ...t }));
  });
  const [storageError, setStorageError] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(TYPES_KEY, JSON.stringify(types));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (storageError) setStorageError(null);
    } catch (e) {
      console.error('Failed to save account types:', e);
      setStorageError({ message: "Couldn't save account types — storage full." });
    }
  }, [types]); // eslint-disable-line react-hooks/exhaustive-deps

  const typesById = useMemo(() => new Map(types.map(t => [t.id, t])), [types]);

  const addType = useCallback(({ label, klass = 'offsheet', layout = 'compact', group = 'Unassigned', icon = '🏷️' }) => {
    const id = nanoid(8);
    setTypes(prev => [...prev, {
      id,
      label: (label || '').trim() || 'Untitled',
      klass: ['asset', 'liability', 'offsheet'].includes(klass) ? klass : 'offsheet',
      layout: layout === 'bank' ? 'bank' : 'compact',
      group: (group || '').trim() || 'Unassigned',
      icon: icon || '🏷️',
      builtin: false,
    }]);
    return id;
  }, []);

  const updateType = useCallback((id, patch) => {
    setTypes(prev => prev.map(t => t.id === id ? { ...t, ...patch, id: t.id } : t));
  }, []);

  const deleteType = useCallback((id) => {
    setTypes(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearStorageError = useCallback(() => setStorageError(null), []);

  return { types, typesById, addType, updateType, deleteType, storageError, clearStorageError };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useAccountTypes.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/useAccountTypes.js src/useAccountTypes.test.jsx
git commit -m "feat(accounts): useAccountTypes hook (seed/persist/CRUD)"
```

---

## Task 5: `AccountTypeEditor` (create / edit / delete dialog)

**Files:**
- Create: `src/AccountTypeEditor.jsx`
- Test: `src/AccountTypeEditor.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// src/AccountTypeEditor.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountTypeEditor from './AccountTypeEditor.jsx';

describe('AccountTypeEditor', () => {
  afterEach(() => cleanup());

  it('new type: saves label, class, layout, group', async () => {
    const onSave = vi.fn();
    render(<AccountTypeEditor type={null} existingGroups={['Investments']} onSave={onSave} onDelete={() => {}} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/label/i), 'HSA');
    await userEvent.selectOptions(screen.getByLabelText(/class/i), 'asset');
    await userEvent.selectOptions(screen.getByLabelText(/layout/i), 'bank');
    await userEvent.type(screen.getByLabelText(/group/i), 'Health');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    const saved = onSave.mock.calls[0][0];
    expect(saved.label).toBe('HSA');
    expect(saved.klass).toBe('asset');
    expect(saved.layout).toBe('bank');
    expect(saved.group).toBe('Health');
  });

  it('editing pre-fills the class and shows a delete button', async () => {
    const onDelete = vi.fn();
    render(<AccountTypeEditor type={{ id: 't1', label: 'Loan', klass: 'liability', layout: 'compact', group: 'Credit cards & loans', icon: '🏷️' }} existingGroups={[]} onSave={() => {}} onDelete={onDelete} onClose={() => {}} />);
    expect(screen.getByLabelText(/class/i).value).toBe('liability');
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith('t1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/AccountTypeEditor.test.jsx`
Expected: FAIL — cannot resolve `./AccountTypeEditor.jsx`.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/AccountTypeEditor.jsx
import React, { useState } from 'react';

const CLASS_OPTIONS = [
  { value: 'asset',     label: 'Asset (adds to net worth)' },
  { value: 'liability', label: 'Liability (amount owed)' },
  { value: 'offsheet',  label: 'Off balance sheet (tracker)' },
];

export default function AccountTypeEditor({ type, existingGroups = [], onSave, onDelete, onClose }) {
  const isEdit = !!type;
  const [icon, setIcon] = useState(type?.icon || '🏷️');
  const [label, setLabel] = useState(type?.label || '');
  const [klass, setKlass] = useState(type?.klass || 'offsheet');
  const [layout, setLayout] = useState(type?.layout || 'compact');
  const [group, setGroup] = useState(type?.group || '');

  const save = () => {
    onSave({
      ...(type || {}),
      label: label.trim() || 'Untitled',
      klass,
      layout,
      group: group.trim() || 'Unassigned',
      icon: icon || '🏷️',
    });
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">{isEdit ? 'Edit account type' : 'New account type'}</h2>

        <label className="field"><span>Icon</span>
          <input type="text" aria-label="Icon" value={icon} onChange={(e) => setIcon(e.target.value)} className="input" maxLength={4} />
        </label>
        <label className="field"><span>Label</span>
          <input type="text" aria-label="Label" value={label} onChange={(e) => setLabel(e.target.value)} className="input" />
        </label>
        <label className="field"><span>Class</span>
          <select aria-label="Class" value={klass} onChange={(e) => setKlass(e.target.value)} className="select">
            {CLASS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="field"><span>Register layout</span>
          <select aria-label="Layout" value={layout} onChange={(e) => setLayout(e.target.value)} className="select">
            <option value="compact">Compact</option>
            <option value="bank">Bank (8-column)</option>
          </select>
        </label>
        <label className="field"><span>Group</span>
          <input type="text" aria-label="Group" value={group} onChange={(e) => setGroup(e.target.value)} className="input" list="account-type-groups" />
          <datalist id="account-type-groups">
            {existingGroups.map(g => <option key={g} value={g} />)}
          </datalist>
        </label>

        <div className="dialog-actions">
          {isEdit && <button type="button" className="btn btn-danger" onClick={() => onDelete(type.id)}>Delete</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/AccountTypeEditor.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/AccountTypeEditor.jsx src/AccountTypeEditor.test.jsx
git commit -m "feat(accounts): AccountTypeEditor dialog"
```

---

## Task 6: `AccountTypesScreen` (manage + delete-with-reassign)

**Files:**
- Create: `src/AccountTypesScreen.jsx`
- Modify: `src/App.css`
- Test: `src/AccountTypesScreen.test.jsx`

`onDeleteType(id, reassignToId)` is supplied by `App`: when `reassignToId` is non-null, App reassigns the using accounts before removing the type; when null, the type is unused and removed directly.

- [ ] **Step 1: Write the failing test**

```jsx
// src/AccountTypesScreen.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountTypesScreen from './AccountTypesScreen.jsx';
import { DEFAULT_ACCOUNT_TYPES } from './accountsModel.js';

const types = DEFAULT_ACCOUNT_TYPES;

describe('AccountTypesScreen', () => {
  afterEach(() => cleanup());

  it('lists every type and opens the editor for + New type', async () => {
    render(<AccountTypesScreen types={types} accounts={[]} onClose={() => {}} onSaveType={() => {}} onDeleteType={() => {}} />);
    expect(screen.getByText('Bank / Cash')).toBeTruthy();
    expect(screen.getByText('Credit card')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /new type/i }));
    expect(screen.getByText('New account type')).toBeTruthy();
  });

  it('deleting an UNUSED type calls onDeleteType(id, null)', async () => {
    const onDeleteType = vi.fn();
    render(<AccountTypesScreen types={types} accounts={[]} onClose={() => {}} onSaveType={() => {}} onDeleteType={onDeleteType} />);
    await userEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]); // 'bank'
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDeleteType).toHaveBeenCalledWith('bank', null);
  });

  it('deleting an IN-USE type prompts to reassign and passes the chosen target', async () => {
    const onDeleteType = vi.fn();
    const accounts = [{ id: 'a1', name: 'Chase', type: 'bank' }];
    render(<AccountTypesScreen types={types} accounts={accounts} onClose={() => {}} onSaveType={() => {}} onDeleteType={onDeleteType} />);
    await userEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]); // 'bank' (1 account uses it)
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(screen.getByText(/account uses this type/i)).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText(/reassign to/i), 'investment');
    await userEvent.click(screen.getByRole('button', { name: /delete & reassign/i }));
    expect(onDeleteType).toHaveBeenCalledWith('bank', 'investment');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/AccountTypesScreen.test.jsx`
Expected: FAIL — cannot resolve `./AccountTypesScreen.jsx`.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/AccountTypesScreen.jsx
import React, { useState, useMemo } from 'react';
import AccountTypeEditor from './AccountTypeEditor.jsx';

export default function AccountTypesScreen({ types, accounts, onClose, onSaveType, onDeleteType }) {
  const [editing, setEditing] = useState(null);          // { type } | { type: null } | null
  const [pendingDelete, setPendingDelete] = useState(null); // { type, count }
  const [reassignTo, setReassignTo] = useState('');

  const existingGroups = useMemo(
    () => [...new Set(types.map(t => t.group).filter(Boolean))],
    [types]
  );
  const usageCount = (typeId) => (accounts || []).filter(a => a.type === typeId).length;

  const requestDelete = (type) => {
    const count = usageCount(type.id);
    setEditing(null);
    if (count === 0) { onDeleteType(type.id, null); return; }
    const fallback = types.find(t => t.id !== type.id);
    setReassignTo(fallback ? fallback.id : '');
    setPendingDelete({ type, count });
  };

  return (
    <div className="screen-overlay">
      <div className="screen">
        <div className="screen-header">
          <h2 className="screen-title">Account Types</h2>
          <button type="button" className="btn" onClick={onClose}>Done</button>
        </div>

        <div className="type-list">
          {types.map(t => (
            <div key={t.id} className="type-row">
              <span className="type-row-icon" aria-hidden="true">{t.icon}</span>
              <span className="type-row-label">{t.label}</span>
              <span className="type-row-meta">{t.klass} · {t.layout} · {t.group}</span>
              <button type="button" className="btn" onClick={() => setEditing({ type: t })}>Edit</button>
            </div>
          ))}
        </div>

        <button type="button" className="btn btn-primary type-add" onClick={() => setEditing({ type: null })}>+ New type</button>

        {editing && (
          <AccountTypeEditor
            type={editing.type}
            existingGroups={existingGroups}
            onSave={(data) => { onSaveType(data); setEditing(null); }}
            onDelete={(id) => { const t = types.find(x => x.id === id); if (t) requestDelete(t); }}
            onClose={() => setEditing(null)}
          />
        )}

        {pendingDelete && (
          <div className="dialog-overlay" onClick={() => setPendingDelete(null)}>
            <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
              <h2 className="dialog-title">Delete “{pendingDelete.type.label}”?</h2>
              <p className="dialog-body">{pendingDelete.count} account{pendingDelete.count === 1 ? '' : 's'} uses this type. Move {pendingDelete.count === 1 ? 'it' : 'them'} to:</p>
              <select aria-label="Reassign to" className="select" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                {types.filter(t => t.id !== pendingDelete.type.id).map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <div className="dialog-actions">
                <button type="button" className="btn" onClick={() => setPendingDelete(null)}>Cancel</button>
                <button type="button" className="btn btn-danger" onClick={() => { onDeleteType(pendingDelete.type.id, reassignTo); setPendingDelete(null); }}>Delete &amp; reassign</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/AccountTypesScreen.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Add styles (append to `src/App.css`)**

```css
/* Account Types screen */
.type-list { display: flex; flex-direction: column; gap: 0.25rem; margin: 0.5rem 0; }
.type-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0.6rem; border: 1px solid var(--border, #2a2a3a); border-radius: 8px; }
.type-row-label { font-weight: 600; }
.type-row-meta { margin-left: auto; font-size: 0.72rem; color: var(--muted, #8a8a9a); }
.type-row .btn { margin-left: 0.5rem; }
.type-add { margin-top: 0.5rem; }
```

> Note: `.screen-overlay`, `.screen`, `.screen-header`, `.screen-title` are reused from the existing `ManageCategoriesScreen` styles. If they are absent, mirror that screen's container classes; otherwise no new rules are needed for them.

- [ ] **Step 6: Commit**

```bash
git add src/AccountTypesScreen.jsx src/AccountTypesScreen.test.jsx src/App.css
git commit -m "feat(accounts): AccountTypesScreen with delete-and-reassign"
```

---

## Task 7: Thread the type registry through the consumers

**Files:**
- Modify: `src/AccountList.jsx`
- Test: `src/AccountList.test.jsx`
- Modify: `src/TransactionEditor.jsx`
- Modify: `src/AccountEditor.jsx`

`Register.jsx` already accepts `typesById` (Task 2). This task updates the remaining consumers. New props default to the built-in registry so existing tests keep passing.

- [ ] **Step 1: Add the failing test (append inside the existing `describe('AccountList', …)` block in `src/AccountList.test.jsx`)**

```jsx
  it('groups accounts under a custom type using the provided types registry', () => {
    const customTypes = [
      { id: 'hsa', label: 'HSA', klass: 'asset', layout: 'compact', group: 'Health', icon: '🏥', builtin: false },
    ];
    const accts = [{ id: 'a_h', name: 'Fidelity HSA', type: 'hsa', icon: '🏥', openingBalance: 500 }];
    render(<AccountList accounts={accts} transactions={[]} types={customTypes} selectedId={null} onSelect={() => {}} onAddAccount={() => {}} />);
    expect(screen.getByText('Health')).toBeTruthy();
    expect(screen.getByText('Fidelity HSA')).toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/AccountList.test.jsx`
Expected: FAIL — "Health" group not rendered (AccountList ignores `types`).

- [ ] **Step 3: Update `src/AccountList.jsx`**

Replace its import line and the `grouped`/`GROUP_ORDER` usage. Final file:

```jsx
// src/AccountList.jsx
import React, { useMemo } from 'react';
import { groupOrder, groupFor, accountClass, accountBalance, householdTotals, DEFAULT_ACCOUNT_TYPES } from './accountsModel.js';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function AccountList({ accounts, transactions, types = DEFAULT_ACCOUNT_TYPES, selectedId, onSelect, onAddAccount }) {
  const typesById = useMemo(() => new Map(types.map(t => [t.id, t])), [types]);
  const order = useMemo(() => groupOrder(types), [types]);
  const totals = useMemo(() => householdTotals(accounts, transactions, typesById), [accounts, transactions, typesById]);

  const grouped = useMemo(() => {
    const map = new Map(order.map(g => [g, []]));
    for (const a of accounts) {
      const g = groupFor(a.type, typesById);
      (map.get(g) || map.get('Unassigned')).push(a);
    }
    return map;
  }, [accounts, order, typesById]);

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

      {order.map(group => {
        const list = grouped.get(group) || [];
        if (list.length === 0) return null;
        return (
          <div key={group} className="account-group">
            <div className="account-group-label">{group}</div>
            {list.map(a => {
              const bal = accountBalance(a, transactions);
              const klass = accountClass(a.type, typesById);
              const display = klass === 'liability' ? -Math.abs(bal) : bal;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`account-row${a.id === selectedId ? ' account-row-selected' : ''}`}
                  onClick={() => onSelect(a.id)}
                >
                  <span className="account-row-name"><span className="account-row-icon" aria-hidden="true">{a.icon}</span> {a.name}</span>
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

- [ ] **Step 4: Update `src/TransactionEditor.jsx`**

Change the import and the `isBank` line so layout resolves against the live registry (default keeps existing tests green):

```jsx
import { layoutFor, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';
```

and the component signature + `isBank`:

```jsx
export default function TransactionEditor({ account, transaction, categories, typesById = DEFAULT_ACCOUNT_TYPES_BY_ID, onSave, onDelete, onClose }) {
```
```jsx
  const isBank = layoutFor(account.type, typesById) === 'bank';
```

- [ ] **Step 5: Update `src/AccountEditor.jsx`**

Replace the hardcoded `TYPE_OPTIONS`/`ACCOUNT_TYPES` import with a `types` prop (default built-ins):

```jsx
// src/AccountEditor.jsx
import React, { useState } from 'react';
import { DEFAULT_ACCOUNT_TYPES } from './accountsModel.js';

export default function AccountEditor({ account, types = DEFAULT_ACCOUNT_TYPES, onSave, onDelete, onClose }) {
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
            {types.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
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

- [ ] **Step 6: Run the affected suites**

Run: `npx vitest run src/AccountList.test.jsx src/TransactionEditor.test.jsx src/AccountEditor.test.jsx src/Register.test.jsx`
Expected: PASS (existing tests pass via defaults; new AccountList custom-type test passes).

- [ ] **Step 7: Commit**

```bash
git add src/AccountList.jsx src/AccountList.test.jsx src/TransactionEditor.jsx src/AccountEditor.jsx
git commit -m "feat(accounts): thread account-type registry through list/editors"
```

---

## Task 8: Wire into App; export account types

**Files:**
- Modify: `src/exportArchive.js`
- Test: `src/exportArchive.test.js`
- Modify: `src/App.jsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add the failing export test (append inside `describe('export v4', …)` in `src/exportArchive.test.js`)**

```js
  it('includes accountTypes in data.json when provided', () => {
    const accountTypes = [{ id: 'hsa', label: 'HSA', klass: 'asset', layout: 'compact', group: 'Health', icon: '🏥', builtin: false }];
    const bytes = buildArchive({ accounts, transactions, categories, accountTypes, schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-12T00:00:00Z') });
    const data = JSON.parse(strFromU8(unzipSync(bytes)['data.json']));
    expect(data.accountTypes).toHaveLength(1);
    expect(data.accountTypes[0].id).toBe('hsa');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/exportArchive.test.js`
Expected: FAIL — `data.accountTypes` is undefined.

- [ ] **Step 3: Update `src/exportArchive.js`**

Change `buildDataJson` and `buildArchive` to carry `accountTypes`:

```js
export function buildDataJson(accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now) {
  return JSON.stringify({
    schemaVersion,
    exportedAt: now.toISOString(),
    appVersion,
    accounts: accounts || [],
    transactions: transactions || [],
    categories: categories || [],
    accountTypes: accountTypes || [],
  }, null, 2);
}

export function buildArchive({ accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now }) {
  const categoriesById = new Map((categories || []).map(c => [c.id, c]));
  const jsonString = buildDataJson(accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now);
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
Expected: PASS (existing + new accountTypes test).

- [ ] **Step 5: Wire `App.jsx`**

5a. Add imports after `import useLedger from './useLedger.js';`:

```jsx
import useAccountTypes from './useAccountTypes.js';
import AccountTypesScreen from './AccountTypesScreen.jsx';
```

5b. After `const cats = useCategories();` add:

```jsx
  const accountTypes = useAccountTypes();
```

5c. Account-type handlers — add next to the account CRUD handlers:

```jsx
  const saveAccountType = (data) => {
    if (data.id) accountTypes.updateType(data.id, data);
    else accountTypes.addType(data);
  };
  const deleteAccountType = (id, reassignToId) => {
    pushHistory();
    if (reassignToId) {
      for (const a of ledger.accounts) {
        if (a.type === id) ledger.updateAccount(a.id, { type: reassignToId });
      }
    }
    accountTypes.deleteType(id);
  };
```

5d. `exportData` — pass `accountTypes` into `buildArchive`:

```jsx
    const bytes = buildArchive({
      accounts: ledger.accounts, transactions: ledger.transactions,
      categories: cats.categories, accountTypes: accountTypes.types,
      schemaVersion: 4, appVersion: pkg.version, now: new Date(),
    });
```

5e. Add the screen render — alongside the `manage-categories` screen block:

```jsx
      {screen === 'account-types' && (
        <AccountTypesScreen
          types={accountTypes.types}
          accounts={ledger.accounts}
          onClose={() => setScreen('main')}
          onSaveType={saveAccountType}
          onDeleteType={deleteAccountType}
        />
      )}
```

5f. Add a header button — after the `☰ Categories` button:

```jsx
            <button type="button" onClick={() => setScreen('account-types')} className="btn">▤ Account Types</button>
```

5g. Pass the registry into the consumers — update the three render sites:

```jsx
          <AccountList
            accounts={ledger.accounts}
            transactions={ledger.transactions}
            types={accountTypes.types}
            selectedId={selectedAccount?.id ?? null}
            onSelect={setSelectedAccountId}
            onAddAccount={() => setEditingAccount({ mode: 'new' })}
          />
```
```jsx
      {editingAccount && (
        <AccountEditor
          account={editingAccount.account || null}
          types={accountTypes.types}
          onSave={saveAccount} onDelete={deleteAccount} onClose={() => setEditingAccount(null)}
        />
      )}
      {editingTxn && selectedAccount && (
        <TransactionEditor
          account={selectedAccount}
          transaction={editingTxn.transaction || null}
          categories={cats.categories}
          typesById={accountTypes.typesById}
          onSave={saveTransaction} onDelete={deleteTransaction} onClose={() => setEditingTxn(null)}
        />
      )}
```
```jsx
                <Register
                  account={selectedAccount}
                  transactions={ledger.transactions}
                  categories={cats.categories}
                  categoriesById={categoriesById}
                  typesById={accountTypes.typesById}
                  onEditTransaction={(t) => setEditingTxn({ mode: 'edit', accountId: selectedAccount.id, transaction: t })}
                  onAddTransaction={(accountId) => setEditingTxn({ mode: 'new', accountId })}
                />
```

- [ ] **Step 6: Run lint and the full suite**

Run: `npm run lint`
Expected: no NEW errors beyond the pre-existing ones in untouched files (CategoryEditor, ColorPicker, IconPicker, spendingMath). If lint flags an unused import you introduced, remove it.

Run: `npx vitest run`
Expected: PASS (all suites).

- [ ] **Step 7: Manual smoke (dev server)**

Run from the worktree: `npm run dev`, open `http://localhost:5173`. Verify: `▤ Account Types` opens the screen; `+ New type` creates a type (e.g. "HSA", asset, compact, group "Health"); the new type appears in the Account editor's Type dropdown; assigning it groups the account under "Health" in the sidebar and includes it in net worth; deleting a type that accounts use prompts to reassign. In a register, clicking a column header sorts by it and clicking again reverses; Balance values stay each row's real balance.

- [ ] **Step 8: Commit**

```bash
git add src/exportArchive.js src/exportArchive.test.js src/App.jsx src/App.css
git commit -m "feat(accounts): wire account types into app shell; export account types"
```

---

## Self-Review (completed during planning)

**1. Spec coverage:**
- Register sorting (all columns, toggle, default date-desc, balance stays per-row) → Tasks 1–2. ✓
- `sortRows` pure helper → Task 1. ✓
- Types as stored data + full control (label/class/layout/group/icon) → Tasks 3–5. ✓
- Safe fallback for unknown ids + derived `groupOrder` → Task 3. ✓
- `useAccountTypes` (seed/persist/CRUD) → Task 4. ✓
- Dedicated Account Types screen + editor → Tasks 5–6. ✓
- Delete-in-use → reassign → Task 6 (UI) + Task 8 (App reassign via `ledger.updateAccount`). ✓
- Thread registry through AccountList/Register/TransactionEditor/AccountEditor → Tasks 2 (Register) + 7. ✓
- Export `accountTypes` → Task 8. ✓

**2. Placeholder scan:** No TBD/placeholder steps; every code step contains full code.

**3. Type consistency:** `AccountType` shape `{ id, label, klass, layout, group, icon, builtin }` is identical across `DEFAULT_ACCOUNT_TYPES`, `useAccountTypes`, `AccountTypeEditor`, `AccountTypesScreen`, and export. Helper signatures `accountClass(typeId, typesById)` / `layoutFor` / `groupFor` / `isOnBalanceSheet` / `householdTotals(accounts, transactions, typesById)` and `sortRows(rows, { key, dir }, categoriesById)` match every call site. New props (`types` on AccountList/AccountEditor, `typesById` on Register/TransactionEditor) default to the built-in registry so Phase-1 tests stay green.

**Known interface note:** New props default to built-ins for incremental migration; once Task 8 lands, every live call passes the registry from `useAccountTypes`.
