# Split blank-fix + Entry Templates + Copy/Paste — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new split lines render a blank amount box, and add a named template library plus a copy/paste clipboard for transactions and transfers.

**Architecture:** A single pure module (`entryDrafts.js`) normalizes any transaction/transfer into a reusable, account-agnostic draft and instantiates a fresh entry from one. `useClipboard` (single slot) and `useTemplates` (named list) persist drafts to `localStorage`. Copy/Paste, Duplicate, and template Save/Apply are wired in `App.jsx`, surfaced through a per-row kebab (`TransactionRow`), and register-header controls (`Register`). `instantiate*` emit exactly the object shapes the editors already save, so everything routes through existing `saveTransaction`/`saveTransfer`.

**Tech Stack:** React 19, Vitest + @testing-library/react, nanoid, fflate (archive), localStorage.

**Spec:** `docs/superpowers/specs/2026-06-15-templates-copy-paste-design.md`

**Conventions:**
- Run a single test file: `npx vitest run src/<file>` (e.g. `npx vitest run src/entryDrafts.test.js`).
- Run all tests: `npx vitest run`.
- Hook tests use `renderHook`/`act`; component tests use `render`/`screen`/`userEvent`; `beforeEach(() => localStorage.clear())` for anything touching storage.
- Storage keys are `tallio-*`. Persisted hooks follow the `useReportAcks.js` load/persist/storage-error pattern.

**Branch:** Work on a fresh branch off `feat/fable-redesign`, e.g. `feat/templates-copy-paste`.

---

## Task 1: Split blank-amount fix (`SplitsEditor.jsx`)

**Files:**
- Modify: `src/SplitsEditor.jsx`
- Test: `src/SplitsEditor.test.jsx`

- [ ] **Step 1: Write failing tests**

Append inside `describe('SplitsEditor', …)` in `src/SplitsEditor.test.jsx`:

```jsx
it('renders a blank amount box for a newly added line (not "0")', async () => {
  setup();
  await userEvent.click(screen.getByRole('button', { name: /add line/i }));
  const amountInputs = screen.getAllByRole('spinbutton', { name: /line amount/i });
  const added = amountInputs[amountInputs.length - 1];
  expect(added.value).toBe('');
});

it('lets a line amount be typed as cents without snapping back', async () => {
  setup({ initialSplits: [
    { id: 's1', amount: -1, categoryId: 'c_grocery', description: '' },
    { id: 's2', amount: 0,  categoryId: 'c_household', description: '' },
  ]});
  const amountInputs = screen.getAllByRole('spinbutton', { name: /line amount/i });
  const second = amountInputs[1];
  await userEvent.type(second, '0.05');
  expect(second.value).toBe('0.05');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/SplitsEditor.test.jsx`
Expected: FAIL — added line value is `"0"`, and typed value snaps.

- [ ] **Step 3: Implement `amountDrafts` map**

In `src/SplitsEditor.jsx`, add a state map next to the existing `dirs` state (after line ~22):

```jsx
const [amountDrafts, setAmountDrafts] = useState(new Map());
```

Replace the amount `<input>` (currently `value={Math.abs(line.amount)} onChange={(e) => setLineMagnitude(parseFloat(e.target.value) || 0)}`) with:

```jsx
<input type="number" step="0.01" min="0" aria-label="Line amount" className="input"
  value={amountDrafts.has(line.id) ? amountDrafts.get(line.id) : (line.amount ? String(Math.abs(line.amount)) : '')}
  onChange={(e) => {
    const raw = e.target.value;
    setAmountDrafts(prev => new Map(prev).set(line.id, raw));
    setLineMagnitude(parseFloat(raw) || 0);
  }} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/SplitsEditor.test.jsx`
Expected: PASS (all, including pre-existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/SplitsEditor.jsx src/SplitsEditor.test.jsx
git commit -m "fix(splits): blank amount box for new/zero split lines"
```

---

## Task 2: Entry-draft core (`entryDrafts.js`)

**Files:**
- Create: `src/entryDrafts.js`
- Test: `src/entryDrafts.test.js`

- [ ] **Step 1: Write the failing test file**

Create `src/entryDrafts.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  makeTransactionDraft, draftFromTransaction, instantiateTransaction,
  makeTransferDraft, draftFromTransfer, instantiateTransfer, labelFor,
} from './entryDrafts.js';

const bank = { id: 'a_bank', type: 'bank' };
const wallet = { id: 'a_wallet', type: 'untyped' };
const typesById = new Map([
  ['bank', { layout: 'bank' }],
  ['untyped', { layout: 'compact' }],
]);

describe('transaction drafts', () => {
  it('round-trips category, amount, description, payee through draft + instantiate', () => {
    const txn = { id: 't1', accountId: 'a_bank', date: '2026-01-01', amount: -42.5,
      categoryId: 'c_food', subId: null, description: 'Lunch', payee: 'Cafe', checkNumber: '101' };
    const draft = draftFromTransaction(txn);
    const out = instantiateTransaction(draft, { account: bank, typesById, date: '2026-06-15' });
    expect(out).toMatchObject({
      accountId: 'a_bank', date: '2026-06-15', amount: -42.5,
      categoryId: 'c_food', description: 'Lunch', payee: 'Cafe', checkNumber: '101', splits: null,
    });
    expect(out.id).toBeUndefined();
  });

  it('drops payee/check when target account is not a bank layout', () => {
    const draft = makeTransactionDraft({ description: 'x', amount: -5, categoryId: 'c', payee: 'P', checkNumber: '9' });
    const out = instantiateTransaction(draft, { account: wallet, typesById, date: '2026-06-15' });
    expect(out.payee).toBeNull();
    expect(out.checkNumber).toBeNull();
  });

  it('regenerates split-line ids and preserves the sum', () => {
    const txn = { accountId: 'a_bank', amount: -180, description: 'Costco',
      splits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery', description: 'Food' },
        { id: 's2', amount: -80,  categoryId: 'c_house',   description: 'Soap' },
      ] };
    const draft = draftFromTransaction(txn);
    const out = instantiateTransaction(draft, { account: bank, typesById, date: '2026-06-15' });
    expect(out.splits).toHaveLength(2);
    expect(out.splits.map(s => s.id)).not.toContain('s1');
    expect(out.splits.reduce((a, s) => a + s.amount, 0)).toBe(-180);
    expect(out.amount).toBe(-180);
  });

  it('rebuilds splitTargets for a transfer-type split line and falls back to a category when target is lost', () => {
    const draft = makeTransactionDraft(
      { description: 'mix', amount: -50,
        splits: [
          { id: 's1', amount: -30, transferId: 'tr_s1', description: 'to savings' },
          { id: 's2', amount: -20, categoryId: 'c_food', description: 'food' },
        ] },
      new Map([['s1', 'a_savings']]), // s1 targets a_savings
    );
    const kept = instantiateTransaction(draft, { account: bank, typesById, date: 'd', fallbackCategoryId: 'c_misc' });
    const transferLine = kept.splits.find(s => s.transferId);
    expect(transferLine).toBeTruthy();
    expect(kept.splitTargets.get(transferLine.id)).toBe('a_savings');

    // Same draft, but no targets known on instantiate path other than draft's own:
    const draftNoTarget = makeTransactionDraft(
      { description: 'mix', amount: -50,
        splits: [{ id: 's1', amount: -30, transferId: 'tr_s1' }, { id: 's2', amount: -20, categoryId: 'c_food' }] },
      new Map(), // target lost
    );
    const fell = instantiateTransaction(draftNoTarget, { account: bank, typesById, date: 'd', fallbackCategoryId: 'c_misc' });
    expect(fell.splits.every(s => s.categoryId)).toBe(true); // both are category lines now
    expect(fell.splits.some(s => s.transferId)).toBe(false);
  });
});

describe('transfer drafts', () => {
  it('round-trips from/to/amount/category/description', () => {
    const pair = {
      transferId: 'x',
      fromLeg: { accountId: 'a_bank', amount: -200, categoryId: 'c_xfer', description: 'move' },
      toLeg:   { accountId: 'a_savings', amount: 200 },
    };
    const draft = draftFromTransfer(pair);
    const out = instantiateTransfer(draft, { date: '2026-06-15' });
    expect(out).toMatchObject({ fromId: 'a_bank', toId: 'a_savings', amount: 200, date: '2026-06-15', categoryId: 'c_xfer', description: 'move' });
  });
});

describe('labelFor', () => {
  it('prefers payee, then description, with type fallbacks', () => {
    expect(labelFor(makeTransactionDraft({ payee: 'Mom', description: 'Zelle', amount: 50 }))).toBe('Mom');
    expect(labelFor(makeTransactionDraft({ description: 'Zelle', amount: 50 }))).toBe('Zelle');
    expect(labelFor(makeTransactionDraft({ amount: 50 }))).toBe('Transaction');
    expect(labelFor(makeTransferDraft({ fromId: 'a', toId: 'b', amount: 5, description: 'rent' }))).toBe('rent');
    expect(labelFor(makeTransferDraft({ fromId: 'a', toId: 'b', amount: 5 }))).toBe('Transfer');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/entryDrafts.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/entryDrafts.js`**

```js
// src/entryDrafts.js
// A reusable, account-agnostic snapshot of a transaction or transfer, and the
// inverse: a fresh entry instantiated from a draft. Pure — no React, no storage.
// instantiate* emit exactly the shapes TransactionEditor.save()/TransferEditor.save()
// emit, so callers route them through the existing App save handlers.
import { nanoid } from 'nanoid';
import { layoutFor, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';

const todayISO = () => new Date().toISOString().slice(0, 10);

// Stored splits → draft splits: strip per-line id/transferId; tag each line kind.
// A transfer line keeps its target account id (looked up in splitTargets) as targetId.
function draftSplits(splits, splitTargets) {
  if (!Array.isArray(splits) || splits.length === 0) return null;
  const targets = splitTargets instanceof Map ? splitTargets : new Map(Object.entries(splitTargets || {}));
  return splits.map(l => {
    const base = { amount: l.amount, description: l.description || '' };
    if (l.transferId) return { ...base, kind: 'transfer', targetId: targets.get(l.id) || null };
    return { ...base, kind: 'category', categoryId: l.categoryId || null, subId: l.subId || null };
  });
}

// Draft splits → concrete split lines (fresh ids) + a splitTargets Map. A transfer
// line whose target was lost degrades to a category line using fallbackCategoryId.
function buildSplits(draftLines, fallbackCategoryId) {
  if (!Array.isArray(draftLines) || draftLines.length === 0) return { splits: null, splitTargets: null };
  const splitTargets = new Map();
  const splits = draftLines.map(l => {
    const id = nanoid(8);
    const base = { id, amount: l.amount, description: l.description || '' };
    if (l.kind === 'transfer' && l.targetId) {
      splitTargets.set(id, l.targetId);
      return { ...base, transferId: `tr_${id}` };
    }
    const categoryId = l.categoryId || fallbackCategoryId || null;
    return { ...base, categoryId, ...(l.subId ? { subId: l.subId } : {}) };
  });
  return { splits, splitTargets: splitTargets.size ? splitTargets : null };
}

export function makeTransactionDraft(f, splitTargets = new Map()) {
  return { kind: 'transaction', payload: {
    description: f.description || '',
    amount: f.amount,
    categoryId: f.categoryId || null,
    subId: f.subId || null,
    payee: f.payee || null,
    checkNumber: f.checkNumber || null,
    splits: draftSplits(f.splits, splitTargets),
  } };
}

export function draftFromTransaction(txn, splitTargets = new Map()) {
  return makeTransactionDraft(txn, splitTargets);
}

export function instantiateTransaction(draft, { account, typesById = DEFAULT_ACCOUNT_TYPES_BY_ID, date = todayISO(), fallbackCategoryId = null } = {}) {
  const p = draft.payload;
  const isBank = layoutFor(account.type, typesById) === 'bank';
  const { splits, splitTargets } = buildSplits(p.splits, fallbackCategoryId);
  const amount = splits ? splits.reduce((s, l) => s + l.amount, 0) : p.amount;
  return {
    accountId: account.id,
    date,
    amount,
    categoryId: p.categoryId || null,
    subId: p.subId || null,
    description: p.description || '',
    payee: isBank ? (p.payee || null) : null,
    checkNumber: isBank ? (p.checkNumber || null) : null,
    splits: splits || null,
    ...(splitTargets ? { splitTargets } : {}),
  };
}

export function makeTransferDraft(f, splitTargets = new Map()) {
  return { kind: 'transfer', payload: {
    fromId: f.fromId,
    toId: f.toId,
    amount: Math.abs(f.amount),
    categoryId: f.categoryId || null,
    description: f.description || '',
    splits: draftSplits(f.splits, splitTargets),
  } };
}

export function draftFromTransfer(pair, splitTargets = new Map()) {
  return makeTransferDraft({
    fromId: pair.fromLeg.accountId,
    toId: pair.toLeg.accountId,
    amount: Math.abs(pair.fromLeg.amount),
    categoryId: pair.fromLeg.categoryId,
    description: pair.fromLeg.description,
    splits: pair.fromLeg.splits,
  }, splitTargets);
}

export function instantiateTransfer(draft, { date = todayISO(), fallbackCategoryId = null } = {}) {
  const p = draft.payload;
  const { splits, splitTargets } = buildSplits(p.splits, fallbackCategoryId);
  return {
    fromId: p.fromId,
    toId: p.toId,
    amount: p.amount,
    date,
    description: p.description || '',
    categoryId: p.categoryId || null,
    ...(splits ? { splits, splitTargets: splitTargets || new Map() } : {}),
  };
}

export function labelFor(draft) {
  const p = (draft && draft.payload) || {};
  if (draft && draft.kind === 'transfer') return p.description || 'Transfer';
  return p.payee || p.description || 'Transaction';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/entryDrafts.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entryDrafts.js src/entryDrafts.test.js
git commit -m "feat(entries): entryDrafts core — snapshot + instantiate transactions/transfers"
```

---

## Task 3: `useClipboard` hook

**Files:**
- Create: `src/useClipboard.js`
- Test: `src/useClipboard.test.jsx`

- [ ] **Step 1: Write failing test**

Create `src/useClipboard.test.jsx`:

```jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useClipboard from './useClipboard.js';

beforeEach(() => localStorage.clear());
const draft = { kind: 'transaction', payload: { description: 'Zelle', amount: 50 } };

describe('useClipboard', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useClipboard());
    expect(result.current.clipboard).toBeNull();
  });
  it('copy stores draft + label and persists across reload', () => {
    const h1 = renderHook(() => useClipboard());
    act(() => h1.result.current.copy(draft, 'Zelle'));
    expect(h1.result.current.clipboard).toEqual({ draft, label: 'Zelle' });
    const h2 = renderHook(() => useClipboard());
    expect(h2.result.current.clipboard).toEqual({ draft, label: 'Zelle' });
  });
  it('clear empties the slot', () => {
    const { result } = renderHook(() => useClipboard());
    act(() => result.current.copy(draft, 'Zelle'));
    act(() => result.current.clear());
    expect(result.current.clipboard).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/useClipboard.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/useClipboard.js`**

```js
// src/useClipboard.js
import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'tallio-clipboard';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.draft) return null;
    return { draft: parsed.draft, label: typeof parsed.label === 'string' ? parsed.label : '' };
  } catch {
    return null;
  }
}

// Single-slot copy/paste clipboard for entries. Persisted so the Paste button
// survives a reload. Follows the useReportAcks persist/error convention.
export default function useClipboard() {
  const [clipboard, setClipboard] = useState(load);
  const [storageError, setStorageError] = useState(null);

  useEffect(() => {
    try {
      if (clipboard) localStorage.setItem(STORAGE_KEY, JSON.stringify(clipboard));
      else localStorage.removeItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (storageError !== null) setStorageError(null);
    } catch (e) {
      console.error('Failed to save clipboard:', e);
      setStorageError({ message: "Couldn't save clipboard — storage full." });
    }
  }, [clipboard]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = useCallback((draft, label) => setClipboard({ draft, label: label || '' }), []);
  const clear = useCallback(() => setClipboard(null), []);
  const clearStorageError = useCallback(() => setStorageError(null), []);

  return { clipboard, copy, clear, storageError, clearStorageError };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/useClipboard.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/useClipboard.js src/useClipboard.test.jsx
git commit -m "feat(clipboard): single-slot persisted useClipboard hook"
```

---

## Task 4: `useTemplates` hook

**Files:**
- Create: `src/useTemplates.js`
- Test: `src/useTemplates.test.jsx`

- [ ] **Step 1: Write failing test**

Create `src/useTemplates.test.jsx`:

```jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useTemplates from './useTemplates.js';

beforeEach(() => localStorage.clear());
const draft = { kind: 'transaction', payload: { description: 'Paycheck', amount: 2500 } };

describe('useTemplates', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useTemplates());
    expect(result.current.templates).toEqual([]);
  });
  it('addTemplate stores a named item and persists across reload', () => {
    const h1 = renderHook(() => useTemplates());
    act(() => h1.result.current.addTemplate('Paycheck', draft));
    expect(h1.result.current.templates).toHaveLength(1);
    expect(h1.result.current.templates[0]).toMatchObject({ name: 'Paycheck', kind: 'transaction' });
    const h2 = renderHook(() => useTemplates());
    expect(h2.result.current.templates[0].name).toBe('Paycheck');
  });
  it('deleteTemplate removes by id', () => {
    const { result } = renderHook(() => useTemplates());
    let id;
    act(() => { id = result.current.addTemplate('Paycheck', draft); });
    act(() => result.current.deleteTemplate(id));
    expect(result.current.templates).toEqual([]);
  });
  it('exportSnapshot/restore round-trip', () => {
    const { result } = renderHook(() => useTemplates());
    act(() => result.current.addTemplate('Paycheck', draft));
    const snap = result.current.exportSnapshot();
    act(() => result.current.restore([]));
    expect(result.current.templates).toEqual([]);
    act(() => result.current.restore(snap));
    expect(result.current.templates[0].name).toBe('Paycheck');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/useTemplates.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/useTemplates.js`**

```js
// src/useTemplates.js
import { useState, useCallback, useEffect } from 'react';
import { nanoid } from 'nanoid';

const STORAGE_KEY = 'tallio-templates';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Named, persisted library of entry drafts (transactions and transfers).
export default function useTemplates() {
  const [templates, setTemplates] = useState(load);
  const [storageError, setStorageError] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (storageError !== null) setStorageError(null);
    } catch (e) {
      console.error('Failed to save templates:', e);
      setStorageError({ message: "Couldn't save template — storage full." });
    }
  }, [templates]); // eslint-disable-line react-hooks/exhaustive-deps

  const addTemplate = useCallback((name, draft) => {
    const item = { id: nanoid(8), name: (name || 'Untitled').trim(), kind: draft.kind, payload: draft.payload, createdAt: new Date().toISOString() };
    setTemplates(prev => [...prev, item]);
    return item.id;
  }, []);
  const deleteTemplate = useCallback((id) => setTemplates(prev => prev.filter(t => t.id !== id)), []);
  const exportSnapshot = useCallback(() => templates, [templates]);
  const restore = useCallback((list) => setTemplates(Array.isArray(list) ? list : []), []);
  const clearStorageError = useCallback(() => setStorageError(null), []);

  return { templates, addTemplate, deleteTemplate, exportSnapshot, restore, storageError, clearStorageError };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/useTemplates.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/useTemplates.js src/useTemplates.test.jsx
git commit -m "feat(templates): named persisted useTemplates hook"
```

---

## Task 5: `TemplateNameDialog` component

**Files:**
- Create: `src/TemplateNameDialog.jsx`
- Modify: `src/App.css` (small dialog width)
- Test: `src/TemplateNameDialog.test.jsx`

- [ ] **Step 1: Write failing test**

Create `src/TemplateNameDialog.test.jsx`:

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplateNameDialog from './TemplateNameDialog.jsx';

afterEach(() => cleanup());

describe('TemplateNameDialog', () => {
  it('prefills the default name and saves the trimmed value', async () => {
    const onSave = vi.fn();
    render(<TemplateNameDialog defaultName="Paycheck" onSave={onSave} onCancel={() => {}} />);
    const input = screen.getByRole('textbox', { name: /template name/i });
    expect(input.value).toBe('Paycheck');
    await userEvent.clear(input);
    await userEvent.type(input, '  Rent  ');
    await userEvent.click(screen.getByRole('button', { name: /save template/i }));
    expect(onSave).toHaveBeenCalledWith('Rent');
  });
  it('disables Save when the name is empty', async () => {
    render(<TemplateNameDialog defaultName="" onSave={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('button', { name: /save template/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/TemplateNameDialog.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/TemplateNameDialog.jsx`**

```jsx
// src/TemplateNameDialog.jsx
import React, { useState } from 'react';

export default function TemplateNameDialog({ defaultName = '', onSave, onCancel }) {
  const [name, setName] = useState(defaultName);
  const save = () => { const n = name.trim(); if (n) onSave(n); };
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-card dialog-card-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">Save as template</h2>
        <label className="field"><span>Template name</span>
          <input type="text" autoFocus aria-label="Template name" className="input" value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!name.trim()}>Save template</button>
        </div>
      </div>
    </div>
  );
}
```

Append to `src/App.css` (after the `.toast` block, anywhere global):

```css
/* ---- Save-as-template dialog ---- */
.dialog-card-sm { max-width: 380px; }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/TemplateNameDialog.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/TemplateNameDialog.jsx src/TemplateNameDialog.test.jsx src/App.css
git commit -m "feat(templates): TemplateNameDialog (name prompt)"
```

---

## Task 6: Editor `prefill` prop + "Save as template…" button

**Files:**
- Modify: `src/TransactionEditor.jsx`, `src/TransferEditor.jsx`
- Test: `src/TransactionEditor.test.jsx`, `src/TransferEditor.test.jsx`

- [ ] **Step 1: Write failing tests**

Append to `src/TransactionEditor.test.jsx` (use the file's existing render helper/props; if none, render directly as below):

```jsx
it('prefill seeds a NEW transaction (no Delete, fields filled)', () => {
  const account = { id: 'a_bank', name: 'Chase', type: 'bank' };
  render(<TransactionEditor account={account} categories={[{ id: 'c_food', name: 'Food', flow: 'expense' }]}
    accounts={[account]} prefill={{ accountId: 'a_bank', date: '2026-06-15', amount: -25, categoryId: 'c_food', description: 'Lunch', payee: 'Cafe', checkNumber: null, splits: null }}
    onSave={() => {}} onClose={() => {}} />);
  expect(screen.getByText(/New transaction/i)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull();
  expect(screen.getByLabelText(/^Description$/i).value).toBe('Lunch');
  expect(screen.getByLabelText(/^Amount$/i).value).toBe('25');
});

it('Save as template builds a draft from current fields', async () => {
  const account = { id: 'a_bank', name: 'Chase', type: 'bank' };
  const onSaveAsTemplate = vi.fn();
  render(<TransactionEditor account={account} categories={[{ id: 'c_food', name: 'Food', flow: 'expense' }]}
    accounts={[account]} onSaveAsTemplate={onSaveAsTemplate} onSave={() => {}} onClose={() => {}} />);
  await userEvent.type(screen.getByLabelText(/^Description$/i), 'Coffee');
  await userEvent.click(screen.getByRole('button', { name: /save as template/i }));
  expect(onSaveAsTemplate).toHaveBeenCalledTimes(1);
  expect(onSaveAsTemplate.mock.calls[0][0]).toMatchObject({ kind: 'transaction', payload: { description: 'Coffee' } });
});
```

Append an equivalent pair to `src/TransferEditor.test.jsx`:

```jsx
it('prefill seeds a NEW transfer', () => {
  const accounts = [{ id: 'a_bank', name: 'Chase', type: 'bank' }, { id: 'a_sav', name: 'Savings', type: 'bank' }];
  render(<TransferEditor accounts={accounts} categories={[]}
    prefill={{ fromId: 'a_bank', toId: 'a_sav', amount: 200, date: '2026-06-15', description: 'move', categoryId: null }}
    onSave={() => {}} onClose={() => {}} />);
  expect(screen.getByText(/New transfer/i)).toBeTruthy();
  expect(screen.getByLabelText(/^Amount$/i).value).toBe('200');
  expect(screen.getByLabelText(/^Notes$/i).value).toBe('move');
});

it('Save as template builds a transfer draft', async () => {
  const accounts = [{ id: 'a_bank', name: 'Chase', type: 'bank' }, { id: 'a_sav', name: 'Savings', type: 'bank' }];
  const onSaveAsTemplate = vi.fn();
  render(<TransferEditor accounts={accounts} categories={[]}
    fromAccountId="a_bank" toAccountId="a_sav" initialAmount={100}
    onSaveAsTemplate={onSaveAsTemplate} onSave={() => {}} onClose={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /save as template/i }));
  expect(onSaveAsTemplate.mock.calls[0][0]).toMatchObject({ kind: 'transfer', payload: { fromId: 'a_bank', toId: 'a_sav', amount: 100 } });
});
```

(Ensure `vi` is imported in `TransferEditor.test.jsx` — add it to the `from 'vitest'` import if missing.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/TransactionEditor.test.jsx src/TransferEditor.test.jsx`
Expected: FAIL — `prefill`/`onSaveAsTemplate` unsupported.

- [ ] **Step 3: Implement `TransactionEditor.jsx`**

Add the import near the top:

```jsx
import { makeTransactionDraft } from './entryDrafts.js';
```

Change the signature to accept `prefill` and `onSaveAsTemplate`:

```jsx
export default function TransactionEditor({ account, transaction, categories, accounts = [], typesById = DEFAULT_ACCOUNT_TYPES_BY_ID, prefill = null, onSave, onDelete, onClose, onUndo, undoCount = 0, onSaveAsTemplate = null }) {
```

Replace the initial-state block (lines ~12–25) with one that falls back to `prefill` for a new entry:

```jsx
  const isEdit = !!transaction;
  const seed = transaction || prefill || null;
  const initialAmount = seed ? Math.abs(seed.amount) : '';
  const initialDir = seed ? (seed.amount >= 0 ? 'in' : 'out') : 'out';

  const [date, setDate] = useState(seed?.date || todayISO());
  const [description, setDescription] = useState(seed?.description || '');
  const [magnitude, setMagnitude] = useState(initialAmount);
  const [direction, setDirection] = useState(initialDir);
  const [categoryId, setCategoryId] = useState(seed?.categoryId || (categories[0] && categories[0].id) || '');
  const [subId, setSubId] = useState(seed?.subId ?? null);
  const [payee, setPayee] = useState(seed?.payee || '');
  const [checkNumber, setCheckNumber] = useState(seed?.checkNumber || '');
  const [splits, setSplits] = useState(seed?.splits ?? null);
  const [splitTargets, setSplitTargets] = useState(prefill?.splitTargets instanceof Map ? prefill.splitTargets : new Map());
  const [splitsOpen, setSplitsOpen] = useState(false);
  const [pendingSeed, setPendingSeed] = useState(null);
```

Add a draft builder (near `save`):

```jsx
  const buildTemplateDraft = () => makeTransactionDraft({
    description: description.trim(),
    amount: parentAmount,
    categoryId, subId,
    payee: isBank ? (payee.trim() || null) : null,
    checkNumber: isBank ? (checkNumber.trim() || null) : null,
    splits: hasSplits ? splits : null,
  }, splitTargets);
```

Add the button to the `dialog-actions` row (before Cancel):

```jsx
{onSaveAsTemplate && <button type="button" className="btn" onClick={() => onSaveAsTemplate(buildTemplateDraft())}>Save as template…</button>}
```

- [ ] **Step 4: Implement `TransferEditor.jsx`**

Add import:

```jsx
import { makeTransferDraft } from './entryDrafts.js';
```

Add `prefill` and `onSaveAsTemplate` to the signature:

```jsx
export default function TransferEditor({ accounts = [], categories = [], fromAccountId = null, toAccountId = null, initialAmount = null, transfer = null, prefill = null, types = DEFAULT_ACCOUNT_TYPES, typesById = DEFAULT_ACCOUNT_TYPES_BY_ID, onSave, onDelete, onClose, onUndo, undoCount = 0, onSaveAsTemplate = null }) {
```

Update the initial-state lines to fall back to `prefill` (only the changed lines):

```jsx
  const [fromId, setFromId] = useState(transfer ? transfer.fromLeg.accountId : (prefill?.fromId || fromAccountId || (accounts[0] && accounts[0].id) || ''));
  const [toId, setToId]     = useState(transfer ? transfer.toLeg.accountId : (prefill?.toId || toAccountId || ''));
  const [date, setDate]     = useState(transfer ? (transfer.fromLeg.date || todayISO()) : (prefill?.date || todayISO()));
  const [magnitude, setMagnitude]     = useState(transfer ? Math.abs(transfer.fromLeg.amount) : (prefill ? String(prefill.amount) : (initialAmount != null ? String(initialAmount) : '')));
  const [description, setDescription] = useState(transfer ? (transfer.fromLeg.description || '') : (prefill?.description || ''));
```

Update the category initial state to consider `prefill`:

```jsx
  const [categoryId, setCategoryId] = useState(
    transfer
      ? (transfer.fromLeg.categoryId || '')
      : (prefill?.categoryId || suggestTransferCategoryId(accounts.find(a => a.id === (toAccountId || '')), transferCats) || '')
  );
```

Update splits initial state:

```jsx
  const [splits, setSplits] = useState(transfer?.fromLeg?.splits ?? prefill?.splits ?? null);
  const [splitTargets, setSplitTargets] = useState(prefill?.splitTargets instanceof Map ? prefill.splitTargets : new Map());
```

Add a draft builder near `save`:

```jsx
  const buildTemplateDraft = () => makeTransferDraft({
    fromId, toId, amount: mag, categoryId: categoryId || null, description: description.trim(),
    splits: hasSplits ? splits : null,
  }, splitTargets);
```

Add the button to `dialog-actions` (before Cancel):

```jsx
{onSaveAsTemplate && <button type="button" className="btn" onClick={() => onSaveAsTemplate(buildTemplateDraft())}>Save as template…</button>}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/TransactionEditor.test.jsx src/TransferEditor.test.jsx`
Expected: PASS (including pre-existing tests).

- [ ] **Step 6: Commit**

```bash
git add src/TransactionEditor.jsx src/TransferEditor.jsx src/TransactionEditor.test.jsx src/TransferEditor.test.jsx
git commit -m "feat(editors): prefill prop + Save-as-template button"
```

---

## Task 7: Row kebab menu (`TransactionRow.jsx` + `Register.jsx` column)

**Files:**
- Modify: `src/TransactionRow.jsx`, `src/Register.jsx`
- Test: `src/TransactionRow.test.jsx`

- [ ] **Step 1: Write failing test**

Append to `src/TransactionRow.test.jsx` (wrap the row in a `<table><tbody>` as the file's existing tests do):

```jsx
it('kebab menu fires copy / duplicate / save-template and does not open the editor', async () => {
  const onEdit = vi.fn(), onCopy = vi.fn(), onDuplicate = vi.fn(), onSaveTemplate = vi.fn();
  const row = { id: 't1', date: '2026-06-15', description: 'Zelle', amount: 50, categoryId: 'c_food' };
  render(<table><tbody>
    <TransactionRow layout="compact" row={row}
      categoriesById={new Map([['c_food', { name: 'Food', icon: '🍔' }]])}
      onEdit={onEdit} onCopy={onCopy} onDuplicate={onDuplicate} onSaveTemplate={onSaveTemplate} />
  </tbody></table>);
  await userEvent.click(screen.getByRole('button', { name: /row actions/i }));
  await userEvent.click(screen.getByRole('menuitem', { name: /^copy$/i }));
  expect(onCopy).toHaveBeenCalledWith(row);
  expect(onEdit).not.toHaveBeenCalled();
});
```

(Ensure `vi` and `userEvent` are imported in `TransactionRow.test.jsx`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/TransactionRow.test.jsx`
Expected: FAIL — no row-actions button.

- [ ] **Step 3: Implement the kebab cell in `TransactionRow.jsx`**

Add the import:

```jsx
import ActionMenu from './ActionMenu.jsx';
```

Update the signature to accept the new callbacks (defaults make them optional so existing tests pass):

```jsx
export default function TransactionRow({ layout, row, categoriesById, transfer = null, onNavigate, onEdit, expandSplitHint = null, onCopy = null, onDuplicate = null, onSaveTemplate = null }) {
```

Define the actions cell once, before the `return`:

```jsx
  const actionItems = [
    onCopy && { label: 'Copy', onSelect: () => onCopy(row) },
    onDuplicate && { label: 'Duplicate', onSelect: () => onDuplicate(row) },
    onSaveTemplate && { label: 'Save as template…', onSelect: () => onSaveTemplate(row) },
  ].filter(Boolean);
  const actionsCell = actionItems.length > 0
    ? <td className="txn-actions" onClick={(e) => e.stopPropagation()}><ActionMenu label="Row actions" items={actionItems} /></td>
    : <td className="txn-actions" />;
```

Add `{actionsCell}` as the last `<td>` in BOTH the `bank` layout main `<tr>` (after the balance cell) and the `compact` layout main `<tr>` (after the balance cell). For the split detail `<tr>`s in both layouts, add a trailing empty `<td></td>` so column counts stay aligned.

- [ ] **Step 4: Add the column in `Register.jsx`**

In `Register.jsx`, after the `columns.map(...)` header cells (inside the `<tr>` in `<thead>`), add a trailing empty header:

```jsx
            <th className="th-actions" aria-hidden="true"></th>
```

Update the empty-state `colSpan` from `columns.length` to `columns.length + 1`:

```jsx
            <tr><td colSpan={columns.length + 1} className="register-empty">No transactions.</td></tr>
```

Thread the callbacks into `<TransactionRow>` and accept them as Register props. Update the Register signature:

```jsx
export default function Register({ account, transactions, accounts = [], categories, categoriesById, typesById, onEditTransaction, onAddTransaction, onTransfer = () => {}, onSelectAccount = () => {}, onEditAccount = null, onCopyEntry = null, onDuplicateEntry = null, onSaveTemplateEntry = null, clipboard = null, onPaste = () => {}, onClearClipboard = () => {}, templates = [], onApplyTemplate = () => {}, onDeleteTemplate = () => {} }) {
```

And pass to the row:

```jsx
                onCopy={onCopyEntry}
                onDuplicate={onDuplicateEntry}
                onSaveTemplate={onSaveTemplateEntry}
```

Append CSS to `src/App.css`:

```css
.txn-actions { width: 34px; text-align: center; }
.th-actions { width: 34px; }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/TransactionRow.test.jsx src/Register.test.jsx`
Expected: PASS (existing Register tests still green with the extra column).

- [ ] **Step 6: Commit**

```bash
git add src/TransactionRow.jsx src/Register.jsx src/TransactionRow.test.jsx src/App.css
git commit -m "feat(register): per-row kebab (Copy / Duplicate / Save as template)"
```

---

## Task 8: Register header — Paste button + Templates menu

**Files:**
- Create: `src/TemplatesMenu.jsx`
- Modify: `src/Register.jsx`, `src/App.css`
- Test: `src/Register.test.jsx`

- [ ] **Step 1: Write failing test**

Append to `src/Register.test.jsx`. The block is self-contained (its own fixtures + helper, uniquely named to avoid clashing with the file's existing top-level consts), so it runs regardless of the file's existing setup. Ensure `vi` and `userEvent` are imported.

```jsx
describe('Register — paste + templates header', () => {
  const pAccount = { id: 'a1', name: 'Checking', type: 'bank', icon: '🏦' };
  const pTypes = new Map([['bank', { layout: 'bank', label: 'Bank', class: 'asset' }]]);
  const renderRegister = (extra = {}) => render(
    <Register
      account={pAccount} transactions={[]} accounts={[pAccount]}
      categories={[]} categoriesById={new Map()} typesById={pTypes}
      onEditTransaction={() => {}} onAddTransaction={() => {}}
      {...extra}
    />
  );

  it('hides the Paste button when the clipboard is empty', () => {
    renderRegister({ clipboard: null });
    expect(screen.queryByRole('button', { name: /paste/i })).toBeNull();
  });

  it('shows the Paste button when the clipboard is full and fires onPaste', async () => {
    const onPaste = vi.fn();
    renderRegister({ clipboard: { draft: {}, label: 'Zelle — Mom' }, onPaste });
    await userEvent.click(screen.getByRole('button', { name: /paste "Zelle — Mom"/i }));
    expect(onPaste).toHaveBeenCalled();
  });

  it('lists templates and applies one on click', async () => {
    const onApplyTemplate = vi.fn();
    renderRegister({ templates: [{ id: 'tpl1', name: 'Paycheck', kind: 'transaction', payload: {} }], onApplyTemplate, onDeleteTemplate: () => {} });
    await userEvent.click(screen.getByRole('button', { name: /templates/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /paycheck/i }));
    expect(onApplyTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: 'tpl1' }));
  });
});
```

> If the file does not already `import userEvent from '@testing-library/user-event'` and `vi` from `vitest`, add them.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/Register.test.jsx`
Expected: FAIL — no Paste button / Templates menu.

- [ ] **Step 3: Implement `src/TemplatesMenu.jsx`**

```jsx
// src/TemplatesMenu.jsx
// Labeled "Templates ▾" dropdown: click an item to apply, × to delete.
// Reuses the .action-menu-popover / .action-menu-item styling.
import React, { useState, useRef, useEffect } from 'react';

export default function TemplatesMenu({ templates = [], onApply, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (templates.length === 0) return null;

  return (
    <span className="action-menu" ref={ref} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
      <button type="button" className="btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        Templates ▾
      </button>
      {open && (
        <div className="action-menu-popover align-left template-menu" role="menu">
          {templates.map((t) => (
            <div key={t.id} className="template-menu-row">
              <button type="button" role="menuitem" className="action-menu-item template-menu-apply"
                onClick={() => { setOpen(false); onApply(t); }}>
                {t.kind === 'transfer' ? '⇄ ' : ''}{t.name}
              </button>
              <button type="button" className="template-menu-del" aria-label={`Delete template ${t.name}`}
                onClick={() => onDelete(t.id)}>×</button>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Wire into `Register.jsx` header actions**

Add the import:

```jsx
import TemplatesMenu from './TemplatesMenu.jsx';
```

In the `register-actions` block, after the Transfer button, add the Paste button and Templates menu:

```jsx
          {clipboard && (
            <span className="paste-chip">
              <button type="button" className="btn" onClick={onPaste} aria-label={`Paste "${clipboard.label}"`}>
                ⎘ Paste “{clipboard.label}”
              </button>
              <button type="button" className="btn-icon paste-clear" onClick={onClearClipboard} aria-label="Clear clipboard">×</button>
            </span>
          )}
          <TemplatesMenu templates={templates} onApply={onApplyTemplate} onDelete={onDeleteTemplate} />
```

Append CSS to `src/App.css`:

```css
.paste-chip { display: inline-flex; align-items: center; gap: 2px; }
.template-menu { min-width: 200px; }
.template-menu-row { display: flex; align-items: center; }
.template-menu-apply { flex: 1; text-align: left; }
.template-menu-del { border: none; background: none; color: var(--muted, #999); cursor: pointer; padding: 6px 10px; font-size: 15px; }
.template-menu-del:hover { color: var(--danger, #e0564f); }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/Register.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/TemplatesMenu.jsx src/Register.jsx src/Register.test.jsx src/App.css
git commit -m "feat(register): Paste button + Templates menu in header"
```

---

## Task 9: App wiring (clipboard, templates, toast, handlers)

**Files:**
- Modify: `src/App.jsx`

**Testing note:** This codebase has **no full-`<App/>` render test** — `<App/>` pulls in IndexedDB, peerjs, and other browser surfaces, and the existing "smoke" tests (e.g. `src/__smoke__/splits.test.jsx`) exercise hooks/models directly rather than mounting the App. The wiring contract is already covered by automated tests written in Tasks 6–8 (Register fires `onPaste`/`onApplyTemplate`; TransactionRow fires `onCopy`/`onDuplicate`/`onSaveTemplate`; editors accept `prefill` and emit drafts via `onSaveAsTemplate`). This task is the glue connecting those callbacks to the tested `entryDrafts`/`useClipboard`/`useTemplates` units, and is verified by the **full suite + lint + a manual smoke** (Steps 5–6) — consistent with how App-level integration is verified elsewhere in this repo. Do **not** add a full-App render test here.

- [ ] **Step 1: Add imports to `App.jsx`**

```jsx
import useClipboard from './useClipboard.js';
import useTemplates from './useTemplates.js';
import TemplateNameDialog from './TemplateNameDialog.jsx';
import { draftFromTransaction, draftFromTransfer, instantiateTransaction, instantiateTransfer, labelFor } from './entryDrafts.js';
```

`resolveTransfer` is already imported from `accountsModel.js` (it is used at line ~682). If it is not in the import list, add it.

- [ ] **Step 2: Add hooks + toast state**

Near the other hooks/state (after `const [editingTransfer, …]`):

```jsx
  const clip = useClipboard();
  const templates = useTemplates();
  const [templateDraft, setTemplateDraft] = useState(null); // { draft, defaultName } | null
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const flashToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
```

> Ensure `useRef`, `useCallback`, `useEffect` are imported from `react` at the top of `App.jsx` (add any that are missing).

- [ ] **Step 3: Add the handlers**

Place these after `saveTransfer`/`deleteTransfer` (so `saveTransaction`/`saveTransfer` are in scope):

```jsx
  const fallbackCategoryId = () => (cats.categories[0] && cats.categories[0].id) || null;

  const copyEntry = (row) => {
    const pair = resolveTransfer(row, ledger.transactions);
    const draft = pair ? draftFromTransfer(pair) : draftFromTransaction(row);
    const label = labelFor(draft);
    clip.copy(draft, label);
    flashToast(`Copied “${label}”`);
  };

  const pasteEntry = () => {
    if (!clip.clipboard) return;
    const { draft } = clip.clipboard;
    if (draft.kind === 'transfer') {
      saveTransfer(instantiateTransfer(draft, { fallbackCategoryId: fallbackCategoryId() }));
    } else if (selectedAccount) {
      saveTransaction(instantiateTransaction(draft, { account: selectedAccount, typesById: accountTypes.typesById, fallbackCategoryId: fallbackCategoryId() }));
    }
  };

  const duplicateEntry = (row) => {
    const pair = resolveTransfer(row, ledger.transactions);
    if (pair) saveTransfer(instantiateTransfer(draftFromTransfer(pair), { fallbackCategoryId: fallbackCategoryId() }));
    else if (selectedAccount) saveTransaction(instantiateTransaction(draftFromTransaction(row), { account: selectedAccount, typesById: accountTypes.typesById, fallbackCategoryId: fallbackCategoryId() }));
    flashToast('Duplicated');
  };

  const saveTemplateFromRow = (row) => {
    const pair = resolveTransfer(row, ledger.transactions);
    const draft = pair ? draftFromTransfer(pair) : draftFromTransaction(row);
    setTemplateDraft({ draft, defaultName: labelFor(draft) });
  };
  const requestSaveTemplate = (draft) => setTemplateDraft({ draft, defaultName: labelFor(draft) });
  const confirmSaveTemplate = (name) => {
    if (templateDraft) { templates.addTemplate(name, templateDraft.draft); flashToast(`Saved template “${name}”`); }
    setTemplateDraft(null);
  };

  const applyTemplate = (tpl) => {
    const draft = { kind: tpl.kind, payload: tpl.payload };
    if (tpl.kind === 'transfer') {
      setEditingTransfer({ mode: 'new', prefill: instantiateTransfer(draft, { fallbackCategoryId: fallbackCategoryId() }) });
    } else if (selectedAccount) {
      setEditingTxn({ mode: 'new', accountId: selectedAccount.id, prefill: instantiateTransaction(draft, { account: selectedAccount, typesById: accountTypes.typesById, fallbackCategoryId: fallbackCategoryId() }) });
    }
  };
```

- [ ] **Step 4: Pass props to `<Register>` and the editors; render the dialog + toast**

In the `<Register …>` JSX add:

```jsx
                  onCopyEntry={copyEntry}
                  onDuplicateEntry={duplicateEntry}
                  onSaveTemplateEntry={saveTemplateFromRow}
                  clipboard={clip.clipboard}
                  onPaste={pasteEntry}
                  onClearClipboard={clip.clear}
                  templates={templates.templates}
                  onApplyTemplate={applyTemplate}
                  onDeleteTemplate={templates.deleteTemplate}
```

In `<TransactionEditor …>` add:

```jsx
          prefill={editingTxn.prefill || null}
          onSaveAsTemplate={requestSaveTemplate}
```

In `<TransferEditor …>` add:

```jsx
          prefill={editingTransfer.prefill || null}
          onSaveAsTemplate={requestSaveTemplate}
```

Render the name dialog and toast (near the other top-level overlays/toasts, e.g. after the `editingTransfer` block):

```jsx
      {templateDraft && (
        <TemplateNameDialog
          defaultName={templateDraft.defaultName}
          onSave={confirmSaveTemplate}
          onCancel={() => setTemplateDraft(null)}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
```

- [ ] **Step 5: Run the full suite + lint**

Run: `npx vitest run`
Expected: PASS (whole suite — Tasks 6–8 component tests now exercise the wiring through real App callbacks).
Run: `npx eslint src/App.jsx`
Expected: clean.

- [ ] **Step 6: Manual smoke (`npm run dev`)**

In the browser: select an account → open a row's ⋮ → **Copy** (a "Copied …" toast appears and a **Paste** button shows in the header) → click **Paste** (a duplicate row appears, today's date) → open ⋮ → **Save as template…**, name it, Save (a "Saved template …" toast appears) → open **Templates ▾** → click the template (the editor opens titled "New transaction", pre-filled). Confirm Duplicate adds one row immediately.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat(app): wire copy/paste, duplicate, templates, and copy toast"
```

---

## Task 10: Export templates in the backup archive

**Files:**
- Modify: `src/exportArchive.js`, `src/App.jsx`
- Test: `src/exportArchive.test.js`

**Note:** There is **no in-app archive *import*** today — `App.exportData` builds a zip download, and `parseArchive` (in `exportArchive.js`) is the inverse helper but is not wired into any import UI. So this task only adds templates to the *export* (and the data round-trip at the module level). `useTemplates.restore()` already exists for parity with the other hooks (undo + any future import); no App restore wiring is needed.

- [ ] **Step 1: Write failing test**

Append to `src/exportArchive.test.js`. Ensure the imports from `./exportArchive.js` include `buildDataJson`, `buildArchive`, and `parseArchive` (add any that are missing).

```js
it('round-trips templates through the archive and tolerates their absence', () => {
  const templates = [{ id: 'tpl1', name: 'Paycheck', kind: 'transaction', payload: { description: 'Pay', amount: 2500 }, createdAt: '2026-06-15T00:00:00.000Z' }];

  // data.json carries templates and the bumped schema version.
  const json = buildDataJson([], [], [], [], 5, '0.0.0', new Date('2026-06-15'), null, templates);
  const parsed = JSON.parse(json);
  expect(parsed.schemaVersion).toBe(5);
  expect(parsed.templates).toEqual(templates);

  // Full zip round-trip: buildArchive → parseArchive surfaces templates on .data.
  const bytes = buildArchive({ accounts: [], transactions: [], categories: [], accountTypes: [], schemaVersion: 5, appVersion: '0.0.0', now: new Date('2026-06-15'), templates });
  expect(parseArchive(bytes).data.templates).toEqual(templates);

  // Legacy archive without templates → field defaults to [].
  const legacy = JSON.parse(buildDataJson([], [], [], [], 4, '0.0.0', new Date('2026-06-15')));
  expect(legacy.templates ?? []).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/exportArchive.test.js`
Expected: FAIL — `templates` arg unsupported / undefined.

- [ ] **Step 3: Implement in `exportArchive.js`**

Update `buildDataJson` to accept and emit `templates`:

```js
export function buildDataJson(accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now, reportAcks = null, templates = null) {
  return JSON.stringify({
    schemaVersion,
    exportedAt: now.toISOString(),
    appVersion,
    accounts: accounts || [],
    transactions: transactions || [],
    categories: categories || [],
    accountTypes: accountTypes || [],
    reportAcks: reportAcks || { subscriptions: {}, dismissedDuplicates: [] },
    templates: templates || [],
  }, null, 2);
}
```

Thread it through `buildArchive` — add `templates` to the destructured options and pass to `buildDataJson`:

```js
export function buildArchive({ accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now, reportAcks, images, appearance, templates }) {
  const categoriesById = new Map((categories || []).map(c => [c.id, c]));
  const jsonString = buildDataJson(accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now, reportAcks, templates);
  // …unchanged below…
```

- [ ] **Step 4: Wire `App.jsx` export**

In `App.jsx` `exportData` (the `buildArchive({ … })` call near line ~376), bump the version and pass templates:

```jsx
      reportAcks: acks.exportSnapshot(),
      templates: templates.exportSnapshot(),
      images, appearance: appearanceSettings,
      schemaVersion: 5, appVersion: pkg.version, now: new Date(),
```

No import/restore wiring — see the task Note (there is no in-app archive import).

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/exportArchive.test.js`
Expected: PASS.
Then: `npx vitest run`
Expected: PASS (whole suite).

- [ ] **Step 6: Lint + commit**

```bash
npx eslint src/entryDrafts.js src/useClipboard.js src/useTemplates.js src/TemplateNameDialog.jsx src/TemplatesMenu.jsx src/TransactionRow.jsx src/Register.jsx src/TransactionEditor.jsx src/TransferEditor.jsx src/SplitsEditor.jsx src/exportArchive.js src/App.jsx
git add src/exportArchive.js src/App.jsx src/exportArchive.test.js
git commit -m "feat(export): include templates in backup archive (schema v5)"
```

---

## Final verification

- [ ] Run the entire suite: `npx vitest run` — all green.
- [ ] Run lint across the repo: `npx eslint .` — clean (fix any issues before finishing).
- [ ] Manual smoke (via `npm run dev`): add a split transaction (new line shows a blank amount box); copy a row (toast appears, Paste button shows); paste twice; save a template from a row and from the editor; apply a template (editor opens prefilled); delete a template; export a backup and confirm `templates` appear in `data.json` inside the zip.

## Self-review notes (coverage check vs spec)

- Spec §1 blank-fix → Task 1.
- Spec §2 entryDrafts (draft/instantiate/labelFor, payee-by-layout, split id regen, transfer-line fallback) → Task 2.
- Spec §3 clipboard + Paste button + instant paste + toast → Tasks 3, 8, 9.
- Spec §4 templates (hook, name dialog, save points, Templates menu, prefill apply) → Tasks 4, 5, 6, 8, 9.
- Spec §5 row kebab (Copy/Duplicate/Save-as-template) → Task 7.
- Spec §6 export → Task 10. (Import half is N/A — the app has no archive-import path; `useTemplates.restore()` is in place for when one is added. Spec updated to match.)
- Transient toast (Copied / Duplicated / Saved template) → Task 9.
- Type consistency: `makeTransactionDraft`/`makeTransferDraft`/`draftFrom*`/`instantiate*`/`labelFor` names are used identically across Tasks 2, 6, 9; hook APIs (`copy/clear/clipboard`, `addTemplate/deleteTemplate/exportSnapshot/restore/templates`) match across Tasks 3–4 and 8–10.
