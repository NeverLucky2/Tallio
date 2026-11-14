# Spend-by-Payee (Payee Activity) — Design

**Date:** 2026-07-15
**Status:** Approved (brainstorm complete)
**Arc:** Business-finance arc reports follow-up (payees → P&L → **spend-by-payee** → business mode/class → invoicing/AR → tax flags → receipts)
**Branch:** `feat/spend-by-payee` (off master)

## Context

Payees are now first-class entities and the P&L statement shipped. That unlocks a per-payee breakdown of money flow: which vendors take the most out, and which payees bring the most in. This is a Reports-layer feature only — a new panel on the existing Reports screen, reusing the period + account-scope controls and the `payeesById` map already threaded into `ReportsScreen`.

`reportsModel.js` already has the plumbing: `filterRows`, `flattenForReports` (which carries `payeeId` onto split lines), `flowOf`, and a `payeeNameOf(t, payeesById)` helper. This feature is a close cousin of the existing `spendingByCategory`.

## Goals

1. A new read-only **"By payee"** panel on the Reports screen, after "Spending by category".
2. One row per payee with **Out** (money out) and **In** (money in) columns, a **"(No payee)"** row, and a **Total** row.
3. Rows sorted by total activity (Out + In) descending.
4. Reuses the existing period + account-scope controls (no new controls).

## Non-goals (deferred)

- Per-payee category expansion ("what did I buy from Amazon?") — a real later enhancement; category detail already lives in the P&L and Spending-by-category.
- CSV/print export of this panel (the P&L covers formal export; this is an on-screen analysis).
- Net-per-payee or customer/AR framing (belongs with the later invoicing/AR arc).
- Anything that mutates data (read-only, no undo wiring).

## What it shows

```
Payee          Out       In
Amazon       $2,410      —
Acme Corp        —   $5,000
Costco       $1,180      —
(No payee)     $210     $40
──────────────────────────
Total        $4,440   $5,040
```

- **Sign convention matches the P&L:** `out` = −(sum of expense-flow amounts) (a positive magnitude); `in` = +(sum of income-flow amounts).
- **Sorted by `out + in` descending.** A zero measure renders as `—`.
- **Excluded:** transfer legs and `savings`-flow rows (deliberately set-aside money, matching the P&L). Splits attribute to the parent's payee because `flattenForReports` carries `payeeId` onto each split line.
- **Uncategorized fallback (last resort):** a non-transfer row with no valid income/expense flow is still attributed to its payee by the sign of its amount — `amount < 0` → `out`, `amount > 0` → `in`. This makes `out`/`in` here capture more than the P&L (which drops uncategorized rows); the difference is deliberate, so that every non-transfer, non-savings dollar lands under a payee.
- **"(No payee)" bucket:** rows with no `payeeId` (payee is bank-account-only and optional) aggregate into a single `payeeId: null` row named "(No payee)".
- **Empty handling:** payees with neither out nor in activity are omitted; when no rows qualify the panel shows a "No activity in this period" message.

## Data model — `reportsModel.js`

One new function alongside `spendingByCategory` (its natural home — a single ~40-line aggregation, consistent with the other report functions in that file):

`payeeActivity(transactions, categoriesById, opts = {}) → { rows, totals }`

- `rows`: `[{ payeeId, name, out, in }]`, sorted by `(out + in)` descending, zero-activity rows omitted. The no-payee bucket has `payeeId: null`, `name: '(No payee)'`.
- `totals`: `{ out, in }` — the column sums across all rows.
- `opts` = `{ start, end, accountIds, payeesById }` (same shape used by the other report functions; `payeesById` resolves names via the existing `payeeNameOf`).
- Internals: iterate `flattenForReports(filterRows(transactions, opts))`, grouping by `payeeId ?? null`. Skip a row if it is a transfer leg (`transferId != null`). Then by `flowOf`: `'savings'` → skip; `'income'` → `in += amount`; `'expense'` → `out += -amount`; `null` (uncategorized) → attribute by sign: `amount < 0` → `out += -amount`, else `amount > 0` → `in += amount`.

## Component

A small presentational `PayeeActivityTable.jsx`: the two-column table above with a totals row. Currency via `new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` (matches the reports layer); reuses the P&L's tabular-number cell styling. Renders the "No activity" message when `rows` is empty.

`ReportsScreen.jsx` gains a `payeeActivity` `useMemo` (keyed like its siblings) and a new `<section className="panel">` with the table, placed after the "Spending by category" panel.

## Testing

Inline TDD.

- **`payeeActivity` unit tests:** out/in sign conventions; the "(No payee)" bucket; splits attributing to the parent payee; exclusion of savings-flow and transfers; uncategorized rows attributed by amount sign (negative → out, positive → in); sort by (out + in) desc; totals; period + account-scope filtering; empty input.
- **`PayeeActivityTable` RTL tests:** renders payee rows with Out/In, the `—` for a zero measure, the Total row; empty-state message.
- **`ReportsScreen` test:** the "By payee" panel renders.
- Full suite stays green.

## Rollout / sequencing

Implemented on `feat/spend-by-payee` off master via inline TDD. Spec committed first; implementation plan (writing-plans) follows.
