# Category editing: explicit Save + sub-category persistence fix — design

Date: 2026-06-07
Status: Approved (pending spec review)
Part of: splits/category fixes batch — **Branch 2 of 3**. Branch 1 (splits-set-amount)
merged to master @b5c9b71. Branch 3 (searchable tree picker + assignable subs) follows.

## Goals

1. **(#5)** Stop sub-categories — and any recent category / report-ack edit — from
   vanishing after a reload or app backgrounding.
2. **(#3)** Give explicit, visible **Save** feedback when adding/editing
   sub-categories, so the user knows the change was saved.

## Problem & root cause

### #5 — disappearing sub-category (root-caused via systematic debugging, reproduced)

`useCategories` persists on a **250 ms debounce** and **cancels the pending write on
unmount**, with **no flush** on `pagehide` / `visibilitychange`. A change made within
250 ms of the page reloading or being backgrounded (routine on a mobile PWA) is silently
dropped. Because it's the *most recent* change that's lost, it presents as "one of the
two sub-categories I just added disappeared."

Reproduced with a test: add "Mike" (let it persist), add "John" <250 ms before a
simulated reload → the reloaded state is `['Mike']` — "John" gone. **`useReportAcks`
(report acknowledgments) has the identical bug.** By contrast `useLedger`,
`useSettings`, and `useAppearance` persist **synchronously** on change and are immune.

### #3 — no save feedback

`SubcategoryEditor` commits the name silently **on blur**, with no confirmation, and
**"+ Add sub-category" instantly creates a placeholder `New sub-category`**. The user
can't tell whether a sub was added or saved, and abandoned placeholders accumulate.

## Decisions (from brainstorming)

- **Persistence:** write **synchronously on change** in both `useCategories` and
  `useReportAcks` (drop the debounce). Matches the codebase's other hooks; chosen over
  "keep debounce + add pagehide/unmount flush" because nothing here produces rapid
  bursts to coalesce (all edits are discrete — name on blur, keyword add, color/icon
  pick, flow radio).
- **Save scope:** explicit Save applies to the **sub-category add/edit flow only**;
  category-level icon/color/flow stay immediate-apply.
- **Add flow:** a new sub is created **only on Save** (no instant placeholder);
  Cancel/Back discards, with a confirm if a name was typed.
- **Edit flow:** a **✓ Saved / Save** indicator reflects the *persisted* state; the name
  still commits on blur as a **silent safety net** so a forgotten Save never loses data.

## Approach

Part A is a small same-shape change per hook (debounced effect → synchronous setItem).
Part B reworks `SubcategoryEditor` into **create** and **edit** modes and lifts a
`creatingSub` flag into `ManageCategoriesScreen`. `useCategories.addSub` already accepts
`{ name }`, so Save-to-create only needs to thread the typed name through `App.jsx`'s
`onAddSub`. Undo wrapping (one `pushHistory()` per op) is unchanged.

## Changes

### Part A — synchronous persistence

1. **`src/useCategories.js`** — replace the debounced persist effect with a synchronous
   write on `[categories]`:
   ```js
   useEffect(() => {
     try {
       localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
       if (storageError !== null) setStorageError(null);
     } catch (e) {
       console.error('Failed to save categories:', e);
       setStorageError({ message: "Couldn't save categories — storage full." });
     }
   }, [categories]); // eslint-disable-line react-hooks/exhaustive-deps
   ```
   Remove `PERSIST_DEBOUNCE_MS`, the `persistTimer` ref, the `setTimeout`, and the
   timer-clearing cleanup.

2. **`src/useReportAcks.js`** — identical change on `[acks]` (remove
   `PERSIST_DEBOUNCE_MS`, the `timer` ref, `setTimeout`, cleanup; keep the try/catch →
   `storageError`).

### Part B — explicit Save for sub-categories

3. **`src/ManageCategoriesScreen.jsx`**
   - Add `const [creatingSub, setCreatingSub] = useState(false);`
   - `handleAddSub` no longer calls `onAddSub` immediately; it sets
     `setCreatingSub(true)` (and `setEditingSubId(null)`).
   - When `creatingSub`, render `SubcategoryEditor` in **create** mode; else when
     `editingSub` is set, render **edit** mode (existing behavior).
   - Create-save handler: `const id = onAddSub(selected.id, { name }); setCreatingSub(false); setEditingSubId(id);`
   - Create-cancel handler: `setCreatingSub(false)` (the editor confirms discard if a
     name was typed — see below).
   - `selectCategory` and the editor's back action clear both `creatingSub` and
     `editingSubId`.

4. **`src/SubcategoryEditor.jsx`** — two modes via a `creating` prop (plus `onCreate`,
   `onCancel`):
   - **Create mode** (`creating` true, no `sub`): empty name input; **Save** disabled
     until `name.trim()` is non-empty; Save → `onCreate(name.trim())`; **Cancel**/Back →
     if a name was typed, `window.confirm('Discard new sub-category?')` before
     `onCancel()`, else `onCancel()` directly. Header reads `{Parent} › (new
     sub-category)`. No keyword section in create mode (added after the sub exists).
   - **Edit mode** (existing, with `sub`): name input; `dirty = name.trim() !== sub.name
     && name.trim().length > 0`. A **status row** shows an enabled **Save** button + an
     "Unsaved changes" hint when `dirty`, and a muted **✓ Saved** indicator when not
     dirty. **Save** → `onUpdate({ name: name.trim() })` and a transient ✓ Saved. The
     existing **commit-on-blur** (`commitName`) is **kept** as a silent safety net (so
     the indicator returns to ✓ Saved after a blur even without clicking Save). Keyword
     `ChipEditor` and Delete are unchanged.

5. **`src/App.jsx`** — thread the name through:
   `onAddSub={(catId, opts) => { pushHistory(); return cats.addSub(catId, opts); }}`
   (today it passes `{}`).

6. **`src/CategoryEditor.jsx`** — **no change**: its "+ Add sub-category" button keeps
   calling the `onAddSub` prop, which `ManageCategoriesScreen` now maps to
   "enter create mode" via `handleAddSub`.

7. **`src/App.css`** — `.sub-save-row` (Save button + indicator layout) and
   `.sub-saved-indicator` (muted ✓) styles. Reuse existing button/error classes.

## Data flow

**Create:** "+ Add sub-category" → create-mode editor → type "Mike" → **Save** →
`addSub(Loan, { name:'Mike' })` (one `pushHistory` / undo step) → synchronous persist →
✓ Saved → editor switches to edit mode on "Mike" (add keywords). Cancel before Save →
nothing added; no orphan placeholder.

**Edit:** open "Mike" → change to "Michael" → status row shows "Unsaved changes" + Save
enabled → **Save** → `updateSub` + synchronous persist + ✓ Saved. **Reload → "Michael"
present** (persistence bug fixed).

## Edge cases

- **Empty/whitespace name:** create Save disabled; edit Save disabled and `commitName`'s
  existing `if (!v) setNameError(...)` guard keeps the prior name.
- **Cancel create with a typed name:** confirm before discarding.
- **Undo:** create = one step (`addSub`), rename = one step (`updateSub`) — unchanged
  `pushHistory` wrapping. Synchronous persist doesn't affect snapshot/restore.
- **storageError** now surfaces synchronously instead of ~250 ms later — no behavior
  change beyond timing.
- **Switching subs / categories while editing:** blur safety-net commits the in-flight
  name first (unchanged from today), so no loss.

## Testing (TDD, inline)

- **`src/useCategories.test.jsx`** — synchronous-persist regression: add two subs across
  a simulated reload (new hook instance reads `localStorage`) → both present. Update the
  existing "allow debounced persistence to flush" expectation (no wait needed now).
- **`src/useReportAcks.test.jsx`** — synchronous-persist regression: set a status, new
  hook instance still sees it without advancing timers.
- **`src/SubcategoryEditor.test.jsx`** — create mode: Save disabled until a name is
  typed; Save calls `onCreate` with the name; Cancel calls `onCancel`; ✓ Saved appears.
  Edit mode: dirty tracking toggles the Save button vs ✓ Saved; Save calls `onUpdate`;
  blur still commits (safety net).
- **`src/ManageCategoriesScreen.test.jsx`** — "+ Add sub-category" enters create mode
  and adds no sub yet; create-save adds the sub and lands in edit mode; create-cancel
  adds nothing.

## Files touched

- `src/useCategories.js`, `src/useCategories.test.jsx`
- `src/useReportAcks.js`, `src/useReportAcks.test.jsx`
- `src/SubcategoryEditor.jsx`, `src/SubcategoryEditor.test.jsx`
- `src/ManageCategoriesScreen.jsx`, `src/ManageCategoriesScreen.test.jsx`
- `src/App.jsx` (thread `onAddSub` name)
- `src/App.css`

## Out of scope / future

- Category-level (name/icon/color/flow) Save buttons — stays immediate-apply.
- Generalizing debounced/synchronous persistence into a shared hook
  (`usePersistentState`) — possible later cleanup; the other hooks are already
  synchronous.
- The "commit only on Save + unsaved-changes modal guard" variant (we chose the
  blur safety-net instead).
- Branch 3 (searchable tree picker + assignable sub-categories).
