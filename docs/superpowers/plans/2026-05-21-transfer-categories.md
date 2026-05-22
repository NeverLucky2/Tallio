# Transfer Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a transfer be tagged with a "type" drawn from a new `'transfer'` category flow, shown as a pill (icon + name, tinted with the category color) after the existing account-class chip in the register.

**Architecture:** Reuse the category system — transfers carry a `categoryId` (both legs share it). A new `'transfer'` flow is seeded into the category list idempotently on load (no schema-version bump). The transfer editor gets a Type dropdown that auto-suggests from the destination account type. Reporting is unaffected (transfer legs are already excluded by `transferId`).

**Tech Stack:** React 19, Vite, Vitest + @testing-library/react, localStorage persistence, nanoid ids.

**Spec:** `docs/superpowers/specs/2026-05-21-transfer-categories-design.md`

**Conventions:** Tests are colocated `*.test.{js,jsx}`. Run a single file with `npx vitest run src/<file>.test.jsx`. Commit after each green task. Work in this worktree; do not `cd` to the main repo.

---

### Task 1: `'transfer'` seed categories + idempotent append helper

**Files:**
- Modify: `src/categoriesDefaults.js`
- Test: `src/categoriesDefaults.test.js` (append a `describe` block)

- [ ] **Step 1: Write the failing test**

Append to `src/categoriesDefaults.test.js` (add `TRANSFER_SEED_CATEGORIES, withTransferSeeds, V3_SEED_CATEGORIES` to the existing import from `./categoriesDefaults.js`):

```js
describe('transfer seed categories', () => {
  it('every seed is flow:transfer with empty keywords', () => {
    for (const s of TRANSFER_SEED_CATEGORIES) {
      expect(s.flow).toBe('transfer');
      expect(s.keywords).toEqual([]);
    }
  });

  it('seed names do not collide with default or v3 category names', () => {
    const existing = new Set([...DEFAULT_CATEGORIES, ...V3_SEED_CATEGORIES].map(c => c.name));
    for (const s of TRANSFER_SEED_CATEGORIES) expect(existing.has(s.name)).toBe(false);
  });

  it('withTransferSeeds appends all seeds (with string ids) to an empty list', () => {
    const out = withTransferSeeds([]);
    expect(out).toHaveLength(TRANSFER_SEED_CATEGORIES.length);
    for (const c of out) expect(typeof c.id).toBe('string');
    expect(out.map(c => c.name).sort()).toEqual(TRANSFER_SEED_CATEGORIES.map(s => s.name).sort());
  });

  it('is idempotent — second pass adds nothing and returns the same reference', () => {
    const once = withTransferSeeds([]);
    const twice = withTransferSeeds(once);
    expect(twice).toBe(once);
  });

  it('appends only missing seeds, preserving existing categories without duplicating', () => {
    const existing = [
      { id: 'x', name: 'Credit Card Payment', flow: 'transfer' },
      { id: 'y', name: 'Groceries', flow: 'expense' },
    ];
    const out = withTransferSeeds(existing);
    const names = out.map(c => c.name);
    expect(names).toContain('Groceries');
    expect(names.filter(n => n === 'Credit Card Payment')).toHaveLength(1);
    expect(names).toContain('Internal Transfer');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/categoriesDefaults.test.js`
Expected: FAIL — `TRANSFER_SEED_CATEGORIES`/`withTransferSeeds` are not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/categoriesDefaults.js`, add an import at the very top:

```js
import { nanoid } from 'nanoid';
```

Append at the end of the file:

```js
// Seed categories for the 'transfer' flow (transfer "types"). Names are chosen
// not to collide with any existing category name, since the append-by-name
// helper skips duplicates. keywords:[] so they never affect auto-categorization.
export const TRANSFER_SEED_CATEGORIES = [
  { name: 'Credit Card Payment', icon: '💳', color: '#d4a853', flow: 'transfer', keywords: [], templates: [], builtin: true },
  { name: 'Loan Payment',        icon: '🏷️', color: '#e0928a', flow: 'transfer', keywords: [], templates: [], builtin: true },
  { name: 'Investment Transfer', icon: '📈', color: '#5b8dff', flow: 'transfer', keywords: [], templates: [], builtin: true },
  { name: 'Savings Transfer',    icon: '🪙', color: '#22d3ee', flow: 'transfer', keywords: [], templates: [], builtin: true },
  { name: 'Cash Withdrawal',     icon: '💵', color: '#3ddba0', flow: 'transfer', keywords: [], templates: [], builtin: true },
  { name: 'Internal Transfer',   icon: '⇄',  color: '#a47dea', flow: 'transfer', keywords: [], templates: [], builtin: true },
];

// Append any transfer seed whose `name` isn't already present (assigning a fresh
// id). Idempotent: returns the SAME array reference when nothing is missing.
export function withTransferSeeds(categories) {
  const list = Array.isArray(categories) ? categories : [];
  const names = new Set(list.map(c => c && c.name));
  const missing = TRANSFER_SEED_CATEGORIES
    .filter(s => !names.has(s.name))
    .map(s => ({ ...s, id: nanoid(8) }));
  return missing.length ? [...list, ...missing] : list;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/categoriesDefaults.test.js`
Expected: PASS (all, including the prior tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/categoriesDefaults.js src/categoriesDefaults.test.js
git commit -m "feat(categories): add 'transfer' flow seed categories + withTransferSeeds"
```

---

### Task 2: Seed transfer categories on load + allow `'transfer'` flow in `useCategories`

**Files:**
- Modify: `src/useCategories.js` (`seed()` ~line 9, `load()` lines 13–23, `addCategory` flow coercion ~line 64)
- Test: `src/useCategories.test.jsx` (update 2 existing tests, add 2)

- [ ] **Step 1: Update the two existing tests that will break, and add new ones**

In `src/useCategories.test.jsx`, extend the import on line 4 to include the transfer exports:

```js
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_NAME, TRANSFER_SEED_CATEGORIES } from './categoriesDefaults.js';
```

Replace the existing **"seeds from DEFAULT_CATEGORIES when localStorage is empty"** test (lines 13–19) with:

```js
  it('seeds DEFAULT_CATEGORIES + transfer seeds when localStorage is empty', () => {
    const { result } = renderHook(() => useCategories());
    expect(result.current.categories).toHaveLength(DEFAULT_CATEGORIES.length + TRANSFER_SEED_CATEGORIES.length);
    for (const cat of result.current.categories) expect(typeof cat.id).toBe('string');
    const names = result.current.categories.map(c => c.name);
    for (const s of TRANSFER_SEED_CATEGORIES) expect(names).toContain(s.name);
  });
```

Replace the existing **"hydrates from localStorage when present"** test (lines 21–26) with (stored data is augmented with transfer seeds, so assert the stored row survives and seeds are appended):

```js
  it('hydrates from localStorage and appends any missing transfer seeds', () => {
    const seeded = [{ id: 'cz', name: 'Zoo', icon: '🦓', color: '#000000', keywords: [], templates: [], builtin: false }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    const { result } = renderHook(() => useCategories());
    expect(result.current.categories.find(c => c.id === 'cz')).toEqual(seeded[0]);
    expect(result.current.categories).toHaveLength(1 + TRANSFER_SEED_CATEGORIES.length);
  });
```

Add these two new tests inside the `describe('useCategories', ...)` block:

```js
  it('does not duplicate transfer seeds that are already stored (idempotent load)', () => {
    const stored = TRANSFER_SEED_CATEGORIES.map((s, i) => ({ ...s, id: `t${i}` }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const { result } = renderHook(() => useCategories());
    expect(result.current.categories).toHaveLength(TRANSFER_SEED_CATEGORIES.length);
  });

  it('addCategory preserves a transfer flow (not coerced to expense)', () => {
    const { result } = renderHook(() => useCategories());
    let id;
    act(() => { id = result.current.addCategory({ name: 'Payoff', icon: '✅', color: '#fff', flow: 'transfer' }); });
    expect(result.current.getById(id).flow).toBe('transfer');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useCategories.test.jsx`
Expected: FAIL — load doesn't append seeds; `addCategory` coerces `'transfer'` to `'expense'`.

- [ ] **Step 3: Write minimal implementation**

In `src/useCategories.js`, line 4 import — add `withTransferSeeds`:

```js
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_NAME, withTransferSeeds } from './categoriesDefaults.js';
```

Replace `seed()` and `load()` (lines 9–23):

```js
function seed() {
  return withTransferSeeds(DEFAULT_CATEGORIES.map(c => ({ ...c, id: nanoid(8) })));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return seed();
    return withTransferSeeds(parsed);
  } catch {
    return seed();
  }
}
```

In `addCategory`, change the flow coercion line (currently `flow: flow === 'income' || flow === 'savings' ? flow : 'expense',`) to:

```js
      flow: ['income', 'savings', 'transfer'].includes(flow) ? flow : 'expense',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useCategories.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/useCategories.js src/useCategories.test.jsx
git commit -m "feat(categories): seed transfer categories on load; allow transfer flow"
```

---

### Task 3: `suggestTransferCategoryId` helper

**Files:**
- Modify: `src/accountsModel.js` (add near `transferDraftForAccount`, ~line 207)
- Test: `src/accountsModel.test.js` (append a `describe` block with its own import)

- [ ] **Step 1: Write the failing test**

Append to `src/accountsModel.test.js`:

```js
import { suggestTransferCategoryId } from './accountsModel.js';

describe('suggestTransferCategoryId', () => {
  const transferCats = [
    { id: 'cc', name: 'Credit Card Payment', flow: 'transfer' },
    { id: 'ln', name: 'Loan Payment', flow: 'transfer' },
    { id: 'iv', name: 'Investment Transfer', flow: 'transfer' },
  ];

  it('maps destination account type to the matching transfer category id', () => {
    expect(suggestTransferCategoryId({ id: 'a', type: 'credit_card' }, transferCats)).toBe('cc');
    expect(suggestTransferCategoryId({ id: 'a', type: 'loan' }, transferCats)).toBe('ln');
    expect(suggestTransferCategoryId({ id: 'a', type: 'mortgage' }, transferCats)).toBe('ln');
    expect(suggestTransferCategoryId({ id: 'a', type: 'investment' }, transferCats)).toBe('iv');
  });

  it('returns null for ambiguous / unmapped destination types', () => {
    expect(suggestTransferCategoryId({ id: 'a', type: 'bank' }, transferCats)).toBeNull();
    expect(suggestTransferCategoryId({ id: 'a', type: 'person' }, transferCats)).toBeNull();
    expect(suggestTransferCategoryId({ id: 'a', type: 'untyped' }, transferCats)).toBeNull();
    expect(suggestTransferCategoryId({ id: 'a', type: 'custom_xyz' }, transferCats)).toBeNull();
  });

  it('returns null gracefully when no account or the seed was renamed/removed', () => {
    expect(suggestTransferCategoryId(null, transferCats)).toBeNull();
    expect(suggestTransferCategoryId({ id: 'a', type: 'credit_card' }, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/accountsModel.test.js`
Expected: FAIL — `suggestTransferCategoryId` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/accountsModel.js`, add after `transferDraftForAccount` (~line 225):

```js
// Suggested transfer category for a NEW transfer, keyed off the DESTINATION
// account's built-in type. Best-effort: returns the matching transfer-flow
// category's id, or null when the type has no sensible default or the seed was
// renamed/removed. `transferCategories` is the flow:'transfer' subset.
const TRANSFER_SUGGESTION_BY_TYPE = {
  credit_card: 'Credit Card Payment',
  loan:        'Loan Payment',
  mortgage:    'Loan Payment',
  investment:  'Investment Transfer',
};

export function suggestTransferCategoryId(toAccount, transferCategories) {
  if (!toAccount) return null;
  const name = TRANSFER_SUGGESTION_BY_TYPE[toAccount.type];
  if (!name) return null;
  const match = (transferCategories || []).find(c => c && c.name === name);
  return match ? match.id : null;
}
```

> Note: this refines the spec signature `(toAccount, transferCategories, typesById)` — `typesById` is unnecessary because the mapping keys directly off the built-in type id. Custom account types fall through to `null` (acceptable best-effort).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/accountsModel.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/accountsModel.js src/accountsModel.test.js
git commit -m "feat(transfers): suggestTransferCategoryId from destination account type"
```

---

### Task 4: Carry `categoryId` on transfer legs in `useLedger`

**Files:**
- Modify: `src/useLedger.js` (`addTransfer` ~line 70, `updateTransfer` ~line 81)
- Test: `src/useLedger.test.jsx` (add tests)

- [ ] **Step 1: Write the failing test**

Add inside the existing `useLedger` describe block in `src/useLedger.test.jsx` (match the file's existing `renderHook`/`act` setup; `addTransfer` returns the transferId):

```js
  it('addTransfer stores categoryId on both legs (null when omitted)', () => {
    const { result } = renderHook(() => useLedger({ accounts: [{ id: 'a1' }, { id: 'a2' }], transactions: [] }));
    let tid;
    act(() => { tid = result.current.addTransfer({ fromId: 'a1', toId: 'a2', amount: 100, date: '2026-05-20', categoryId: 'cat_x' }); });
    const legs = result.current.transactions.filter(t => t.transferId === tid);
    expect(legs).toHaveLength(2);
    for (const leg of legs) expect(leg.categoryId).toBe('cat_x');

    let tid2;
    act(() => { tid2 = result.current.addTransfer({ fromId: 'a1', toId: 'a2', amount: 50, date: '2026-05-20' }); });
    for (const leg of result.current.transactions.filter(t => t.transferId === tid2)) expect(leg.categoryId).toBeNull();
  });

  it('updateTransfer updates categoryId on both legs', () => {
    const { result } = renderHook(() => useLedger({ accounts: [{ id: 'a1' }, { id: 'a2' }], transactions: [] }));
    let tid;
    act(() => { tid = result.current.addTransfer({ fromId: 'a1', toId: 'a2', amount: 100, date: '2026-05-20', categoryId: 'cat_x' }); });
    act(() => { result.current.updateTransfer(tid, { fromId: 'a1', toId: 'a2', amount: 100, date: '2026-05-20', categoryId: 'cat_y' }); });
    for (const leg of result.current.transactions.filter(t => t.transferId === tid)) expect(leg.categoryId).toBe('cat_y');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useLedger.test.jsx`
Expected: FAIL — legs have `categoryId: null` regardless of input.

- [ ] **Step 3: Write minimal implementation**

In `src/useLedger.js`, `addTransfer` (line 70) — accept `categoryId` and put it on the shared base:

```js
  const addTransfer = useCallback(({ fromId, toId, amount, date, description = '', categoryId = null }) => {
    const transferId = nanoid(8);
    const mag = Math.abs(Number(amount)) || 0;
    const note = description || '';
    const base = { date, categoryId: categoryId ?? null, description: note, payee: null, checkNumber: null, transferId };
    const fromLeg = { id: nanoid(8), accountId: fromId, amount: -mag, ...base };
    const toLeg   = { id: nanoid(8), accountId: toId,   amount:  mag, ...base };
    setTransactions(prev => [...prev, fromLeg, toLeg]);
    return transferId;
  }, []);
```

`updateTransfer` (line 81) — accept `categoryId` and set it on both legs (replace the two hardcoded `categoryId: null`):

```js
  const updateTransfer = useCallback((transferId, { fromId, toId, amount, date, description = '', categoryId = null }) => {
    if (!transferId) return;
    const mag = Math.abs(Number(amount)) || 0;
    const note = description || '';
    const cid = categoryId ?? null;
    setTransactions(prev => {
      const legs = prev.filter(t => t.transferId === transferId);
      if (legs.length === 0) return prev;
      const fromLegId = legs[0].id;             // deterministic: first leg = From
      const toLegId = legs[1] ? legs[1].id : null;
      return prev.map(t => {
        if (t.id === fromLegId) return { ...t, accountId: fromId, amount: -mag, date, categoryId: cid, description: note, payee: null, checkNumber: null, transferId };
        if (toLegId && t.id === toLegId) return { ...t, accountId: toId, amount: mag, date, categoryId: cid, description: note, payee: null, checkNumber: null, transferId };
        return t;
      });
    });
  }, []);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useLedger.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/useLedger.js src/useLedger.test.jsx
git commit -m "feat(transfers): carry categoryId on both transfer legs"
```

---

### Task 5: Type dropdown + auto-suggest in `TransferEditor`

**Files:**
- Modify: `src/TransferEditor.jsx`
- Test: `src/TransferEditor.test.jsx` (add tests)

- [ ] **Step 1: Write the failing test**

Add to `src/TransferEditor.test.jsx`. Define fixtures and tests (the existing `setup()` helper omits `categories`; these tests render `TransferEditor` directly with their own props):

```js
const transferCats = [
  { id: 'cc', name: 'Credit Card Payment', icon: '💳', color: '#d4a853', flow: 'transfer' },
  { id: 'iv', name: 'Investment Transfer', icon: '📈', color: '#5b8dff', flow: 'transfer' },
  { id: 'exp', name: 'Groceries', icon: '🛒', color: '#10B981', flow: 'expense' },
];
const acctsTyped = [
  { id: 'a_chk', name: 'Checking', type: 'bank' },
  { id: 'a_visa', name: 'Visa', type: 'credit_card' },
];

it('Type dropdown lists only transfer-flow categories plus None', () => {
  render(<TransferEditor accounts={acctsTyped} categories={transferCats} fromAccountId="a_chk"
    onSave={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />);
  const select = screen.getByLabelText(/^type$/i);
  const optionText = Array.from(select.querySelectorAll('option')).map(o => o.textContent);
  expect(optionText.some(t => /none/i.test(t))).toBe(true);
  expect(optionText.some(t => /Credit Card Payment/.test(t))).toBe(true);
  expect(optionText.some(t => /Groceries/.test(t))).toBe(false); // expense flow excluded
});

it('new transfer auto-suggests a type from the destination account', async () => {
  const onSave = vi.fn();
  render(<TransferEditor accounts={acctsTyped} categories={transferCats} fromAccountId="a_chk"
    onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()} />);
  await userEvent.selectOptions(screen.getByLabelText(/to account/i), 'a_visa'); // credit_card → Credit Card Payment
  await userEvent.type(screen.getByLabelText(/amount/i), '200');
  await userEvent.click(screen.getByRole('button', { name: /save transfer/i }));
  expect(onSave.mock.calls[0][0].categoryId).toBe('cc');
});

it('a manual Type choice is preserved when the To account later changes', async () => {
  const onSave = vi.fn();
  render(<TransferEditor accounts={acctsTyped} categories={transferCats} fromAccountId="a_chk"
    onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()} />);
  await userEvent.selectOptions(screen.getByLabelText(/^type$/i), 'iv'); // user picks Investment Transfer
  await userEvent.selectOptions(screen.getByLabelText(/to account/i), 'a_visa'); // would suggest 'cc'
  await userEvent.type(screen.getByLabelText(/amount/i), '200');
  await userEvent.click(screen.getByRole('button', { name: /save transfer/i }));
  expect(onSave.mock.calls[0][0].categoryId).toBe('iv'); // not overridden
});

it('edit mode shows the existing categoryId and emits it on save', async () => {
  const onSave = vi.fn();
  const transfer = {
    transferId: 'x',
    fromLeg: { id: 'f', accountId: 'a_chk', amount: -500, date: '2026-05-20', description: 'Move', categoryId: 'iv' },
    toLeg:   { id: 't', accountId: 'a_visa', amount: 500, date: '2026-05-20', description: 'Move', categoryId: 'iv' },
  };
  render(<TransferEditor accounts={acctsTyped} categories={transferCats} transfer={transfer}
    onSave={onSave} onDelete={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByLabelText(/^type$/i).value).toBe('iv');
  await userEvent.click(screen.getByRole('button', { name: /save transfer/i }));
  expect(onSave.mock.calls[0][0].categoryId).toBe('iv');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/TransferEditor.test.jsx`
Expected: FAIL — no Type control / no `categoryId` in payload.

- [ ] **Step 3: Write minimal implementation**

In `src/TransferEditor.jsx`:

Add to the import line for accountsModel:

```js
import { groupAccounts, suggestTransferCategoryId, DEFAULT_ACCOUNT_TYPES, DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';
```

Add `categories = []` to the props destructuring. After the existing `useState` lines (after line 14), add:

```js
  const transferCats = (categories || []).filter(c => c && c.flow === 'transfer');
  const [categoryId, setCategoryId] = useState(
    transfer
      ? (transfer.fromLeg.categoryId || '')
      : (suggestTransferCategoryId(accounts.find(a => a.id === (toAccountId || '')), transferCats) || '')
  );
  const [typeTouched, setTypeTouched] = useState(false);

  const onToChange = (e) => {
    const next = e.target.value;
    setToId(next);
    if (!isEdit && !typeTouched) {
      setCategoryId(suggestTransferCategoryId(accounts.find(a => a.id === next), transferCats) || '');
    }
  };
  const onTypeChange = (e) => { setTypeTouched(true); setCategoryId(e.target.value); };
```

Change the To `<select>` `onChange` (line 44) from `onChange={(e) => setToId(e.target.value)}` to `onChange={onToChange}`.

Add a Type field after the Notes field (after line 64):

```jsx
        <label className="field"><span>Type</span>
          <select aria-label="Type" value={categoryId} onChange={onTypeChange} className="select">
            <option value="">— None —</option>
            {transferCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </label>
```

Add `categoryId` to the `save()` payload:

```js
    onSave({
      ...(transfer ? { transferId: transfer.transferId } : {}),
      fromId, toId, amount: mag, date, description: description.trim(),
      categoryId: categoryId || null,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/TransferEditor.test.jsx`
Expected: PASS (including the pre-existing tests, which use partial `toMatchObject` and are unaffected by the added `categoryId`).

- [ ] **Step 5: Commit**

```bash
git add src/TransferEditor.jsx src/TransferEditor.test.jsx
git commit -m "feat(transfers): Type dropdown with auto-suggest in TransferEditor"
```

---

### Task 6: Type pill in the register (`TransferChip`) + CSS

**Files:**
- Modify: `src/TransactionRow.jsx` (`TransferChip` lines 16–29; both `TransferChip` usages, lines 41 and 54; add a `transferCategory` lookup)
- Modify: `src/App.css` (after line 3322)
- Test: `src/TransactionRow.test.jsx` (add tests)

- [ ] **Step 1: Write the failing test**

Add to `src/TransactionRow.test.jsx` (the file already defines `baseRow`; add a transfer category to the map inline):

```js
it('renders a type pill (icon + name) when a transfer has a transfer category', () => {
  const tcat = { id: 'c_inv', name: 'Investment Transfer', icon: '📈', color: '#5b8dff' };
  const row = { ...baseRow, categoryId: 'c_inv' };
  render(<table><tbody><TransactionRow layout="compact" row={row}
    categoriesById={new Map([[tcat.id, tcat]])}
    transfer={{ counterpartName: 'Fidelity', direction: 'out', counterpartClass: 'offsheet' }}
    onEdit={() => {}} /></tbody></table>);
  expect(screen.getByText('Investment Transfer')).toBeTruthy();
  expect(screen.getByText('Fidelity')).toBeTruthy(); // account chip still present
});

it('renders no type pill for an untyped transfer', () => {
  const row = { ...baseRow, categoryId: null };
  render(<table><tbody><TransactionRow layout="compact" row={row} categoriesById={new Map()}
    transfer={{ counterpartName: 'Savings', direction: 'out', counterpartClass: 'asset' }}
    onEdit={() => {}} /></tbody></table>);
  expect(screen.getByText('Savings').className).toContain('txn-transfer--asset'); // chip color intact
  expect(screen.queryByText('Investment Transfer')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/TransactionRow.test.jsx`
Expected: FAIL — the first new test can't find "Investment Transfer".

- [ ] **Step 3: Write minimal implementation**

In `src/TransactionRow.jsx`, replace `TransferChip` (lines 16–29) with a version that takes a `category` and wraps chip + optional pill:

```jsx
function TransferChip({ info, category, onNavigate }) {
  const cls = info.counterpartClass ? ` txn-transfer--${info.counterpartClass}` : '';
  return (
    <span className="txn-transfer-wrap">
      <span className={`txn-cat txn-transfer${cls}`}>
        <span className="txn-transfer-glyph" aria-hidden="true">⇄ {info.direction === 'out' ? '→' : '←'}</span> {info.counterpartName}
        {info.counterpartId && (
          <button type="button" className="txn-transfer-jump" aria-label={`Go to ${info.counterpartName}`}
            onClick={(e) => { e.stopPropagation(); if (onNavigate) onNavigate(info.counterpartId); }}>
            <span aria-hidden="true">↗</span>
          </button>
        )}
      </span>
      {category && (
        <span className="txn-transfer-type"
          style={{ color: category.color, borderColor: `${category.color}55`, background: `${category.color}1a` }}>
          <span aria-hidden="true">{category.icon}</span> {category.name}
        </span>
      )}
    </span>
  );
}
```

In the `TransactionRow` function body, after the `fmtDate` line (line 32), add:

```jsx
  const transferCategory = transfer && row.categoryId && categoriesById ? (categoriesById.get(row.categoryId) || null) : null;
```

Update both `TransferChip` usages to pass the category — line 41 (bank layout) and line 54 (compact layout):

```jsx
{transfer ? <TransferChip info={transfer} category={transferCategory} onNavigate={onNavigate} /> : <CategoryCell categoriesById={categoriesById} categoryId={row.categoryId} />}
```

In `src/App.css`, add after line 3322 (after the `.txn-transfer-jump:hover` rule):

```css
.txn-transfer-wrap { display: inline-flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
.txn-transfer-type { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.05rem 0.4rem; border-radius: 6px; border: 1px solid; font-size: 0.72rem; white-space: nowrap; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/TransactionRow.test.jsx`
Expected: PASS (including the pre-existing transfer-chip tests — they use `categoryId: null`, so no pill renders and `getByText('Savings')` still resolves to the chip span).

- [ ] **Step 5: Commit**

```bash
git add src/TransactionRow.jsx src/App.css src/TransactionRow.test.jsx
git commit -m "feat(transfers): show transfer type pill after the account chip"
```

---

### Task 7: Category-management integration (editor flow option + manage screen group)

**Files:**
- Modify: `src/CategoryEditor.jsx` (`FLOW_OPTIONS` lines 6–10; flow-change copy line 40)
- Modify: `src/ManageCategoriesScreen.jsx` (flow group list line 66)
- Test: `src/CategoryEditor.test.jsx` (add a test); `src/ManageCategoriesScreen.test.jsx` (add a test)

- [ ] **Step 1: Write the failing tests**

In `src/CategoryEditor.test.jsx`, add a test that the Transfer flow option is offered (match the file's existing render/setup style; the flow control is a `radiogroup` labeled "Category flow"):

```js
it('offers a Transfer flow option', () => {
  // render CategoryEditor for a category, following this file's existing setup helper
  // (e.g. an expense category); then:
  expect(screen.getByRole('radio', { name: /transfer/i })).toBeTruthy();
});
```

In `src/ManageCategoriesScreen.test.jsx`, add a test that a transfer-flow category is grouped under "transfer" (match the file's existing render style — it passes a `categories` array and renders the list):

```js
it('groups transfer-flow categories under a transfer group', () => {
  // render ManageCategoriesScreen with a categories array that includes
  // { id:'t1', name:'Credit Card Payment', icon:'💳', color:'#d4a853', flow:'transfer' }
  // following this file's existing setup, then:
  expect(screen.getByText('Credit Card Payment')).toBeTruthy();
  expect(screen.getByText('transfer')).toBeTruthy(); // the flow group label
});
```

> When writing these, copy the exact render/props pattern already used at the top of each test file (do not invent a new harness). The assertions above are the behavior to verify.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/CategoryEditor.test.jsx src/ManageCategoriesScreen.test.jsx`
Expected: FAIL — no Transfer radio option; no "transfer" group label.

- [ ] **Step 3: Write minimal implementation**

In `src/CategoryEditor.jsx`, extend `FLOW_OPTIONS` (lines 6–10):

```js
const FLOW_OPTIONS = [
  { key: 'income',   label: 'Income'   },
  { key: 'expense',  label: 'Expense'  },
  { key: 'savings',  label: 'Savings'  },
  { key: 'transfer', label: 'Transfer' },
];
```

In the flow-change confirmation copy (line 40), add a `'transfer'` branch to the bucket-name ternary:

```jsx
          Changing this category from <strong>{fromFlow}</strong> to <strong>{toFlow}</strong> will reclassify {itemCount} item{itemCount === 1 ? '' : 's'} into the {toFlow === 'income' ? 'Income' : toFlow === 'savings' ? 'Saved' : toFlow === 'transfer' ? 'Transfer' : 'Spent'} bucket. This affects past months too.
```

In `src/ManageCategoriesScreen.jsx`, extend the flow group list (line 66):

```jsx
          {(['income', 'expense', 'savings', 'transfer']).map(flow => {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/CategoryEditor.test.jsx src/ManageCategoriesScreen.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/CategoryEditor.jsx src/ManageCategoriesScreen.jsx src/CategoryEditor.test.jsx src/ManageCategoriesScreen.test.jsx
git commit -m "feat(categories): expose transfer flow in editor + manage screen"
```

---

### Task 8: Reporting regression — categorized transfers stay excluded

**Files:**
- Test only: `src/reportsModel.test.js` (add tests). No production change — `flowOf` already returns `null` for transfer legs (line 81) and only whitelists `income|expense|savings` (line 84), so a `'transfer'` flow already yields `null`.

- [ ] **Step 1: Write the regression test**

Add to `src/reportsModel.test.js` (match the file's existing import of `incomeExpenseSummary` and category-map fixtures):

```js
describe('transfers stay out of reports even when categorized', () => {
  it('a transfer leg with a transfer-flow category contributes nothing to income/spending/savings', () => {
    const categoriesById = new Map([['ct', { id: 'ct', name: 'Credit Card Payment', flow: 'transfer' }]]);
    const txns = [
      { id: 'o', accountId: 'a', date: '2026-05-10', amount: -300, transferId: 'tr', categoryId: 'ct' },
      { id: 'i', accountId: 'b', date: '2026-05-10', amount:  300, transferId: 'tr', categoryId: 'ct' },
    ];
    const sum = incomeExpenseSummary(txns, categoriesById, {});
    expect(sum.income).toBe(0);
    expect(sum.spending).toBe(0);
  });

  it('defensively, a non-transfer row carrying a transfer-flow category is also non-countable', () => {
    const categoriesById = new Map([['ct', { id: 'ct', name: 'Credit Card Payment', flow: 'transfer' }]]);
    const txns = [{ id: 'n', accountId: 'a', date: '2026-05-10', amount: -300, categoryId: 'ct' }];
    const sum = incomeExpenseSummary(txns, categoriesById, {});
    expect(sum.income).toBe(0);
    expect(sum.spending).toBe(0);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/reportsModel.test.js`
Expected: **PASS immediately** — this is a characterization/regression test locking already-correct behavior (the `flowOf` whitelist excludes `'transfer'`). If it fails, `incomeExpenseSummary`'s field names differ — read the function (lines 88–100) and align the assertions; do not change production behavior.

- [ ] **Step 3: Commit**

```bash
git add src/reportsModel.test.js
git commit -m "test(reports): lock that categorized transfers stay excluded from reports"
```

---

### Task 9: Wire `categories` into the editor in `App.jsx` + full verification

**Files:**
- Modify: `src/App.jsx` (`<TransferEditor>` render, lines 373–382)

- [ ] **Step 1: Add the `categories` prop**

In `src/App.jsx`, add `categories={cats.categories}` to the `<TransferEditor>` element (between `accounts` and `types`, lines 374–375):

```jsx
        <TransferEditor
          accounts={ledger.accounts}
          categories={cats.categories}
          types={accountTypes.types}
          typesById={accountTypes.typesById}
          fromAccountId={editingTransfer.fromAccountId || null}
          toAccountId={editingTransfer.toAccountId || null}
          initialAmount={editingTransfer.initialAmount ?? null}
          transfer={editingTransfer.transfer || null}
          onSave={saveTransfer} onDelete={deleteTransfer} onClose={() => setEditingTransfer(null)}
        />
```

> No change to `saveTransfer` is needed: it passes the editor's `data` (now including `categoryId`) straight to `ledger.addTransfer`/`updateTransfer`.

- [ ] **Step 2: Run the FULL test suite**

Run: `npx vitest run`
Expected: PASS — all suites, no regressions.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Manual verification in the app**

Run: `npm run dev`, open the printed localhost URL. Then:
- Open a transfer from an account → the editor shows a **Type** dropdown; selecting **To = a credit card** auto-fills "Credit Card Payment"; override it and confirm the override sticks if you change To again.
- Save → the register shows the colored account chip **plus** the type pill (icon + name) on both accounts' registers.
- Settings → Manage Categories shows a **transfer** group; add/rename a transfer category and confirm it appears in the editor dropdown.
- Confirm the Reports screen totals are unchanged by adding a categorized transfer.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(transfers): pass categories to TransferEditor (wire up transfer types)"
```

---

## Self-Review

**Spec coverage:**
- Data model (`'transfer'` flow, shared `categoryId`, optional) → Tasks 1, 4.
- Seed categories + idempotent seed-on-load (no schema bump) → Tasks 1, 2.
- Auto-suggest from destination type → Tasks 3, 5.
- Editor Type dropdown → Task 5.
- Register pill (Option A) + CSS → Task 6.
- Category-management integration (editor/manage/coercion) → Tasks 2 (coercion), 7.
- Reporting safety → Task 8 (already-correct behavior locked).
- App wiring → Task 9.

**Placeholder scan:** Tasks 1–6, 8, 9 contain complete code. Task 7's two tests intentionally defer to each file's existing render harness (the assertions are concrete); this is the one spot requiring the implementer to mirror an existing setup rather than copy verbatim, because those harnesses weren't read in full during planning.

**Type/name consistency:** `withTransferSeeds`, `TRANSFER_SEED_CATEGORIES`, `suggestTransferCategoryId(toAccount, transferCategories)`, leg field `categoryId`, CSS `.txn-transfer-wrap` / `.txn-transfer-type`, prop `category` on `TransferChip` — all used consistently across tasks. Transfer seed names match between Task 1 (definition), Task 3 (suggestion mapping), and Task 5 (fixtures).
