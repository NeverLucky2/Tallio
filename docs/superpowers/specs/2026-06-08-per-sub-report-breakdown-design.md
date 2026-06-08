# Per-sub Report Breakdown (3b) — Design

> Branch 3b of the splits/category fixes batch. Branch 3a (assignable sub-categories + searchable tree picker) is DONE/merged; transactions and split lines now carry an optional `subId` (the `categoryId` stays the **parent**, so reports already roll subs up under the parent). 3b makes that roll-up **expandable**: the Reports "Spending by category" panel can drill into each category's per-sub breakdown.

**Goal:** On the Reports screen's "Spending by category" panel, let the user expand a category to see how its spending splits across its sub-categories, with the unsubbed remainder shown explicitly so the sub rows reconcile exactly to the parent total.

**Scope:** Reports screen only (`ReportsScreen` → `CategoryBarList`, fed by `spendingByCategory`). Purely additive — existing report numbers and panels are unchanged.

**Branch:** `per-sub-report-breakdown-3b` (off `master`; spec + plan committed here, then inline TDD).

---

## Decisions (locked)

1. **Interaction:** expandable rows. Each parent category bar that has sub-spending gets a chevron (▸ collapsed / ▾ expanded). Clicking toggles indented sub-bars beneath it. Parents-only by default keeps the panel compact.
2. **Reconciliation:** when expanded, show each sub with spending (amount desc) **plus an explicit `(no sub-category)` bucket** for the parent's unsubbed spending, so sub rows always sum exactly to the parent `total`. (Matters for the meticulous-father audience who reconciles to the dollar.)
3. **Which categories are expandable:** only categories that have **at least one sub with spending in the current period/scope**. Categories with no sub-spending render flat, exactly as today (no chevron).
4. **Expand state:** local component state, collapsed by default, **not persisted** (resets when Reports closes).
5. **Sub scaling:** each sub's mini-bar is scaled **within the parent** (`sub.total / parent.total`), so the sub bars visually fill the parent. The parent bar itself stays scaled against the global category max (unchanged).
6. **Sub appearance:** subs have no own color/icon in the data model, so sub bars reuse the **parent's color**; the `(no sub-category)` row uses a muted/desaturated fill.

**Out of scope (explicit):** the currently-unused `CategoryBreakdown.jsx` (not rendered in production); per-sub drill-in or click-to-filter; any change to Income/Savings/Cash-flow/Net-worth panels; persisting expand state; per-sub color/icon.

---

## Architecture

**Approach:** extend `spendingByCategory` to **attach** a `subs` array to each category entry, rather than adding a separate `spendingBySubcategory` function. The expandable UI needs parent + subs together, nesting keeps one already-reconciling source of truth, and existing return fields stay untouched (additive — current consumers/tests unaffected).

Two pure-layer changes, one component change, one stylesheet change. No `ReportsScreen` change.

### Data flow

```
transactions ──flattenForReports──▶ virtual rows (now carry subId)
                                          │
                          spendingByCategory(rows, categoriesById, opts)
                                          │
              [ { categoryId, name, icon, color, total, pct, subs:[…] }, … ]
                                          │
                                   CategoryBarList (expand/collapse)
```

---

## Data layer — `src/reportsModel.js`

### 1a. `flattenForReports` carries `subId`

Today the generator drops `subId` when exploding splits. Add it to the yielded split row:

```js
yield {
  id: `${t.id}#${s.id}`,
  accountId: t.accountId,
  date: t.date,
  payee: t.payee,
  description: s.description || t.description,
  categoryId: s.categoryId,
  subId: s.subId ?? null,   // NEW — was dropped
  amount: s.amount,
  transferId: null,
  _parentId: t.id,
  _splitId: s.id,
};
```

Non-split rows are yielded as-is and already carry `t.subId` when present. Adding the field is additive — `incomeExpenseSummary`, `cashFlowByMonth`, etc. ignore it.

### 1b. `spendingByCategory` attaches `subs`

Keep every current entry field (`categoryId, name, icon, color, total, pct`) unchanged. Additionally, for each category entry, compute a `subs` array:

- Group the category's expense-flow rows by `subId`. A row's effective sub key is its `subId` **only if** that id matches a sub in the parent category's `subcategories`; otherwise (no subId, or a dangling/stale subId) it folds into the **no-sub** bucket. This keeps totals reconciling even if a stale `subId` ever survives.
- Real-sub entries: `{ subId, name, total, pct }` where `name` comes from the parent's `subcategories`, `total` is the magnitude (refunds reduce it, consistent with parent `total`), and `pct = total / parentTotal * 100`. Drop subs whose `total <= 0`. Sort descending by `total`.
- No-sub bucket: append `{ subId: null, name: '(no sub-category)', total, pct }` **last**, but **only when** its `total > 0` **and** at least one real sub has `total > 0`. (So a category whose spending is entirely unsubbed stays flat — `subs: []`, no chevron.)
- Result: `subs` is `[]` for plain categories; otherwise real subs (desc) followed by the optional no-sub bucket. `subs` totals reconcile exactly to the parent `total`.

Reuses the existing `categoriesById.get(categoryId)` lookup (which exposes `.subcategories`); no new inputs.

---

## UI layer — `src/CategoryBarList.jsx`

- **Expand state:** local `useState` holding a `Set` of expanded `categoryId`s. Collapsed by default; not persisted.
- **Chevron:** a row whose `item.subs?.length > 0` renders a chevron `<button>` (▸/▾) before the name. Rows with no subs render exactly as today.
- **Expanded sub-rows:** when a category is expanded, render an indented `.cat-sub-list` beneath the parent bar. Each sub row shows a connector glyph + name on the left, amount on the right, and a thin mini-bar (`.cat-sub-track`/`.cat-sub-fill`) scaled `sub.total / parent.total`, filled with the parent's color. The `(no sub-category)` row uses the muted fill.
- **Accessibility:** the chevron button has `aria-expanded={isOpen}` and `aria-label` `Expand <name> sub-categories` / `Collapse <name> sub-categories`. Keyboard-operable as a button.
- The parent bar keeps its current global-max scaling.

---

## Styling — `src/App.css`

Additive, reusing the `.cat-*` bar vocabulary; no edits to existing `.cat-row`/`.cat-fill`:

- `.cat-chevron` — borderless button, subtle ▸→▾ rotation.
- `.cat-sub-list` — indented container under an expanded parent.
- `.cat-sub-row`, `.cat-sub-name` (with `└` connector), `.cat-sub-amount` — smaller type, indented.
- `.cat-sub-track`, `.cat-sub-fill` — thinner mini-bar; parent-color fill; `(no sub-category)` variant uses a muted/desaturated fill.

---

## Testing

**Test convention:** Vitest; component tests use `@testing-library/react` + `userEvent`, `afterEach(() => cleanup())`, assertions via `.toBeTruthy()` / `getByText` / `getByRole` / `aria-*` (no jest-dom).

### `src/reportsModel.test.js` (pure)
- `flattenForReports` carries `subId` on split-derived rows and preserves it on non-split rows; transfer split lines still dropped.
- `spendingByCategory`:
  - subs computed and sorted descending by `total`;
  - `(no sub-category)` bucket appended only when unsubbed `> 0` **and** ≥1 real sub has spending;
  - subs reconcile exactly to the parent `total` (sum check);
  - within-parent `pct` (sums to ~100 across subs);
  - a plain category (spending but no subs) yields `subs: []`;
  - a category whose spending is entirely unsubbed yields `subs: []` (no lone no-sub bucket);
  - a dangling/stale `subId` folds into the no-sub bucket (totals still reconcile);
  - existing top-level fields (`categoryId, name, icon, color, total, pct`, ordering) unchanged — back-compat.

### `src/CategoryBarList.test.jsx` (RTL)
- chevron rendered only when `subs.length > 0`;
- clicking the chevron expands → real sub rows + `(no sub-category)` visible, `aria-expanded` flips to true;
- second click collapses (sub rows gone, `aria-expanded` false);
- a category with `subs: []` renders no chevron and no sub rows;
- existing bar-rendering assertions still pass.

---

## File structure

- `src/reportsModel.js` — `flattenForReports` carries `subId`; `spendingByCategory` attaches `subs` (real subs desc + optional `(no sub-category)` bucket; dangling-subId fold).
- `src/reportsModel.test.js` — flatten + sub-aggregation tests.
- `src/CategoryBarList.jsx` — expandable chevron rows + indented sub-bars.
- `src/CategoryBarList.test.jsx` — expand/collapse + chevron-gating tests.
- `src/App.css` — `.cat-chevron` + `.cat-sub-*` styles.
- (No change to `ReportsScreen.jsx`.)

---

## Self-review notes

- **Reconciliation guarantee:** every expense row in a category routes to exactly one bucket (a matching sub, or the no-sub bucket), so `sum(subs) === parent.total` by construction. The dangling-subId fold preserves this even against stale data.
- **Back-compat:** `subs` is purely additive on the `spendingByCategory` entry; `CategoryBarList` ignores subs unless present; no other consumer reads `subs`. Existing reportsModel/CategoryBarList tests remain valid.
- **YAGNI:** no expand-all control, no persistence, no per-sub drill-in/filter, no touching the unused `CategoryBreakdown`. Deferred if ever wanted.
- **Relates to:** the 3a sub-category data model (`subId` on transactions/split lines) and `flattenForReports`; this is the final piece of the original "Plan 2" reports rollup.
