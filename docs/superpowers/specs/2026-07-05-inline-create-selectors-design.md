# Inline "create new" across category-like selectors

**Date:** 2026-07-05
**Branch base:** `feat/fable-redesign`
**Status:** Approved design, ready for planning

## 1. Problem & goal

Today, when a user is entering a transaction, transfer, or account and the option
they want (a category, a transfer type, an account type, an account) doesn't exist
yet, they must abandon what they're doing, go to the relevant management screen,
create the item, then come back. This breaks flow.

**Goal:** let the user create the missing option *right where they're selecting it*,
without leaving the task, and have it auto-selected. This applies to nearly every
"selectable category" in the app.

This serves the north star (Quicken-class power that feels smooth) and the real
audience — a meticulous user who reconciles to the dollar and cares that new items
are correctly configured (so we capture the fields that affect math, defer cosmetic
ones to Manage).

## 2. Locked decisions (from brainstorming)

1. **Creation UX = nested quick editor ("A").** A small dialog opens *on top of* the
   current editor, captures only the essentials, saves, and auto-selects the result.
   The user never leaves the in-progress task. Advanced fields (keywords,
   sub-categories, color, layout, group) stay in the existing Manage screens.
   - Rejected: redirect-to-tab-then-Back (needs fragile in-progress-state
     preservation across tab switches, per selector); one-tap-no-form (too little
     control for a meticulous user).
2. **Scope = all six selectors**, split into three phases (see §3).
3. **Plain `<select>` handling = hybrid.** Upgrade the transfer **Type** selector to
   the searchable `CategoryPicker` (type-to-create; also advances the deferred
   "transfer searchable pickers" idea). Keep the register **category filter** a plain
   `<select>` with an added "＋ New category…" item (creating-to-filter is rare and it
   needs "All categories" semantics).
4. **Sub-category affordance = anchored "＋ sub" on parent rows** ("A", not the unified
   footer). The picker's list stays calm; sub-creation is a deliberate action on a
   visible parent row.

## 3. Phase decomposition

One design doc; three independently shippable phases implemented with checkpoints.

| Phase | Selectors | Registry | New `add*` needed? |
|---|---|---|---|
| **1 — Categories everywhere** | transaction category picker (incl. sub-categories), transfer **Type**, register category filter | categories | reuse `addCategory`, `addSub` |
| **2 — Account types** | New/Edit account **Type** select | account-types | reuse `addType` |
| **3 — New account inline** | transfer **From/To** pickers (reusable for any account picker) | accounts | reuse existing account-add flow |

Recommended order: 1 → 2 → 3 (Phase 1 delivers the bulk of the value; 2 and 3 are
smaller and independent).

## 4. The shared move (applies to every phase)

1. User triggers "create" from a selector (via search-driven footer, a "＋" affordance,
   or a "＋ New…" option).
2. A **nested quick dialog** opens over the current editor (reuses `.dialog-overlay` /
   `.dialog-card`), pre-filled where possible (e.g. name = current search text),
   focused, capturing only essentials.
3. On submit it calls an **App-provided handler** that wraps the existing hook in
   `pushHistory()` — identical to the Manage-screen wiring at `App.jsx:555`/`:563` — so
   persistence (localStorage) and single-step Undo come for free.
4. The `add*` hook returns the new `id` synchronously (`addCategory`, `addSub`,
   `addType` already `return id`). The caller **auto-selects** that id.
5. Cancel closes the quick dialog and returns to the untouched host editor.

## 5. Phase 1 — Categories everywhere (detailed)

### 5.1 `QuickCreateCategory` (new component)

A small nested dialog. Props:

| Prop | Purpose |
|---|---|
| `initialName` | Prefill the Name field (from the picker's search text). |
| `flow` | Default flow for the new category. |
| `lockFlow` | When `true`, hide the flow selector and force `flow` (used by the transfer picker → always `'transfer'`). |
| `onSubmit({ name, icon, flow })` | Caller creates + selects; returns nothing. |
| `onCancel()` | Dismiss. |

Fields rendered:
- **Name** — text, prefilled from `initialName`, auto-focused, trimmed on submit.
- **Icon** — reuses `IconPicker`; default `📋`.
- **Flow** — segmented/`<select>` of Income / Expense / Savings; hidden when `lockFlow`.

Not in the quick form (defaulted, tuned later in Manage): color (`#6B7280`), keywords,
templates, sub-categories.

Submit is disabled when the trimmed name is empty. Color is fixed to the default here.

### 5.2 `CategoryPicker` enhancements

New optional props (all backward-compatible — existing call sites unaffected when omitted):

| Prop | Behavior |
|---|---|
| `onCreateCategory({ name, icon, flow }) => id` | Enables the "＋ New category 'X'" footer, shown when the query is non-empty and has no exact name match. Opens `QuickCreateCategory` (prefilled `initialName = query`, `flow = createFlow`). On submit, calls this, then selects `{ categoryId: id, subId: null }`. |
| `createFlow` | Flow passed to `QuickCreateCategory` (default `'expense'`). |
| `lockCreateFlow` | Passes through to `QuickCreateCategory.lockFlow` (transfer picker sets this). |
| `onCreateSub(parentId, { name }) => subId` | Enables a small "＋ sub" button on each **parent** (top-level) row. Clicking reveals an inline one-field form ("New sub-category under <Parent>"); submit calls this and selects `{ categoryId: parentId, subId }`. |
| `allowNone` / `noneLabel` | Renders a persistent "— None —" option at the top of the list that selects `{ categoryId: null, subId: null }`. Default off; transfer picker turns it on. |

The picker may also be fed a **pre-filtered category list** (e.g. only `flow === 'transfer'`
for the transfer picker). `flattenForPicker` already groups whatever list it's given.

Notes:
- The "＋ sub" affordance appears only on top-level rows, not on `is-sub` rows.
- Only one inline sub-form is open at a time; Escape/blur closes it.
- "No matches" + the create footer coexist (footer is the actionable path when empty).

### 5.3 Wiring

- **TransactionEditor** (`CategoryPicker` at `TransactionEditor.jsx:112`):
  pass `onCreateCategory`, `onCreateSub`, and `createFlow` derived from the editor's
  `direction` state (`out → 'expense'`, `in → 'income'`; `savings` is not auto-inferred
  but is selectable in the quick form).
- **TransferEditor** (Type `<select>` at `TransferEditor.jsx:115-120`):
  replace with `CategoryPicker` fed the transfer-flow-only list (`transferCats`),
  `allowNone` + `noneLabel="— None —"`, `createFlow="transfer"`, `lockCreateFlow`.
  Preserves current "None" and the `typeTouched`/auto-suggest behavior
  (`onTypeChange`).
- **Register** (filter `<select>` at `Register.jsx:123-130`):
  add a sentinel `<option value="__new_category__">＋ New category…</option>`. On select,
  open `QuickCreateCategory` (default `flow='expense'`, not locked); on submit, create
  and set the filter to the new id. (A brand-new category filters to an empty list —
  expected and acceptable.)

- **App** (`App.jsx`): pass down, to `TransactionEditor`, `TransferEditor`, and
  `Register`:
  - `onAddCategory = (p) => { pushHistory(); return cats.addCategory(p); }`
  - `onAddSub = (catId, opts) => { pushHistory(); return cats.addSub(catId, opts); }`
  (Same wrappers already used for the Manage screen.)

### 5.4 Phase 1 acceptance criteria (TDD targets)

- `QuickCreateCategory`: renders Name/Icon/Flow; `lockFlow` hides Flow; Add invokes
  `onSubmit` with trimmed name + chosen icon + flow; empty name disables Add; Cancel
  invokes `onCancel`.
- `CategoryPicker`:
  - With a non-empty query and no exact match, the "＋ New category 'X'" footer shows;
    completing the quick form calls `onCreateCategory` and selects the returned id.
  - Each parent row shows "＋ sub"; using it calls `onCreateSub(parentId, {name})` and
    selects `{categoryId: parentId, subId}`.
  - `allowNone` renders "— None —" and selecting it emits `{categoryId: null}`.
  - Existing selection/search/keyboard behavior is unchanged when the new props are omitted.
- `TransferEditor`: Type is a picker; creating a transfer type selects it; "— None —"
  works; auto-suggested type still applies when To changes and the user hasn't touched Type.
- `Register`: the "＋ New category…" option opens the dialog, creates a category, and
  sets the active filter to it.
- Integration: an inline-created category persists via `addCategory` and is reverted by
  a single Undo.

## 6. Phase 2 — Account types (sketch)

- New `QuickCreateAccountType` nested dialog. Essentials: **Label**, **Icon**, **Class**
  (asset / liability / offsheet — affects net-worth math, so the user sets it). Defaults:
  `layout='compact'`, `group='Unassigned'` (tuned later in the Account Types screen).
- **AccountEditor** (Type `<select>` at `AccountEditor.jsx:35-39`): add a "＋ New type…"
  path (sentinel option or adjacent button) that opens the dialog; on submit, create via
  `onAddType` and select the new id.
- **App**: `onAddType = (p) => { pushHistory(); return accountTypes.addType(p); }`.
- Acceptance: dialog validates/creates; AccountEditor selects the new type; persists +
  single-step Undo.

## 7. Phase 3 — New account inline (sketch)

- Accounts are heavier (name, type, icon, opening balance) and the existing
  `AccountEditor` is already compact, so **reuse `AccountEditor` as the nested dialog**
  rather than build a new form.
- **TransferEditor** From/To pickers: add a "＋ New account…" path that opens
  `AccountEditor` (create mode) over the transfer; on save, create via the App account-add
  flow and select the new account id in the originating From/To field.
- **App**: reuse the existing `saveAccount` path (already `pushHistory`-wrapped) adapted
  to return the new id for selection.
- Acceptance: creating an account from From or To selects it in that field; persists +
  Undo; the transfer's other field is untouched.

## 8. Out of scope / deferred

- Turning the transfer **From/To** selects into searchable pickers (only "＋ New account"
  is added in Phase 3; the full searchable-picker upgrade remains a separate deferred item).
- Editing existing items inline (this is create-only; edits stay in Manage).
- Bulk creation, import, or reordering.
- Color / keyword / template capture in any quick form.

## 9. Risks & mitigations

- **CategoryPicker complexity creep** — several new optional props. Mitigation: keep them
  optional and independently testable; existing call sites stay untouched.
- **Transfer picker regression** — replacing the `<select>` must preserve None + the
  auto-suggest-on-To behavior. Mitigation: explicit tests for both before/after.
- **Modal-on-modal** stacking / focus / Escape ordering. Mitigation: quick dialog uses the
  existing overlay pattern; Escape closes the quick dialog first, then the host.

## 10. Testing strategy

Inline TDD by Claude (not subagents), per the user's workflow, with a checkpoint at the
end of each phase. Each new component and each wiring change lands with unit tests
(Vitest + Testing Library) matching the acceptance criteria above; the full suite
(currently 1011 tests) stays green at every checkpoint.
