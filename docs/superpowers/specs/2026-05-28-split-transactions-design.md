# Split transactions — design

**Date:** 2026-05-28
**Status:** Approved (design); pending spec review

## Summary

A single transaction can carry an array of **split lines**, each with its own
category (or transfer to another account), its own signed amount, and its own
free-text description. The register shows the parent as a collapsible row that
expands into one sub-row per split line. The editor adds an "Edit splits…"
sub-dialog that lets the user add/edit/delete lines. Reports attribute
spending per-line, so a single $500 Costco purchase can contribute to both
*Groceries* and *Home Improvement*. Transfer split lines create a paired
counterpart transaction on the target account, matching today's transfer
model. Existing single-category transactions remain unchanged.

## Decisions (from brainstorming)

1. **Scope:** split lines may be either a category *or* a transfer to another
   account (the most flexible flavor of the three offered).
2. **Register display:** **collapsible parent + indented sub-rows** for the
   lines. Default state is collapsed.
3. **Editor pattern:** **focused sub-dialog** opened from a "Edit splits…"
   (or "Split…") button on `TransactionEditor`. The parent dialog stays small
   when the user isn't actively editing lines.
4. **Per-line description:** **required field** (free text). The driving use
   case is reconciliation notes — e.g., a Costco trip that included solar
   panels next to groceries needs the per-line note to be useful later.
5. **Transfer counterpart shape:** **single paired leg**. A transfer split
   line creates one ordinary transfer-leg transaction on the target account,
   sharing a `transferId` — exactly today's pair model.
6. **Splitting an existing transfer:** **yes — on the source leg only**. The
   bank-side leg of a transfer (e.g., $325.40 Camry Loan payment from Chase)
   can be split into principal + interest + fees while the loan-side leg
   stays single.
7. **OCR / phone capture:** **stays single-line for v1**. The phone-capture
   path continues to drop a single-category transaction; the user opens it on
   the desktop and splits it manually.
8. **Recurring / duplicate detection:** **treats the parent as a single
   charge**. Per-line explosion would create phantom recurrences. The
   existing `recurringCharges` and `findDuplicates` keep grouping on parent
   payee + amount.
9. **Data model:** **Approach 1** — splits stored as an array on the parent
   transaction. **Plus** a `flattenForReports` helper from Approach 3, used
   only by the four report functions that care about per-line categorization.

## Data model

A transaction gains one optional field, `splits`. Everything else is
unchanged.

```js
// existing fields unchanged: id, accountId, date, amount, categoryId,
//   description, payee, checkNumber, transferId
// NEW (optional, absent on the 95% case):
splits: [
  { id, amount, description, categoryId?, transferId? },
  ...
]
```

### Rules

1. `splits` is either absent / `null` (today's single-category transaction) or
   an array of **≥ 2** lines.
2. Each line carries `id` (nanoid(8)), signed `amount` (finite number),
   `description` (string, may be empty), and **exactly one** of `categoryId`
   or `transferId`. Never both, never neither.
3. **Invariant γ:**
   `sum(splits where line.categoryId).amount === transaction.amount` to the
   cent. Transfer split lines do **not** contribute to the parent's amount —
   they create the counterpart on the other account and otherwise float on
   top. This keeps `accountBalance()` and `computeRegister()` working
   unchanged: the parent's `amount` is still exactly what hit the account.
4. When `splits` is set, the top-level `categoryId` is **ignored for
   reports**. It stays writable for backward compat and as a search fallback
   but is not authoritative.
5. A transfer split line's `transferId` is a normal transfer pair identifier.
   The counterpart is a **single ordinary transaction** on the target
   account, with `amount = -1 * splitLine.amount`, `transferId` shared,
   `date` and `payee` inherited from the parent, and a `categoryId`
   suggested by the existing `suggestTransferCategoryId()` helper. **The
   counterpart is never itself split.**
6. A transaction with a top-level `transferId` (today's transfer leg) MAY
   also have `splits` — but only on the **source leg** (the negative side).
   The destination leg stays single.

### Worked example — Camry purchase

```js
// On Chase Checking — net bank impact is -$10,000:
{ id: 't_cam', accountId: 'a_chase', date: '2026-05-28',
  amount: -10000, payee: 'Toyota of Plano',
  description: '2026 Camry XLE — purchase',
  splits: [
    { id: 's1', amount: -9500,  categoryId: 'c_auto',   description: 'Vehicle base price' },
    { id: 's2', amount:  -899,  categoryId: 'c_fees',   description: 'Doc / dealer fees' },
    { id: 's3', amount:  -851,  categoryId: 'c_tax',    description: 'TX 6.25% sales tax' },
    { id: 's4', amount: +1250,  categoryId: 'c_credit', description: 'IRS §30D EV credit' },
    { id: 's5', amount: -15000, transferId: 'tr_loan',  description: 'Wells Fargo loan funded $15k' },
  ],
}
// Category lines: -9500 -899 -851 +1250 = -10,000 ✓ matches parent.amount
// Transfer line: -15,000 — creates a counterpart on Camry Loan with amount +15,000? No — see counterpart below.

// On Camry Loan — single ordinary leg, sharing tr_loan:
{ id: 't_cam_loan', accountId: 'a_camry_loan', date: '2026-05-28',
  amount: -15000,   // debt increased (negative on a liability)
  transferId: 'tr_loan',
  description: 'Wells Fargo loan funded $15k',
  categoryId: 'c_loan_payment',   // from suggestTransferCategoryId
  payee: null,
}
```

The counterpart amount is the **negation** of the source split line's amount,
matching today's transfer convention (source leg negative → destination leg
positive, or vice versa). For the loan-funding example, the source side
records `-15000` and the destination side records `-15000` because both sides
represent value flowing in the same conceptual direction (toward the dealer
and into the loan principal). In practice the helper used by `useLedger` is:
**`counterpart.amount = -sourceLine.amount`** unless the destination is a
liability where convention inverts — implemented exactly the same way the
existing `addTransfer` / `updateTransfer` paths already handle the pair sign.
The split implementation does not introduce a new sign rule; it reuses
whatever the existing transfer pair flow does today.

## Validation — `validateSplits(transaction)`

A new pure helper in `accountsModel.js`. Called by `useLedger.addTransaction`
and `useLedger.updateTransaction` before persisting. Throws a descriptive
`Error` if any rule is violated. The editor surfaces the error message as a
non-blocking warning until corrected.

Invariants checked:

1. If `splits` is set, it is an array of length ≥ 2.
2. Every line has `id` (string), `amount` (finite number), `description`
   (string), and exactly one of `categoryId` (string) or `transferId`
   (string).
3. `Math.round(sum(splits where categoryId).amount * 100) ===
   Math.round(transaction.amount * 100)`. (Cent-precision reconciliation, same
   approach as `transferDraftForAccount` uses for the "Owed" prefill.)
4. Every transfer line's `transferId` is unique within the array.
5. Line ids are unique within the array.

## Editor — `TransactionEditor.jsx`

- Add a small **"Split…"** button next to (or below) the Category dropdown.
- When the transaction has no splits: button label is "Split…". Clicking it
  opens `<SplitsEditor>` pre-seeded with **two** lines — the first carrying
  the current `categoryId` and `amount`, the second empty with the
  complementary amount left for the user to fill.
- When the transaction has splits: the Category dropdown row is replaced by a
  read-only summary chip — `▼ N split lines · M categories + K transfer(s)`
  — and the Amount input becomes read-only (derived from the category-line
  sum). A trailing **"Edit splits…"** link reopens `<SplitsEditor>` with the
  existing lines.
- Saving the parent persists the parent transaction with its (possibly
  edited) `splits` array. Counterpart synchronization happens inside
  `useLedger` (see below); the editor itself does not know about counterparts.

## Editor — `SplitsEditor.jsx` (new component)

A modal-over-modal, same pattern as `ColorPicker` over `CategoryEditor`.

- **Header:** `Edit splits — {payee || description} · {date}`.
- **Lines table** — one row per split. Per row:
  - **Type toggle:** `Category | Transfer` segmented control (reuses the
    `dir-toggle` button styling for visual consistency).
  - **Picker:** when Category — a `<select>` over `categories` matching the
    parent's flow direction (income/expense/savings); when Transfer — a
    grouped account `<select>` (via `groupAccounts()`) excluding the current
    account.
  - **Description input** — free text, optional but encouraged. Per-line
    annotation Dad uses for reconciliation.
  - **Amount input** — signed; reuses the parent's `+/−` direction toggle.
  - **× delete-line** button.
- **`+ Add line`** button below the table.
- **Footer math** (live, re-rendered on every change):
  - `Sum of category lines: $X.XX` rendered green when it matches
    `parent.amount` to the cent, red otherwise with a delta hint.
  - `Transfer lines: N total — to <accounts>` (informational).
  - `Bank impact: $parent.amount` (fixed reference).
- **Actions:**
  - **Cancel** discards changes and closes.
  - **Done** runs `validateSplits` on the pending parent + lines. On success,
    returns the array to `TransactionEditor` (which still requires a Save to
    persist). On failure, surfaces the error inline; does not close.
- **Convert back to single-category:** if the user deletes lines down to 1,
  clicking **Done** prompts: *"This will turn the split back into a
  single-category transaction. Continue?"* On confirm: parent's `categoryId`
  is set to the surviving line's `categoryId` (or null if it was a transfer
  line — guard that case by requiring at least one category line during
  convert-back, otherwise force the user to keep ≥ 2 lines or cancel).

## Register row — `TransactionRow.jsx`

A split parent renders **two visual elements** in the register:

1. **Parent `<tr className="txn-row txn-row-split">`** — same column count as
   today's row for the active layout. Differences from a single-category row:
   - The Category cell shows `▶ N split lines` (collapsed) or `▼ N split
     lines` (expanded). Clicking the chevron toggles **per-row local React
     state** — not persisted.
   - Amount cell still shows `parent.amount`. Balance cell unchanged.
   - Clicking anywhere on the row other than the chevron still opens the
     editor (today's behavior preserved).
2. **Per-line `<tr className="txn-split-line">`** rows, inserted directly
   after the parent when expanded. One per element of `splits[]`. Each line
   row spans the table width with:
   - A left-padded indent marker for visual grouping.
   - The line's category chip (or transfer chip with the `⇄ → <account>` and
     existing navigation arrow) where the parent's category lived.
   - The line's `description` in the description/notes column.
   - The line's `amount`, signed, in the matching out/in column.
   - **Empty balance column** — the running balance only ticks at the parent.

Both layouts (`bank` and `compact`) get the same treatment with the line-row
template mirroring their column count so the table grid stays aligned.

### Expansion state hint

A new optional prop `expandSplitHint` on `TransactionRow` carries a split
line id. When set, the row auto-expands on first render and the matching line
is highlighted. Used by the search flow (see below) to land the user on the
right line.

## Search & filter — `filterTransactions` in `accountsModel.js`

Extend the match predicate to include split lines:

- `t.description`, `t.payee`, `t.category.name`, `t.amount` — today's matches.
- **NEW**: any `splits[].description` or the name of any `splits[].categoryId`
  category.
- When a hit comes from a split line, the consumer (Register) is given the
  matching line id so it can pass `expandSplitHint` to that row.

## Reports — `flattenForReports` in `reportsModel.js`

New generator helper:

```js
export function* flattenForReports(transactions) {
  for (const t of transactions || []) {
    if (!Array.isArray(t.splits) || t.splits.length === 0) {
      yield t;
      continue;
    }
    for (const s of t.splits) {
      if (s.transferId) continue;          // transfer splits net out
      yield {
        id: `${t.id}#${s.id}`,
        accountId: t.accountId,
        date: t.date,
        payee: t.payee,
        description: s.description || t.description,
        categoryId: s.categoryId,
        amount: s.amount,
        transferId: null,
        _parentId: t.id,
        _splitId: s.id,
      };
    }
  }
}
```

Consumed by **four** existing report functions, replacing their inner
iteration over raw `transactions`:

1. **`incomeExpenseSummary`** — Income / Spending / Savings totals.
2. **`spendingByCategory`** — Per-category expense totals.
3. **`cashFlowByMonth`** — Per-month income/spending/net.
4. (no others) — `recurringCharges` and `findDuplicates` keep using raw
   transactions, in line with decision 8.

`filterRows` is **not** changed. It gates by parent-level fields
(`accountId`, `date`); splits inherit those from the parent, so filtering by
parent is correct. The flatten step runs **after** `filterRows`.

Net-worth / account-balance functions (`accountBalance`,
`householdTotals`, `netWorthByMonth`) need **no change** — they sum
`t.amount` per account, which is the parent's bank-reality amount.

## `useLedger.js` — counterpart synchronization

The public API stays the same: `addTransaction`, `updateTransaction`,
`deleteTransaction`. With splits, the implementation cascades transfer
counterparts.

### `addTransaction`

1. Call `validateSplits(t)`. Throw on failure.
2. For each `splits` line with a `transferId`:
   - Generate the counterpart (`accountId` = target, `amount` =
     negation as today's pair, `transferId` = same, `date` = parent's,
     `payee` = parent's, `description` = line description, `categoryId` =
     `suggestTransferCategoryId(targetAccount, transferCategories)` with
     today's fallback).
   - Add the counterpart transaction to the ledger.
3. Persist the parent transaction (including its `splits`).

### `updateTransaction`

1. `validateSplits(next)`. Throw on failure.
2. Diff `next.splits` against the previous transaction's `splits` (by line
   id):
   - **Removed line with `transferId`** → delete the counterpart.
   - **Added line with `transferId`** → create the counterpart (as in add).
   - **Changed line**:
     - Type flipped category↔transfer → delete old counterpart (if any),
       create new (if newly transfer).
     - Target account changed → counterpart's `accountId` is updated in
       place; `categoryId` re-suggested from the new target.
     - Description changed → counterpart's `description` updated.
     - Amount changed → counterpart's `amount` updated (negated).
3. Persist the updated parent.

### `deleteTransaction`

1. If the transaction has `splits`, walk them and delete each
   transferable line's counterpart.
2. Delete the parent.

### Editing the counterpart directly from the other account

Clicking the counterpart leg on the destination-account register opens the
**parent** split transaction on the source account (with a back-navigation
hint to return). Editing always happens on the parent. The existing
`onNavigate` arrow on transfer chips already supports the jump.

### Orphans

If a transfer split line's `transferId` resolves to no counterpart (account
deleted, partner removed by external edit): the line is rendered as if its
`transferId` were absent — a plain row with the line's `description` and a
"—" where the category chip would be. `transferInfo()` already returns
`null` for missing partners; the existing fallback path is reused.

## Export archive — `exportArchive.js`

Include `splits` in the per-transaction payload verbatim. Backward compat:

- Older readers see an unfamiliar `splits` field and ignore it.
- The new importer reconstructs counterparts by `transferId` alone (same as
  today's transfer-pair reconstruction). No new format flag needed.

## OCR / phone capture

Out of scope for v1. `billExtractor.js` and the phone-capture pipeline keep
producing single-category transactions. Dad's manual split flow on the
desktop covers the use case.

## CSS — `App.css`

- `.txn-row-split` — modest visual treatment for the parent row when split:
  a faint left border-accent so split rows scan as "linked to what's below".
- `.txn-split-line` — line-row styling: smaller font, indented first
  column, no balance column rendering, subtle alternating background to
  read as a sub-table.
- `.split-editor` — sub-dialog container styling (reuse `.dialog-overlay` /
  `.dialog-card` patterns from the existing dialogs; add a slightly higher
  z-index for the modal-over-modal stack).

## Testing plan (TDD, inline, red→green per unit)

Tests written *before* implementation, following the established inline-TDD
workflow.

### Pure-model tests

- **`accountsModel.test.js`** — `validateSplits` accepts a well-formed Camry
  split / rejects sum mismatch / rejects missing `categoryId`+`transferId` /
  rejects both set / rejects single-line split / rejects duplicate line ids /
  rejects duplicate `transferId`s within one parent.
- **`accountsModel.test.js`** — `filterTransactions` matches a search term
  against a split line's `description` and against the name of a
  category referenced by a split line. Hit returns the matching line id.
- **`reportsModel.test.js`** — `flattenForReports` yields split lines as
  virtual rows, drops transfer splits, passes through non-split rows.
- **`reportsModel.test.js`** — `spendingByCategory` correctly attributes a
  Costco solar-panel split across Groceries and Home Improvement totals.
- **`reportsModel.test.js`** — `incomeExpenseSummary` handles a refund line
  (positive split amid negatives).
- **`reportsModel.test.js`** — `cashFlowByMonth` attributes split lines to
  the parent's month.
- **`reportsModel.test.js`** — `findDuplicates` and `recurringCharges` do
  **not** flatten splits (parent-level grouping preserved).

### Hook tests

- **`useLedger.test.jsx`** — adding a transaction with a transfer split line
  creates the counterpart; the counterpart has correct `accountId`,
  `amount`, `transferId`, `categoryId`.
- **`useLedger.test.jsx`** — deleting a parent with transfer splits cascades
  the counterpart deletes.
- **`useLedger.test.jsx`** — editing a transfer split line's target account
  moves the counterpart (deletes old, creates new with re-suggested
  category).
- **`useLedger.test.jsx`** — converting a transfer line → category line
  deletes the counterpart.
- **`useLedger.test.jsx`** — converting a category line → transfer line
  creates the counterpart.
- **`useLedger.test.jsx`** — adding a transaction that fails
  `validateSplits` throws and persists nothing.

### Component tests

- **`SplitsEditor.test.jsx`** (new) — Done button is disabled while the
  category-line sum mismatches the parent's amount; type toggle swaps
  category picker for grouped account picker; transfer line captures the
  per-line description; deleting back to 1 line prompts to convert; convert
  applies the surviving category to the parent.
- **`TransactionEditor.test.jsx`** — Split… button appears for non-split
  transactions; opens SplitsEditor; closing with new splits replaces the
  category dropdown with the summary chip and locks the amount input;
  Edit splits… reopens with existing lines.
- **`TransactionRow.test.jsx`** — split parent renders chevron + line count;
  clicking the chevron expands into N line rows; clicking elsewhere on the
  parent opens the editor; transfer-line chip renders with the existing
  navigation arrow; line rows render in both `bank` and `compact` layouts.
- **`Register.test.jsx`** — search matching a split line's description shows
  the parent with the matching line auto-expanded.

### Smoke test (in `src/__smoke__`)

End-to-end Camry purchase: enter parent in `TransactionEditor`, open
`SplitsEditor`, add 4 category lines + 1 transfer line, save. Then verify:

- Chase Checking register shows the expandable parent with chevron and the
  correct 4 category sub-rows on expand, plus the transfer chip with
  `⇄ → Camry Loan` navigation.
- Camry Loan register shows a single counterpart leg of `-$15,000` with
  `⇄ ← Chase Checking` and the per-line description preserved.
- `incomeExpenseSummary`, `spendingByCategory`, and `cashFlowByMonth`
  attribute the four category lines correctly.

## Integration points (file map)

- `src/accountsModel.js` — add `validateSplits`; extend `filterTransactions`
  to match split-line descriptions and categories (~line 107).
- `src/reportsModel.js` — add `flattenForReports`; switch
  `incomeExpenseSummary`, `spendingByCategory`, `cashFlowByMonth` to consume
  it (~lines 87–144). `findDuplicates` and `recurringCharges` unchanged.
- `src/useLedger.js` — extend `addTransaction`, `updateTransaction`,
  `deleteTransaction` with counterpart synchronization for transfer split
  lines; call `validateSplits` on add/update.
- `src/TransactionEditor.jsx` — Split… button, summary chip rendering,
  read-only amount when split, wire to SplitsEditor.
- `src/SplitsEditor.jsx` — new component.
- `src/SplitsEditor.test.jsx` — new test file.
- `src/TransactionRow.jsx` — chevron + split-line sub-rows in both layouts
  (~lines 39–67).
- `src/Register.jsx` — pass `expandSplitHint` from search results.
- `src/exportArchive.js` — passthrough `splits` field.
- `src/App.css` — `.txn-row-split`, `.txn-split-line`, `.split-editor`.
- `src/categoriesDefaults.js` — no change.
- `src/accountsMigration.js` — no change (purely additive field).

## Out of scope (YAGNI)

- Auto-detecting splits from receipt OCR or bill capture.
- Per-line dates (lines share the parent's date).
- Splitting the destination leg of an existing transfer (only the source
  leg is splittable).
- Recurring/duplicate detection at the line level.
- Bulk-split / repeat-last-split helpers (revisit if Dad asks).
- Reports broken out by split-line vs single-row provenance.
