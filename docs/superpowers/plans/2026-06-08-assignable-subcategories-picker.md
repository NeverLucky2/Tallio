# Assignable Sub-categories + Searchable Tree Picker (3a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, the user's established workflow) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **This plan is written to be executed in a FRESH session** — read each file's current region before editing it.

**Goal:** Let the user pick a sub-category on a transaction and on each split line via a searchable, indented-tree combobox; persist it as an optional `subId`; make scanned-bill auto-categorization sub-aware.

**Architecture:** Transactions and split lines keep `categoryId` = the **parent** and gain an optional `subId`, so existing reports roll subs up under the parent with no report change (per-sub breakdown is Branch 3b). A new pure `flattenForPicker`/`filterOptions` pair powers a new `CategoryPicker` combobox that replaces the native category `<select>` in `TransactionEditor` and per-line in `SplitsEditor`. `autoCategorize` becomes sub-aware (returns `{categoryId, subId}`). `useLedger` persists `subId` and gains `clearSubcategory(subId)` for sub-deletion.

**Tech Stack:** React (function components, hooks), Vite, Vitest + @testing-library/react + userEvent. **Test convention:** `afterEach(() => cleanup())`; assert with `.toBeTruthy()` / `.disabled` / `.value` / `getByText` / `getByRole` — **no jest-dom**. Repo uses `iconGlyph(icon)` from `./iconValue.js` to render an icon glyph inside text/options.

**Spec:** `docs/superpowers/specs/2026-06-08-assignable-subcategories-picker-design.md`

**Branch:** `subcategories-picker-3a` (already created off master; spec already committed).

---

## File structure

- `src/categoryRules.js` — `autoCategorize` returns `{categoryId, subId}`; sub keywords participate.
- `src/categoriesSearch.js` — add `flattenForPicker(categories)` + `filterOptions(options, query)` (keep existing `filterCategoriesByQuery`).
- `src/CategoryPicker.jsx` — NEW searchable indented-tree combobox.
- `src/useLedger.js` — persist `subId` on transactions + split lines; `clearSubcategory(subId)`.
- `src/useCategories.js` — `applyCategoryToItems` clears `subId` on move.
- `src/TransactionEditor.jsx` — adopt `CategoryPicker`; track + save `subId`.
- `src/SplitsEditor.jsx` — adopt `CategoryPicker` per line; lines carry `subId`.
- `src/App.jsx` — `handleCapture` sets `subId`; `onDeleteSub` calls `clearSubcategory`.
- `src/App.css` — `.cat-picker*` styles.

Order: pure logic (1,2) → component (3) → ledger/model (4,5) → editors (6,7) → app wiring (8) → verify (9).

---

## Task 1: `autoCategorize` returns `{ categoryId, subId }`

**Files:** Modify `src/categoryRules.js`; Test `src/categoryRules.test.js`

- [ ] **Step 1: Read** `src/categoryRules.js` and `src/categoryRules.test.js` fully. Note existing tests call `autoCategorize(...)` and compare to a bare id — those will need updating to `.categoryId`.

- [ ] **Step 2: Update existing tests + add new ones.** In `src/categoryRules.test.js`, change every existing `expect(autoCategorize(...))` that compared to an id `X` so it compares to `{ categoryId: X, subId: null }` (or assert `.categoryId`). Then add:

```js
it('returns the sub id when a sub keyword is the longest match', () => {
  const cats = [
    { id: 'taxes', name: 'Taxes', keywords: ['TAX'], subcategories: [
      { id: 'fed', name: 'Federal Tax', keywords: ['FEDERAL TAX'] },
    ] },
    { id: 'other', name: 'Other', keywords: [] },
  ];
  expect(autoCategorize('IRS FEDERAL TAX PMT', cats, 'other')).toEqual({ categoryId: 'taxes', subId: 'fed' });
});

it('a shorter parent keyword loses to a longer sub keyword', () => {
  const cats = [
    { id: 'taxes', name: 'Taxes', keywords: ['TAX'], subcategories: [{ id: 'fed', name: 'Fed', keywords: ['FEDERAL TAX'] }] },
  ];
  expect(autoCategorize('FEDERAL TAX', cats, 'fb')).toEqual({ categoryId: 'taxes', subId: 'fed' });
});

it('falls back to {categoryId: fallback, subId: null} on no match', () => {
  expect(autoCategorize('nothing', [{ id: 'a', name: 'A', keywords: ['ZZZ'] }], 'fb')).toEqual({ categoryId: 'fb', subId: null });
});

it('returns {categoryId, subId:null} when only a parent keyword matches', () => {
  const cats = [{ id: 'g', name: 'Gas', keywords: ['SHELL'], subcategories: [] }];
  expect(autoCategorize('SHELL OIL', cats, 'fb')).toEqual({ categoryId: 'g', subId: null });
});
```

- [ ] **Step 3: Run** `npx vitest run src/categoryRules.test.js` → expect FAILs (autoCategorize returns a bare id, not an object).

- [ ] **Step 4: Implement.** Replace `autoCategorize` in `src/categoryRules.js` with:

```js
export function autoCategorize(description, categories, fallbackCategoryId) {
  if (typeof description !== 'string' || description.length === 0) {
    return { categoryId: fallbackCategoryId, subId: null };
  }
  const upper = description.toUpperCase();
  let bestCategoryId = fallbackCategoryId;
  let bestSubId = null;
  let bestLen = 0;
  for (const cat of categories || []) {
    for (const kw of cat.keywords || []) {
      if (typeof kw === 'string' && kw.length > bestLen && upper.includes(kw)) {
        bestLen = kw.length; bestCategoryId = cat.id; bestSubId = null;
      }
    }
    for (const sub of cat.subcategories || []) {
      for (const kw of sub.keywords || []) {
        if (typeof kw === 'string' && kw.length > bestLen && upper.includes(kw)) {
          bestLen = kw.length; bestCategoryId = cat.id; bestSubId = sub.id;
        }
      }
    }
  }
  return { categoryId: bestCategoryId, subId: bestSubId };
}
```

Also update `findItemsMatchingKeyword`'s "current best length" inner loop so sub keywords participate: where it scans `for (const cat of categories) for (const k of cat.keywords...)`, add an inner loop over `cat.subcategories?.[].keywords` using the same `k.length > currentBest && upper.includes(k)` comparison. (Read the function first; add the sub-keyword loop alongside the existing keyword loop. Its return shape is unchanged.)

- [ ] **Step 5: Run** `npx vitest run src/categoryRules.test.js` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/categoryRules.js src/categoryRules.test.js
git commit -m "feat(categories): sub-aware autoCategorize returns {categoryId, subId}"
```

---

## Task 2: `flattenForPicker` + `filterOptions`

**Files:** Modify `src/categoriesSearch.js`; Test `src/categoriesSearch.test.js`

- [ ] **Step 1: Write failing tests.** Append to `src/categoriesSearch.test.js`:

```js
import { flattenForPicker, filterOptions } from './categoriesSearch.js';

const cats = [
  { id: 'inc', name: 'Paycheck', icon: '💼', flow: 'income', subcategories: [] },
  { id: 'tax', name: 'Taxes', icon: '🏛️', flow: 'expense', subcategories: [
    { id: 'state', name: 'State Tax', keywords: [] },
    { id: 'fed',   name: 'Federal Tax', keywords: [] },
  ] },
];

describe('flattenForPicker', () => {
  it('orders by flow then category A→Z, each category followed by its subs A→Z', () => {
    const opts = flattenForPicker(cats);
    expect(opts.map(o => o.path)).toEqual([
      'Paycheck', 'Taxes', 'Taxes › Federal Tax', 'Taxes › State Tax',
    ]);
    const fed = opts.find(o => o.subId === 'fed');
    expect(fed).toMatchObject({ kind: 'sub', categoryId: 'tax', subId: 'fed', flow: 'expense', icon: '🏛️' });
    expect(opts.find(o => o.categoryId === 'tax' && o.kind === 'category').subId).toBe(null);
  });
});

describe('filterOptions', () => {
  it('empty query returns all options', () => {
    const opts = flattenForPicker(cats);
    expect(filterOptions(opts, '')).toHaveLength(opts.length);
  });
  it('matching a sub keeps its parent for context plus the matching sub', () => {
    const opts = flattenForPicker(cats);
    const r = filterOptions(opts, 'federal');
    expect(r.map(o => o.path)).toEqual(['Taxes', 'Taxes › Federal Tax']);
  });
  it('matching a parent includes all its subs', () => {
    const opts = flattenForPicker(cats);
    const r = filterOptions(opts, 'taxes');
    expect(r.map(o => o.path)).toEqual(['Taxes', 'Taxes › Federal Tax', 'Taxes › State Tax']);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/categoriesSearch.test.js` → FAIL (functions undefined).

- [ ] **Step 3: Implement.** Append to `src/categoriesSearch.js`:

```js
const FLOW_ORDER = ['income', 'expense', 'savings', 'transfer'];

// Ordered picker options: per flow (FLOW_ORDER), categories A→Z, each immediately
// followed by its subs A→Z. Subs inherit the parent's icon and flow.
export function flattenForPicker(categories) {
  const list = Array.isArray(categories) ? categories : [];
  const byFlow = (c) => FLOW_ORDER.indexOf(c.flow || 'expense');
  const cats = [...list].sort((a, b) => {
    const fa = byFlow(a), fb = byFlow(b);
    if (fa !== fb) return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb);
    return (a.name || '').localeCompare(b.name || '');
  });
  const out = [];
  for (const c of cats) {
    out.push({ kind: 'category', categoryId: c.id, subId: null, name: c.name || '', path: c.name || '', flow: c.flow || 'expense', icon: c.icon });
    const subs = [...(c.subcategories || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    for (const s of subs) {
      out.push({ kind: 'sub', categoryId: c.id, subId: s.id, name: s.name || '', path: `${c.name || ''} › ${s.name || ''}`, flow: c.flow || 'expense', icon: c.icon });
    }
  }
  return out;
}

// Filter the flat options by query. Empty query → all. A category stays if its
// name matches or any of its subs match; a sub stays if its name matches or its
// parent matches (so the parent header is always present for context).
export function filterOptions(options, query) {
  const list = Array.isArray(options) ? options : [];
  const q = (query || '').trim().toLowerCase();
  if (!q) return list;
  const parentMatch = new Set();
  const hasSubMatch = new Set();
  for (const o of list) {
    if (o.kind === 'category' && o.name.toLowerCase().includes(q)) parentMatch.add(o.categoryId);
    if (o.kind === 'sub' && o.name.toLowerCase().includes(q)) hasSubMatch.add(o.categoryId);
  }
  return list.filter(o => {
    if (o.kind === 'category') return parentMatch.has(o.categoryId) || hasSubMatch.has(o.categoryId);
    return parentMatch.has(o.categoryId) || o.name.toLowerCase().includes(q);
  });
}
```

- [ ] **Step 4: Run** `npx vitest run src/categoriesSearch.test.js` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/categoriesSearch.js src/categoriesSearch.test.js
git commit -m "feat(categories): flattenForPicker + filterOptions picker helpers"
```

---

## Task 3: `CategoryPicker` searchable combobox

**Files:** Create `src/CategoryPicker.jsx`, `src/CategoryPicker.test.jsx`; Modify `src/App.css`

- [ ] **Step 1: Write failing tests.** Create `src/CategoryPicker.test.jsx`:

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategoryPicker from './CategoryPicker.jsx';

const categories = [
  { id: 'tax', name: 'Taxes', icon: '🏛️', flow: 'expense', subcategories: [
    { id: 'fed', name: 'Federal Tax', keywords: [] },
  ] },
  { id: 'gro', name: 'Groceries', icon: '🛒', flow: 'expense', subcategories: [] },
];

function setup(value = { categoryId: 'gro', subId: null }) {
  const onChange = vi.fn();
  render(<CategoryPicker categories={categories} value={value} onChange={onChange} ariaLabel="Category" />);
  return { onChange };
}

describe('CategoryPicker', () => {
  afterEach(() => cleanup());

  it('shows the current selection on the trigger', () => {
    setup({ categoryId: 'tax', subId: 'fed' });
    expect(screen.getByRole('button', { name: /category/i }).textContent).toMatch(/Taxes › Federal Tax/);
  });

  it('opens and lists categories and indented subs', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    expect(screen.getByText('Taxes')).toBeTruthy();
    expect(screen.getByText('Federal Tax')).toBeTruthy();
  });

  it('typing filters to a matching sub and its parent', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    await userEvent.type(screen.getByRole('combobox'), 'federal');
    expect(screen.getByText('Federal Tax')).toBeTruthy();
    expect(screen.queryByText('Groceries')).toBeNull();
  });

  it('selecting a parent emits {categoryId, subId:null}', async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    await userEvent.click(screen.getByText('Taxes'));
    expect(onChange).toHaveBeenCalledWith({ categoryId: 'tax', subId: null });
  });

  it('selecting a sub emits {categoryId:parent, subId}', async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    await userEvent.click(screen.getByText('Federal Tax'));
    expect(onChange).toHaveBeenCalledWith({ categoryId: 'tax', subId: 'fed' });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/CategoryPicker.test.jsx` → FAIL (no component).

- [ ] **Step 3: Implement** `src/CategoryPicker.jsx`:

```jsx
import { useState, useRef, useEffect, useMemo } from 'react';
import { iconGlyph } from './iconValue.js';
import { flattenForPicker, filterOptions } from './categoriesSearch.js';

const FLOW_LABELS = { income: 'Income', expense: 'Expense', savings: 'Savings', transfer: 'Transfer' };

export default function CategoryPicker({ categories, value, onChange, ariaLabel = 'Category' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const allOptions = useMemo(() => flattenForPicker(categories), [categories]);
  const options = useMemo(() => filterOptions(allOptions, query), [allOptions, query]);

  const selected =
    allOptions.find(o => value && o.categoryId === value.categoryId && (o.subId || null) === (value.subId || null)) ||
    allOptions.find(o => value && o.kind === 'category' && o.categoryId === value.categoryId) || null;

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setHighlight(0); }, [query, open]);

  const choose = (opt) => {
    onChange({ categoryId: opt.categoryId, subId: opt.kind === 'sub' ? opt.subId : null });
    setQuery('');
    setOpen(false);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (options[highlight]) choose(options[highlight]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  const triggerLabel = selected ? `${iconGlyph(selected.icon)} ${selected.path}` : 'Select category…';
  const showGroups = query.trim() === '';
  let lastFlow = null;

  return (
    <div className="cat-picker" ref={rootRef}>
      <button type="button" className="cat-picker-trigger select" aria-label={ariaLabel}
        aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="cat-picker-value">{triggerLabel}</span>
        <span className="cat-picker-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="cat-picker-popover">
          <input ref={inputRef} type="text" role="combobox" className="cat-picker-input input"
            aria-label={`${ariaLabel} search`} aria-expanded="true" placeholder="Type to filter…"
            value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} />
          <ul className="cat-picker-list" role="listbox">
            {options.map((o, i) => {
              const header = showGroups && o.flow !== lastFlow ? (lastFlow = o.flow, FLOW_LABELS[o.flow] || o.flow) : null;
              return (
                <span key={o.subId ? `${o.categoryId}:${o.subId}` : o.categoryId}>
                  {header && <li className="cat-picker-group" aria-hidden="true">{header}</li>}
                  <li role="option" aria-selected={i === highlight}
                    className={`cat-picker-option${o.kind === 'sub' ? ' is-sub' : ''}${i === highlight ? ' active' : ''}`}
                    onMouseEnter={() => setHighlight(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}>
                    <span className="cat-picker-opt-icon" aria-hidden="true">{iconGlyph(o.icon)}</span>
                    <span className="cat-picker-opt-name">{o.name}</span>
                  </li>
                </span>
              );
            })}
            {options.length === 0 && <li className="cat-picker-empty">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add CSS** to `src/App.css` (anywhere near the other picker rules; search `.picker-popover` for a neighbor):

```css
.cat-picker { position: relative; }
.cat-picker-trigger { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; cursor: pointer; text-align: left; }
.cat-picker-caret { opacity: 0.6; }
.cat-picker-popover { position: absolute; z-index: 50; top: calc(100% + 4px); left: 0; right: 0; background: var(--surface, #1a1f2b); border: 1px solid var(--border, #3a4456); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.35); padding: 6px; }
.cat-picker-input { width: 100%; margin-bottom: 6px; }
.cat-picker-list { list-style: none; margin: 0; padding: 0; max-height: 240px; overflow-y: auto; }
.cat-picker-group { font: 600 10px system-ui; letter-spacing: .06em; text-transform: uppercase; opacity: 0.55; padding: 6px 8px 2px; }
.cat-picker-option { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.cat-picker-option.is-sub { padding-left: 26px; }
.cat-picker-option.active { background: rgba(124,138,160,0.18); }
.cat-picker-empty { padding: 8px; opacity: 0.6; }
```

- [ ] **Step 5: Run** `npx vitest run src/CategoryPicker.test.jsx` → PASS. (If the click-to-select test is flaky because click-outside fires first, note the option uses `onMouseDown preventDefault` so the input doesn't steal/lose; keep `onClick` for selection.)

- [ ] **Step 6: Commit**
```bash
git add src/CategoryPicker.jsx src/CategoryPicker.test.jsx src/App.css
git commit -m "feat(categories): CategoryPicker searchable indented-tree combobox"
```

---

## Task 4: persist `subId` + `clearSubcategory` in `useLedger`

**Files:** Modify `src/useLedger.js`; Test `src/useLedger.test.jsx`

- [ ] **Step 1: Read** `src/useLedger.js` regions: `addTransaction` (the `parent` object + its `splits` `.map`), `updateTransaction`, `addTransfer`/`updateTransfer` split-line `.map`s, and where `snapshot/restore` and the returned API object are.

- [ ] **Step 2: Write failing tests.** Add to `src/useLedger.test.jsx`:

```js
describe('subId persistence', () => {
  const seed = { accounts: [{ id: 'a1', name: 'A', type: 'bank', openingBalance: 0 }], transactions: [] };

  it('addTransaction persists subId on the parent and on split lines', () => {
    const { result } = renderHook(() => useLedger(seed));
    let id;
    act(() => {
      id = result.current.addTransaction({
        accountId: 'a1', date: '2026-06-08', amount: -30, categoryId: 'tax', subId: 'fed',
        splits: [
          { id: 's1', amount: -20, categoryId: 'tax', subId: 'fed', description: '' },
          { id: 's2', amount: -10, categoryId: 'gro', description: '' },
        ],
      });
    });
    const t = result.current.transactions.find(x => x.id === id);
    expect(t.subId).toBe('fed');
    expect(t.splits.find(s => s.id === 's1').subId).toBe('fed');
    expect(t.splits.find(s => s.id === 's2').subId).toBeUndefined();
  });

  it('clearSubcategory strips a subId from parents and split lines', () => {
    const { result } = renderHook(() => useLedger(seed));
    act(() => {
      result.current.addTransaction({ accountId: 'a1', date: '2026-06-08', amount: -5, categoryId: 'tax', subId: 'fed' });
      result.current.addTransaction({ accountId: 'a1', date: '2026-06-08', amount: -9, categoryId: 'tax',
        splits: [
          { id: 's1', amount: -4, categoryId: 'tax', subId: 'fed', description: '' },
          { id: 's2', amount: -5, categoryId: 'tax', subId: 'state', description: '' },
        ] });
    });
    act(() => { result.current.clearSubcategory('fed'); });
    const txns = result.current.transactions;
    expect(txns.some(t => t.subId === 'fed')).toBe(false);
    const split = txns.find(t => Array.isArray(t.splits));
    expect(split.splits.find(s => s.id === 's1').subId).toBeUndefined();
    expect(split.splits.find(s => s.id === 's2').subId).toBe('state'); // untouched
  });
});
```

- [ ] **Step 3: Run** `npx vitest run src/useLedger.test.jsx -t subId` → FAIL.

- [ ] **Step 4: Implement.**
  - In `addTransaction`: where the `parent` object is built, add `...(txn.subId ? { subId: txn.subId } : {})`. In its `splits` normalizer `.map(s => ({...}))`, add `...(s.categoryId && s.subId ? { subId: s.subId } : {})`.
  - In `updateTransaction`: ensure a patched `subId` is carried (it flows through `{ ...before, ...patch }`; if `patch.subId === null` delete it, mirroring how `splits === null` is handled). In its split normalizer (if present), add the same per-line `subId` spread.
  - In `addTransfer`/`updateTransfer`: in each `sourceSplits` `.map(s => ({...}))`, add `...(s.categoryId && s.subId ? { subId: s.subId } : {})`.
  - Add `clearSubcategory` and include it in the returned API object:

```js
  const clearSubcategory = useCallback((subId) => {
    if (!subId) return;
    setTransactions(prev => prev.map(t => {
      let changed = false;
      const next = { ...t };
      if (next.subId === subId) { delete next.subId; changed = true; }
      if (Array.isArray(next.splits)) {
        const lines = next.splits.map(s => {
          if (s.subId === subId) { const { subId: _drop, ...rest } = s; return rest; }
          return s;
        });
        if (lines.some((s, i) => s !== next.splits[i])) { next.splits = lines; changed = true; }
      }
      return changed ? next : t;
    }));
  }, []);
```

  Add `clearSubcategory` to the `return { ... }` API.

- [ ] **Step 5: Run** `npx vitest run src/useLedger.test.jsx` → PASS (all, including existing).

- [ ] **Step 6: Commit**
```bash
git add src/useLedger.js src/useLedger.test.jsx
git commit -m "feat(ledger): persist subId on transactions/split lines + clearSubcategory"
```

---

## Task 5: `applyCategoryToItems` clears `subId` on move

**Files:** Modify `src/useCategories.js`; Test `src/useCategories.test.jsx`

- [ ] **Step 1: Read** `applyCategoryToItems` in `src/useCategories.js` (it maps bills→items, setting `categoryId` on matched item ids).

- [ ] **Step 2: Write failing test.** Add to `src/useCategories.test.jsx`:

```js
it('applyCategoryToItems clears subId on moved items', () => {
  const { result } = renderHook(() => useCategories());
  const bills = [{ id: 'b1', items: [{ id: 'i1', categoryId: 'old', subId: 'oldsub', amount: -5 }] }];
  let next;
  act(() => { next = result.current.applyCategoryToItems(bills, [{ billId: 'b1', item: bills[0].items[0] }], 'newcat'); });
  const it = next[0].items[0];
  expect(it.categoryId).toBe('newcat');
  expect(it.subId).toBeUndefined();
});
```

- [ ] **Step 3: Run** `npx vitest run src/useCategories.test.jsx -t "clears subId"` → FAIL (subId retained).

- [ ] **Step 4: Implement.** In `applyCategoryToItems`, change the matched-item mapping so it drops `subId`:

```js
        items: (b.items || []).map(i => {
          if (!itemIds.has(i.id)) return i;
          const { subId: _drop, ...rest } = i;
          return { ...rest, categoryId };
        }),
```

- [ ] **Step 5: Run** `npx vitest run src/useCategories.test.jsx` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/useCategories.js src/useCategories.test.jsx
git commit -m "feat(categories): clear subId when moving items to another category"
```

---

## Task 6: `TransactionEditor` adopts `CategoryPicker`

**Files:** Modify `src/TransactionEditor.jsx`; Test `src/TransactionEditor.test.jsx`

- [ ] **Step 1: Read** `src/TransactionEditor.jsx` (the `categoryId` state ~`21`, the Category `<select>` block ~`98-115`, and `save` ~`58-72`) and `src/TransactionEditor.test.jsx` (conventions; how it finds the category control).

- [ ] **Step 2: Write failing tests.** Add to `src/TransactionEditor.test.jsx` (mirror its existing `setup`/props; ensure `categories` include a sub):

```js
it('saving with a sub selected includes subId', async () => {
  // Use the suite's render helper with categories that include Taxes › Federal Tax.
  // Open the picker, pick the sub, Save, and assert the payload.
  // (Adapt selectors to the suite's setup; the picker trigger has aria-label "Category".)
});
```

Replace that stub with a concrete test using the file's existing `setup`/render pattern: render the editor, `await userEvent.click(screen.getByRole('button', { name: /^category$/i }))`, `await userEvent.click(screen.getByText('Federal Tax'))`, set an amount if required, click Save, and `expect(onSave.mock.calls[0][0]).toMatchObject({ categoryId: 'tax', subId: 'fed' })`. Add a second test that selecting a plain category yields `subId` absent/null.

- [ ] **Step 3: Run** the new tests → FAIL.

- [ ] **Step 4: Implement.**
  - Import: `import CategoryPicker from './CategoryPicker.jsx';`
  - Add state: `const [subId, setSubId] = useState(transaction?.subId ?? null);`
  - Replace the Category `<select>...</select>` (keep the surrounding `<div className="field">` + Split button) with:
    ```jsx
    <CategoryPicker categories={categories} value={{ categoryId, subId }}
      onChange={({ categoryId: c, subId: s }) => { setCategoryId(c); setSubId(s); }} ariaLabel="Category" />
    ```
  - In `save`, add `subId` to the payload: `...(subId ? { subId } : {})` (place alongside `categoryId`).

- [ ] **Step 5: Run** `npx vitest run src/TransactionEditor.test.jsx` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/TransactionEditor.jsx src/TransactionEditor.test.jsx
git commit -m "feat(txn): pick sub-categories via CategoryPicker; persist subId"
```

---

## Task 7: `SplitsEditor` adopts `CategoryPicker` per line

**Files:** Modify `src/SplitsEditor.jsx`; Test `src/SplitsEditor.test.jsx`

- [ ] **Step 1: Read** `src/SplitsEditor.jsx` (the per-line Category `<select>` ~`112-120`, `updateLine`, the Category/Transfer `toggleType`).

- [ ] **Step 2: Write failing test.** Add to `src/SplitsEditor.test.jsx` (categories must include a sub, e.g. add `subcategories: [{ id: 'sub_h', name: 'Soap Sub', keywords: [] }]` to `c_household` in a local `categories` override):

```js
it('selecting a sub on a line carries subId through onDone', async () => {
  const cats = [
    { id: 'c_grocery', name: 'Groceries', icon: '🛒', flow: 'expense', subcategories: [] },
    { id: 'c_household', name: 'Household', icon: '🧴', flow: 'expense', subcategories: [{ id: 'sub_h', name: 'Soap Sub', keywords: [] }] },
  ];
  const { onDone } = setup({
    categories: cats,
    initialSplits: [
      { id: 's1', amount: -100, categoryId: 'c_grocery', description: '' },
      { id: 's2', amount: -80,  categoryId: 'c_household', description: '' },
    ],
  });
  // Open the second line's picker and choose the sub.
  const triggers = screen.getAllByRole('button', { name: /^category$/i });
  await userEvent.click(triggers[1]);
  await userEvent.click(screen.getByText('Soap Sub'));
  await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
  const line = onDone.mock.calls[0][0].splits.find(s => s.id === 's2');
  expect(line.categoryId).toBe('c_household');
  expect(line.subId).toBe('sub_h');
});
```

- [ ] **Step 3: Run** → FAIL.

- [ ] **Step 4: Implement.**
  - Import `CategoryPicker`.
  - Replace the per-line category `<select aria-label="Category">...</select>` with:
    ```jsx
    <CategoryPicker categories={categories} value={{ categoryId: line.categoryId, subId: line.subId || null }}
      onChange={({ categoryId, subId }) => updateLine({ categoryId, subId })} ariaLabel="Category" />
    ```
  - In `toggleType`, when switching a line to **Transfer**, also clear `subId`: `updateLine({ categoryId: undefined, subId: undefined, transferId: line.transferId || \`tr_${line.id}\` })`. When switching back to Category, set `categoryId: categories[0]?.id || ''` (existing) and leave `subId` unset.
  - Confirm `tryDone`'s `onDone({ splits: lines, ... })` passes lines as-is (subId rides along). `validateSplits` ignores `subId`.

- [ ] **Step 5: Run** `npx vitest run src/SplitsEditor.test.jsx` → PASS (existing grouping test that asserted `<optgroup>` must be removed/replaced, since the `<select>` is gone — update it to assert the picker trigger renders instead).

- [ ] **Step 6: Commit**
```bash
git add src/SplitsEditor.jsx src/SplitsEditor.test.jsx
git commit -m "feat(splits): per-line CategoryPicker; lines carry subId"
```

---

## Task 8: `App.jsx` wiring (handleCapture + onDeleteSub)

**Files:** Modify `src/App.jsx`

- [ ] **Step 1: Read** `src/App.jsx` around `handleCapture` (~`347-356`) and `onDeleteSub` (~`456`).

- [ ] **Step 2: Implement handleCapture.** Replace the two `cats.autoCategorize(it.description)` calls so it's called once and both `categoryId` and `subId` are used:

```js
        const ac = cats.autoCategorize(it.description);
        const flow = (categoriesById.get(ac.categoryId)?.flow) || 'expense';
        const sign = flow === 'income' ? 1 : -1;
        ledger.addTransaction({
          accountId: targetId,
          date: it.date || new Date().toISOString().slice(0, 10),
          amount: sign * (Number.isFinite(it.amount) ? it.amount : 0),
          categoryId: ac.categoryId,
          ...(ac.subId ? { subId: ac.subId } : {}),
          description: it.description,
        });
```

- [ ] **Step 3: Implement onDeleteSub.** Change it to release transactions before removing the sub:

```jsx
          onDeleteSub={(catId, subId) => { pushHistory(); ledger.clearSubcategory(subId); cats.deleteSub(catId, subId); }}
```

- [ ] **Step 4: Run** `npx vitest run` → PASS (no App-level test harness; this verifies nothing regressed elsewhere).

- [ ] **Step 5: Commit**
```bash
git add src/App.jsx
git commit -m "feat(app): scanned bills set subId; sub-delete releases transactions"
```

---

## Task 9: Verify

- [ ] **Step 1:** `npx vitest run` → all green.
- [ ] **Step 2:** `npm run build` → succeeds.
- [ ] **Step 3:** `npx eslint src/CategoryPicker.jsx src/categoriesSearch.js src/categoryRules.js src/useLedger.js src/useCategories.js src/TransactionEditor.jsx src/SplitsEditor.jsx` → clean (no new errors).
- [ ] **Step 4: Manual smoke** (`npm run dev`):
  1. New transaction → open the Category picker → type "fed" → pick **Taxes › Federal Tax** → Save → reopen → it shows `Taxes › Federal Tax`.
  2. Split a transaction → pick a sub on a line → Save → reopen splits → the line keeps its sub.
  3. Manage Categories → delete a sub that's in use → the transaction falls back to the plain parent (and **Undo** restores the sub + the assignment).
  4. (If you have an API key) scan a bill whose text contains a sub keyword → the new transaction lands in that sub.
- [ ] **Step 5:** Commit any cleanup if needed.

---

## Self-review notes

- **Spec coverage:** subId data model (Tasks 4,6,7); flattenForPicker/filterOptions (2); CategoryPicker indented tree (3); adoption in both editors (6,7); sub-aware autoCategorize + handleCapture (1,8); clearSubcategory + onDeleteSub release (4,8); applyCategoryToItems clears subId (5); reports/validateSplits untouched ✓. Per-sub report breakdown intentionally absent (Branch 3b).
- **Name consistency:** `autoCategorize` → `{categoryId, subId}` consumed by `handleCapture` (Task 8) and used by `CategoryPicker` only via `value`/`onChange` `{categoryId, subId}` (Tasks 3,6,7); `clearSubcategory(subId)` defined in Task 4, called in Task 8; option shape `{kind, categoryId, subId, name, path, flow, icon}` consistent between Task 2 (producer) and Task 3 (consumer).
- **Placeholders:** Task 6 Step 2 intentionally describes adapting to the suite's existing `setup` (the file's render helper differs); the concrete assertions are specified. All other steps have complete code.
- **Risk note:** the existing `SplitsEditor` "renders category options grouped into flow optgroups" test MUST be replaced (the `<select>`/`<optgroup>` is removed) — called out in Task 7 Step 5.
