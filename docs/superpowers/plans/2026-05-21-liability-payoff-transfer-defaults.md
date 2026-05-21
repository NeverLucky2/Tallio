# Liability Pay-Off Transfer Defaults — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the transfer dialog is opened from a liability account, pre-fill it to pay the balance (destination = the liability, amount = owed, From = the remembered/likely bank) and remember the chosen bank per-liability for next time.

**Architecture:** Two new **pure** helpers in `accountsModel.js` carry all the logic — `transferDraftForAccount` (initial dialog config when opening) and `payFromUpdate` (the patch to remember the bank on save). `TransferEditor` gains two optional initial-value props (`toAccountId`, `initialAmount`). `App.jsx` wires the helpers into `onTransfer` (open) and `saveTransfer` (remember). The remembered bank is stored as `defaultPayFromId` on the liability account, which rides along with localStorage / Export / phone sync automatically. No schema bump, no migration.

**Tech Stack:** React 19, Vitest + @testing-library/react, ESLint. Tests run one-shot with `npx vitest run <file>`.

**Reference spec:** `docs/superpowers/specs/2026-05-21-liability-payoff-transfer-defaults-design.md`

---

### Task 1: `transferDraftForAccount` pure helper

Computes the initial editor configuration for a **new** transfer launched from a given account. Liability → destination + owed amount + remembered/likely bank; anything else → today's behavior.

**Files:**
- Modify: `src/accountsModel.js` (add an exported function; `accountClass` and `accountBalance` already live in this file)
- Test: `src/accountsModel.test.js` (add a `describe` block + extend the import)

- [ ] **Step 1: Write the failing tests**

Add to the top import in `src/accountsModel.test.js` so it reads:

```js
import {
  ACCOUNT_TYPES, GROUP_ORDER, accountClass, layoutFor, groupFor,
  isOnBalanceSheet, flowSign, transferDraftForAccount, payFromUpdate,
} from './accountsModel.js';
```

Append this block at the end of the file:

```js
describe('transferDraftForAccount', () => {
  const accounts = [
    { id: 'chk', name: 'Checking',  type: 'bank',        openingBalance: 1000 },
    { id: 'inv', name: 'Brokerage', type: 'investment',  openingBalance: 5000 },
    { id: 'cc',  name: 'Visa',      type: 'credit_card', openingBalance: -300 },
  ];

  it('liability with a balance owed: To = self, amount = owed, From = first asset account', () => {
    const cc = accounts.find(a => a.id === 'cc');
    expect(transferDraftForAccount(cc, [], accounts)).toEqual({
      fromAccountId: 'chk', toAccountId: 'cc', initialAmount: 300,
    });
  });

  it('uses defaultPayFromId for From when it still resolves', () => {
    const cc = { ...accounts.find(a => a.id === 'cc'), defaultPayFromId: 'inv' };
    const draft = transferDraftForAccount(cc, [], [accounts[0], accounts[1], cc]);
    expect(draft.fromAccountId).toBe('inv');
    expect(draft.toAccountId).toBe('cc');
  });

  it('falls back to first asset account when defaultPayFromId points to a deleted account', () => {
    const cc = { ...accounts.find(a => a.id === 'cc'), defaultPayFromId: 'gone' };
    const draft = transferDraftForAccount(cc, [], [accounts[0], accounts[1], cc]);
    expect(draft.fromAccountId).toBe('chk');
  });

  it('liability with nothing owed: amount is null but To is still the liability', () => {
    const cc = { id: 'cc0', name: 'Paid Card', type: 'credit_card', openingBalance: 0 };
    const draft = transferDraftForAccount(cc, [], [accounts[0], cc]);
    expect(draft).toEqual({ fromAccountId: 'chk', toAccountId: 'cc0', initialAmount: null });
  });

  it('owed amount reflects transactions, not just opening balance', () => {
    const cc = { id: 'cc', name: 'Visa', type: 'credit_card', openingBalance: -300 };
    const txns = [{ id: 't', accountId: 'cc', amount: -50, date: '2026-05-10' }]; // now owes 350
    expect(transferDraftForAccount(cc, txns, [accounts[0], cc]).initialAmount).toBe(350);
  });

  it('treats a custom liability type (via typesById) as a liability', () => {
    const typesById = new Map([
      ['store_card', { id: 'store_card', klass: 'liability' }],
      ['bank',       { id: 'bank',       klass: 'asset' }],
    ]);
    const sc = { id: 'sc', name: 'Store Card', type: 'store_card', openingBalance: -50 };
    const list = [{ id: 'chk', type: 'bank', openingBalance: 0 }, sc];
    expect(transferDraftForAccount(sc, [], list, typesById)).toEqual({
      fromAccountId: 'chk', toAccountId: 'sc', initialAmount: 50,
    });
  });

  it('non-liability account keeps todays behavior: From = self, To/amount empty', () => {
    const chk = accounts.find(a => a.id === 'chk');
    expect(transferDraftForAccount(chk, [], accounts)).toEqual({
      fromAccountId: 'chk', toAccountId: undefined, initialAmount: null,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/accountsModel.test.js`
Expected: FAIL — `transferDraftForAccount is not a function` (and `payFromUpdate` import is undefined; that helper arrives in Task 2 but the import line referencing it is harmless until then — these tests fail on `transferDraftForAccount`).

- [ ] **Step 3: Implement the helper**

Add to `src/accountsModel.js` (place it just after `resolveTransfer`, before `groupAccounts`):

```js
// Initial config for a NEW transfer launched from `account`. For a liability the
// clicked account becomes the destination (paying it down is bank→liability):
//   To = the liability, Amount = the owed balance (null when nothing is owed),
//   From = the bank last used to pay it (defaultPayFromId) if it still exists,
//          else the first asset account, else the first other account.
// For any other account it stays today's behavior: From = the account, To/amount empty.
export function transferDraftForAccount(account, transactions, accounts, typesById) {
  if (!account) return { fromAccountId: undefined, toAccountId: undefined, initialAmount: null };
  const list = accounts || [];
  if (accountClass(account.type, typesById) !== 'liability') {
    return { fromAccountId: account.id, toAccountId: undefined, initialAmount: null };
  }
  const owed = Math.abs(Math.min(0, accountBalance(account, transactions)));
  const resolves = (id) => !!id && id !== account.id && list.some(a => a.id === id);
  const remembered = resolves(account.defaultPayFromId) ? account.defaultPayFromId : undefined;
  const firstAsset = list.find(a => a.id !== account.id && accountClass(a.type, typesById) === 'asset');
  const firstOther = list.find(a => a.id !== account.id);
  return {
    fromAccountId: remembered || (firstAsset && firstAsset.id) || (firstOther && firstOther.id) || undefined,
    toAccountId: account.id,
    initialAmount: owed > 0 ? owed : null,
  };
}
```

- [ ] **Step 4: Run the tests to verify the `transferDraftForAccount` ones pass**

Run: `npx vitest run src/accountsModel.test.js -t transferDraftForAccount`
Expected: PASS (all 7 `transferDraftForAccount` tests).

- [ ] **Step 5: Commit**

```bash
git add src/accountsModel.js src/accountsModel.test.js
git commit -m "feat(transfers): transferDraftForAccount helper for liability pay-off defaults"
```

---

### Task 2: `payFromUpdate` pure helper

The patch that remembers the pay-from bank on a liability after a transfer is saved.

**Files:**
- Modify: `src/accountsModel.js`
- Test: `src/accountsModel.test.js` (import already extended in Task 1)

- [ ] **Step 1: Write the failing tests**

Append this block to `src/accountsModel.test.js`:

```js
describe('payFromUpdate', () => {
  const accounts = [
    { id: 'chk', type: 'bank' },
    { id: 'cc',  type: 'credit_card' },
  ];

  it('returns a defaultPayFromId patch when the To account is a liability', () => {
    expect(payFromUpdate('cc', 'chk', accounts)).toEqual({ defaultPayFromId: 'chk' });
  });

  it('returns null when the To account is not a liability', () => {
    expect(payFromUpdate('chk', 'cc', accounts)).toBeNull();
  });

  it('returns null when the To account is not found', () => {
    expect(payFromUpdate('nope', 'chk', accounts)).toBeNull();
  });

  it('honors a custom liability type via typesById', () => {
    const typesById = new Map([['store_card', { id: 'store_card', klass: 'liability' }]]);
    const list = [{ id: 'sc', type: 'store_card' }, { id: 'chk', type: 'bank' }];
    expect(payFromUpdate('sc', 'chk', list, typesById)).toEqual({ defaultPayFromId: 'chk' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/accountsModel.test.js -t payFromUpdate`
Expected: FAIL — `payFromUpdate is not a function`.

- [ ] **Step 3: Implement the helper**

Add to `src/accountsModel.js`, directly after `transferDraftForAccount`:

```js
// Patch to remember the pay-from bank on a liability after a transfer is saved.
// Returns { defaultPayFromId } when `toAccountId` is a liability account, else null.
export function payFromUpdate(toAccountId, fromId, accounts, typesById) {
  const to = (accounts || []).find(a => a.id === toAccountId);
  if (!to || accountClass(to.type, typesById) !== 'liability') return null;
  return { defaultPayFromId: fromId };
}
```

- [ ] **Step 4: Run the whole model test file to verify it passes**

Run: `npx vitest run src/accountsModel.test.js`
Expected: PASS (all existing tests plus the two new blocks).

- [ ] **Step 5: Commit**

```bash
git add src/accountsModel.js src/accountsModel.test.js
git commit -m "feat(transfers): payFromUpdate helper to remember pay-from bank"
```

---

### Task 3: `TransferEditor` initial-value props

Add `toAccountId` and `initialAmount` props, used only as initial state and only for a *new* transfer (edit mode is unaffected because the `transfer` prop takes precedence).

**Files:**
- Modify: `src/TransferEditor.jsx:7` (signature), `:11` (toId initial state), `:13` (magnitude initial state)
- Test: `src/TransferEditor.test.jsx`

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('TransferEditor', …)` block in `src/TransferEditor.test.jsx`:

```js
  it('new transfer: toAccountId preselects the To picker and initialAmount fills Amount', () => {
    render(<TransferEditor accounts={accounts} fromAccountId="a_chk" toAccountId="a_sav" initialAmount={300}
      onSave={() => {}} onDelete={() => {}} onClose={() => {}} />);
    expect(screen.getByLabelText(/to account/i).value).toBe('a_sav');
    expect(screen.getByLabelText(/amount/i).value).toBe('300');
  });

  it('new transfer: initialAmount null leaves Amount blank', () => {
    render(<TransferEditor accounts={accounts} fromAccountId="a_chk" toAccountId="a_sav" initialAmount={null}
      onSave={() => {}} onDelete={() => {}} onClose={() => {}} />);
    expect(screen.getByLabelText(/amount/i).value).toBe('');
  });

  it('edit mode ignores toAccountId/initialAmount and seeds from the legs', () => {
    const transfer = {
      transferId: 'x',
      fromLeg: { id: 'tf', accountId: 'a_chk', amount: -500, date: '2026-05-20', description: 'Move' },
      toLeg:   { id: 'tt', accountId: 'a_sav', amount:  500, date: '2026-05-20', description: 'Move' },
    };
    render(<TransferEditor accounts={accounts} transfer={transfer} toAccountId="a_chk" initialAmount={999}
      onSave={() => {}} onDelete={() => {}} onClose={() => {}} />);
    expect(screen.getByLabelText(/to account/i).value).toBe('a_sav'); // from the leg, not toAccountId
    expect(screen.getByLabelText(/amount/i).value).toBe('500');       // from the leg, not initialAmount
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/TransferEditor.test.jsx`
Expected: FAIL — the new tests fail (To value is `''` and Amount is `''` because the props aren't read yet).

- [ ] **Step 3: Add the props to the signature**

In `src/TransferEditor.jsx`, change line 7 from:

```jsx
export default function TransferEditor({ accounts = [], fromAccountId = null, transfer = null, types = DEFAULT_ACCOUNT_TYPES, typesById = DEFAULT_ACCOUNT_TYPES_BY_ID, onSave, onDelete, onClose }) {
```

to:

```jsx
export default function TransferEditor({ accounts = [], fromAccountId = null, toAccountId = null, initialAmount = null, transfer = null, types = DEFAULT_ACCOUNT_TYPES, typesById = DEFAULT_ACCOUNT_TYPES_BY_ID, onSave, onDelete, onClose }) {
```

- [ ] **Step 4: Use the props in the initial state**

In `src/TransferEditor.jsx`, change line 11 from:

```jsx
  const [toId, setToId]     = useState(transfer ? transfer.toLeg.accountId : '');
```

to:

```jsx
  const [toId, setToId]     = useState(transfer ? transfer.toLeg.accountId : (toAccountId || ''));
```

And change line 13 from:

```jsx
  const [magnitude, setMagnitude]     = useState(transfer ? Math.abs(transfer.fromLeg.amount) : '');
```

to:

```jsx
  const [magnitude, setMagnitude]     = useState(transfer ? Math.abs(transfer.fromLeg.amount) : (initialAmount != null ? String(initialAmount) : ''));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/TransferEditor.test.jsx`
Expected: PASS (the three new tests plus all existing TransferEditor tests).

- [ ] **Step 6: Commit**

```bash
git add src/TransferEditor.jsx src/TransferEditor.test.jsx
git commit -m "feat(transfers): TransferEditor toAccountId/initialAmount initial-value props"
```

---

### Task 4: Wire the helpers into `App.jsx`

Open the dialog via `transferDraftForAccount`, pass the new props through, and remember the bank on save via `payFromUpdate`. This task composes the already-tested helpers; there is no App-level test harness in this repo (`__smoke__/setup.test.jsx` is the only App-render test), so verification is the full suite + lint passing plus a manual check.

**Files:**
- Modify: `src/App.jsx:17` (import), `:212-217` (`saveTransfer`), add `openTransfer` after `:218`, `:365-373` (`<TransferEditor>` props), `:449` (`onTransfer`)

- [ ] **Step 1: Extend the accountsModel import**

In `src/App.jsx`, change line 17 from:

```jsx
import { resolveTransfer } from './accountsModel.js';
```

to:

```jsx
import { resolveTransfer, payFromUpdate, transferDraftForAccount } from './accountsModel.js';
```

- [ ] **Step 2: Remember the bank in `saveTransfer`**

In `src/App.jsx`, change the `saveTransfer` handler (lines 212-217) from:

```jsx
  const saveTransfer = (data) => {
    pushHistory();
    if (data.transferId) ledger.updateTransfer(data.transferId, data);
    else ledger.addTransfer(data);
    setEditingTransfer(null);
  };
```

to:

```jsx
  const saveTransfer = (data) => {
    pushHistory();
    if (data.transferId) ledger.updateTransfer(data.transferId, data);
    else ledger.addTransfer(data);
    const patch = payFromUpdate(data.toId, data.fromId, ledger.accounts, accountTypes.typesById);
    if (patch) ledger.updateAccount(data.toId, patch);
    setEditingTransfer(null);
  };
```

- [ ] **Step 3: Add the `openTransfer` handler**

In `src/App.jsx`, immediately after the `deleteTransfer` handler (line 218), add:

```jsx
  const openTransfer = (accountId) => {
    const account = ledger.accounts.find(a => a.id === accountId);
    const draft = transferDraftForAccount(account, ledger.transactions, ledger.accounts, accountTypes.typesById);
    setEditingTransfer({ mode: 'new', ...draft });
  };
```

- [ ] **Step 4: Pass the new props to `<TransferEditor>`**

In `src/App.jsx`, in the `<TransferEditor>` element (around lines 366-373), add the two props right after the existing `fromAccountId` line so the block reads:

```jsx
        <TransferEditor
          accounts={ledger.accounts}
          types={accountTypes.types}
          typesById={accountTypes.typesById}
          fromAccountId={editingTransfer.fromAccountId || null}
          toAccountId={editingTransfer.toAccountId || null}
          initialAmount={editingTransfer.initialAmount ?? null}
          transfer={editingTransfer.transfer || null}
          onSave={saveTransfer} onDelete={deleteTransfer} onClose={() => setEditingTransfer(null)}
        />
```

- [ ] **Step 5: Point the Register's transfer button at `openTransfer`**

In `src/App.jsx`, change line 449 from:

```jsx
                  onTransfer={(accountId) => setEditingTransfer({ mode: 'new', fromAccountId: accountId })}
```

to:

```jsx
                  onTransfer={openTransfer}
```

- [ ] **Step 6: Run the full test suite and lint**

Run: `npx vitest run`
Expected: PASS — entire suite green (no regressions; the helper + editor behavior is covered by Tasks 1-3).

Run: `npm run lint`
Expected: no errors (note `transferDraftForAccount` is now used, so no unused-import warning).

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, then in the browser:
1. Open an account that owes money (e.g. a credit card with a negative balance), click **⇄ Transfer** → the dialog opens with **To** = that card and **Amount** = the owed figure shown in the register header; **From** defaults to your first bank/asset account.
2. Pick a specific bank as **From**, save the transfer → confirm the card's owed balance dropped by that amount.
3. Click **⇄ Transfer** on that same card again → **From** is pre-selected to the bank you just used.
4. Click **⇄ Transfer** on a plain bank account → **From** = that bank, **To**/Amount blank (unchanged from before).
5. Press **Undo** once after a payment → both the transfer and the remembered-bank change revert together.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat(transfers): wire liability pay-off defaults + remember pay-from bank in App"
```

---

## Self-review notes

**Spec coverage:**
- "To = liability, amount = owed, From = remembered/asset" → Task 1 (`transferDraftForAccount`) + Task 3 (editor props) + Task 4 (wiring).
- "Remember From on save (any save whose To is a liability)" → Task 2 (`payFromUpdate`) + Task 4 Step 2.
- "Stored on account, rides with Export/sync" → `defaultPayFromId` is a plain account field; `useLedger.updateAccount` merges it and persists the whole accounts array (no extra code needed).
- "Edit mode unaffected" → Task 3 Step 1 test asserts it; `transfer` prop precedence in initial state.
- "Nothing owed → blank amount" → Task 1 test "liability with nothing owed".
- "Remembered bank deleted → fallback" → Task 1 test "falls back to first asset account".
- "All liability types incl. custom" → Task 1 + Task 2 custom-type tests via `typesById`.
- "Single undo reverts both" → `pushHistory()` precedes both ledger mutations in `saveTransfer`; Task 4 Step 7 manual check #5.

**Type/name consistency:** `transferDraftForAccount(account, transactions, accounts, typesById)` and `payFromUpdate(toAccountId, fromId, accounts, typesById)` signatures are used identically in their tests and in `App.jsx`. The draft shape `{ fromAccountId, toAccountId, initialAmount }` matches the `<TransferEditor>` props `fromAccountId` / `toAccountId` / `initialAmount`. The account field is `defaultPayFromId` everywhere.

**No placeholders:** every code/test step shows complete content; every run step has an exact command and expected result.
