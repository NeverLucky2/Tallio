# Multi-Month Bills — Design

**Status:** Draft for review
**Date:** 2026-05-13
**Branch baseline:** `feat/reporting-and-export` (sub-project D, post-D)

## Goal

When a bill's items span more than one calendar month, the bill should appear in **every** month it touches. Clicking February on the SpendingChart should surface every bill that contributed to February's spending — including bills anchored to other months whose items happen to fall in February.

Example: a credit-card statement covering Feb 15 → Mar 4 should show up in both February's and March's dashboard, instead of only its single "anchor" month.

## Non-goals

- Multi-month *recurring patterns* (a bill that always straddles month-end as a defined pattern). The change makes any bill multi-month if its items span months; it does not introduce a new "two-month chain" concept.
- Splitting amounts proportionally across months. Per-item attribution already gives correct totals.
- Server-side or indexed queries against bill months. Personal-data scale; in-memory derivation is fine.
- Schema version bump or any change to the export format.

## Architectural approach

**Pure derivation, no schema change.** `bill.month` keeps its slot on the data record, but its semantics are reframed:

> `bill.month` is the *anchor month* — used as the effective date for items without a `date`, and as the sole month the bill belongs to when no items are dated.

The set of months a bill participates in is computed on demand from items + anchor. No new persisted field. Schema stays at v3. `migrateBills` is unchanged. Existing single-month bills behave identically.

**Trade-off accepted:** filter operations scan items per bill. At personal-data scale (hundreds of bills, ~20 items each) this is microseconds. Not worth caching.

---

## Section 1 — Data model & pure helpers

Add four helpers to `src/spendingMath.js`. All pure functions; null-safe; testable in isolation.

### `getPrimaryMonth(bill)`

Returns the bill's anchor / earliest month. Used for sorting bills and as the home for items without dates.

```js
export function getPrimaryMonth(bill) {
  let earliest = null;
  for (const item of (bill?.items) || []) {
    if (typeof item?.date === 'string' && DATE_RE.test(item.date)) {
      const m = item.date.slice(0, 7);
      if (earliest === null || m < earliest) earliest = m;
    }
  }
  return earliest ?? bill?.month ?? currentMonth();
}
```

### `getBillMonths(bill)`

Returns the `Set<string>` of months the bill participates in.

```js
export function getBillMonths(bill) {
  const months = new Set([getPrimaryMonth(bill)]);
  for (const item of (bill?.items) || []) {
    if (typeof item?.date === 'string' && DATE_RE.test(item.date)) {
      months.add(item.date.slice(0, 7));
    }
  }
  return months;
}
```

### `getLatestMonth(bill)`

Returns the max month the bill spans. Used by recurring-chain logic.

```js
export function getLatestMonth(bill) {
  let latest = getPrimaryMonth(bill);
  for (const item of (bill?.items) || []) {
    if (typeof item?.date === 'string' && DATE_RE.test(item.date)) {
      const m = item.date.slice(0, 7);
      if (m > latest) latest = m;
    }
  }
  return latest;
}
```

### `getBillItemsForMonth(bill, month)`

Projects a bill onto a single month for the per-month card slice. Dated items match by their month; dateless items only appear in the primary month.

```js
export function getBillItemsForMonth(bill, month) {
  const primary = getPrimaryMonth(bill);
  return (bill?.items ?? []).filter(item => {
    if (typeof item?.date === 'string' && DATE_RE.test(item.date)) {
      return item.date.slice(0, 7) === month;
    }
    return month === primary;
  });
}
```

### Invariant

`getItemDate(bill, item)` (existing) returns `item.date || \`${bill.month}-01\``. This still returns a correct effective date under the new model and is unchanged. The new helpers compose on top of it.

---

## Section 2 — UI changes (`src/App.jsx`)

### Bill list filter

Replace the single-month filter (App.jsx line 721):

```js
// before
const monthBills = bills.filter(bill => bill.month === selectedMonth);

// after
const monthBills = bills.filter(bill => getBillMonths(bill).has(selectedMonth));
```

### Bill card — collapsed header

The collapsed card shows the **per-month slice**: sliced items, sliced total, and a span indicator when multi-month.

| Element | Today | After |
|---|---|---|
| Item count | `bill.items.length` | `getBillItemsForMonth(bill, selectedMonth).length` |
| Total badge | sum of all items | sum of items in `getBillItemsForMonth(bill, selectedMonth)` |
| Meta line | `formatMonth(bill.month)` | When `getBillMonths(bill).size === 1`: unchanged. When multi-month: `${formatMonth(getPrimaryMonth(bill))} → ${formatMonth(getLatestMonth(bill))}` |

A 3+-month bill still reads sensibly because the helpers always return min/max of the set, not the second-or-middle month.

### Bill card — expanded body

**Shows all items**, regardless of `selectedMonth` — your "full bill, all items" choice. No filtering inside the expanded view. This guards against hidden-edit traps (don't let a user delete items they can't see).

The existing `<input type="month">` wired to `bill.month` remains. Add a `title` tooltip relabeling it: "Anchor month — where items without dates live, and the bill's home month when no items are dated."

### Sort order

No change. The dashboard renders `monthBills` in array order today; this design preserves that. If display order ever needs to be explicit, it's a separate change.

### Add Item default date

When the user clicks `+ Add Item` inside an expanded bill while viewing a month that isn't the bill's primary, default the new item's `date` to `${selectedMonth}-01` so it lands where the user expects:

```js
// inside addItem in App.jsx (line 197)
const newItem = {
  id: Date.now(),
  description: "",
  amount: 0,
  categoryId: defaultCategoryId,
  date: selectedMonth !== getPrimaryMonth(bill) ? `${selectedMonth}-01` : null,
};
```

Single-month bills are unaffected (`selectedMonth === getPrimaryMonth(bill)` in that case, so `date: null` as today).

This requires `BillCard` to receive `selectedMonth` as a prop. It already does indirectly through other paths; add explicitly if not.

---

## Section 3 — Recurring chain interactions (`src/spendingMath.js`)

### `findRecurringCharges` — no change

Already groups items by `getItemDate(bill, item).slice(0,7)` (line 156-160). Per-item attribution means a multi-month bill already contributes correctly.

### `computeCatchUp` — four edits

| Line | Today | After |
|---|---|---|
| 449 (sort for latest) | `(a.month ?? '').localeCompare(b.month ?? '')` | sort by `getLatestMonth(b)` so a Feb-Mar bill outranks a Feb-only one |
| 458 (target months) | `monthsBetweenExclusiveInclusive(source.month, todayMonth)` | `monthsBetweenExclusiveInclusive(getLatestMonth(source), todayMonth)` |
| 461 ("already in chain") | `b.recurringChainId === chainId && b.month === targetMonth` | `b.recurringChainId === chainId && getBillMonths(b).has(targetMonth)` |
| 466 (conflict bill check) | `b.month === targetMonth && b.vendor === source.vendor && b.recurringChainId !== chainId` | `getBillMonths(b).has(targetMonth) && b.vendor === source.vendor && b.recurringChainId !== chainId` |

### `findAutoRecurringChains` — three edits

| Line | Today | After |
|---|---|---|
| 551 (sort by latest) | `(a.month ?? '').localeCompare(b.month ?? '')` | sort by `getLatestMonth(b)` |
| 581 (month count) | `new Set(sorted.map(b => b.month))` | `new Set(sorted.flatMap(b => [...getBillMonths(b)]))` |
| 594-595 (`firstDate` / `lastDate`) | `${sorted[0].month}-01` / `${latest.month}-01` | `${getPrimaryMonth(sorted[0])}-01` / `${getLatestMonth(latest)}-01` |

### Spawn behavior — unchanged

`shiftItemDate(date, targetMonth)` collapses every item to `targetMonth` preserving day-of-month. A multi-month source bill spawned to a new month produces a single-month spawn. This is acceptable: catch-up is "start a fresh chain instance for one month"; the user can edit dates afterward if a continuing two-month pattern is desired.

### Chain-active rule — preserved

"Latest overall instance must be `recurring=true`." Still works — "latest" now resolves to the bill with the greatest `getLatestMonth`.

### Cross-month duplicate strips recurring fields — preserved

Existing rule unchanged. Duplicates remain clean single-month copies.

---

## Section 4 — Edge cases & visual details

### Multi-month visual indicator

When `getBillMonths(bill).size > 1`:

- **Collapsed card meta line:** `Feb 2026 → Mar 2026 · 1 item`
- **Expanded body header:** same `Feb 2026 → Mar 2026` text next to the anchor-month input

Single-month bills keep the existing `Feb 2026 · 3 items` format. The `→` arrow signals span at a glance; no new component or CSS variable required beyond a small style for the arrow's visual weight.

### Duplicate Bill (existing flow)

`shiftItemDate` collapses items to the target month — duplicates of a multi-month source become single-month at the target. **No code change.** Documented behavior, not a regression: the duplicate gesture is "fresh instance," and editing one item's date afterward turns it multi-month again.

### `SpendingChart.jsx` vendor list (line 71-86)

Replace:

```js
if (!window.has(b.month)) continue;
```

with:

```js
if (![...getBillMonths(b)].some(m => window.has(m))) continue;
```

So a Feb-Mar bill surfaces its vendor when the 12-month window covers either month.

### Already-correct (no change needed)

- `aggregateByMonth`, `aggregateByDay`, `aggregateByKeyword`, `getMonthItems` — per-item via `getItemDate`
- All Reports tabs (`aggregateYoYByCategory`, `aggregateMonthByCategory`, `partitionSpentByRecurring`) — per-item math
- Export `items.csv` — uses `getItemDate`
- Export `data.json` — round-trips raw `bill.month` + items, no derived fields

### Tests

**New** (in `src/spendingMath.test.js`):
- `getPrimaryMonth`: no items / all dateless / all dated / mixed / empty bill → uses fallback chain correctly
- `getBillMonths`: single month / two months / three months / null bill / no items / dateless items only
- `getLatestMonth`: same coverage as `getBillMonths`
- `getBillItemsForMonth`: dateless items appear only in primary; dated items match their month exactly

**Updated** (`src/spendingMath.test.js`):
- `computeCatchUp`: source bill is multi-month → catch-up targets begin after `getLatestMonth(source)`; "already in chain" check considers spans; conflict check considers spans
- `findAutoRecurringChains`: `monthCount` reflects spanned months; `lastDate` reflects `getLatestMonth(latest)`

**Updated** (`src/__smoke__/setup.test.jsx`):
- End-to-end: render a bill with items spanning two months, assert the bill card appears in both month views with per-month-sliced totals.

**No change needed:**
- `reportingMath.test.js` — per-item math
- `exportArchive.test.js` — schema unchanged
- `initializeFromStorage.test.js` — `migrateBills` unchanged

### Migration

- Schema version stays at **3**. `migrateBills` is unchanged.
- Existing single-month bills behave identically (their `getBillMonths` is `{bill.month}` — same filter result).
- Existing bills whose items happen to span months will *silently start appearing* in additional months. This is the desired behavior fix.
- No localStorage key changes. No new persisted fields.

---

## Files touched (summary)

| File | Change |
|---|---|
| `src/spendingMath.js` | + `getPrimaryMonth`, `getBillMonths`, `getLatestMonth`, `getBillItemsForMonth`; edits to `computeCatchUp` and `findAutoRecurringChains` |
| `src/spendingMath.test.js` | New tests for helpers; multi-month cases for catch-up + chains |
| `src/App.jsx` | Bill list filter; bill card collapsed-header per-month slice + span indicator; sort order; Add Item default date |
| `src/App.css` | Small style for `→` span indicator if needed (likely just a `.bill-meta-arrow` color) |
| `src/SpendingChart.jsx` | Vendor list window check |
| `src/__smoke__/setup.test.jsx` | Multi-month smoke test |

No changes to: `reportingMath.js`, `exportArchive.js`, `useCategories.js`, `RecurringConflictDialog.jsx`, `DuplicateBillDialog.jsx`, `BillItem.jsx`.

## Risks

- **Visual regression on the collapsed card:** the sliced total replaces the full-bill total. Users who memorize "Acme was $100 last month" may briefly see "Acme $60" on Feb and think money was lost. The span indicator (`Feb → Mar`) and the expanded view should clarify; document briefly in any release notes.
- **Recurring chain "latest" reordering:** if a user already had a Mar-only recurring bill and later edits an item to push it into April, the bill's `getLatestMonth` becomes April, and catch-up's next target shifts. This is correct behavior but may surprise on first encounter.
- **`+ Add Item` date default change:** the new default (`${selectedMonth}-01` for cross-month cases) is intentional but a behavior change. Worth a quick smoke check that the date input is still editable to `null`.
