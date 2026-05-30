# Splits Balancing UX + Taxes Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the split editor usable for paycheck-style breakdowns by replacing the always-red "mismatch" line with a friendly remainder helper + one-tap balancing, and surface the existing Taxes category to existing users.

**Architecture:** UX-only change to `SplitsEditor.jsx` (a remainder status bar computed in cents + a "Done with remainder" confirmation that auto-allocates the leftover to an "Other" line) plus an idempotent load-time backfill of the `Taxes` builtin in `categoriesDefaults.js` / `useCategories.js`. The `validateSplits` invariant (`sum(lines) === transaction.amount`) and the ledger save path are unchanged.

**Tech Stack:** React 19, Vitest 4 + @testing-library/react + user-event, nanoid. Spec: `docs/superpowers/specs/2026-05-29-splits-balancing-ux-design.md`.

**Test runner notes:** single run (no watch) is `npx vitest run <file> -t "<name substring>"`. Full suite: `npx vitest run`. Lint: `npm run lint`.

---

## Task 1: Taxes backfill helpers (model layer)

**Files:**
- Modify: `src/categoriesDefaults.js:85-92` (refactor `withTransferSeeds`, add backfill exports)
- Test: `src/categoriesDefaults.test.js` (append a new describe block)

- [ ] **Step 1: Write the failing tests**

Append this describe block to the end of `src/categoriesDefaults.test.js` (before the file's final newline). Also add `BACKFILL_CATEGORIES, withBackfillCategories` to the existing import from `./categoriesDefaults.js` at the top of the file.

```js
describe('builtin backfill categories', () => {
  it('BACKFILL_CATEGORIES contains the Taxes builtin', () => {
    expect(BACKFILL_CATEGORIES.map(c => c.name)).toContain('Taxes');
  });

  it('withBackfillCategories appends Taxes when missing, with a string id', () => {
    const out = withBackfillCategories([{ id: 'x', name: 'Groceries', flow: 'expense' }]);
    const taxes = out.find(c => c.name === 'Taxes');
    expect(taxes).toBeTruthy();
    expect(typeof taxes.id).toBe('string');
  });

  it('does not duplicate Taxes when already present and returns the same reference', () => {
    const existing = [{ id: 't', name: 'Taxes', flow: 'expense' }];
    const out = withBackfillCategories(existing);
    expect(out).toBe(existing);
    expect(out.filter(c => c.name === 'Taxes')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/categoriesDefaults.test.js -t "builtin backfill categories"`
Expected: FAIL — `BACKFILL_CATEGORIES`/`withBackfillCategories` are not exported (import is `undefined`).

- [ ] **Step 3: Implement the backfill helpers**

Replace the existing `withTransferSeeds` function (`src/categoriesDefaults.js:83-92`) with the following. This extracts a shared `appendMissingByName` helper, keeps `withTransferSeeds` behavior identical, and adds the Taxes backfill that reuses the single `Taxes` definition already in `DEFAULT_CATEGORIES`.

```js
// Append any seed whose `name` isn't already present (assigning a fresh id).
// Idempotent: returns the SAME array reference when nothing is missing.
function appendMissingByName(categories, seeds) {
  const list = Array.isArray(categories) ? categories : [];
  const names = new Set(list.map(c => c && c.name));
  const missing = seeds
    .filter(s => s && !names.has(s.name))
    .map(s => ({ ...s, id: nanoid(8) }));
  return missing.length ? [...list, ...missing] : list;
}

// Append any transfer seed whose `name` isn't already present. Idempotent.
export function withTransferSeeds(categories) {
  return appendMissingByName(categories, TRANSFER_SEED_CATEGORIES);
}

// Builtins added to DEFAULT_CATEGORIES after the initial v4 release. Users who
// migrated before these existed get no category backfill from
// initializeFromStorage, so we re-append them (by name) on every load. Taxes is
// the single source of truth in DEFAULT_CATEGORIES (no duplicate definition).
export const BACKFILL_CATEGORIES = [
  DEFAULT_CATEGORIES.find(c => c.name === 'Taxes'),
].filter(Boolean);

// Append any missing post-release builtin (currently just Taxes). Idempotent.
export function withBackfillCategories(categories) {
  return appendMissingByName(categories, BACKFILL_CATEGORIES);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/categoriesDefaults.test.js`
Expected: PASS — the new block passes and the existing `withTransferSeeds` tests (idempotency, append-only-missing) still pass because behavior is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/categoriesDefaults.js src/categoriesDefaults.test.js
git commit -m "feat(splits): idempotent Taxes category backfill helpers"
```

---

## Task 2: Wire the backfill into category loading

**Files:**
- Modify: `src/useCategories.js:4` (import) and `src/useCategories.js:19` (load path)
- Test: `src/useCategories.test.jsx` (update two existing length assertions, add one test)

- [ ] **Step 1: Update existing tests + add the new one**

In `src/useCategories.test.jsx`, add `BACKFILL_CATEGORIES` to the existing import from `./categoriesDefaults.js` (line 4).

Update the assertion in the test **'hydrates from localStorage and appends any missing transfer seeds'** (currently `src/useCategories.test.jsx:26`) from:

```js
    expect(result.current.categories).toHaveLength(1 + TRANSFER_SEED_CATEGORIES.length);
```

to:

```js
    expect(result.current.categories).toHaveLength(1 + TRANSFER_SEED_CATEGORIES.length + BACKFILL_CATEGORIES.length);
```

Update the assertion in **'does not duplicate transfer seeds that are already stored (idempotent load)'** (currently `src/useCategories.test.jsx:33`) from:

```js
    expect(result.current.categories).toHaveLength(TRANSFER_SEED_CATEGORIES.length);
```

to:

```js
    expect(result.current.categories).toHaveLength(TRANSFER_SEED_CATEGORIES.length + BACKFILL_CATEGORIES.length);
```

Then add this new test inside the `describe('useCategories', ...)` block:

```js
  it('backfills the Taxes category for stored data that lacks it', () => {
    const seeded = [{ id: 'cz', name: 'Zoo', icon: '🦓', color: '#000000', keywords: [], templates: [], builtin: false }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    const { result } = renderHook(() => useCategories());
    expect(result.current.categories.find(c => c.name === 'Taxes')).toBeTruthy();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/useCategories.test.jsx`
Expected: FAIL — the new "backfills the Taxes category" test fails (no Taxes appended), and the two updated length assertions fail (Taxes not yet added by load).

- [ ] **Step 3: Wire backfill into load()**

In `src/useCategories.js`, update the import on line 4 to add `withBackfillCategories`:

```js
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_NAME, withTransferSeeds, withBackfillCategories } from './categoriesDefaults.js';
```

Then change the hydrate return in `load()` (currently `src/useCategories.js:19`) from:

```js
    return withTransferSeeds(parsed);
```

to:

```js
    return withBackfillCategories(withTransferSeeds(parsed));
```

Leave `seed()` unchanged — `DEFAULT_CATEGORIES` already contains Taxes, so a fresh seed needs no backfill.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/useCategories.test.jsx`
Expected: PASS — all tests, including the updated length assertions and the new Taxes test.

- [ ] **Step 5: Commit**

```bash
git add src/useCategories.js src/useCategories.test.jsx
git commit -m "feat(splits): backfill Taxes category on category load"
```

---

## Task 3: Remainder status bar in SplitsEditor

**Files:**
- Modify: `src/SplitsEditor.jsx` (imports; replace `sum`/`sumOk` with cents math + helpers; replace footer JSX)
- Test: `src/SplitsEditor.test.jsx` (replace one footer test with two; add a remainder-allocation describe)

- [ ] **Step 1: Replace the footer test and add the remainder test**

In `src/SplitsEditor.test.jsx`, replace the single test **'editing an amount input updates the sum footer'** (currently `src/SplitsEditor.test.jsx:64-77`) with these two tests:

```js
  it('the status bar shows Balanced when lines sum to the parent amount', () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    expect(screen.getByText(/Balanced/)).toBeTruthy();
    expect(screen.getByText(/Lines: -180\.00/)).toBeTruthy();
  });

  it('editing an amount surfaces the signed remaining-to-allocate amount', async () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    const amount0 = screen.getAllByLabelText(/line amount/i)[0];
    await userEvent.type(amount0, '0'); // -100 becomes -1000; sum -1080; remaining +900
    expect(screen.getByText(/Remaining to allocate: \+900\.00/)).toBeTruthy();
  });
```

Then add this new describe block after the `describe('SplitsEditor +Add / ×Delete', ...)` block:

```js
describe('SplitsEditor remainder allocation', () => {
  afterEach(() => cleanup());

  it('"+ Add remainder as line" appends a line equal to the remainder and balances', async () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -50, categoryId: 'c_grocery',   description: '' }, // sum -130, parent -180, remaining -50
        { id: 's2', amount: -80, categoryId: 'c_household', description: '' },
      ],
    });
    expect(screen.getByText(/Remaining to allocate: -50\.00/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /add remainder as line/i }));
    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3 lines
    expect(screen.getByText(/Balanced/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/SplitsEditor.test.jsx -t "status bar"`
Then: `npx vitest run src/SplitsEditor.test.jsx -t "remainder allocation"`
Expected: FAIL — "Balanced" / "Remaining to allocate" text and the "+ Add remainder as line" button don't exist yet.

- [ ] **Step 3: Add the import**

In `src/SplitsEditor.jsx`, add the `OTHER_CATEGORY_NAME` import below the existing imports (after line 4):

```js
import { OTHER_CATEGORY_NAME } from './categoriesDefaults.js';
```

- [ ] **Step 4: Replace the sum math with cents-based helpers**

In `src/SplitsEditor.jsx`, replace these two lines (currently `src/SplitsEditor.jsx:22-23`):

```js
  const sum = lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0), 0);
  const sumOk = Math.round(sum * 100) === Math.round(parentAmount * 100);
```

with:

```js
  const parentCents = Math.round(parentAmount * 100);
  const sumCents = lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? Math.round(l.amount * 100) : 0), 0);
  const remainingCents = parentCents - sumCents;
  const balanced = remainingCents === 0;

  const otherCategoryId = (categories.find(c => c.name === OTHER_CATEGORY_NAME) || categories[0] || {}).id;
  const fmtSigned = (cents) => (cents > 0 ? '+' : '') + (cents / 100).toFixed(2);
  const makeRemainderLine = () => ({ id: nanoid(8), amount: remainingCents / 100, categoryId: otherCategoryId, description: '' });
  const addRemainderLine = () => setLines(prev => [...prev, makeRemainderLine()]);
```

- [ ] **Step 5: Replace the footer JSX**

In `src/SplitsEditor.jsx`, replace the status line block (currently `src/SplitsEditor.jsx:114-116`):

```jsx
        <div className={`split-sum ${sumOk ? 'ok' : 'mismatch'}`}>
          Sum of lines: {sum.toFixed(2)} · Bank impact: {parentAmount.toFixed(2)}
        </div>
```

with:

```jsx
        <div className={`split-remaining ${balanced ? 'ok' : 'mismatch'}`}>
          {balanced ? (
            <>
              <span className="split-balanced">✓ Balanced</span>
              <span className="split-remaining-detail">Lines: {(sumCents / 100).toFixed(2)} · Bank: {parentAmount.toFixed(2)}</span>
            </>
          ) : (
            <>
              <span className="split-remaining-label">Remaining to allocate: {fmtSigned(remainingCents)}</span>
              <button type="button" className="btn btn-small" onClick={addRemainderLine}>+ Add remainder as line</button>
            </>
          )}
        </div>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/SplitsEditor.test.jsx`
Expected: PASS — the two status-bar tests, the remainder-allocation test, and all previously-passing SplitsEditor tests (the old "Done shows an inline error" test still passes because `tryDone` is unchanged in this task).

- [ ] **Step 7: Commit**

```bash
git add src/SplitsEditor.jsx src/SplitsEditor.test.jsx
git commit -m "feat(splits): remainder status bar with one-tap allocate"
```

---

## Task 4: "Done with remainder" confirmation

**Files:**
- Modify: `src/SplitsEditor.jsx` (add `pendingRemainder` state; rework `tryDone`; add `confirmRemainder`; add confirm panel JSX)
- Test: `src/SplitsEditor.test.jsx` (allow `setup` to override categories; rewrite the "inline error" test; add three tests)

- [ ] **Step 1: Let `setup` forward a categories override**

In `src/SplitsEditor.test.jsx`, change the `categories` prop in the `setup` helper (currently `src/SplitsEditor.test.jsx:24`) from:

```jsx
      categories={categories}
```

to:

```jsx
      categories={props.categories ?? categories}
```

- [ ] **Step 2: Rewrite the "inline error" test and add the confirmation tests**

In `src/SplitsEditor.test.jsx`, replace the test **'Done shows an inline error when the sum does not match parent amount'** (currently `src/SplitsEditor.test.jsx:155-165`) with:

```js
  it('Done with an unallocated remainder asks to confirm adding an Other line (no error, no onDone yet)', async () => {
    const { onDone } = setup({
      initialSplits: [
        { id: 's1', amount: -50, categoryId: 'c_grocery',   description: '' }, // sum -130, parent -180
        { id: 's2', amount: -80, categoryId: 'c_household', description: '' },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText(/will be added as an/i)).toBeTruthy();
  });

  it('Done stays direct when already balanced (no confirm prompt)', async () => {
    const { onDone } = setup(); // default -100 / -80 = -180, balanced
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/will be added as an/i)).toBeNull();
  });

  it('confirm "Go back to edit" dismisses the prompt without calling onDone', async () => {
    const { onDone } = setup({
      initialSplits: [
        { id: 's1', amount: -50, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount: -80, categoryId: 'c_household', description: '' },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    await userEvent.click(screen.getByRole('button', { name: /go back to edit/i }));
    expect(screen.queryByText(/will be added as an/i)).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('confirm "OK, add it" appends an Other line and calls onDone with balanced splits', async () => {
    const cats = [...categories, { id: 'c_other', name: 'Other', icon: '📋', flow: 'expense' }];
    const { onDone } = setup({
      categories: cats,
      initialSplits: [
        { id: 's1', amount: -50, categoryId: 'c_grocery',   description: '' }, // remaining -50
        { id: 's2', amount: -80, categoryId: 'c_household', description: '' },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    await userEvent.click(screen.getByRole('button', { name: /ok, add it/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    const payload = onDone.mock.calls[0][0];
    expect(payload.splits).toHaveLength(3);
    const added = payload.splits[2];
    expect(added.categoryId).toBe('c_other');
    expect(added.amount).toBeCloseTo(-50, 5);
    expect(payload.splits.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(-180, 5);
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/SplitsEditor.test.jsx -t "Done"`
Then: `npx vitest run src/SplitsEditor.test.jsx -t "confirm"`
Expected: FAIL — there is no confirmation prompt yet; clicking Done on an unbalanced split currently sets an inline error and does not show "will be added as an…".

- [ ] **Step 4: Add the `pendingRemainder` state**

In `src/SplitsEditor.jsx`, add this state declaration right after the `error` state (currently `src/SplitsEditor.jsx:20`):

```js
  const [pendingRemainder, setPendingRemainder] = useState(false);
```

- [ ] **Step 5: Rework `tryDone` and add `confirmRemainder`**

In `src/SplitsEditor.jsx`, replace the existing `tryDone` function (currently `src/SplitsEditor.jsx:25-34`) with:

```js
  const tryDone = () => {
    setError(null);
    if (!balanced) { setPendingRemainder(true); return; }
    try {
      validateSplits({ amount: parentAmount, splits: lines });
    } catch (e) {
      setError(e.message);
      return;
    }
    onDone({ splits: lines, splitTargets: targets });
  };

  const confirmRemainder = () => {
    setPendingRemainder(false);
    onDone({ splits: [...lines, makeRemainderLine()], splitTargets: targets });
  };
```

- [ ] **Step 6: Add the confirmation panel JSX**

In `src/SplitsEditor.jsx`, insert this block immediately after the closing `</div>` of `dialog-actions` and before the `{error && ...}` line (currently `src/SplitsEditor.jsx:121-122`):

```jsx
        {pendingRemainder && (
          <div className="split-confirm" role="alertdialog" aria-label="Unallocated remainder">
            <p className="split-confirm-msg">
              The remaining {fmtSigned(remainingCents)} will be added as an “Other” line so the split balances the bank deposit. Continue?
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setPendingRemainder(false)}>Go back to edit</button>
              <button type="button" className="btn btn-primary" onClick={confirmRemainder}>OK, add it</button>
            </div>
          </div>
        )}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/SplitsEditor.test.jsx`
Expected: PASS — all SplitsEditor tests, including the four confirmation tests and the still-passing "Done succeeds when the sum matches".

- [ ] **Step 8: Commit**

```bash
git add src/SplitsEditor.jsx src/SplitsEditor.test.jsx
git commit -m "feat(splits): confirm-and-auto-allocate remainder on Done"
```

---

## Task 5: Styles + full-suite verification

**Files:**
- Modify: `src/App.css` (add styles next to the existing `.split-sum` rules at `App.css:3463-3466`)

- [ ] **Step 1: Add the CSS**

In `src/App.css`, add these rules immediately after the existing `.split-summary` rule (currently `src/App.css:3466`):

```css
.split-remaining { padding: 6px 0; font-family: 'JetBrains Mono', monospace; font-size: 0.95em; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.split-remaining.ok { color: #3ddba0; }
.split-remaining.mismatch { color: #f0c674; }
.split-balanced { font-weight: 600; }
.split-remaining-detail { color: rgba(212, 212, 212, 0.55); font-size: 0.85em; }
.split-remaining-label { font-weight: 600; }
.btn-small { padding: 2px 8px; font-size: 0.8em; }
.split-confirm { margin-top: 10px; padding: 12px 14px; border-radius: 8px; background: rgba(240, 198, 116, 0.08); border: 1px solid rgba(240, 198, 116, 0.35); }
.split-confirm-msg { margin: 0 0 10px; font-size: 0.9em; color: #d4d4d4; }
```

(The now-unused `.split-sum` rules may be left in place; they harm nothing.)

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — entire suite green, including `src/__smoke__/splits.test.jsx`, `useLedger.test.jsx`, and `accountsModel.test.js` (their `validateSplits` `/does not match/` assertions are untouched because the model is unchanged).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors (no unused `sum`/`sumOk`; new helpers are all referenced).

- [ ] **Step 4: Commit**

```bash
git add src/App.css
git commit -m "style(splits): remainder bar + confirm panel styling"
```

- [ ] **Step 5: Manual smoke (optional but recommended)**

Run `npm run dev`, open a bank account, edit a deposit, click **Split…**, then:
- raise line 1 to the gross (e.g. 5000), set it to Paycheck;
- add a Taxes line (−1500) and a Roth transfer (−500);
- confirm the bar reads **✓ Balanced** and **Done** completes;
- separately, leave a remainder and click **Done** → confirm the warning appears and **OK, add it** creates an "Other" line that balances.

---

## Notes / invariants preserved

- `validateSplits` (`src/accountsModel.js:299-328`) and the ledger save path are unchanged — the `sum(lines) === amount` invariant still guards persistence.
- `openSplits` seeding of `[full, 0]` in `TransactionEditor.jsx` / `TransferEditor.jsx` is unchanged.
- No schema-version bump; the Taxes backfill rides the existing load-time append-by-name path, idempotently.
