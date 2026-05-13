# Sub-project C — Duplicate & Opt-in Auto-Recurring

**Date:** 2026-05-11
**Status:** Approved (design)
**Part of:** Quicken-replacement initiative, sub-project C of A→B→C→D
**Depends on:** Sub-project A (categories as data), Sub-project B (income & transaction types)

## Summary

Add two write-side features to BillTracker: **literal duplication** (item-level and bill-level explicit copy) and **opt-in auto-recurring** (bill-level marker that auto-creates the bill in subsequent months on app load). Both ride on the existing bill/item shape with two new optional fields on bills — `recurring: bool` and `recurringChainId: string | null` — and a single new localStorage key for a first-run tip flag. No new persisted slice. The read-side `findRecurringCharges` detector continues to work for inferred patterns; auto-managed chains coexist with inferred entries in the existing three flow-grouped Recurring panels with a `✓ AUTO` badge, and inferred entries gain a one-click "Make recurring" promote action.

## Goals

- Item-level duplicate via a small `⧉` icon on each item row (creates a same-bill twin, no date shift).
- Bill-level duplicate via a footer button that opens a small month picker (defaults to next month) — supports same-month or any chosen month with date-shifted items.
- "Make Recurring / Recurring · on" toggle in the BillCard footer; a passive `RECURRING` badge in the header for glanceability across the bill list.
- On app load, each active recurring chain materializes one new bill per missed month from the chain's latest instance forward up to today (no future pre-materialization).
- Catch-up dedupe: skip months already linked to the chain id; for same-vendor non-chain bills in a target month, prompt **Link / Duplicate / Skip**.
- First-time tip dialog the first time any bill is marked recurring — explains latest-instance-is-the-source + Undo as safety net. Tracked via `billtracker-recurring-tip-seen`.
- "Make recurring" button per inferred row in the Recurring panels — creates a fresh single-item auto-managed bill in the current month.
- Schema round-trips cleanly through JSON export: both new fields are pure additions to the bill shape.

## Non-goals

- Variable-amount recurring detection logic (still handled by `findRecurringCharges` inference).
- Item-level auto-recurring (items have no temporal home of their own; the bill is the unit).
- A separate `recurringTemplates` persisted slice — the latest-instance-is-the-source model needs no template object.
- Pre-materialization of future months. Only current and missed past months get spawned.
- Cadences other than monthly (weekly, bi-weekly, yearly).
- Bulk operations across chains (no "end all recurring," no "pause for two months").
- A clipboard concept with intermediate state — bill-level duplicate is one-step with a month picker.
- Reconciling auto-spawned bills against actual bank/credit-card imports.

## Data Model

### New fields on the bill — both additive and optional

```js
{
  id: "bill_abc",
  vendor: "Honda Finance",
  month: "2026-05",
  items: [...],
  // NEW — both absent on legacy bills (read as falsy / null):
  recurring: true,                  // boolean; true on every instance contributing to spawn detection
  recurringChainId: "rec_h7k2j9pq", // nanoid(8); identical across every instance in the chain
}
```

### Field semantics

- `recurring` is the per-instance flag the user toggles. It says "this instance is part of an active recurring chain." Historical spawns retain `recurring: true` so the chain remains visible in history.
- `recurringChainId` is the stable group key. Generated once with `nanoid(8)` at the moment the user first marks a bill recurring. Inherited verbatim by every spawned instance and by any "Link"-action existing bill that joins the chain.
- Toggling `recurring: false` on the latest instance implicitly ends the chain — no further spawns happen. `recurringChainId` stays on past instances so the historical grouping remains.
- Toggling `recurring: false` on a non-latest instance (e.g., the user opens the January bill in a May-active chain and clicks "Recurring · on" → off) has no effect on spawn behavior — the algorithm still picks the chronologically latest `recurring: true` instance as the source. The user has effectively rewritten history but not changed forward behavior. Acceptable; not worth restricting in the UI.

### Chain definition

A "chain" is the set of all bills sharing one `recurringChainId`. The chain's **source** for the next spawn is the chronologically latest instance where `recurring === true`. If no such instance exists, the chain is dormant — no spawns occur. This is the entire "end recurring" mechanism: clear the flag, lose the source.

### Duplicate behavior re: chains

The bill-level "Duplicate Bill" action creates an independent copy **without** `recurring` and **without** `recurringChainId`. A duplicate is always a clean one-off; the user re-toggles it to make it recurring. This avoids the "I just wanted a one-off" surprise of auto-inheriting the chain. Item-level duplicate inherits the source item's fields verbatim (it's a same-bill twin).

### Date shifting

A new pure helper in `spendingMath.js`:

```js
export function shiftItemDate(date, targetMonth) {
  if (!date || typeof date !== 'string' || !DATE_RE.test(date)) return null;
  const day = parseInt(date.slice(8, 10), 10);
  const [yStr, mStr] = targetMonth.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  const lastDay = new Date(year, month, 0).getDate();
  const clampedDay = Math.min(day, lastDay);
  return `${targetMonth}-${String(clampedDay).padStart(2, '0')}`;
}
```

Used by both `computeCatchUp` (auto-spawn) and the cross-month bill-level duplicate. Null in → null out. Jan 31 → Feb 28/29 via clamping. Same-month is a no-op (shift by zero).

### Schema version

**No bump.** The two new fields are additive optionals — older code reads them as `undefined`, which is correctly falsy for `recurring` and null-equivalent for `recurringChainId`. JSON exports from pre-C apps remain valid input; exports from C-aware apps imported back into a pre-C app silently drop the recurring metadata. Schema version stays at `3`.

### localStorage keys

| Key | Purpose | New in C? |
|---|---|---|
| `billtracker-bills` | Bills (shape extended only with optional fields) | existing, additive |
| `billtracker-categories` | Categories | existing, unchanged |
| `billtracker-schema-version` | Schema integer — stays at 3 | unchanged |
| `billtracker-tracked-keywords` | Tracked keywords | existing |
| `billtracker-undo-tip-seen` | First-run undo tip | existing |
| `billtracker-chart-collapsed` | Chart collapse | existing |
| `billtracker-recurring-tip-seen` | First-time recurring tip dismissed | **new** |

## Auto-spawn & Catch-up Dedupe

### When it runs

Once per app load, after the existing v3 migration completes in `initializeFromStorage`. Catch-up is the last step of initialization before bills are handed to the React tree. Subsequent renders within the same session do not re-trigger it.

### Pure planning function

Lives in `spendingMath.js`:

```js
computeCatchUp(bills, todayMonth) → {
  bills,            // bills array with all unambiguous spawns appended
  conflicts,        // queue of unresolved Link/Duplicate/Skip prompts
}
```

`conflicts` is an array of `{ chainId, chainSourceBillId, targetMonth, existingBillId }` — one entry per (chain × target-month) where a same-vendor non-chain bill blocks a clean spawn.

### Algorithm

1. Group bills by `recurringChainId`. Skip the `null` group.
2. For each chain:
   a. Find the chronologically latest instance where `recurring === true`. Call this the **source**. If none, skip the chain (dormant).
   b. Compute target months: every month strictly after `source.month` up to and including `todayMonth`.
   c. For each target month in chronological order:
      - **Already in chain?** If any bill has `recurringChainId === chainId && month === targetMonth`, skip — already materialized.
      - **Same-vendor conflict?** Else if any bill has `vendor === source.vendor && month === targetMonth && recurringChainId !== chainId` (including null), push a conflict entry and **stop iterating further months for this chain**. Resolving the conflict resumes catch-up.
      - **Clean spawn.** Otherwise: clone source as a new bill — new `id` via `crypto.randomUUID()`, `month: targetMonth`, items mapped through `shiftItemDate(item.date, targetMonth)` and each given a fresh item id, `recurring: true`, `recurringChainId` carried over. Append to bills.
3. Return the new bills array + the conflict queue.

The "stop on conflict for this chain" rule keeps the chain's chronology coherent: we don't materialize July if June is unresolved.

### Conflict-dialog flow (in `App.jsx`)

- `pendingConflictQueue` state populated from `computeCatchUp(...).conflicts`.
- A single `RecurringConflictDialog` modal renders for the head of the queue. Three actions:
  - **Link** → patch the existing bill with `recurringChainId: <chainId>, recurring: true`. Pop the head. Re-run `computeCatchUp` so subsequent months for the same chain can now resume.
  - **Duplicate** → spawn the source as a new bill in the conflict month with the chain id; both bills coexist. Pop the head. Re-run catch-up.
  - **Skip** → no bill changes for that month; the chain effectively pauses for one month. Pop the head. Re-run catch-up resuming from `source.month + 2` for this chain (the prior source remains the source).
- After the queue empties, normal UI resumes. Toast: `Created N recurring bill(s).` Suppressed when net new spawns = 0.
- All conflict resolutions push to undo history exactly like manual edits — Undo reverses a wrong Link / Duplicate / Skip.

### Dialog wording

> **May already has a Honda Finance bill.**
>
> Honda Finance is set to recur monthly, and there's already a bill from this vendor in May. What should happen?
>
> - **Link** — join the existing May bill to the recurring chain.
> - **Duplicate** — create a separate recurring instance alongside it.
> - **Skip** — leave May alone; resume the chain in June.

### Edge cases

| Case | Behavior |
|---|---|
| App loaded twice in the same session | Dedupe by chain id makes the second run a no-op. Idempotent. |
| System clock travels backward (today < source.month) | No target months. No-op for that chain. |
| Chain's source month is today | No target months. No-op. |
| Source bill has zero items | Spawn still works (empty-items bill in target month). User can edit. |
| Source vendor is empty string | Matches any other empty-vendor bill in target month → surfaces as conflict. Acceptable. |
| Today's month computation | `new Date().toISOString().slice(0, 7)` (UTC), consistent with `currentMonth()` elsewhere. |
| User dismisses the conflict dialog by reloading without choosing | Conflict re-queues on next load — `computeCatchUp` re-detects it. No durable state needed for "in-progress" conflicts. |

## Duplicate UX

### Item-level (same-bill twin)

Each `BillItem` row gets a small `⧉` icon button between the existing fields and the existing `×` delete button. Click handler calls a new prop `onDuplicate(item)`. `BillCard` inserts a clone of the source item immediately below the source in the items array:

```js
function duplicateItem(sourceItem) {
  const twin = { ...sourceItem, id: crypto.randomUUID() };
  const idx = bill.items.findIndex(i => i.id === sourceItem.id);
  onUpdate({
    ...bill,
    items: [...bill.items.slice(0, idx + 1), twin, ...bill.items.slice(idx + 1)],
  });
}
```

`onUpdate` already pushes to undo history via the existing `updateBill` → `pushHistory` chain. No date shift (same bill, same month → same date). The twin starts with the source's description / amount / category / date for the user to edit.

CSS: reuse the existing item-row icon-button styling with the amber accent (`#d4a85399`) for the duplicate language. Tooltip: `Duplicate item`.

### Bill-level (cross-month duplicate via month picker)

The expanded BillCard footer gains a `⧉ Duplicate Bill` button between `+ Add Item` and `Delete Bill`. Clicking opens a new `DuplicateBillDialog` modal — small, centered, with:

- A `<input type="month">` pre-filled to `shiftMonth(bill.month, +1)` (next month).
- Cancel and Duplicate buttons. Duplicate is disabled if the month input is empty or malformed.

On confirm, in `App.jsx`:

```js
function duplicateBill(sourceBill, targetMonth) {
  pushHistory(bills);
  const copy = {
    ...sourceBill,
    id: crypto.randomUUID(),
    month: targetMonth,
    items: sourceBill.items.map(i => ({
      ...i,
      id: crypto.randomUUID(),
      date: shiftItemDate(i.date, targetMonth),
    })),
    recurring: false,
    recurringChainId: null,
  };
  setBills(prev => [copy, ...prev]);
  setSelectedMonth(targetMonth);
  setSearchTerm('');
  setNewlyAddedBillId(copy.id);
}
```

- `recurring` and `recurringChainId` are explicitly stripped — duplicate is always an independent clean copy.
- `setSelectedMonth(targetMonth)` mirrors `addManualBill` so the user lands on the target month.
- `setNewlyAddedBillId(copy.id)` triggers the existing highlight + auto-expand affordance.

### New file: `DuplicateBillDialog.jsx`

Mirrors the existing `ConfirmDialog` pattern: backdrop + centered modal, title, body, Cancel/Confirm buttons. Local state holds the target-month draft. ~30-50 lines.

```js
<DuplicateBillDialog
  sourceBill={bill}
  onConfirm={(targetMonth) => duplicateBill(bill, targetMonth)}
  onCancel={() => setPendingDuplicateBillId(null)}
/>
```

Wired via a new `pendingDuplicateBillId` state in `BillTracker`, parallel to `pendingDeleteBillId`.

### Affordance visibility

| Context | Bill-level `Duplicate Bill` | Item-level `⧉` |
|---|---|---|
| BillCard collapsed | hidden | hidden |
| BillCard expanded, items present | visible in footer | visible per row |
| BillCard expanded, zero items | visible in footer | n/a |
| Search-active view | visible | visible per row |

## UI Surfaces

### BillCard — passive header badge

When `bill.recurring === true`, a small `RECURRING` badge renders in `.bill-right`, immediately to the left of the total. Reuses the visual language of `.sub-badge` with the amber accent (`#d4a853`) and a leading `↻` glyph.

```jsx
{bill.recurring && (
  <span className="bill-badge-recurring">
    <span className="bill-badge-glyph">↻</span> RECURRING
  </span>
)}
```

CSS lives in `App.css`: small, uppercase, letter-spaced, amber tint, razor-thin border. Always visible — same in collapsed and expanded states.

### BillCard — footer toggle

The expanded footer gains a `↻` toggle button between `⧉ Duplicate Bill` and `Delete Bill`:

| State | Label | Class | Click action |
|---|---|---|---|
| not recurring | `↻ Make Recurring` | `btn btn-recurring` | Set `recurring: true`, set `recurringChainId: nanoid(8)`, push history. If first time, show tip dialog. |
| recurring | `↻ Recurring · on` | `btn btn-recurring btn-recurring-on` (blue tint) | Set `recurring: false` on this bill only. `recurringChainId` is **kept** so the chain's historical grouping survives. Push history. |

No confirmation dialog; the undo lane is the safety net.

### First-time recurring tip dialog

Triggered the first time any "Make Recurring" click fires while `localStorage.billtracker-recurring-tip-seen !== 'true'`. Single dismiss button writes the flag. Wording:

> **About recurring bills**
>
> Marking this bill as recurring tells BillTracker to **auto-create next month's copy** the next time you open the app. The latest instance in the chain is always the source — so editing future months naturally updates what gets copied forward.
>
> If you change your mind, click **Recurring · on** to turn it off, or hit **Undo** in the top toolbar to back out completely.
>
> [Got it]

### Recurring panel — auto + inferred merged

The three flow-grouped panels (`Recurring · Income / Expenses / Savings`) from sub-project B keep their structure. `RecurringPanels` now computes two sources:

1. `findRecurringCharges(bills, today, categoriesById)` — inferred patterns (existing, unchanged).
2. `findAutoRecurringChains(bills, categoriesById)` — new pure function in `spendingMath.js`.

### `findAutoRecurringChains` shape

Groups bills by `recurringChainId` where at least one instance has `recurring === true`. Returns one entry per active chain:

```js
{
  kind: 'auto',
  chainId: 'rec_xyz',
  vendor: latestActiveBill.vendor,
  description: latestActiveBill.vendor,             // bill-level entries are vendor-anchored
  categoryId: <majority category among items in latest active bill>,
  flow: <derived from the majority category>,
  lastAmount: <bill's flow-aligned net via getBillNet>,
  avgAmount: <average across all instances in the chain, same flow-aligned formula>,
  monthCount: <unique months in chain>,
  occurrences: <total instance count>,
  firstDate: <chain's earliest month + "-01">,
  lastDate: <latest active month + "-01">,
  active: true,                                      // dormant chains aren't returned
}
```

Inferred entries from `findRecurringCharges` gain `kind: 'inferred'` for shape parity at the consumer.

### Merge & filter rules (in `RecurringPanels`)

- Compute auto entries.
- Compute inferred entries.
- Exclude inferred entries already covered by tracked keywords (existing behavior).
- **New:** exclude inferred entries whose `vendor` (case-insensitive) matches any auto entry's `vendor` — prevents the same pattern surfacing as both auto and inferred.
- Concatenate auto entries first, then inferred entries, within each flow.
- Pass the merged list to `RecurringSection`.

### `RecurringSection` row rendering

- **Auto entries:** the existing `ACTIVE` badge is replaced by `✓ AUTO` (amber tint, matching the BillCard header badge). A trailing **End** button right-aligned. Click → finds the latest `recurring === true` bill in the chain, sets `recurring: false`, push history. Chain disappears from the panel on next render.
- **Inferred entries:** unchanged visuals, plus a trailing **↻ Make recurring** button. Click → opens a `ConfirmDialog`:

  > **Make "Netflix" auto-managed?**
  >
  > BillTracker will create a new monthly recurring bill for **Netflix** starting in **May 2026** ($15.99). The historical occurrences in your CC statements stay where they are; future months will get a dedicated auto-managed bill.
  >
  > [Cancel] [Make Recurring]

  On confirm: creates a new bill in `todayMonth` — vendor = `entry.vendor`, one item (description = `entry.description`, amount = `entry.lastAmount`, category = `entry.categoryId`, date = `shiftItemDate(entry.lastDate, todayMonth)`), `recurring: true`, `recurringChainId: nanoid(8)`. Push history. Switch `selectedMonth` to `todayMonth`. Set `newlyAddedBillId`.

  The new bill is a single-item bill independent of the original multi-item bills where the historical occurrences live. The vendor-match filter rule then suppresses the inferred entry on next render, so the panel transitions from one row labeled "Netflix [↻ Make recurring]" to one row labeled "Netflix ✓ AUTO [End]".

### Visibility & precedence

| Scenario | Panel shows |
|---|---|
| Bill marked recurring, only 1 instance | `✓ AUTO` entry. No inferred (single occurrence doesn't pass the 2-month detector threshold). |
| Bill marked recurring, 3 instances | `✓ AUTO` entry. Inferred suppressed by vendor-match. |
| Inferred pattern exists, not marked recurring | Inferred entry with `↻ Make recurring`. |
| Both an auto chain and an unrelated inferred pattern in the same flow | Both appear, auto first, inferred second. |
| Auto chain ended (toggled off) | No auto entry (dormant). Historical instances may re-surface as inferred — acceptable. |

### Files touched (summary)

| File | Changes |
|---|---|
| `App.jsx` | New states: `pendingDuplicateBillId`, `pendingConflictQueue`, `pendingRecurringTip`, `pendingPromoteEntry`. New handlers: `duplicateBill`, `markRecurring`, `endRecurringChain`, `promoteToAuto`, conflict-resolution handlers. BillCard header badge. BillCard footer Duplicate + Recurring buttons. |
| `BillItem.jsx` | New `⧉` icon button + `onDuplicate` prop. |
| `spendingMath.js` | New: `shiftItemDate`, `computeCatchUp`, `findAutoRecurringChains`. `findRecurringCharges` unchanged. |
| `App.css` | `.bill-badge-recurring`, `.btn-recurring`, `.btn-recurring-on`, `.sub-badge-auto`, `.btn-end-recurring`, `.btn-promote-recurring`, `.btn-duplicate-bill`, item-row duplicate-icon styles. |
| `initializeFromStorage.js` | Calls `computeCatchUp` after `migrateToV3`; threads its `{ bills, conflicts }` back through the return shape alongside `migrationError`. |
| `DuplicateBillDialog.jsx` | New file — month-picker modal. |
| `RecurringConflictDialog.jsx` | New file — Link/Duplicate/Skip modal. |
| `RecurringTipDialog.jsx` | New file — first-run tip modal. |

## Testing Strategy

Co-located vitest tests, matching the existing pattern.

### Unit tests (extending `spendingMath.test.js`)

**`shiftItemDate`**
- `"2026-05-15"` → `"2026-06"` → `"2026-06-15"`.
- `"2026-01-31"` → `"2026-02"` → `"2026-02-28"`. Also test leap year (`"2024-01-31"` → `"2024-02"` → `"2024-02-29"`).
- `"2026-08-31"` → `"2026-09"` → `"2026-09-30"`.
- `null` / `undefined` / invalid string → `null`.
- Same-month target (`shiftItemDate("2026-05-15", "2026-05")`) → `"2026-05-15"`.

**`computeCatchUp`**
- No recurring chains → input unchanged, empty `conflicts`.
- One chain, source April, today July, no conflicts → three spawns (May/Jun/Jul) with chain id, `recurring: true`, fresh bill ids, fresh item ids, shifted dates.
- Already-materialized month → not duplicated.
- Same-vendor non-chain bill in May → conflict queued, no spawn for May or later months in that chain.
- Two chains, one clean / one conflicted → clean fully materialized; conflicted queued.
- Source month equals today → no spawns.
- Latest source has `recurring: false` (chain dormant) → ignored.
- Chain with multiple `recurring: true` instances → latest is used as source.
- Idempotency: running twice with identical inputs is a no-op the second time.
- Backward clock (today < source.month) → no spawns.
- Empty-vendor source matches empty-vendor existing bill in target month → conflict (documented).

**`findAutoRecurringChains`**
- No `recurringChainId` anywhere → empty array.
- Single 3-month chain → one entry with `monthCount: 3`, `firstDate`/`lastDate` correct.
- Chain whose latest instance has `recurring: false` → not returned (dormant).
- `flow` derives from majority category among items of the latest active instance.
- `lastAmount` is the flow-aligned bill net via `getBillNet`.

**`findRecurringCharges` regression**
- Recurring-marked bills' items still pass through unchanged; panel-level filtering owns suppression.

### Component tests

**`BillItem.test.jsx`**
- `⧉` button click invokes `onDuplicate(item)` exactly once with the source item.
- Aria-label `Duplicate item` present.

**BillCard recurring behavior** (within `App.test.jsx` or extracted if needed)
- Header `RECURRING` badge renders iff `bill.recurring === true`.
- "Make Recurring" on a non-recurring bill: sets `recurring: true`, sets `recurringChainId` (asserted non-empty), pushes history. First time: tip dialog shows.
- "Recurring · on" click: sets `recurring: false`, leaves `recurringChainId` intact.
- Second "Make Recurring" click (after tip seen) does NOT re-show the dialog.

**`DuplicateBillDialog.test.jsx`**
- Renders with month pre-filled to `shiftMonth(bill.month, +1)`.
- Confirm with default → `onConfirm` called with that month value.
- Cleared month input → Duplicate button disabled.
- Cancel calls `onCancel` and not `onConfirm`.

**Catch-up conflict dialog** (within `App.test.jsx`)
- Seed bills: chain whose latest is April (Honda), plus a non-chain May Honda bill. Mount → conflict dialog visible.
- **Link** → May Honda gains chain id + `recurring: true`; dialog closes; catch-up resumes onward.
- **Duplicate** → a new May bill with the chain id is appended; the existing May Honda is untouched.
- **Skip** → no bill changes for May; catch-up resumes June.

**Inferred → auto promote**
- Seed three months of "NETFLIX" occurrences inside CC bills. Mount Recurring panel. Click `↻ Make recurring` → confirm dialog appears with correct vendor + amount.
- Confirm → new single-item bill in `todayMonth` with `recurring: true`, fresh chain id. Inferred entry gone (vendor-match suppression); `✓ AUTO` entry present.
- Cancel → no change.

**End recurring**
- Seed an auto chain with 3 instances. Click `End` on the panel row → latest instance's `recurring` is `false`; chain id stays. Panel re-renders without the auto entry.

### Migration safety (extending `initializeFromStorage.test.js`)

- Seed v3-shape bills (no `recurring` fields). Initialize → migration chain runs as before; `computeCatchUp` returns input unchanged. Schema version stays at 3.
- Seed v3-shape bills + a chain. Initialize → spawns appear; conflicts surface in the return shape.
- Bills carrying `recurring: true` and `recurringChainId` survive localStorage round-trip.

### Integration smoke (extending `__smoke__/setup.test.jsx`)

- Seed: one recurring Honda Finance bill in April + unrelated June Comed bill. Set today to `"2026-07"`. Mount:
  - Bills list contains April, May, June, July Honda bills.
  - May/Jun/Jul carry `recurring: true` + the same chain id as April.
  - June Comed untouched.
  - `Recurring · Expenses` panel shows one `✓ AUTO` row for Honda Finance.

- Seed: chain conflict (April recurring Honda + manual May Honda). Today = `"2026-05"`. Mount → conflict dialog. Click **Link** → May gains chain id; dialog dismisses; no toast (net spawn = 0).

### Deliberately not tested

- Visual regression of new badges/buttons. Manual browser smoke before merge.
- Cross-tab localStorage sync. Single-tab app.
- Performance with hundreds of chains. `computeCatchUp` is O(bills × chains); profile if it ever matters.

## Implementation Order

Each numbered step is intended as a clean commit (or small commit group), similar to A/B cadence.

1. `shiftItemDate` + tests.
2. `computeCatchUp` + tests. Wire into `initializeFromStorage` but leave conflicts unhandled at the UI layer (queue surfaces in return shape only).
3. `findAutoRecurringChains` + tests.
4. BillCard header `RECURRING` badge.
5. BillCard footer `↻ Make Recurring / Recurring · on` toggle + first-time tip dialog.
6. BillItem `⧉` duplicate.
7. `DuplicateBillDialog` + bill-level duplicate handler.
8. Recurring panel merge (auto + inferred), `✓ AUTO` badge, End button.
9. Inferred → auto promote confirm dialog + handler.
10. `RecurringConflictDialog` — Link/Duplicate/Skip. Until this lands, conflicts queue but the dialog renders a "Decide later" placeholder so the app remains usable.
11. Integration smoke + manual browser smoke.

## Out-of-Scope but Worth Naming for D

- **JSON export round-trip.** Bills carry `recurring` and `recurringChainId` natively; D's export overhaul should preserve them. Importing a C-aware export into a pre-C version of BillTracker silently drops both fields (forward-compat is fine).
- **Reporting on recurring vs. one-off.** Sub-project D could split the Spent bucket into "recurring" vs. "one-off" using chain-id presence. Out of scope for C.
- **Per-chain change history.** "When did Honda Finance go from $452 to $470?" Data lives in the bill list; D's reporting can derive it.
- **Recurring cadences other than monthly.** Bi-weekly paychecks already work for the inference detector; promoting them to auto-managed would require a non-monthly tick. Defer until needed.

## Open Questions (none blocking)

- Whether the conflict dialog's **Skip** action should remember its choice so the same conflict doesn't re-prompt on every app load. Current design re-prompts (simpler, no extra state). Revisit if it gets annoying during dogfooding.
- Whether the promote-inferred flow should also Link the most-recent inferred occurrence's bill to the new chain id, instead of creating a fresh single-item bill in the current month. Current design favors a clean single-item bill to avoid contaminating multi-item host bills (CC statements). Revisit if the historical-vs-active separation feels confusing in use.
