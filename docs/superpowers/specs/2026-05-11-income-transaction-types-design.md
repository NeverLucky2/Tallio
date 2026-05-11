# Sub-project B — Income & Transaction Types

**Date:** 2026-05-11
**Status:** Approved (design)
**Part of:** Quicken-replacement initiative, sub-project B of A→B→C→D
**Depends on:** Sub-project A (categories as data)

## Summary

Extend BillTracker beyond pure-expense tracking. Add first-class support for income (paychecks, Zelle, dividends, interest, cashback, tax refunds, reimbursements, cash gifts, sales, loans-borrowed), savings/investment outflows (401k, Roth, brokerage transfers, cash savings, loans-lent), and refunds (negative-amount line items inside expense-flow categories). The mental model collapses to three buckets — **Income / Spent / Saved** — and reporting derives a fourth value **Net = Income − Spent − Saved** as the "what's truly left in checking" headline. The single structural addition is a `flow` property on each category; items themselves only need `amount` to allow negatives.

## Goals

- One unified data shape for paychecks, expenses, refunds, and savings — no parallel collections.
- Paycheck modeling as a gross-pay line plus deduction lines, so 401k/Roth/tax-withholding contributions are visible inside BillTracker rather than disappearing pre-deposit.
- Refunds appear inline on the credit card statement they came from, automatically reducing the relevant expense category.
- Three hard-wired bucket types (Income / Spent / Saved) with unlimited user-editable categories beneath them.
- The bi-weekly paycheck shows up automatically in a new "Recurring Income" sidebar section once a few months of data exist.
- Categories created by users pick their flow at creation; flow on existing categories is editable with a warning that quantifies the impact.

## Non-goals

- Per-trade investment register (security ticker, share count, cost basis, gain/loss). Trade-level detail stays in the user's brokerage.
- Multi-account modeling (checking vs savings vs brokerage as distinct accounts).
- Per-item sales-tax tracking on receipts. Sales tax is folded into the receipt's line totals.
- Net-worth or balance-sheet views.
- SpendingChart showing income/savings layers. Stays expense-only for this sub-project; revisit in sub-project D.
- Renaming the central "Bill" concept to "Transaction" or "Entry." Copy stays for now; the schema name is incidental.
- A fourth bucket for taxes. Tax withholdings are expense-flow categories like everything else "spent."

## Data Model

### Category shape — one new property

```js
{
  id: "cat_a8k2",
  name: "Paycheck",
  icon: "💼",
  color: "#6BD49A",
  flow: "income",             // NEW: 'income' | 'expense' | 'savings'
  keywords: ["PAYCHECK", "SALARY", "PAYROLL", "DIRECT DEPOSIT", "GROSS PAY"],
  templates: [],
  builtin: true,
}
```

`flow` is required on every category. The three flows are hard-wired; user-created categories must pick one of the three at creation time.

### Item shape — sign relaxation only

```js
{ id, description, amount, categoryId, date }
```

Same shape as v2. The only behavioral change: `amount` may be **negative**, but only when the row is a refund inside an expense-flow category. Everywhere else, amounts stay positive.

### Sign convention (the single rule we live by)

| Row kind | Amount sign | Category flow |
|---|---|---|
| Paycheck gross, Zelle, dividend, interest, cashback, tax refund, etc. | `+` | `income` |
| Purchase | `+` | `expense` |
| **Refund of a prior purchase** | **`−`** | **`expense`** (same category as the purchase) |
| Tax withholding (fed/state/FICA) | `+` | `expense` (Taxes category) |
| 401(k), Roth, brokerage transfer, cash savings, loan lent | `+` | `savings` |

**Mnemonic:** the category tells you the flow; the sign is positive everywhere except refunds.

### Bill shape — unchanged

`{ id, vendor, month, items }`. A paycheck "bill" has the employer as vendor and one item per pay-stub line. A credit-card "bill" has the card as vendor and one item per transaction.

## Derived Quantities

### Bill total (replaces `items.reduce(+)`)

```js
incomeSum  = sum of items.amount where cat.flow === 'income'
expenseSum = sum of items.amount where cat.flow === 'expense'  // refunds subtract
savingsSum = sum of items.amount where cat.flow === 'savings'
billNet    = incomeSum - expenseSum - savingsSum
```

A paycheck bill nets to the deposit amount. A credit-card bill (with or without refunds) nets to the negative outflow. The card header shows `|billNet|` with a directional indicator: green ↑ for net inflow, neutral ↓ for net outflow.

### Monthly buckets (the new stat strip)

```js
monthIncome = sum over month items where cat.flow === 'income'
monthSpent  = sum over month items where cat.flow === 'expense'   // refunds reduce
monthSaved  = sum over month items where cat.flow === 'savings'
monthNet    = monthIncome - monthSpent - monthSaved
```

`Net` is the "leftover after auto-savings" interpretation — your actual checking-account surplus for the month.

## One-Time Migration (v2 → v3)

Triggered on app load when `billtracker-schema-version < 3` or when the existing `billtracker-categories` array has no `flow` field. Chained after the v1→v2 migration inside `initializeFromStorage`.

### Steps

1. **Backup.** Write the entire pre-migration `billtracker-categories` payload to a new `localStorage` key `billtracker-categories-v2-backup` along with a timestamp. Idempotent — only writes if the key doesn't already exist.
2. **Backfill flow.** Every existing category gains `flow: 'expense'`. Safe default — all v2 categories were expenses.
3. **Append seeds.** Add the seed income + savings categories (table below). Skip any seed whose `name` already exists in the user's category list, so users who pre-created `"Paycheck"` aren't duplicated. New seeds get fresh `nanoid(8)` ids.
4. **Bump schema.** Set `billtracker-schema-version` to `3`.
5. **Bills unchanged.** No item-walking needed because item amount-sign rules are additive.

### Idempotency

`migrateToV3(bills, categories, seedCategoriesV3) → { bills, categories }` is a pure function. If `categories[0].flow` is already a string, it returns the inputs untouched. Re-running across app reloads is a no-op.

### Failure recovery

If the migration throws, the storage-error toast surfaces with the migration error message. The backup key `billtracker-categories-v2-backup` is the manual recovery path — restore via JSON re-import after the user exports the previous state, or via DevTools localStorage editing. No automated rollback button is added in sub-project B; the existing toast pattern from the v1→v2 migration is reused.

### Seed set

~14 new categories. Broad enough that paystub/brokerage line items auto-categorize on first import; narrow enough to prune in a minute.

| Flow | Name | Seed keywords |
|---|---|---|
| income | Paycheck | PAYCHECK, SALARY, PAYROLL, DIRECT DEPOSIT, GROSS PAY |
| income | Zelle In | ZELLE FROM |
| income | Dividends | DIVIDEND, DIV |
| income | Bank Interest | INTEREST EARNED, INTEREST CREDIT |
| income | Cashback | CASHBACK, CASH BACK, REWARDS, REWARD REDEMPTION |
| income | Tax Refund | TAX REFUND, IRS REFUND, STATE REFUND |
| income | Reimbursement | REIMBURSEMENT, EXPENSE REIMB |
| income | Other Income | *(no keywords — manual selection fallback for income flow)* |
| savings | 401(k) | 401K, 401(K) |
| savings | Roth IRA | ROTH, ROTH IRA |
| savings | Brokerage Transfer | BROKERAGE, INVESTMENT TRANSFER |
| savings | Cash Savings | SAVINGS DEPOSIT, TRANSFER TO SAVINGS |
| savings | Loans Lent | LOAN OUT, LENT TO |

The v2 "Other" category stays as the expense-flow fallback for `autoCategorize` misses. "Other Income" is the parallel income-flow fallback for manual entry of unrecognized income.

## LLM Extractor Changes

### Prompt rewrite — `Rules:` block in `billExtractor.js`

```diff
- Skip subtotals, totals, tax-only lines, payment/balance lines, and headers.
- For credit-card statements: each transaction is one item.
  Skip "PAYMENT - THANK YOU" and similar.
+ Extract every line-item that moves money in or out, including refunds,
+ credits, deposits, and paycheck deductions.
+ Amounts:
+   - Purchases / outflows / deductions: positive
+   - Refunds / credits / returns: NEGATIVE (e.g., -40.00)
+   - Income (deposits, paycheck gross, dividends, interest, Zelle): positive
+ For paystubs: extract gross pay as one positive line, then each deduction
+   (federal tax, state tax, FICA, 401k, Roth, insurance, etc.) as a positive
+   line. Use the current-period column, not YTD.
+ For brokerage statements: extract dividends, interest, distributions as
+   positive lines. Skip buy/sell trades.
+ For credit-card statements: each transaction is one item. Refunds /
+   returns / credits → negative amount. Skip "PAYMENT - THANK YOU" lines
+   (those are the user's payment to the card issuer, not a transaction).
+ Always skip: statement totals/balances, sales-tax breakdown lines on
+   single receipts, account-number headers, table-rule lines.
```

The signed `amount` is the LLM's only direction signal — flow is derived client-side from the category. The model never has to "guess" income vs savings vs expense.

### `validateResponse()` — one-line change

```diff
- it.amount > 0
+ it.amount !== 0 && isFinite(it.amount)
```

Negatives pass through; zero is still rejected (a zero-amount line is a parse failure, not a refund).

### Auto-categorization — unchanged

`cats.autoCategorize(description)` is sign-agnostic. The new seed categories from the migration supply the keywords for income and savings. `"ZELLE FROM JOHN"` routes to "Zelle In"; `"REFUND: WHOLE FOODS"` matches the "Groceries" keyword on its description and lands as a negative line in that expense-flow category.

## UI Changes

### Top stat strip — 4 cards

Replace today's `Total Expenses | This Month | Total Bills` row with `Income | Spent | Saved | Net`. Existing color/dot pattern, JetBrains Mono numbers, delta indicator vs previous month on each. The "Total Bills" count moves into the existing section heading where it already shows.

Each card uses a flow-specific accent: Income green (`#6BD49A`), Spent red (`#E0928A`), Saved blue (`#5B8DFF`), Net gold (`#D4A853`).

### SpendingChart — collapsible

The 12-month bar chart between the stat strip and the bills list gains a collapse/expand button in its header. Default state is expanded (matches today). Collapsed state persists to `localStorage` under key `billtracker-chart-collapsed`. Internals unchanged — still expense-only.

### BillCard header — directional total

Renders `|billNet|` (computed per the formula above) with a directional indicator:
- Net inflow (`billNet > 0`): green color + up-arrow `↑`
- Net outflow (`billNet < 0`): default text color + down-arrow `↓`
- `billNet === 0`: neutral, no arrow

### BillItem — refund Credit toggle + grouped category picker

Two changes to each item row.

**Credit toggle:** a small "Credit" button (or pill) sits to the left of the amount input. When the row's `amount < 0`, the toggle is active (filled green tint, label "Credit"). Clicking toggles the sign of `amount`. Direct negative typing in the amount input also enters the credit state. The row body gets a subtle green wash when active so refunds are visually distinct from purchases. The `min="0"` attribute on the amount input is removed in both the mobile and desktop layouts.

**Grouped category dropdown:** the `<select>` is split into three `<optgroup>` blocks — Income / Expense / Savings — alphabetized within each. Order matches the stat strip.

### Recurring sidebar — three sections

The existing "Subscriptions" panel becomes "Recurring," split into three consecutive sub-panels:

- **Recurring · Income** — paychecks, recurring dividends, etc.
- **Recurring · Expenses** — rent, utilities, subscriptions (the current behavior).
- **Recurring · Savings** — recurring 401k, Roth, brokerage transfers.

Each sub-panel has its own monthly-sum summary line. `findRecurringCharges` returns one combined array annotated with `flow`; the panel filters into three groups.

### CategoryEditor — flow segmented control + warning

A 3-way segmented control "Flow: [Income] [Expense] [Savings]" sits at the top of the editor form. Required at creation, defaults to Expense.

**Editing flow on an existing category** is allowed but warned. Clicking a different flow opens a `ConfirmDialog` with text like:

> Changing "Cash Savings" from Savings to Expense will move **14 items** into the Spent bucket. This affects past months too. Continue?

Cancel preserves the prior flow. The dialog wording references real numbers — items count derives from `cats.findItemsInCategory(catId, bills).length`.

### ManageCategoriesScreen — grouped list

Categories in the list are grouped by flow with section dividers; each row shows a small flow badge (e.g., "income" / "expense" / "savings") so visual scanning matches the picker.

### Search — sign-aware

`matchesSearch` is unchanged structurally; refunds are searchable by their description like any line. Searching `"-40"` matches a refund row whose amount is `-40`.

### Empty-state copy

`"No bills yet"` stays. Renaming the central concept is deliberately out of scope for sub-project B.

## Aggregator Math

All in `spendingMath.js`.

### `aggregateByMonth(bills, endMonth, categoriesById, vendorFilter = null)`

Signature gains `categoriesById` (a `Map<id, category>`). Bucket shape changes:

```js
buckets[m] = {
  month: m,
  income: 0,
  spent: 0,    // was `total`
  saved: 0,
  byVendor: {}, // expense-only — vendor breakdown of income isn't meaningful
};
```

Inner loop: look up each item's category, route the amount into the appropriate bucket. `byVendor` only accumulates expense-flow items because the SpendingChart visualization is about spend.

### `findRecurringCharges(bills, today)`

- Removes the implicit `item.amount > 0` filter. Replace with `item.amount !== 0`.
- Each result object gains `flow: 'income' | 'expense' | 'savings'`, computed via the existing `mode()` helper applied to occurrences' `categoryId`s (then `categoriesById.get(majorityId).flow`).
- Day-range tolerance unchanged — bi-weekly paychecks (consistent amount, 14-day spread) pass through naturally.

### `aggregateByKeyword(bills, keyword)`

- Removes the `amount > 0` filter; sums are sign-aware.
- Return value gains `flow` (majority category's flow).

### `aggregateByDay(bills, targetMonth, vendorFilter)`

- Bucket field `total` becomes `spent` and only sums expense-flow items.
- Income and savings excluded — day-grain view is about outflow.

### New helper: `getBillNet(bill, categoriesById)`

Pure function. Returns `{ income, expense, savings, net }`. Used by `BillCard` for the header total and by tests for assertion.

### `getMonthItems(bills, month)`

Unchanged — already returns all items in a month regardless of sign or flow.

## Components & Files

### Files modified

| File | Changes |
|---|---|
| `spendingMath.js` | New `migrateToV3`; new `getBillNet`; `aggregateByMonth`/`findRecurringCharges`/`aggregateByKeyword`/`aggregateByDay` updated for flow-awareness and sign-awareness. |
| `initializeFromStorage.js` | Chain `migrateToV3` after `migrateToV2`; write `billtracker-categories-v2-backup`; surface migration error in toast. |
| `billExtractor.js` | New `Rules:` prompt; relaxed `validateResponse` (accept negative `amount`). |
| `useCategories.js` | `addCategory` requires `flow`; `updateCategory({ flow })` permitted; seed list (used only on first install when no v2 data exists) updated. |
| `categoriesDefaults.js` | Add `flow` to all built-in categories; export the new income/savings seed list separately for the migration. |
| `App.jsx` | New stat-strip layout (4 cards); SpendingChart collapse state; pass `categoriesById` into aggregators; new section structure in the sidebar. |
| `BillCard` (in `App.jsx`) | Use `getBillNet` for header total; directional indicator. |
| `BillItem.jsx` | Remove `min="0"`; add Credit toggle UI; grouped `<optgroup>` category dropdown; green-wash row class when amount < 0. |
| `CategoryEditor.jsx` | Add flow segmented control; warning dialog on flow change for non-empty categories. |
| `ManageCategoriesScreen.jsx` | Group category list by flow; flow badge per row. |
| `SpendingChart.jsx` | Add collapse/expand button; read/write `billtracker-chart-collapsed`. |

### New files

None. All changes ride on existing files.

### LocalStorage keys

| Key | Purpose | New in B? |
|---|---|---|
| `billtracker-bills` | Bills | existing |
| `billtracker-categories` | Categories (with `flow`) | existing, shape extended |
| `billtracker-schema-version` | Schema integer | existing, bumps from 2 → 3 |
| `billtracker-tracked-keywords` | Pinned keywords | existing |
| `billtracker-undo-tip-seen` | First-run tip flag | existing |
| `billtracker-categories-v2-backup` | Migration backup | **new** |
| `billtracker-chart-collapsed` | Chart collapse persistence | **new** |

## Testing Strategy

### Unit tests (extending `spendingMath.test.js`)

- `migrateToV3`: v2 input → all categories gain `flow: 'expense'`; seeds appended once; idempotent across re-runs; pre-existing user category named `"Paycheck"` not duplicated; pre-migration keywords preserved on existing categories.
- `aggregateByMonth`: three-bucket split correct on mixed-flow data; refund reduces `spent` (not "income"); bi-weekly paycheck contributes to `income`; 401k contributes to `saved`.
- `findRecurringCharges`: each result includes `flow` from majority categoryId; bi-weekly paycheck (consistent amount, 14-day spread) survives day-range filter; pure-refund pattern doesn't pollute results.
- `aggregateByKeyword`: sign-aware ($84 + $-40 refund → $44); `flow` derived from majority categoryId.
- `getBillNet`: paycheck → `+3848`; CC with refund → `-382`; pure income bill → positive net; pure expense → negative net; empty bill → 0.

### Extractor tests (extending `billExtractor.test.js`)

- Mocked paystub response with gross + 5 deductions: all 6 lines extracted as positives; `vendor` = employer name.
- Mocked CC response with a refund line: refund's negative amount survives `validateResponse`.
- `validateResponse` rejects `amount === 0` (regression guard).
- The prompt — not the validator — excludes "PAYMENT - THANK YOU" lines (mock returns one anyway → validator passes it; the prompt is the contract).

### Component tests

- `BillItem.test.jsx`:
  - Credit toggle click flips sign of `item.amount`; row gains green-tint class; badge active.
  - Toggling off restores positive amount.
  - Direct negative typing also triggers the green-tint render.
  - Category dropdown renders three `<optgroup>` sections in Income / Expense / Savings order.
- `CategoryEditor.test.jsx`:
  - Flow segmented control renders three options; selecting "Income" sets `flow: 'income'`.
  - Editing flow on a category with items shows the `ConfirmDialog` with the item count + specific text; cancel preserves prior flow.
- `SpendingChart.test.jsx`:
  - Collapse button hides body; `billtracker-chart-collapsed` set to `"true"`.
  - Render after seeding localStorage with `"true"` → starts collapsed.
- `useCategories.test.jsx`:
  - `addCategory({ flow: 'income', ... })` round-trips through localStorage.
  - `updateCategory(id, { flow: 'savings' })` succeeds at the hook level (the warning is the UI's responsibility).

### Migration safety (extending `initializeFromStorage.test.js`)

- v2 shape input → v1→v2→v3 chain runs; `billtracker-categories-v2-backup` written before transforming.
- `migrateToV3` throwing surfaces the storage-error toast; backup remains intact.

### Integration smoke (extending `__smoke__/setup.test.jsx`)

- Seed localStorage with a v2 snapshot → mount the app → migration runs → "Manage Categories" shows the flow badge on every existing expense category + the new income/savings seeds present.
- Manually add a paycheck bill (gross + 401k + federal tax) and a CC bill with a refund. Assert the stat strip reads `Income 5200, Spent X, Saved 260, Net = Income − Spent − Saved`.

### Deliberately not tested

- Visual regression / pixel-diff of the new dashboard. Manual browser smoke before merge.
- Paystub-format variance across employers. The LLM does its best; users edit manually for misses. The prompt contract is what's tested.
- Performance under thousands of bills. Existing aggregators are O(items); flow lookup adds one Map.get per item. Profile if it ever matters.

## Implementation Order (rough)

1. Schema + migration first (no UI changes; existing tests must still pass).
2. Aggregators second (covered by unit tests; no UI rendering yet).
3. LLM prompt + `validateResponse` third (mocked extractor tests).
4. UI surfaces last, in this order: stat strip → bill card net → BillItem credit toggle + grouped picker → recurring split → CategoryEditor flow + warning → SpendingChart collapse.
5. Smoke test passes end-to-end before manual browser smoke.

Each numbered step should land as a clean commit (or small commit group) on the feature branch, similar to sub-project A's commit cadence.

## Out-of-Scope but Worth Naming for C and D

- **Sub-project C (copy/duplicate + opt-in auto-recurring):** the `flow` property on categories is the hook for "duplicate this paycheck as next month's." Auto-recurring should respect flow so a recurring paycheck creates an income-flow bill, not an expense one.
- **Sub-project D (reporting + export):** the three buckets are the natural top-level grouping for reports. Income vs Spent vs Saved comparisons over time. SpendingChart should grow income/savings layers in D.
- **JSON export format:** items already export with `amount` and `categoryId`; with the v3 categories slice carrying `flow`, the export round-trips losslessly.

## Open Questions / Future Work

- Whether to ever introduce a 4th bucket for Taxes specifically (currently expense-flow with a "Taxes" category). Deferred unless reporting reveals the need.
- Whether `SpendingChart` ever shows income/savings layers. Deferred to sub-project D.
- Whether the bill list section heading should ever be renamed from "Bills" to "Entries" / "Transactions." Cosmetic, deferred.
- Whether the recurring detector should auto-mark a row as `inactive` when it sees a flow-change history (e.g., a category was renamed/re-flowed in the middle of its history). Defer — edge case.
