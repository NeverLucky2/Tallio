# Transfer categories ("types") — design

**Date:** 2026-05-21
**Status:** Approved (design); pending spec review

## Summary

Transfers can be tagged with a "type" drawn from a new `'transfer'` category
flow. The register shows the type as a small pill (the category's icon + name,
tinted with its color) **after** the existing account-class chip — keeping
today's chip color (asset=green / liability=red / off-sheet=purple) and adding
the type label alongside it. The type is set in the transfer editor, with a
sensible default auto-suggested from the destination account. The type is
optional; untyped transfers render exactly as they do today.

## Decisions (from brainstorming)

1. **Visual placement:** type **pill after the account chip** (keeps both
   signals — *where* the money goes, color-coded, and *what* type it is).
2. **Type source:** **reuse the category system** — a transfer carries a
   `categoryId` like any transaction; the pill renders that category's own icon
   + color.
3. **Which categories:** a **new `'transfer'` flow**, seeded and editable in the
   Categories panel like the rest. Keeps transfer types out of the
   expense/income pickers and covers payments that aren't "savings."
4. **Assignment:** **manual select with auto-suggest** — a "Type" dropdown in
   the transfer editor, pre-filled from the destination account's type and
   overridable.

## Data model

- Categories gain a fourth valid `flow` value: **`'transfer'`**. Shape is
  unchanged: `{ id, name, icon, color, flow, keywords:[], templates:[], builtin }`.
- A transfer's `categoryId` becomes meaningful. Today both legs are hardcoded
  `categoryId: null` (`useLedger.addTransfer` and `updateTransfer`). They will
  instead carry the chosen category id. **Both legs share one `categoryId`**, so
  the pill appears in both accounts' registers.
- **Optional.** `categoryId: null` → no pill, just the existing account-class
  chip. Existing transfers stay `null` and are unaffected.

## Seed categories

New export `TRANSFER_SEED_CATEGORIES` in `categoriesDefaults.js`, all with
`flow: 'transfer'`, `keywords: []` (so they never hijack auto-categorization of
imported transactions), `builtin: true`. Names are chosen to **not collide**
with any existing category name (append-by-name skips duplicates, and a collision
with another flow would silently prevent seeding):

| Name | Icon | Suggested color |
|---|---|---|
| Credit Card Payment | 💳 | `#d4a853` (amber) |
| Loan Payment | 🏷️ | `#e0928a` |
| Investment Transfer | 📈 | `#5b8dff` (blue) |
| Savings Transfer | 🪙 | `#22d3ee` (cyan) |
| Cash Withdrawal | 💵 | `#3ddba0` (green) |
| Internal Transfer | ⇄ | `#a47dea` (purple) |

(Names verified collision-free against `DEFAULT_CATEGORIES` and
`V3_SEED_CATEGORIES`; note "Reimbursement" and "Brokerage Transfer" already
exist in other flows, so they are intentionally **not** reused here.) Users can
rename, recolor, add, or delete these in the Categories panel.

## Seeding mechanism (corrected from initial sketch)

**Do not** add a `migrateToV4`-style migration: `migrateToV4` already exists (it
is the bills→accounts migration), and `initializeFromStorage` returns early for
`ver >= 4`, so a migration there would never run for existing users.

Instead, seed via an **idempotent append in `useCategories.load()`** — the
single code path that loads categories for every user on every startup,
independent of the accounts schema version. No schema-version bump.

- Add a pure helper `withTransferSeeds(categories)` in `categoriesDefaults.js`
  (no React, unit-testable): for each seed in `TRANSFER_SEED_CATEGORIES` whose
  `name` is not already present in `categories`, append a copy with a fresh
  `nanoid(8)` id. Returns the input unchanged when all seeds are present
  (idempotent).
- Apply it to **both** branches of `useCategories.load()` — the `seed()`
  fallback and the parsed-from-storage result — so brand-new users and existing
  users alike end up with the transfer seeds. The debounced persist effect saves
  the augmented list; subsequent loads are no-ops.

Rationale: category seeding is owned by `useCategories`, not by the
accounts-oriented `initializeFromStorage`; this reaches v4 users and is unit-
testable like the existing `migrateToV3` seed-append.

## Auto-suggest

New pure helper in `accountsModel.js`, beside `transferDraftForAccount`:

```
suggestTransferCategoryId(toAccount, transferCategories, typesById) -> id | null
```

Keyed off the **destination (To)** account's type:

| Destination type | Suggested seed (by name) |
|---|---|
| `credit_card` | Credit Card Payment |
| `loan`, `mortgage` | Loan Payment |
| `investment` | Investment Transfer |
| `bank`, `person`, `untyped`, anything else | `null` (too ambiguous to guess) |

Resolves the suggestion to the current category id by **name match** within the
transfer-flow categories; returns `null` if the user renamed/deleted it (best-
effort, never throws).

Editor behavior: for a **new** transfer the Type field defaults to the
suggestion and re-suggests when the **To** account changes — *until the user
manually picks a type*, tracked by a "touched" flag that then stops auto-
overriding. Editing an existing transfer shows its saved category and does not
auto-suggest.

## UI — `TransferEditor.jsx`

- New **"Type"** `<select>` (placed after Notes): first option `— None —`
  (value `''` → `categoryId: null`), then the transfer-flow categories rendered
  `{icon} {name}`.
- Initial value: existing transfer's `categoryId` (edit) or
  `suggestTransferCategoryId(...)` (new).
- On To-account change for a new, untouched transfer: recompute the suggestion.
- `save()` adds `categoryId` (id or `null`) to the `onSave` payload.
- New props: `categories` (the transfer-flow subset is derived inside) and
  `typesById` (already passed).

## UI — register pill (Option A) — `TransactionRow.jsx`

- `TransferChip` renders, **after** the counterpart account chip, a small pill
  when the leg has a resolvable transfer-flow category: `{icon} {name}`, with
  text color = `category.color` and a subtle tinted background/border.
- `TransferChip` already has access to `categoriesById` via `TransactionRow`;
  pass the leg's `categoryId` (or the resolved category) into it.
- No pill when `categoryId` is null/unresolved; the account-class chip color is
  unchanged in all cases.

## CSS — `App.css`

Add a `.txn-transfer-type` pill rule near the existing `.txn-transfer` block
(~line 3315): inline-flex, small radius, `font-size` ~11px, color/border driven
by the category color (via inline `style` from the component, matching how other
category colors are applied).

## Category-management integration (small, localized edits)

- `CategoryEditor.jsx` `FLOW_OPTIONS` (lines 6–10): add
  `{ key: 'transfer', label: 'Transfer' }`. The flow-change confirmation copy
  (line 40) gets a `'transfer'` label branch. Since transfers are excluded from
  report buckets, changing a category to/from `transfer` does not reclassify
  spending; in practice transfer-flow categories have no matching bill items, so
  `itemCount` is 0 and the existing dialog is skipped entirely (line 84 calls
  `onUpdate` directly when `itemCount === 0`). The label branch is just to avoid
  an undefined bucket name in the rare non-zero case.
- `ManageCategoriesScreen.jsx` (line 66): extend the flow group list to
  `['income', 'expense', 'savings', 'transfer']`.
- `useCategories.js` `addCategory` flow coercion (line 64): allow `'transfer'`
  (currently coerces anything not `income`/`savings` to `expense`).

## `useLedger.js`

- `addTransfer({ ..., categoryId })`: set `categoryId` on the shared `base`
  instead of hardcoded `null`; default `null` when absent.
- `updateTransfer(transferId, { ..., categoryId })`: set `categoryId` on both
  legs (replacing the two hardcoded `categoryId: null` assignments).

## `App.jsx` wiring

- Pass `categories` (and existing `typesById`) to `TransferEditor`.
- The transfer `onSave` handler forwards `categoryId` into
  `addTransfer`/`updateTransfer`.

## Reporting safety (defensive hardening)

No counting change is required: `reportsModel.flowOf` already returns `null` for
any `transferId` row, the monthly grouping skips transfer legs, and
`spendingMath` only ever reads bill items (never transfer transactions). As
defense in depth, `flowOf` will additionally treat `flow === 'transfer'` as
non-countable (return `null`), so a transfer-flow category accidentally attached
to a normal row never lands in spending/income/savings.

## Testing plan (TDD, inline, red→green per unit)

- **Seeds/append:** `withTransferSeeds` adds missing seeds by name, is
  idempotent, assigns fresh ids, and never duplicates existing names; the seed
  names don't collide with `DEFAULT_CATEGORIES`/`V3_SEED_CATEGORIES`.
- **`useCategories`:** loading augments stored categories with transfer seeds
  once; `addCategory({ flow: 'transfer' })` is preserved (not coerced).
- **`suggestTransferCategoryId`:** correct mapping per destination type; `null`
  for ambiguous types; graceful `null` when the seed was renamed/removed.
- **`useLedger`:** `addTransfer`/`updateTransfer` set `categoryId` on **both**
  legs; `null` when unset; round-trips through edit.
- **`TransferEditor`:** renders the Type dropdown; new transfer defaults to the
  suggestion; re-suggests on To-change until touched; preserves an existing
  transfer's category on edit; emits `categoryId` (or `null`) in the payload.
- **`TransactionRow`/`TransferChip`:** renders the pill (icon + name, category
  color) for a categorized transfer; renders no pill when untyped; account-class
  chip color unchanged.
- **`reportsModel` regression:** a **categorized** transfer leg is still
  excluded from spending, flow, monthly net, and net-worth math.
- **`ManageCategoriesScreen`:** the Transfer group renders its categories.

## Integration points (file map)

- `src/categoriesDefaults.js` — add `TRANSFER_SEED_CATEGORIES` (+ optional
  `withTransferSeeds`).
- `src/useCategories.js` — `load()` append (lines 13–23); flow coercion (line 64).
- `src/accountsModel.js` — add `suggestTransferCategoryId` (near
  `transferDraftForAccount`, ~line 207).
- `src/useLedger.js` — `addTransfer` (~line 70), `updateTransfer` (~line 81).
- `src/TransferEditor.jsx` — Type select + suggestion wiring.
- `src/TransactionRow.jsx` — `TransferChip` pill (~lines 16–29).
- `src/App.css` — `.txn-transfer-type` (~line 3315).
- `src/CategoryEditor.jsx` — `FLOW_OPTIONS` (lines 6–10), flow-change copy (line 40).
- `src/ManageCategoriesScreen.jsx` — flow group list (line 66).
- `src/reportsModel.js` — `flowOf` hardening (~line 80).
- `src/App.jsx` — pass `categories` to `TransferEditor`; forward `categoryId`.

## Out of scope (YAGNI)

- Inline editing of a transfer's type from the register row.
- Transfer-type report breakdowns / charts.
- Per-leg different categories (the two legs always share one `categoryId`).
