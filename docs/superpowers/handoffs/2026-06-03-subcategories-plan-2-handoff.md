# Handoff — Sub-categories Plan 2 (entry, picker, auto-categorize, reports)

**Written:** 2026-06-03. **Branch:** `rename-to-tallio` (local, NOT pushed). **Tests at handoff:** 622 passing (`npx vitest run`).

## Where things stand
Tallio (React 19 + Vite; Vitest + @testing-library/react, **no jest-dom** — assert via `.disabled`/`.textContent`/`getByText`). Three features were brainstormed 2026-06-03 into specs under `docs/superpowers/specs/`. Done so far, all merged to **local `rename-to-tallio`** (pending push):

1. **Undo-everywhere** — DONE. Spec `2026-06-03-undo-everywhere-design.md`, plan `2026-06-03-undo-everywhere.md`. One shared undo (`App.jsx` `pushHistory`/`undo`) now snapshots `{ledger, acks, categories, accountTypes}`; reusable `src/UndoButton.jsx` in management screens + editor modals; Ctrl/Cmd+Z.
2. **Sub-categories Plan 1 (core & management)** — DONE. Spec `2026-06-03-subcategories-design.md`, plan `2026-06-03-subcategories-1-core-and-management.md`. Delivered: `subcategories:[{id,name,keywords}]` on each category + `normalizeCategories` on load; sub CRUD + `promoteKeywordToSub` in `useCategories`; `src/categoriesSearch.js` (`filterCategoriesByQuery`); optional `onPromote` on `ChipEditor`; `src/SubcategoryEditor.jsx`; CategoryEditor sub section + keyword-promote; Manage screen search + sub-count badges + sub drill-down; wired in `App.jsx` with undo.

## This session's job: write & execute Sub-categories **Plan 2**
Plan 2 implements the parts of `2026-06-03-subcategories-design.md` that Plan 1 explicitly deferred. Read that spec first. Scope:

1. **`subId` on transactions AND split lines** — `src/useLedger.js`: `addTransaction`, `updateTransaction`, `addTransfer`, `updateTransfer` must persist an optional `subId` on the parent and per split line (omit when null). It's part of the ledger snapshot already, so it's undoable for free.
2. **`ledger.clearSubcategory(subId)`** — strips `subId` from every transaction + split line referencing it (single immutable `setTransactions` pass). Then wire `App.jsx`'s `onDeleteSub` to call `pushHistory(); ledger.clearSubcategory(subId); cats.deleteSub(catId, subId)` so deleting a sub returns its transactions to the parent. **Restore** the `SubcategoryEditor` delete hint to say transactions move back to the parent (Plan 1 softened it to "Deleting removes this sub-category." — commit 93fb8c9).
3. **Sub-aware auto-categorize** — `src/categoryRules.js` `autoCategorize` returns `{ categoryId, subId }` (scan parent keywords AND each `subcategories[].keywords`, longest-match-wins; sub keyword winning → `categoryId` = parent, `subId` = that sub; else `subId: null`). Update callers: the `useCategories.autoCategorize` wrapper and the scanned-bill import in `App.jsx` `handleCapture` (sets both on the created transaction). Also update `findItemsMatchingKeyword` so sub keywords participate in the "current best length" comparison.
4. **Searchable `CategoryPicker` combobox** — new `src/CategoryPicker.jsx` replacing the native `<select>` in `src/TransactionEditor.jsx` (the Category field) and the per-line category select in `src/SplitsEditor.jsx`. Props `{ categories, value:{categoryId, subId}, onChange({categoryId, subId}), ariaLabel }`. Click → scrollable nested list (subs indented under parents, grouped by flow via existing `groupCategoriesByFlow`); type → filters parents + subs (matching subs show `Parent › Sub`); parents selectable = `subId:null`; keyboard nav (↑/↓/Enter/Esc), click-outside closes. **Reuse `src/categoriesSearch.js`** — add `flattenForPicker(categories)` and `filterOptions(options, query)` there (Plan 1 already put `filterCategoriesByQuery` in that file).
5. **Reports — expandable per-sub roll-up** — `src/reportsModel.js` aggregation gains a sub dimension (each parent total = sum of per-sub subtotals + an "(unspecified)" remainder for parent rows with no `subId`); `src/CategoryBreakdown.jsx` renders collapsed parent rows that expand to per-sub rows (subs use the parent's color); `src/CategoryBarList.jsx` as needed. Parent totals unchanged when a category has no subs.

## Conventions (match these)
- **TDD, bite-sized tasks, frequent commits.** Commit messages `feat(subs): …` / `fix(subs): …`; end the commit body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do **not** push unless asked.
- Tests: `npx vitest run <path>` (single), `npx vitest run` (full). No jest-dom.
- Lint: the repo has broad **pre-existing** eslint debt; `npx eslint .` is noisy (it also scans `.claude/worktrees/`). Judge regressions by linting only the files you changed. Known pre-existing items to ignore: `App.jsx` `stream` warning, `useCategories.js` exhaustive-deps warning, `CategoryEditor.jsx` set-state-in-effect error. For intentional setState-in-effect, suppress with `// eslint-disable-next-line react-hooks/set-state-in-effect` + a comment (convention used in `useLedger.js`, `useAccountTypes.js`, `SubcategoryEditor.jsx`).
- **Workflow:** the user's standing preference is **inline TDD by Claude (not subagents)** with checkpoints — but they chose subagent-driven for Plan 1 as a one-off. **Ask which they want** before executing.
- Do the feature on a **dedicated branch off `rename-to-tallio`** (e.g. `subcategories-entry`), then finishing-a-development-branch → merge back to `rename-to-tallio` locally.

## Carry-over tech debt / cleanups
- Plan 1 left new classes with inline styles: `sub-list`, `sub-list-row`, `sub-list-name`, `sub-list-kw`, `manage-list-subcount`, `chip-promote`, plus the SubcategoryEditor breadcrumb. A CSS polish pass (in `App.css`) would make them match the design system — fold in during Plan 2 or as a separate polish.
- Optional: an App-level integration test that an Undo button reverts a sub rename (Plan 1 covered this at the hook level only).
- Pre-existing "1 categories" (no singular/plural) label in `ManageCategoriesScreen`.
- Consider `exportArchive.js` round-trips `subcategories` + `subId` (schema v4) — confirm/extend importer if it validates shape.

## Process to follow
1. Invoke `superpowers:writing-plans`; read `docs/superpowers/specs/2026-06-03-subcategories-design.md` + this handoff; map files; write `docs/superpowers/plans/2026-06-03-subcategories-2-entry-and-reports.md` as bite-sized TDD tasks (read the real files for exact anchors — line numbers in Plan 1 will have shifted). Self-review against the spec.
2. Ask the user: inline vs subagent execution.
3. Execute on a branch off `rename-to-tallio`; finishing-a-development-branch when green.

See also the memory note `[[subcategories-undo-search-specs]]`.
