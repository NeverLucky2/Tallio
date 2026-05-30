# Splits balancing UX + Taxes backfill — design

Date: 2026-05-29
Status: Approved (pending spec review)
Builds on: `2026-05-28-split-transactions-design.md`

## Problem

The split editor is unusable for its main intended job (breaking down a
paycheck). Two concrete pain points reported by the user:

1. **No way to balance lines.** The editor requires the split lines to sum
   *exactly* to the transaction's bank amount, but offers no help getting
   there. The "Sum of lines: X · Bank impact: Y" line at
   `src/SplitsEditor.jsx:114-116` is an always-visible status banner that turns
   red (`mismatch`) the instant the lines don't balance. The moment the user
   adds a line or edits an amount, it goes red and **Done is blocked**
   (`tryDone` → `validateSplits` throws → error shown). The user reads this as
   a hard error and concludes "I can never add a split line."

2. **No tax category.** The user wants to model a paycheck (gross, overtime,
   taxes, Roth). A `Taxes` category already exists in code
   (`src/categoriesDefaults.js:43`, expense flow, 🏛️) but it lives in
   `DEFAULT_CATEGORIES`, which only seeds *fresh* installs. Existing users on
   schema v4 get no category backfill (`src/initializeFromStorage.js:22`
   returns early), so the category never reaches them.

The underlying data model is already correct: a paycheck is representable as
positive income lines + negative tax/Roth lines that sum to the **net deposit**
that actually posted to the bank (e.g. `+4000 +1000 −1500 −500 = +3000`). The
fix is **UX only** plus a category backfill. The
`sum(lines) === transaction.amount` invariant (`validateSplits`,
`src/accountsModel.js:299-328`) is preserved so reconciliation stays exact.

## Decisions (from brainstorming)

- **Balancing model:** keep the net bank amount as the fixed anchor; add a
  live "Remaining to allocate" helper. (Chosen over a derived/gross-driven
  amount, and over an auto-balancing remainder line.)
- **Done behavior:** Done is always clickable. Balanced → completes. Unbalanced
  → a confirmation warning that the remainder will be added as an "Other" line,
  with "Go back to edit" / "OK, add it".
- **Tax granularity:** a single `Taxes` category (not separate Fed/State/FICA),
  backfilled into existing data.

## Scope

### In scope

1. **Remainder status bar** in `src/SplitsEditor.jsx`.
2. **"Done with remainder" confirmation flow** in `src/SplitsEditor.jsx`.
3. **Taxes category backfill** in `src/categoriesDefaults.js` +
   `src/useCategories.js`.
4. CSS for the new bar / confirm prompt in the existing stylesheet.
5. Tests for all of the above (TDD).

### Out of scope (unchanged)

- The split table, the Category/Transfer per-line toggle, the existing
  "+ Add line" (blank, amount 0) button, Unsplit, line delete.
- `validateSplits` and the ledger save path (`useLedger`) — the invariant and
  all persistence stay as-is.
- The `openSplits` seeding of `[full, 0]` in `TransactionEditor.jsx` /
  `TransferEditor.jsx` — unchanged; the new bar handles rebalancing.
- No schema-version bump and no migration; backfill rides the existing
  load-time append-by-name mechanism.

## Design

### 1. Remainder status bar (`src/SplitsEditor.jsx`)

Replace the current sum line (lines 114-116) with a status bar driven by
cents-based math, consistent with `validateSplits`:

```
parentCents    = Math.round(parentAmount * 100)
sumCents       = sum over lines of Math.round((finite amount || 0) * 100)
remainingCents = parentCents - sumCents
```

- `remainingCents === 0` → **balanced** state: green pill "✓ Balanced". The
  raw "Lines: {sum} · Bank: {parentAmount}" figures are kept as small, muted
  secondary text (informational, not alarming).
- `remainingCents !== 0` → **unbalanced** state: amber pill
  "Remaining to allocate: {signed remaining}" plus a button
  **"+ Add remainder as line"**.

**"+ Add remainder as line"** appends one category line:
`{ id: nanoid(8), amount: remainingCents / 100, categoryId: otherCategoryId, description: '' }`.
By construction this makes `remainingCents === 0`. The user can then
recategorize / rename it. This is distinct from the existing "+ Add line"
button, which still adds a blank `amount: 0` line for manual splitting.

`otherCategoryId`: resolved inside `SplitsEditor` from the `categories` prop by
matching `name === OTHER_CATEGORY_NAME` (imported from `categoriesDefaults.js`),
falling back to `categories[0]?.id` if absent. The remainder sign lives on the
amount; the label stays "Other" regardless of sign (no "Other Income" split —
keeps behavior predictable).

### 2. "Done with remainder" confirmation (`src/SplitsEditor.jsx`)

New local state `const [pendingRemainder, setPendingRemainder] = useState(false)`.

Rework `tryDone`:

- If `remainingCents !== 0`: `setPendingRemainder(true)` and return (show the
  inline confirm; do not call `onDone`).
- If balanced: keep current behavior — `validateSplits({ amount: parentAmount,
  splits: lines })` in a try/catch, then `onDone({ splits: lines, splitTargets:
  targets })`.

Inline confirmation (rendered when `pendingRemainder` is true; an in-dialog
panel, not `window.confirm`, so the button labels and message are exact and
testable):

- Message: "The remaining {signed remaining} will be added as an \"Other\"
  line so the split balances the bank deposit. Continue?"
- **Go back to edit** → `setPendingRemainder(false)`; no state change.
- **OK, add it** → build
  `otherLine = { id: nanoid(8), amount: remainingCents / 100, categoryId:
  otherCategoryId, description: '' }`, then `onDone({ splits: [...lines,
  otherLine], splitTargets: targets })`. The resulting set is balanced and
  passes `validateSplits` (≥ 2 lines, each has exactly one of
  categoryId/transferId, finite amounts).

Done stays a normal enabled button.

### 3. Taxes category backfill (`src/categoriesDefaults.js` + `src/useCategories.js`)

`useCategories.load()` already calls `withTransferSeeds(parsed)` on every load
(`src/useCategories.js:19`) — an idempotent, append-missing-by-name backfill.
Extend the same idea to the `Taxes` builtin:

- In `categoriesDefaults.js`, factor the append-by-name logic out of
  `withTransferSeeds` into a shared internal helper
  `appendMissingByName(list, seeds)` (assigns a fresh `nanoid(8)` id to each
  appended seed; returns the same array reference when nothing is missing).
  Re-implement `withTransferSeeds` on top of it (behavior unchanged).
- Export a `BACKFILL_CATEGORIES` list containing the existing `Taxes`
  definition (name `Taxes`, icon 🏛️, color `#EAB308`, flow `expense`, its
  current keywords, `builtin: true`) and a `withBackfillCategories(categories)`
  that appends any missing-by-name.
- In `useCategories.load()` (and `seed()` only needs `withTransferSeeds` since
  `DEFAULT_CATEGORIES` already includes Taxes), compose:
  `withBackfillCategories(withTransferSeeds(parsed))`.

This is idempotent (skips Taxes if a category named "Taxes" already exists, so
fresh installs and users who already have it are unaffected) and needs no
schema bump. Consistent with the existing transfer-seed precedent: a user who
*deleted* Taxes would see it reappear on next load, which matches how transfer
seeds already behave.

### 4. CSS

Add styles in `src/App.css` (next to the existing `.split-sum` rules at
`App.css:3463-3465`) for the remainder bar (`.split-remaining` with `.ok` /
`.mismatch` modifiers, mirroring the current `.split-sum` colors — green
`#3ddba0` vs amber), the inline-button inside the bar, and the inline confirm
panel. Reuse existing dialog/button classes where possible.

## Edge cases

- **Floating point:** all balance math is cents-based (`Math.round(x*100)`),
  identical to `validateSplits`, so a visually-zero remainder is treated as
  balanced and the appended remainder line is exact to the cent.
- **Negative remainder:** handled — remainder line takes a negative amount;
  display shows the sign.
- **Missing "Other" category:** falls back to `categories[0]?.id` so the
  feature never crashes; in practice "Other" is always seeded.
- **Transfer lines present:** the remainder line is always a *category* line;
  it does not touch `splitTargets`.
- **≥ 2 lines invariant:** seeding starts at 2 lines and the remainder paths
  only add lines, so `validateSplits`' minimum is never violated.

## Test plan (TDD, inline, with checkpoints)

`src/SplitsEditor.test.jsx`:
- Remaining readout shows the correct signed value when lines don't sum to the
  bank amount; shows "Balanced" when they do.
- "+ Add remainder as line" appends a line whose amount equals the remainder
  and whose category is "Other", after which the bar reads balanced.
- Done while balanced calls `onDone` directly with the current lines (no
  confirm shown).
- Done while unbalanced shows the confirm panel and does **not** call `onDone`.
- Confirm "Go back to edit" hides the panel and leaves lines unchanged; no
  `onDone`.
- Confirm "OK, add it" calls `onDone` once with lines + an "Other" line that
  makes the set balanced.

`src/categoriesDefaults.test.js` / `src/useCategories.test.jsx`:
- `withBackfillCategories` appends `Taxes` when absent, with a string id.
- Idempotent: running twice does not duplicate `Taxes`; returns same reference
  when nothing missing.
- A list that already contains a "Taxes" category is returned unchanged
  (no duplicate).
- `useCategories` exposes a `Taxes` category for a stored list that lacks it.

## Files touched

- `src/SplitsEditor.jsx` — remainder bar, "+ Add remainder as line", Done
  confirm flow, resolve Other category.
- `src/SplitsEditor.test.jsx` — new tests.
- `src/categoriesDefaults.js` — `appendMissingByName`, `BACKFILL_CATEGORIES`,
  `withBackfillCategories`.
- `src/categoriesDefaults.test.js` — backfill tests.
- `src/useCategories.js` — compose backfill in `load()`.
- `src/useCategories.test.jsx` — Taxes-present-after-load test.
- `src/App.css` — `.split-remaining` + confirm panel styles.
