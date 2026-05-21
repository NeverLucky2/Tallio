# BillTracker — Report Acknowledgments (Phase 3 addendum)

**Date:** 2026-05-20
**Status:** Approved for planning
**Branch context:** Extends the Phase-3 Reports work (branch `worktree-accounts-revamp-phase-1`, off `master`; Phases 1–3 not yet merged). Depends on `reportsModel.js`, `RecurringList.jsx`, `ReportsScreen.jsx`, `exportArchive.js`, and `App.jsx`, all from the just-completed Reports dashboard. Companion spec: `2026-05-20-reports-design.md`.

## Overview

Make the **Recurring & subscriptions** report actionable: let the user tag a recurring charge with a **status** and dismiss a flagged duplicate, with both choices **persisted** so the report stops nagging on known-good items and instead surfaces genuinely suspicious ones.

Three subscription statuses:
- **ongoing** — a known regular payment (greenlit; never warned).
- **cancelled as of `YYYY-MM`** — the user stopped it; the app raises a **zombie alert** if a charge is dated after that month (the manual "caught a charge after I cancelled" workflow, automated).
- **unreviewed** (default) — detected but untagged; shown neutrally.

Plus **duplicate dismissal** — mark a specific flagged duplicate (the exact transaction set, e.g. a legitimate double photocopy) as not-a-duplicate, so those rows never flag again while a genuinely new double-charge still does.

The feature is **additive and back-compatible**: absent acknowledgments behave exactly like today's report. No transaction/account schema change.

### Motivation

The reports' primary user reconciles to a few dollars/year and manually catches zombie subscriptions and dual charges. The current report's red "charged after stopping?" flag is a **staleness heuristic** that false-fires on old data (it flagged `CHIN.CHRISTIAN UN` simply because no newer data was uploaded). This addendum replaces guesswork with **explicit, user-curated truth**.

## Goals

- Persist a per-subscription **status** (ongoing / cancelled-as-of-month) keyed by the recurring charge's normalized label.
- Persist **duplicate dismissals** keyed by the exact transaction-id set.
- Reorganize the Recurring card into status groups, **alerts first**: ⚠ Alerts → ✓ Ongoing → Cancelled (clean) → Needs review.
- Detect **zombie charges**: a cancelled subscription charged after its cancellation month.
- Keep all detection/classification logic **pure and unit-tested** in `reportsModel.js`.
- Include acknowledgments in the export backup (`data.json`).

## Non-Goals

- No alerting when an **ongoing** subscription unexpectedly **stops** (missed-charge detection). Future work.
- No fuzzy / ±N-day duplicate matching (still exact same-day, same-amount, same-label).
- No archive **import** path (none exists today); export is backup-only.
- No change to the four other reports, the period/scope controls, or transaction data.
- No bulk "mark all" actions.

---

## Behavior change (intentional)

The current red **"charged after stopping?"** flag — driven purely by the `active`/stale heuristic (last occurrence > 1 month before `now`) — is **removed from the UI**. Staleness alone is no longer alarming (it false-fires on old data). **Red is reserved for true zombies**: a charge dated after an explicit cancellation month. Unreviewed recurring rows render neutrally (e.g. "last seen MMM YYYY"). `recurringCharges` may keep returning `active`/`varies` as informational fields, but `RecurringList` no longer renders a staleness warning.

---

## Data model & persistence

New localStorage key `billtracker-report-acks`, owned by a new hook **`useReportAcks`** (mirrors `useCategories`: `load()` → `useState` → debounced persist → `storageError` surface, with a `clearStorageError`). Shape:

```js
{
  // status per recurring charge, keyed by its NORMALIZED label
  subscriptions: {
    [normalizedLabel]: { status: 'ongoing' | 'cancelled', cancelledAsOf?: 'YYYY-MM' }
  },
  // dismissed duplicate sets, each = the duplicate's sorted txn ids joined by '|'
  dismissedDuplicates: [ 'd1|d2', … ]
}
```

- **`normalizedLabel`** is the SAME normalization `recurringCharges` uses internally (upper-cased, trimmed, whitespace-collapsed `payee || description`). The detection grouping key and the ack key are identical, so a status always lines up with its detected charge.
- **Duplicate signature** = `findDuplicates` result's `ids` sorted ascending and joined with `'|'`. Precise to those exact rows; a future double-charge with new ids produces a different signature and still flags.
- `cancelledAsOf` is a `'YYYY-MM'` month string.

### `useReportAcks` API

```
subscriptions                       // the { [label]: {status, cancelledAsOf?} } object
dismissedDuplicates                 // array of signature strings
setStatus(label, status, cancelledAsOf?)  // upsert; cancelledAsOf required when status==='cancelled'
clearStatus(label)                  // remove the label's entry (back to unreviewed)
dismissDuplicate(signature)         // add signature (no dupes)
restoreDuplicate(signature)         // remove signature
storageError, clearStorageError
exportSnapshot()                    // → { subscriptions, dismissedDuplicates } for the archive
```

`load()` tolerates a missing/corrupt key → `{ subscriptions: {}, dismissedDuplicates: [] }`. Unknown `status` values are ignored on read (treated as unreviewed).

---

## Pure model — `reportsModel.js` (additive)

1. **`recurringCharges(...)`** — add a **`key`** field (the normalized label) to each returned row, so the UI/classifier can match acks. All existing fields unchanged.

2. **`classifyRecurring(rows, subscriptions, { now }) → { alerts, ongoing, cancelled, review }`** (new, pure):
   - `rows` = `recurringCharges` output (each has `key`, `lastDate`, …).
   - For each row, look up `subscriptions[row.key]`:
     - **ongoing** → `ongoing[]`.
     - **cancelled** → zombie test: if `row.lastDate.slice(0,7) > cancelledAsOf` → push to `alerts[]` with `{ ...row, alert: 'zombie', cancelledAsOf }`; else push to `cancelled[]` with `{ ...row, cancelledAsOf }` (clean).
     - **no entry / unknown** → `review[]`.
   - Boundary: a charge **in** the cancellation month (`=== cancelledAsOf`) is **not** a zombie (cancellation effective end of that month); only **strictly after** triggers the alert.
   - Each bucket preserves `recurringCharges` ordering (active-first, then amount).

3. **`findDuplicates(...)`** — add a **`signature`** field (`ids` sorted, joined `'|'`) to each result, and accept **`opts.dismissed`** (a `Set<string>` of signatures, default `null`): results whose signature is in `dismissed` are excluded. Back-compat: no `dismissed` → today's behavior.

`accountsModel.js` is untouched.

---

## UI

### `RecurringList.jsx` (reworked)

**New props:** `{ classified, duplicates, onSetStatus, onClearStatus, onDismissDuplicate }`
- `classified` = `classifyRecurring(...)` result `{ alerts, ongoing, cancelled, review }`.
- `duplicates` = `findDuplicates(...)` result already filtered by dismissed signatures (so the list only shows live ones).
- `onSetStatus(label, status, cancelledAsOf?)`, `onClearStatus(label)`, `onDismissDuplicate(signature)`.

**Sections (render in this order; omit an empty section):**

1. **⚠ Alerts** — zombie rows (red): `{label} — charged after cancellation (cancelled {MMM YYYY})`; plus the live **Possible duplicates** entries, each red with `{label} · {amount} · {date} · {n}× same day` and a **[Not a duplicate]** button (`onDismissDuplicate(signature)`).
2. **✓ Ongoing subscriptions** (green) — `{label} {avg}/mo · {occurrences}×`, with a small **[Change]** control (→ opens the status editor to clear/re-tag).
3. **Cancelled** (neutral) — `{label} · cancelled {MMM YYYY} — no further charges`, with **[Change]**.
4. **Needs review** (neutral) — `{label} {avg}/mo · {occurrences}× · last seen {MMM YYYY}`, with **[✓ Mark ongoing]** and **[Mark cancelled…]**.

**Mark-cancelled affordance:** clicking **[Mark cancelled…]** reveals an inline `<input type="month">` defaulting to the charge's `lastDate` month, plus a confirm button → `onSetStatus(label, 'cancelled', month)`. **[✓ Mark ongoing]** → `onSetStatus(label, 'ongoing')`. **[Change]** (on ongoing/cancelled rows) → `onClearStatus(label)` (back to review), from which the user can re-tag.

Empty overall state unchanged ("No recurring charges detected…"). Glyphs/emoji wrapped in `<span aria-hidden>` per the component-test convention.

### `ReportsScreen.jsx`

- **New props:** `{ acks }` (the `useReportAcks` instance) — or the discrete `subscriptions`, `dismissedDuplicates`, and the four callbacks. Lean: pass the discrete pieces to keep `ReportsScreen` testable without the hook.
- Compute `classified = useMemo(() => classifyRecurring(recurring, subscriptions, { now: nowDate }), …)`.
- Build `dismissedSet = useMemo(() => new Set(dismissedDuplicates), …)` and pass `dismissed: dismissedSet` into `findDuplicates`.
- Pass `classified`, the filtered `duplicates`, and the callbacks to `RecurringList`.
- Existing four reports unchanged.

### `App.jsx`

- Instantiate `const acks = useReportAcks();`.
- Pass `subscriptions={acks.subscriptions}`, `dismissedDuplicates={acks.dismissedDuplicates}`, and the callbacks (`acks.setStatus`, `acks.clearStatus`, `acks.dismissDuplicate`) to `ReportsScreen`.
- Surface `acks.storageError` via the existing toast pattern (same as `ledger.storageError` / `cats.storageError`).
- Acknowledgments are **not** part of the undo history (they are separate user preferences, not ledger edits).

---

## Export — `exportArchive.js`

- `buildDataJson(...)` and `buildArchive({...})` gain an optional **`reportAcks`** argument, serialized into `data.json` as a top-level `reportAcks` field (`{ subscriptions, dismissedDuplicates }`). Absent → omit or default `{}`; back-compat. `App.exportData` passes `acks.exportSnapshot()`.
- **CSV unchanged** (acknowledgments are not transaction rows).
- No `schemaVersion` bump required (purely additive JSON field); existing v4 readers ignore unknown fields.

---

## Edge cases (resolved)

- **Label collision:** two distinct payees normalizing to the same label share one status. Rare; accepted and documented (the same normalization already groups them as one recurring charge anyway).
- **Status for a charge that no longer recurs** (dropped below the ≥2-month threshold): the stored entry is harmless and simply doesn't render until the charge reappears. No cleanup needed.
- **Cancel-month boundary:** charge dated within `cancelledAsOf` month = not a zombie; strictly after = zombie.
- **Dismissed duplicate that no longer collides** (a row was edited/deleted): the signature stays stored but matches nothing — harmless.
- **Corrupt/missing acks key:** treated as empty; never throws.
- **Ongoing subscription that stops:** no alert this phase (only explicit cancellation drives alerts). Future work.

---

## Testing (TDD)

- **`reportsModel.test.js`**
  - `recurringCharges` now returns a `key` equal to the normalized label.
  - `classifyRecurring`: an `ongoing` row lands in `ongoing`; a `cancelled` row with a later charge lands in `alerts` with `alert:'zombie'`; a `cancelled` row with the last charge **in** the cancel month lands in `cancelled` (clean); an untagged row lands in `review`; ordering preserved.
  - `findDuplicates`: each result has a `signature`; passing `dismissed` excludes matching sets; new ids with the same pattern still surface.
- **`useReportAcks.test.jsx`**: `setStatus` upsert (ongoing & cancelled+month), `clearStatus`, `dismissDuplicate`/`restoreDuplicate` (no dupes), persistence to localStorage, corrupt-load tolerance, `exportSnapshot` shape.
- **`RecurringList.test.jsx`**: renders the four groups from a `classified` fixture; **[✓ Mark ongoing]** fires `onSetStatus(label,'ongoing')`; **[Mark cancelled…]** reveals a month input and confirming fires `onSetStatus(label,'cancelled','YYYY-MM')`; a zombie alert row renders red with the cancellation month; **[Not a duplicate]** fires `onDismissDuplicate(signature)`; **[Change]** fires `onClearStatus`.
- **`exportArchive.test.js`**: `buildDataJson(..., reportAcks)` includes a `reportAcks` field with the given subscriptions/dismissedDuplicates; omitting it stays back-compatible.
- **`ReportsScreen.test.jsx`**: a dismissed-duplicate signature passed in removes that row from the rendered duplicates; a `cancelled`+later-charge fixture renders an alert. (Existing ReportsScreen tests stay green.)
- **Bar:** zero new lint errors/warnings from touched files; full suite green.

## Implementation order (review checkpoints in bold)

1. **`reportsModel` changes** — `recurringCharges.key`, `classifyRecurring`, `findDuplicates.signature`+`dismissed`. Pure, fully unit-tested.
2. **`useReportAcks`** hook + tests. **— Checkpoint: model + persistence green.**
3. **`RecurringList`** rework (four groups, actions, month input) + tests.
4. **`ReportsScreen`** wiring (`classifyRecurring`, dismissed filter, callbacks) + test.
5. **`App.jsx`** wiring (`useReportAcks`, props, storageError toast) + **export** `reportAcks` field + test. **— Checkpoint: verify in-app at `--port 5174`.**

Keep new params optional/defaulted so existing Reports tests stay green during the change.

## Resolved decisions (from brainstorming)

- **Statuses:** ongoing / cancelled-as-of-month / unreviewed; keyed by normalized label.
- **Cancelled behavior:** zombie alert when charged strictly after the cancellation month; otherwise shown as cleanly cancelled.
- **Card layout:** grouped by status, alerts first (⚠ Alerts → ✓ Ongoing → Cancelled → Needs review).
- **Duplicate dismissal:** by the exact transaction-id set (signature), not by pattern.
- **Staleness flag:** the red "charged after stopping?" heuristic is removed; red is reserved for true zombies.
- **Persistence:** new `billtracker-report-acks` localStorage key via `useReportAcks`; not part of undo.
- **Export:** acknowledgments included in `data.json` (backup-only; no import path).

## Future work (out of scope)

- Missed-charge alert when an **ongoing** subscription stops charging.
- Fuzzy duplicate matching (±N-day window, near-equal amounts).
- An archive **import** path that restores acknowledgments.
- A dedicated "Subscriptions" manager screen (rename/merge labels, set expected cadence/amount).
