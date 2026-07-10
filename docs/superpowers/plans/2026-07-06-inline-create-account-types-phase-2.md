# Inline Create — Phase 2: Account Types — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let the user create a new account type directly from the New/Edit-account **Type** selector, auto-selected, without leaving the account editor.

**Architecture:** A new lightweight `QuickCreateAccountType` nested dialog captures label + icon + class (asset/liability/offsheet). The `AccountEditor` Type `<select>` gains a "＋ New type…" sentinel option that opens the dialog; on submit it creates via an App handler that wraps `useAccountTypes.addType` in `pushHistory()` and selects the new id. Mirrors the Phase 1 register-filter pattern.

**Tech Stack:** React function components, Vitest + @testing-library/react + userEvent, localStorage-backed `useAccountTypes`.

## Global Constraints

- `useAccountTypes.addType({ label, klass, layout, group, icon }) → id` returns the id synchronously and defaults `layout='compact'`, `group='Unassigned'`; valid `klass` ∈ `asset | liability | offsheet`.
- Undo: App wraps as `(p) => { pushHistory(); return accountTypes.addType(p); }`.
- Tests use plain property assertions (`.disabled`, `.value`) — this project does NOT load `jest-dom`.
- Full suite (currently **1024**) stays green at every commit.
- Icon field is a plain emoji `<input maxLength={4}>` (like `AccountTypeEditor.jsx:34-36`).
- Branch `feat/fable-redesign`. Match existing style.

## File Structure

- **Create** `src/QuickCreateAccountType.jsx` + `src/QuickCreateAccountType.test.jsx`.
- **Modify** `src/AccountEditor.jsx:7` (props) and `:35-39` (Type select) + render dialog.
- **Modify** `src/AccountEditor.test.jsx` — test the create flow.
- **Modify** `src/App.jsx:643-648` — pass `onAddType`.

---

## Task 1: `QuickCreateAccountType` dialog

**Files:** Create `src/QuickCreateAccountType.jsx`, `src/QuickCreateAccountType.test.jsx`.

**Interfaces:**
- Produces: `QuickCreateAccountType({ onSubmit, onCancel })`. `onSubmit({ label, icon, klass })` — `label` trimmed non-empty; `icon` default `'🏷️'`; `klass` default `'asset'`.

- [ ] **Step 1: Failing test**

```jsx
// src/QuickCreateAccountType.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickCreateAccountType from './QuickCreateAccountType.jsx';

describe('QuickCreateAccountType', () => {
  afterEach(() => cleanup());

  it('submits trimmed label + icon + chosen class', async () => {
    const onSubmit = vi.fn();
    render(<QuickCreateAccountType onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/type label/i), '  Brokerage  ');
    await userEvent.selectOptions(screen.getByLabelText(/class/i), 'asset');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onSubmit).toHaveBeenCalledWith({ label: 'Brokerage', icon: '🏷️', klass: 'asset' });
  });

  it('can choose a liability class', async () => {
    const onSubmit = vi.fn();
    render(<QuickCreateAccountType onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/type label/i), 'Loan');
    await userEvent.selectOptions(screen.getByLabelText(/class/i), 'liability');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onSubmit.mock.calls[0][0].klass).toBe('liability');
  });

  it('disables Add for an empty label and Cancel calls onCancel', async () => {
    const onCancel = vi.fn();
    render(<QuickCreateAccountType onSubmit={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByRole('button', { name: /^add$/i }).disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run src/QuickCreateAccountType.test.jsx`; module missing).

- [ ] **Step 3: Implement**

```jsx
// src/QuickCreateAccountType.jsx
import React, { useState } from 'react';

const CLASS_OPTIONS = [
  { value: 'asset',     label: 'Asset (adds to net worth)' },
  { value: 'liability', label: 'Liability (amount owed)' },
  { value: 'offsheet',  label: 'Off balance sheet (tracker)' },
];

export default function QuickCreateAccountType({ onSubmit, onCancel }) {
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('🏷️');
  const [klass, setKlass] = useState('asset');

  const trimmed = label.trim();
  const submit = () => {
    if (!trimmed) return;
    onSubmit({ label: trimmed, icon: icon.trim() || '🏷️', klass });
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-card dialog-card-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">New account type</h2>
        <label className="field"><span>Label</span>
          <input type="text" aria-label="Type label" className="input" autoFocus
            value={label} onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
        </label>
        <label className="field"><span>Icon</span>
          <input type="text" aria-label="Icon" className="input" maxLength={4}
            value={icon} onChange={(e) => setIcon(e.target.value)} />
        </label>
        <label className="field"><span>Class</span>
          <select aria-label="Class" className="select" value={klass} onChange={(e) => setKlass(e.target.value)}>
            {CLASS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!trimmed}>Add</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect PASS** (3 tests).
- [ ] **Step 5: Commit** `feat(account-types): QuickCreateAccountType quick-add dialog`.

---

## Task 2: Wire AccountEditor + App

**Files:** Modify `src/AccountEditor.jsx`, `src/App.jsx`, `src/AccountEditor.test.jsx`.

**Interfaces:**
- Consumes: `QuickCreateAccountType` (Task 1).
- Produces: `AccountEditor` accepts `onAddType = null`. The Type `<select>` gets a final `<option value="__new_type__">＋ New type…</option>` when `onAddType` is set; choosing it opens the dialog; on submit it creates the type and selects the new id.

- [ ] **Step 1: Failing test** (append to `AccountEditor.test.jsx`)

```jsx
describe('AccountEditor — inline create type', () => {
  afterEach(() => cleanup());

  it('creates a type from the select and selects it', async () => {
    const onAddType = vi.fn(() => 'nt1');
    const types = [
      { id: 'untyped', label: 'Unassigned' },
      { id: 'nt1', label: 'Brokerage' }, // simulates the post-add types list
    ];
    render(<AccountEditor account={null} types={types}
      onSave={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} onAddType={onAddType} />);
    await userEvent.selectOptions(screen.getByLabelText(/^type$/i), '__new_type__');
    await userEvent.type(screen.getByLabelText(/type label/i), 'Brokerage');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onAddType).toHaveBeenCalledWith({ label: 'Brokerage', icon: '🏷️', klass: 'asset' });
    expect(screen.getByLabelText(/^type$/i).value).toBe('nt1');
  });
});
```

Note: confirm `AccountEditor.test.jsx` already imports `cleanup`, `vi`, `userEvent`; if not, add them. Verify the actual Type control label is "Type" (`AccountEditor.jsx:36` uses `aria-label="Type"`).

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run src/AccountEditor.test.jsx`; no "＋ New type…").

- [ ] **Step 3: Implement**

3a. `src/AccountEditor.jsx` — import:
```jsx
import QuickCreateAccountType from './QuickCreateAccountType.jsx';
```

3b. Signature (`:7`) — add `onAddType = null`:
```jsx
export default function AccountEditor({ account, types = DEFAULT_ACCOUNT_TYPES, onSave, onDelete, onClose, onUndo, undoCount = 0, onAddType = null }) {
```

3c. State — after the other `useState`s:
```jsx
  const [creatingType, setCreatingType] = useState(false);
```

3d. Replace the Type field (`:35-39`):
```jsx
        <label className="field"><span>Type</span>
          <select aria-label="Type" value={type}
            onChange={(e) => {
              if (e.target.value === '__new_type__') setCreatingType(true);
              else setType(e.target.value);
            }} className="select">
            {types.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            {onAddType && <option value="__new_type__">＋ New type…</option>}
          </select>
        </label>
```

3e. Render the dialog — just before the final `</div></div>` that closes `.dialog-card`/`.dialog-overlay` (after `.dialog-actions`):
```jsx
        {creatingType && (
          <QuickCreateAccountType
            onSubmit={(p) => { const id = onAddType(p); setCreatingType(false); setType(id); }}
            onCancel={() => setCreatingType(false)} />
        )}
```

3f. `src/App.jsx` — the `AccountEditor` element (`:645` area), add:
```jsx
          types={accountTypes.types}
          onAddType={(p) => { pushHistory(); return accountTypes.addType(p); }}
```

- [ ] **Step 4: Run — expect PASS** (`npx vitest run src/AccountEditor.test.jsx`).
- [ ] **Step 5: Commit** `feat(account-types): inline create account type in AccountEditor`.

---

## Task 3: Full-suite checkpoint

- [ ] **Step 1:** `npx vitest run` — expect all green (1024 + ~4 new).
- [ ] **Step 2:** Visual smoke: the dialog reuses existing `.dialog-*` classes (already styled) — no new CSS needed; spot-check optional.
- [ ] **Step 3:** Checkpoint — pause for review before Phase 3.

## Self-Review

- Spec §6 (QuickCreateAccountType: Label/Icon/Class; defaults layout/group; AccountEditor "＋ New type…"; App `onAddType`; persist + Undo) → Tasks 1–2. ✓
- No placeholders; full code in every step. ✓
- Types consistent: `onSubmit({label,icon,klass})`, `onAddType(p)→id`, sentinel `__new_type__`. ✓
- Deviation from spec: quick-form Class defaults to `asset` (most new types are assets) rather than the full editor's `offsheet` default — noted; user sets it anyway.
