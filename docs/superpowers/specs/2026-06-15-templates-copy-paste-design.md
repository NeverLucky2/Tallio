# Split blank-amount fix + Entry templates + Copy/Paste

**Date:** 2026-06-15
**Status:** Approved design, pending implementation plan
**Branch:** `feat/fable-redesign` (or a fresh feature branch off it)

## Summary

Three changes, shipped together because two of them share a foundation:

1. **Bug fix** — a freshly added split line shows a literal `0` in its amount box; it
   should be a blank box, matching the new-transaction / new-transfer fields.
2. **Templates** — save any transaction or transfer (split or single-category) as a
   named, reusable template, then apply it to pre-fill a new entry.
3. **Copy / Paste** — copy any entry to a single-slot clipboard and paste it (instantly,
   today's date) into the selected account, repeatedly. Restores a feature lost in the
   account-centric layout refactor. Primary use case: a Zelle deposit from the same
   person several times a month.

Templates and Copy/Paste both need the same primitive — a reusable, account-agnostic
snapshot of an entry. That primitive (`entryDrafts.js`) is built once and tested in
isolation; both features layer on top.

## Goals / Non-goals

**Goals**
- Blank amount box for new/zero split lines, with correct partial-number typing.
- Named template library for transactions and transfers, persisted locally.
- Single-slot copy/paste clipboard, persisted locally, with instant paste.
- Templates included in the export/import backup archive.

**Non-goals (YAGNI)**
- Keyboard shortcuts (Ctrl+C/V) and row selection state — kebab + buttons only.
- Multi-slot clipboard / paste history.
- Template categories, folders, ordering, or rename (delete + re-save covers it).
- Templating the *transfer-type* split line edge case beyond best-effort preservation
  (see Edge cases).

## Component 1 — Split blank-amount fix (`SplitsEditor.jsx`)

### Current behaviour
- New lines are seeded with `amount: 0` (`+ Add line`, and `TransferEditor.openSplits`'s
  second line).
- The amount cell renders `value={Math.abs(line.amount)}` → displays `0`.
- New transaction / transfer amount fields instead start from `''` (blank box).

### Change
Track a per-line raw input string in a new `amountDrafts` map (id → string), parallel to
the existing `dirs` and `targets` maps. This is the same pattern `TransactionEditor` uses
(a string `magnitude` state separate from the computed number) and it fixes a latent
typing bug as well.

- **Display:** `amountDrafts.has(line.id) ? amountDrafts.get(line.id) : (line.amount ? String(Math.abs(line.amount)) : '')`.
  A zero/absent amount with no draft renders blank.
- **onChange:** store the raw string in `amountDrafts` *and* update the numeric magnitude
  via the existing `setLineMagnitude(parseFloat(value) || 0)`. Storing the raw string lets
  the user type intermediate values like `0.` and `0.05` without the controlled input
  snapping back (the current `value={Math.abs(line.amount)}` breaks this).
- No change to the persisted split shape — `amountDrafts` is editor-local UI state only.
- The fix is in `SplitsEditor`, so it covers both the transaction and transfer split flows.

### Tests
- Adding a line renders an empty amount input (not `"0"`).
- Typing `0.05` into a line results in `amount === 0.05` (regression guard for the
  controlled-input snap-back).
- Existing non-zero amounts still render their value.

## Component 2 — Entry-draft core (`entryDrafts.js`, new pure module)

The shared snapshot primitive. Pure, no React, fully unit-tested.

### Draft shape
```js
// transaction
{ kind: 'transaction', payload: {
    description, amount,            // signed number (sum of splits when split)
    categoryId, subId,
    payee, checkNumber,
    splits,                        // array | null; line ids stripped, see below
} }

// transfer
{ kind: 'transfer', payload: {
    fromId, toId, amount,          // amount = positive magnitude
    categoryId, description,
    splits,                       // source-leg splits | null
} }
```
`id`, `date`, and entry-specific binding are **not** stored. For split lines, the
per-line `id` and any `transferId` are stripped; a transfer-type split line keeps its
target account id as `targetId` on the line so the split-targets map can be rebuilt.

### Functions
- `draftFromTransaction(txn)` → transaction draft.
- `draftFromTransfer(pair)` → transfer draft, reading `pair.fromLeg` / `pair.toLeg`
  (the shape returned by `resolveTransfer`).
- `instantiateTransaction(draft, { account, typesById, date })` → an object **identical
  in shape to `TransactionEditor.save()`'s output**: `{ accountId, date, amount,
  categoryId, subId, description, payee, checkNumber, splits, splitTargets? }`. Fresh
  split-line ids are generated; `splitTargets` is rebuilt from each line's `targetId`;
  `payee`/`checkNumber` are included only when `layoutFor(account.type, typesById)`
  is `'bank'`, else `null`.
- `instantiateTransfer(draft, { date })` → an object identical to
  `TransferEditor.save()`'s output: `{ fromId, toId, amount, date, description,
  categoryId, splits?, splitTargets? }`.
- `labelFor(draft)` → a short human label for the paste button / template default name
  (payee, else description, else `"Transfer → <toId-name>"` resolved by the caller).

Because `instantiate*` emit exactly what the editors emit, paste routes through the
existing `App.saveTransaction` / `App.saveTransfer` (history push + ledger add) with no
new ledger code, and template-apply can pre-fill the editors directly.

### Tests
- Round-trip: `draftFromTransaction(instantiate…)` preserves category, amount, payee,
  description, splits structure.
- New split-line ids differ from the source; sum still equals `amount`.
- `date` defaults to today (injected, not `new Date()` inside, for testability).
- Payee/check dropped when target account is non-bank; kept when bank.
- Transfer draft/instantiate round-trip preserves from/to/amount/category.

## Component 3 — Copy / Paste clipboard

### `useClipboard` hook (new)
- Single slot, persisted to `localStorage['tallio-clipboard']`. Same load/persist/error
  pattern as `useReportAcks` (synchronous persist on change, storage-error surface).
- API: `{ clipboard, copy(draft, label), clear() }` where `clipboard` is
  `{ draft, label } | null`.

### Wiring (`App.jsx`)
- `copyEntry(row)` — resolve transfer pair via `resolveTransfer`; build the right draft;
  store with a label; **flash a confirmation toast** (`Copied "<label>"`).
- `pasteEntry()` — instantiate against the **currently selected account** (transactions)
  or the draft's own from/to (transfers) with today's date, then route through
  `saveTransaction` / `saveTransfer`. Does **not** clear the clipboard (repeatable).

### Transient toast (new, shared)
The existing toasts (`migrationBanner`, `storageError`) use the base `.toast` class but
are persistent (manual `×` dismiss). Copy needs *transient* feedback because the result
lands on an invisible clipboard. Add a minimal flash-toast mechanism in `App.jsx`:
- `flashToast(message)` sets a `toast` state string and auto-clears it after ~2s via a
  `setTimeout` (cleared on unmount / replaced on re-flash).
- Rendered with the existing `.toast` base style (gold accent, the non-error variant) —
  no manual dismiss button.
- Reused for the other "did something invisible" confirmations: **Copied "<label>"**,
  **Duplicated**, and **Saved template "<name>"**. (Paste needs none — the new row is
  visible.)

### UI (`Register.jsx` header actions)
- A **Paste** button rendered only when `clipboard` is non-null:
  `⎘ Paste "<label>"` plus a small `×` to `clear()`.
- Sits next to `+ New entry` / `⇄ Transfer`.

### Tests
- `copy` then `paste` adds one new transaction in the selected account, today's date,
  fresh id, same category/amount/description.
- Paste of a transfer recreates between the original two accounts.
- Paste twice → two entries. Clear hides the button.
- Copy flashes a `Copied "<label>"` toast that auto-clears after the timeout.

## Component 4 — Templates

### `useTemplates` hook (new)
- List persisted to `localStorage['tallio-templates']`. Each item:
  `{ id, name, kind, payload, createdAt }`.
- API: `{ templates, addTemplate(name, draft), deleteTemplate(id),
  exportSnapshot(), restore(list) }` (last two for archive round-trip).

### Save as template
- A small `TemplateNameDialog` (text input + Save/Cancel) — reused by every entry point.
  Default name from `labelFor(draft)`.
- Entry points: each editor's action row (**Save as template…**, captures the current
  in-progress draft including unsaved splits) and the row kebab (captures an existing
  entry).

### Apply template
- A **Templates ▾** menu in the register header lists templates; each row applies on
  click and has a `×` to delete. Hidden/disabled when the list is empty.
- Apply **opens the editor pre-filled** (not instant) so amounts stay editable, per the
  chosen behaviour. Implemented with a new `prefill` prop on `TransactionEditor` /
  `TransferEditor`: when there is no `transaction`/`transfer` (new entry), initial field
  state falls back to `prefill?.…`. `isEdit` stays `false` (title "New …", no Delete).
- Transaction templates apply to the selected account; transfer templates use their own
  from/to.

### Tests
- Save creates a template with the given name and a faithful payload.
- Apply opens a *new* (not edit) editor with fields pre-filled; saving adds a new entry.
- Delete removes it from the menu and storage.
- Editor `prefill` seeds fields but leaves `isEdit` false.

## Component 5 — Row kebab menu (`TransactionRow.jsx`)

- Add a trailing actions cell containing the existing `ActionMenu` (⋮) with items:
  **Copy**, **Duplicate** (copy + paste-once into the same account), **Save as template…**.
- The cell wraps interactions in `stopPropagation` so the kebab never triggers the row's
  edit-on-click.
- Add a matching empty `<th>` and bump the empty-state `colSpan` for both the `compact`
  and `bank` layouts.
- Callbacks (`onCopy`, `onDuplicate`, `onSaveTemplate`) thread `Register → TransactionRow`
  from `App.jsx`.

### Tests
- Kebab Copy populates the clipboard; row click still opens the editor.
- Duplicate adds one entry in the same account immediately.
- Save as template opens the name dialog.

## Component 6 — Export templates in the backup archive

- `buildDataJson` / `buildArchive` (`exportArchive.js`) gain an optional `templates`
  field (defaults to `[]`); `App.exportData` passes `templates.exportSnapshot()`. Bump
  `schemaVersion` 4 → 5.
- **No in-app archive import exists today** — `App` only builds the export zip;
  `parseArchive` is the inverse helper but is unwired. So this component covers export
  only. `useTemplates.restore()` is provided for parity with the other hooks (undo +
  any future import), and `parseArchive(bytes).data.templates` surfaces them once a
  caller exists. `buildDataJson` defaults `templates` to `[]`, so older archives load
  unchanged.
- This is the last task and is independently cuttable.

### Tests
- Archive round-trip preserves templates (`buildArchive` → `parseArchive`).
- v4 archive (no templates field) imports without error, templates default to empty.

## Data / storage summary

| Key | Owner | Shape |
| --- | --- | --- |
| `tallio-clipboard` | `useClipboard` | `{ draft, label }` or `null` |
| `tallio-templates` | `useTemplates` | `[{ id, name, kind, payload, createdAt }]` |

Both follow the `useReportAcks` load/persist/storage-error convention.

## Edge cases

- **Transfer-type split lines inside a transaction** — preserved best-effort via the
  line's `targetId`; the rebuilt `splitTargets` map drives counterpart creation through
  the existing ledger path. If a referenced account was deleted, the line falls back to a
  category line (no crash). Covered by a targeted test, not a primary flow.
- **Pasting a bank-style entry into a non-bank account** — `payee`/`checkNumber` dropped
  by `instantiateTransaction` per target layout.
- **Deleted category in a draft** — instantiation keeps the id; the editor/register
  already render unknown categories as "—". No special handling.
- **Storage full** — surfaced through the same toast pattern as `useReportAcks`.

## Testing strategy

Inline TDD (per the established workflow), bottom-up:
1. `entryDrafts.js` pure tests (the core).
2. `SplitsEditor` blank-amount + typing.
3. `useClipboard`, `useTemplates` hook tests.
4. `TransactionRow` kebab + `Register` paste/templates UI.
5. Editor `prefill` + `Save as template…`.
6. Export/import round-trip.
7. An App-level smoke covering copy→paste and save-template→apply.

## Open questions

None — Duplicate-in-kebab, templates-in-archive, and instant-paste are all confirmed.
