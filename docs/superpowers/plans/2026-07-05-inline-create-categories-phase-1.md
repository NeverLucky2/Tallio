# Inline Create — Phase 1: Categories Everywhere — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user create a new category (or sub-category) directly from the transaction category picker, the transfer Type selector, and the register category filter — auto-selected, without leaving the task.

**Architecture:** A new lightweight `QuickCreateCategory` nested dialog captures name + icon + flow. `CategoryPicker` gains optional, backward-compatible props to (a) show a "＋ New category" footer that opens the dialog, (b) show a per-parent "＋ sub" affordance, and (c) render an "— None —" option. The transfer Type `<select>` is replaced by `CategoryPicker`; the register filter `<select>` gets a "＋ New category…" sentinel option. All creation routes through App handlers that wrap the existing `useCategories` hooks in `pushHistory()`, so persistence and single-step Undo come for free.

**Tech Stack:** React (function components + hooks), Vitest + @testing-library/react + @testing-library/user-event, localStorage-backed hooks.

## Global Constraints

- Test runner: `npx vitest run` (Vitest 4). Component tests use `@testing-library/react` + `userEvent`, query by role/label, `afterEach(() => cleanup())`.
- The full suite (currently **1011 tests**) must stay green at every commit.
- All new `CategoryPicker` props are **optional**; omitting them must leave existing behavior and the 5 existing `CategoryPicker.test.jsx` tests unchanged.
- Creation persists via existing hooks that already `return id` synchronously: `useCategories.addCategory({ name, icon, color, flow }) → id` and `addSub(catId, { name }) → subId`. Valid flows: `income | expense | savings | transfer`.
- Undo: App wraps every mutation as `(...) => { pushHistory(); return cats.addX(...); }` — mirror exactly (see `App.jsx:555`, `App.jsx:563`).
- Icon field in the quick form is a plain emoji `<input maxLength={4}>` (like `AccountTypeEditor.jsx:34-36`), **not** `IconPicker` (which needs the icon-library context and is heavier than a quick form warrants).
- Work on branch `feat/fable-redesign`. Match existing code style (2-space indent, semicolons, single quotes).

---

## File Structure

- **Create** `src/QuickCreateCategory.jsx` — the nested quick-create dialog (name/icon/flow). One responsibility: collect a new category's essentials and emit them.
- **Create** `src/QuickCreateCategory.test.jsx` — unit tests for the dialog.
- **Modify** `src/CategoryPicker.jsx` — add create-footer, sub-add, and none affordances (all opt-in).
- **Modify** `src/CategoryPicker.test.jsx` — add tests for the new affordances (keep existing 5).
- **Modify** `src/TransactionEditor.jsx:110-113` — pass create/sub handlers + `createFlow` to the picker.
- **Modify** `src/TransactionEditor.test.jsx` — test create wiring.
- **Modify** `src/TransferEditor.jsx:115-120` — replace Type `<select>` with `CategoryPicker`.
- **Modify** `src/TransferEditor.test.jsx` — test Type picker + create + None.
- **Modify** `src/Register.jsx:123-130` — add "＋ New category…" sentinel + dialog.
- **Modify** `src/Register.test.jsx` — test the filter create flow.
- **Modify** `src/App.jsx` — pass `onAddCategory` / `onAddSub` to `TransactionEditor` (`:651`), `TransferEditor` (`:664`), and `Register` (`:753`).

---

## Task 1: `QuickCreateCategory` dialog

**Files:**
- Create: `src/QuickCreateCategory.jsx`
- Test: `src/QuickCreateCategory.test.jsx`

**Interfaces:**
- Produces: `QuickCreateCategory({ initialName?, flow?, lockFlow?, onSubmit, onCancel })`.
  - `onSubmit({ name, icon, flow })` — `name` trimmed non-empty; `icon` defaults `'📋'`; `flow` is `flow` when `lockFlow`, else the user's choice.
  - Renders a Flow `<select aria-label="Flow">` only when `!lockFlow`.

- [ ] **Step 1: Write the failing test**

```jsx
// src/QuickCreateCategory.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickCreateCategory from './QuickCreateCategory.jsx';

describe('QuickCreateCategory', () => {
  afterEach(() => cleanup());

  it('prefills the name and submits trimmed name + icon + chosen flow', async () => {
    const onSubmit = vi.fn();
    render(<QuickCreateCategory initialName="Vet bills" onSubmit={onSubmit} onCancel={vi.fn()} />);
    // default flow is expense
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Vet bills', icon: '📋', flow: 'expense' });
  });

  it('lets the user change the flow when not locked', async () => {
    const onSubmit = vi.fn();
    render(<QuickCreateCategory initialName="Bonus" flow="expense" onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/flow/i), 'income');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onSubmit.mock.calls[0][0].flow).toBe('income');
  });

  it('hides the flow selector and forces flow when locked', async () => {
    const onSubmit = vi.fn();
    render(<QuickCreateCategory initialName="Reimb" flow="transfer" lockFlow onSubmit={onSubmit} onCancel={vi.fn()} />);
    expect(screen.queryByLabelText(/flow/i)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onSubmit.mock.calls[0][0].flow).toBe('transfer');
  });

  it('disables Add for an empty/whitespace name and Cancel calls onCancel', async () => {
    const onCancel = vi.fn();
    render(<QuickCreateCategory initialName="   " onSubmit={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/QuickCreateCategory.test.jsx`
Expected: FAIL — cannot resolve `./QuickCreateCategory.jsx`.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/QuickCreateCategory.jsx
import React, { useState } from 'react';

const FLOWS = [
  { value: 'income',  label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'savings', label: 'Savings' },
];

export default function QuickCreateCategory({ initialName = '', flow = 'expense', lockFlow = false, onSubmit, onCancel }) {
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState('📋');
  const [flowValue, setFlowValue] = useState(
    ['income', 'expense', 'savings'].includes(flow) ? flow : 'expense'
  );

  const trimmed = name.trim();
  const submit = () => {
    if (!trimmed) return;
    onSubmit({ name: trimmed, icon: icon.trim() || '📋', flow: lockFlow ? flow : flowValue });
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-card dialog-card-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">New category</h2>

        <label className="field"><span>Name</span>
          <input type="text" aria-label="Category name" className="input" autoFocus
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
        </label>

        <label className="field"><span>Icon</span>
          <input type="text" aria-label="Icon" className="input" maxLength={4}
            value={icon} onChange={(e) => setIcon(e.target.value)} />
        </label>

        {!lockFlow && (
          <label className="field"><span>Type</span>
            <select aria-label="Flow" className="select" value={flowValue} onChange={(e) => setFlowValue(e.target.value)}>
              {FLOWS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!trimmed}>Add</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/QuickCreateCategory.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/QuickCreateCategory.jsx src/QuickCreateCategory.test.jsx
git commit -m "feat(categories): QuickCreateCategory quick-add dialog"
```

---

## Task 2: `CategoryPicker` — "＋ New category" footer

**Files:**
- Modify: `src/CategoryPicker.jsx`
- Test: `src/CategoryPicker.test.jsx`

**Interfaces:**
- Consumes: `QuickCreateCategory` (Task 1).
- Produces: `CategoryPicker` gains props `onCreateCategory({ name, icon, flow }) => id`, `createFlow = 'expense'`, `lockCreateFlow = false`. When `onCreateCategory` is set and the typed query is non-empty and does not exactly match an existing category name, a footer button "＋ New category "<query>"" appears; activating it opens `QuickCreateCategory`, and on submit it calls `onCreateCategory`, selects `{ categoryId: id, subId: null }`, and closes.

- [ ] **Step 1: Write the failing test** (append inside `CategoryPicker.test.jsx`)

```jsx
// add to src/CategoryPicker.test.jsx
import QuickCreateCategory from './QuickCreateCategory.jsx'; // ensure resolvable

describe('CategoryPicker — inline create category', () => {
  afterEach(() => cleanup());

  it('shows a create footer for an unknown query and creates + selects', async () => {
    const onChange = vi.fn();
    const onCreateCategory = vi.fn(() => 'new1');
    render(<CategoryPicker categories={categories} value={{ categoryId: 'gro', subId: null }}
      onChange={onChange} ariaLabel="Category" onCreateCategory={onCreateCategory} createFlow="expense" />);
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    await userEvent.type(screen.getByRole('combobox'), 'Vet bills');
    await userEvent.click(screen.getByRole('button', { name: /new category "vet bills"/i }));
    // quick dialog appears, prefilled; submit it
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onCreateCategory).toHaveBeenCalledWith({ name: 'Vet bills', icon: '📋', flow: 'expense' });
    expect(onChange).toHaveBeenCalledWith({ categoryId: 'new1', subId: null });
  });

  it('does not show the create footer when the query exactly matches an existing name', async () => {
    render(<CategoryPicker categories={categories} value={{ categoryId: 'gro', subId: null }}
      onChange={vi.fn()} ariaLabel="Category" onCreateCategory={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    await userEvent.type(screen.getByRole('combobox'), 'Groceries');
    expect(screen.queryByRole('button', { name: /new category/i })).toBeNull();
  });

  it('shows no create footer when onCreateCategory is absent (back-compat)', async () => {
    render(<CategoryPicker categories={categories} value={{ categoryId: 'gro', subId: null }}
      onChange={vi.fn()} ariaLabel="Category" />);
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    await userEvent.type(screen.getByRole('combobox'), 'Zzz');
    expect(screen.queryByRole('button', { name: /new category/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/CategoryPicker.test.jsx`
Expected: FAIL — no "New category" button found.

- [ ] **Step 3: Write minimal implementation**

In `src/CategoryPicker.jsx`:

3a. Add import at top:
```jsx
import QuickCreateCategory from './QuickCreateCategory.jsx';
```

3b. Extend the signature (add the three props):
```jsx
export default function CategoryPicker({ categories, value, onChange, ariaLabel = 'Category',
  onCreateCategory = null, createFlow = 'expense', lockCreateFlow = false }) {
```

3c. Add state next to the others (after `const [highlight, setHighlight] = useState(0);`):
```jsx
  const [creating, setCreating] = useState(false);
```

3d. After the `selected` computation, add exact-match detection:
```jsx
  const q = query.trim();
  const exactExists = allOptions.some(o => o.kind === 'category' && (o.name || '').trim().toLowerCase() === q.toLowerCase());
  const showCreate = !!onCreateCategory && q !== '' && !exactExists;
```

3e. Add a create handler near `choose`:
```jsx
  const createCategory = (payload) => {
    const id = onCreateCategory(payload);
    setCreating(false);
    setQuery('');
    setOpen(false);
    onChange({ categoryId: id, subId: null });
  };
```

3f. Inside the popover, after the closing `</ul>` of `.cat-picker-list`, add the footer + dialog:
```jsx
          {showCreate && (
            <button type="button" className="cat-picker-create"
              onMouseDown={(e) => e.preventDefault()} onClick={() => setCreating(true)}>
              ＋ New category “{q}”
            </button>
          )}
          {creating && (
            <QuickCreateCategory initialName={q} flow={createFlow} lockFlow={lockCreateFlow}
              onSubmit={createCategory} onCancel={() => setCreating(false)} />
          )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/CategoryPicker.test.jsx`
Expected: PASS (existing 5 + new 3 = 8).

- [ ] **Step 5: Commit**

```bash
git add src/CategoryPicker.jsx src/CategoryPicker.test.jsx
git commit -m "feat(categories): CategoryPicker inline create-category footer"
```

---

## Task 3: `CategoryPicker` — "＋ sub" per-parent affordance

**Files:**
- Modify: `src/CategoryPicker.jsx`
- Test: `src/CategoryPicker.test.jsx`

**Interfaces:**
- Produces: `CategoryPicker` gains prop `onCreateSub(parentId, { name }) => subId`. When set, each **parent** (`kind === 'category'`) row shows a "＋ sub" button (accessible name "Add sub-category to <name>"). Clicking reveals an inline field (accessible name "New sub-category under <name>"); Enter or its Add button calls `onCreateSub`, selects `{ categoryId: parentId, subId }`, and closes.

- [ ] **Step 1: Write the failing test** (append to `CategoryPicker.test.jsx`)

```jsx
describe('CategoryPicker — inline create sub-category', () => {
  afterEach(() => cleanup());

  it('adds a sub under a parent and selects it', async () => {
    const onChange = vi.fn();
    const onCreateSub = vi.fn(() => 'sub9');
    render(<CategoryPicker categories={categories} value={{ categoryId: 'gro', subId: null }}
      onChange={onChange} ariaLabel="Category" onCreateSub={onCreateSub} />);
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    await userEvent.click(screen.getByRole('button', { name: /add sub-category to groceries/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /new sub-category under groceries/i }), 'Produce');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onCreateSub).toHaveBeenCalledWith('gro', { name: 'Produce' });
    expect(onChange).toHaveBeenCalledWith({ categoryId: 'gro', subId: 'sub9' });
  });

  it('shows no "＋ sub" affordance when onCreateSub is absent (back-compat)', async () => {
    render(<CategoryPicker categories={categories} value={{ categoryId: 'gro', subId: null }}
      onChange={vi.fn()} ariaLabel="Category" />);
    await userEvent.click(screen.getByRole('button', { name: /category/i }));
    expect(screen.queryByRole('button', { name: /add sub-category/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/CategoryPicker.test.jsx`
Expected: FAIL — no "Add sub-category to Groceries" button.

- [ ] **Step 3: Write minimal implementation**

3a. Add `onCreateSub = null` to the signature params (alongside Task 2's props):
```jsx
  onCreateCategory = null, createFlow = 'expense', lockCreateFlow = false, onCreateSub = null }) {
```

3b. Add state + commit handler (near `creating`):
```jsx
  const [subFor, setSubFor] = useState(null);   // parent categoryId whose sub-form is open
  const [subName, setSubName] = useState('');

  const commitSub = (parentId) => {
    const nm = subName.trim();
    if (!nm) return;
    const subId = onCreateSub(parentId, { name: nm });
    setSubFor(null);
    setSubName('');
    setQuery('');
    setOpen(false);
    onChange({ categoryId: parentId, subId });
  };
```

3c. In the options `.map`, add the "＋ sub" button inside the parent `<li>` (after the `cat-picker-opt-name` span) and the inline form as a sibling after the `<li>`. Replace the existing option `<li>...</li>` block with:
```jsx
                  <li role="option" aria-selected={i === highlight}
                    className={`cat-picker-option${o.kind === 'sub' ? ' is-sub' : ''}${i === highlight ? ' active' : ''}`}
                    onMouseEnter={() => setHighlight(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}>
                    <span className="cat-picker-opt-icon" aria-hidden="true">{iconGlyph(o.icon)}</span>
                    <span className="cat-picker-opt-name">{o.name}</span>
                    {onCreateSub && o.kind === 'category' && (
                      <button type="button" className="cat-picker-subadd"
                        aria-label={`Add sub-category to ${o.name}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => { e.stopPropagation(); setSubFor(o.categoryId); setSubName(''); }}>
                        ＋ sub
                      </button>
                    )}
                  </li>
                  {onCreateSub && subFor === o.categoryId && o.kind === 'category' && (
                    <li className="cat-picker-subform">
                      <input type="text" className="input" aria-label={`New sub-category under ${o.name}`}
                        value={subName} autoFocus
                        onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) => setSubName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitSub(o.categoryId); }
                          else if (e.key === 'Escape') { e.preventDefault(); setSubFor(null); }
                        }} />
                      <button type="button" className="btn btn-small"
                        onMouseDown={(e) => e.preventDefault()} onClick={() => commitSub(o.categoryId)}>Add</button>
                    </li>
                  )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/CategoryPicker.test.jsx`
Expected: PASS (10 total).

- [ ] **Step 5: Commit**

```bash
git add src/CategoryPicker.jsx src/CategoryPicker.test.jsx
git commit -m "feat(categories): CategoryPicker inline create sub-category"
```

---

## Task 4: `CategoryPicker` — "— None —" option

**Files:**
- Modify: `src/CategoryPicker.jsx`
- Test: `src/CategoryPicker.test.jsx`

**Interfaces:**
- Produces: `CategoryPicker` gains props `allowNone = false`, `noneLabel = '— None —'`. When `allowNone`, a persistent "— None —" row appears at the top of the list; clicking emits `{ categoryId: null, subId: null }`. When `allowNone` and nothing is selected, the trigger shows `noneLabel` (instead of "Select category…").

- [ ] **Step 1: Write the failing test** (append to `CategoryPicker.test.jsx`)

```jsx
describe('CategoryPicker — allowNone', () => {
  afterEach(() => cleanup());

  it('renders a None row that emits nulls, and labels the trigger when empty', async () => {
    const onChange = vi.fn();
    render(<CategoryPicker categories={categories} value={{ categoryId: null, subId: null }}
      onChange={onChange} ariaLabel="Type" allowNone noneLabel="— None —" />);
    // trigger shows the none label
    expect(screen.getByRole('button', { name: /type/i }).textContent).toMatch(/—\s*None\s*—/);
    await userEvent.click(screen.getByRole('button', { name: /type/i }));
    await userEvent.click(screen.getByText(/—\s*None\s*—/));
    expect(onChange).toHaveBeenCalledWith({ categoryId: null, subId: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/CategoryPicker.test.jsx`
Expected: FAIL — trigger shows "Select category…", no None row.

- [ ] **Step 3: Write minimal implementation**

3a. Add `allowNone = false, noneLabel = '— None —'` to the signature params.

3b. Replace the `triggerLabel` line:
```jsx
  const triggerLabel = selected
    ? `${iconGlyph(selected.icon)} ${selected.path}`
    : (allowNone ? noneLabel : 'Select category…');
```

3c. As the first child inside `<ul className="cat-picker-list" role="listbox">`, add:
```jsx
            {allowNone && (
              <li role="option" aria-selected={!selected} className="cat-picker-option cat-picker-none"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange({ categoryId: null, subId: null }); setQuery(''); setOpen(false); }}>
                {noneLabel}
              </li>
            )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/CategoryPicker.test.jsx`
Expected: PASS (11 total).

- [ ] **Step 5: Commit**

```bash
git add src/CategoryPicker.jsx src/CategoryPicker.test.jsx
git commit -m "feat(categories): CategoryPicker optional None option"
```

---

## Task 5: Wire TransactionEditor + App handlers

**Files:**
- Modify: `src/TransactionEditor.jsx` (props + the `CategoryPicker` usage at `:110-113`)
- Modify: `src/App.jsx` (`TransactionEditor` usage at `:651-661`)
- Test: `src/TransactionEditor.test.jsx`

**Interfaces:**
- Consumes: `CategoryPicker` create/sub props (Tasks 2–3).
- Produces: `TransactionEditor` accepts `onAddCategory = null`, `onAddSub = null`. It passes `onCreateCategory`, `onCreateSub`, and `createFlow` (`'income'` when direction is in, else `'expense'`) to the picker.

- [ ] **Step 1: Write the failing test** (append to `TransactionEditor.test.jsx`)

```jsx
describe('TransactionEditor — inline create category', () => {
  afterEach(() => cleanup());

  it('creates a category from the picker with flow from the out/in direction', async () => {
    const onAddCategory = vi.fn(() => 'newcat');
    render(
      <TransactionEditor
        account={{ id: 'a1', name: 'Mastercard', type: 'credit_card' }}
        transaction={null} categories={categories}
        onSave={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()}
        onAddCategory={onAddCategory}
      />
    );
    // default direction = out -> expense
    await userEvent.click(screen.getByRole('button', { name: /^category$/i }));
    await userEvent.type(screen.getByRole('combobox'), 'Vet bills');
    await userEvent.click(screen.getByRole('button', { name: /new category "vet bills"/i }));
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onAddCategory).toHaveBeenCalledWith({ name: 'Vet bills', icon: '📋', flow: 'expense' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/TransactionEditor.test.jsx`
Expected: FAIL — no create footer (props not wired).

- [ ] **Step 3: Write minimal implementation**

3a. In `src/TransactionEditor.jsx`, add the two props to the destructured signature (end of the props list, before `}`):
```jsx
  onSaveAsTemplate = null, onAddCategory = null, onAddSub = null }) {
```

3b. Replace the `CategoryPicker` usage (currently `TransactionEditor.jsx:112-113`):
```jsx
          <CategoryPicker categories={categories} value={{ categoryId, subId }}
            onChange={({ categoryId: c, subId: s }) => { setCategoryId(c); setSubId(s); }} ariaLabel="Category"
            onCreateCategory={onAddCategory} onCreateSub={onAddSub}
            createFlow={direction === 'in' ? 'income' : 'expense'} />
```

3c. In `src/App.jsx`, add the two handlers to the `TransactionEditor` element (`:658-660` area):
```jsx
          onSaveAsTemplate={requestSaveTemplate}
          onAddCategory={(p) => { pushHistory(); return cats.addCategory(p); }}
          onAddSub={(catId, opts) => { pushHistory(); return cats.addSub(catId, opts); }}
          onUndo={undo} undoCount={history.length}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/TransactionEditor.test.jsx`
Expected: PASS (existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/TransactionEditor.jsx src/App.jsx src/TransactionEditor.test.jsx
git commit -m "feat(categories): inline create category/sub in TransactionEditor"
```

---

## Task 6: Replace TransferEditor Type `<select>` with `CategoryPicker`

**Files:**
- Modify: `src/TransferEditor.jsx` (import + props + Type field at `:115-120`)
- Modify: `src/App.jsx` (`TransferEditor` usage at `:664-677`)
- Test: `src/TransferEditor.test.jsx`

**Interfaces:**
- Consumes: `CategoryPicker` with `allowNone`, `onCreateCategory`, `lockCreateFlow`, `createFlow='transfer'` (Tasks 2 & 4).
- Produces: `TransferEditor` accepts `onAddCategory = null`. The Type field is a `CategoryPicker` fed `transferCats` with `allowNone`; picking None sets `categoryId=''`; creating makes a `flow:'transfer'` category and selects it.

- [ ] **Step 1: Write the failing test** (append to `TransferEditor.test.jsx`; reuse that file's existing `setup`/`accounts`/`categories` — add transfer-flow categories if absent)

```jsx
describe('TransferEditor — Type picker', () => {
  afterEach(() => cleanup());

  const accounts = [
    { id: 'a_check', name: 'Checking', type: 'bank' },
    { id: 'a_save',  name: 'Savings',  type: 'bank' },
  ];
  const categories = [{ id: 'reimb', name: 'Reimbursement', icon: '💸', flow: 'transfer' }];

  it('creates a transfer-flow type from the picker and can pick None', async () => {
    const onAddCategory = vi.fn(() => 'tnew');
    render(
      <TransferEditor accounts={accounts} categories={categories}
        onSave={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} onAddCategory={onAddCategory} />
    );
    await userEvent.click(screen.getByRole('button', { name: /^type$/i }));
    await userEvent.type(screen.getByRole('combobox'), 'Payback');
    await userEvent.click(screen.getByRole('button', { name: /new transfer type "payback"/i }));
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onAddCategory).toHaveBeenCalledWith({ name: 'Payback', icon: '📋', flow: 'transfer' });
  });
});
```

Note: the create-footer label text comes from `CategoryPicker`, which renders "＋ New category …". To read "New transfer type …" the picker must accept a `createLabel`. Add that prop rather than hardcode — see Step 3c.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/TransferEditor.test.jsx`
Expected: FAIL — Type is still a `<select>`, no combobox/create button.

- [ ] **Step 3: Write minimal implementation**

3a. Add a `createLabel` prop to `CategoryPicker` (small addition to Task 2's footer) so callers can say "New transfer type". In `src/CategoryPicker.jsx` signature add `createLabel = 'New category'`, and change the footer text:
```jsx
            <button type="button" className="cat-picker-create"
              onMouseDown={(e) => e.preventDefault()} onClick={() => setCreating(true)}>
              ＋ {createLabel} “{q}”
            </button>
```

3b. In `src/TransferEditor.jsx`, add the import and the prop:
```jsx
import CategoryPicker from './CategoryPicker.jsx';
```
Signature — add `onAddCategory = null` before the closing `}`:
```jsx
  onSaveAsTemplate = null, onAddCategory = null }) {
```

3c. Replace the Type field (`TransferEditor.jsx:115-120`) with:
```jsx
        <div className="field"><span>Type</span>
          <CategoryPicker
            categories={transferCats}
            value={{ categoryId: categoryId || null, subId: null }}
            onChange={({ categoryId: c }) => { setTypeTouched(true); setCategoryId(c || ''); }}
            ariaLabel="Type"
            allowNone noneLabel="— None —"
            onCreateCategory={onAddCategory ? (p) => onAddCategory({ ...p, flow: 'transfer' }) : null}
            createFlow="transfer" lockCreateFlow createLabel="New transfer type" />
        </div>
```

3d. In `src/App.jsx`, add to the `TransferEditor` element (`:675-676` area):
```jsx
          onSaveAsTemplate={requestSaveTemplate}
          onAddCategory={(p) => { pushHistory(); return cats.addCategory(p); }}
          onUndo={undo} undoCount={history.length}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/TransferEditor.test.jsx src/CategoryPicker.test.jsx`
Expected: PASS (all, incl. the new Type-picker test).

- [ ] **Step 5: Commit**

```bash
git add src/TransferEditor.jsx src/CategoryPicker.jsx src/App.jsx src/TransferEditor.test.jsx
git commit -m "feat(categories): transfer Type is a searchable picker w/ inline create"
```

---

## Task 7: Register category filter — "＋ New category…" option

**Files:**
- Modify: `src/Register.jsx` (import + props + filter `<select>` at `:123-130`)
- Modify: `src/App.jsx` (`Register` usage at `:753-759` area)
- Test: `src/Register.test.jsx`

**Interfaces:**
- Consumes: `QuickCreateCategory` (Task 1).
- Produces: `Register` accepts `onAddCategory = null`. When set, the filter `<select>` gets a final `<option value="__new_category__">＋ New category…</option>`; choosing it opens `QuickCreateCategory`; on submit it creates the category and sets the active filter to the new id.

- [ ] **Step 1: Write the failing test** (append to `Register.test.jsx`; reuse its existing render helper/props)

```jsx
describe('Register — inline create category from filter', () => {
  afterEach(() => cleanup());

  it('opens the quick dialog and filters to the new category', async () => {
    const onAddCategory = vi.fn(() => 'fcat');
    // Reuse this file's existing account/categories fixtures via its setup helper.
    renderRegister({ onAddCategory }); // <- use the helper defined at top of Register.test.jsx
    await userEvent.selectOptions(screen.getByLabelText(/category filter/i), '__new_category__');
    await userEvent.type(screen.getByLabelText(/category name/i), 'Charity');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onAddCategory).toHaveBeenCalledWith({ name: 'Charity', icon: '📋', flow: 'expense' });
    // filter select now reflects the created id
    expect(screen.getByLabelText(/category filter/i)).toHaveValue('fcat');
  });
});
```

If `Register.test.jsx` has no reusable render helper, render `<Register>` directly with the same required props its other tests use, plus `categories` containing a `{ id: 'fcat', name: 'Charity', flow: 'expense' }` entry (so the select can hold that value after creation) and `onAddCategory`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/Register.test.jsx`
Expected: FAIL — no "＋ New category…" option / no dialog.

- [ ] **Step 3: Write minimal implementation**

3a. In `src/Register.jsx`, add the import:
```jsx
import QuickCreateCategory from './QuickCreateCategory.jsx';
```

3b. Add `onAddCategory = null` to the destructured props (end of the list).

3c. Add state near the other `useState`s (e.g. after `const [categoryId, setCategoryId] = useState('');`):
```jsx
  const [creatingCat, setCreatingCat] = useState(false);
```

3d. Replace the category-filter `<select>` (`Register.jsx:123-130`) with:
```jsx
        <select className="select" value={categoryId}
          onChange={(e) => {
            if (e.target.value === '__new_category__') setCreatingCat(true);
            else setCategoryId(e.target.value);
          }} aria-label="Category filter">
          <option value="">All categories</option>
          {groupCategoriesByFlow(categories).map(group => (
            <optgroup key={group.flow} label={group.label}>
              {group.items.map(c => <option key={c.id} value={c.id}>{iconGlyph(c.icon)} {c.name}</option>)}
            </optgroup>
          ))}
          {onAddCategory && <option value="__new_category__">＋ New category…</option>}
        </select>
```

3e. Render the dialog (near the end of the component's returned JSX, before the closing `</div>` of `.register`):
```jsx
      {creatingCat && (
        <QuickCreateCategory
          onSubmit={(p) => { const id = onAddCategory(p); setCreatingCat(false); setCategoryId(id); }}
          onCancel={() => setCreatingCat(false)} />
      )}
```

3f. In `src/App.jsx`, add to the `Register` element (after `categories={cats.categories}` at `:757`):
```jsx
                  onAddCategory={(p) => { pushHistory(); return cats.addCategory(p); }}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/Register.test.jsx`
Expected: PASS (existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/Register.jsx src/App.jsx src/Register.test.jsx
git commit -m "feat(categories): inline create category from the register filter"
```

---

## Task 8: Full-suite checkpoint

- [ ] **Step 1: Run the entire suite**

Run: `npx vitest run`
Expected: PASS — all prior tests (1011) plus the ~13 added here, green.

- [ ] **Step 2: Manual smoke (optional but recommended)**

Run the app (`npm run dev`), then verify by driving the UI: create a category from a transaction (check flow follows Out/In), add a sub via "＋ sub", create a transfer type (confirm it lands under transfer), and create from the register filter. Confirm each new item survives a reload (persisted) and that a single Undo removes it.

- [ ] **Step 3: Checkpoint for review**

Phase 1 is complete and independently shippable. Pause here for review before starting Phase 2 (account types).

---

## Self-Review

**Spec coverage:**
- Nested quick editor (spec §2.1, §5.1) → Task 1. ✓
- CategoryPicker create footer (§5.2) → Task 2. ✓
- Anchored "＋ sub" (§2.4, §5.2) → Task 3. ✓
- `allowNone` (§5.2) → Task 4. ✓
- TransactionEditor wiring + flow-from-direction (§5.3) → Task 5. ✓
- Transfer Type → picker, transfer-flow list, None (§2.3, §5.3) → Task 6. ✓
- Register filter "＋ New category…" (§2.3, §5.3) → Task 7. ✓
- App `onAddCategory`/`onAddSub` via `pushHistory` (§5.3, §4) → Tasks 5–7. ✓
- Persistence + single-step Undo (§5.4) → covered by App wrappers; verified in Task 8 smoke. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; the one conditional ("if Register.test.jsx has no helper…") gives the explicit fallback props. ✓

**Type consistency:** `onCreateCategory({name,icon,flow})→id`, `onCreateSub(parentId,{name})→subId`, `onAddCategory`/`onAddSub` App wrappers, `createFlow`/`lockCreateFlow`/`allowNone`/`noneLabel`/`createLabel` — names identical across Tasks 2–7. `createLabel` is introduced in Task 6 Step 3a as a small addition to the Task 2 footer (default `'New category'`), so Tasks 2 and 6 agree. ✓

**Note on ordering:** `createLabel` (Task 6) slightly amends the Task 2 footer. An implementer doing Task 2 first writes the footer without it; Task 6 adds the prop + default. No conflict because the default reproduces Task 2's original text.
