# Profit & Loss Statement — Design

**Date:** 2026-07-11
**Status:** Approved (brainstorm complete)
**Arc:** Business-finance arc, sub-project 2 of 6 (payees → **P&L** → business mode/class → invoicing/AR → tax flags → receipts)
**Branch:** `feat/pnl` (off master)

## Context

Tallio is a local-first finance manager positioned for households and small businesses. The payees sub-project shipped; the next arc item is a formal **Profit & Loss statement** — the report that reads unmistakably as "accounting software" and is the strongest resume signal before invoicing.

The data already exists. Categories carry a `flow` field (`income` / `expense` / `savings`), and `reportsModel.js` already computes flow-aware summaries (`incomeExpenseSummary`, `spendingByCategory`, `cashFlowByMonth`) over a period + account-scope layer. The P&L reuses that plumbing and adds three things that don't exist yet: **income broken out by category as line items** (the mirror of `spendingByCategory`), a **formal statement layout** with a bold **Net Profit** line, and **trended period-over-period columns**.

## Goals

1. A dedicated, read-only P&L screen presented as a formal financial statement.
2. Trended layout: income and expense **category line items** down, **period-bucket columns** across, plus a **Total** column.
3. **Net Profit = Total income − Total expense**, per bucket and overall.
4. Column granularity is user-controlled: **Month / Quarter / Year**, independent of the selected date range.
5. Scopable to specific accounts (e.g. business accounts) via the existing scope control.
6. Exportable: **CSV** download and **browser print**.

## Non-goals (deferred to their own cycles)

- Spend-by-payee / vendor breakdown (its own next reports cycle).
- Sub-category expansion within the P&L (line items stay category-level; sub detail remains in the existing "Spending by category" panel).
- Business-mode toggle / business-vs-personal class tagging.
- Prior-period single-comparison variance columns (we chose trended instead).
- PDF generation (print is best-effort via a print stylesheet).
- Anything that mutates data (the screen is pure display — no undo wiring).

## Placement & navigation

A new **`ProfitLossScreen`** with its own nav entry ("P&L"), following the existing Reports/Payees screen pattern in `App.jsx`. Because the screen is read-only it needs **no `pushHistory`/undo wiring** — simpler than `ReportsScreen`.

## Controls (top of screen)

- **Period** — reuse `PeriodControl` (this-month … last-12-months … this-year … custom … all-time). Sets the inclusive date range `[start, end]`.
- **Scope** — reuse `ScopeControl` (all / account / type / group), producing `opts.accountIds`. Running the P&L over just the business accounts directly serves the later business/personal separation.
- **Granularity** — a Month / Quarter / Year toggle local to this screen. Determines how the range is bucketed into columns, independent of the period preset.

## The statement

A table with line-item rows and period-bucket columns plus a trailing **Total** column:

```
                    Jan     Feb     Mar    Total
INCOME
  Sales           2,100   1,900   2,400   6,400
  Interest           20      20      20      60
  Total income    2,120   1,920   2,420   6,460
EXPENSES
  Rent            1,000   1,000   1,000   3,000
  Supplies          120      90     140     350
  Total expense   1,120   1,090   1,140   3,350
──────────────────────────────────────────────
NET PROFIT          1,000     830   1,280   3,110
```

- **Income rows:** one per `income`-flow category with activity in the range. **Expense rows:** one per `expense`-flow category with activity.
- **Line items are category-level.** Sub-category detail is intentionally out of scope (keeps the trended grid readable); it stays available in the existing "Spending by category" panel.
- **Sign convention** mirrors the existing model exactly. Income totals = sum of amounts (deposits are positive). Expense magnitude = −(sum of amounts) (withdrawals are negative), matching `spendingByCategory`. **Net Profit = Total income − Total expense** for each bucket and for the Total column.
- **Excluded, consistent with every other flow summary:** `savings`-flow rows (money set aside is an allocation of profit, not an expense — it appears nowhere on the P&L), transfer legs, and uncategorized / non-flow rows. Splits are exploded via the existing `flattenForReports`, so a split with both income and expense lines contributes to both sections.
- **Empty handling:** a category row with no activity anywhere in the range is omitted; a bucket where an included row had no activity shows `0`. An empty range yields the header, zeroed totals, and a `NET PROFIT` of 0.

## Data model — new `src/pnlModel.js`

`reportsModel.js` is already ~390 lines. Rather than grow it further, the P&L aggregation gets a focused module that imports the shared helpers (`filterRows`, `flattenForReports`, and the same flow test) so it never diverges from how the rest of reports counts money.

- **`bucketsInRange(start, end, transactions, granularity)` → `[{ key, label }]`**
  Rolls `monthsInRange(start, end, transactions)` up into buckets:
  - `month`: key `YYYY-MM`, label e.g. `Jan` (or `Jan '26` when the range spans years).
  - `quarter`: key `YYYY-Qn`, label e.g. `Q1 '26`.
  - `year`: key `YYYY`, label `2026`.
  A helper maps a transaction's `YYYY-MM` to its bucket key for the chosen granularity.

- **`profitAndLoss(transactions, categoriesById, opts, buckets)` → structured result:**
  ```js
  {
    buckets,                       // the [{key,label}] passed in
    income:  { rows, totalsByBucket, total },
    expense: { rows, totalsByBucket, total },
    netByBucket,                   // { [bucketKey]: income − expense }
    netTotal,                      // income.total − expense.total
  }
  ```
  where each `row` is `{ categoryId, name, icon, color, byBucket: { [key]: amount }, total }`. Income row amounts are stored as positive; expense row amounts as positive magnitudes. Rows are sorted by descending `total`. `totalsByBucket`/`total` are the column and grand totals for that section.

The screen composes these: resolve period → `bucketsInRange` under the current granularity → `profitAndLoss`, all in `useMemo`s keyed like the existing `ReportsScreen`.

## Export & print

- **CSV** — `buildPnlCsv(pnl)` renders the grid (a header row of bucket labels + `Total`, then `INCOME` line items and total, `EXPENSES` line items and total, and a `NET PROFIT` row), reusing the CSV-escaping idiom already in `exportArchive.js`. Downloads through the existing blob-download path used by other exports.
- **Print** — a `@media print` stylesheet that hides nav and controls and prints just the statement. Best-effort; no PDF library.

## Testing

Inline TDD per the established workflow.

- **`pnlModel.js` (thorough unit tests):** bucketing across Month/Quarter/Year including quarter/year rollups and open-ended (all-time) ranges; multi-year month labels; sign conventions for income vs expense; net-profit math per bucket and Total; splits exploded to both sections; exclusion of savings-flow, transfers, and uncategorized rows; row omission for no-activity categories; empty-range result; account-scope filtering; `buildPnlCsv` output shape and escaping.
- **`ProfitLossScreen` / `PnlStatement` (RTL smoke tests):** renders the statement from seeded data; switching granularity re-buckets the columns; the export button fires the download.
- **App nav wiring (smoke test):** opening the P&L screen from nav, seeding `tallio-schema-version` alongside `tallio-accounts` per the known App-smoke-test gotcha.
- Full suite stays green.

## Rollout / sequencing

Implemented on `feat/pnl` off master via inline TDD. This spec is committed first; the implementation plan (writing-plans) follows. Spend-by-payee is the natural next reports cycle once this lands.
