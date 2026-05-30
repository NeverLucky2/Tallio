# Split Main-Category, Per-Line Direction & Amount-Lock Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the amount-lock bug when opening Split, keep an editable main category on split transactions (display-only, shown with the expander), and give each split line a − Out / + In toggle.

**Architecture:** All UI/state changes in existing React components plus a one-line gate change in `reportsModel.js`. The signed `amount` on each split line stays the single source of truth (balance/remainder/validation untouched); a UI-only direction map is layered on. The parent's main `categoryId` is preserved on save but never feeds report math (`flattenForReports` uses the lines).

**Tech Stack:** React 19, Vitest 4 + @testing-library/react + user-event, nanoid. Spec: `docs/superpowers/specs/2026-05-30-split-main-category-and-line-direction-design.md`.

**Test runner:** single run `npx vitest run <file> -t "<name>"`; full suite `npx vitest run`; lint `npm run lint`.

---

## Task 1: Amount-lock fix (don't commit splits until Done)

**Files:**
- Modify: `src/TransactionEditor.jsx` (add `pendingSeed`; rework `openSplits`; mount; `onSplitsDone`)
- Test: `src/TransactionEditor.test.jsx`

- [ ] **Step 1: Write the failing tests**

Add to the `describe('TransactionEditor split wire-up', ...)` block in `src/TransactionEditor.test.jsx`:

```js
  it('opening Split then Cancel leaves the transaction unsplit and the amount editable', async () => {
    setupSplit();
    await userEvent.type(screen.getByLabelText(/^amount$/i), '100');
    await userEvent.click(screen.getByRole('button', { name: /^split…?$/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/split lines/i)).toBeNull();
    expect(screen.getByLabelText(/^amount$/i).disabled).toBe(false);
    expect(screen.getByRole('button', { name: /^split…?$/i })).toBeTruthy();
  });

  it('opening Split then Done commits the split (amount becomes locked)', async () => {
    setupSplit();
    await userEvent.type(screen.getByLabelText(/^amount$/i), '100');
    await userEvent.click(screen.getByRole('button', { name: /^split…?$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(screen.getByText(/2 split lines/i)).toBeTruthy();
    expect(screen.getByLabelText(/^amount$/i).disabled).toBe(true);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/TransactionEditor.test.jsx -t "opening Split then"`
Expected: FAIL — "Cancel" currently leaves the transaction split (the amount stays disabled and "split lines" text remains), so the first test fails.

- [ ] **Step 3: Add the `pendingSeed` state**

In `src/TransactionEditor.jsx`, add after the `splitsOpen` state (line 23):

```js
  const [pendingSeed, setPendingSeed] = useState(null);
```

- [ ] **Step 4: Rework `openSplits` to seed without committing**

Replace `openSplits` (`src/TransactionEditor.jsx:34-42`):

```js
  const openSplits = () => {
    if (!hasSplits) {
      setSplits([
        { id: nanoid(8), amount: parentAmount || 0, categoryId, description: '' },
        { id: nanoid(8), amount: 0,                 categoryId, description: '' },
      ]);
    }
    setSplitsOpen(true);
  };
```

with:

```js
  const openSplits = () => {
    setPendingSeed(hasSplits ? null : [
      { id: nanoid(8), amount: parentAmount || 0, categoryId, description: '' },
      { id: nanoid(8), amount: 0,                 categoryId, description: '' },
    ]);
    setSplitsOpen(true);
  };
```

- [ ] **Step 5: Pass the seed as initialSplits and clear it on commit**

In `src/TransactionEditor.jsx`, change the SplitsEditor mount prop (line 135) from
`initialSplits={splits || []}` to:

```jsx
            initialSplits={splits || pendingSeed || []}
```

Then in `onSplitsDone` (`src/TransactionEditor.jsx:44-54`), add `setPendingSeed(null);` as the first line of the function body:

```js
  const onSplitsDone = ({ splits: nextSplits, splitTargets: nextTargets, categoryId: promotedCategoryId }) => {
    setPendingSeed(null);
    if (nextSplits === null) {
```

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run src/TransactionEditor.test.jsx`
Expected: PASS — both new tests and all existing ones (the existing "opening Split… mounts SplitsEditor" still works because the seed reaches the editor via `pendingSeed`).

- [ ] **Step 7: Commit**

```bash
git add src/TransactionEditor.jsx src/TransactionEditor.test.jsx
git commit -m "fix(splits): don't commit a split until Done (keep amount editable on cancel)"
```

---

## Task 2: Keep the main category on split transactions

**Files:**
- Modify: `src/TransactionEditor.jsx` (save keeps categoryId; category field shows select + split indicator)
- Test: `src/TransactionEditor.test.jsx`

- [ ] **Step 1: Update the existing "hidden category" test and add a save test**

In `src/TransactionEditor.test.jsx`, replace the test **'an existing split transaction shows the summary chip and a hidden category field'** (lines 85-96) with:

```js
  it('an existing split transaction shows the summary chip AND keeps the editable category field', () => {
    setupSplit({
      id: 't1', accountId: 'a_chase', date: '2026-05-20', amount: -180,
      categoryId: 'c_pay', description: 'Costco', payee: 'Costco',
      splits: [
        { id: 's1', amount: -100, categoryId: 'c_shop', description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_pay',  description: '' },
      ],
    });
    expect(screen.getByText(/2 split lines/i)).toBeTruthy();
    const select = screen.getByLabelText(/^category$/i);
    expect(select).toBeTruthy();
    expect(select.value).toBe('c_pay');
  });

  it('saving a split transaction keeps its main categoryId (not null)', async () => {
    const { onSave } = setupSplit({
      id: 't1', accountId: 'a_chase', date: '2026-05-20', amount: -180,
      categoryId: 'c_pay', description: 'Costco', payee: 'Costco',
      splits: [
        { id: 's1', amount: -100, categoryId: 'c_shop', description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_pay',  description: '' },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave.mock.calls[0][0].categoryId).toBe('c_pay');
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/TransactionEditor.test.jsx -t "split transaction"`
Expected: FAIL — the category select is currently hidden when split (returns null), and save nulls the categoryId.

- [ ] **Step 3: Keep categoryId on save**

In `src/TransactionEditor.jsx`, change the save payload line (currently `src/TransactionEditor.jsx:63`):

```js
      categoryId: hasSplits ? null : categoryId,
```

to:

```js
      categoryId: categoryId || null,
```

- [ ] **Step 4: Always render the category select, with the split indicator beside it**

Replace the category field block (`src/TransactionEditor.jsx:95-108`):

```jsx
        {hasSplits ? (
          <div className="field">
            <span>Category</span>
            <span className="split-summary">▼ {splits.length} split lines</span>
            <button type="button" className="btn" onClick={openSplits}>Edit splits…</button>
          </div>
        ) : (
          <label className="field"><span>Category</span>
            <select aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="select">
              {groupCategoriesByFlow(categories).map(group => (
                <optgroup key={group.flow} label={group.label}>
                  {group.items.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </optgroup>
              ))}
            </select>
            <button type="button" className="btn" onClick={openSplits}>Split…</button>
          </label>
        )}
```

with:

```jsx
        <div className="field">
          <span>Category</span>
          <select aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="select">
            {groupCategoriesByFlow(categories).map(group => (
              <optgroup key={group.flow} label={group.label}>
                {group.items.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </optgroup>
            ))}
          </select>
          {hasSplits ? (
            <>
              <span className="split-summary">▼ {splits.length} split lines</span>
              <button type="button" className="btn" onClick={openSplits}>Edit splits…</button>
            </>
          ) : (
            <button type="button" className="btn" onClick={openSplits}>Split…</button>
          )}
        </div>
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/TransactionEditor.test.jsx`
Expected: PASS — the two updated/added tests and all existing ones.

- [ ] **Step 6: Commit**

```bash
git add src/TransactionEditor.jsx src/TransactionEditor.test.jsx
git commit -m "feat(splits): keep an editable main category on split transactions"
```

---

## Task 3: Register row shows main category + chevron

**Files:**
- Modify: `src/TransactionRow.jsx` (split `categoryCell`)
- Test: `src/TransactionRow.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to the `describe('TransactionRow split parent', ...)` block in `src/TransactionRow.test.jsx`:

```js
  it('shows the main category name alongside the split chevron when the parent has a categoryId', () => {
    const row = { ...splitRow, categoryId: 'c_grocery' };
    render(<table><tbody><TransactionRow layout="bank" row={row} categoriesById={splitCategoriesById} onEdit={vi.fn()} /></tbody></table>);
    expect(screen.getByText('Groceries')).toBeTruthy();      // main category cell (collapsed)
    expect(screen.getByText(/2 split lines/)).toBeTruthy();   // chevron still present
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/TransactionRow.test.jsx -t "main category name alongside"`
Expected: FAIL — the split cell currently renders only the chevron, so "Groceries" isn't found.

- [ ] **Step 3: Render the main category + chevron together**

In `src/TransactionRow.jsx`, replace the `categoryCell` definition (lines 59-61):

```jsx
  const categoryCell = isSplit
    ? <SplitChevron expanded={expanded} onClick={() => setExpanded(!expanded)} count={row.splits.length} />
    : (transfer ? <TransferChip info={transfer} category={transferCategory} onNavigate={onNavigate} /> : <CategoryCell categoriesById={categoriesById} categoryId={row.categoryId} />);
```

with:

```jsx
  const mainCat = isSplit && row.categoryId && categoriesById ? categoriesById.get(row.categoryId) : null;
  const categoryCell = isSplit
    ? (
        <span className="txn-split-cat">
          {mainCat && <CategoryCell categoriesById={categoriesById} categoryId={row.categoryId} />}
          <SplitChevron expanded={expanded} onClick={() => setExpanded(!expanded)} count={row.splits.length} />
        </span>
      )
    : (transfer ? <TransferChip info={transfer} category={transferCategory} onNavigate={onNavigate} /> : <CategoryCell categoriesById={categoriesById} categoryId={row.categoryId} />);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/TransactionRow.test.jsx`
Expected: PASS — the new test plus all existing split tests (which use `categoryId: null` and so render just the chevron).

- [ ] **Step 5: Commit**

```bash
git add src/TransactionRow.jsx src/TransactionRow.test.jsx
git commit -m "feat(splits): show main category beside the split expander in the register"
```

---

## Task 4: Per-line Out/In toggle in the split editor

**Files:**
- Modify: `src/SplitsEditor.jsx` (`dirs` state + `dirOf`; per-line magnitude/direction; amount cell)
- Test: `src/SplitsEditor.test.jsx`

- [ ] **Step 1: Write the failing tests**

Add a new describe block to `src/SplitsEditor.test.jsx` (after the `describe('SplitsEditor remainder allocation', ...)` block):

```js
describe('SplitsEditor per-line direction', () => {
  afterEach(() => cleanup());

  it('a negative line shows Out active and the magnitude as a positive number', () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    const outBtns = screen.getAllByRole('button', { name: /line out/i });
    expect(outBtns[0].className).toContain('active');
    const amounts = screen.getAllByLabelText(/line amount/i);
    expect(Number(amounts[0].value)).toBe(100);
  });

  it('flipping a line to In flips its committed sign (remaining reflects it)', async () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' }, // balanced at -180
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    const inBtns = screen.getAllByRole('button', { name: /line in/i });
    await userEvent.click(inBtns[0]); // s1 becomes +100; sum = +20; remaining = -180 - 20 = -200
    expect(screen.getByText(/Remaining to allocate: -200\.00/)).toBeTruthy();
  });

  it('a freshly added line defaults to Out, so a typed magnitude becomes negative', async () => {
    setup({
      initialSplits: [
        { id: 's1', amount: -100, categoryId: 'c_grocery',   description: '' },
        { id: 's2', amount:  -80, categoryId: 'c_household', description: '' },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: /add line/i }));
    const amounts = screen.getAllByLabelText(/line amount/i);
    await userEvent.type(amounts[2], '50'); // new line, Out default → -50; sum = -230; remaining = -180 - (-230) = +50
    expect(screen.getByText(/Remaining to allocate: \+50\.00/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/SplitsEditor.test.jsx -t "per-line direction"`
Expected: FAIL — there are no "Line out"/"Line in" buttons yet, and the amount input currently shows the signed value.

- [ ] **Step 3: Add the direction state + resolver**

In `src/SplitsEditor.jsx`, add after the `pendingRemainder` state (the `const [pendingRemainder, ...]` line):

```js
  const [dirs, setDirs] = useState(new Map());
  const dirOf = (line) => dirs.get(line.id) ?? (line.amount < 0 ? 'out' : line.amount > 0 ? 'in' : 'out');
```

- [ ] **Step 4: Add per-line direction helpers inside the map**

In `src/SplitsEditor.jsx`, inside the `lines.map((line, idx) => { ... })` callback, add these two helpers right after the `toggleType` definition (after `src/SplitsEditor.jsx:86`):

```js
              const setLineMagnitude = (mag) => updateLine({ amount: (dirOf(line) === 'in' ? 1 : -1) * Math.abs(mag) });
              const setLineDir = (dir) => {
                setDirs(prev => new Map(prev).set(line.id, dir));
                updateLine({ amount: (dir === 'in' ? 1 : -1) * Math.abs(line.amount) });
              };
```

- [ ] **Step 5: Replace the amount cell with the toggle + magnitude field**

In `src/SplitsEditor.jsx`, replace the amount cell (lines 112-114):

```jsx
                  <td className="right">
                    <input type="number" step="0.01" aria-label="Line amount" className="input" value={line.amount} onChange={(e) => updateLine({ amount: parseFloat(e.target.value) || 0 })} />
                  </td>
```

with:

```jsx
                  <td className="right">
                    <span className="dir-toggle" role="group" aria-label="Line direction">
                      <button type="button" className={`dir-btn${dirOf(line) === 'out' ? ' active' : ''}`} aria-label="Line out" onClick={() => setLineDir('out')}>− Out</button>
                      <button type="button" className={`dir-btn${dirOf(line) === 'in' ? ' active' : ''}`} aria-label="Line in" onClick={() => setLineDir('in')}>+ In</button>
                    </span>
                    <input type="number" step="0.01" min="0" aria-label="Line amount" className="input" value={Math.abs(line.amount)} onChange={(e) => setLineMagnitude(parseFloat(e.target.value) || 0)} />
                  </td>
```

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run src/SplitsEditor.test.jsx`
Expected: PASS — the new direction tests and all existing SplitsEditor tests (the existing "editing an amount surfaces the signed remaining" test still yields +900 because the magnitude field shows 100 and typing '0' makes 1000 → −1000).

- [ ] **Step 7: Commit**

```bash
git add src/SplitsEditor.jsx src/SplitsEditor.test.jsx
git commit -m "feat(splits): per-line Out/In toggle with positive magnitude field"
```

---

## Task 5: Keep recurring detection line-based for split parents

**Files:**
- Modify: `src/reportsModel.js:191-200` (gate + comment)
- Test: `src/reportsModel.test.js`

- [ ] **Step 1: Write the failing test**

Add to the `describe('recurringCharges', ...)` block in `src/reportsModel.test.js`:

```js
  it('does not flag a split parent as a recurring expense when no line is expense, even if its main category is expense', () => {
    const cats = new Map([
      ['exp', { id: 'exp', name: 'Misc',     flow: 'expense' }],
      ['inc', { id: 'inc', name: 'Paycheck', flow: 'income' }],
      ['sav', { id: 'sav', name: 'Roth',     flow: 'savings' }],
    ]);
    const now = new Date('2026-05-31');
    const mk = (id, date) => ({
      id, accountId: 'a', date, amount: 3000, payee: 'Acme', categoryId: 'exp',
      splits: [
        { id: id + 'a', amount: 4000, categoryId: 'inc' },
        { id: id + 'b', amount: -1000, categoryId: 'sav' },
      ],
    });
    const rows = recurringCharges([mk('p1', '2026-04-15'), mk('p2', '2026-05-15')], cats, { now });
    expect(rows.some(r => /acme/i.test(r.label || ''))).toBe(false);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/reportsModel.test.js -t "split parent as a recurring expense"`
Expected: FAIL — the current gate uses `flowOf(t)`, which now sees the parent's `categoryId: 'exp'` as expense-flow and includes the parent (so `Acme` IS in the results).

- [ ] **Step 3: Make the split-parent gate line-based**

In `src/reportsModel.js`, replace the gate (lines 191-200):

```js
    // A split parent has no top-level categoryId, so flowOf returns null. Treat it as
    // expense-flow if any of its category-line splits is itself expense-flow — this
    // keeps recurring detection working on the parent as a single charge.
    const isSplitParent = Array.isArray(t.splits) && t.splits.length > 0;
    const splitHasExpenseLine = isSplitParent && t.splits.some(s => {
      if (s.transferId) return false;
      const cat = categoriesById && categoriesById.get(s.categoryId);
      return cat && cat.flow === 'expense';
    });
    if (!splitHasExpenseLine && flowOf(t, categoriesById) !== 'expense') continue;
```

with:

```js
    // A split parent's own categoryId is a display label only; recurring detection
    // is decided by its lines — included if any category line is expense-flow. A
    // non-split charge is gated on its own flow.
    const isSplitParent = Array.isArray(t.splits) && t.splits.length > 0;
    const splitHasExpenseLine = isSplitParent && t.splits.some(s => {
      if (s.transferId) return false;
      const cat = categoriesById && categoriesById.get(s.categoryId);
      return cat && cat.flow === 'expense';
    });
    if (isSplitParent ? !splitHasExpenseLine : (flowOf(t, categoriesById) !== 'expense')) continue;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/reportsModel.test.js`
Expected: PASS — the new test plus all existing reportsModel tests (non-split behavior is unchanged; split parents are still included when they have an expense line).

- [ ] **Step 5: Commit**

```bash
git add src/reportsModel.js src/reportsModel.test.js
git commit -m "refactor(splits): gate recurring detection on split lines, not parent category"
```

---

## Task 6: Styles + full-suite verification

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Add the CSS**

In `src/App.css`, add after the `.split-confirm-msg` rule (added in the previous feature, near the other `.split-*` rules):

```css
.txn-split-cat { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.split-line-row .dir-toggle { display: inline-flex; margin-right: 6px; vertical-align: middle; }
.split-line-row .dir-toggle .dir-btn { padding: 2px 6px; font-size: 0.8em; }
.split-line-row .input { width: 7rem; }
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — entire suite green.

- [ ] **Step 3: Lint the changed files**

Run: `npx eslint src/TransactionEditor.jsx src/TransactionRow.jsx src/SplitsEditor.jsx src/reportsModel.js`
Expected: no errors (warnings unrelated to these changes, if any, are pre-existing).

- [ ] **Step 4: Commit**

```bash
git add src/App.css
git commit -m "style(splits): main-category cell + per-line direction toggle styling"
```

- [ ] **Step 5: Manual smoke (optional)**

Run `npm run dev`. On a bank account: create a deposit, set category to Paycheck, type an amount, click **Split…**, then **Cancel** → confirm the amount is still editable and it's not split. Reopen, **Split…**, add a Taxes line (Out) and a Roth transfer (Out), bump the first line to gross (In), confirm balanced, **Done**, **Save**. In the register, confirm the row shows "💼 Paycheck ▶ N split lines" and expands to the lines.

---

## Notes / invariants preserved

- `validateSplits` (`src/accountsModel.js`), the remainder bar, and the Done/confirm flow are unchanged — each line's signed `amount` remains the source of truth; the direction toggle only rewrites that signed value.
- `flattenForReports` and all category/spending/cash-flow summaries are unchanged — they attribute splits per line, never via the parent's main category.
- No schema-version bump and no migration.
