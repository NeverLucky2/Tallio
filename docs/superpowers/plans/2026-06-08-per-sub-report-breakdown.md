# Per-sub Report Breakdown (3b) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, the user's established workflow) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Written to be executed in a FRESH session** — read each file's current region before editing it.

**Goal:** On the Reports "Spending by category" panel, let the user expand a category to see its per-sub-category breakdown, with an explicit "(no sub-category)" remainder so the sub rows reconcile exactly to the parent total.

**Architecture:** `flattenForReports` starts carrying `subId` on split rows; `spendingByCategory` *attaches* a `subs` array to each category entry (real subs desc + an optional "(no sub-category)" remainder that makes subs sum to the parent `total`). `CategoryBarList` gains local expand/collapse state and renders indented sub-bars. Purely additive — existing report fields, panels, and `ReportsScreen` are unchanged.

**Tech Stack:** React (function components, hooks), Vite, Vitest + @testing-library/react + userEvent. **Test convention:** `afterEach(() => cleanup())`; assert with `.toBeTruthy()` / `getByText` / `getByRole` / `queryByText` / `aria-*` — **no jest-dom**. Currency via `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`.

**Spec:** `docs/superpowers/specs/2026-06-08-per-sub-report-breakdown-design.md`

**Branch:** `per-sub-report-breakdown-3b` (already created off master; spec already committed).

---

## File structure

- `src/reportsModel.js` — `flattenForReports` carries `subId`; `spendingByCategory` attaches `subs`.
- `src/reportsModel.test.js` — flatten + sub-aggregation tests.
- `src/CategoryBarList.jsx` — expandable chevron rows + indented sub-bars.
- `src/CategoryBarList.test.jsx` — expand/collapse + chevron-gating tests.
- `src/App.css` — `.cat-chevron` + `.cat-sub-*` styles.
- (No change to `ReportsScreen.jsx`.)

Order: pure data (1, 2) → component + CSS (3) → verify (4).

---

## Task 1: `flattenForReports` carries `subId`

**Files:** Modify `src/reportsModel.js`; Test `src/reportsModel.test.js`

- [ ] **Step 1: Read** the `flattenForReports` generator in `src/reportsModel.js` (near the bottom, ~`330-352`) and the `describe('flattenForReports', …)` block in `src/reportsModel.test.js` (~`343-393`). Note non-split rows are yielded as-is (`yield t`) and split rows are rebuilt object-by-object **without** `subId`.

- [ ] **Step 2: Add a failing test.** Append inside the `describe('flattenForReports', …)` block in `src/reportsModel.test.js`, right before its closing `});`:

```js
  it('carries subId on split-derived rows (null when the line has none) and preserves it on non-split rows', () => {
    const txns = [
      { id: 'p1', amount: -30, accountId: 'a1', date: '2026-05-01',
        splits: [
          { id: 's1', amount: -20, categoryId: 'c_tax', subId: 'fed', description: 'Fed' },
          { id: 's2', amount: -10, categoryId: 'c_tax', description: 'No sub' },
        ] },
      { id: 'n1', amount: -5, accountId: 'a1', date: '2026-05-02', categoryId: 'c_tax', subId: 'state' },
    ];
    const flat = [...flattenForReports(txns)];
    expect(flat[0]).toMatchObject({ categoryId: 'c_tax', subId: 'fed', amount: -20 });
    expect(flat[1]).toMatchObject({ categoryId: 'c_tax', subId: null, amount: -10 });
    expect(flat[2]).toMatchObject({ id: 'n1', subId: 'state' }); // non-split row untouched
  });
```

- [ ] **Step 3: Run** `npx vitest run src/reportsModel.test.js -t "carries subId"` → expect FAIL (split row has no `subId`).

- [ ] **Step 4: Implement.** In `flattenForReports`, in the split-line `yield { … }` object, add a `subId` field (place it right after `categoryId`):

```js
        categoryId: s.categoryId,
        subId: s.subId ?? null,
```

(Non-split rows are yielded as-is and already carry `t.subId` when present — no change needed there.)

- [ ] **Step 5: Run** `npx vitest run src/reportsModel.test.js` → PASS (new test + all existing flatten/spending tests; the existing split tests use `toMatchObject`, so the added field is harmless).

- [ ] **Step 6: Commit**
```bash
git add src/reportsModel.js src/reportsModel.test.js
git commit -m "feat(reports): flattenForReports carries subId onto split rows"
```

---

## Task 2: `spendingByCategory` attaches `subs`

**Files:** Modify `src/reportsModel.js`; Test `src/reportsModel.test.js`

- [ ] **Step 1: Read** the current `spendingByCategory` in `src/reportsModel.js` (~`105-126`) and the `describe('spendingByCategory', …)` block (~`108-119`) plus the `describe('reports with split transactions', …)` block (~`395-452`) in the test file. Note the entry shape today is `{ categoryId, name, icon, color, total, pct }` and `categoriesById.get(id)` exposes `.subcategories`.

- [ ] **Step 2: Add failing tests.** Append a new `describe` block to `src/reportsModel.test.js` (after the `describe('spendingByCategory', …)` block, before the `import { cashFlowByMonth … }` line is fine, or at end of file — anywhere top-level):

```js
describe('spendingByCategory subs', () => {
  const catsWithSubs = new Map([
    ['c_tax', { id: 'c_tax', name: 'Taxes', icon: '🏛️', color: '#a00', flow: 'expense', subcategories: [
      { id: 'fed', name: 'Federal Tax' },
      { id: 'st',  name: 'State Tax' },
    ] }],
    ['c_gro', { id: 'c_gro', name: 'Groceries', icon: '🛒', color: '#0a0', flow: 'expense', subcategories: [] }],
  ]);

  it('attaches subs (desc) plus a reconciling (no sub-category) remainder', () => {
    const txns = [
      { id: 't1', accountId: 'a1', date: '2026-05-01', amount: -3000, categoryId: 'c_tax', subId: 'fed' },
      { id: 't2', accountId: 'a1', date: '2026-05-02', amount: -1000, categoryId: 'c_tax', subId: 'st' },
      { id: 't3', accountId: 'a1', date: '2026-05-03', amount:  -200, categoryId: 'c_tax' }, // unsubbed
    ];
    const tax = spendingByCategory(txns, catsWithSubs, {}).find(e => e.categoryId === 'c_tax');
    expect(tax.total).toBe(4200);
    expect(tax.subs.map(s => [s.name, s.total])).toEqual([
      ['Federal Tax', 3000], ['State Tax', 1000], ['(no sub-category)', 200],
    ]);
    expect(tax.subs[2].subId).toBe(null);
    expect(tax.subs.reduce((s, x) => s + x.total, 0)).toBe(tax.total); // reconciles exactly
    expect(Math.round(tax.subs.reduce((s, x) => s + x.pct, 0))).toBe(100); // within-parent pct
  });

  it('a category with no sub spending gets subs: [] (no chevron later)', () => {
    const txns = [{ id: 'g1', accountId: 'a1', date: '2026-05-01', amount: -600, categoryId: 'c_gro' }];
    const gro = spendingByCategory(txns, catsWithSubs, {}).find(e => e.categoryId === 'c_gro');
    expect(gro.subs).toEqual([]);
  });

  it('a category whose spending is entirely unsubbed gets subs: [] (no lone no-sub bucket)', () => {
    const txns = [{ id: 'x1', accountId: 'a1', date: '2026-05-01', amount: -500, categoryId: 'c_tax' }];
    const tax = spendingByCategory(txns, catsWithSubs, {}).find(e => e.categoryId === 'c_tax');
    expect(tax.subs).toEqual([]);
  });

  it('a dangling/stale subId folds into the (no sub-category) remainder', () => {
    const txns = [
      { id: 't1', accountId: 'a1', date: '2026-05-01', amount: -3000, categoryId: 'c_tax', subId: 'fed' },
      { id: 't2', accountId: 'a1', date: '2026-05-02', amount:  -200, categoryId: 'c_tax', subId: 'gone' }, // not a real sub
    ];
    const tax = spendingByCategory(txns, catsWithSubs, {}).find(e => e.categoryId === 'c_tax');
    expect(tax.subs.map(s => [s.name, s.total])).toEqual([
      ['Federal Tax', 3000], ['(no sub-category)', 200],
    ]);
    expect(tax.subs.reduce((s, x) => s + x.total, 0)).toBe(tax.total);
  });
});
```

- [ ] **Step 3: Run** `npx vitest run src/reportsModel.test.js -t "spendingByCategory subs"` → expect FAIL (`subs` is undefined).

- [ ] **Step 4: Implement.** Replace the entire `spendingByCategory` function in `src/reportsModel.js` with this version (keeps every existing top-level field; adds per-(category, subKey) accumulation and a reconciling remainder):

```js
// Expense-flow totals per category, descending. total = magnitude (refunds reduce it).
// Each entry also carries `subs`: real sub-categories (desc) plus a reconciling
// "(no sub-category)" remainder, or [] when the category has no sub spending.
export function spendingByCategory(transactions, categoriesById, opts = {}) {
  const signed = new Map();    // categoryId -> signed sum
  const subBy = new Map();     // categoryId -> Map(subId -> signed sum) for VALID subs only
  for (const t of flattenForReports(filterRows(transactions, opts))) {
    if (flowOf(t, categoriesById) !== 'expense') continue;
    const amt = Number.isFinite(t.amount) ? t.amount : 0;
    signed.set(t.categoryId, (signed.get(t.categoryId) || 0) + amt);
    const cat = categoriesById && categoriesById.get(t.categoryId);
    const subDefs = (cat && cat.subcategories) || [];
    // A subId only counts if it still names a real sub of this category;
    // unsubbed rows and dangling/stale subIds are left out of subBy and so
    // land in the reconciling remainder below.
    if (t.subId && subDefs.some(s => s.id === t.subId)) {
      let m = subBy.get(t.categoryId);
      if (!m) { m = new Map(); subBy.set(t.categoryId, m); }
      m.set(t.subId, (m.get(t.subId) || 0) + amt);
    }
  }
  const entries = [...signed.entries()].map(([categoryId, sum]) => {
    const cat = (categoriesById && categoriesById.get(categoryId)) || {};
    const total = -sum;
    const subDefs = cat.subcategories || [];
    const realSubs = [...(subBy.get(categoryId) || new Map())]
      .map(([subId, ssum]) => {
        const def = subDefs.find(s => s.id === subId);
        return { subId, name: (def && def.name) || 'Sub-category', total: -ssum };
      })
      .filter(s => s.total > 0)
      .sort((a, b) => b.total - a.total);
    let subs = [];
    if (realSubs.length > 0) {
      const shown = realSubs.reduce((s, x) => s + x.total, 0);
      const remainder = total - shown; // unsubbed + dangling + any dropped non-positive sub
      subs = realSubs.map(s => ({ ...s, pct: total > 0 ? (s.total / total) * 100 : 0 }));
      if (remainder > 0) {
        subs.push({ subId: null, name: '(no sub-category)', total: remainder, pct: total > 0 ? (remainder / total) * 100 : 0 });
      }
    }
    return {
      categoryId,
      name: cat.name || 'Uncategorized',
      icon: cat.icon || '📋',
      color: cat.color || '#6B7280',
      total,
      subs,
    };
  }).filter(e => e.total > 0);
  const sum = entries.reduce((s, e) => s + e.total, 0);
  for (const e of entries) e.pct = sum > 0 ? (e.total / sum) * 100 : 0;
  entries.sort((a, b) => b.total - a.total);
  return entries;
}
```

- [ ] **Step 5: Run** `npx vitest run src/reportsModel.test.js` → PASS (new sub tests + all existing `spendingByCategory` and split-report tests; existing tests use `toMatchObject`/`.map`/`.reduce`, so the added `subs` field is harmless).

- [ ] **Step 6: Commit**
```bash
git add src/reportsModel.js src/reportsModel.test.js
git commit -m "feat(reports): spendingByCategory attaches per-sub breakdown with reconciling remainder"
```

---

## Task 3: `CategoryBarList` expandable sub-rows

**Files:** Modify `src/CategoryBarList.jsx`, `src/CategoryBarList.test.jsx`, `src/App.css`

- [ ] **Step 1: Read** `src/CategoryBarList.jsx` (whole file, ~33 lines) and `src/CategoryBarList.test.jsx` (whole file). Note it currently has no state and no `userEvent` import.

- [ ] **Step 2: Write failing tests.** Replace the entire body of `src/CategoryBarList.test.jsx` with:

```jsx
// src/CategoryBarList.test.jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategoryBarList from './CategoryBarList.jsx';

const flat = [
  { categoryId: 'g', name: 'Groceries', icon: '🛒', color: '#a00', total: 630, pct: 61.2 },
  { categoryId: 'd', name: 'Dining', icon: '🍽️', color: '#b50', total: 400, pct: 38.8 },
];

const withSubs = [
  { categoryId: 'tax', name: 'Taxes', icon: '🏛️', color: '#a00', total: 4200, pct: 62, subs: [
    { subId: 'fed', name: 'Federal Tax', total: 3000, pct: 71.4 },
    { subId: 'st',  name: 'State Tax',   total: 1000, pct: 23.8 },
    { subId: null,  name: '(no sub-category)', total: 200, pct: 4.8 },
  ] },
  { categoryId: 'gro', name: 'Groceries', icon: '🛒', color: '#0a0', total: 2600, pct: 38, subs: [] },
];

describe('CategoryBarList', () => {
  afterEach(() => cleanup());

  it('lists each category name and amount', () => {
    render(<CategoryBarList items={flat} />);
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('Dining')).toBeTruthy();
    expect(screen.getByText(/\$630/)).toBeTruthy();
  });

  it('renders an empty state with no items', () => {
    render(<CategoryBarList items={[]} />);
    expect(screen.getByText(/no expenses/i)).toBeTruthy();
  });

  it('shows a chevron only for categories that have subs', () => {
    render(<CategoryBarList items={withSubs} />);
    expect(screen.getByRole('button', { name: /expand taxes sub-categories/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /groceries/i })).toBeNull();
  });

  it('sub rows are hidden until expanded, then shown, then hidden again', async () => {
    render(<CategoryBarList items={withSubs} />);
    expect(screen.queryByText('Federal Tax')).toBeNull();
    const chevron = screen.getByRole('button', { name: /expand taxes/i });
    await userEvent.click(chevron);
    expect(screen.getByText('Federal Tax')).toBeTruthy();
    expect(screen.getByText('(no sub-category)')).toBeTruthy();
    expect(screen.getByRole('button', { name: /collapse taxes/i }).getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: /collapse taxes/i }));
    expect(screen.queryByText('Federal Tax')).toBeNull();
  });
});
```

- [ ] **Step 3: Run** `npx vitest run src/CategoryBarList.test.jsx` → expect FAIL (no chevron/sub rows yet).

- [ ] **Step 4: Implement.** Replace the entire `src/CategoryBarList.jsx` with:

```jsx
// src/CategoryBarList.jsx
import React, { useState } from 'react';
import Icon from './Icon.jsx';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

export default function CategoryBarList({ items }) {
  const [expanded, setExpanded] = useState(() => new Set());
  if (!items || items.length === 0) {
    return <p className="panel-empty">No expenses in this period</p>;
  }
  const max = Math.max(...items.map(i => i.total), 1);
  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return (
    <div className="cat-list">
      {items.map(i => {
        const hasSubs = Array.isArray(i.subs) && i.subs.length > 0;
        const open = expanded.has(i.categoryId);
        return (
          <div key={i.categoryId || i.name}>
            <div className="cat-meta">
              <div className="cat-name">
                {hasSubs && (
                  <button
                    type="button"
                    className={`cat-chevron${open ? ' open' : ''}`}
                    aria-expanded={open}
                    aria-label={`${open ? 'Collapse' : 'Expand'} ${i.name} sub-categories`}
                    onClick={() => toggle(i.categoryId)}
                  >▸</button>
                )}
                <Icon value={i.icon} className="cat-icon" />
                {i.name}
              </div>
              <span className="cat-amount" style={{ color: i.color }}>
                {money(i.total)} <span className="cat-pct">{Math.round(i.pct)}%</span>
              </span>
            </div>
            <div className="cat-track">
              <div className="cat-fill" style={{ width: `${(i.total / max) * 100}%`, background: i.color }} />
            </div>
            {hasSubs && open && (
              <div className="cat-sub-list">
                {i.subs.map(s => (
                  <div key={s.subId == null ? '__nosub' : s.subId} className={`cat-sub-row${s.subId == null ? ' is-nosub' : ''}`}>
                    <div className="cat-sub-meta">
                      <span className="cat-sub-name">{s.name}</span>
                      <span className="cat-sub-amount">{money(s.total)}</span>
                    </div>
                    <div className="cat-sub-track">
                      <div className="cat-sub-fill" style={{ width: `${i.total > 0 ? (s.total / i.total) * 100 : 0}%`, background: i.color }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Add CSS** to `src/App.css` immediately after the `.cat-fill { … }` rule (search for `.cat-fill {` near line ~1086):

```css
.cat-chevron {
  background: none;
  border: 0;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 10px;
  line-height: 1;
  padding: 0 4px 0 0;
  transition: transform 0.15s ease;
}
.cat-chevron.open { transform: rotate(90deg); }

.cat-sub-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 2px 18px;
}
.cat-sub-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.cat-sub-name {
  font-size: 11px;
  color: var(--text-dim);
}
.cat-sub-name::before { content: "└ "; opacity: 0.6; }
.cat-sub-amount {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
}
.cat-sub-track {
  height: 2px;
  background: rgba(255,255,255,0.04);
  border-radius: 2px;
  overflow: hidden;
}
.cat-sub-fill {
  height: 100%;
  border-radius: 2px;
  opacity: 0.7;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.cat-sub-row.is-nosub .cat-sub-fill { opacity: 0.35; }
```

- [ ] **Step 6: Run** `npx vitest run src/CategoryBarList.test.jsx` → PASS.

- [ ] **Step 7: Commit**
```bash
git add src/CategoryBarList.jsx src/CategoryBarList.test.jsx src/App.css
git commit -m "feat(reports): expandable per-sub bars in CategoryBarList"
```

---

## Task 4: Verify

- [ ] **Step 1:** `npx vitest run` → all green.
- [ ] **Step 2:** `npm run build` → succeeds (pre-existing `node:fs`/chunk-size warnings from the Anthropic SDK are expected).
- [ ] **Step 3:** `npx eslint src/reportsModel.js src/CategoryBarList.jsx` → clean (no new errors; a pre-existing `App.jsx` warning is unrelated).
- [ ] **Step 4: Manual smoke** (`npm run dev` → open Reports):
  1. Assign subs to a few transactions in a category (e.g. Taxes → Federal/State), leave one unsubbed.
  2. Open Reports → "Spending by category" → the category shows a chevron; expand it → Federal Tax, State Tax, and "(no sub-category)" appear, and the three sub amounts add up to the category total.
  3. A category with no subs has no chevron.
  4. Collapse re-hides the sub rows.
- [ ] **Step 5:** Commit any cleanup if needed.

---

## Self-review notes

- **Spec coverage:** `flattenForReports` subId (Task 1); `spendingByCategory` subs + reconciling remainder + dangling-fold + plain/entirely-unsubbed → `subs: []` (Task 2); expandable chevron rows, indented within-parent sub-bars, parent-color fill, muted no-sub, `aria-expanded`, collapsed-by-default local state (Task 3); CSS (Task 3 Step 5); verify incl. back-compat run (Task 4). `ReportsScreen`/other panels untouched ✓. `CategoryBreakdown` intentionally out of scope ✓.
- **Reconciliation:** the no-sub bucket is `total − Σ(shown real subs)`, so `Σ subs === parent.total` by construction (absorbs unsubbed rows, dangling subIds, and any non-positive sub bucket). Asserted in Task 2 Step 2.
- **Name/shape consistency:** entry shape `{ categoryId, name, icon, color, total, pct, subs }`; sub shape `{ subId, name, total, pct }` (no-sub uses `subId: null`, `name: '(no sub-category)'`) — produced in Task 2, consumed in Task 3. `subs: []` ⇒ no chevron (Task 3 `hasSubs`).
- **Back-compat:** Task 1/2 changes are additive; existing flatten/spending/report tests use `toMatchObject`/`.map`/`.reduce` and keep passing. Task 3 keeps the two original CategoryBarList tests (renamed fixture `flat`).
- **No placeholders:** every code step shows complete code; commands have expected outcomes.
```
