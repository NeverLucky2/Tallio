# Sub-project D — Reporting & Export Overhaul

**Date:** 2026-05-12
**Status:** Approved (design)
**Part of:** Quicken-replacement initiative, sub-project D of A→B→C→D
**Depends on:** Sub-project A (categories as data), Sub-project B (income & transaction types), Sub-project C (duplicate & opt-in auto-recurring)

## Summary

Add reporting that goes beyond the single-month stat strip and 12-month spend chart: **year-over-year by category**, **month-over-month by category**, and a **recurring-vs-one-off Spent split**. Reports live in a new full-screen `ReportsScreen` reached via a toolbar `📊 Reports` button. Replace the bare `JSON.stringify(bills)` export with a single-click ZIP bundle (`billtracker-YYYY-MM-DD.zip`) containing a schema-versioned `data.json` and a flat `items.csv`. Two new modules: `reportingMath.js` (pure aggregators) and `exportArchive.js` (slice extraction + zip building via `fflate`). No new persisted slices and no schema version bump — the new reports derive purely from existing data, and the export wrapper is additive.

## Goals

- Three new reports, derived purely from existing data — no schema changes.
- SpendingChart gains a flow toggle (Spent / Income / Saved / Net), one layer at a time, reusing the existing 12-month bar visualization.
- Inline recurring-vs-one-off mini-bar inside the Spent stat card on the dashboard.
- Export produces a single ZIP `billtracker-YYYY-MM-DD.zip` containing both `data.json` and `items.csv`.
- `data.json` schema is stable and human-readable — dad opens the file in a text editor and recognizes the shape.
- `items.csv` is the flat sheet for pivoting in Excel — one row per item, signed amounts, human-readable category names.

## Non-goals

- **Budgets.** Deferred to sub-project E (its own setting/editing UX, dashboard progress treatment, and export slice).
- **Per-chain change history report.** "$452 → $470 in March" is derivable but not a v1 surface.
- **Import / restore from archive.** Export is archival in D; a future sub-project can consume `data.json` to restore.
- **PDF reports, scheduled emails, shareable links.**
- **Replacing existing surfaces.** Dashboard, SpendingChart, and the three Recurring panels stay; D augments them.
- **Schema version bump.** Both the data schema and the export wrapper are unchanged-or-additive. Stays at `3`.
- **YoY visibility for vendors.** Category is the comparison axis; vendor-level YoY is out.
- **Daily drill-down for non-Spent flows.** `aggregateByDay` stays expense-only.

## Reports

### 1. Year-over-year by category

YTD-through-current-month vs same-period-last-year. Today `2026-05-12` → currentYTD covers Jan–May 2026, priorYTD covers Jan–May 2025 (apples-to-apples, not full prior year).

Categories grouped by flow (Income → Expense → Savings); within each flow, sorted by `currentYTD` descending. Rows where both `currentYTD === 0` and `priorYTD === 0` are omitted. `deltaPct === null` when `priorYTD === 0` → UI renders as `—` rather than `+∞%`.

Empty state when the user has less than 13 months of bill data: panel shows "Not enough history yet — come back when you have a full year of data." rather than rendering an empty table.

### 2. Month-over-month by category

12-month series for a single user-selected category. Same bar visualization as `SpendingChart` but sliced by category rather than aggregated across all expense flow.

Category picker is a `<select>` grouped by flow (`<optgroup>` Income / Expense / Savings — same pattern as `BillItem`). Default selection on first open: the first expense-flow category in the user's category list (deterministic, no state needed).

Below the chart: small caption `avg $X/mo · last 12 months`. Refunds inside the selected category subtract naturally from the matching month.

### 3. Recurring vs one-off breakdown

Two parts:

- **Inline mini-bar on the dashboard Spent card** — stacked progress bar under the Spent value, with two tiny labels (`recurring $3,180 / one-off $2,240`). Auto-updates with `selectedMonth`. Lives inside the existing `SummaryCard` for Spent.
- **Full breakdown tab inside ReportsScreen** — wide stacked bar at the top showing the partition for the current month, then per-chain rows from `findAutoRecurringChains` grouped by flow: vendor · monthCount · lastAmount · avgAmount. When there are zero recurring chains, the tab shows the partition (100% one-off) plus an empty-state line: "No active recurring bills yet — toggle a bill to recurring or click Make recurring on an inferred pattern."

## Data Plumbing — `reportingMath.js`

New module. Three pure aggregators. No state, no React. Co-located test file `reportingMath.test.js`.

### `aggregateYoYByCategory(bills, today, categoriesById)`

```js
[
  { categoryId, name, flow, currentYTD, priorYTD, deltaPct, deltaAbs },
  ...
]
```

- `today` is a `YYYY-MM` or `YYYY-MM-DD` string; only the year + month components are used for window computation.
- `currentYTD` and `priorYTD` are the summed `item.amount` for each period within the matching category.
- `deltaPct` = `(currentYTD - priorYTD) / Math.abs(priorYTD)` rounded to integer percent. `null` when `priorYTD === 0`.
- `deltaAbs` = `currentYTD - priorYTD`.
- Items with `null` / unknown `categoryId` are skipped (no aggregation under "Uncategorized" — those rows are noise in a YoY report).
- Sort: by flow (`'income'` → `'expense'` → `'savings'`), then by `currentYTD` desc within each flow.
- Returns `[]` when `bills` is empty or non-array.

### `aggregateMonthByCategory(bills, endMonth, categoryId)`

```js
[ { month: "YYYY-MM", total: number }, ... ]  // exactly 12 buckets
```

- Window matches `getMonthWindow(endMonth)` from `spendingMath.js`.
- Sums `item.amount` per month where `item.categoryId === categoryId`.
- Months with no matching items render as `total: 0` (keeps the 12-bucket shape stable).
- `categoryId` not present in any item → 12 zeros (caller handles empty-state rendering).

### `partitionSpentByRecurring(bills, month, categoriesById)`

```js
{ recurring: number, oneOff: number, total: number }
```

- Walks every item in every bill within `month`.
- Filters to expense-flow only (income and savings are not "spent").
- Bills with `recurringChainId` (truthy string) → `recurring`; bills without → `oneOff`.
- Refunds (negative amounts) subtract within their bucket.
- `total = recurring + oneOff`.
- Empty input → `{ recurring: 0, oneOff: 0, total: 0 }`.

### Reuse — `findAutoRecurringChains` from `spendingMath.js`

Returns the per-chain rows already shaped for the Recurring breakdown tab — `vendor`, `lastAmount`, `avgAmount`, `monthCount`, `occurrences`, `flow`. No change to this function.

## UI Surfaces

### Toolbar — new `📊 Reports` button

Sits in the existing button row in `App.jsx` (near `↗ Export`, `⚙`, `⌘ Pair Phone`). Click sets a new `'reports'` value on the existing `screen` state (the same state that already handles `'manage-categories'`). The Reports button is always enabled — even with `bills.length === 0`, the screen opens with empty states.

### `ReportsScreen.jsx` — new file

Full-screen view mirroring `ManageCategoriesScreen` structure: backdrop, centered panel, header with title + close button, body area. Close via the button or ESC key.

Three tabs across the top of the body. Tabs implemented as `<button role="tab" aria-selected={...}>` with the active one styled `.reports-tab.active`. The tab strip is its own row; below it, one content area shows the active tab's content.

Tabs always reset to **Year-over-year** when the screen is opened (no persistence — open fresh each time, simplest mental model).

| Tab | Content |
|---|---|
| Year-over-year | Header line: `YTD through May 2026 vs Jan–May 2025`. Grouped table — flow header rows ("Income · Expense · Savings"), then per-category rows: name · currentYTD · priorYTD · Δ%. Empty `priorYTD` renders as `—`. |
| Month trend | Top: category picker (`<select>` grouped by flow). Below: 12-month bar chart using `aggregateMonthByCategory`; hover/tap tooltip shows `month · total`. Below the chart: caption `avg $X/mo · last 12 months`. |
| Recurring breakdown | Header: wide stacked bar showing this month's partition (`partitionSpentByRecurring` on `selectedMonth`). Below: per-chain rows from `findAutoRecurringChains`, grouped by flow: vendor · monthCount · lastAmount · avgAmount. |

Reports re-read from `bills`, `selectedMonth`, and `categoriesById` props on each render — switching `selectedMonth` in the dashboard *before* opening Reports is reflected; reports do not introduce their own month selector.

Window endpoints for the YoY and Month trend reports derive from **today's actual calendar month** (`new Date().toISOString().slice(0, 7)`), not from `selectedMonth`. This matches `SpendingChart`'s existing `windowEnd` convention — `selectedMonth` only controls *highlighting* on the 12-month chart, not the window. The Recurring breakdown tab's header partition uses `selectedMonth` (it's "this month's recurring vs one-off" and follows whatever month the user is viewing).

### `SpendingChart.jsx` — flow toggle

New internal state `flow: 'spent' | 'income' | 'saved' | 'net'` (default `'spent'`, not persisted across reloads — see Open Questions). Mirrors how `vendorFilter` and `collapsed` already live as internal state in this component. New chip strip `.flow-chips` inside `.spending-header`, between the title and the collapse button. Four chips, single-select, matching the existing `.spending-chip` visual language.

Bar values per flow:
- `'spent'` → `m.spent` (existing behavior, unchanged).
- `'income'` → `m.income`.
- `'saved'` → `m.saved`.
- `'net'` → `m.income - m.spent - m.saved` (computed inline; matches `getBillNet` semantics).

Vendor breakdown (the stacked `byVendor` segments + legend + per-vendor chips) only renders when `flow === 'spent'`. For other flows, each bar is a single solid color matching the existing flow accent (`#6BD49A` income, `#5B8DFF` saved, `#D4A853` net).

Daily drill-down is gated to `flow === 'spent'`. Clicking a non-Spent bar is a no-op; `enterDrill` early-returns. `aggregateByDay` is not extended.

### Dashboard Spent card — inline split

`SummaryCard` for Spent gains an optional `split` prop:
```js
<SummaryCard
  title="Spent"
  amount={selectedMonthSpent}
  colorKey="red"
  delta={monthDelta}
  split={spentSplit}  // { recurring, oneOff, total }
/>
```

When `split` is provided and `split.total > 0`, the card renders a thin stacked bar (`.spent-split-bar`) below the existing amount + delta, plus two tiny labels under the bar (`recurring $X / one-off $Y`). Other three cards (`Income`, `Saved`, `Net`) receive no split prop and render unchanged.

`spentSplit` is computed once in `App.jsx`:
```js
const spentSplit = useMemo(
  () => partitionSpentByRecurring(bills, selectedMonth, categoriesById),
  [bills, selectedMonth, categoriesById]
);
```

## Export — `exportArchive.js`

New module. Three pure functions + a `fflate` dependency. Co-located test file `exportArchive.test.js`.

### `data.json` shape

```json
{
  "schemaVersion": 3,
  "exportedAt": "2026-05-12T18:42:01.234Z",
  "appVersion": "1.0.0",
  "bills": [ /* every bill, including recurring and recurringChainId when present */ ],
  "categories": [ /* every category, including flow, keywords, templates, icon, color, builtin */ ],
  "trackedKeywords": [ /* array as stored in localStorage */ ]
}
```

- `schemaVersion` is the **data** schema version (currently `3`), not an export-wrapper version. If the data schema bumps, this field bumps. Adding new top-level keys to the export wrapper is backward-additive and does not require a separate version field.
- `exportedAt` is an ISO 8601 timestamp with millisecond precision.
- `appVersion` is imported from `package.json` (Vite supports `import pkg from '../package.json'` directly).
- Top-level keys serialized in the order shown — stable order matters when dad opens the file in a text editor.
- 2-space indentation (`JSON.stringify(obj, null, 2)`).
- `trackedKeywords` is read from the existing `billtracker-tracked-keywords` localStorage key and included as-is.
- Per-device UI prefs (`vendor-colors`, `chart-collapsed`, `undo-tip-seen`, `recurring-tip-seen`, `categories-v2-backup`) are **not** included — they're meaningless on another device.

### `items.csv` shape

UTF-8 with a leading BOM (`﻿`) so older Excel versions correctly detect the encoding.

Header row, then one row per item ordered by `date` ascending (chronological is the most useful pivot order). When two items share a date, source order is preserved (stable sort).

```
date,vendor,description,amount,category,flow,recurring
2026-05-02,Chase,Whole Foods,84.21,Groceries,expense,no
2026-05-12,Chase,"Whole Foods, refund",-40.00,Groceries,expense,no
2026-05-15,Acme,Gross pay,5200.00,Paycheck,income,yes
2026-05-15,Acme,401(k),260.00,401(k),savings,yes
2026-05-15,Honda Finance,Auto loan,470.00,Auto,expense,yes
```

- `date` uses `getItemDate(bill, item)` — items with null/missing dates fall back to `bill.month-01`.
- `amount` is always formatted with `toFixed(2)` so every row has exactly two decimal places. Refunds keep their negative sign (`-40.00`).
- `category` is the human-readable name resolved from `item.categoryId` via `categoriesById`. Items with `null` / unknown `categoryId` render as `Uncategorized`.
- `flow` is `income` / `expense` / `savings`, resolved from the category. Unknown categories fall back to `expense` (matching aggregator behavior).
- `recurring` is `yes` / `no` derived from `bill.recurringChainId != null`. Strings rather than booleans render more cleanly in Excel.
- Standard CSV escaping: any field containing comma, double-quote, or newline is wrapped in `"..."` with internal quotes doubled (`"` → `""`).
- Items with `amount === 0` are skipped (defensive — should not exist post-v3 migration since `validateResponse` rejects them).

### `buildArchive` — ZIP packaging

```js
import { zipSync, strToU8 } from 'fflate';

const archive = zipSync({
  'data.json': strToU8(jsonString),
  'items.csv': strToU8('﻿' + csvString),
});
const blob = new Blob([archive], { type: 'application/zip' });
```

Synchronous `zipSync` is fine — typical archive is well under 1 MB even after years of bills. `fflate` is ~15 KB minified, zero dependencies, supports both browser and Node (so tests work without mocking).

Filename: `billtracker-YYYY-MM-DD.zip` matching the current export's naming. Browser handles same-day collisions by auto-appending `(1)`, `(2)`, etc. — no app-level logic needed.

### Three pure functions

- `buildDataJson(bills, categories, trackedKeywords, schemaVersion, appVersion, now) → string`
- `buildItemsCsv(bills, categoriesById) → string`
- `buildArchive({ bills, categories, trackedKeywords, schemaVersion, appVersion, now }) → Uint8Array`

`App.jsx`'s `exportData` becomes:
```js
const exportData = () => {
  const bytes = buildArchive({
    bills,
    categories: cats.categories,
    trackedKeywords: trackedKeywords,
    schemaVersion: 3,
    appVersion: APP_VERSION,
    now: new Date(),
  });
  const blob = new Blob([bytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `billtracker-${new Date().toISOString().split('T')[0]}.zip`;
  a.click();
  URL.revokeObjectURL(url);
};
```

## Files Touched

| File | Status | What changes |
|---|---|---|
| `src/reportingMath.js` | **new** | `aggregateYoYByCategory`, `aggregateMonthByCategory`, `partitionSpentByRecurring` |
| `src/reportingMath.test.js` | **new** | Unit tests for the three aggregators |
| `src/ReportsScreen.jsx` | **new** | Full-screen view with three tabs |
| `src/ReportsScreen.test.jsx` | **new** | Tab switching, empty states, table/chart content |
| `src/exportArchive.js` | **new** | `buildDataJson`, `buildItemsCsv`, `buildArchive` |
| `src/exportArchive.test.js` | **new** | JSON shape, CSV escaping, zip roundtrip |
| `src/App.jsx` | modified | Toolbar `📊 Reports` button, `'reports'` screen branch, `partitionSpentByRecurring` call wired into Spent `SummaryCard`, `exportData` rewritten to call `buildArchive` + Blob download |
| `src/SpendingChart.jsx` | modified | Flow chip strip in header, per-flow bar rendering, vendor breakdown gated to Spent, drill-down gated to Spent |
| `src/SpendingChart.test.jsx` | modified | Flow toggle behavior + drill-down gating |
| `src/App.css` | modified | `.reports-screen`, `.reports-tabs`, `.reports-tab`, `.yoy-table`, `.flow-chips`, `.spent-split-bar`, `.btn-reports` |
| `package.json` | modified | Add `fflate` dependency |

No changes to `spendingMath.js`, `useCategories.js`, `initializeFromStorage.js`, the category/recurring screens, or any localStorage keys.

### LocalStorage keys

No new keys. No existing keys change shape. Schema version stays at `3`.

## Testing Strategy

Co-located vitest tests, matching the existing pattern.

### Unit tests (`reportingMath.test.js`)

**`aggregateYoYByCategory`**
- With today fixed at `2026-05-12`: currentYTD covers Jan–May 2026, priorYTD covers Jan–May 2025.
- Refunds (negative amounts) reduce within their category.
- `deltaPct === null` when `priorYTD === 0` (no apples-to-apples comparison).
- Rows sorted by flow (income → expense → savings), then `currentYTD` desc within each flow.
- Categories with both totals at zero are omitted.
- Items with `null` / unknown `categoryId` are skipped, not aggregated under "Uncategorized."
- Renaming a category between Jan 2025 and May 2026 doesn't affect the comparison — match is by `categoryId`.

**`aggregateMonthByCategory`**
- Returns exactly 12 buckets matching `getMonthWindow(endMonth)`.
- `categoryId` not present in any item → 12 zeros.
- Refunds subtract within their month.
- Items spanning multiple bills in the same month sum correctly.

**`partitionSpentByRecurring`**
- Bills with `recurringChainId` truthy → recurring bucket.
- Bills without (`undefined` or `null`) → one-off bucket.
- Income and savings flows excluded from both buckets.
- Refunds reduce within their bucket.
- Empty input → `{ recurring: 0, oneOff: 0, total: 0 }`.
- `total === recurring + oneOff` (invariant).

### Export tests (`exportArchive.test.js`)

**`buildDataJson`**
- Returns parseable JSON.
- Top-level keys in declared order: `schemaVersion`, `exportedAt`, `appVersion`, `bills`, `categories`, `trackedKeywords`.
- `schemaVersion` is the input integer.
- `exportedAt` is the input timestamp formatted as ISO 8601.
- Bills and categories are byte-identical to the inputs (no transformation).
- `trackedKeywords` round-trips.

**`buildItemsCsv`**
- Starts with `﻿` BOM.
- First line is the expected header.
- Rows sorted by `date` ascending; stable on tie.
- Description containing comma, double-quote, or newline is wrapped in `"..."` and internal quotes doubled.
- `amount` formatted with `toFixed(2)` (e.g., `84.00` not `84`).
- Negative amounts preserved (`-40.00`).
- `recurring` is `yes` for bills with `recurringChainId`, `no` otherwise.
- `category` resolves human-readable name; null/unknown `categoryId` renders `Uncategorized`.
- `flow` resolves from category; null/unknown falls back to `expense`.
- Item with null/missing `date` uses `bill.month-01`.
- Items with `amount === 0` are skipped.

**`buildArchive`**
- Returns a `Uint8Array`.
- `fflate.unzipSync` on the bytes yields exactly two entries: `data.json` and `items.csv`.
- `data.json` content round-trips through `JSON.parse` → equals input data.
- `items.csv` content starts with `﻿` BOM and the header row.

### Component tests (`ReportsScreen.test.jsx`)

- Three tabs render; clicking each switches the visible content.
- Tab `<button role="tab">` elements have correct `aria-selected` for the active tab.
- ESC closes the screen.
- Close-button click closes the screen.
- YoY tab with empty data → "Not enough history yet" empty state.
- YoY tab with seeded data → rows render in expected order; missing prior shows `—`.
- Month trend tab → picker change updates the chart values.
- Month trend tab → default selected category is the first expense-flow category.
- Recurring breakdown tab → header bar reflects the partition; per-chain rows match `findAutoRecurringChains` output.
- Recurring breakdown tab with zero chains → partition still renders (100% one-off) + empty-state message below.

### Component tests (`SpendingChart.test.jsx` extending)

- Flow chip click sets the active chip + bars use that flow's values (assert against fixture data).
- Vendor legend + per-vendor chips hidden when `flow !== 'spent'`.
- Bar color matches flow accent (green / blue / amber / default) for non-Spent flows.
- Clicking a bar when `flow !== 'spent'` is a no-op (drill state unchanged).

### Integration smoke (extending `__smoke__/setup.test.jsx`)

- Seed 13 months of mixed-flow data plus one recurring Honda Finance chain. Mount → click toolbar `📊 Reports` →
  - YoY tab shows current vs prior YTD rows correctly.
  - Switch to Month trend → category picker → bar values correct.
  - Switch to Recurring breakdown → Honda Finance row present.
- Trigger export → spy on `URL.createObjectURL` to capture the Blob → unzip via `fflate.unzipSync` → assert both `data.json` and `items.csv` are present with expected first-row content.

### Deliberately not tested

- Visual regression of report tables, flow-chip styling, drill-down disabled feedback — manual browser smoke before merge.
- Performance with thousands of bills — aggregators are O(items); profile if it matters.
- Cross-tab localStorage sync — single-tab app.
- ZIP integrity at extreme sizes — fflate is well-tested upstream.

## Implementation Order

Each numbered step is a clean commit (or small commit group), matching the A/B/C cadence.

1. `fflate` dependency. `exportArchive.js` with `buildDataJson` + `buildItemsCsv` + `buildArchive` + tests. No UI yet.
2. Wire `buildArchive` into `App.jsx`'s `exportData` — replace the bare `JSON.stringify` path. Manual browser smoke: ZIP downloads, contents look right.
3. `reportingMath.js` — three aggregators + tests.
4. Dashboard Spent card inline split — `partitionSpentByRecurring` wired into `SummaryCard` via new `split` prop. Visual + interaction smoke.
5. `ReportsScreen.jsx` skeleton + toolbar `📊 Reports` button + screen routing. Empty tabs render; ESC + close work.
6. YoY tab content + table styling + empty state.
7. Month trend tab content + category picker.
8. Recurring breakdown tab content + empty state.
9. SpendingChart flow toggle (chip strip + per-flow rendering + drill-down gating) + tests.
10. Integration smoke + manual browser smoke before declaring D done.

## Out-of-Scope but Worth Naming for E and Later

- **Sub-project E (budgets).** Per-category monthly caps with progress treatment on the dashboard. Likely adds a `budgets` slice to `data.json` (backward-additive). YoY report could overlay budget targets. The export schema is already prepared for this — adding a top-level `budgets` array is the additive path.
- **Import / restore.** A future sub-project consumes `data.json` to restore state on another device. The schema chosen here (schemaVersion at root, ordered top-level keys, additive shape) is import-friendly. CSV is archival-only by design.
- **Per-chain change history report.** "Honda Finance: $452 → $470 in March." Data is in the bill list; the visualization (per-chain sparkline + change events) is a v2 reporting surface.
- **Daily drill-down for non-Spent flows.** Would require generalizing `aggregateByDay` to accept a flow filter and surface it. Useful for "which day did I get paid?" but a small addition; defer until asked.
- **YoY for non-monthly cadences.** Bi-weekly paychecks already aggregate to monthly buckets; "quarter-over-quarter" or "rolling-12-month" comparisons are real future work but not v1.

## Open Questions (none blocking)

- Whether the Recurring breakdown tab should also surface inferred (non-auto) recurring patterns — currently it shows only `findAutoRecurringChains` (the explicit auto-managed chains from sub-project C). Inferred patterns already live in the dashboard's three Recurring panels, so duplicating them here might add noise. Revisit if the tab feels incomplete during dogfooding.
- Whether the YoY table should support a "show only categories with non-zero current period" filter. Currently a row is shown if either period has non-zero data — this surfaces categories that were active last year but dormant this year, which is arguably useful (a "you stopped spending here" signal). Revisit if the table feels noisy.
- Whether the SpendingChart's flow toggle should persist across reloads (like `chart-collapsed` does). Currently it resets to `'spent'` on each load. Persistence is a one-line localStorage addition if the default feels wrong in practice.
