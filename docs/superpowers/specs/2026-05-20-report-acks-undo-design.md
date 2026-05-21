# Undoable Report Acknowledgments — Design Spec

**Date:** 2026-05-20

## Goal

Let the existing global **↩ Undo** button revert every recurring-report acknowledgment action: **Mark ongoing**, **Mark cancelled**, **Change** (clear status), and **Not a duplicate** (dismiss duplicate). Today these live in a separate `useReportAcks` hook that the undo stack never snapshots, so they cannot be undone.

## Background

The undo button in `App.jsx` is backed by a `history` stack of whole-ledger snapshots:

- `pushHistory()` (`App.jsx:129`) captures `ledger.snapshot()` (`{ accounts, transactions }`) right before each mutating ledger op; the stack is capped at 20 entries.
- `undo()` (`App.jsx:130`) restores the latest snapshot via `ledger.restore()` and pops it.
- The button (`App.jsx:401`) shows `↩ Undo (N)` where `N = history.length`, disabled at 0.

Report acknowledgments (`subscriptions` + `dismissedDuplicates`) were deliberately kept out of this snapshot during the report-acknowledgments work. This spec reverses that decision so the two pieces of state share one undo history.

## Approach

Fold the acks state into the **same** snapshot stack rather than building a parallel undo path. This keeps a single unified history with one consistent count — matching the user's request to use "the undo button."

## Changes

### 1. `src/useReportAcks.js` — add `restore(snapshot)`

A new method that replaces the full acks state from a `{ subscriptions, dismissedDuplicates }` object — the mirror of the existing `exportSnapshot()`. It uses the hook's existing immutable-update pattern (`setAcks`), so the restored state auto-persists through the debounced `localStorage` effect. Defensive: tolerate a missing/partial snapshot by falling back to empty `{}` / `[]`. Export it alongside the other actions.

### 2. `src/App.jsx` — three edits

- **History entry shape:** change from `ledger.snapshot()` to `{ ledger: ledger.snapshot(), acks: acks.exportSnapshot() }`.
- **`undo()`:** restore both — `ledger.restore(entry.ledger); acks.restore(entry.acks)`.
- **Wrap the three acks callbacks** passed to `ReportsScreen` so each calls `pushHistory()` before mutating:
  - `onSetStatus={(key, status, month) => { pushHistory(); acks.setStatus(key, status, month); }}`
  - `onClearStatus={(key) => { pushHistory(); acks.clearStatus(key); }}`
  - `onDismissDuplicate={(sig) => { pushHistory(); acks.dismissDuplicate(sig); }}`

### 3. No change to `ReportsScreen.jsx` / `RecurringList.jsx`

They already invoke the callbacks with the correct arguments; only the handlers App passes down change.

## Data Flow

Click **Not a duplicate** → App's wrapped handler runs `pushHistory()` (captures ledger + acks while the duplicate is still flagged) → `acks.dismissDuplicate(sig)` hides it; undo count +1 → click **Undo** → snapshot restored → duplicate reappears. Identical pattern for **Mark ongoing** / **Mark cancelled** / **Change**.

## Consequences & Edge Cases

- Every `pushHistory()` now also snapshots acks, so undoing a *ledger* op restores acks too — a harmless no-op when acks did not change, and vice-versa. The 20-entry cap and disabled-at-empty behavior are unchanged.
- Restoring acks triggers the debounced `localStorage` write, so an undone dismissal stays undone across a refresh.
- Snapshots hold references; both hooks update immutably, so earlier snapshots remain intact (same guarantee the ledger already relies on).
- `restoreDuplicate` remains exported but unwired (no UI surface today); out of scope.

## Testing

- **Unit (`src/useReportAcks.test.jsx`):** a `restore()` round-trip — set a status and dismiss a signature, capture an earlier (empty) snapshot, restore it, assert state cleared — mirroring `useLedger.test.jsx:51` (`snapshot/restore round-trips for undo`).
- **App-level wiring** is not unit-tested today (no `App.test.jsx`); verify in-app: dismiss a duplicate → Undo → it returns; Mark ongoing → Undo → it returns to **Needs review**.

## Out of Scope

- No new "restore dismissed duplicate" UI.
- No redo.
- No change to how the ledger itself snapshots.
