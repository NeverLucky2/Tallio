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
3. **Sum invariant:**
   `sum(splits[].amount) === transaction.amount` to the cent. The rule is the
   same for category and transfer lines — every line, regardless of type,
   contributes to the sum that has to match the parent. This keeps
   `accountBalance()` and `computeRegister()` working unchanged: the parent's
   `amount` is still exactly what hit the account, and the splits decompose
   that exact figure.

   *Implication for the user:* split-with-transfer only fits scenarios where
   money really did flow through the parent's account (cash back at the
   register, loan payment + late fee in one debit, a check that included a
   transfer to savings). It does **not** fit scenarios where a separate
   account funded part of a purchase without touching the parent — e.g., a
   $25k car purchase where the bank loan disbursed $15k directly to the
   dealer and Chase only saw a $10k debit. That scenario is recorded as
   **two separate transactions**: a $10k split on Chase (covering the cash
   portion's categories) and a $15k transaction on the Loan account (the
   debt taken on). Splits do not link them; they're conceptually one
   purchase but two ledger events.
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

### Worked example 1 — Camry down payment (category-only splits)

```js
// On Chase Checking — $10,000 down payment that hit the bank:
{ id: 't_cam_down', accountId: 'a_chase', date: '2026-05-28',
  amount: -10000, payee: 'Toyota of Plano',
  description: '2026 Camry XLE — down payment',
  splits: [
    { id: 's1', amount: -9000, categoryId: 'c_auto',   description: 'Down payment principal' },
    { id: 's2', amount:  -900, categoryId: 'c_fees',   description: 'Doc / dealer fees' },
    { id: 's3', amount: -1100, categoryId: 'c_tax',    description: 'TX 6.25% sales tax on cash portion' },
    { id: 's4', amount: +1000, categoryId: 'c_credit', description: 'IRS §30D EV credit applied to down payment' },
  ],
}
// Sum: -9000 -900 -1100 +1000 = -10,000 ✓
```

No transfer lines — every line is a category line. The loan portion of the
purchase ($15k disbursed directly by Wells Fargo to the dealer) is a
**separate** transaction on the Loan account, not linked to this one.

### Worked example 2 — Costco run with $50 cash back (transfer split)

```js
// On Chase Checking — $180 charge: $130 of goods + $50 cash withdrawn:
{ id: 't_costco', accountId: 'a_chase', date: '2026-05-20',
  amount: -180, payee: 'Costco',
  description: 'Weekly Costco shop',
  splits: [
    { id: 's1', amount: -100, categoryId: 'c_groceries', description: 'Weekly groceries' },
    { id: 's2', amount:  -30, categoryId: 'c_household', description: 'Paper goods, soap' },
    { id: 's3', amount:  -50, transferId: 'tr_cash',     description: 'ATM cash back at register' },
  ],
}
// Sum: -100 -30 -50 = -180 ✓

// Counterpart on Cash account — single ordinary leg, sharing tr_cash:
{ id: 't_costco_cash', accountId: 'a_cash', date: '2026-05-20',
  amount: +50,                       // Cash account received $50
  transferId: 'tr_cash',
  description: 'ATM cash back at register',
  categoryId: 'c_cash_withdrawal',   // from suggestTransferCategoryId
  payee: null,
}
```

### Worked example 3 — Big Costco trip with solar panels (Dad's reconciliation use case)

```js
// On Chase Checking — $4,300 charge: groceries + household + solar kit:
{ id: 't_costco_big', accountId: 'a_chase', date: '2026-05-20',
  amount: -4300, payee: 'Costco',
  description: 'Costco — big shop',
  splits: [
    { id: 's1', amount:  -180, categoryId: 'c_groceries',    description: 'Weekly groceries' },
    { id: 's2', amount:   -40, categoryId: 'c_household',    description: 'Paper goods, dish soap' },
    { id: 's3', amount: -4080, categoryId: 'c_home_improve', description: '5kW solar panel starter kit' },
  ],
}
// Sum: -180 -40 -4080 = -4300 ✓
```

Without the per-line `description` field, "Costco $4,300" would be opaque in
next year's reconciliation. With it, each line tells its own story.

### Counterpart sign convention (transfer splits)

`counterpart.amount = -1 * sourceSplit.amount` — same opposite-sign pair
convention `useLedger.addTransfer` / `updateTransfer` already enforce for
today's transfers. The split implementation does not introduce a new sign
rule.

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
3. `Math.round(sum(splits[].amount) * 100) ===
   Math.round(transaction.amount * 100)`. (Cent-precision reconciliation,
   same approach as `transferDraftForAccount` uses for the "Owed" prefill.)
   Applies uniformly to category and transfer lines.
4. Every transfer line's `transferId` is unique within the array.
5. Line ids are unique within the array.

## Editor routing — which editor opens when a row is clicked?

`App.jsx` today routes clicks via `resolveTransfer(t, transactions)`:

- If the row is part of a transfer pair → `TransferEditor`.
- Otherwise → `TransactionEditor`.

With splits, the same routing applies to parents — the **presence of `splits`
does not change which editor opens**:

- **Regular split parent** (no top-level `transferId`) → `TransactionEditor`,
  which exposes the "Split…" / "Edit splits…" button into `SplitsEditor`.
- **Transfer source leg that is itself split** (top-level `transferId` set,
  splits set) → `TransferEditor`, which **also** gains a "Split source leg…"
  / "Edit splits…" button. The button opens `SplitsEditor` configured with
  the source leg's amount as the parent.amount to balance against, and the
  destination leg's existence is preserved unchanged.

This keeps the user's mental model intact: a transfer always opens
TransferEditor; a regular transaction always opens TransactionEditor. Splits
are a feature of both.

`TransferEditor` gets exactly the same Split-button affordance as
`TransactionEditor` (placement may differ given the existing form layout —
the implementation plan will fix the spot). When the destination leg is
clicked on the other account, it still opens TransferEditor pointed at the
pair; the editor is allowed to show "this transfer's source leg is split"
as a read-only summary, but only the source-leg split table is editable.

## Editor — `TransactionEditor.jsx`

- Add a small **"Split…"** button next to (or below) the Category dropdown.
- When the transaction has no splits: button label is "Split…". Clicking it
  opens `<SplitsEditor>` pre-seeded with **two** lines — line 1 carries the
  current `categoryId` and the full parent `amount`; line 2 is empty
  (no category, amount `0`). The footer shows green initially (`-180 + 0 =
  -180` ✓). The user edits line 2 to a real amount and adjusts line 1 down
  to rebalance; the footer goes red while mid-edit and back to green when
  the sum matches. No auto-rebalancing — the user is in control of the
  numbers.
- When the transaction has splits: the Category dropdown row is replaced by a
  read-only summary chip — `▼ N split lines · M categories + K transfer(s)`
  — and the Amount input becomes read-only (derived from `sum(splits[])`). A
  trailing **"Edit splits…"** link reopens `<SplitsEditor>` with the
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
  - `Sum of lines: $X.XX` rendered green when it matches `parent.amount` to
    the cent, red otherwise with a delta hint (e.g., `+$25.00 over`,
    `−$12.40 under`).
  - `Bank impact: $parent.amount` shown as the fixed reference the user is
    balancing to.
- **Actions:**
  - **Cancel** discards changes and closes.
  - **Done** runs `validateSplits` on the pending parent + lines. On success,
    returns the array to `TransactionEditor` (which still requires a Save to
    persist). On failure, surfaces the error inline; does not close.
- **At-least-2-lines invariant:** the table never goes below 2 rows. The
  **× delete-line** button is disabled when there are only 2 lines (the
  second-to-last line refuses to delete; tooltip: *"A split needs at least 2
  lines. To remove the split, use Unsplit below."*).
- **Unsplit button** (footer, secondary): present whenever the editor is
  showing an existing split. Click prompts: *"Turn this back into a
  single-category transaction? The transaction will keep the category of the
  largest category line; transfer lines and their counterparts will be
  deleted."* On confirm, the parent's `categoryId` is set to the **category
  line with the largest absolute amount** (ties broken by line order), the
  `splits` array is cleared, the parent's `amount` is preserved as-is (it
  already matched the sum), and any transfer-line counterparts are deleted
  as part of the same save. **Edge case:** if the split contains no category
  lines (all-transfer), Unsplit is disabled with a tooltip directing the user
  to convert at least one transfer line to a category line first.

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

Extend the predicate to include split lines for **both** the search term and
the category filter dropdown:

- **Text search:** today matches `t.description`, `t.payee`, `t.category.name`,
  `t.amount`. **NEW**: also matches any `splits[].description` or the name of
  any `splits[].categoryId` category.
- **Category filter dropdown:** today matches `t.categoryId === filter`.
  **NEW**: also matches if any `splits[].categoryId === filter` (the parent
  row stays visible whenever any of its lines matches).
- When a hit comes from a split line, the consumer (Register) is given the
  matching line id so it can pass `expandSplitHint` to that row. The text
  search returns the first matching line id; the category filter returns
  the first split line whose categoryId matches.

## Sort — `sortRows` for split parents

`sortRows` today sorts by category alphabetically (when key === 'category')
using the row's `categoryId` → category name. A split parent has no
authoritative category. Convention:

- **Sort key for category column on a split parent** = the literal string
  `'​—SPLIT—'` (zero-width-space prefix so it sorts after any real
  category alphabetically). This keeps splits visually grouped at one end of
  the sort, and lets the user spot them at a glance.
- Other sort columns (date, amount, balance, payee, description, checkNumber,
  notes) use the parent's value as today — no special-case needed.
- Sort never reorders line rows relative to their parent. Line rows are
  rendered by the parent's `TransactionRow`, not by `sortRows`.

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
`deleteTransaction`, `addTransfer`, `updateTransfer`, `deleteTransfer`,
`deleteAccount`. With splits, several of these gain new responsibilities.

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

### `addTransfer` / `updateTransfer` / `deleteTransfer` — splits on the source leg

Decision 6 allows splitting the source leg of a transfer. These three methods
gain a single optional `splits` argument applied to the **source leg only**:

- **`addTransfer({ ..., splits })`** — if `splits` is provided, store it on
  the source leg. Validate that `sum(splits[].amount) === -magnitude` (the
  source leg's signed amount). The destination leg has no splits, ever.
- **`updateTransfer(transferId, { ..., splits })`** — replace the source
  leg's `splits` array (or remove it if `splits` is empty/null). Same
  sum invariant.
- **`deleteTransfer(transferId)`** — unchanged. Removes both legs by
  `transferId`; if the source leg had splits with transfer-line counterparts
  pointing to *yet other* accounts, those grand-counterparts are also
  cascaded (rare in practice but valid).

Inside the editor, the existing `categoryId`-on-both-legs convention from
the transfer-categories spec stays: the leg-level `categoryId` continues to
mean "transfer type" on both legs, and the source-leg `splits` are the
*per-line* category attributions.

### `deleteAccount` — orphan cleanup

Today `deleteAccount(id)` filters out every transaction whose
`accountId === id`. Adding splits means a different account may carry a
transaction whose `splits[]` includes a `transferId` that just lost its
counterpart. The same `deleteAccount` call now also walks every remaining
transaction and, for each split line whose `transferId` no longer resolves
to a counterpart on any remaining account, **strips that `transferId`**,
leaving an unanchored category-less line. The UI's existing orphan-row
fallback (transferInfo returns null → plain row with the line description)
renders it sensibly; the user can re-pair it from the editor.

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
  down-payment split (worked example 1); accepts a Costco split with a
  transfer line (worked example 2); rejects sum mismatch (covers a mismatch
  caused by a transfer line, not just category lines); rejects missing
  `categoryId`+`transferId` / rejects both set / rejects single-line split /
  rejects duplicate line ids / rejects duplicate `transferId`s within one
  parent.
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
- **`useLedger.test.jsx`** — `addTransfer` / `updateTransfer` accept a
  `splits` array applied to the source leg; the destination leg remains
  single-line; `sum(splits) === -magnitude` is enforced.
- **`useLedger.test.jsx`** — `deleteAccount` strips orphan `transferId`s
  from split lines on transactions in other accounts that referenced the
  deleted account.
- **`useLedger.test.jsx`** — `deleteAccount` does not delete other-account
  transactions that have split lines referencing the deleted account; it
  only sanitizes the lines.

### Component tests

- **`SplitsEditor.test.jsx`** (new) — Done button is disabled while the
  line sum mismatches the parent's amount (covers a mismatch caused by a
  transfer line too, not just category lines); type toggle swaps the
  category picker for a grouped account picker; transfer line captures the
  per-line description; the delete-line button is disabled at exactly 2
  lines; the Unsplit button prompts and on confirm promotes the largest
  category line's category to the parent and cascades the transfer-line
  counterpart deletes.
- **`TransactionEditor.test.jsx`** — Split… button appears for non-split
  transactions; opens SplitsEditor; closing with new splits replaces the
  category dropdown with the summary chip and locks the amount input;
  Edit splits… reopens with existing lines.
- **`TransferEditor.test.jsx`** — "Split source leg…" button appears,
  opens SplitsEditor balanced against the source leg's amount, and saving
  produces a transfer whose source leg has the `splits` array while the
  destination leg remains single. Editing an already-split transfer
  reopens the existing lines.
- **`Register.test.jsx`** — category filter dropdown selects a category
  referenced only by a split line on a parent → the parent stays visible
  with the matching line auto-expanded.
- **`accountsModel.test.js`** — `sortRows` by category column places split
  parents at one end (after all real categories ascending; before them
  descending) and never reorders line rows relative to their parent.
- **`TransactionRow.test.jsx`** — split parent renders chevron + line count;
  clicking the chevron expands into N line rows; clicking elsewhere on the
  parent opens the editor; transfer-line chip renders with the existing
  navigation arrow; line rows render in both `bank` and `compact` layouts.
- **`Register.test.jsx`** — search matching a split line's description shows
  the parent with the matching line auto-expanded.

### Smoke test (in `src/__smoke__`)

End-to-end Costco-with-cash-back (worked example 2): enter parent in
`TransactionEditor`, open `SplitsEditor`, add 2 category lines + 1 transfer
line, save. Then verify:

- Chase Checking register shows the expandable parent (`▶ 3 split lines`,
  amount `-$180`) and on expand, the 2 category sub-rows plus the transfer
  chip with `⇄ → Cash` navigation.
- The Cash account register shows a single counterpart leg of `+$50` with
  `⇄ ← Chase Checking` and the per-line description preserved.
- `incomeExpenseSummary` counts `$130` of spending from the parent (the two
  category lines); the `$50` transfer line is correctly excluded.
- `spendingByCategory` attributes `$100` to Groceries and `$30` to Household.
- `findDuplicates` and `recurringCharges` see the parent as a single charge,
  not three.

## Integration points (file map)

- `src/accountsModel.js` — add `validateSplits`; extend `filterTransactions`
  to match both the search term and the category-filter dropdown against
  split-line descriptions and categories (~line 107); extend `sortRows`
  category-column sort to place split parents predictably (~line 126).
- `src/reportsModel.js` — add `flattenForReports`; switch
  `incomeExpenseSummary`, `spendingByCategory`, `cashFlowByMonth` to consume
  it (~lines 87–144). `findDuplicates` and `recurringCharges` unchanged.
- `src/useLedger.js` — extend `addTransaction`, `updateTransaction`,
  `deleteTransaction` with counterpart synchronization for transfer split
  lines; call `validateSplits` on add/update. Extend `addTransfer` /
  `updateTransfer` to accept `splits` on the source leg. Extend
  `deleteAccount` to strip orphan `transferId`s from split lines on other
  accounts.
- `src/TransactionEditor.jsx` — Split… button, summary chip rendering,
  read-only amount when split, wire to SplitsEditor.
- `src/TransferEditor.jsx` — "Split source leg…" button, summary chip,
  wire to SplitsEditor balanced against the source leg's amount.
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
