# Monthly Totals by Item Date — Design

Date: 2026-05-10
Status: Approved

## Problem

The "This Month" stat card, the previous-month delta, and the Categories panel all currently compute monthly figures by filtering whole **bills** by `bill.month` and summing every item in those bills. If a March-statement bill contains items dated February, those Feb amounts are wrongly credited to March and February shows `$0`.

The `SpendingChart` (via `aggregateByMonth`) correctly attributes per-item using `getItemDate(bill, item)`. The fix is to bring the stat cards and Categories panel onto the same attribution rule.

## Design

Add one helper to `src/spendingMath.js`:

```js
export function getMonthItems(bills, month) {
  const out = [];
  for (const bill of bills || []) {
    for (const item of bill.items || []) {
      if (!item) continue;
      if (getItemDate(bill, item).slice(0, 7) === month) {
        out.push(item);
      }
    }
  }
  return out;
}
```

Then in `BillTracker` (`App.jsx`):

- Replace `selectedMonthTotal` computation with:
  ```js
  const selectedMonthItems = getMonthItems(bills, selectedMonth);
  const selectedMonthTotal = selectedMonthItems.reduce((s, i) => s + i.amount, 0);
  ```
- Replace `previousMonthTotal` likewise with `getMonthItems(bills, previousMonth)`.
- Keep `monthBills = bills.filter(bill => bill.month === selectedMonth)` because the **bills list** still groups by statement (bill.month). That's intentional and unchanged.

In `CategoryBreakdown`:

- Change the prop from `bills` to `items`. The caller passes a pre-filtered items array.
- Iterate `items.forEach(item => ...)` instead of `bills.forEach(bill => bill.items.forEach(...))`.

In the `CategoryBreakdown` call site in `BillTracker`'s render:

```jsx
<CategoryBreakdown
  items={searchActive ? visibleBills.flatMap(b => b.items) : selectedMonthItems}
  selectedMonth={searchActive ? null : selectedMonth}
/>
```

`selectedMonth={null}` (search mode) still signals to skip the month label and just show breakdown of the items list — unchanged behavior.

## What stays the same

- Bills list (`visibleBills.map(<BillCard>)`) — still filtered by `bill.month` so the March statement appears under March.
- "Total Expenses" card (sums everything, no month filter).
- "Total Bills" card (counts bills, not items).
- `SpendingChart`, `TrackedPanel` (`aggregateByKeyword`), `Subscriptions` (`findRecurringCharges`) — already use `getItemDate`.

## Tests

Add to `src/spendingMath.test.js`:

1. Cross-month items in a single bill are attributed to their item-date month, not the bill month.
2. Items missing `item.date` fall back to `bill.month-01` (and thus the bill's month).
3. Empty `bills` array returns `[]`.
4. Bills with empty/missing `items` return `[]` (no crash).
5. `null`/`undefined` items in the array are skipped without crashing.

## Affected files

| File | Change |
|---|---|
| `src/spendingMath.js` | Add `getMonthItems(bills, month)` export (~10 lines) |
| `src/spendingMath.test.js` | Add unit tests for `getMonthItems` (~25 lines) |
| `src/App.jsx` | Import `getMonthItems`. Replace inline `selectedMonthTotal` / `previousMonthTotal` computation. Change `CategoryBreakdown` prop from `bills` to `items` and update the component body. Update the render call site. (~15 lines changed) |

No new files. No new dependencies. No changes to spendingChart, TrackedPanel, Subscriptions, or the bills list.

## Risks

- Changing `CategoryBreakdown`'s prop signature is a breaking change, but only one call site in this codebase uses it. Audited.
- `getMonthItems` returns raw item references; callers must not mutate. (Same convention as elsewhere in the file.)
