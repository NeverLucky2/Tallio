# Sub-categories (with searchable picker) — Design Spec

**Date:** 2026-06-03

**Depends on:** `2026-06-03-undo-everywhere-design.md` (Undo Everywhere). New sub/keyword mutations reuse the `pushHistory()` wrapping established there.

## Goal

Let each category own lightweight **sub-categories** (e.g. Taxes → Federal Tax, State Tax, FICA) that are:

1. **Selectable** when entering a transaction, via a new **searchable combobox** that replaces the native category dropdown (this also satisfies the "search categories" request).
2. **Auto-assignable** — a sub carries its own keywords, so a scanned bill lands directly in the right sub.
3. **Rolled up in reports** to their parent's total, **expandable** to a per-sub breakdown.

Sub-categories are intentionally lightweight: a name + keywords, inheriting the parent's flow and color.

## Background

- Categories live in `useCategories` (`src/useCategories.js`) as `{ id, name, icon, color, flow, keywords[], templates[], builtin }`, seeded in `src/categoriesDefaults.js`.
- Auto-categorization (`src/categoryRules.js` `autoCategorize`) returns a single category id by longest keyword match.
- The category chooser is a native `<select>` grouped by flow via `groupCategoriesByFlow` (`src/categoriesView.js`), used in `TransactionEditor.jsx` (`:98`) and the Splits editor.
- The Manage Categories screen (`ManageCategoriesScreen.jsx` + `CategoryEditor.jsx`) is a master/detail: a flow-grouped list on the left, an editor on the right.
- Reports aggregate by `categoryId` (`reportsModel.js`, rendered by `CategoryBreakdown.jsx` / `CategoryBarList.jsx`).

## Data Model

- Each category gains `subcategories: [{ id, name, keywords: [] }]`. Subs **inherit** the parent's `flow` and `color`; they have no own icon/color/templates. **One level deep only.**
- Transactions and **each split line** gain an optional `subId`. `subId` is valid only relative to the row's `categoryId` (it must be one of that category's `subcategories` ids). A row whose `categoryId` is a parent but whose `subId` is absent is the **"(unspecified)"** bucket.
- **Normalization on load:** a `normalizeCategories(list)` ensures every category has `subcategories: []` (and each sub has `keywords: []`). Applied in both `seed()` and `load()` in `useCategories`, alongside the existing `withTransferSeeds` / `withBackfillCategories`. **No auto-seeding** of any specific subs — the user builds them.

## Approach

Nest subs inside their parent (the user's chosen model) so existing storage, grouping, and roll-up come naturally. Introduce one shared pure helper for flatten/search so the transaction picker and the Manage-screen list filter behave identically. Cross-cutting deletes (removing a sub must release its transactions back to the parent) are coordinated in `App.jsx`, mirroring the existing `deleteAccountType` reassign pattern.

## Changes

### 1. `src/categoriesDefaults.js`
Export `normalizeCategories(list)` (ensures `subcategories: []` per category, `keywords: []` per sub). Seed objects need no literal `subcategories` — normalization adds them.

### 2. `src/categoryRules.js` — sub-aware matching
- `autoCategorize(description, categories, fallbackCategoryId)` now returns **`{ categoryId, subId }`**. The longest-match scan also walks each category's `subcategories[].keywords`; if a sub keyword is the longest match, return that sub's parent id as `categoryId` and the sub id as `subId`; otherwise `subId: null`.
- Update callers: `useCategories.autoCategorize` wrapper and the scanned-bill import (`App.jsx` `handleCapture`, currently `:260` and `:266`) consume `{ categoryId, subId }` and set both on the created transaction.
- `findItemsMatchingKeyword` continues to work; sub keywords participate in the "current best" length comparison.

### 3. `src/categoriesSearch.js` — new pure helper
- `flattenForPicker(categories)` → ordered options grouped by flow: one entry per category and per sub, each `{ kind:'category'|'sub', categoryId, subId|null, name, path, flow, icon, color }` (`path` = `"Taxes › Federal Tax"` for subs).
- `filterOptions(options, query)` → case-insensitive match on category **and** sub names; a matching sub is included with its parent path; a matching parent includes its subs. Empty query returns all.
- Reused by the picker and the Manage-screen list search.

### 4. `src/CategoryPicker.jsx` — new searchable combobox
Replaces the native `<select>`. Props: `categories`, `value={ categoryId, subId }`, `onChange({ categoryId, subId })`, `ariaLabel`.
- Closed: a button showing the current selection (`icon name`, or `icon Parent › Sub`).
- Open: a text input (auto-focused) + a scrollable list from `flattenForPicker` / `filterOptions`; subs indented under parents; flow group labels shown when query is empty.
- Selecting a **parent** → `{ categoryId, subId: null }`; selecting a **sub** → `{ categoryId: parent, subId }`.
- Keyboard: ↑/↓ move, Enter selects, Esc closes; click-outside closes. Accessible (`role="combobox"`/`listbox"`).

### 5. `src/TransactionEditor.jsx` & Splits editor — adopt the picker
- Replace the `<select>` (`TransactionEditor.jsx:98`) with `<CategoryPicker>`; track `subId` alongside `categoryId` in editor state; include `subId` in the saved payload.
- Same swap wherever the Splits editor selects a per-line category, so split lines carry `subId`.

### 6. `src/useLedger.js` — persist `subId`
- `addTransaction` / `updateTransaction` carry `subId` on the parent (omit when null), and each split-line normalizer (`addTransaction`, `updateTransaction`, `addTransfer`, `updateTransfer`) carries per-line `subId`.
- New `clearSubcategory(subId)`: strips `subId` from every transaction and split line that references it (used by sub-delete). A single immutable `setTransactions` pass, snapshot-friendly.
- `validateSplits` is unaffected (`subId` doesn't touch amount invariants).

### 7. `src/useCategories.js` — sub CRUD
- `addSub(catId, { name })` → appends `{ id, name, keywords: [] }`, returns sub id.
- `updateSub(catId, subId, patch)`, `deleteSub(catId, subId)`.
- `addSubKeyword(catId, subId, raw)` / `removeSubKeyword(catId, subId, kw)` (uppercase + dedupe like `addKeyword`).
- `promoteKeywordToSub(catId, keyword)` → creates a sub named from the keyword (Title Case), moves that keyword off the parent onto the new sub, returns the sub id.
- Apply `normalizeCategories` in `seed()` / `load()`. (Note: `snapshot()/restore()` come from the Undo spec.)

### 8. `src/CategoryEditor.jsx` — Sub-categories section
- A "**Sub-categories (n)**" section listing each sub (name + keyword preview + `›`), an **+ Add sub-category** button, and an **↑ promote** affordance on each parent keyword chip.
- New props raised to the screen: `onAddSub`, `onEditSub(subId)`, `onPromoteKeyword(keyword)`.

### 9. `src/SubcategoryEditor.jsx` — new drill-down editor
Breadcrumb `‹ Back to {parent}`, `{Parent} › {Sub}` path, a name input (commit on blur like `CategoryEditor.commitName`), a `ChipEditor` for the sub's keywords, and a **Delete sub-category** button with the hint "moves its transactions back to {parent}". Props: `category`, `sub`, `onBack`, `onUpdate(patch)`, `onAddKeyword`, `onRemoveKeyword`, `onDelete`.

### 10. `src/ManageCategoriesScreen.jsx` — search, badges, drill-down
- A **search box** atop the left list, filtering top-level rows via `categoriesSearch` (a category matches if its name or any sub name matches).
- A **sub-count badge** on each list row.
- Drill-down state (`editingSubId`): when set, the right panel renders `SubcategoryEditor`; otherwise `CategoryEditor`. `onEditSub` sets it; `onBack` clears it.
- Wires the new sub callbacks through to App.

### 11. `src/App.jsx` — wire sub CRUD (each preceded by `pushHistory()`)
- Pass `onAddSub`, `onUpdateSub`, `onPromoteKeyword`, and a coordinated **`onDeleteSub`**: `pushHistory()` → `ledger.clearSubcategory(subId)` → `cats.deleteSub(catId, subId)` (releases transactions back to the parent, then removes the sub).
- `handleCapture` consumes `{ categoryId, subId }` from `autoCategorize`.

### 12. Reports — `reportsModel.js`, `CategoryBreakdown.jsx`, `CategoryBarList.jsx`
- Aggregation gains a sub dimension: each parent total includes per-sub subtotals plus an "(unspecified)" remainder for parent rows without a `subId`.
- The category breakdown renders **expandable** parent rows (collapsed by default) that reveal per-sub rows on click; subs use the parent's color. Parent totals are unchanged from today when a category has no subs.

## Data Flow

Enter a tax payment → open `CategoryPicker`, type "fed" → pick **Taxes › Federal Tax** → editor state `{ categoryId: taxes, subId: federal }` → Save persists both on the transaction (`useLedger`). Reports roll it into the Taxes total; expanding Taxes shows **Federal Tax** with its amount. Scanning a bill whose text contains `FEDERAL TAX` auto-fills the same pair via `autoCategorize`. Deleting the Federal Tax sub → `pushHistory` → `clearSubcategory` releases those transactions to plain Taxes ("(unspecified)") → sub removed; **Undo** restores both the sub and the `subId`s.

## Consequences & Edge Cases

- **Category changed to a different parent** in the editor: the picker only ever emits a `subId` belonging to the chosen category, so an orphaned `subId` can't be introduced through the UI. Normalization on read can also drop a `subId` not present on its `categoryId` (defensive against imported/legacy data).
- **Deleting a parent category** keeps today's guard (blocked while it has items / move-all flow); its subs are removed with it.
- **Promote** moves a keyword off the parent; auto-categorization is unchanged in outcome (same keyword, now resolving to the sub) but newly tags matches with the sub.
- **Export/import archive** (`exportArchive.js`, schema v4) now carries `subcategories` and `subId` naturally as part of categories/transactions; confirm a round-trip and bump the schema note if the importer validates shape.
- Subs sort A→Z within their parent for display.

## Testing (TDD, inline)

Pure logic first:
- `categoryRules.test.js`: `autoCategorize` returns `{ categoryId, subId }`; a longer sub keyword wins over a shorter parent keyword; falls back to `{ categoryId: fallback, subId: null }`.
- `categoriesSearch.test.js`: flatten ordering/paths; filter matches parents and subs; sub matches include parent path.
- `categoriesDefaults.test.js`: `normalizeCategories` adds `subcategories: []` idempotently.
- `useCategories.test.jsx`: add/update/delete sub; `promoteKeywordToSub` moves the keyword.
- `useLedger.test.jsx`: `subId` persists on transactions + split lines; `clearSubcategory` strips it.
- `reportsModel.test.js`: parent total = sum of subs + unspecified; no-sub categories unchanged.

Then components:
- `CategoryPicker.test.jsx`: open → list; type → filter; select parent vs sub emits the right `{ categoryId, subId }`; keyboard select.
- `ManageCategoriesScreen.test.jsx`: search filters the list (incl. by sub name); sub-count badge; drill into a sub and back.
- `SubcategoryEditor.test.jsx`: rename, add/remove keyword, delete calls `onDelete`.
- `CategoryBreakdown.test.jsx`: expand a parent to reveal subs + "(unspecified)".

## Out of Scope

- Nested sub-sub-categories (more than one level).
- Per-sub icons/colors/templates.
- Redo (covered by the Undo spec's scope).
- Bulk re-tagging of historical transactions into subs beyond the existing move-all/keyword flows.
