# Account-to-Account Transfers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen by the user) to implement this plan task-by-task with review checkpoints. TDD by the lead session (not subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user move money between two accounts as a single linked transfer (a negative leg + a positive leg sharing one `transferId`), created/edited in a dedicated dialog, displayed clearly in the register, and kept out of category/spending math.

**Architecture:** The balanced-pair invariant lives in `useLedger` via three new atomic methods (`addTransfer`/`updateTransfer`/`deleteTransfer`). Pure helpers in `accountsModel` resolve a leg's counterpart for display and editor seeding. A new `TransferEditor` dialog drives creation/edit; `Register`/`TransactionRow` render a transfer chip; `App` wires a `⇄ Transfer` button, branches row-clicks between the two editors, and wraps each pair operation in one `pushHistory()` for undo. Export gains a CSV `transfer` column.

**Tech Stack:** React 18 + Vite, Vitest + @testing-library/react + @testing-library/user-event, `nanoid`, `fflate` (zip), localStorage persistence.

**Spec:** `docs/superpowers/specs/2026-05-20-transfers-design.md`

**Conventions carried from Phase 1:**
- Run tests from this worktree: `npx vitest run <file>`.
- New params/props are optional with safe defaults so all 351 existing tests stay green.
- Commit only the specific files each task touches — **never `git add -A`** (it sweeps `.claude/settings.local.json`).
- Component tests use `afterEach(() => cleanup())`; emoji/glyphs go in their own `<span aria-hidden>` so `getByText` matches text labels (only direct text-node children count toward `getByText`).
- Commit messages end with: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/useLedger.js` | Modify | Add `addTransfer`, `updateTransfer`, `deleteTransfer`; export them. `deleteAccount` unchanged. |
| `src/useLedger.test.jsx` | Modify | New `transfers` describe block. |
| `src/accountsModel.js` | Modify | Add pure `transferCounterpart`, `transferInfo`, `resolveTransfer`. |
| `src/accountsModel.test.js` | Modify | New `transfers` + `net-worth neutrality` describe blocks. |
| `src/TransferEditor.jsx` | Create | From/To/Date/Amount/Notes dialog; validation; new+edit payloads; delete. |
| `src/TransferEditor.test.jsx` | Create | Render, validation, payload, edit seeding, delete. |
| `src/TransactionRow.jsx` | Modify | Optional `transfer` prop → chip in the Category cell. |
| `src/TransactionRow.test.jsx` | Modify | Chip render (out →, in ←); unchanged when absent. |
| `src/Register.jsx` | Modify | `accounts`/`onTransfer` props; `⇄ Transfer` button; per-row `transferInfo` annotation. |
| `src/Register.test.jsx` | Modify | Button fires `onTransfer`; transfer leg shows chip. |
| `src/App.jsx` | Modify | `editingTransfer` state; button wiring; row-click branching; `saveTransfer`/`deleteTransfer` handlers; `<TransferEditor>` render. |
| `src/exportArchive.js` | Modify | CSV `transfer` column; blank category/flow for transfer legs. |
| `src/exportArchive.test.js` | Modify | CSV column + `data.json` round-trip. |

**Checkpoints for review:** after Task 2 (logic complete), after Task 6 (UI + wiring complete), after Task 7 (export complete).

---

## Task 1: Ledger pair methods

**Files:**
- Modify: `src/useLedger.js`
- Test: `src/useLedger.test.jsx`

- [ ] **Step 1: Write the failing tests** — append this describe block to `src/useLedger.test.jsx` (after the existing `describe('useLedger', ...)` block, before EOF):

```jsx
describe('transfers', () => {
  const tseed = {
    accounts: [
      { id: 'a1', name: 'Checking', type: 'bank', icon: '🏦', openingBalance: 1000 },
      { id: 'a2', name: 'Savings',  type: 'bank', icon: '🏦', openingBalance: 0 },
    ],
    transactions: [],
  };

  it('addTransfer creates two linked, oppositely-signed legs and returns the transferId', () => {
    const { result } = renderHook(() => useLedger(tseed));
    let tid;
    act(() => { tid = result.current.addTransfer({ fromId: 'a1', toId: 'a2', amount: 500, date: '2026-05-20', description: 'Move' }); });
    const legs = result.current.transactions.filter(t => t.transferId === tid);
    expect(legs).toHaveLength(2);
    const from = legs.find(l => l.accountId === 'a1');
    const to   = legs.find(l => l.accountId === 'a2');
    expect(from.amount).toBe(-500);
    expect(to.amount).toBe(500);
    expect(from.categoryId).toBeNull();
    expect(to.categoryId).toBeNull();
    expect(from.transferId).toBe(tid);
    expect(to.transferId).toBe(tid);
  });

  it('updateTransfer rewrites both legs in place (ids stable) and repoints endpoints', () => {
    const { result } = renderHook(() => useLedger(tseed));
    let tid;
    act(() => { tid = result.current.addTransfer({ fromId: 'a1', toId: 'a2', amount: 500, date: '2026-05-20', description: 'Move' }); });
    const idsBefore = result.current.transactions.filter(t => t.transferId === tid).map(t => t.id).sort();
    act(() => { result.current.updateTransfer(tid, { fromId: 'a2', toId: 'a1', amount: 250, date: '2026-05-21', description: 'Back' }); });
    const legs = result.current.transactions.filter(t => t.transferId === tid);
    expect(legs).toHaveLength(2);
    expect(legs.map(t => t.id).sort()).toEqual(idsBefore); // ids preserved
    const from = legs.find(l => l.amount < 0);
    const to   = legs.find(l => l.amount > 0);
    expect(from.accountId).toBe('a2'); // repointed
    expect(to.accountId).toBe('a1');
    expect(Math.abs(from.amount)).toBe(250);
    expect(from.date).toBe('2026-05-21');
    expect(from.description).toBe('Back');
  });

  it('deleteTransfer removes both legs', () => {
    const { result } = renderHook(() => useLedger(tseed));
    let tid;
    act(() => { tid = result.current.addTransfer({ fromId: 'a1', toId: 'a2', amount: 500, date: '2026-05-20', description: 'Move' }); });
    expect(result.current.transactions).toHaveLength(2);
    act(() => { result.current.deleteTransfer(tid); });
    expect(result.current.transactions).toHaveLength(0);
  });

  it('deleteAccount keeps the counterpart leg on the surviving account', () => {
    const { result } = renderHook(() => useLedger(tseed));
    act(() => { result.current.addTransfer({ fromId: 'a1', toId: 'a2', amount: 500, date: '2026-05-20', description: 'Move' }); });
    act(() => { result.current.deleteAccount('a1'); });
    const surviving = result.current.transactions;
    expect(surviving).toHaveLength(1);
    expect(surviving[0].accountId).toBe('a2');
    expect(surviving[0].amount).toBe(500);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/useLedger.test.jsx`
Expected: FAIL — `result.current.addTransfer is not a function`.

- [ ] **Step 3: Implement the three methods** in `src/useLedger.js`. Insert after `deleteTransaction` (line 65) and before `snapshot`:

```javascript
  const addTransfer = useCallback(({ fromId, toId, amount, date, description = '' }) => {
    const transferId = nanoid(8);
    const mag = Math.abs(Number(amount)) || 0;
    const note = description || '';
    const base = { date, categoryId: null, description: note, payee: null, checkNumber: null, transferId };
    const fromLeg = { id: nanoid(8), accountId: fromId, amount: -mag, ...base };
    const toLeg   = { id: nanoid(8), accountId: toId,   amount:  mag, ...base };
    setTransactions(prev => [...prev, fromLeg, toLeg]);
    return transferId;
  }, []);

  const updateTransfer = useCallback((transferId, { fromId, toId, amount, date, description = '' }) => {
    if (!transferId) return;
    const mag = Math.abs(Number(amount)) || 0;
    const note = description || '';
    setTransactions(prev => {
      const legs = prev.filter(t => t.transferId === transferId);
      if (legs.length === 0) return prev;
      const fromLegId = legs[0].id;             // deterministic: first leg = From
      const toLegId = legs[1] ? legs[1].id : null;
      return prev.map(t => {
        if (t.id === fromLegId) return { ...t, accountId: fromId, amount: -mag, date, categoryId: null, description: note, payee: null, checkNumber: null, transferId };
        if (toLegId && t.id === toLegId) return { ...t, accountId: toId, amount: mag, date, categoryId: null, description: note, payee: null, checkNumber: null, transferId };
        return t;
      });
    });
  }, []);

  const deleteTransfer = useCallback((transferId) => {
    if (!transferId) return;
    setTransactions(prev => prev.filter(t => t.transferId !== transferId));
  }, []);
```

Then add them to the returned object (in the `return { ... }` near line 76), alongside the transaction methods:

```javascript
    addTransaction, updateTransaction, deleteTransaction,
    addTransfer, updateTransfer, deleteTransfer,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/useLedger.test.jsx`
Expected: PASS (all `useLedger` tests, including the 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/useLedger.js src/useLedger.test.jsx
git commit -m "feat(transfers): addTransfer/updateTransfer/deleteTransfer in useLedger

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Model helpers + net-worth neutrality

**Files:**
- Modify: `src/accountsModel.js`
- Test: `src/accountsModel.test.js`

- [ ] **Step 1: Write the failing tests** — append to `src/accountsModel.test.js` (at EOF). Note `householdTotals` is already imported at line 51 of that file; add only the transfer-helper import:

```javascript
import { transferCounterpart, transferInfo, resolveTransfer } from './accountsModel.js';

describe('transfers', () => {
  const txns = [
    { id: 'tf', accountId: 'a1', date: '2026-05-20', amount: -500, categoryId: null, transferId: 'x' },
    { id: 'tt', accountId: 'a2', date: '2026-05-20', amount:  500, categoryId: null, transferId: 'x' },
    { id: 'n1', accountId: 'a1', date: '2026-05-01', amount:  -20, categoryId: 'c',  transferId: null },
  ];
  const accountsById = new Map([
    ['a1', { id: 'a1', name: 'Checking' }],
    ['a2', { id: 'a2', name: 'Savings' }],
  ]);

  it('transferCounterpart finds the partner leg, null for non-transfers', () => {
    expect(transferCounterpart(txns[0], txns).id).toBe('tt');
    expect(transferCounterpart(txns[1], txns).id).toBe('tf');
    expect(transferCounterpart(txns[2], txns)).toBeNull();
  });

  it('transferInfo gives direction + counterpart name; null when unresolved', () => {
    expect(transferInfo(txns[0], txns, accountsById)).toEqual({ counterpartName: 'Savings', direction: 'out' });
    expect(transferInfo(txns[1], txns, accountsById)).toEqual({ counterpartName: 'Checking', direction: 'in' });
    expect(transferInfo(txns[2], txns, accountsById)).toBeNull(); // not a transfer
    const orphan = { id: 'o', accountId: 'a1', amount: -10, transferId: 'gone' };
    expect(transferInfo(orphan, [orphan], accountsById)).toBeNull(); // partner missing
    expect(transferInfo(txns[0], txns, new Map([['a1', { id: 'a1', name: 'Checking' }]]))).toBeNull(); // account not in map
  });

  it('resolveTransfer returns the from/to pair, null for non-transfers', () => {
    const pair = resolveTransfer(txns[1], txns); // start from the + leg
    expect(pair.transferId).toBe('x');
    expect(pair.fromLeg.id).toBe('tf'); // negative leg
    expect(pair.toLeg.id).toBe('tt');   // positive leg
    expect(resolveTransfer(txns[2], txns)).toBeNull();
  });
});

describe('net-worth neutrality of transfers', () => {
  const accounts = [
    { id: 'a1', type: 'bank', openingBalance: 1000 },
    { id: 'a2', type: 'bank', openingBalance: 0 },
  ];
  it('an on-sheet→on-sheet transfer leaves netWorth unchanged', () => {
    const base = householdTotals(accounts, []);
    const withTransfer = householdTotals(accounts, [
      { id: 'tf', accountId: 'a1', amount: -500, transferId: 'x' },
      { id: 'tt', accountId: 'a2', amount:  500, transferId: 'x' },
    ]);
    expect(withTransfer.netWorth).toBeCloseTo(base.netWorth, 2);
    expect(withTransfer.netWorth).toBeCloseTo(1000, 2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/accountsModel.test.js`
Expected: FAIL — `transferCounterpart is not a function` (the neutrality test will already pass since `householdTotals` is unchanged; that's intentional — it documents the property).

- [ ] **Step 3: Implement the helpers** — append to `src/accountsModel.js` (at EOF):

```javascript
// A transfer is a pair of transactions sharing one transferId. transferCounterpart
// returns the OTHER leg (different id), or null when leg isn't a transfer / has no
// resolvable partner (e.g. its partner's account was deleted → orphan).
export function transferCounterpart(leg, transactions) {
  if (!leg || !leg.transferId) return null;
  return (transactions || []).find(t => t && t.transferId === leg.transferId && t.id !== leg.id) || null;
}

// Display info for a transfer leg: the counterpart account's name and the direction
// (out = money left this account → '→'; in = money arrived → '←'). null when the leg
// is not a resolvable transfer or the counterpart account is missing → caller renders
// it as a plain row.
export function transferInfo(leg, transactions, accountsById) {
  const partner = transferCounterpart(leg, transactions);
  if (!partner) return null;
  const acct = accountsById && accountsById.get(partner.accountId);
  if (!acct) return null;
  return {
    counterpartName: acct.name,
    direction: (Number.isFinite(leg.amount) && leg.amount < 0) ? 'out' : 'in',
  };
}

// The resolved pair for the editor / row-click branching: { transferId, fromLeg, toLeg }
// where fromLeg is the negative (source) leg and toLeg the positive (destination) leg.
// null when leg is not a resolvable transfer.
export function resolveTransfer(leg, transactions) {
  const partner = transferCounterpart(leg, transactions);
  if (!partner) return null;
  const fromLeg = (Number.isFinite(leg.amount) && leg.amount < 0) ? leg : partner;
  const toLeg   = fromLeg === leg ? partner : leg;
  return { transferId: leg.transferId, fromLeg, toLeg };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/accountsModel.test.js`
Expected: PASS (all model tests including the new blocks).

- [ ] **Step 5: Commit**

```bash
git add src/accountsModel.js src/accountsModel.test.js
git commit -m "feat(transfers): transferCounterpart/transferInfo/resolveTransfer + neutrality test

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

**>>> CHECKPOINT: stop for review after Task 2 (all transfer logic complete).**

---

## Task 3: TransferEditor dialog

**Files:**
- Create: `src/TransferEditor.jsx`
- Test: `src/TransferEditor.test.jsx`

- [ ] **Step 1: Write the failing test** — create `src/TransferEditor.test.jsx`:

```jsx
// src/TransferEditor.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransferEditor from './TransferEditor.jsx';

const accounts = [
  { id: 'a_chk', name: 'Checking', type: 'bank' },
  { id: 'a_sav', name: 'Savings',  type: 'bank' },
];

function setup(props = {}) {
  const onSave = vi.fn(), onDelete = vi.fn(), onClose = vi.fn();
  render(
    <TransferEditor
      accounts={accounts}
      fromAccountId={props.fromAccountId ?? 'a_chk'}
      transfer={props.transfer ?? null}
      onSave={onSave} onDelete={onDelete} onClose={onClose}
    />
  );
  return { onSave, onDelete, onClose };
}

describe('TransferEditor', () => {
  afterEach(() => cleanup());

  it('new transfer: Save is disabled until From/To/amount are valid', async () => {
    setup();
    const saveBtn = screen.getByRole('button', { name: /save transfer/i });
    expect(saveBtn.disabled).toBe(true); // no To selected yet
    await userEvent.selectOptions(screen.getByLabelText(/to account/i), 'a_sav');
    await userEvent.type(screen.getByLabelText(/amount/i), '500');
    expect(saveBtn.disabled).toBe(false);
  });

  it('Save stays disabled when From and To are the same account', async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText(/to account/i), 'a_chk'); // same as From
    await userEvent.type(screen.getByLabelText(/amount/i), '500');
    expect(screen.getByRole('button', { name: /save transfer/i }).disabled).toBe(true);
  });

  it('new transfer: saving emits fromId/toId/amount/date/description (no transferId)', async () => {
    const { onSave } = setup();
    await userEvent.selectOptions(screen.getByLabelText(/to account/i), 'a_sav');
    await userEvent.type(screen.getByLabelText(/amount/i), '500');
    await userEvent.type(screen.getByLabelText(/notes/i), 'Rent buffer');
    await userEvent.click(screen.getByRole('button', { name: /save transfer/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload).toMatchObject({ fromId: 'a_chk', toId: 'a_sav', amount: 500, description: 'Rent buffer' });
    expect(payload.transferId).toBeUndefined();
  });

  it('edit mode seeds From/To/amount and Delete fires with the transferId', async () => {
    const transfer = {
      transferId: 'x',
      fromLeg: { id: 'tf', accountId: 'a_chk', amount: -500, date: '2026-05-20', description: 'Move' },
      toLeg:   { id: 'tt', accountId: 'a_sav', amount:  500, date: '2026-05-20', description: 'Move' },
    };
    const { onSave, onDelete } = setup({ transfer });
    expect(screen.getByLabelText(/from account/i).value).toBe('a_chk');
    expect(screen.getByLabelText(/to account/i).value).toBe('a_sav');
    expect(screen.getByLabelText(/amount/i).value).toBe('500');
    await userEvent.click(screen.getByRole('button', { name: /save transfer/i }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ transferId: 'x', fromId: 'a_chk', toId: 'a_sav', amount: 500 });
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith('x');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/TransferEditor.test.jsx`
Expected: FAIL — cannot resolve `./TransferEditor.jsx`.

- [ ] **Step 3: Implement** — create `src/TransferEditor.jsx`:

```jsx
// src/TransferEditor.jsx
import React, { useState } from 'react';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function TransferEditor({ accounts = [], fromAccountId = null, transfer = null, onSave, onDelete, onClose }) {
  const isEdit = !!transfer;
  const [fromId, setFromId] = useState(transfer ? transfer.fromLeg.accountId : (fromAccountId || (accounts[0] && accounts[0].id) || ''));
  const [toId, setToId]     = useState(transfer ? transfer.toLeg.accountId : '');
  const [date, setDate]     = useState(transfer ? (transfer.fromLeg.date || todayISO()) : todayISO());
  const [magnitude, setMagnitude]     = useState(transfer ? Math.abs(transfer.fromLeg.amount) : '');
  const [description, setDescription] = useState(transfer ? (transfer.fromLeg.description || '') : '');

  const mag = Math.abs(parseFloat(magnitude) || 0);
  const sameAccount = !!fromId && !!toId && fromId === toId;
  const valid = !!fromId && !!toId && !sameAccount && mag > 0;

  const save = () => {
    if (!valid) return;
    onSave({
      ...(transfer ? { transferId: transfer.transferId } : {}),
      fromId, toId, amount: mag, date, description: description.trim(),
    });
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">{isEdit ? 'Edit transfer' : 'New transfer'}</h2>

        <label className="field"><span>From</span>
          <select aria-label="From account" value={fromId} onChange={(e) => setFromId(e.target.value)} className="select">
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <label className="field"><span>To</span>
          <select aria-label="To account" value={toId} onChange={(e) => setToId(e.target.value)} className="select">
            <option value="">Select account…</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <label className="field"><span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </label>

        <label className="field"><span>Amount</span>
          <input type="number" step="0.01" aria-label="Amount" value={magnitude} onChange={(e) => setMagnitude(e.target.value)} className="input" />
        </label>

        <label className="field"><span>Notes</span>
          <input type="text" aria-label="Notes" value={description} onChange={(e) => setDescription(e.target.value)} className="input" />
        </label>

        {sameAccount && <p className="field-error">From and To must be different accounts.</p>}

        <div className="dialog-actions">
          {isEdit && <button type="button" className="btn btn-danger" onClick={() => onDelete(transfer.transferId)}>Delete</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!valid}>Save transfer</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/TransferEditor.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/TransferEditor.jsx src/TransferEditor.test.jsx
git commit -m "feat(transfers): TransferEditor dialog with From/To validation

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Transfer chip in TransactionRow

**Files:**
- Modify: `src/TransactionRow.jsx`
- Test: `src/TransactionRow.test.jsx`

- [ ] **Step 1: Write the failing tests** — append inside the existing `describe('TransactionRow', ...)` block in `src/TransactionRow.test.jsx` (before its closing `});`):

```jsx
  it('renders an outgoing transfer chip (→ counterpart) in the category cell', () => {
    const row = { ...baseRow, categoryId: null };
    render(<table><tbody><TransactionRow layout="compact" row={row} categoriesById={catsById} transfer={{ counterpartName: 'Savings', direction: 'out' }} onEdit={() => {}} /></tbody></table>);
    expect(screen.getByText('Savings')).toBeTruthy();
    expect(screen.getByText(/→/)).toBeTruthy();
    expect(screen.queryByText('Utilities')).toBeNull(); // category cell replaced by chip
  });

  it('renders an incoming transfer chip (← counterpart)', () => {
    const row = { ...baseRow, categoryId: null };
    render(<table><tbody><TransactionRow layout="compact" row={row} categoriesById={catsById} transfer={{ counterpartName: 'Checking', direction: 'in' }} onEdit={() => {}} /></tbody></table>);
    expect(screen.getByText('Checking')).toBeTruthy();
    expect(screen.getByText(/←/)).toBeTruthy();
  });

  it('without a transfer prop the row is unchanged (shows the category)', () => {
    render(<table><tbody><TransactionRow layout="compact" row={baseRow} categoriesById={catsById} onEdit={() => {}} /></tbody></table>);
    expect(screen.getByText('Utilities')).toBeTruthy();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/TransactionRow.test.jsx`
Expected: FAIL — the chip tests find no `Savings`/`→` (category cell still shows `Utilities`).

- [ ] **Step 3: Implement** — edit `src/TransactionRow.jsx`:

(a) Add a `TransferChip` component after the existing `CategoryCell` function (after line 11):

```jsx
function TransferChip({ info }) {
  return (
    <span className="txn-cat txn-transfer">
      <span className="txn-transfer-glyph" aria-hidden="true">⇄ {info.direction === 'out' ? '→' : '←'}</span> {info.counterpartName}
    </span>
  );
}
```

(b) Change the signature (line 13) to accept the prop:

```jsx
export default function TransactionRow({ layout, row, categoriesById, transfer = null, onEdit }) {
```

(c) In the **bank** layout branch, replace the category `<td>` (line 23):

```jsx
        <td>{transfer ? <TransferChip info={transfer} /> : <CategoryCell categoriesById={categoriesById} categoryId={row.categoryId} />}</td>
```

(d) In the **compact** layout branch, replace the category `<td>` (line 36):

```jsx
      <td>{transfer ? <TransferChip info={transfer} /> : <CategoryCell categoriesById={categoriesById} categoryId={row.categoryId} />}</td>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/TransactionRow.test.jsx`
Expected: PASS (existing 3 + new 3).

- [ ] **Step 5: Commit**

```bash
git add src/TransactionRow.jsx src/TransactionRow.test.jsx
git commit -m "feat(transfers): transfer chip in TransactionRow category cell

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Register transfer button + per-row annotation

**Files:**
- Modify: `src/Register.jsx`
- Test: `src/Register.test.jsx`

- [ ] **Step 1: Write the failing tests** — append inside the existing `describe('Register', ...)` block in `src/Register.test.jsx` (before its closing `});`):

```jsx
  it('shows a ⇄ Transfer button that fires onTransfer with the account id', async () => {
    const onTransfer = vi.fn();
    render(<Register account={account} transactions={transactions} accounts={[account]} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} onTransfer={onTransfer} />);
    await userEvent.click(screen.getByRole('button', { name: /^transfer$/i }));
    expect(onTransfer).toHaveBeenCalledWith('a_cc');
  });

  it('renders a transfer leg with a counterpart chip', () => {
    const chk = { id: 'a_chk', name: 'Checking', type: 'bank', icon: '🏦', openingBalance: 1000 };
    const sav = { id: 'a_sav', name: 'Savings',  type: 'bank', icon: '🏦', openingBalance: 0 };
    const txns = [
      { id: 'tf', accountId: 'a_chk', date: '2026-05-20', amount: -500, categoryId: null, payee: null, checkNumber: null, transferId: 'x' },
      { id: 'tt', accountId: 'a_sav', date: '2026-05-20', amount:  500, categoryId: null, payee: null, checkNumber: null, transferId: 'x' },
    ];
    render(<Register account={chk} transactions={txns} accounts={[chk, sav]} categories={[]} categoriesById={new Map()} onEditTransaction={() => {}} onAddTransaction={() => {}} onTransfer={() => {}} />);
    expect(screen.getByText('Savings')).toBeTruthy(); // counterpart name
    expect(screen.getByText(/→/)).toBeTruthy();        // outgoing direction
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/Register.test.jsx`
Expected: FAIL — no `Transfer` button; transfer chip not rendered.

- [ ] **Step 3: Implement** — edit `src/Register.jsx`:

(a) Update the import on line 3 to add `transferInfo`:

```jsx
import { computeRegister, filterTransactions, sortRows, layoutFor, accountClass, accountBalance, transferInfo } from './accountsModel.js';
```

(b) Update the signature (line 30) to accept the new props:

```jsx
export default function Register({ account, transactions, accounts = [], categories, categoriesById, typesById, onEditTransaction, onAddTransaction, onTransfer = () => {} }) {
```

(c) Add an `accountsById` memo right after the `rows` memo (after line 45):

```jsx
  const accountsById = useMemo(() => new Map((accounts || []).map(a => [a.id, a])), [accounts]);
```

(d) Add the Transfer button right after the Add-transaction button (after line 60):

```jsx
        <button type="button" className="btn" onClick={() => onTransfer(account.id)} aria-label="Transfer">⇄ Transfer</button>
```

(e) Replace the rows `.map(...)` (lines 92-94) so each row gets its transfer annotation:

```jsx
            rows.map(r => (
              <TransactionRow key={r.id} layout={layout} row={r} categoriesById={categoriesById} transfer={transferInfo(r, transactions, accountsById)} onEdit={onEditTransaction} />
            ))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/Register.test.jsx`
Expected: PASS (existing 6 + new 2). The existing tests pass no `accounts`, so `transferInfo` returns `null` and rows are unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/Register.jsx src/Register.test.jsx
git commit -m "feat(transfers): ⇄ Transfer button + per-row transfer chip in Register

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: App wiring (state, button, branching, undo)

**Files:**
- Modify: `src/App.jsx`

This task is wiring only. The codebase has no full-`App` render harness (App pulls in camera/peer modules), and the decision logic (`resolveTransfer`) is already unit-tested in Task 2. Verification here is: the whole suite stays green, lint is clean, and a manual smoke in the dev server (the user will also test). No new test file.

- [ ] **Step 1: Add imports** — `App.jsx` does not currently import from `accountsModel.js`. Add both lines immediately after the `TransactionEditor` import (line 14):

```jsx
import TransferEditor from './TransferEditor.jsx';
import { resolveTransfer } from './accountsModel.js';
```

- [ ] **Step 2: Add state** — after the `editingTxn` state (line 118):

```jsx
  const [editingTransfer, setEditingTransfer] = useState(null); // { mode:'new'|'edit', fromAccountId?, transfer? }
```

- [ ] **Step 3: Add handlers** — after `deleteTransaction` (line 197):

```jsx
  // Transfer CRUD — one pushHistory() per op so a single undo reverts the whole pair.
  const saveTransfer = (data) => {
    pushHistory();
    if (data.transferId) ledger.updateTransfer(data.transferId, data);
    else ledger.addTransfer(data);
    setEditingTransfer(null);
  };
  const deleteTransfer = (transferId) => { pushHistory(); ledger.deleteTransfer(transferId); setEditingTransfer(null); };
```

- [ ] **Step 4: Branch the row-click + add the button** — change the `Register` props (lines 382-390) to pass `accounts`, `onTransfer`, and a branching `onEditTransaction`:

```jsx
                <Register
                  account={selectedAccount}
                  transactions={ledger.transactions}
                  accounts={ledger.accounts}
                  categories={cats.categories}
                  categoriesById={categoriesById}
                  typesById={accountTypes.typesById}
                  onEditTransaction={(t) => {
                    const pair = resolveTransfer(t, ledger.transactions);
                    if (pair) setEditingTransfer({ mode: 'edit', transfer: pair });
                    else setEditingTxn({ mode: 'edit', accountId: selectedAccount.id, transaction: t });
                  }}
                  onAddTransaction={(accountId) => setEditingTxn({ mode: 'new', accountId })}
                  onTransfer={(accountId) => setEditingTransfer({ mode: 'new', fromAccountId: accountId })}
                />
```

- [ ] **Step 5: Render the dialog** — after the `editingTxn && selectedAccount && (...)` block (after line 326):

```jsx
      {editingTransfer && (
        <TransferEditor
          accounts={ledger.accounts}
          fromAccountId={editingTransfer.fromAccountId || null}
          transfer={editingTransfer.transfer || null}
          onSave={saveTransfer} onDelete={deleteTransfer} onClose={() => setEditingTransfer(null)}
        />
      )}
```

- [ ] **Step 6: Verify the whole suite is still green and lint is clean**

Run: `npx vitest run`
Expected: PASS — all files, 351 prior tests + the new ones (≈ 351 + 17).

Run: `npx eslint src/App.jsx src/Register.jsx src/TransactionRow.jsx src/TransferEditor.jsx src/useLedger.js src/accountsModel.js`
Expected: zero **new** errors from these files (pre-existing master lint errors in untouched files don't count).

- [ ] **Step 7: Manual smoke (optional but recommended)**

Stop any dev server from the main checkout (strictPort 5173), then from this worktree: `npm run dev`. Create two accounts, click `⇄ Transfer`, move money, confirm both registers update and net worth is unchanged for two on-sheet accounts; click a transfer leg to confirm it reopens the TransferEditor; Undo reverts the whole pair.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat(transfers): wire TransferEditor, ⇄ button, and row-click branching into App

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

**>>> CHECKPOINT: stop for review after Task 6 (UI + wiring complete; user can test in-app).**

---

## Task 7: Export — CSV transfer column + JSON round-trip

**Files:**
- Modify: `src/exportArchive.js`
- Test: `src/exportArchive.test.js`

- [ ] **Step 1: Write the failing tests** — append inside the existing `describe('export v4', ...)` block in `src/exportArchive.test.js` (before its closing `});`):

```javascript
  it('CSV adds a transfer column; transfer legs have blank category/flow and the counterpart name', () => {
    const accts = [
      { id: 'a_chk', name: 'Checking', type: 'bank', openingBalance: 0 },
      { id: 'a_sav', name: 'Savings',  type: 'bank', openingBalance: 0 },
    ];
    const txns = [
      { id: 'tf', accountId: 'a_chk', date: '2026-05-20', amount: -500, categoryId: null, payee: null, checkNumber: null, transferId: 'x' },
      { id: 'tt', accountId: 'a_sav', date: '2026-05-20', amount:  500, categoryId: null, payee: null, checkNumber: null, transferId: 'x' },
    ];
    const csv = buildTransactionsCsv(accts, txns, new Map());
    const lines = csv.replace(/^﻿/, '').split('\n');
    expect(lines[0]).toBe('date,account,description,amount,category,flow,payee,check,transfer');
    expect(lines.find(l => l.startsWith('2026-05-20,Checking'))).toBe('2026-05-20,Checking,,-500.00,,,,,Savings');
    expect(lines.find(l => l.startsWith('2026-05-20,Savings'))).toBe('2026-05-20,Savings,,500.00,,,,,Checking');
  });

  it('data.json preserves transferId on both legs', () => {
    const accts = [
      { id: 'a_chk', name: 'Checking', type: 'bank', openingBalance: 0 },
      { id: 'a_sav', name: 'Savings',  type: 'bank', openingBalance: 0 },
    ];
    const txns = [
      { id: 'tf', accountId: 'a_chk', date: '2026-05-20', amount: -500, categoryId: null, payee: null, checkNumber: null, transferId: 'x' },
      { id: 'tt', accountId: 'a_sav', date: '2026-05-20', amount:  500, categoryId: null, payee: null, checkNumber: null, transferId: 'x' },
    ];
    const bytes = buildArchive({ accounts: accts, transactions: txns, categories: [], schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-20T00:00:00Z') });
    const data = JSON.parse(strFromU8(unzipSync(bytes)['data.json']));
    expect(data.transactions.every(t => t.transferId === 'x')).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/exportArchive.test.js`
Expected: FAIL — CSV header lacks `,transfer`; transfer legs currently emit `Uncategorized,expense`.

- [ ] **Step 3: Implement** — edit `src/exportArchive.js`:

(a) Add the model import at the top (after the `fflate` import, line 2):

```javascript
import { transferCounterpart } from './accountsModel.js';
```

(b) Change `CSV_HEADER` (line 4):

```javascript
const CSV_HEADER = 'date,account,description,amount,category,flow,payee,check,transfer';
```

(c) Replace the `.map(t => { ... })` body inside `buildTransactionsCsv` (lines 18-31) with:

```javascript
    .map(t => {
      const acct = acctById.get(t.accountId);
      const partner = transferCounterpart(t, transactions);
      const partnerAcct = partner && acctById.get(partner.accountId);
      const isTransfer = !!partnerAcct;
      const cat = categoriesById && categoriesById.get(t.categoryId);
      return {
        date: t.date || '',
        account: acct ? acct.name : '',
        description: t.description || '',
        amount: t.amount.toFixed(2),
        category: isTransfer ? '' : (cat ? cat.name : 'Uncategorized'),
        flow: isTransfer ? '' : ((cat && cat.flow) || 'expense'),
        payee: t.payee || '',
        check: t.checkNumber || '',
        transfer: isTransfer ? partnerAcct.name : '',
      };
    })
```

(d) Add the `transfer` column to the `lines.push([...])` row (lines 36-39). The pushed array becomes:

```javascript
    lines.push([
      escapeCsv(r.date), escapeCsv(r.account), escapeCsv(r.description),
      r.amount, escapeCsv(r.category), r.flow, escapeCsv(r.payee), escapeCsv(r.check), escapeCsv(r.transfer),
    ].join(','));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/exportArchive.test.js`
Expected: PASS (existing 3 + new 2). The existing header test (`toContain('date,account,description,amount,category')`) still passes since the new header is a superset.

- [ ] **Step 5: Run the full suite + lint**

Run: `npx vitest run`
Expected: PASS — all files green (26 → 27 files; 351 → ~368 tests).

Run: `npx eslint src/exportArchive.js`
Expected: zero new errors.

- [ ] **Step 6: Commit**

```bash
git add src/exportArchive.js src/exportArchive.test.js
git commit -m "feat(transfers): CSV transfer column + data.json transferId round-trip

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

**>>> CHECKPOINT: stop for final review after Task 7 (feature complete).**

---

## Self-Review

**1. Spec coverage:**
- Data model (linked pair, signs, null category, no schema bump) → Task 1 (creation), Task 2 (helpers).
- Ledger `addTransfer`/`updateTransfer`/`deleteTransfer`, `deleteAccount` unchanged, orphan-leg kept → Task 1.
- `transferCounterpart`/`transferInfo`/`resolveTransfer` + net-worth neutrality → Task 2.
- `TransferEditor` (From/To/Date/Amount/Notes, validation From≠To, edit seeding, delete) → Task 3.
- Register chip display (out →/in ←, counterpart name) → Task 4 (row) + Task 5 (annotation).
- `⇄ Transfer` button → Task 5; row-click branching + single-snapshot undo → Task 6.
- CSV `transfer` column (blank category/flow on legs) + `data.json` round-trip → Task 7.
- Off-sheet endpoints allowed → no code gate added (any-to-any pickers in Task 3); covered.
- Orphan resilient display → `transferInfo` returns null (Task 2), consumed by Register (Task 5) and CSV (Task 7).

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to" — every code step shows complete code. Task 6 deliberately has no unit test (justified inline: no App render harness; logic covered by Task 2).

**3. Type consistency:** Method names match across tasks (`addTransfer`/`updateTransfer`/`deleteTransfer`, `transferCounterpart`/`transferInfo`/`resolveTransfer`). The pair shape `{ transferId, fromLeg, toLeg }` produced by `resolveTransfer` (Task 2) is exactly what `TransferEditor` consumes (Task 3) and what `App` passes (Task 6). The `transferInfo` shape `{ counterpartName, direction }` produced in Task 2 matches the `TransferChip info` prop in Task 4 and the `transfer` prop passed by Register in Task 5. The `onSave` payload `{ transferId?, fromId, toId, amount, date, description }` from Task 3 matches `saveTransfer` → `ledger.addTransfer/updateTransfer` signatures from Tasks 1 and 6.

No gaps found.
