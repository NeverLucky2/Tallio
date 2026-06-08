# Splits Set the Transaction Amount — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the split lines define the transaction amount (for both transactions and transfers) instead of being forced to balance to a pre-entered amount; remove the balance gate and forced-"Other"-remainder flow.

**Architecture:** `SplitsEditor` stops blocking Done and shows a calm running **Total** instead of a remaining/remainder bar. `TransactionEditor` already derives `amount = sum(splits)`. `TransferEditor` derives the magnitude from the source-leg splits sum, and `useLedger` derives both transfer leg amounts from that sum so the paired legs always mirror. `validateSplits`/`accountsModel` are untouched (at the save boundary the amount equals the sum).

**Tech Stack:** React (hooks, function components), Vite, Vitest + @testing-library/react + userEvent. Repo test convention: component tests use `afterEach(() => cleanup())` and assert with `.toBeTruthy()` / `getAttribute()` / `.value` / `.disabled` — **no jest-dom** (`toBeInTheDocument` is unavailable).

**Spec:** `docs/superpowers/specs/2026-06-07-splits-set-amount-design.md`

---

## File structure

- `src/useLedger.js` — `addTransfer` / `updateTransfer` derive leg amounts from the source-leg splits sum when splits are present (else keep `-mag`/`+mag`).
- `src/useLedger.test.jsx` — replace the "throws on mismatch" transfer test with derive-from-sum tests.
- `src/SplitsEditor.jsx` — remove the balance gate (`pendingRemainder`, remainder line helpers, "+ Add remainder as line", confirm panel); `tryDone` always proceeds for ≥2 lines; replace the `.split-remaining` bar with a `.split-total` readout.
- `src/SplitsEditor.test.jsx` — delete the obsolete balanced/remaining/remainder/confirm tests; add Total-readout and always-Done tests.
- `src/TransferEditor.jsx` — derive `mag` from the source-leg splits sum; make the Amount field read-only when splits exist.
- `src/TransferEditor.test.jsx` — update the split wire-up test to the Total readout; add a derive-the-amount test.
- `src/App.css` — replace `.split-remaining*` / `.split-confirm*` rules with a calm `.split-total*` style.

`src/TransactionEditor.jsx` needs **no change** (already derives & saves `amount = sum`). `src/__smoke__/splits.test.jsx` exercises a *transaction* with splits (data model unchanged) and should stay green untouched.

---

## Task 1: `useLedger` derives transfer leg amounts from the source-leg splits sum

**Files:**
- Modify: `src/useLedger.js` (`addTransfer` ~`206-225`, `updateTransfer` ~`227-261`)
- Test: `src/useLedger.test.jsx` (replace the test at ~`425-436`)

- [ ] **Step 1: Replace the obsolete "throws on mismatch" test with derive tests**

In `src/useLedger.test.jsx`, inside `describe('addTransfer / updateTransfer with source-leg splits', ...)`, **delete** this test entirely:

```js
  it('addTransfer throws when splits sum mismatches -magnitude', () => {
    const { result } = renderHook(() => useLedger(tseed));
    expect(() => act(() => {
      result.current.addTransfer({
        fromId: 'a_chase', toId: 'a_loan', amount: 325.40, date: '2026-06-28',
        splits: [
          { id: 's1', amount: -200.00, categoryId: 'c_principal', description: 'Principal' },
          { id: 's2', amount: -100.00, categoryId: 'c_interest',  description: 'Interest' },
        ],
      });
    })).toThrow(/does not match/i);
  });
```

and replace it with these two tests:

```js
  it('addTransfer derives both leg amounts from the source-leg splits sum (ignores the typed amount)', () => {
    const { result } = renderHook(() => useLedger(tseed));
    let tid;
    act(() => {
      tid = result.current.addTransfer({
        fromId: 'a_chase', toId: 'a_loan', amount: 325.40, date: '2026-06-28',
        splits: [
          { id: 's1', amount: -200.00, categoryId: 'c_principal', description: 'Principal' },
          { id: 's2', amount: -100.00, categoryId: 'c_interest',  description: 'Interest' },
        ],
      });
    });
    const legs = result.current.transactions.filter(t => t.transferId === tid);
    const from = legs.find(l => l.accountId === 'a_chase');
    const to   = legs.find(l => l.accountId === 'a_loan');
    expect(from.amount).toBeCloseTo(-300, 5);
    expect(to.amount).toBeCloseTo(300, 5);
  });

  it('updateTransfer derives both leg amounts from the new splits sum', () => {
    const { result } = renderHook(() => useLedger(tseed));
    let tid;
    act(() => {
      tid = result.current.addTransfer({ fromId: 'a_chase', toId: 'a_loan', amount: 100, date: '2026-06-28' });
    });
    act(() => {
      result.current.updateTransfer(tid, {
        fromId: 'a_chase', toId: 'a_loan', amount: 100, date: '2026-06-28',
        splits: [
          { id: 's1', amount: -250.00, categoryId: 'c_principal', description: 'Principal' },
          { id: 's2', amount:  -75.40, categoryId: 'c_interest',  description: 'Interest' },
        ],
      });
    });
    const legs = result.current.transactions.filter(t => t.transferId === tid);
    const from = legs.find(l => l.accountId === 'a_chase');
    const to   = legs.find(l => l.accountId === 'a_loan');
    expect(from.amount).toBeCloseTo(-325.40, 5);
    expect(to.amount).toBeCloseTo(325.40, 5);
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/useLedger.test.jsx`
Expected: the two new tests FAIL — `addTransfer` still produces `from.amount === -325.40` (from `-mag`) not `-300`, so `expect(from.amount).toBeCloseTo(-300, 5)` fails.

- [ ] **Step 3: Implement derive-from-sum in `addTransfer`**

In `src/useLedger.js`, in `addTransfer`, replace the `fromLeg`/`toLeg` construction (currently `amount: -mag` / `amount: mag`) so it derives from the splits sum when present. The relevant block becomes:

```js
    const sourceSplits = Array.isArray(splits) && splits.length > 0
      ? splits.map(s => ({
          id: s.id || nanoid(8),
          amount: Number.isFinite(s.amount) ? s.amount : 0,
          description: s.description || '',
          ...(s.categoryId ? { categoryId: s.categoryId } : {}),
          ...(s.transferId ? { transferId: s.transferId } : {}),
        }))
      : null;
    const sumCents = sourceSplits
      ? sourceSplits.reduce((acc, l) => acc + Math.round((Number.isFinite(l.amount) ? l.amount : 0) * 100), 0)
      : 0;
    const fromAmount = sourceSplits ? sumCents / 100 : -mag;
    const toAmount   = sourceSplits ? -sumCents / 100 : mag;
    const fromLeg = { id: nanoid(8), accountId: fromId, amount: fromAmount, ...base, ...(sourceSplits ? { splits: sourceSplits } : {}) };
    const toLeg   = { id: nanoid(8), accountId: toId,   amount: toAmount, ...base };
    validateSplits(fromLeg);
```

- [ ] **Step 4: Implement derive-from-sum in `updateTransfer`**

In `src/useLedger.js`, in `updateTransfer`, after the `sourceSplits` mapping, compute the derived amounts and use them in both the `validateSplits` call and the leg rewrites. Replace the existing `validateSplits({ amount: -mag, splits: sourceSplits });` line and the two `amount: -mag` / `amount: mag` assignments in the `setTransactions` map:

```js
    const sumCents = sourceSplits
      ? sourceSplits.reduce((acc, l) => acc + Math.round((Number.isFinite(l.amount) ? l.amount : 0) * 100), 0)
      : 0;
    const fromAmount = sourceSplits ? sumCents / 100 : -mag;
    const toAmount   = sourceSplits ? -sumCents / 100 : mag;
    validateSplits({ amount: fromAmount, splits: sourceSplits });

    setTransactions(prev => {
      const legs = prev.filter(t => t.transferId === transferId);
      if (legs.length === 0) return prev;
      const fromLegId = legs[0].id;
      const toLegId = legs[1] ? legs[1].id : null;
      return prev.map(t => {
        if (t.id === fromLegId) {
          const base = { ...t, accountId: fromId, amount: fromAmount, date, categoryId: cid, description: note, payee: null, checkNumber: null, transferId };
          if (sourceSplits) base.splits = sourceSplits;
          else delete base.splits;
          return base;
        }
        if (toLegId && t.id === toLegId) {
          return { ...t, accountId: toId, amount: toAmount, date, categoryId: cid, description: note, payee: null, checkNumber: null, transferId };
        }
        return t;
      });
    });
```

- [ ] **Step 5: Run the full `useLedger` suite**

Run: `npx vitest run src/useLedger.test.jsx`
Expected: PASS, including the pre-existing `'addTransfer stores splits on the source leg only'` (splits sum to `-325.40` and the typed amount is also `325.40`, so `from.amount === -325.40` still holds) and all no-split transfer tests (`-mag`/`+mag` unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/useLedger.js src/useLedger.test.jsx
git commit -m "feat(splits): transfer legs derive amount from source-leg splits sum"
```

---

## Task 2: `SplitsEditor` — remove the balance gate; Done always proceeds; Total readout

**Files:**
- Modify: `src/SplitsEditor.jsx`
- Modify: `src/SplitsEditor.test.jsx`
- Modify: `src/App.css` (~`3485-3493`)

- [ ] **Step 1: Update the tests — delete obsolete balance tests, add derive tests**

In `src/SplitsEditor.test.jsx`:

(a) In `describe('SplitsEditor editing', ...)`, **replace** the test `'the status bar shows Balanced when lines sum to the parent amount'` and the test `'editing an amount surfaces the signed remaining-to-allocate amount'` with:

```js
  it('shows the running Total and no "updates amount" note when lines equal the parent amount', () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    expect(screen.getByText(/Total: -180\.00/)).toBeTruthy();
    expect(screen.queryByText(/updates amount/i)).toBeNull();
  });

  it('editing a line amount updates the Total and shows the "updates amount" note', async () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    const amount0 = screen.getAllByLabelText(/line amount/i)[0];
    await userEvent.type(amount0, '0'); // -100 becomes -1000; sum -1080
    expect(screen.getByText(/Total: -1080\.00/)).toBeTruthy();
    expect(screen.getByText(/updates amount from -180\.00/)).toBeTruthy();
  });
```

(b) In `describe('SplitsEditor per-line direction', ...)`, **replace** the two tests `'flipping a line to In flips its committed sign (remaining reflects it)'` and `'a freshly added line defaults to Out, so a typed magnitude becomes negative'` with:

```js
  it('flipping a line to In flips its committed sign (Total reflects it)', async () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    const inBtns = screen.getAllByRole('button', { name: /line in/i });
    await userEvent.click(inBtns[0]); // s1 becomes +100; sum = +20
    expect(screen.getByText(/Total: 20\.00/)).toBeTruthy();
  });

  it('a freshly added line defaults to Out, so a typed magnitude becomes negative (Total reflects it)', async () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: /add line/i }));
    const amounts = screen.getAllByLabelText(/line amount/i);
    await userEvent.type(amounts[2], '50'); // new line, Out default → -50; sum = -230
    expect(screen.getByText(/Total: -230\.00/)).toBeTruthy();
  });
```

(c) **Delete** the entire `describe('SplitsEditor remainder allocation', ...)` block (the `'+ Add remainder as line'` test).

(d) In `describe('SplitsEditor Done validation and Unsplit', ...)`, **delete** these three tests: `'Done with an unallocated remainder asks to confirm adding an Other line ...'`, `'confirm "Go back to edit" dismisses the prompt ...'`, and `'confirm "OK, add it" appends an Other line ...'`. Then **add** these two tests to the same block:

```js
  it('Done with lines that do not sum to the parent amount calls onDone directly (no confirm)', async () => {
    const { onDone } = setup({
      initialSplits: [
        { id: 's1', amount: -50, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount: -80, categoryId: 'c_household', description: '' },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0].splits).toHaveLength(2);
    expect(onDone.mock.calls[0][0].splits.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(-130, 5);
    expect(screen.queryByText(/will be added as an/i)).toBeNull();
  });

  it('does not render an "Add remainder as line" button', () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -50, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount: -80, categoryId: 'c_household', description: '' },
      ],
    });
    expect(screen.queryByRole('button', { name: /add remainder/i })).toBeNull();
  });
```

Leave `'Done stays direct when already balanced (no confirm prompt)'`, `'Done succeeds when the sum matches'`, and the two `Unsplit` tests as-is.

- [ ] **Step 2: Run `SplitsEditor` tests to verify the new ones fail**

Run: `npx vitest run src/SplitsEditor.test.jsx`
Expected: FAIL — `Total: ...` text isn't rendered yet (the editor still shows the old "Remaining"/"Balanced" bar), and `'Done with lines that do not sum...'` still triggers the confirm panel instead of calling `onDone`.

- [ ] **Step 3: Rewrite `SplitsEditor.jsx` to remove the gate and add the Total readout**

In `src/SplitsEditor.jsx`:

Remove the now-unused import (top of file):

```js
import { OTHER_CATEGORY_NAME } from './categoriesDefaults.js';
```

Replace the derived-state block (currently lines ~21-36, from `const [pendingRemainder...]` through `addRemainderLine`) so it reads:

```js
  const [lines, setLines] = useState(initialSplits);
  const [targets, setTargets] = useState(new Map(initialSplitTargets));
  const [error, setError] = useState(null);
  const [dirs, setDirs] = useState(new Map());
  const dirOf = (line) => dirs.get(line.id) ?? (line.amount < 0 ? 'out' : line.amount > 0 ? 'in' : 'out');

  const parentCents = Math.round(parentAmount * 100);
  const sumCents = lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? Math.round(l.amount * 100) : 0), 0);
```

(That deletes `pendingRemainder`, `remainingCents`, `balanced`, `otherCategoryId`, `fmtSigned`, `makeRemainderLine`, and `addRemainderLine`.)

Replace `tryDone` and delete `confirmRemainder`:

```js
  const tryDone = () => {
    setError(null);
    if (lines.length < 2) {
      // A single line isn't a split — collapse back to a normal category.
      onDone({ splits: null, categoryId: lines[0]?.categoryId });
      return;
    }
    try {
      // The sum IS the amount, so the equality check is trivially satisfied;
      // this still enforces the structural invariants (≥2 lines, finite amounts,
      // exactly one of categoryId/transferId, unique ids).
      validateSplits({ amount: sumCents / 100, splits: lines });
    } catch (e) {
      setError(e.message);
      return;
    }
    onDone({ splits: lines, splitTargets: targets });
  };
```

Replace the `.split-remaining` block (currently the `<div className={`split-remaining ...`}>...</div>`) with the Total readout:

```jsx
        <div className="split-total">
          <span className="split-total-label">Total: {(sumCents / 100).toFixed(2)}</span>
          {parentCents !== sumCents && (
            <span className="split-total-note">updates amount from {(parentCents / 100).toFixed(2)}</span>
          )}
        </div>
```

Delete the `pendingRemainder` confirmation panel (the `{pendingRemainder && (... role="alertdialog" ...)}` block near the end of the component). Keep the `{error && <p className="field-error">{error}</p>}` line, the `+ Add line` button, `Unsplit`, `Cancel`, and `Done` actions unchanged.

- [ ] **Step 4: Replace the CSS**

In `src/App.css`, **replace** the rules currently at ~`3485-3493` (`.split-remaining`, `.split-remaining.ok`, `.split-remaining.mismatch`, `.split-balanced`, `.split-remaining-detail`, `.split-remaining-label`, `.split-confirm`, `.split-confirm-msg`) with:

```css
.split-total { padding: 6px 0; font-family: 'JetBrains Mono', monospace; font-size: 0.95em; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.split-total-label { font-weight: 600; }
.split-total-note { color: rgba(212, 212, 212, 0.55); font-size: 0.85em; }
```

Leave `.split-sum*` (~`3481-3483`) and `.split-summary` (~`3484`) untouched — `.split-summary` is still used by the editors' "▼ N split lines" label.

- [ ] **Step 5: Run `SplitsEditor` tests to verify they pass**

Run: `npx vitest run src/SplitsEditor.test.jsx`
Expected: PASS (all remaining tests, including the unchanged Unsplit / single-line-collapse / grouping tests).

- [ ] **Step 6: Commit**

```bash
git add src/SplitsEditor.jsx src/SplitsEditor.test.jsx src/App.css
git commit -m "feat(splits): drop balance gate; running Total replaces remainder bar"
```

---

## Task 3: `TransferEditor` — derive the magnitude from the splits sum; read-only Amount when split

**Files:**
- Modify: `src/TransferEditor.jsx` (~`32-47`, Amount input ~`100-102`)
- Modify: `src/TransferEditor.test.jsx` (~`193-199`, plus a new test)

- [ ] **Step 1: Update the split wire-up test and add a derive test**

In `src/TransferEditor.test.jsx`, inside `describe('TransferEditor split source-leg wire-up', ...)`, **replace** the test `'opening it mounts SplitsEditor balanced against the source leg amount'` with:

```js
  it('opening it mounts SplitsEditor showing the source-leg Total', async () => {
    setupTransfer();
    await userEvent.type(screen.getByLabelText(/amount/i), '325.40');
    await userEvent.click(screen.getByRole('button', { name: /split source leg…?/i }));
    expect(screen.getByText(/Total: -325\.40/)).toBeTruthy();
  });

  it('a split transfer derives its amount from the splits sum; the Amount field is read-only', async () => {
    const { onSave } = setupTransfer();
    await userEvent.type(screen.getByLabelText(/amount/i), '300'); // seeds source line at -300
    await userEvent.click(screen.getByRole('button', { name: /split source leg…?/i }));
    const lineAmounts = screen.getAllByLabelText(/line amount/i);
    await userEvent.clear(lineAmounts[0]);
    await userEvent.type(lineAmounts[0], '250'); // line0 → -250; line1 is 0; sum -250
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    const amountField = screen.getByLabelText(/amount/i);
    expect(amountField.value).toBe('250');
    expect(amountField.disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: /save transfer/i }));
    const payload = onSave.mock.calls[0][0];
    expect(payload.amount).toBeCloseTo(250, 5);
    expect(payload.splits.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(-250, 5);
  });
```

- [ ] **Step 2: Run `TransferEditor` tests to verify the new ones fail**

Run: `npx vitest run src/TransferEditor.test.jsx`
Expected: FAIL — `Total:` text isn't shown (editor still renders the old bar) and the Amount field is not yet disabled when splits exist.

- [ ] **Step 3: Derive `mag` from the splits sum in `TransferEditor.jsx`**

In `src/TransferEditor.jsx`, replace the line `const mag = Math.abs(parseFloat(magnitude) || 0);` (~`43`) with:

```js
  const splitSum = hasSplits ? splits.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0), 0) : 0;
  const mag = hasSplits ? Math.abs(splitSum) : Math.abs(parseFloat(magnitude) || 0);
```

`valid` (`mag > 0`), `sourceAmount` (`-1 * mag`), and `save()` (`amount: mag`) all consume `mag` and need no further change — a split transfer is now valid (and saves) on the derived sum even when the Amount field is blank.

- [ ] **Step 4: Make the Amount field show the derived sum and become read-only when split**

In `src/TransferEditor.jsx`, replace the Amount `<input>` (~`100-102`) with:

```jsx
        <label className="field"><span>Amount</span>
          <input type="number" step="0.01" aria-label="Amount" value={hasSplits ? Math.abs(splitSum) : magnitude} onChange={(e) => setMagnitude(e.target.value)} disabled={hasSplits} className="input" />
        </label>
```

- [ ] **Step 5: Run `TransferEditor` tests to verify they pass**

Run: `npx vitest run src/TransferEditor.test.jsx`
Expected: PASS, including the unchanged validity / type-suggestion / edit-mode tests.

- [ ] **Step 6: Commit**

```bash
git add src/TransferEditor.jsx src/TransferEditor.test.jsx
git commit -m "feat(splits): transfer amount derives from source-leg splits sum"
```

---

## Task 4: Verify the whole change

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS. Pay attention that `src/__smoke__/splits.test.jsx` (transaction-with-splits end-to-end) is green untouched. (Note: there are 6 pre-existing eslint errors in `CategoryEditor`/`ColorPicker`/`IconPicker`/`spendingMath` that predate this work — they are not introduced here.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Lint the files this branch touched**

Run: `npx eslint src/SplitsEditor.jsx src/TransferEditor.jsx src/useLedger.js`
Expected: clean (no new errors). In particular confirm the removed `OTHER_CATEGORY_NAME` import left no `no-unused-vars`.

- [ ] **Step 4: Manual smoke check (App-level has no automated harness)**

Run: `npm run dev`, then in the browser:
1. New transaction → enter a description, leave/any amount → **Split…** → set 3 category lines totaling more than the original amount (e.g. several "Donations" lines) → **Done**. Confirm: no balance warning, no forced "Other" line, the editor's Amount field shows the lines' sum, and saving records that sum.
2. New transfer from a bank account into a tracking account ("Offering") → **Split source leg…** → set lines totaling the donation → **Done**. Confirm the Amount field shows the derived total, is read-only, and saving moves exactly that total (the destination leg mirrors it).
3. Reopen each saved split → the **Total** shows the sum with **no** "updates amount" note.

- [ ] **Step 5: Commit any doc/checklist updates (if needed)**

```bash
git add -A
git commit -m "chore(splits): verification pass for splits-set-amount"
```

(Skip this commit if there is nothing to record.)

---

## Self-review notes

- **Spec coverage:** SplitsEditor gate removal + Total readout (Task 2) ✓; transfer amount derivation in editor (Task 3) ✓ and ledger (Task 1) ✓; CSS (Task 2 Step 4) ✓; `validateSplits`/`accountsModel` untouched ✓; `TransactionEditor` no-change verified in Task 4 manual check ✓; smoke test stays green (Task 4 Step 1) ✓.
- **Type/name consistency:** classes `.split-total` / `.split-total-label` / `.split-total-note` are introduced in JSX (Task 2 Step 3) and styled with the same names (Task 2 Step 4); `fromAmount`/`toAmount`/`sumCents` names are consistent across `addTransfer` and `updateTransfer` (Task 1).
- **No placeholders:** every code step shows full code; test deletions name the exact test/describe titles to remove.
