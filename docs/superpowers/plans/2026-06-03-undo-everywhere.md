# Undo Everywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the single global Undo reach every editing surface and cover categories + account types, so a category rename (and every category/keyword/template/account-type edit) is undoable.

**Architecture:** Keep the one `history` stack in `App.jsx`. Widen each snapshot from `{ledger, acks}` to `{ledger, acks, categories, accountTypes}` by adding `snapshot()/restore()` to `useCategories` and `useAccountTypes` (mirroring `useLedger`). Wrap every category/account-type mutation with `pushHistory()`. Extract the existing button markup into a reusable `<UndoButton>` and render it in the management-screen headers and editor modals, all bound to the same `undo`/`history.length`.

**Tech Stack:** React 19, Vite, Vitest + @testing-library/react (no jest-dom — assert via DOM props like `.disabled`/`.textContent`). Run a single test file with `npx vitest run <path>`; full suite with `npx vitest run`.

**Spec:** `docs/superpowers/specs/2026-06-03-undo-everywhere-design.md`

---

### Task 1: `snapshot()/restore()` on `useCategories`

**Files:**
- Modify: `src/useCategories.js`
- Test: `src/useCategories.test.jsx`

- [ ] **Step 1: Write the failing test** — append inside the existing `describe('useCategories', …)` block (uses the file's existing `renderHook`, `act` imports):

```jsx
  it('snapshot/restore round-trips for undo (a rename is revertible)', () => {
    const { result } = renderHook(() => useCategories());
    const target = result.current.categories[0];
    let snap;
    act(() => { snap = result.current.snapshot(); });
    act(() => { result.current.updateCategory(target.id, { name: 'Renamed!!' }); });
    expect(result.current.getById(target.id).name).toBe('Renamed!!');
    act(() => { result.current.restore(snap); });
    expect(result.current.getById(target.id).name).toBe(target.name);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useCategories.test.jsx`
Expected: FAIL — `result.current.snapshot is not a function`.

- [ ] **Step 3: Add the methods** in `src/useCategories.js`. Insert just after the `clearStorageError` definition (around line 126):

```js
  const snapshot = useCallback(() => categories, [categories]);
  const restore = useCallback((snap) => {
    setCategories(Array.isArray(snap) ? snap : []);
  }, []);
```

Then add `snapshot,` and `restore,` to the returned object (next to `clearStorageError`):

```js
    autoCategorize,
    applyCategoryToItems,
    findItemsInCategory,
    snapshot,
    restore,
    storageError,
    clearStorageError,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useCategories.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/useCategories.js src/useCategories.test.jsx
git commit -m "feat(undo): add snapshot/restore to useCategories"
```

---

### Task 2: `snapshot()/restore()` on `useAccountTypes`

**Files:**
- Modify: `src/useAccountTypes.js`
- Test: `src/useAccountTypes.test.jsx`

- [ ] **Step 1: Write the failing test** — append inside the existing `describe('useAccountTypes', …)` block (file already imports `renderHook`, `act`):

```jsx
  it('snapshot/restore round-trips for undo', () => {
    const { result } = renderHook(() => useAccountTypes());
    const first = result.current.types[0];
    let snap;
    act(() => { snap = result.current.snapshot(); });
    act(() => { result.current.updateType(first.id, { label: 'Changed Label' }); });
    expect(result.current.typesById.get(first.id).label).toBe('Changed Label');
    act(() => { result.current.restore(snap); });
    expect(result.current.typesById.get(first.id).label).toBe(first.label);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useAccountTypes.test.jsx`
Expected: FAIL — `result.current.snapshot is not a function`.

- [ ] **Step 3: Add the methods** in `src/useAccountTypes.js`. Insert just after the `clearStorageError` definition (around line 55):

```js
  const snapshot = useCallback(() => types, [types]);
  const restore = useCallback((snap) => {
    setTypes(Array.isArray(snap) ? snap : []);
  }, []);
```

Then add them to the returned object:

```js
  return { types, typesById, addType, updateType, deleteType, snapshot, restore, storageError, clearStorageError };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useAccountTypes.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/useAccountTypes.js src/useAccountTypes.test.jsx
git commit -m "feat(undo): add snapshot/restore to useAccountTypes"
```

---

### Task 3: Reusable `<UndoButton>` component

**Files:**
- Create: `src/UndoButton.jsx`
- Test: `src/UndoButton.test.jsx`

- [ ] **Step 1: Write the failing test** — create `src/UndoButton.test.jsx`:

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UndoButton from './UndoButton.jsx';

describe('UndoButton', () => {
  afterEach(() => cleanup());

  it('is disabled and label-only at count 0', () => {
    render(<UndoButton count={0} onUndo={() => {}} />);
    const btn = screen.getByRole('button', { name: /undo/i });
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('↩ Undo');
  });

  it('shows the count, is enabled, and calls onUndo when clicked', async () => {
    const onUndo = vi.fn();
    render(<UndoButton count={3} onUndo={onUndo} />);
    const btn = screen.getByRole('button', { name: /undo/i });
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('↩ Undo (3)');
    await userEvent.click(btn);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('treats a missing count as 0 (disabled)', () => {
    render(<UndoButton onUndo={() => {}} />);
    expect(screen.getByRole('button', { name: /undo/i }).disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/UndoButton.test.jsx`
Expected: FAIL — cannot resolve `./UndoButton.jsx`.

- [ ] **Step 3: Create the component** — `src/UndoButton.jsx` (markup/classes copied verbatim from `App.jsx:420` so styling is unchanged):

```jsx
export default function UndoButton({ count = 0, onUndo }) {
  return (
    <button
      type="button"
      onClick={onUndo}
      disabled={count === 0}
      className={`btn btn-undo${count > 0 ? ' active' : ''}`}
    >
      ↩ Undo{count > 0 ? ` (${count})` : ''}
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/UndoButton.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/UndoButton.jsx src/UndoButton.test.jsx
git commit -m "feat(undo): add reusable UndoButton component"
```

---

### Task 4: Widen the App snapshot/undo and use `<UndoButton>` in the main header

**Files:**
- Modify: `src/App.jsx` (imports ~line 19; `pushHistory`/`undo` ~lines 127-138; header button line 420)

No unit test (no `App.test.jsx`; App wiring is verified in-app, consistent with `2026-05-20-report-acks-undo-design.md`). Verification happens in Task 9.

- [ ] **Step 1: Import the component.** Add near the other component imports (e.g. after the `ManageCategoriesScreen` import at line 19):

```jsx
import UndoButton from './UndoButton.jsx';
```

- [ ] **Step 2: Widen `pushHistory`.** Replace line 129:

```jsx
  const pushHistory = () => setHistory(prev => [...prev.slice(-19), { ledger: ledger.snapshot(), acks: acks.exportSnapshot() }]);
```

with:

```jsx
  const pushHistory = () => setHistory(prev => [...prev.slice(-19), {
    ledger: ledger.snapshot(),
    acks: acks.exportSnapshot(),
    categories: cats.snapshot(),
    accountTypes: accountTypes.snapshot(),
  }]);
```

- [ ] **Step 3: Widen `undo`.** In the `undo` function (lines 130-138), after the two existing `restore` calls add two more:

```jsx
      ledger.restore(entry.ledger);
      acks.restore(entry.acks);
      cats.restore(entry.categories);
      accountTypes.restore(entry.accountTypes);
```

- [ ] **Step 4: Replace the main-header button.** Replace the inline button at line 420:

```jsx
            <button onClick={undo} disabled={history.length === 0} className={`btn btn-undo${history.length > 0 ? ' active' : ''}`}>↩ Undo{history.length > 0 ? ` (${history.length})` : ''}</button>
```

with:

```jsx
            <UndoButton count={history.length} onUndo={undo} />
```

- [ ] **Step 5: Sanity-check the build + suite.**

Run: `npx vitest run`
Expected: PASS (no regressions; existing suite still green).

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat(undo): snapshot categories + account types; reuse UndoButton in header"
```

---

### Task 5: Capture category & account-type mutations in history

**Files:**
- Modify: `src/App.jsx` (`saveAccountType` ~lines 188-191; category callbacks ~lines 314-321)

- [ ] **Step 1: Wrap `saveAccountType` with `pushHistory()`.** Replace lines 188-191:

```jsx
  const saveAccountType = (data) => {
    if (data.id) accountTypes.updateType(data.id, data);
    else accountTypes.addType(data);
  };
```

with:

```jsx
  const saveAccountType = (data) => {
    pushHistory();
    if (data.id) accountTypes.updateType(data.id, data);
    else accountTypes.addType(data);
  };
```

- [ ] **Step 2: Wrap the category callbacks.** Replace the props block at lines 314-321:

```jsx
          onAddCategory={(p) => cats.addCategory(p)}
          onUpdateCategory={(id, patch) => cats.updateCategory(id, patch)}
          onDeleteCategory={(id) => cats.deleteCategory(id, [])}
          onAddKeyword={(catId, kw) => cats.addKeyword(catId, kw, [])}
          onRemoveKeyword={(catId, kw) => cats.removeKeyword(catId, kw)}
          onAddTemplate={(catId, t) => cats.addTemplate(catId, t)}
          onRemoveTemplate={(catId, t) => cats.removeTemplate(catId, t)}
          onMoveAll={() => {}}
```

with (each runs `pushHistory()` first; the two that return a value keep returning it):

```jsx
          onAddCategory={(p) => { pushHistory(); return cats.addCategory(p); }}
          onUpdateCategory={(id, patch) => { pushHistory(); cats.updateCategory(id, patch); }}
          onDeleteCategory={(id) => { pushHistory(); return cats.deleteCategory(id, []); }}
          onAddKeyword={(catId, kw) => { pushHistory(); return cats.addKeyword(catId, kw, []); }}
          onRemoveKeyword={(catId, kw) => { pushHistory(); cats.removeKeyword(catId, kw); }}
          onAddTemplate={(catId, t) => { pushHistory(); cats.addTemplate(catId, t); }}
          onRemoveTemplate={(catId, t) => { pushHistory(); cats.removeTemplate(catId, t); }}
          onMoveAll={() => {}}
```

- [ ] **Step 3: Run the suite.**

Run: `npx vitest run`
Expected: PASS (no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(undo): push history before category and account-type edits"
```

---

### Task 6: Surface Undo in the Manage Categories & Account Types headers

**Files:**
- Modify: `src/ManageCategoriesScreen.jsx`, `src/AccountTypesScreen.jsx`, `src/App.jsx`
- Test: `src/ManageCategoriesScreen.test.jsx`

- [ ] **Step 1: Write the failing test** — append inside the existing `describe('ManageCategoriesScreen', …)` block (file already imports `render`, `screen`, `userEvent`, `vi`):

```jsx
  it('renders an Undo button that enables on undoCount and calls onUndo', async () => {
    const onUndo = vi.fn();
    render(<ManageCategoriesScreen categories={cats} {...noopProps} onUndo={onUndo} undoCount={2} />);
    const btn = screen.getByRole('button', { name: /undo/i });
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('↩ Undo (2)');
    await userEvent.click(btn);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ManageCategoriesScreen.test.jsx`
Expected: FAIL — no element with accessible name `/undo/i`.

- [ ] **Step 3: Wire `ManageCategoriesScreen`.** Add the import at the top:

```jsx
import UndoButton from './UndoButton.jsx';
```

Add `onUndo` + `undoCount` to the destructured props (with a safe default), e.g. add to the props list:

```jsx
  onMoveAll,
  onUndo,
  undoCount = 0,
}) {
```

Replace the header (lines 57-62):

```jsx
      <header className="manage-header">
        <button type="button" className="btn" onClick={onClose}>‹ Back</button>
        <h1 className="manage-title">Manage Categories</h1>
        <button type="button" className="btn btn-primary" onClick={handleAdd}>+ Add Category</button>
      </header>
```

with:

```jsx
      <header className="manage-header">
        <button type="button" className="btn" onClick={onClose}>‹ Back</button>
        <h1 className="manage-title">Manage Categories</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <UndoButton count={undoCount} onUndo={onUndo} />
          <button type="button" className="btn btn-primary" onClick={handleAdd}>+ Add Category</button>
        </div>
      </header>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ManageCategoriesScreen.test.jsx`
Expected: PASS (existing tests still green — they pass no `undoCount`, so the button defaults to disabled and is ignored).

- [ ] **Step 5: Wire `AccountTypesScreen`.** Add the import:

```jsx
import UndoButton from './UndoButton.jsx';
```

Add props to the signature: `export default function AccountTypesScreen({ types, accounts, onClose, onSaveType, onDeleteType, onUndo, undoCount = 0 }) {`

Replace the header (lines 28-31):

```jsx
        <div className="screen-header">
          <h2 className="screen-title">Account Types</h2>
          <button type="button" className="btn" onClick={onClose}>Done</button>
        </div>
```

with:

```jsx
        <div className="screen-header">
          <h2 className="screen-title">Account Types</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <UndoButton count={undoCount} onUndo={onUndo} />
            <button type="button" className="btn" onClick={onClose}>Done</button>
          </div>
        </div>
```

- [ ] **Step 6: Pass props from `App.jsx`.** In the `ManageCategoriesScreen` element (lines 310-322) add to its props:

```jsx
          onUndo={undo}
          undoCount={history.length}
```

In the `AccountTypesScreen` element (lines 325-333) add the same two props.

- [ ] **Step 7: Run the suite.**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ManageCategoriesScreen.jsx src/ManageCategoriesScreen.test.jsx src/AccountTypesScreen.jsx src/App.jsx
git commit -m "feat(undo): surface Undo in Manage Categories and Account Types headers"
```

---

### Task 7: Surface Undo inside the editor modals

**Files:**
- Modify: `src/AccountEditor.jsx`, `src/TransactionEditor.jsx`, `src/TransferEditor.jsx`, `src/App.jsx`

These are presentational placements verified in-app (Task 9); no new unit test.

- [ ] **Step 1: `AccountEditor.jsx`.** Add the import `import UndoButton from './UndoButton.jsx';`. Add `onUndo, undoCount = 0` to the props signature (line 5). In the footer (lines 43-47) add the button as the first child of `dialog-actions`:

```jsx
        <div className="dialog-actions">
          <UndoButton count={undoCount} onUndo={onUndo} />
          {isEdit && <button type="button" className="btn btn-danger" onClick={() => onDelete(account.id)}>Delete</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save</button>
        </div>
```

- [ ] **Step 2: `TransactionEditor.jsx`.** Add the import. Add `onUndo, undoCount = 0` to the props (line 10). In the `dialog-actions` block (lines 126-130) add `<UndoButton count={undoCount} onUndo={onUndo} />` as the first child (same shape as Step 1).

- [ ] **Step 3: `TransferEditor.jsx`.** Add the import. Add `onUndo, undoCount = 0` to the props. In its `dialog-actions` block (line 127) add `<UndoButton count={undoCount} onUndo={onUndo} />` as the first child.

- [ ] **Step 4: Pass props from `App.jsx`.** Add `onUndo={undo} undoCount={history.length}` to each of the three rendered editors: `AccountEditor` (lines 359-363), `TransactionEditor` (lines 366-373), `TransferEditor` (lines 376-386).

- [ ] **Step 5: Run the suite.**

Run: `npx vitest run`
Expected: PASS (existing editor tests render without `undoCount`, so the new button defaults to disabled and is ignored).

- [ ] **Step 6: Commit**

```bash
git add src/AccountEditor.jsx src/TransactionEditor.jsx src/TransferEditor.jsx src/App.jsx
git commit -m "feat(undo): add Undo button to account/transaction/transfer editors"
```

---

### Task 8: Ctrl/Cmd+Z keyboard shortcut

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add a keydown effect.** `useRef`, `useEffect` are already imported. Add this near the other `useEffect`s in `App` (e.g. after the `undo` definition). It calls the latest `undo` via a ref so the listener registers once, and ignores keystrokes while typing in a field (preserving native text undo):

```jsx
  const undoRef = useRef(undo);
  undoRef.current = undo;
  useEffect(() => {
    const onKeyDown = (e) => {
      const k = e.key ? e.key.toLowerCase() : '';
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || k !== 'z') return;
      const el = e.target;
      const tag = el && el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el && el.isContentEditable)) return;
      e.preventDefault();
      undoRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
```

- [ ] **Step 2: Run the suite + lint.**

Run: `npx vitest run && npx eslint src/App.jsx`
Expected: PASS / no lint errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat(undo): add Ctrl/Cmd+Z shortcut (ignored while typing)"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite.**

Run: `npx vitest run`
Expected: PASS — all files green, including the new `UndoButton`, `useCategories`, `useAccountTypes`, and `ManageCategoriesScreen` tests.

- [ ] **Step 2: Lint.**

Run: `npx eslint .`
Expected: no errors.

- [ ] **Step 3: Manual in-app checks** (`npm run dev`). Confirm each:
  - On **Manage Categories**: rename a category → click that screen's **Undo** → the name reverts. Add a keyword → **Undo** → it disappears.
  - On **Account Types**: edit a type's label → screen **Undo** → label reverts.
  - Open the **Account editor**, change something & Save → the modal's footer **Undo** reverts it (reopen to confirm).
  - Make any change, press **Ctrl+Z** (focus outside a text field) → it undoes; while focused in a text input, Ctrl+Z does normal text editing (no app-level undo).
  - The undo **count is shared**: a category rename and a transaction add both increment the same counter, and undo reverts them last-in-first-out.

- [ ] **Step 4: Final commit (if any docs/notes changed)** — otherwise nothing to do; feature is complete on the branch.

---

## Notes for the implementer

- **Default-prop safety:** `<UndoButton>` defaults `count` to 0, so any screen/editor that doesn't yet receive `undoCount` renders a disabled, inert button — existing tests that don't pass it stay green.
- **Why a ref for Ctrl+Z:** `undo` is recreated each render; the ref lets the `window` listener register once (`[]` deps) while always calling the current `undo`.
- **No redo, no per-screen stacks** (out of scope per spec).
