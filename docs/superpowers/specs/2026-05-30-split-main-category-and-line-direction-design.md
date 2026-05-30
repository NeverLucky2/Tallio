# Split main-category, per-line direction, and amount-lock fix — design

Date: 2026-05-30
Status: Approved (pending spec review)
Builds on: `2026-05-29-splits-balancing-ux-design.md`

## Problems (user-reported)

1. **Amount locks after opening Split.** Clicking **Split…** on a transaction
   immediately converts it to a split, disabling the amount/direction inputs.
   If you then Cancel out of the split editor, the transaction stays "split"
   (2 seeded lines) and the amount is uneditable until you Cancel/Save the whole
   editor and reopen.
2. **Main category is lost.** When a transaction is split, its category is
   replaced by "▼ N split lines". The user wants the main category (e.g.
   *Paycheck*) to remain visible on the register row and in the editor, with the
   split expander beside it.
3. **No per-line direction control.** Split lines use a raw signed number field.
4. **Can't enter a negative on a 0.** To make a deduction line negative you must
   type a digit first, then prepend "−" — awkward. (#3's toggle solves this.)

## Decisions (from brainstorming)

- **#2 main category source:** the transaction's own `categoryId`, kept through
  the split and editable from the still-visible dropdown. Display/grouping label
  only — reports continue to use the split lines.
- **#3/#4:** each line gets a **− Out / + In** toggle + a positive magnitude
  field; stored `amount = (In ? + : −) × magnitude`. **+ Add line** defaults to
  **− Out**.

## Reconciliation safety (verified)

Every category/spending/cash-flow report routes through `flattenForReports`
(`reportsModel.js:330`), which explodes a split into one virtual row per
category line and **never yields the parent's `categoryId`**. `netWorthByMonth`
is balance-based (category-agnostic). The only function that reads a raw split
parent is `recurringCharges` (`reportsModel.js:186`), which gates on the split
lines. Therefore populating the parent's main category **cannot** double-count
or change any report. `recurringCharges` will be adjusted so split parents are
gated purely on their lines (preserving today's behavior exactly).

## Design

### 1. Amount-lock fix — `src/TransactionEditor.jsx`

Root cause: `openSplits` (lines 34-42) calls `setSplits([...])` eagerly, so
`hasSplits` becomes true on open and persists through Cancel.

Fix: seed into a transient state rather than committing.

- Add `const [pendingSeed, setPendingSeed] = useState(null);`.
- `openSplits`:
  ```js
  const openSplits = () => {
    setPendingSeed(hasSplits ? null : [
      { id: nanoid(8), amount: parentAmount || 0, categoryId, description: '' },
      { id: nanoid(8), amount: 0,                 categoryId, description: '' },
    ]);
    setSplitsOpen(true);
  };
  ```
- Mount: `initialSplits={splits || pendingSeed || []}`.
- `onSplitsDone`: on commit also `setPendingSeed(null)`. (Unsplit path unchanged.)
- `onCancel` of the split editor: `setSplitsOpen(false)` only — `splits` stays
  `null`, so `hasSplits` stays false and the amount stays editable.

`parentAmount` already derives from the form's magnitude/direction when
`!hasSplits`, so the seed's first line equals the bank amount (balanced).
Editing an already-split transaction (`transaction.splits` set) is unchanged.

### 2. Main category on split transactions

**Save — `src/TransactionEditor.jsx:56-69`:** change
`categoryId: hasSplits ? null : categoryId` to `categoryId: categoryId || null`
so a split keeps its main category.

**Editor category field — `src/TransactionEditor.jsx:95-108`:** always render the
category `<select>` (with its flow optgroups); when split, also show the split
indicator + "Edit splits…" beside it; when not split, show the "Split…" button.
Use a `<div className="field">` wrapper (not `<label>`) so the buttons aren't
nested in a label. The select keeps `aria-label="Category"`.

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

**Register row — `src/TransactionRow.jsx:49-61`:** when split, render the main
category cell **and** the chevron together; if the split has no main category
(older data), show just the chevron.

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

This single `categoryCell` feeds both the bank and compact layouts.

**Reports — `src/reportsModel.js`:** `flattenForReports` unchanged. In
`recurringCharges`, change the flow gate so split parents are decided only by
their lines (preserving current behavior regardless of the new main category):

```js
// line ~200
if (isSplitParent ? !splitHasExpenseLine : (flowOf(t, categoriesById) !== 'expense')) continue;
```

Update the now-stale comment. The recurring occurrence's `categoryId`
(`reportsModel.js:209`) will now reflect a split parent's main category instead
of `null` — a display-only improvement; any test asserting `null` there is
updated to expect the main category.

### 3 & 4. Per-line Out/In toggle — `src/SplitsEditor.jsx`

`amount` (signed) stays the single source of truth, so `validateSplits`, the
sum, and the remainder math are untouched. A UI-only direction is layered on:

- Add `const [dirs, setDirs] = useState(new Map());` (lineId → 'in' | 'out').
- `const dirOf = (line) => dirs.get(line.id) ?? (line.amount < 0 ? 'out' : line.amount > 0 ? 'in' : 'out');`
  — sign-derived, with **0 defaulting to 'out'** (so freshly added lines start Out).
- Replace the per-line amount cell (the `<input aria-label="Line amount">`) with a
  direction toggle + a non-negative magnitude field:
  ```jsx
  <td className="right">
    <span className="dir-toggle" role="group" aria-label="Line direction">
      <button type="button" className={`dir-btn${dirOf(line) === 'out' ? ' active' : ''}`} aria-label="Line out"
        onClick={() => setLineDir(line, 'out')}>− Out</button>
      <button type="button" className={`dir-btn${dirOf(line) === 'in' ? ' active' : ''}`} aria-label="Line in"
        onClick={() => setLineDir(line, 'in')}>+ In</button>
    </span>
    <input type="number" step="0.01" min="0" aria-label="Line amount" className="input"
      value={Math.abs(line.amount)}
      onChange={(e) => setLineMagnitude(line, parseFloat(e.target.value) || 0)} />
  </td>
  ```
  where, inside the `lines.map`:
  ```js
  const setLineMagnitude = (line, mag) => updateLine({ amount: (dirOf(line) === 'in' ? 1 : -1) * Math.abs(mag) });
  const setLineDir = (line, dir) => {
    setDirs(prev => new Map(prev).set(line.id, dir));
    updateLine({ amount: (dir === 'in' ? 1 : -1) * Math.abs(line.amount) });
  };
  ```
- **+ Add line** (unchanged code) appends `{ amount: 0, ... }`; `dirOf` → 'out',
  so new lines start Out with a 0 magnitude the user can type into immediately.
- "+ Add remainder as line" and the Done/confirm flow are unchanged — they set a
  signed `amount`, and `dirOf` derives the toggle state from its sign.

## Edge cases

- **Zero-magnitude direction stickiness:** because `dirs` records an explicit
  override, toggling In/Out on a 0 line sticks; the next magnitude typed takes
  that sign.
- **Older split data with no main category:** register shows just the chevron;
  editor shows the select defaulted to its current value (categoryId may be
  empty → first option). No crash.
- **Transfer lines:** unaffected by the direction toggle's category logic; the
  toggle still sets the line's signed amount (a transfer line can be in or out).
- **parentAmount while seeding (bug fix):** derived from the form, so the seed is
  balanced and the remainder bar reads "✓ Balanced" on open.

## Files touched

- `src/TransactionEditor.jsx` — pendingSeed bug fix; keep categoryId on save;
  category field shows select + split indicator together.
- `src/TransactionEditor.test.jsx` — new tests.
- `src/TransactionRow.jsx` — main category + chevron in the split cell.
- `src/TransactionRow.test.jsx` — new tests.
- `src/SplitsEditor.jsx` — per-line direction toggle + magnitude field.
- `src/SplitsEditor.test.jsx` — new tests; adjust the amount-typing test for the
  magnitude field.
- `src/reportsModel.js` — `recurringCharges` line-based gate for split parents.
- `src/reportsModel.test.js` — adjust/extend recurring tests as needed.
- `src/App.css` — styles for `.txn-split-cat` (category + chevron spacing) and
  the per-line `.dir-toggle` inside the split table.

## Test plan (TDD, inline, checkpoints)

**TransactionEditor:**
- Opening Split then Cancel leaves the transaction unsplit and the amount input
  enabled (the bug).
- Opening Split then Done commits the splits (amount becomes derived/disabled).
- Saving a split transaction keeps `categoryId` (not null).
- When split, the category `<select>` is still rendered and editable, alongside
  the "Edit splits…" control.

**TransactionRow:**
- A split row with a main category renders both the category name and the
  "N split lines" chevron.
- A split row without a main category renders just the chevron (no crash).

**SplitsEditor:**
- A line with a negative amount shows **Out** active; magnitude field shows the
  absolute value.
- Clicking **In** on a line flips the committed amount's sign in the `onDone`
  payload (magnitude preserved).
- Typing a magnitude into a freshly added (Out-default) line yields a negative
  amount.
- Remainder bar / Done flow still balance using signed amounts.

**reportsModel:**
- `recurringCharges` detection for a split parent is unchanged when its main
  category is populated (gate is line-based); spending/cash-flow summaries are
  unchanged (still per-line via `flattenForReports`).
