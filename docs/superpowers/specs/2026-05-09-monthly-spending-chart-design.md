# Monthly spending chart with per-transaction dates

## Problem

The bill tracker currently stores one date per bill. For credit card statements, the user wants to see when within a month spending happened (which weeks were heaviest) and compare totals across cards. The current sidebar "Spending" panel only shows category totals — there is no time-based view and no way to filter by card.

## Goals

- Capture a date for every transaction parsed by OCR, not just one date per bill.
- Visualize spending across months and within a month.
- Filter the visualization by card (currently called "vendor" in the data model).
- Treat each bill as one calendar month of credit-card transactions.

## Non-goals

- Year navigation beyond a rolling 12-month window.
- Category filtering inside the new chart (the existing categories panel covers that).
- Side-by-side multi-card comparison views beyond the stacked-bar treatment.
- Restricting items to dates that fall inside the bill's month (statement cycles can span months).

## Data model

### Bill

- `date` (string `YYYY-MM-DD`) is replaced by `month` (string `YYYY-MM`). Semantically: the statement month.
- All other fields unchanged.

### Item

- New optional field `date` (string `YYYY-MM-DD`). May be `null` or missing.
- All other fields unchanged.

### Migration

Migration runs once when bills are first read from `localStorage`:

- If `bill.date` exists and `bill.month` does not, set `bill.month = bill.date.slice(0, 7)` and remove `bill.date`.
- Items with no `date` are left as-is; the display layer applies the fallback (`${bill.month}-01`) on the fly. Items are not rewritten in storage.

The migration writes back to `localStorage` so subsequent loads start from the new shape. If migration produces an invalid `month` (non-`YYYY-MM`), the bill is set to the current month (`new Date().toISOString().slice(0, 7)`).

### Effective item date

A helper `getItemDate(bill, item)` returns:
- `item.date` if it is a valid `YYYY-MM-DD` string;
- otherwise `${bill.month}-01`.

All chart aggregation and "this month" math goes through this helper.

## OCR prompt (`billExtractor.js`)

Update the JSON schema in `PROMPT` so each item carries an optional date:

```json
{
  "vendor": string | null,
  "month": string | null,
  "items": [
    { "description": string, "amount": number, "date": string | null }
  ]
}
```

Prompt rules to add:
- For credit-card statements, the bill `month` is the statement period; each item `date` is the transaction's posting or purchase date in `YYYY-MM-DD` (use the statement year if the printed date omits it).
- For single-purchase receipts, item `date` matches the receipt date.
- Use `null` for `date` if it cannot be read.
- `month` is `YYYY-MM` if readable, else `null`.

`validateResponse` updates:
- Returns `month` (string `YYYY-MM`) instead of `date`. If the model returns a `YYYY-MM-DD`, truncate to `YYYY-MM`.
- Each item's `date` is included if it matches `YYYY-MM-DD`; otherwise dropped (becomes `null`).

`handleCapture` in `App.jsx` writes the new bill with `month` instead of `date`. If `month` is null, defaults to the current month.

## SpendingChart component

A new full-width panel sits **above** the existing bills/sidebar grid. Layout shifts from a two-column main grid to a stacked layout: chart panel on top, then bills + sidebar below.

### Filter chips

- Chip row at the top of the panel: `All` chip first, then one chip per distinct vendor across all bills (sorted alphabetically).
- Active chip uses the accent green (matching existing UI tokens).
- Inactive chips use a muted background.
- When `All` is active: each bar is stacked by card-color segments and a small legend strip appears below the chips (`■ Chase  ■ Amex  …`).
- When a specific card is active: bars are solid in that card's color; no legend.

### Card colors

- Derived deterministically from the vendor name via a stable string hash → indexed into a fixed palette of 8 distinct hues that contrast on the dark background.
- A pure helper `getVendorColor(vendor)` returns the color so the legend, bars, and any future use stay in sync.

### Monthly view (default)

- 12 bars, one per calendar month, oldest on the left, current month on the right.
- Y-axis is implicit (max bar = 100% height); the highest bar is highlighted.
- Hover/tap a bar shows a tooltip: month label + total + per-card breakdown if `All` is active.
- Tap a bar enters daily view for that month.
- Empty months show a thin baseline so the gap is visible.

### Daily view

- Header row: back arrow ← on the left returns to monthly view; month label centered; arrow buttons ‹ › on the right step to previous/next month (within the 12-month window).
- One bar per day for the selected month (28–31 bars).
- Same stacked vs solid rule as monthly view.
- Tooltip: full date + total + per-card breakdown if `All` is active.

### Empty state

- When there are zero bills total: panel shows "Scan a bill to see your spending here." centered.
- When the chart has bills but the active card filter has no items: shows "No spending recorded for {card}."

## BillItem row

Each transaction row gets a `<input type="date">` between the description and category controls.

- Desktop layout: row order becomes `icon | description | date | category | amount | delete`.
- Mobile layout: top row stays `icon + description + delete`; bottom row becomes `date | category | amount` (date sits to the left of category).
- The date input shows `getItemDate(bill, item)` as its value if `item.date` is missing, but only writes to `item.date` when the user actively changes it (so we don't silently materialize fallbacks).

## BillCard header

- Replaces the bill-detail "date" input with `<input type="month">` bound to `bill.month`.
- The card header subtitle uses a new `formatMonth(month)` helper returning e.g. "May 2026" instead of "May 9, 2026."

## CategoryBreakdown panel

- Stays in the sidebar.
- Title changes from "Spending" to "Categories" so the new full-width panel can own the "Spending" name.
- No internal changes.

## SummaryCard "This Month"

- Recompute using `getItemDate(bill, item)` per item rather than `bill.date`.
- An item counts toward "this month" if `getItemDate` falls in the current calendar month, regardless of which bill it belongs to.

## File layout

- `App.jsx` — wire the new panel above the main grid, update `BillCard`/`BillItem` props and rendering, replace `bill.date` references with `bill.month`, update "this month" math.
- `App.css` — add styles for the chart panel, bar groups, chip row, legend, tooltip.
- `billExtractor.js` — prompt update + `validateResponse` shape change + return `month` in addition to (or instead of) `date`.
- `billExtractor.test.js` — update tests for new shape; add tests covering item date parsing and `month` truncation.
- New file `src/spendingMath.js` — pure helpers: `getItemDate`, `getVendorColor`, monthly/daily aggregation. Easy to unit-test in isolation; keeps `App.jsx` from growing further.
- New file `src/spendingMath.test.js` — unit tests for the helpers.
- New file `src/SpendingChart.jsx` — the chart component (presentational, takes `bills` and renders).

The split into `spendingMath.js` + `SpendingChart.jsx` is a deliberate boundary: math is testable without rendering, the component is dumb and easy to swap or restyle. `App.jsx` is already large; we don't want to add another 300 lines of chart logic to it.

## Edge cases

- Bill with zero items, or all items zero-amount: bill is excluded from chart aggregations.
- Items whose `getItemDate` falls outside the rolling 12-month window: not rendered in the chart.
- Items dated in a different calendar month than the bill's `month`: aggregated by item date, not bill month.
- Future-dated items: aggregated normally; no special handling.
- Single bill with one card: `All` and that card's chip both show the same data — that's fine.
- Vendor name changes (user edits a card name): chips re-derive on next render; existing bills still appear under the new name.

## Testing

- Unit tests cover: `getItemDate` fallback, `getVendorColor` stability, monthly aggregation, daily aggregation, 12-month rolling window cutoff, items outside bill's month aggregating to their own date.
- Manual verification: scan a credit-card bill image, confirm Haiku returns per-item dates, confirm chart updates, drill into a month, switch chips, edit an item date in the row, edit the bill's month.
