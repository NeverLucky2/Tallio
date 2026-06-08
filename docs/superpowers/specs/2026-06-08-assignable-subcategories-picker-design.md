# Assignable sub-categories + searchable tree picker — design

Date: 2026-06-08
Status: Approved (pending spec review)
Part of: splits/category fixes batch — **Branch 3a of 3** (Branch 3 was split into
3a here + 3b reports breakdown). Branches 1 (splits-set-amount) and 2 (category
Save + persistence) merged to master. Realizes "Plan 2" of
`docs/superpowers/specs/2026-06-03-subcategories-design.md`, **minus** the per-sub
report breakdown (that is Branch 3b).

## Goal

Let the user **select a sub-category when entering a transaction** (and on each
split line), via a searchable, type-to-filter combobox showing categories with
their subs as an indented tree. Scanned bills auto-land in the right sub via the
sub's keywords. Sub-categories created in Manage Categories (Branch 2) become
first-class, assignable categories.

## Background (current state)

- Categories: `{ id, name, icon, color, flow, keywords[], templates[], builtin,
  subcategories: [{ id, name, keywords[] }] }` (`useCategories`,
  `categoriesDefaults.normalizeCategories`).
- `autoCategorize(description, categories, fallbackCategoryId)`
  (`categoryRules.js`) returns a single **category id** and **ignores** sub
  keywords today.
- The category chooser is a native `<select>` grouped by flow via
  `groupCategoriesByFlow`, used in `TransactionEditor.jsx` and per-line in
  `SplitsEditor.jsx`.
- Transactions / split lines store only `categoryId` (a parent). No `subId`.
- Reports (`reportsModel.js`, `flattenForReports`, `spendingByCategory`) aggregate
  by `categoryId`.
- Scanned-bill import: `App.jsx` `handleCapture` (~`348`, `354`) calls
  `cats.autoCategorize(it.description)` to pick `flow` and `categoryId`.

## Decisions (locked in brainstorming)

- **Data model:** transactions and each split line gain an optional `subId`.
  `categoryId` always stays the **parent**; `subId` is one of that parent's
  `subcategories` ids. A parent with no `subId` is the "(unspecified)" case.
  Because `categoryId` stays the parent, **reports roll subs up under the parent
  automatically with no report changes** (the per-sub breakdown is Branch 3b).
- **Picker layout:** indented tree (subs nested under parents), chosen via the
  visual companion.
- **Auto-categorization:** **included** — `autoCategorize` becomes sub-aware and
  returns `{ categoryId, subId }`.
- **Split lines:** use the **same `CategoryPicker`** per line (consistent
  type-to-filter + sub selection everywhere).
- **Reports & `validateSplits`:** untouched in 3a.

## Data model

- `transaction.subId?: string` — present only alongside a `categoryId` that owns
  it; omitted when null.
- Each split line `{ id, amount, categoryId, subId?, description, transferId? }` —
  `subId` only on category lines (never transfer lines).
- No schema-version bump; `subId` is additive and absent on legacy data
  (treated as "(unspecified)").

## Changes

### 1. `src/categoryRules.js` — sub-aware matching
- `autoCategorize(description, categories, fallbackCategoryId)` returns
  **`{ categoryId, subId }`**. The longest-match scan walks each category's own
  `keywords` **and** each `subcategories[].keywords`. If a sub keyword is the
  longest match → `{ categoryId: parentId, subId: subId }`; if a parent keyword
  wins → `{ categoryId, subId: null }`; no match → `{ categoryId:
  fallbackCategoryId, subId: null }`.
- `findItemsMatchingKeyword`: the "current best length" scan also considers sub
  keywords, so it stays correct (a new keyword only claims items it would
  actually win). Return shape unchanged.

### 2. `src/useCategories.js` — wrapper passthrough
- `autoCategorize` wrapper already returns whatever `ruleAutoCategorize` returns,
  so it now yields `{ categoryId, subId }` with no change. (Verify, don't edit.)
- `applyCategoryToItems(bills, itemRefs, categoryId)` also **clears `subId`** on
  moved items (a sub of the old parent isn't valid under the new category).

### 3. `src/categoriesSearch.js` — picker helpers (new, pure)
- `flattenForPicker(categories)` → ordered options grouped by flow (FLOW_ORDER),
  one entry per category and per sub:
  `{ kind: 'category'|'sub', categoryId, subId|null, name, path, flow, icon }`
  where `path` is `"Loan › Mike"` for subs and `name` for categories. Subs sort
  A→Z within their parent; parents sort A→Z within flow.
- `filterOptions(options, query)` → case-insensitive substring match on a
  category name or a sub's name; a matching sub is included with its parent path;
  a matching parent includes its subs. Empty query → all options.
- Existing `filterCategoriesByQuery` (Manage-screen list) stays as-is.

### 4. `src/CategoryPicker.jsx` — searchable combobox (new)
- Props: `categories`, `value={ categoryId, subId }`, `onChange({ categoryId,
  subId })`, `ariaLabel`.
- **Closed:** a button showing the current selection — `icon name`, or
  `icon Parent › Sub` for a sub.
- **Open:** an auto-focused text input + a scrollable list from
  `flattenForPicker`/`filterOptions`; subs **indented** under their parent; flow
  group labels shown when the query is empty.
- Selecting a **category** → `onChange({ categoryId, subId: null })`; selecting a
  **sub** → `onChange({ categoryId: parentId, subId })`.
- Keyboard: ↑/↓ move highlight, Enter selects, Esc closes; click-outside closes.
  `role="combobox"` + `role="listbox"`/`option`.

### 5. `src/TransactionEditor.jsx`
- Replace the category `<select>` with `<CategoryPicker>`. Track `subId` in
  state (init `transaction?.subId ?? null`); reset to null whenever `categoryId`
  changes to a different parent (the picker emits this). Include `subId` in the
  saved payload (omit when null). Splits-promotion path keeps working.

### 6. `src/SplitsEditor.jsx`
- Replace the per-line category `<select>` with `<CategoryPicker>` (table-cell
  popover). Each line carries `subId`; `updateLine` sets `{ categoryId, subId }`
  together. Toggling a line to Transfer clears `subId`.

### 7. `src/useLedger.js` — persist `subId`
- `addTransaction` / `updateTransaction` carry `subId` on the parent (omit when
  null). Each split-line normalizer (`addTransaction`, `updateTransaction`,
  `addTransfer`, `updateTransfer`) carries per-line `subId` (only when the line
  has a `categoryId`).
- New `clearSubcategory(subId)`: a single immutable `setTransactions` pass that
  strips `subId` from every transaction and split line referencing it. Used by
  sub-delete; snapshot/undo friendly.
- `validateSplits` unchanged (`subId` doesn't affect amount invariants).

### 8. `src/App.jsx`
- `handleCapture`: call `const ac = cats.autoCategorize(it.description)` once; use
  `ac.categoryId` for the flow lookup and the new transaction, and set
  `subId: ac.subId` when present.
- `onDeleteSub`: `pushHistory()` → `ledger.clearSubcategory(subId)` →
  `cats.deleteSub(catId, subId)` (release transactions to the parent, then remove
  the sub) — one undo step.

## Data flow

Enter a tax payment → open `CategoryPicker`, type "fed" → pick **Taxes › Federal
Tax** → editor state `{ categoryId: taxes, subId: federal }` → Save persists both
(`useLedger`). Reports roll it into the Taxes total (Branch 3b adds the per-sub
breakdown). Scanning a bill whose text contains `FEDERAL TAX` auto-fills the same
pair via `autoCategorize`. Deleting the Federal Tax sub → `pushHistory` →
`clearSubcategory` releases those transactions to plain Taxes → sub removed;
**Undo** restores both the sub and the `subId`s.

## Edge cases

- **Re-parenting in the editor:** the picker only ever emits a `subId` belonging
  to the chosen category; selecting a different parent emits `subId: null`, so an
  orphaned `subId` can't be introduced through the UI.
- **Move-all on category delete:** `applyCategoryToItems` clears `subId` on moved
  items (their old sub doesn't exist under the new parent).
- **Transfer lines:** never carry a `subId` (they have `transferId`, not
  `categoryId`).
- **Legacy / imported data:** no `subId` present → treated as "(unspecified)";
  no migration needed. `exportArchive` carries `subId`/`subcategories` naturally
  (confirm a round-trip; bump the schema note only if the importer validates
  shape).
- **Empty/again:** picker with no query shows all options grouped by flow;
  reopening shows the current selection highlighted.

## Testing (TDD, inline)

Pure logic first:
- `categoryRules.test.js`: `autoCategorize` returns `{ categoryId, subId }`; a
  longer sub keyword beats a shorter parent keyword; no match → `{ fallback,
  null }`; `findItemsMatchingKeyword` still correct with sub keywords present.
- `categoriesSearch.test.js`: `flattenForPicker` ordering/paths/indent metadata;
  `filterOptions` matches parents and subs; empty query returns all.
- `useLedger.test.jsx`: `subId` persists on a transaction and on split lines;
  `clearSubcategory` strips it everywhere; transfer lines never get `subId`.
- `useCategories.test.jsx`: `applyCategoryToItems` clears `subId` on move.

Then components:
- `CategoryPicker.test.jsx`: open → list; type → filter (incl. by sub name);
  select a parent emits `{ categoryId, subId: null }`; select a sub emits
  `{ categoryId: parent, subId }`; keyboard select; click-outside closes.
- `TransactionEditor.test.jsx`: picking a sub saves `subId`; switching to a
  different category clears it.
- `SplitsEditor.test.jsx`: a per-line sub selection flows through to the `onDone`
  payload; toggling a line to Transfer drops `subId`.

## Files touched

- `src/categoryRules.js` (+ test)
- `src/categoriesSearch.js` (+ test)
- `src/CategoryPicker.jsx` (new, + test)
- `src/TransactionEditor.jsx` (+ test)
- `src/SplitsEditor.jsx` (+ test)
- `src/useLedger.js` (+ test)
- `src/useCategories.js` (+ test)
- `src/App.jsx` (`handleCapture`, `onDeleteSub`)
- `src/App.css` (CategoryPicker styles)

## Out of scope

- **Branch 3b:** per-sub report breakdown — `reportsModel` sub dimension +
  expandable parent→sub rows in `CategoryBreakdown`/`CategoryBarList`.
- Nested sub-sub-categories; per-sub icons/colors/templates.
- Bulk re-tagging of historical transactions into subs beyond keyword/move flows.
