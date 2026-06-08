# Category Save + Sub-category Persistence Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop recently-added sub-categories (and report acks) from vanishing after a reload, and give the sub-category editor explicit Save feedback.

**Architecture:** Two independent parts. **Part A** replaces the 250 ms debounced `localStorage` write in `useCategories` and `useReportAcks` with a synchronous write on change (the pattern `useLedger`/`useSettings`/`useAppearance` already use) — this removes the reload/background data-loss race. **Part B** reworks `SubcategoryEditor` into a **create** mode (Save-to-create, no orphan placeholder) and an **edit** mode (a `✓ Saved` / `Save` status row with blur kept as a silent safety net), and lifts a `creatingSub` flag into `ManageCategoriesScreen`.

**Tech Stack:** React (function components, hooks), Vite, Vitest + @testing-library/react + userEvent. Repo test convention: `afterEach(() => cleanup())`, assert with `.toBeTruthy()` / `.disabled` / `.value` / `getByDisplayValue` — **no jest-dom**.

**Spec:** `docs/superpowers/specs/2026-06-07-category-save-and-sub-persistence-design.md`

---

## File structure

- `src/useCategories.js` — persist synchronously on `[categories]` (drop debounce).
- `src/useReportAcks.js` — persist synchronously on `[acks]` (drop debounce).
- `src/SubcategoryEditor.jsx` — full rewrite: `creating` (create) vs editing modes, Save + status indicator.
- `src/ManageCategoriesScreen.jsx` — `creatingSub` state; `handleAddSub` enters create mode; `handleCreateSub` adds on Save; render branch.
- `src/App.jsx` — thread the typed name through `onAddSub`.
- `src/App.css` — `.sub-save-row` / `.sub-saved-indicator` styles.
- Tests alongside each.

`src/CategoryEditor.jsx` is unchanged (its "+ Add sub-category" still calls the `onAddSub` prop, now mapped to "enter create mode").

---

## Task 1: `useCategories` persists synchronously (fixes the disappearing sub)

**Files:**
- Modify: `src/useCategories.js` (the persist `useEffect`, ~`28-45`)
- Test: `src/useCategories.test.jsx`

- [ ] **Step 1: Write the failing regression test**

Add to `src/useCategories.test.jsx` (inside the top-level `describe`, near the existing `'persists changes to localStorage'` test):

```js
  it('persists synchronously so two quickly-added subs both survive a reload', () => {
    const h1 = renderHook(() => useCategories());
    const catId = h1.result.current.categories[0].id;
    act(() => { h1.result.current.addSub(catId, { name: 'Mike' }); });
    act(() => { h1.result.current.addSub(catId, { name: 'John' }); });
    // No timer advance: a fresh hook (simulated reload) must already see both.
    const h2 = renderHook(() => useCategories());
    const subs = h2.result.current.categories.find(c => c.id === catId).subcategories;
    expect(subs.map(s => s.name)).toEqual(['Mike', 'John']);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/useCategories.test.jsx -t "survive a reload"`
Expected: FAIL — with the 250 ms debounce, `h2` reads `localStorage` before the timer fires, so `subs` is `[]` (or missing the subs).

- [ ] **Step 3: Replace the debounced effect with a synchronous write**

In `src/useCategories.js`, change the persistence. Remove the line `const PERSIST_DEBOUNCE_MS = 250;` and the `persistTimer` ref (`const persistTimer = useRef(null);`). Replace the persist `useEffect` with:

```js
  // Persist synchronously on every change (like useLedger/useSettings) so a change
  // can't be lost to a reload/background within a debounce window.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
      if (storageError !== null) setStorageError(null);
    } catch (e) {
      console.error('Failed to save categories:', e);
      setStorageError({ message: "Couldn't save categories — storage full." });
    }
  }, [categories]); // eslint-disable-line react-hooks/exhaustive-deps
```

If `useRef` is now unused in the file, drop it from the React import.

- [ ] **Step 4: Run the full `useCategories` suite**

Run: `npx vitest run src/useCategories.test.jsx`
Expected: PASS (new test passes; the existing `'persists changes to localStorage'` test — which waits 300 ms — still passes since the data is written synchronously).

- [ ] **Step 5: Commit**

```bash
git add src/useCategories.js src/useCategories.test.jsx
git commit -m "fix(categories): persist synchronously so recent edits survive reload"
```

---

## Task 2: `useReportAcks` persists synchronously

**Files:**
- Modify: `src/useReportAcks.js` (persist `useEffect`, ~`29-43`)
- Test: `src/useReportAcks.test.jsx`

- [ ] **Step 1: Write the failing regression test**

Add inside `describe('useReportAcks', ...)` in `src/useReportAcks.test.jsx`:

```js
  it('persists synchronously so a status survives an immediate reload', () => {
    const h1 = renderHook(() => useReportAcks());
    act(() => { h1.result.current.setStatus('NETFLIX', 'ongoing'); });
    const h2 = renderHook(() => useReportAcks()); // simulated reload, no timer advance
    expect(h2.result.current.subscriptions.NETFLIX).toEqual({ status: 'ongoing' });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/useReportAcks.test.jsx -t "immediate reload"`
Expected: FAIL — debounce hasn't flushed, so `h2.subscriptions.NETFLIX` is `undefined`.

- [ ] **Step 3: Replace the debounced effect with a synchronous write**

In `src/useReportAcks.js`, remove `const PERSIST_DEBOUNCE_MS = 250;` and `const timer = useRef(null);`. Replace the persist `useEffect` with:

```js
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(acks));
      if (storageError !== null) setStorageError(null);
    } catch (e) {
      console.error('Failed to save report acks:', e);
      setStorageError({ message: "Couldn't save report settings — storage full." });
    }
  }, [acks]); // eslint-disable-line react-hooks/exhaustive-deps
```

If `useRef` is now unused, drop it from the import on line 2.

- [ ] **Step 4: Run the full `useReportAcks` suite**

Run: `npx vitest run src/useReportAcks.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/useReportAcks.js src/useReportAcks.test.jsx
git commit -m "fix(reports): persist report acks synchronously (no debounce drop)"
```

---

## Task 3: `SubcategoryEditor` — create mode + Save feedback

**Files:**
- Rewrite: `src/SubcategoryEditor.jsx`
- Modify: `src/SubcategoryEditor.test.jsx` (add tests; existing tests stay)
- Modify: `src/App.css` (new `.sub-save-row` / `.sub-saved-indicator` rules)

- [ ] **Step 1: Add the new tests**

Append to `src/SubcategoryEditor.test.jsx`:

```js
describe('SubcategoryEditor create mode', () => {
  afterEach(() => cleanup());

  function setupCreate(overrides = {}) {
    const props = { category, creating: true, onCreate: vi.fn(), onCancel: vi.fn(), ...overrides };
    render(<SubcategoryEditor {...props} />);
    return props;
  }

  it('Save is disabled until a name is typed, then calls onCreate with the trimmed name', async () => {
    const { onCreate } = setupCreate();
    expect(screen.getByRole('button', { name: /^save$/i }).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/^name$/i), 'Mike');
    expect(screen.getByRole('button', { name: /^save$/i }).disabled).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onCreate).toHaveBeenCalledWith('Mike');
  });

  it('Cancel with no typed name calls onCancel', async () => {
    const { onCancel } = setupCreate();
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('SubcategoryEditor edit-mode save feedback', () => {
  afterEach(() => cleanup());

  it('shows "✓ Saved" when unchanged and a Save button once the name is edited', async () => {
    setup();
    expect(screen.getByText('✓ Saved')).toBeTruthy();
    await userEvent.type(screen.getByDisplayValue('Federal Tax'), '!');
    expect(screen.getByRole('button', { name: /^save$/i })).toBeTruthy();
    expect(screen.queryByText('✓ Saved')).toBeNull();
  });

  it('clicking Save commits the name via onUpdate', async () => {
    const { onUpdate } = setup();
    const input = screen.getByDisplayValue('Federal Tax');
    await userEvent.clear(input);
    await userEvent.type(input, 'Fed Tax');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onUpdate).toHaveBeenCalledWith({ name: 'Fed Tax' });
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/SubcategoryEditor.test.jsx`
Expected: FAIL — `creating`/`onCreate`/Save button and the `✓ Saved` indicator don't exist yet.

- [ ] **Step 3: Rewrite `src/SubcategoryEditor.jsx`**

Replace the entire file with:

```jsx
import { useState, useEffect } from 'react';
import ChipEditor from './ChipEditor.jsx';

export default function SubcategoryEditor({
  category,
  sub,
  creating = false,
  onBack,
  onUpdate,
  onCreate,
  onCancel,
  onAddKeyword,
  onRemoveKeyword,
  onDelete,
}) {
  const [name, setName] = useState(creating ? '' : sub.name);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (creating) return;
    // Re-sync the local draft when the edited sub changes (switching subs / undo).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(sub.name);
    setNameError('');
  }, [creating, sub?.id, sub?.name]);

  const trimmed = name.trim();

  // ---- Create mode: the sub is added only on Save ----
  if (creating) {
    const canSave = trimmed.length > 0;
    const cancel = () => {
      if (trimmed && !window.confirm('Discard new sub-category?')) return;
      onCancel();
    };
    const save = () => {
      if (!canSave) { setNameError('Name required'); return; }
      onCreate(trimmed);
    };
    return (
      <div className="cat-editor">
        <div style={{ marginBottom: 8 }}>
          <button type="button" className="btn" onClick={cancel}>‹ Back to {category.name}</button>
        </div>
        <div className="cat-editor-header">
          <span className="cat-editor-title">{category.name} › (new sub-category)</span>
        </div>
        <div className="cat-editor-fields">
          <label className="cat-editor-field">
            <span className="cat-editor-label">Name</span>
            <input
              type="text"
              aria-label="Name"
              className="cat-editor-input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {nameError && <span className="cat-editor-error">{nameError}</span>}
          </label>
        </div>
        <div className="sub-save-row">
          <button type="button" className="btn" onClick={cancel}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={save}>Save</button>
        </div>
      </div>
    );
  }

  // ---- Edit mode: explicit Save + ✓ Saved, with blur as a silent safety net ----
  const dirty = trimmed.length > 0 && trimmed !== sub.name;
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
            aria-label="Name"
            className="cat-editor-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
          />
          {nameError && <span className="cat-editor-error">{nameError}</span>}
        </label>
        <div className="sub-save-row">
          {dirty ? (
            <>
              <span className="sub-saved-indicator unsaved">Unsaved changes</span>
              <button type="button" className="btn btn-primary" onClick={commitName}>Save</button>
            </>
          ) : (
            <span className="sub-saved-indicator">✓ Saved</span>
          )}
        </div>
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
        <span className="cat-editor-delete-hint">Deleting removes this sub-category.</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the CSS**

In `src/App.css`, add these rules immediately after the `.cat-editor-footer` rule (search for `.cat-editor-footer`):

```css
.sub-save-row { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.sub-saved-indicator { font-size: 0.85em; color: rgba(212, 212, 212, 0.6); }
.sub-saved-indicator.unsaved { color: #f0c674; }
```

- [ ] **Step 5: Run the `SubcategoryEditor` suite**

Run: `npx vitest run src/SubcategoryEditor.test.jsx`
Expected: PASS — including the existing `'commits a renamed sub on blur'`, `'shows the breadcrumb'`, and `'calls onBack and onDelete'` tests.

- [ ] **Step 6: Commit**

```bash
git add src/SubcategoryEditor.jsx src/SubcategoryEditor.test.jsx src/App.css
git commit -m "feat(categories): sub-category create mode + explicit Save feedback"
```

---

## Task 4: `ManageCategoriesScreen` create-mode wiring + `App.jsx` name threading

**Files:**
- Modify: `src/ManageCategoriesScreen.jsx`
- Modify: `src/App.jsx` (the `onAddSub` wiring, ~`454`)
- Test: `src/ManageCategoriesScreen.test.jsx`

- [ ] **Step 1: Add the new tests**

Append to `src/ManageCategoriesScreen.test.jsx` (before the final closing of the file):

```js
describe('ManageCategoriesScreen sub-category create flow', () => {
  afterEach(() => cleanup());

  it('"+ Add sub-category" enters create mode without adding a sub yet', async () => {
    const onAddSub = vi.fn(() => 'sNEW');
    render(<ManageCategoriesScreen categories={cats} {...noopProps} onAddSub={onAddSub} />);
    await userEvent.click(screen.getByRole('button', { name: /\+ add sub-category/i }));
    expect(screen.getByText(/\(new sub-category\)/i)).toBeTruthy();
    expect(onAddSub).not.toHaveBeenCalled();
  });

  it('typing a name and Save creates the sub via onAddSub', async () => {
    const onAddSub = vi.fn(() => 'sNEW');
    render(<ManageCategoriesScreen categories={cats} {...noopProps} onAddSub={onAddSub} />);
    await userEvent.click(screen.getByRole('button', { name: /\+ add sub-category/i }));
    await userEvent.type(screen.getByLabelText(/^name$/i), 'Mike');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onAddSub).toHaveBeenCalledWith('c1', { name: 'Mike' });
  });

  it('Cancel in create mode adds nothing and returns to the category editor', async () => {
    const onAddSub = vi.fn(() => 'sNEW');
    render(<ManageCategoriesScreen categories={cats} {...noopProps} onAddSub={onAddSub} />);
    await userEvent.click(screen.getByRole('button', { name: /\+ add sub-category/i }));
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onAddSub).not.toHaveBeenCalled();
    expect(screen.getByText(/editing: utilities/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/ManageCategoriesScreen.test.jsx`
Expected: FAIL — clicking "+ Add sub-category" currently calls `onAddSub` immediately and shows no "(new sub-category)" create form.

- [ ] **Step 3: Add `creatingSub` state and handlers in `ManageCategoriesScreen.jsx`**

Add the state next to `editingSubId` (currently `const [editingSubId, setEditingSubId] = useState(null);`):

```js
  const [creatingSub, setCreatingSub] = useState(false);
```

Replace `handleAddSub` (currently `const handleAddSub = () => { const id = onAddSub(selected.id); setEditingSubId(id); };`) with:

```js
  const handleAddSub = () => {
    setEditingSubId(null);
    setCreatingSub(true);
  };

  const handleCreateSub = (name) => {
    const id = onAddSub(selected.id, { name });
    setCreatingSub(false);
    setEditingSubId(id);
  };
```

Update `selectCategory` to also clear create mode:

```js
  const selectCategory = (id) => {
    setSelectedId(id);
    setEditingSubId(null);
    setCreatingSub(false);
  };
```

- [ ] **Step 4: Add the create-mode render branch**

In `src/ManageCategoriesScreen.jsx`, replace the editor body (the block beginning `{selected ? (` and the `editingSub ? (...) : (CategoryEditor)` inside `<main className="manage-editor">`) so the create branch comes first:

```jsx
          {selected ? (
            creatingSub ? (
              <SubcategoryEditor
                creating
                category={selected}
                onCreate={handleCreateSub}
                onCancel={() => setCreatingSub(false)}
              />
            ) : editingSub ? (
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
```

- [ ] **Step 5: Thread the name through `onAddSub` in `App.jsx`**

In `src/App.jsx`, change the `onAddSub` wiring (currently `onAddSub={(catId) => { pushHistory(); return cats.addSub(catId, {}); }}`) to:

```jsx
          onAddSub={(catId, opts) => { pushHistory(); return cats.addSub(catId, opts); }}
```

- [ ] **Step 6: Run the `ManageCategoriesScreen` suite**

Run: `npx vitest run src/ManageCategoriesScreen.test.jsx`
Expected: PASS — including the existing `'drills into a sub-category and back'` test (edit-mode drill-in is unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/ManageCategoriesScreen.jsx src/App.jsx src/ManageCategoriesScreen.test.jsx
git commit -m "feat(categories): wire sub-category create mode (Save-to-create)"
```

---

## Task 5: Verify the whole change

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: PASS (all files). (Pre-existing eslint errors in `CategoryEditor`/`ColorPicker`/`IconPicker`/`spendingMath` predate this work.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Lint touched files**

Run: `npx eslint src/useCategories.js src/useReportAcks.js src/SubcategoryEditor.jsx src/ManageCategoriesScreen.jsx`
Expected: clean (no new errors). Confirm no unused `useRef` import remains in the two hooks.

- [ ] **Step 4: Manual smoke check (App-level has no automated harness)**

Run `npm run dev`, then in the browser:
1. Manage Categories → pick a category → **+ Add sub-category** → confirm an empty "(new sub-category)" form with a disabled **Save** until a name is typed → type a name → **Save** → confirm **✓ Saved** and that it lands in the sub's editor; no stray "New sub-category".
2. Edit a sub's name → confirm the row shows **Unsaved changes** + **Save** while editing and **✓ Saved** after saving (or after clicking away).
3. Add a sub, then reload the page immediately → confirm the sub is still there (the bug is fixed).

- [ ] **Step 5: Commit any cleanup (only if needed)**

```bash
git add -A
git commit -m "chore(categories): verification pass"
```

(Skip if nothing to record.)

---

## Self-review notes

- **Spec coverage:** Part A synchronous persistence — Tasks 1 (useCategories) + 2 (useReportAcks) ✓. Part B create mode (Save-to-create, no orphan, discard-confirm) — Task 3 (editor) + Task 4 (screen wiring + App name threading) ✓. Edit-mode `✓ Saved`/Save + blur safety net — Task 3 ✓. CSS — Task 3 Step 4 ✓. `CategoryEditor` unchanged ✓.
- **Type/name consistency:** `creating`/`onCreate`/`onCancel` props (Task 3) match how `ManageCategoriesScreen` passes them (Task 4); `handleCreateSub(name)` calls `onAddSub(catId, { name })` which matches `App.jsx`'s `(catId, opts) => cats.addSub(catId, opts)` and `useCategories.addSub(catId, { name })`.
- **No placeholders:** every code step shows full code; test additions are complete; the one CSS anchor (`.cat-editor-footer`) is a concrete search target.
