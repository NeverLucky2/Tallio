# Sub-categories (Plan 1 of 2): Core & Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the sub-category data model and the full Manage-Categories UI to create, rename, search, delete, and promote-into sub-categories — without yet tagging transactions (that's Plan 2).

**Architecture:** Each category gains a nested `subcategories: [{ id, name, keywords }]` array (subs inherit parent flow + color). `useCategories` gets sub CRUD + a `promoteKeywordToSub` helper, normalized on load. The Manage screen gains a search box, sub-count badges, and a drill-down: a category's panel lists its subs; clicking one opens a dedicated `SubcategoryEditor`. All new mutations reuse the existing `pushHistory()` undo wiring from the Undo-everywhere feature.

**Tech Stack:** React 19, Vite, Vitest + @testing-library/react (no jest-dom — assert via DOM props like `.disabled`/`.textContent`/`.getByText`). Single test file: `npx vitest run <path>`; full suite: `npx vitest run`.

**Spec:** `docs/superpowers/specs/2026-06-03-subcategories-design.md` (this plan covers the data model, sub CRUD, promote, search, and Manage-screen sections; Plan 2 covers `subId` on transactions, the `CategoryPicker`, auto-categorize, and reports).

**Scope boundary (read before starting):** Do NOT add `subId` to transactions, the `CategoryPicker`, auto-categorize changes, `ledger.clearSubcategory`, or report roll-up here. `deleteSub` in this plan simply removes the sub (no transactions reference it yet). Those belong to Plan 2.

---

### Task 1: `normalizeCategories` + apply on load

**Files:**
- Modify: `src/categoriesDefaults.js`
- Modify: `src/useCategories.js` (`seed()` ~line 9, `load()` ~lines 13-23)
- Test: `src/categoriesDefaults.test.js`, `src/useCategories.test.jsx`

- [ ] **Step 1: Write the failing test** — append to `src/categoriesDefaults.test.js` (file imports `{ describe, it, expect }`; add `normalizeCategories` to the existing import from `./categoriesDefaults.js`):

```js
describe('normalizeCategories', () => {
  it('adds an empty subcategories array to a category that lacks one', () => {
    const out = normalizeCategories([{ id: 'c1', name: 'Taxes', keywords: [] }]);
    expect(out[0].subcategories).toEqual([]);
  });

  it('preserves existing subs and fills a missing keywords array on each', () => {
    const out = normalizeCategories([
      { id: 'c1', name: 'Taxes', keywords: [], subcategories: [{ id: 's1', name: 'Federal Tax' }] },
    ]);
    expect(out[0].subcategories[0]).toEqual({ id: 's1', name: 'Federal Tax', keywords: [] });
  });

  it('is idempotent', () => {
    const once = normalizeCategories([{ id: 'c1', name: 'Taxes', keywords: [] }]);
    const twice = normalizeCategories(once);
    expect(twice).toEqual(once);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/categoriesDefaults.test.js`
Expected: FAIL — `normalizeCategories is not exported` / `is not a function`.

- [ ] **Step 3: Add the export** at the end of `src/categoriesDefaults.js`:

```js
// Ensure every category has a subcategories array, and every sub has a keywords
// array. Idempotent; returns a fresh array. Run on load so stored data created
// before sub-categories existed gets the new shape.
export function normalizeCategories(categories) {
  const list = Array.isArray(categories) ? categories : [];
  return list.map(c => ({
    ...c,
    subcategories: (Array.isArray(c.subcategories) ? c.subcategories : []).map(s => ({
      ...s,
      keywords: Array.isArray(s.keywords) ? s.keywords : [],
    })),
  }));
}
```

- [ ] **Step 4: Apply it in `src/useCategories.js`.** Add `normalizeCategories` to the import from `./categoriesDefaults.js`. Change `seed()`:

```js
function seed() {
  return normalizeCategories(withTransferSeeds(DEFAULT_CATEGORIES.map(c => ({ ...c, id: nanoid(8) }))));
}
```

And the hydrate path in `load()` — change the final return:

```js
    return normalizeCategories(withBackfillCategories(withTransferSeeds(parsed)));
```

- [ ] **Step 5: Write the failing hook test** — append inside the `describe('useCategories', …)` block in `src/useCategories.test.jsx`:

```jsx
  it('normalizes every seeded category to have a subcategories array', () => {
    const { result } = renderHook(() => useCategories());
    for (const c of result.current.categories) {
      expect(Array.isArray(c.subcategories)).toBe(true);
    }
  });
```

- [ ] **Step 5b: Update the one existing test that breaks.** `normalizeCategories` now adds `subcategories: []` to every loaded category, so the exact-object assertion in the existing `'hydrates from localStorage and appends any missing transfer seeds'` test must include it. In `src/useCategories.test.jsx`, change:

```jsx
    expect(result.current.categories.find(c => c.id === 'cz')).toEqual(seeded[0]);
```

to:

```jsx
    expect(result.current.categories.find(c => c.id === 'cz')).toEqual({ ...seeded[0], subcategories: [] });
```

(The length assertions in that test and the other load tests are unaffected — `normalizeCategories` never adds or removes categories.)

- [ ] **Step 6: Run both test files**

Run: `npx vitest run src/categoriesDefaults.test.js src/useCategories.test.jsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/categoriesDefaults.js src/categoriesDefaults.test.js src/useCategories.js src/useCategories.test.jsx
git commit -m "feat(subs): add normalizeCategories and apply on load"
```

---

### Task 2: Sub CRUD in `useCategories`

**Files:**
- Modify: `src/useCategories.js`
- Test: `src/useCategories.test.jsx`

- [ ] **Step 1: Write the failing tests** — append inside the `describe('useCategories', …)` block:

```jsx
  it('addSub appends a sub with a fresh id and empty keywords; returns the id', () => {
    const { result } = renderHook(() => useCategories());
    const taxes = result.current.categories.find(c => c.name === 'Taxes');
    let subId;
    act(() => { subId = result.current.addSub(taxes.id, { name: 'Federal Tax' }); });
    const sub = result.current.getById(taxes.id).subcategories.find(s => s.id === subId);
    expect(sub.name).toBe('Federal Tax');
    expect(sub.keywords).toEqual([]);
  });

  it('updateSub patches name without changing the sub id', () => {
    const { result } = renderHook(() => useCategories());
    const taxes = result.current.categories.find(c => c.name === 'Taxes');
    let subId;
    act(() => { subId = result.current.addSub(taxes.id, { name: 'Fed' }); });
    act(() => { result.current.updateSub(taxes.id, subId, { name: 'Federal Tax' }); });
    const sub = result.current.getById(taxes.id).subcategories.find(s => s.id === subId);
    expect(sub.name).toBe('Federal Tax');
    expect(sub.id).toBe(subId);
  });

  it('deleteSub removes the sub', () => {
    const { result } = renderHook(() => useCategories());
    const taxes = result.current.categories.find(c => c.name === 'Taxes');
    let subId;
    act(() => { subId = result.current.addSub(taxes.id, { name: 'Federal Tax' }); });
    act(() => { result.current.deleteSub(taxes.id, subId); });
    expect(result.current.getById(taxes.id).subcategories.find(s => s.id === subId)).toBeUndefined();
  });

  it('addSubKeyword uppercases and dedupes; removeSubKeyword strips', () => {
    const { result } = renderHook(() => useCategories());
    const taxes = result.current.categories.find(c => c.name === 'Taxes');
    let subId;
    act(() => { subId = result.current.addSub(taxes.id, { name: 'Federal Tax' }); });
    act(() => { result.current.addSubKeyword(taxes.id, subId, 'federal tax'); });
    act(() => { result.current.addSubKeyword(taxes.id, subId, 'FEDERAL TAX'); });
    let sub = result.current.getById(taxes.id).subcategories.find(s => s.id === subId);
    expect(sub.keywords).toEqual(['FEDERAL TAX']);
    act(() => { result.current.removeSubKeyword(taxes.id, subId, 'FEDERAL TAX'); });
    sub = result.current.getById(taxes.id).subcategories.find(s => s.id === subId);
    expect(sub.keywords).toEqual([]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/useCategories.test.jsx`
Expected: FAIL — `result.current.addSub is not a function`.

- [ ] **Step 3: Add the methods** in `src/useCategories.js`, just after `removeTemplate` (around line 124):

```js
  const addSub = useCallback((catId, { name } = {}) => {
    const id = nanoid(8);
    const nm = (name || '').trim() || 'New sub-category';
    setCategories(prev => prev.map(c =>
      c.id !== catId ? c : { ...c, subcategories: [...(c.subcategories || []), { id, name: nm, keywords: [] }] }
    ));
    return id;
  }, []);

  const updateSub = useCallback((catId, subId, patch) => {
    setCategories(prev => prev.map(c => {
      if (c.id !== catId) return c;
      return { ...c, subcategories: (c.subcategories || []).map(s => s.id === subId ? { ...s, ...patch, id: s.id } : s) };
    }));
  }, []);

  const deleteSub = useCallback((catId, subId) => {
    setCategories(prev => prev.map(c =>
      c.id !== catId ? c : { ...c, subcategories: (c.subcategories || []).filter(s => s.id !== subId) }
    ));
  }, []);

  const addSubKeyword = useCallback((catId, subId, raw) => {
    const kw = (raw || '').trim().toUpperCase();
    if (!kw) return;
    setCategories(prev => prev.map(c => {
      if (c.id !== catId) return c;
      return { ...c, subcategories: (c.subcategories || []).map(s => {
        if (s.id !== subId) return s;
        if ((s.keywords || []).includes(kw)) return s;
        return { ...s, keywords: [...(s.keywords || []), kw] };
      }) };
    }));
  }, []);

  const removeSubKeyword = useCallback((catId, subId, keyword) => {
    const kw = (keyword || '').toUpperCase();
    setCategories(prev => prev.map(c => {
      if (c.id !== catId) return c;
      return { ...c, subcategories: (c.subcategories || []).map(s =>
        s.id === subId ? { ...s, keywords: (s.keywords || []).filter(k => k !== kw) } : s
      ) };
    }));
  }, []);
```

Add them to the returned object (next to `removeTemplate`):

```js
    addSub,
    updateSub,
    deleteSub,
    addSubKeyword,
    removeSubKeyword,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/useCategories.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/useCategories.js src/useCategories.test.jsx
git commit -m "feat(subs): sub CRUD (add/update/delete + keywords) in useCategories"
```

---

### Task 3: `promoteKeywordToSub` in `useCategories`

**Files:**
- Modify: `src/useCategories.js`
- Test: `src/useCategories.test.jsx`

- [ ] **Step 1: Write the failing test** — append inside the `describe('useCategories', …)` block:

```jsx
  it('promoteKeywordToSub moves a parent keyword onto a new Title-Cased sub', () => {
    const { result } = renderHook(() => useCategories());
    const taxes = result.current.categories.find(c => c.name === 'Taxes');
    let subId;
    act(() => { subId = result.current.promoteKeywordToSub(taxes.id, 'FEDERAL TAX'); });
    const cat = result.current.getById(taxes.id);
    expect(cat.keywords).not.toContain('FEDERAL TAX');
    const sub = cat.subcategories.find(s => s.id === subId);
    expect(sub.name).toBe('Federal Tax');
    expect(sub.keywords).toEqual(['FEDERAL TAX']);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useCategories.test.jsx`
Expected: FAIL — `result.current.promoteKeywordToSub is not a function`.

- [ ] **Step 3: Add the method** in `src/useCategories.js`, after `removeSubKeyword`:

```js
  const promoteKeywordToSub = useCallback((catId, keyword) => {
    const kw = (keyword || '').trim().toUpperCase();
    if (!kw) return null;
    const id = nanoid(8);
    const name = kw.toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());
    setCategories(prev => prev.map(c => {
      if (c.id !== catId) return c;
      return {
        ...c,
        keywords: (c.keywords || []).filter(k => k !== kw),
        subcategories: [...(c.subcategories || []), { id, name, keywords: [kw] }],
      };
    }));
    return id;
  }, []);
```

Add `promoteKeywordToSub,` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useCategories.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/useCategories.js src/useCategories.test.jsx
git commit -m "feat(subs): promoteKeywordToSub helper"
```

---

### Task 4: `categoriesSearch.js` — list filter

**Files:**
- Create: `src/categoriesSearch.js`
- Test: `src/categoriesSearch.test.js`

- [ ] **Step 1: Write the failing test** — create `src/categoriesSearch.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { filterCategoriesByQuery } from './categoriesSearch.js';

const cats = [
  { id: 'c1', name: 'Taxes', subcategories: [{ id: 's1', name: 'Federal Tax', keywords: [] }] },
  { id: 'c2', name: 'Groceries', subcategories: [] },
];

describe('filterCategoriesByQuery', () => {
  it('returns all categories for an empty query', () => {
    expect(filterCategoriesByQuery(cats, '')).toHaveLength(2);
  });

  it('matches on category name (case-insensitive)', () => {
    expect(filterCategoriesByQuery(cats, 'groc').map(c => c.id)).toEqual(['c2']);
  });

  it('matches a category when one of its sub names matches', () => {
    expect(filterCategoriesByQuery(cats, 'federal').map(c => c.id)).toEqual(['c1']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterCategoriesByQuery(cats, 'zzz')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/categoriesSearch.test.js`
Expected: FAIL — cannot resolve `./categoriesSearch.js`.

- [ ] **Step 3: Create `src/categoriesSearch.js`:**

```js
// Pure search helpers for categories. filterCategoriesByQuery powers the Manage
// screen list search; a category matches if its name or any sub name contains
// the query (case-insensitive). Empty query returns the list unchanged.
export function filterCategoriesByQuery(categories, query) {
  const list = Array.isArray(categories) ? categories : [];
  const q = (query || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter(c => {
    if ((c.name || '').toLowerCase().includes(q)) return true;
    return (c.subcategories || []).some(s => (s.name || '').toLowerCase().includes(q));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/categoriesSearch.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/categoriesSearch.js src/categoriesSearch.test.js
git commit -m "feat(subs): categoriesSearch list filter helper"
```

---

### Task 5: Optional `onPromote` action on `ChipEditor`

**Files:**
- Modify: `src/ChipEditor.jsx`
- Test: `src/ChipEditor.test.jsx`

- [ ] **Step 1: Write the failing test** — append inside the existing `describe` in `src/ChipEditor.test.jsx` (file imports `render`, `screen`, `userEvent`, `vi`, `cleanup`; if a specific import is missing, add it):

```jsx
  it('renders a promote button per chip only when onPromote is provided, and calls it', async () => {
    const onPromote = vi.fn();
    render(<ChipEditor values={['FEDERAL TAX']} onAdd={() => {}} onRemove={() => {}} onPromote={onPromote} placeholder="kw" />);
    const btn = screen.getByRole('button', { name: /promote federal tax/i });
    await userEvent.click(btn);
    expect(onPromote).toHaveBeenCalledWith('FEDERAL TAX');
  });

  it('renders no promote button when onPromote is omitted', () => {
    render(<ChipEditor values={['FEDERAL TAX']} onAdd={() => {}} onRemove={() => {}} placeholder="kw" />);
    expect(screen.queryByRole('button', { name: /promote/i })).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ChipEditor.test.jsx`
Expected: FAIL — no element with name `/promote federal tax/i`.

- [ ] **Step 3: Add the optional action** in `src/ChipEditor.jsx`. Change the signature to accept `onPromote`:

```jsx
export default function ChipEditor({ values, onAdd, onRemove, onPromote, placeholder }) {
```

And inside the `.map(v => …)` chip, add a promote button before the remove button:

```jsx
        <span key={v} className="chip">
          {v}
          {onPromote && (
            <button
              type="button"
              className="chip-promote"
              aria-label={`Promote ${v} to sub-category`}
              title="Make this a sub-category"
              onClick={() => onPromote(v)}
              style={{ marginLeft: 4 }}
            >
              ↑
            </button>
          )}
          <button
            type="button"
            className="chip-remove"
            aria-label={`Remove ${v}`}
            onClick={() => onRemove(v)}
          >
            ×
          </button>
        </span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ChipEditor.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ChipEditor.jsx src/ChipEditor.test.jsx
git commit -m "feat(subs): optional promote action on ChipEditor"
```

---

### Task 6: `SubcategoryEditor` component

**Files:**
- Create: `src/SubcategoryEditor.jsx`
- Test: `src/SubcategoryEditor.test.jsx`

- [ ] **Step 1: Write the failing test** — create `src/SubcategoryEditor.test.jsx`:

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubcategoryEditor from './SubcategoryEditor.jsx';

const category = { id: 'c1', name: 'Taxes' };
const sub = { id: 's1', name: 'Federal Tax', keywords: ['FEDERAL TAX'] };

function setup(overrides = {}) {
  const props = {
    category, sub,
    onBack: vi.fn(), onUpdate: vi.fn(),
    onAddKeyword: vi.fn(), onRemoveKeyword: vi.fn(), onDelete: vi.fn(),
    ...overrides,
  };
  render(<SubcategoryEditor {...props} />);
  return props;
}

describe('SubcategoryEditor', () => {
  afterEach(() => cleanup());

  it('shows the breadcrumb and the parent › sub path', () => {
    setup();
    expect(screen.getByRole('button', { name: /back to taxes/i })).toBeTruthy();
    expect(screen.getByText(/taxes › federal tax/i)).toBeTruthy();
  });

  it('commits a renamed sub on blur', async () => {
    const { onUpdate } = setup();
    const input = screen.getByDisplayValue('Federal Tax');
    await userEvent.clear(input);
    await userEvent.type(input, 'Fed Tax');
    await userEvent.tab();
    expect(onUpdate).toHaveBeenCalledWith({ name: 'Fed Tax' });
  });

  it('calls onBack and onDelete', async () => {
    const { onBack, onDelete } = setup();
    await userEvent.click(screen.getByRole('button', { name: /back to taxes/i }));
    expect(onBack).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /delete sub-category/i }));
    expect(onDelete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/SubcategoryEditor.test.jsx`
Expected: FAIL — cannot resolve `./SubcategoryEditor.jsx`.

- [ ] **Step 3: Create `src/SubcategoryEditor.jsx`** (reuses `cat-editor*` classes and `ChipEditor`, matching `CategoryEditor`'s name-commit pattern):

```jsx
import { useState, useEffect } from 'react';
import ChipEditor from './ChipEditor.jsx';

export default function SubcategoryEditor({ category, sub, onBack, onUpdate, onAddKeyword, onRemoveKeyword, onDelete }) {
  const [name, setName] = useState(sub.name);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    setName(sub.name);
    setNameError('');
  }, [sub.id, sub.name]);

  const commitName = () => {
    const v = name.trim();
    if (!v) { setNameError('Name required'); return; }
    setNameError('');
    if (v !== sub.name) onUpdate({ name: v });
  };

  return (
    <div className="cat-editor">
      <div style={{ marginBottom: 8 }}>
        <button type="button" className="btn" onClick={onBack}>‹ Back to {category.name}</button>
      </div>
      <div className="cat-editor-header">
        <span className="cat-editor-title">{category.name} › {sub.name}</span>
      </div>

      <div className="cat-editor-fields">
        <label className="cat-editor-field">
          <span className="cat-editor-label">Name</span>
          <input
            type="text"
            className="cat-editor-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
          />
          {nameError && <span className="cat-editor-error">{nameError}</span>}
        </label>
      </div>

      <div className="cat-editor-section">
        <div className="cat-editor-section-title">
          Auto-categorize keywords <span className="cat-editor-section-hint">(longest match wins)</span>
        </div>
        <ChipEditor
          values={sub.keywords}
          onAdd={onAddKeyword}
          onRemove={onRemoveKeyword}
          placeholder="Add keyword (e.g. FEDERAL TAX)"
        />
      </div>

      <div className="cat-editor-footer">
        <button type="button" className="btn btn-danger" onClick={onDelete}>Delete sub-category</button>
        <span className="cat-editor-delete-hint">Deleting moves its transactions back to {category.name}.</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/SubcategoryEditor.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/SubcategoryEditor.jsx src/SubcategoryEditor.test.jsx
git commit -m "feat(subs): SubcategoryEditor drill-down component"
```

---

### Task 7: `CategoryEditor` — sub-categories section + promote

**Files:**
- Modify: `src/CategoryEditor.jsx`
- Test: `src/CategoryEditor.test.jsx`

- [ ] **Step 1: Write the failing test** — append inside the `describe('CategoryEditor', …)` block in `src/CategoryEditor.test.jsx`:

```jsx
  it('lists sub-categories, adds one, drills into one, and promotes a keyword', async () => {
    const onAddSub = vi.fn();
    const onEditSub = vi.fn();
    const onPromoteKeyword = vi.fn();
    const withSub = { ...cat, subcategories: [{ id: 's1', name: 'Federal Tax', keywords: ['FEDERAL TAX'] }] };
    render(
      <CategoryEditor
        category={withSub} itemCount={0}
        otherCategories={[]} onMoveAll={() => {}}
        onUpdate={() => {}} onAddKeyword={() => {}} onRemoveKeyword={() => {}}
        onAddTemplate={() => {}} onRemoveTemplate={() => {}} onDelete={() => {}}
        onAddSub={onAddSub} onEditSub={onEditSub} onPromoteKeyword={onPromoteKeyword}
      />
    );
    expect(screen.getByText('Federal Tax')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /add sub-category/i }));
    expect(onAddSub).toHaveBeenCalled();
    await userEvent.click(screen.getByText('Federal Tax'));
    expect(onEditSub).toHaveBeenCalledWith('s1');
    // 'PEOPLES GAS' is the seeded parent keyword on `cat`.
    await userEvent.click(screen.getByRole('button', { name: /promote peoples gas/i }));
    expect(onPromoteKeyword).toHaveBeenCalledWith('PEOPLES GAS');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/CategoryEditor.test.jsx`
Expected: FAIL — no "Federal Tax" text / no "add sub-category" button.

- [ ] **Step 3: Wire `CategoryEditor`.** Add the three new props to the signature (after `onDelete,`):

```jsx
  onDelete,
  onAddSub,
  onEditSub,
  onPromoteKeyword,
}) {
```

Add `onPromote={onPromoteKeyword}` to the **keywords** `ChipEditor` only (not templates):

```jsx
        <ChipEditor
          values={category.keywords}
          onAdd={onAddKeyword}
          onRemove={onRemoveKeyword}
          onPromote={onPromoteKeyword}
          placeholder="Add keyword (e.g. PEOPLES GAS)"
        />
```

Add a new sub-categories section immediately after that keywords `</div>` section and before the Description templates section:

```jsx
      <div className="cat-editor-section">
        <div className="cat-editor-section-title">
          Sub-categories <span className="cat-editor-section-hint">({(category.subcategories || []).length})</span>
        </div>
        <div className="sub-list">
          {(category.subcategories || []).map(s => (
            <button
              key={s.id}
              type="button"
              className="sub-list-row"
              onClick={() => onEditSub(s.id)}
              style={{ display: 'flex', width: '100%', gap: 8, alignItems: 'center', textAlign: 'left', padding: '6px 10px' }}
            >
              <span className="sub-list-name">{s.name}</span>
              {(s.keywords || []).length > 0 && (
                <span className="sub-list-kw" style={{ opacity: 0.6 }}>— {s.keywords.join(', ')}</span>
              )}
              <span style={{ marginLeft: 'auto' }}>›</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={onAddSub}>+ Add sub-category</button>
      </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/CategoryEditor.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/CategoryEditor.jsx src/CategoryEditor.test.jsx
git commit -m "feat(subs): sub-categories section + keyword promote in CategoryEditor"
```

---

### Task 8: `ManageCategoriesScreen` — search, badges, drill-down

**Files:**
- Modify: `src/ManageCategoriesScreen.jsx`
- Test: `src/ManageCategoriesScreen.test.jsx`

- [ ] **Step 1: Write the failing tests** — append inside the `describe('ManageCategoriesScreen', …)` block. Extend the shared `noopProps` first by adding these keys to the existing `noopProps` object (top of file):

```jsx
  onAddSub: () => 's1',
  onUpdateSub: () => {},
  onDeleteSub: () => {},
  onAddSubKeyword: () => {},
  onRemoveSubKeyword: () => {},
  onPromoteKeyword: () => {},
```

Then the new tests:

```jsx
  it('filters the list by the search box (matching category and sub names)', async () => {
    const withSubs = [
      { id: 'c1', name: 'Taxes', icon: '🏛️', color: '#EAB308', keywords: [], templates: [], builtin: true,
        subcategories: [{ id: 's1', name: 'Federal Tax', keywords: [] }] },
      { id: 'c2', name: 'Groceries', icon: '🛒', color: '#10B981', keywords: [], templates: [], builtin: true, subcategories: [] },
    ];
    render(<ManageCategoriesScreen categories={withSubs} {...noopProps} />);
    await userEvent.type(screen.getByPlaceholderText(/search categories/i), 'federal');
    // 'Taxes' stays (its sub matches); 'Groceries' is filtered out of the list.
    const list = document.querySelector('.manage-list');
    expect(list.textContent).toContain('Taxes');
    expect(list.textContent).not.toContain('Groceries');
  });

  it('drills into a sub-category and back', async () => {
    const withSubs = [
      { id: 'c1', name: 'Taxes', icon: '🏛️', color: '#EAB308', keywords: [], templates: [], builtin: true,
        subcategories: [{ id: 's1', name: 'Federal Tax', keywords: [] }] },
    ];
    render(<ManageCategoriesScreen categories={withSubs} {...noopProps} />);
    // The editor lists the sub; clicking it opens the SubcategoryEditor.
    await userEvent.click(screen.getByText('Federal Tax'));
    expect(screen.getByText(/taxes › federal tax/i)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /back to taxes/i }));
    expect(screen.getByText(/editing: taxes/i)).toBeTruthy();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ManageCategoriesScreen.test.jsx`
Expected: FAIL — no search box / no drill-down.

- [ ] **Step 3: Wire `ManageCategoriesScreen`.** Add imports:

```jsx
import SubcategoryEditor from './SubcategoryEditor.jsx';
import { filterCategoriesByQuery } from './categoriesSearch.js';
```

Add the new props to the destructure (after `undoCount = 0,`):

```jsx
  onAddSub,
  onUpdateSub,
  onDeleteSub,
  onAddSubKeyword,
  onRemoveSubKeyword,
  onPromoteKeyword,
}) {
```

Add state for the query and the drilled-in sub (next to `selectedId`):

```jsx
  const [query, setQuery] = useState('');
  const [editingSubId, setEditingSubId] = useState(null);
```

Compute the visible (filtered) list and the drilled-in sub. Add after `const selected = …`:

```jsx
  const visibleCategories = useMemo(() => filterCategoriesByQuery(categories, query), [categories, query]);
  const editingSub = selected && editingSubId
    ? (selected.subcategories || []).find(s => s.id === editingSubId)
    : null;
```

Add the sub handlers near `handleAdd`:

```jsx
  const handleAddSub = () => {
    const id = onAddSub(selected.id);
    setEditingSubId(id);
  };
  const selectCategory = (id) => {
    setSelectedId(id);
    setEditingSubId(null);
  };
```

In the list: add the search input at the top of `<aside className="manage-list">`, switch the group source to `visibleCategories`, use `selectCategory` on row click, and add a sub-count badge. Replace the whole `<aside …> … </aside>` block with:

```jsx
        <aside className="manage-list">
          <input
            type="search"
            className="cat-editor-input"
            placeholder="Search categories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: '100%', marginBottom: 8 }}
          />
          <div className="manage-list-title">{visibleCategories.length} categories</div>
          {groupCategoriesByFlow(visibleCategories).map(group => (
              <div key={group.flow} className="manage-list-flow-group">
                <div className="manage-list-flow-label">{group.flow}</div>
                {group.items.map(cat => {
                  const count = itemCounts.get(cat.id) || 0;
                  const subCount = (cat.subcategories || []).length;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`manage-list-row${cat.id === selectedId ? ' active' : ''}`}
                      onClick={() => selectCategory(cat.id)}
                    >
                      <span
                        className="manage-list-icon"
                        style={{ background: `${cat.color}22`, border: `1px solid ${cat.color}44` }}
                      >
                        {cat.icon}
                      </span>
                      <span className="manage-list-name">{cat.name}</span>
                      {subCount > 0 && (
                        <span className="manage-list-subcount" title={`${subCount} sub-categories`} style={{ opacity: 0.7, fontSize: '0.8em' }}>⊞{subCount}</span>
                      )}
                      <span className="manage-list-count">{count}</span>
                    </button>
                  );
                })}
              </div>
          ))}
        </aside>
```

Replace the `<main className="manage-editor">…</main>` block so it renders the SubcategoryEditor when drilled in, else the CategoryEditor (now with the three sub props):

```jsx
        <main className="manage-editor">
          {selected ? (
            editingSub ? (
              <SubcategoryEditor
                key={editingSub.id}
                category={selected}
                sub={editingSub}
                onBack={() => setEditingSubId(null)}
                onUpdate={(patch) => onUpdateSub(selected.id, editingSub.id, patch)}
                onAddKeyword={(kw) => onAddSubKeyword(selected.id, editingSub.id, kw)}
                onRemoveKeyword={(kw) => onRemoveSubKeyword(selected.id, editingSub.id, kw)}
                onDelete={() => { onDeleteSub(selected.id, editingSub.id); setEditingSubId(null); }}
              />
            ) : (
              <CategoryEditor
                key={selected.id}
                category={selected}
                itemCount={itemCounts.get(selected.id) || 0}
                otherCategories={otherCategories}
                onMoveAll={(targetId) => onMoveAll(selected.id, targetId)}
                onUpdate={(patch) => onUpdateCategory(selected.id, patch)}
                onAddKeyword={(kw) => onAddKeyword(selected.id, kw)}
                onRemoveKeyword={(kw) => onRemoveKeyword(selected.id, kw)}
                onAddTemplate={(t) => onAddTemplate(selected.id, t)}
                onRemoveTemplate={(t) => onRemoveTemplate(selected.id, t)}
                onDelete={() => onDeleteCategory(selected.id)}
                onAddSub={handleAddSub}
                onEditSub={(subId) => setEditingSubId(subId)}
                onPromoteKeyword={(kw) => onPromoteKeyword(selected.id, kw)}
              />
            )
          ) : (
            <p className="manage-empty">No category selected.</p>
          )}
        </main>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ManageCategoriesScreen.test.jsx`
Expected: PASS (existing tests stay green; `noopProps` now supplies the sub handlers).

- [ ] **Step 5: Commit**

```bash
git add src/ManageCategoriesScreen.jsx src/ManageCategoriesScreen.test.jsx
git commit -m "feat(subs): search box, sub-count badges, and sub drill-down in Manage screen"
```

---

### Task 9: Wire sub CRUD handlers in `App.jsx`

**Files:**
- Modify: `src/App.jsx` (the `<ManageCategoriesScreen … />` element)

No unit test (App wiring is verified in-app; consistent with the rest of the app). Verified in Task 10.

- [ ] **Step 1: Pass the six sub handlers**, each wrapped with `pushHistory()` so they join the existing undo history. Add them to the `<ManageCategoriesScreen>` props, right after the `onMoveAll={() => {}}` line:

```jsx
          onMoveAll={() => {}}
          onAddSub={(catId) => { pushHistory(); return cats.addSub(catId, {}); }}
          onUpdateSub={(catId, subId, patch) => { pushHistory(); cats.updateSub(catId, subId, patch); }}
          onDeleteSub={(catId, subId) => { pushHistory(); cats.deleteSub(catId, subId); }}
          onAddSubKeyword={(catId, subId, kw) => { pushHistory(); cats.addSubKeyword(catId, subId, kw); }}
          onRemoveSubKeyword={(catId, subId, kw) => { pushHistory(); cats.removeSubKeyword(catId, subId, kw); }}
          onPromoteKeyword={(catId, kw) => { pushHistory(); return cats.promoteKeywordToSub(catId, kw); }}
          onUndo={undo}
          undoCount={history.length}
        />
```

(Keep the existing `onUndo`/`undoCount` lines — shown here for placement; do not duplicate them.)

- [ ] **Step 2: Run the suite + lint**

Run: `npx vitest run && npx eslint src/App.jsx`
Expected: PASS / only the pre-existing line-59 `stream` warning.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat(subs): wire sub CRUD + promote with undo history in App"
```

---

### Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite.**

Run: `npx vitest run`
Expected: PASS — all files green, including the new `categoriesSearch`, `SubcategoryEditor`, and the extended `useCategories`/`CategoryEditor`/`ManageCategoriesScreen`/`ChipEditor` tests.

- [ ] **Step 2: Lint the changed files.**

Run: `npx eslint src/categoriesDefaults.js src/useCategories.js src/categoriesSearch.js src/ChipEditor.jsx src/SubcategoryEditor.jsx src/CategoryEditor.jsx src/ManageCategoriesScreen.jsx src/App.jsx`
Expected: no new errors (the only acceptable warnings are pre-existing: `App.jsx:59`, `useCategories.js:45`).

- [ ] **Step 3: Manual in-app checks** (`npm run dev` → Manage Categories):
  - Type in the search box → the list filters by category and by sub name.
  - Select a category → its panel shows a "Sub-categories (n)" section. Click **+ Add sub-category** → it drills into a new sub; rename it; add a keyword; **‹ Back** returns to the category.
  - Click the **↑** on a parent keyword chip → it disappears from the parent and appears as a new sub (Title-Cased) carrying that keyword.
  - Each list row shows a sub-count badge when the category has subs.
  - **Undo** (header button or Ctrl+Z) reverts the last sub action (add/rename/delete/promote).

- [ ] **Step 4:** Feature complete on the branch — proceed to finishing-a-development-branch.

---

## Notes for the implementer

- **`deleteSub` is intentionally minimal here.** Plan 2 adds `subId` to transactions and a `ledger.clearSubcategory(subId)` call before `cats.deleteSub` so deleting a sub releases its transactions to the parent. In this plan no transaction carries a `subId` yet, so plain removal is correct.
- **Subs inherit flow + color** — there is deliberately no icon/color/flow/template UI on a sub.
- **Undo reuse:** every new mutation goes through `pushHistory()`, and `useCategories.snapshot()/restore()` (added in the Undo feature) already capture `subcategories` since they're part of each category object — so sub edits are undoable with no extra snapshot work.
