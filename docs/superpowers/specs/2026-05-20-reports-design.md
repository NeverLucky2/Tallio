# BillTracker — Reports (Phase 3)

**Date:** 2026-05-20
**Status:** Approved for planning
**Branch context:** Builds on the Phase-1 accounts revamp + custom account types and the Phase-2 transfers work (branch `worktree-accounts-revamp-phase-1`, off `master`; Phases 1–2 not yet merged). Continues on the same branch as separate commits. Depends on `accountsModel.js` (`accountClass`, `isOnBalanceSheet`, `householdTotals`, `groupAccounts`, `groupOrder`), `useLedger.js`, `useCategories.js`, and `App.jsx`'s `screen` routing.

## Overview

A new **Reports** screen: a single scrollable dashboard of five reports driven by a shared period selector and an optional account-scope filter. All aggregation lives in a new pure module **`reportsModel.js`** (ledger-native, independently unit-tested); the screen is a thin composition of small presentational components and hand-rolled SVG/CSS charts (no charting dependency).

The feature is **purely additive and read-only**: it reads `accounts` / `transactions` / `categories` / account types and renders. No schema change, no migration, no writes to the ledger.

### Audience note (drives every decision)

The day-to-day user is meticulous: yearly books reconcile to within a few dollars, and duplicate charges / zombie subscriptions are caught by hand. Therefore **accuracy is the primary requirement** — no double-counting, clean transfer exclusion, correct sign handling — and reconciliation tooling (recurring/subscription detection + duplicate spotting) is a first-class report, not an afterthought.

## Goals

- Five reports on one scrollable dashboard: **Income vs Expense (+ Savings)**, **Spending by category**, **Net cash flow over time**, **Net worth over time**, **Recurring & subscriptions (+ duplicates)**.
- A single **period control** (presets + custom range) and an optional **scope filter** (all / one account / one type / one group) drive every report.
- All math in **pure, ledger-native, unit-tested** helpers in `reportsModel.js`; `accountsModel.js` stays focused.
- Hand-rolled visualization (CSS bar lists + inline-SVG trends) with **pure geometry helpers** so charts are testable, not opaque.
- Correct treatment of the ledger's realities: **transfers excluded**, **savings = income − expense** (net is savings), signs handled defensively.

## Non-Goals

- No charting library / new runtime dependency.
- No drill-down this phase (register's own search/month/category filters + the recurring report cover manual auditing; the per-account register makes household-scope drill-down awkward). See *Future work*.
- No editing/writing from Reports — read-only.
- No export of reports (the existing v4 zip + CSV export already lets the user analyze the full ledger externally). See *Future work*.
- No reuse/refactor of the bills-era `spendingMath.js` reporting functions or `CategoryBreakdown.jsx` — build fresh (see *Old code*).
- No budgets/targets, forecasting, or category-rule suggestions.

---

## Data context (no change)

- **Transactions:** `{ id, accountId, date 'YYYY-MM-DD', amount (SIGNED), categoryId, description, payee, checkNumber, transferId }`. By construction income-flow rows have positive `amount`, expense/savings-flow rows negative; helpers nonetheless sum **signed** amounts so refunds net correctly.
- **Categories:** `{ id, name, icon, color, flow }`, `flow ∈ 'income' | 'expense' | 'savings'`.
- **Transfer legs:** `transferId` set, `categoryId === null` on both legs. **Excluded from all flow-based roll-ups** (income/expense/savings/category/recurring). They still affect account balances, so they correctly appear (netted) in **net worth over time**.
- **On-balance-sheet:** `accountClass(type) ∈ 'asset' | 'liability' | 'offsheet'`; net worth counts asset + liability only (mirrors `householdTotals`).

---

## `reportsModel.js` — pure helpers

All helpers are pure (no React, no storage), accept injected `now`/`today` where "current" matters (testability), and treat a row as **flow-countable** only when `transferId == null` and its `categoryId` resolves to a category with a known `flow`. Rows failing that (transfer legs; the rare uncategorized non-transfer row) are omitted from flow sums but still count in net worth (which is balance-based, not flow-based).

### Period

```
resolvePeriod(preset, { now = new Date(), customStart = null, customEnd = null }) → { start, end }
  // start/end are 'YYYY-MM-DD' inclusive bounds, or null for an open bound.
  // presets: 'this-month' | 'last-3-months' | 'this-year' | 'last-12-months'
  //        | 'all-time' (→ { start: null, end: null }) | 'custom' (→ {customStart, customEnd}).

monthsInRange(start, end, transactions) → ['YYYY-MM', …]   // ascending, inclusive.
  // Open bounds derive from the min/max transaction month (fallback: current month).
```

### Scope

```
scopeAccountIds(accounts, scope, typesById) → Set<accountId> | null
  // scope = { kind: 'all' } | { kind:'account', id } | { kind:'type', typeId }
  //       | { kind:'group', group }. 'all' → null (meaning "no restriction").

filterRows(transactions, { start, end, accountIds }) → rows
  // date within [start, end] (null bound = open) AND (accountIds == null || accountIds.has(accountId)).
  // Shared gate for every snapshot helper. Does NOT exclude transfers — each helper decides.
```

### Income vs Expense (+ Savings) — snapshot

```
incomeExpenseSummary(transactions, categoriesById, { start, end, accountIds }) →
  { income, spending, savings, savingsRate, earmarked }
  // Over flow-countable rows in scope/period:
  //   income   = Σ amount  where flow === 'income'        (positive)
  //   spending = −Σ amount  where flow === 'expense'       (positive; refunds reduce it)
  //   savings  = income − spending                         (NET IS SAVINGS)
  //   savingsRate = income > 0 ? savings / income : 0
  //   earmarked = −Σ amount where flow === 'savings'       (informational subset, NOT subtracted)
```

### Spending by category — snapshot

```
spendingByCategory(transactions, categoriesById, { start, end, accountIds }) →
  [{ categoryId, name, icon, color, total, pct }]   // expense-flow only, total = −Σ amount, desc by total.
  // pct = total / Σ all totals (0 when no spending). Income/savings flows excluded.
```

### Net cash flow over time — trend

```
cashFlowByMonth(transactions, categoriesById, { start, end, accountIds }, months) →
  [{ month, income, spending, net }]   // one entry per month in `months`; net = income − spending (that month's savings).
```

### Net worth over time — trend

```
netWorthByMonth(accounts, transactions, typesById, { accountIds }, months) →
  [{ month, assets, owed, netWorth }]
  // As-of each month-end: balance(acct, M) = openingBalance + Σ amount where date.slice(0,7) <= M.
  //   assets   = Σ balances of asset accounts
  //   owed     = Σ |min(0, balance)| of liability accounts
  //   netWorth = Σ signed balances of on-balance-sheet (asset + liability) accounts
  // Honors accountIds (default all), but only on-balance-sheet accounts contribute. Transfers net
  // out automatically (cash↓ + asset↑), so brokerage saving shows as net-worth growth.
```

### Recurring & duplicates — reconciliation

```
recurringCharges(transactions, categoriesById, { start, end, accountIds, now }) →
  [{ label, categoryId, avgAmount, lastAmount, occurrences, monthCount, firstDate, lastDate, active, varies }]
  // Expense-flow rows in scope/period, grouped by normalized key = (payee || description),
  //   upper-cased + whitespace-collapsed. Keep groups spanning ≥ 2 distinct months.
  //   varies = max |amount − avg| / |avg| > 0.15.  active = monthsBetween(lastMonth, nowMonth) <= 1.
  //   Sort: active first, then |avgAmount| desc. (Most useful over Last 12 months / All time —
  //   short periods yield few/no multi-month groups; documented, not an error.)

findDuplicates(transactions, { start, end, accountIds }) →
  [{ accountId, label, amount, date, ids: [id, …] }]
  // Flow-countable rows in scope/period grouped by (accountId, date, round(amount,2), normalized label);
  //   any group with ≥ 2 rows is surfaced as a likely dual charge. Exact same-day, same-amount,
  //   same-payee/description match (no fuzzy window this phase).
```

`accountsModel.js` is **unchanged**; `reportsModel.js` imports `accountClass` / `isOnBalanceSheet` / `groupAccounts` / `groupOrder` from it as needed.

---

## UI — single scrollable dashboard

### `ReportsScreen.jsx` (new)

**Props:** `{ accounts, transactions, categories, types, typesById, onClose, now? }`.

Owns local state `period` (`{ preset, customStart, customEnd }`, default `last-12-months`) and `scope` (`{ kind, … }`, default `{ kind:'all' }`). Resolves `{ start, end }`, `accountIds`, `months`, and a `categoriesById` map once (memoized), then renders inside the existing `.screen-overlay > .screen` shell (header title + **Done** button, matching `AccountTypesScreen`):

1. **Sticky controls bar** — `PeriodControl` (preset chips + a Custom range with two date inputs) and `ScopeControl` (a `<select>` grouped All / by account / by type / by group, built from `groupAccounts`).
2. **Summary scorecard** — Income, Spending, **Savings** (large) + **savings rate**; an "earmarked" sub-line only when `earmarked > 0`.
3. **Spending by category** — ranked bar list reusing the `cat-track` / `cat-fill` / `cat-amount` aesthetic, per-category color, `$` + `%`.
4. **Net cash flow** — per-month bars (positive up / negative down), hand-rolled.
5. **Net worth** — inline-SVG trend line over `months`.
6. **Recurring & subscriptions** — list (label · avg/mo · occurrences · active ✓ / stale ⚠), with a **Possible duplicates** subsection below from `findDuplicates`.

Empty states per card (e.g. "No expenses in this period"). Glyphs/emoji wrapped in `<span aria-hidden>` so text-label test queries match (per existing component-test convention).

### Chart primitives (small, with pure geometry)

- `sparklinePath(values, { width, height, pad }) → { d, points }` — pure; SVG `<path d>` + point coords for the net-worth line.
- `barLayout(values, { width, height, gap }) → [{ x, y, width, height, negative }]` — pure; for the cash-flow bars (baseline at zero).
- `LineChart` / `BarChart` are thin SVG wrappers over these; geometry is unit-tested independently of the DOM.

### `App.jsx` wiring

- Extend `screen` union with `'reports'`; render `<ReportsScreen … onClose={() => setScreen('main')} />` when active.
- Add a `📊 Reports` button to the header actions (next to `☰ Categories` / `▤ Account Types`).
- Pass `accounts`, `transactions`, `categories`, `accountTypes.types`, `accountTypes.typesById`.

---

## Old code

- **`spendingMath.js`** — keep untouched. Its `migrateToV2` / `migrateToV3` are still used by `initializeFromStorage.js` + `accountsMigration.js`; only its bills-era *reporting* functions are dead. Pre-existing lint there is **not** ours.
- **`CategoryBreakdown.jsx`** — fully dead (only its own test imports it). Left in place this phase; retiring it + its test is optional cleanup, out of scope.

---

## Edge cases (resolved)

- **Transfers:** every flow-based helper excludes `transferId != null` rows; net worth keeps them (balances are real). On-sheet→on-sheet transfers leave net worth flat; cash→brokerage shows as net-worth growth.
- **Savings flow:** rarely used (real saving = brokerage transfers); treated as not-spent — excluded from `spending`, reported only as informational `earmarked`. `savings = income − spending` regardless.
- **Signs / refunds:** signed sums mean a positive amount in an expense category (a refund) reduces spending and a category's total; helpers never assume sign from flow.
- **All-time / open bounds:** `start`/`end` null = unbounded; `monthsInRange` derives the axis from data (min/max txn month), falling back to the current month for an empty ledger.
- **Uncategorized non-transfer row:** omitted from flow sums (not guessed); still counts in net worth. (Existing data always categorizes, so this is defensive.)
- **Short period + recurring:** a `this-month` period yields few/no ≥2-month groups → empty recurring list; expected, with a hint to widen the period.
- **Net worth & opening balance:** `openingBalance` is treated as present from before all transactions (no date), so it's included in every month-end balance.
- **Empty ledger / no accounts:** all reports render their empty states; no division by zero (`savingsRate` guarded, `pct` guarded).

---

## Testing (TDD, mirroring Phases 1–2)

Each `reportsModel` helper is written test-first (`npx vitest run src/reportsModel.test.js`):

- **Period:** each preset's `{ start, end }` against an injected `now`; `all-time` open bounds; `custom` passthrough; `monthsInRange` ascending/inclusive incl. open bounds from data.
- **Scope:** `scopeAccountIds` for each `kind`; `filterRows` date + account gating; open bounds.
- **Summary:** income/spending/savings/savingsRate/earmarked; transfer + savings exclusion from spending; refund (positive expense amount) reduces spending; `savingsRate` guard when income = 0.
- **Spending by category:** expense-only, sorted desc, `pct` sums to ~100%, transfers excluded, empty → `[]`.
- **Cash flow:** one bucket per month; per-month net; months with no activity → zeros.
- **Net worth:** as-of correctness (a mid-period transaction shifts only later months); on-sheet→on-sheet transfer leaves net worth flat across months; off-sheet excluded; `accountIds` restriction.
- **Recurring:** grouping by normalized payee/description; ≥2-month requirement; `active` vs stale by injected `now`; `varies` threshold; active-first ordering; transfers/income excluded.
- **Duplicates:** same-day same-amount same-label collisions flagged; near-but-different (different day or amount) not flagged; transfers excluded.
- **Geometry:** `sparklinePath` / `barLayout` coordinates incl. all-equal values, negatives (baseline), single point, empty.

Component tests (`ReportsScreen.test.jsx`) follow `afterEach(cleanup)` + `<span aria-hidden>` conventions: controls change the rendered figures; each card renders/empties correctly; the scope dropdown lists grouped accounts. **Bar: zero new lint errors/warnings from files we add or change.**

## Implementation order (review checkpoints in bold)

1. **Period + scope** (`resolvePeriod`, `monthsInRange`, `scopeAccountIds`, `filterRows`) — pure, fully tested.
2. **Snapshot reports** (`incomeExpenseSummary`, `spendingByCategory`).
3. **Trend reports** (`cashFlowByMonth`, `netWorthByMonth`).
4. **Reconciliation** (`recurringCharges`, `findDuplicates`). **— Checkpoint: all pure helpers green.**
5. **Chart geometry + presentational components** (`sparklinePath`, `barLayout`, `LineChart`, `BarChart`, `CategoryBarList`, `SummaryScorecard`, `RecurringList`, `PeriodControl`, `ScopeControl`).
6. **`ReportsScreen` composition + `App` wiring** (header button, `screen='reports'`). **— Checkpoint: verify in-app at `--port 5174`.**

Keep new helper params back-compatible / defaulted so existing tests stay green during migration.

## Resolved decisions (from brainstorming)

- **Reports:** all five — Income vs Expense (+Savings), Spending by category, Net cash flow over time, Net worth over time, Recurring & subscriptions (+duplicate detection).
- **Visualization:** hand-rolled SVG/CSS, no chart library; pure geometry helpers.
- **Time controls:** one unified period selector with presets (This month, Last 3 months, This year, Last 12 months, All time, Custom range); snapshots sum the range, trends bucket by month.
- **Scope:** household-wide default + optional filter (account / type / group); helpers take an optional `accountIds` set; net worth stays on-balance-sheet.
- **Savings:** *Net IS savings* — `savings = income − spending` (+ a savings rate); savings-flow categories are not-spent (excluded from spending, shown as informational `earmarked`); brokerage saving surfaces in net worth.
- **Reconciliation:** a recurring/subscriptions report + a duplicate-charge detector (serves the meticulous primary user).
- **Layout:** single scrollable dashboard with sticky period + scope controls.
- **Drill-down:** deferred this phase.
- **Old code:** `spendingMath.js` kept (migration funcs live), `CategoryBreakdown.jsx` left dead; build fresh in `reportsModel.js` + `ReportsScreen.jsx`.

## Future work (out of scope)

- **Drill-down** — click a figure to reveal underlying transactions (single-account register jump, or a transactions popover that works household-wide).
- **Report export** — per-report CSV / print-friendly view.
- **Budgets/targets**, forecasting, and savings-goal tracking against the brokerage trend.
- Retiring `CategoryBreakdown.jsx` + dead `spendingMath` reporting functions in a cleanup pass.
