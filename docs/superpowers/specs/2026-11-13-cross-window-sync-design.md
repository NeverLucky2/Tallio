# Cross-window sync — design (short)

**Date:** 2026-11-13 · **Size:** small change · **Status:** approved (user: "A seems good… approve the spec after self review")

## Intent

Two Tallio windows open on the same data can silently lose changes. Each window
loads the data once, keeps its own copy in memory, and saves the *whole* copy back
on every edit. A window that didn't see a change made elsewhere overwrites it the
next time anything is edited there.

This now happens in normal use:
- Claude adds an entry in its own Chrome tab (via Claude in Chrome) while the user's
  Tallio window is open.
- Double-clicking the desktop icon while Tallio is already open gives a second window.

## Goals

- When another window saves Tallio's main data, every other open Tallio window
  reloads at once, so it always shows and saves the latest data.
- After such a reload, a short note says why: **"Updated from another Tallio window"**.

## Non-goals / anti-goals

- No merging edits from two windows; no single-active-window lock.
- Never reload because of the copy/paste clipboard or celebration counters — that
  would only be flicker.
- Never a reload loop (a reload must not itself make other windows reload forever).

## Approaches (user picked A)

- **A. Reload the other window (chosen).** One listener, reuses the normal startup
  path, covers every store, and resets that window's Undo list. That reset is wanted,
  because Undo holds whole-ledger snapshots that would roll the other window's change back.
  Cost: anything half-typed in the window that reloads is lost.
- B. Update stores in place. Keeps half-typed input, but touches ~8 hooks and Undo still
  holds stale snapshots.
- C. One active window ("Use here"). No clashes, but Claude's tab would lock the user's
  window, and a second double-click would lock the first.

## Design

- Listen for the browser's `storage` event (fires only in *other* same-origin windows).
- Reload when the changed key is one of:
  - `tallio-accounts`
  - `tallio-transactions`
  - `tallio-categories`
  - `tallio-payees`
  - `tallio-templates`
  - `tallio-account-types`
  - `tallio-report-acks`
  - `tallio-appearance`

  Also reload when `key` is `null` (another window cleared storage).
  Ignore every other key, and ignore events from `sessionStorage`.
- Before reloading, set a one-shot flag in `sessionStorage`. On startup, if the flag is
  present, clear it and show the toast via the existing `flashToast`.
- Reload goes through the existing `reloadApp()` seam.
- Side benefit: a window with a linked live `.tallio` file stops autosaving a stale copy into it.

## Left to the builder

- Module/function names.
- Whether duplicate events (the ledger writes two keys) need de-duping. A second
  `location.reload()` is harmless.

## Self-review notes

- **Settings keys** (API key, model, UI scale, business mode) are excluded. `useSettings.save`
  writes only the fields being changed, so a stale window can't clobber them.
- **Loop risk:** browsers skip the `storage` event when `setItem` writes an identical
  value. Hooks that re-save on mount therefore converge after at most one bounce.
  Verify live with two tabs.
- **Archive restore** writes the listed keys, so other windows pick up a restore too.
