# Undo Everywhere — Design Spec

**Date:** 2026-06-03

## Goal

Make the single global **↩ Undo** reachable from every editing surface (the Manage Categories screen, the Account Types screen, and the editor modals), and extend its snapshot to cover **categories and account types** so that category renames — and every category/keyword/template/account-type edit — become undoable. Today a category name edit cannot be undone because categories are never snapshotted.

## Background

The undo button in `App.jsx` is backed by a `history` stack of whole-app snapshots:

- `pushHistory()` (`App.jsx:129`) captures `{ ledger: ledger.snapshot(), acks: acks.exportSnapshot() }` right before each mutating op; the stack is capped at 20 entries (`prev.slice(-19)`).
- `undo()` (`App.jsx:130-138`) restores the latest snapshot (`ledger.restore`, `acks.restore`) and pops it.
- The button (`App.jsx:420`) shows `↩ Undo (N)` where `N = history.length`, disabled at 0. It lives **only** in the main accounts header.

Two gaps:

1. **Categories and account types are outside the snapshot.** `useCategories` (`src/useCategories.js`) and `useAccountTypes` (`src/useAccountTypes.js`) own their own state + debounced `localStorage` persistence, but expose no `snapshot()/restore()`. The category callbacks App passes to `ManageCategoriesScreen` (`App.jsx:314-321`) and `saveAccountType` (`App.jsx:188-191`) never call `pushHistory()`.
2. **The button is unreachable while a management screen or editor modal is open** — those cover or replace the main header.

## Approach

Keep the **one** unified history stack (matching the user's "one shared Undo, reachable from every screen" decision) and widen it:

- Add `snapshot()/restore()` to `useCategories` and `useAccountTypes`, mirroring `useLedger`.
- Grow each history entry to `{ ledger, acks, categories, accountTypes }`.
- Call `pushHistory()` before every category, sub-category-to-come, keyword, template, and account-type mutation.
- Extract the existing button markup into a reusable `UndoButton` and render it in the management-screen headers and editor modals, all bound to the same `undo` / `history.length`.

This is the same widening already done once for report acks (see `2026-05-20-report-acks-undo-design.md`).

## Changes

### 1. `src/useCategories.js` — add `snapshot()` / `restore()`

- `snapshot()` returns the current `categories` array (reference; updates are immutable so snapshots stay intact).
- `restore(snap)` calls `setCategories(snap || [])`; the existing debounced effect persists it. Export both.

### 2. `src/useAccountTypes.js` — add `snapshot()` / `restore()`

- `snapshot()` returns `types`; `restore(snap)` calls `setTypes(snap || [])` (falls back to a defensive empty array). Persistence auto-fires via the existing effect. Export both.

### 3. `src/UndoButton.jsx` — new reusable component

Presentational only: props `count`, `onUndo`. Renders the exact existing markup/classes from `App.jsx:420` (`btn btn-undo`, `active` when `count > 0`, label `↩ Undo` + ` (count)`, `disabled` at 0). No state of its own.

### 4. `src/App.jsx`

- **Snapshot shape:** `pushHistory` captures `{ ledger: ledger.snapshot(), acks: acks.exportSnapshot(), categories: cats.snapshot(), accountTypes: accountTypes.snapshot() }`.
- **`undo()`:** also `cats.restore(entry.categories)` and `accountTypes.restore(entry.accountTypes)`.
- **Wrap category callbacks** to `ManageCategoriesScreen` so each runs `pushHistory()` first: `onAddCategory`, `onUpdateCategory`, `onDeleteCategory`, `onAddKeyword`, `onRemoveKeyword`, `onAddTemplate`, `onRemoveTemplate`, `onMoveAll`.
- **Wrap `saveAccountType`** with `pushHistory()` (it currently has none; `deleteAccountType` already does at `App.jsx:193`).
- **Pass `onUndo={undo}` + `undoCount={history.length}`** into `ManageCategoriesScreen`, `AccountTypesScreen`, and the App-level editor modals (`AccountEditor`, `TransactionEditor`, `TransferEditor`). Account-type editing is covered by the `AccountTypesScreen` header, since `AccountTypeEditor` renders inside that screen (`AccountTypesScreen.jsx:47`).
- **Replace** the inline button at `App.jsx:420` with `<UndoButton count={history.length} onUndo={undo} />`.
- **Ctrl+Z (nice-to-have):** a `window` `keydown` listener that calls `undo()` on Ctrl/Cmd+Z, **ignored** when the event target is an `input`, `textarea`, or `contenteditable` (so native text-editing undo is preserved). Added/removed in a `useEffect`.

### 5. `src/ManageCategoriesScreen.jsx` & `src/AccountTypesScreen.jsx`

Accept `onUndo` + `undoCount`; render `<UndoButton>` in each screen's header (next to the existing Back/title). No other logic changes.

### 6. App-level editor modals — `AccountEditor.jsx`, `TransactionEditor.jsx`, `TransferEditor.jsx`

Accept `onUndo` + `undoCount` and render `<UndoButton>` in the modal header/footer, so undo is reachable while a modal covers the main header. (`AccountTypeEditor` needs no change — it sits inside `AccountTypesScreen`, whose header carries the button.)

## Data Flow

Rename a category on the Manage screen → `CategoryEditor.commitName` → App's wrapped `onUpdateCategory` runs `pushHistory()` (capturing categories *before* the rename) → `cats.updateCategory` renames → `history.length` +1 so every `UndoButton` enables → click any **Undo** → snapshot restored → name reverts. One stack, so the same click also covers a prior ledger or account-type change in last-in-first-out order.

## Consequences & Edge Cases

- Every `pushHistory()` now snapshots four slices; undoing a ledger-only op also "restores" unchanged categories/types — a harmless no-op. 20-entry cap and disabled-at-empty behavior unchanged.
- Restoring categories/types fires their debounced `localStorage` writes, so an undo persists across refresh.
- **Modal + local draft:** Undo inside an editor modal reverts the last *committed* action, not the modal's unsaved local draft (use Cancel for that). Noted, accepted.
- Snapshots hold references; all four hooks update immutably, so earlier snapshots remain intact.

## Testing

- **`src/useCategories.test.jsx`:** `snapshot()/restore()` round-trip — rename a category, restore an earlier snapshot, assert the old name returns (mirrors `useLedger.test.jsx` "snapshot/restore round-trips for undo").
- **`src/useAccountTypes.test.jsx`:** snapshot/restore round-trip for a type edit.
- **`src/UndoButton.test.jsx`:** renders count/label, disabled at 0, calls `onUndo` on click.
- **Component:** `ManageCategoriesScreen` renders an enabled Undo button when `undoCount > 0` and invokes `onUndo`.
- **In-app verification:** on the Categories screen, rename a category → Undo → name reverts; add a keyword → Undo → it's gone.

## Out of Scope

- Redo.
- Per-screen undo stacks.
- Sub-categories (separate spec, `2026-06-03-subcategories-design.md`) — its new mutations will reuse the `pushHistory()` wrapping established here.
