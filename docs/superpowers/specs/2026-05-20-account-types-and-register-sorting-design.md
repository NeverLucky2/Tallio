# BillTracker — Custom Account Types & Register Column Sorting

**Date:** 2026-05-20
**Status:** Approved for planning
**Branch context:** Builds directly on the Phase-1 accounts revamp (branch `worktree-accounts-revamp-phase-1`, off `master`). Phase 1 is not yet merged; these features depend on its code (`accountsModel.js`, `Register.jsx`, `AccountEditor.jsx`, `AccountList.jsx`, `TransactionEditor.jsx`) and continue on the same branch as separate commits.

## Overview

Two independent enhancements to the account-centric ledger shipped in Phase 1:

1. **Register column sorting** — clickable column headers in the transaction register; click to sort by that column, click again to reverse.
2. **Custom account types** — turn the hardcoded 7-type registry into user-editable, stored data managed from a dedicated screen, with full control over each type's behavior.

They are independent and will be implemented in order: **sorting first** (small, self-contained), **then custom types** (a data-model change).

## Goals

- Let the user re-sort any register by any column without losing the per-row running balance.
- Let the user create, edit, and delete account types — controlling label, money-class, register layout, sidebar group, and icon — so the account list reflects how they actually organize money.
- Preserve Phase 1's structure: pure, independently-tested logic in `accountsModel.js`; focused components; a single hook per persisted data array.

## Non-Goals

- Transfers (Phase 2) and Reports (Phase 3) remain out of scope.
- Multi-column / secondary sorting (single active sort column only).
- Persisting the chosen sort across reloads (sort state is in-memory UI state).
- Per-account saved sort preferences.

---

## Feature 1 — Register column sorting

### Behavior

- Every data column header in the register is a button. Clicking a header sorts the visible rows by that column.
- Clicking the **active** column again **reverses** direction. Clicking a **different** column switches to it using that column's default direction.
- **Default direction by column:** `date`, `amount`, `balance` → **descending**; text columns (`description`/notes, `category`, `payee`, `check#`) → **ascending**.
- **Initial state = `date` descending** (newest first) — identical to the current Phase-1 view, so nothing changes until the user clicks.
- The active column shows a direction indicator (▲ ascending / ▼ descending). Inactive sortable headers render as plain clickable headers.

### Running-balance semantics (resolved)

The `Balance` column shows each transaction's **true chronological running balance** (`openingBalance + Σ amounts up to and including that transaction`, by date then insertion order). **Sorting only reorders the visible rows** — it does **not** recompute the balance into the sort order. So when sorted by a non-date column, the Balance numbers will not read sequentially top-to-bottom, but each row's balance is correct for that transaction. This is intentional and was chosen over blanking the column.

### Sortable columns per layout

- **Compact layout:** Date, Description, Category, Amount, Balance.
- **Bank layout:** Date, Chk#, Payee, Category, Notes, Payment, Deposit, Balance. `Payment` and `Deposit` both sort by the signed `amount` key.

### Sort keys

| Column | Sort key | Comparison |
|---|---|---|
| Date | `date` | string (`YYYY-MM-DD`), ties broken by chronological insertion order |
| Description / Notes | `description` | case-insensitive string |
| Category | `category` | category **name** via `categoriesById`, case-insensitive; uncategorized sorts last |
| Payee (bank) | `payee` | case-insensitive string; empty last |
| Chk# (bank) | `checkNumber` | numeric-aware string; empty last |
| Amount / Payment / Deposit | `amount` | numeric (signed) |
| Balance | `balance` | numeric |

Ascending puts empty/missing values last; descending is the reverse of ascending (stable).

### Implementation

- **New pure helper** in `accountsModel.js`:
  `sortRows(rows, { key, dir }, categoriesById) → rows` — returns a sorted **copy**; stable; pure; unit-tested. `rows` are the already-computed register rows (each carrying its `balance`). `dir` is `'asc' | 'desc'`.
- **`Register.jsx`** pipeline changes from `computeRegister → filterTransactions → .reverse()` to `computeRegister → filterTransactions → sortRows(...)`. With `{ key: 'date', dir: 'desc' }` this reproduces the current newest-first output.
- `Register` holds `sort` state `{ key, dir }`; header click handler toggles/sets it; headers render the active indicator. Switching accounts keeps the chosen sort (the component stays mounted); it resets only on reload.

---

## Feature 2 — Custom account types

### Data model

```
AccountType {
  id       string            // stable; built-ins keep their Phase-1 ids
  label    string            // display name, e.g. "HSA"
  klass    'asset' | 'liability' | 'offsheet'   // drives net-worth inclusion
  layout   'bank' | 'compact' // drives register columns
  group    string            // sidebar section header
  icon     string            // emoji
  builtin  boolean           // true for the 7 seeded defaults
}
```

- **Built-in ids are preserved** (`bank`, `investment`, `credit_card`, `loan`, `mortgage`, `person`, `untyped`). Existing accounts store `type: '<id>'`, so they keep resolving with no data migration of accounts.
- `ACCOUNT_TYPES` (the Phase-1 constant) is replaced by **`DEFAULT_ACCOUNT_TYPES`** — an ordered array of the 7 built-ins (each with `builtin: true`) used to seed storage.
- **Stored** at `billtracker-account-types` (JSON array, ordered). All types — built-in and custom — are editable and deletable per the user's decision.
- **Seeding:** `useAccountTypes` loads the array from storage; if absent or empty, it initializes from `DEFAULT_ACCOUNT_TYPES` and persists. No schema-version bump and no change to `initializeFromStorage` — the hook self-seeds defaults when storage is empty (so the feature is additive and independent of the v1→v4 migration chain).

### Fallback for unknown type ids (resolved)

Because any type — including built-ins like `untyped` — can be deleted, the model must never assume a type id resolves. A module-level constant `FALLBACK_TYPE` (`{ klass: 'offsheet', layout: 'compact', group: 'Unassigned', label: 'Unassigned' }`) is returned by the resolver whenever a type id is absent from the registry. This keeps balances, net-worth math, and register layout correct even for accounts whose type was deleted (they render as off-sheet / compact / "Unassigned").

### Group ordering (resolved)

The fixed `GROUP_ORDER` constant is removed. Sidebar group order is **derived from the types array order**: groups appear in the order they are first seen across the ordered `types` list, with the fallback group (`'Unassigned'`) rendered last. Accounts whose type id is unknown fall under the fallback group.

### `accountsModel.js` signature changes (Approach A)

Pure helpers take the registry (a `Map` of id → AccountType), all fallback-safe:

- `accountClass(typeId, typesById) → 'asset'|'liability'|'offsheet'`
- `layoutFor(typeId, typesById) → 'bank'|'compact'`
- `groupFor(typeId, typesById) → string`
- `isOnBalanceSheet(typeId, typesById) → boolean`
- `householdTotals(accounts, transactions, typesById) → { netWorth, assets, owed }`
- New: `groupOrder(types) → string[]` (derived group order described above).

`accountBalance`, `computeRegister`, `filterTransactions`, `flowSign`, and new `sortRows` are unchanged in signature (they don't depend on types).

### `useAccountTypes` hook (mirrors `useCategories`)

Owns load/seed/persist of the types array and exposes:
- `types` (ordered array), `typesById` (Map)
- `addType(partial) → id`, `updateType(id, patch)`, `deleteType(id)`
- `storageError` / `clearStorageError` (same pattern as `useCategories`/`useLedger`)

`deleteType` only removes the type from the array. **Reassignment of affected accounts is coordinated in `App`** (which holds `ledger.updateAccount`), exactly like category "move all": before deleting a type that is in use, `App` reassigns the using accounts to the chosen replacement type via `ledger.updateAccount`, then calls `deleteType`.

### New components

- **`AccountTypesScreen.jsx`** — full-screen manager reached from a header button `▤ Account Types` (sits next to `☰ Categories`). Lists every type (icon, label, class, layout, group), `+ New type`, and per-row edit/delete. Mirrors `ManageCategoriesScreen` structure.
- **`AccountTypeEditor.jsx`** — create/edit dialog with fields: icon, label, class (asset / liability / off-sheet), layout (bank / compact), group (text input backed by a `<datalist>` of existing group names), and a Delete action when editing.
- **Delete-in-use flow:** when deleting a type that one or more accounts use, the screen shows a reassign prompt — "*N* accounts use this type. Move them to [type ▾]" — and on confirm reassigns those accounts then deletes the type. Deleting an unused type deletes immediately (with a normal confirm).

### Wiring

- **`App.jsx`** instantiates `useAccountTypes`; adds `screen === 'account-types'`; passes `typesById` to `AccountList`, `Register`, `TransactionEditor`; passes `types` to `AccountEditor`; implements the delete-with-reassign handler (reassign via `ledger.updateAccount`, then `types.deleteType`).
- **`AccountEditor.jsx`** — the type `<select>` is populated from `types` (label per option) instead of the hardcoded `TYPE_OPTIONS`.
- **`AccountList.jsx`** — uses `groupOrder(types)`, `groupFor`, `accountClass`, `householdTotals` with `typesById`.
- **`Register.jsx`** — uses `layoutFor`, `accountClass` with `typesById` (alongside the Feature-1 sorting).
- **`TransactionEditor.jsx`** — `isBank = layoutFor(account.type, typesById) === 'bank'`.

### Export

`exportArchive.js` gains the `accountTypes` array in `data.json` so a backup is self-describing. CSV is unaffected.

---

## Testing (TDD, mirroring Phase 1)

New / updated tests, each written test-first:

- `accountsModel.test.js` — update `accountClass`/`layoutFor`/`groupFor`/`isOnBalanceSheet`/`householdTotals` for the new `typesById` argument + fallback behavior; add `groupOrder` and `sortRows` (ascending/descending, each key, empty-value placement, stability, balance untouched).
- `useAccountTypes.test.jsx` — hydrate from storage, seed defaults when empty, add/update/delete, persistence.
- `AccountTypesScreen.test.jsx` — renders types, add/edit/delete, delete-in-use reassign prompt.
- `AccountTypeEditor.test.jsx` — create saves all fields; edit pre-fills; delete fires.
- `Register.test.jsx` — clicking a header sorts; clicking again reverses; default is date-descending; balance values stay per-row.
- Update `AccountList.test.jsx`, `Register.test.jsx`, `TransactionEditor.test.jsx`, and `__smoke__/setup.test.jsx` for the new signatures (pass a `typesById` built from defaults).

## Implementation order

1. **Register sorting** — `sortRows` (pure + tested), then `Register` wiring + header UI. Self-contained; no data-model change.
2. **Custom account types** — `DEFAULT_ACCOUNT_TYPES` + model signature changes + fallback + `groupOrder`; `useAccountTypes`; thread `typesById` through consumers; `AccountTypesScreen` + `AccountTypeEditor`; `App` wiring + delete-with-reassign; export.

## Resolved decisions (from brainstorming)

- Sorting reorders rows only; **Balance keeps each row's true chronological value**.
- Every column sortable; click to sort, click again to reverse; default **date-descending**.
- Custom types control **label + class + layout + group + icon** (full).
- Types managed on a **dedicated "Account Types" screen** (like Manage Categories).
- **All types editable/deletable**, including built-ins; the model has a **safe fallback** for unknown/deleted type ids, so nothing breaks.
- Deleting an in-use type **prompts to reassign** affected accounts to a chosen type.

## Open items to finalize during implementation

- Exact placement/labeling of the sort indicator on bank-layout `Payment`/`Deposit` headers (both map to the `amount` key).
- Whether the `AccountTypesScreen` groups types under their `group` headers or lists them flat (lean: flat list with a group column, simplest).
- Datalist vs free-text-only for the `group` field (lean: `<datalist>` suggesting existing groups, free text allowed).
