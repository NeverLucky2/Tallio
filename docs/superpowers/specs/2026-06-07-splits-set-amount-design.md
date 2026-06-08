# Splits set the transaction amount — design

Date: 2026-06-07
Status: Approved (pending spec review)
Supersedes: the balance-gate decision in `2026-05-29-splits-balancing-ux-design.md`
(the "keep the net bank amount as the fixed anchor" choice). The remainder
helper added there is removed; see "Relationship to the balancing-UX spec".

## Goal

Make the split lines **define** the transaction amount instead of being forced
to balance to a pre-entered amount. Adding split lines should never be blocked
or require a filler "Other" remainder line.

This is the first of three branches addressing a batch of reported issues; it is
self-contained and ships on its own.

## Problem

The split editor blocks **Done** whenever the lines don't sum to the original
amount, and pushes the user toward adding an "Other" remainder line to force a
balance (`SplitsEditor.jsx` `tryDone` → `pendingRemainder` confirm). The real
audience (the user's father) hit this when splitting a single offering across
several churches/organizations: every time he added another organization the
editor went unbalanced and demanded a remainder line. He wants the **total of
the lines to become the transaction's amount**, full stop.

The data model already supports this for plain transactions: `TransactionEditor`
computes `amount = sum(splits)` whenever splits are present
(`TransactionEditor.jsx:32-36, 59`) and saves that. The friction is purely the
balance gate inside `SplitsEditor`. Transfers are the one place the amount is
*not* yet derived — `TransferEditor` saves the typed magnitude and `useLedger`
builds both legs from it.

## Decision

- **One uniform behavior** across regular transactions *and* transfers: the sum
  of the split lines is the amount. No `amountMode` / no special-casing.
- **Transfers stay internally consistent.** A transfer is a pair of legs sharing
  a `transferId`; when the source leg has splits, **both** legs derive from the
  splits sum (`from = sum`, `to = -sum`), so the two accounts still mirror each
  other exactly and no money is created or destroyed. The moved amount is simply
  computed from the splits rather than typed.
- **Calm feedback, never blocking.** The old red/amber balance banner becomes a
  plain **Total** readout showing the amount the transaction will take, with a
  muted note when that differs from the amount originally typed.

### Why transfers are safe (the workflow that motivated it)

The father keeps a closely-watched tracking account named **Offering**. A
donation is recorded as an outgoing **split** transaction *from* Offering (the
churches as lines; total = the donation), plus a **transfer** from a bank
account *into* Offering to show which account funded it. He wants that transfer
to move exactly the donation total. Because both transfer legs derive from the
same splits sum, the bank account and Offering stay reconciled automatically.

## Approach

Remove the balancing machinery from `SplitsEditor` so the sum is always
accepted; teach `TransferEditor` and `useLedger` to take the transfer magnitude
(and leg signs) from the source-leg splits sum when splits are present.
`validateSplits` / `accountsModel` are unchanged — at the save boundary the
amount equals the sum, so the existing invariant still holds and stays a useful
internal guard.

## Changes

### 1. `src/SplitsEditor.jsx`

- **Remove the balance gate.** Delete `pendingRemainder` state, `confirmRemainder`,
  `makeRemainderLine`, `addRemainderLine`, the `balanced`/`remainingCents`-driven
  amber warning, the **+ Add remainder as line** button, and the inline
  remainder confirmation panel. Drop the now-unused `OTHER_CATEGORY_NAME` import
  and `otherCategoryId`.
- **`tryDone`:** keep the `< 2 lines` collapse-to-single-category path. Otherwise
  call `validateSplits({ amount: sumOfLines, splits: lines })` inside the existing
  try/catch (this still enforces the non-sum invariants — ≥2 lines, finite
  amounts, exactly one of `categoryId`/`transferId`, unique ids — while the sum
  check passes by construction), then `onDone({ splits: lines, splitTargets: targets })`.
- **Status bar → Total readout.** Replace the `.split-remaining` block with a
  calm `.split-total` line: `Total: {formatted sum}`. When
  `round(sum*100) !== round(parentAmount*100)`, append a muted note
  `updates amount from {parentAmount}` (this only appears during the first split
  session, since reopening existing splits passes `parentAmount = sum`). The
  existing "+ Add line" button (blank `amount: 0` line) and **Unsplit** stay.
- The per-line direction toggle, Category/Transfer toggle, description, delete,
  and `splitTargets` handling are unchanged.

### 2. `src/TransferEditor.jsx`

- Compute `const splitSum = hasSplits ? splits.reduce((s, l) => s + l.amount, 0) : null;`
- Derive the magnitude: `const mag = hasSplits ? Math.abs(splitSum) : Math.abs(parseFloat(magnitude) || 0);`
  so `valid` (which requires `mag > 0`) works when the amount field is left
  empty and splits supply the total.
- The **Amount** input (`:100-102`) shows the derived sum and is **disabled**
  when `hasSplits`, mirroring `TransactionEditor.jsx:124`.
- `save()` passes the derived `amount: mag` (unchanged call shape otherwise).

### 3. `src/useLedger.js` — derive transfer leg amounts from the splits sum

In `addTransfer` and `updateTransfer`, when `sourceSplits` is present, set the
leg amounts from the splits sum instead of `-mag`/`+mag`:

- `fromLeg.amount = sum(sourceSplits)` and `toLeg.amount = -sum(sourceSplits)`.
- When there are no splits, keep `-mag`/`+mag` from the passed `amount`
  (unchanged).

This keeps the legs mirrored regardless of how individual lines were signed (so
even an unusual net-positive source leg can't desync the pair), and makes
`validateSplits(fromLeg)` pass for any consistent split set. `validateSplits`
itself is unchanged.

### 4. `src/App.css`

Replace the `.split-remaining` / `.ok` / `.mismatch` rules with a single calm
`.split-total` style (neutral color, the muted "updates amount" note smaller and
dimmer). Reuse existing dialog/button classes.

## Data flow

Open splits on a $0/blank or any-amount transaction → add a line per church →
the **Total** readout reflects the running sum, no warning, **Done** always
enabled → `onDone` returns the lines → `TransactionEditor`/`TransferEditor`
save `amount = sum`. For a transfer, `useLedger` writes `from = sum`,
`to = -sum`; the paired accounts stay reconciled. Reopening the split shows
`Total` with no "updates amount" note (the amount already equals the sum).

## Edge cases

- **Floating point:** all comparisons use cents (`Math.round(x*100)`), matching
  `validateSplits`.
- **Empty category line:** a line with neither `categoryId` nor `transferId`
  still fails `validateSplits` and shows the in-dialog error (unchanged).
- **Zero-sum split on a transfer:** `mag = 0` ⇒ `valid` is false ⇒ Save disabled
  (a zero-dollar transfer is degenerate); a regular transaction is unaffected.
- **Net-positive source leg on a transfer:** handled — legs derive from the
  actual sum, so they always mirror.
- **Single remaining line:** still collapses back to a plain category via the
  existing `< 2 lines` path.

## Relationship to the balancing-UX spec

`2026-05-29-splits-balancing-ux-design.md` deliberately kept the amount as a
fixed anchor with a "Remaining to allocate" helper, for the paycheck use case.
That helper is removed here. The paycheck flow still works: the user watches the
live **Total** as they enter gross/tax/Roth lines instead of a remaining figure.
The Taxes-category backfill from that spec is untouched.

## Testing (TDD, inline, with checkpoints)

`src/SplitsEditor.test.jsx`:
- Done with lines that don't sum to `parentAmount` calls `onDone` once with the
  lines and **no** confirmation panel (regression of the old remainder flow).
- The **Total** readout shows the formatted sum; the "updates amount" note
  appears only when the sum differs from `parentAmount`.
- No "+ Add remainder as line" button is rendered.
- A line missing a category surfaces the validation error and does not call
  `onDone`.
- One line collapses to a single category via `onDone({ splits: null, categoryId })`.

`src/TransferEditor.test.jsx`:
- With source-leg splits totaling T, Save calls `onSave` with `amount = |T|`,
  even when the Amount field was left blank; the Amount field is disabled.

`src/useLedger.test.jsx`:
- `addTransfer` with source splits writes `fromLeg.amount = sum` and
  `toLeg.amount = -sum`; `updateTransfer` likewise; no-split transfers keep
  `-mag`/`+mag`.

`src/__smoke__/splits.test.jsx`:
- Update any assertion that depended on the removed balance gate.

## Files touched

- `src/SplitsEditor.jsx`, `src/SplitsEditor.test.jsx`
- `src/TransferEditor.jsx`, `src/TransferEditor.test.jsx`
- `src/useLedger.js`, `src/useLedger.test.jsx`
- `src/App.css`
- `src/__smoke__/splits.test.jsx` (if affected)
- `TransactionEditor.jsx` is verified to need **no** change (already derives
  `amount = sum`).

## Future / out of scope

- **Auto-fund transfer (noted follow-up):** when an expense is saved in a
  tracking account like Offering, offer a one-click "Fund this from → [account]"
  that creates the paired transfer for the same total automatically — keeps the
  envelope + audit trail without re-typing or re-balancing. Candidate for a later
  branch, possibly alongside the liability-payoff feature.
- Per-church **sub-categories** in reports (Branch 3).
- No schema-version bump or migration; behavior change only.
