# BillTracker — Account-to-Account Transfers (Phase 2)

**Date:** 2026-05-20
**Status:** Approved for planning
**Branch context:** Builds on the Phase-1 accounts revamp and the custom-account-types work (branch `worktree-accounts-revamp-phase-1`, off `master`). Phase 1 is not yet merged; this feature depends on its code (`useLedger.js`, `accountsModel.js`, `Register.jsx`, `TransactionRow.jsx`, `TransactionEditor.jsx`, `App.jsx`, `exportArchive.js`) and continues on the same branch as separate commits.

## Overview

Let a user move money between two accounts as a single **transfer** rather than two unrelated transactions. A transfer is modeled as a **linked pair** of transactions sharing one `transferId`: a negative leg on the source account and a positive leg on the destination account. The `transferId` field already exists on every transaction (defaults `null`) but nothing creates or consumes it yet — this phase makes it real.

The feature is **additive**: existing transactions (`transferId: null`) behave exactly as before, no schema-version bump, no account/transaction migration.

## Goals

- Create a transfer from a dedicated dialog with explicit **From** / **To** pickers.
- Keep the two legs **in sync** on edit and **delete them together**, with a single undo step reverting the whole pair.
- Display each leg clearly in the register as a transfer (direction + counterpart account name), distinct from ordinary income/expense.
- Keep transfers **out of category/spending math** (legs have no category) while preserving correct per-account balances and net-worth roll-ups.
- Preserve Phase 1 structure: pure, independently-tested logic in `accountsModel.js`; pair operations owned by `useLedger`; focused components; back-compatible signatures.

## Non-Goals

- Reports (Phase 3) remain out of scope.
- No new "Transfer" category, pseudo-category, or reuse of the existing "Brokerage Transfer" spending category.
- No multi-leg / split transfers (always exactly two legs).
- No scheduled/recurring transfers.
- No sorting/filtering/searching by counterpart account name (transfer legs are uncategorized for sort/filter; the chip is display-only — see "Sort / filter / search scope").
- No archive-**import** path is added (none exists today); "round-trip" here means the export representation is correct, verified by test.

---

## Data model (stays schema v4)

A transfer is two transactions that share a non-null `transferId` (a `nanoid(8)`):

| Field | From (source) leg | To (destination) leg |
|---|---|---|
| `accountId` | `fromId` | `toId` |
| `amount` | `−mag` (negative) | `+mag` (positive) |
| `categoryId` | `null` | `null` |
| `date` | shared | shared |
| `description` | shared | shared |
| `payee` / `checkNumber` | `null` | `null` |
| `transferId` | same id | same id |

- `mag` is a positive magnitude. The two legs always sum to zero.
- The transaction object shape is **unchanged** — `transferId` already exists. No migration, no `schemaVersion` change.
- `From ≠ To` is enforced by the editor (Save disabled otherwise); the ledger does not crash if given equal ids but the UI prevents it.
- **Any account may be an endpoint** (on-sheet or off-sheet: bank, investment, credit_card, loan, mortgage, person, untyped).

---

## Ledger API — `useLedger.js`

Three new methods own the balanced-pair invariant. Each performs a single `setTransactions` update so the operation is atomic and snapshot-friendly. They follow the existing `addTransaction`/`updateTransaction`/`deleteTransaction` conventions (return ids, coerce numbers, no internal history — `App` wraps each call with one `pushHistory()`).

```
addTransfer({ fromId, toId, amount, date, description }) → transferId
  // mints a transferId, appends both legs in one setTransactions, returns the id.

updateTransfer(transferId, { fromId, toId, amount, date, description })
  // finds the (≤2) legs with this transferId and rewrites them in place,
  // preserving each leg's transaction id. One leg becomes the From leg
  // (accountId=fromId, amount=-mag), the other the To leg (accountId=toId,
  // amount=+mag). Both get the new date/description, categoryId stays null.
  // Endpoints may be repointed to different accounts.

deleteTransfer(transferId)
  // removes every transaction whose transferId === transferId.
```

- `amount` is coerced to a positive magnitude (`Math.abs(Number(...)) || 0`); legs are signed by the method, not the caller.
- `updateTransfer` maps the existing pair so transaction ids are stable (better for React keys and any future references). If only one leg is found (a previously-orphaned leg), it updates that one and leaves the link as-is — an edge case the editor will not normally reach because orphaned legs open in `TransactionEditor`, not `TransferEditor`.
- `deleteAccount` is **unchanged**. Deleting an account still removes only its own rows; the counterpart leg on a surviving account is kept (its balance stays correct because the money really moved) and its now-dangling `transferId` is harmless — see resilient display below.
- `snapshot`/`restore` are unchanged; they already capture/replace the whole `transactions` array.

---

## Model helpers — `accountsModel.js` (pure)

```
transferCounterpart(leg, transactions) → transaction | null
  // the other transaction with the same (non-null) transferId and a different
  // id; null if leg has no transferId or no partner is found (orphan).

transferInfo(leg, transactions, accountsById) → { counterpartName, direction } | null
  // null when the leg is not a resolvable transfer (no transferId, or orphan,
  // or counterpart account missing from accountsById → render as a plain row).
  // direction = 'out' when leg.amount < 0 (money left this account → arrow →,
  // counterpart is the destination), 'in' when leg.amount >= 0 (arrow ←).
  // counterpartName = the counterpart account's name.
```

- `householdTotals` is **unchanged** — it already nets asset + liability balances, so an on-sheet→on-sheet transfer leaves `netWorth` constant automatically. A dedicated test asserts this neutrality.
- `accountBalance` / `computeRegister` are unchanged; transfer legs are ordinary signed amounts to them, so per-account balances and running balances are already correct.

---

## UI

### `TransferEditor.jsx` (new)

A dialog modeled on `TransactionEditor.jsx`.

**Props:** `{ accounts, fromAccountId = null, transfer = null, typesById = DEFAULT_ACCOUNT_TYPES_BY_ID, onSave, onDelete, onClose }`
- `accounts` — full account list for both pickers.
- `fromAccountId` — preselects the From picker in *new* mode (defaults to the currently-selected account).
- `transfer` — in *edit* mode, the resolved pair: `{ transferId, fromLeg, toLeg }` (or equivalent). Used to seed fields.

**Fields:** From `<select>`, To `<select>` (both list all accounts), Date, Amount (positive magnitude), Notes (description). No direction toggle, no category, no payee/check.

**Validation:** Save is enabled only when From and To are both set, **From ≠ To**, and amount > 0.

**Edit seeding:** From = the negative leg's account, To = the positive leg's account, Amount = `|amount|`, Date/Notes from either leg. A **Delete** button appears in edit mode.

**onSave payload:** `{ transferId?, fromId, toId, amount, date, description }` — `transferId` present ⇒ update, absent ⇒ create. **onDelete:** called with the `transferId`.

### `Register.jsx`

- New prop `accounts` (to resolve counterpart names; build `accountsById` once).
- Header gains a **`⇄ Transfer`** button next to `+ Add transaction`, calling new prop `onTransfer(account.id)`.
- For each row, compute a transfer annotation via `transferInfo(row, transactions, accountsById)` and pass it to `TransactionRow` (e.g. `transfer={...}`). `null` for non-transfer / orphan rows.
- Sort/filter pipeline is unchanged (see scope note below).

### `TransactionRow.jsx`

- New optional prop `transfer = null`.
- When `transfer` is set, the **Category cell** renders a chip instead of the category:
  - `direction === 'out'` → `⇄ → {counterpartName}`
  - `direction === 'in'`  → `⇄ ← {counterpartName}`
  - The `⇄` glyph (and any emoji) is wrapped in its own `<span aria-hidden>` so text-label test queries still match the account name.
- The amount keeps its sign and normal formatting; in **bank** layout the signed amount still falls into the Payment (negative) or Deposit (positive) column.
- When `transfer` is `null` (ordinary or orphaned leg), the row is **unchanged** from today.

### `App.jsx`

- New state `editingTransfer` (`null` | `{ mode:'new'|'edit', fromAccountId?, transfer? }`).
- The `⇄ Transfer` button opens `editingTransfer` in **new** mode with `fromAccountId = selectedAccountId`.
- **Row-click branching:** the register's edit handler inspects the clicked transaction. If its `transferId` resolves to a real pair (counterpart found), open `TransferEditor` in **edit** mode seeded with that pair; otherwise open `TransactionEditor` as today (this also covers orphaned legs → plain editor).
- Handlers (each wraps a single `pushHistory()` so one undo reverts the whole pair):
  ```
  saveTransfer(data):   pushHistory();
                        data.transferId ? ledger.updateTransfer(data.transferId, data)
                                        : ledger.addTransfer(data);
                        setEditingTransfer(null);
  deleteTransfer(id):   pushHistory(); ledger.deleteTransfer(id); setEditingTransfer(null);
  ```
- Pass `accounts={ledger.accounts}` and `onTransfer={openTransfer}` to `Register`; render `<TransferEditor>` when `editingTransfer` is set.

---

## Export — `exportArchive.js`

- **CSV:** append a trailing column `transfer`. `CSV_HEADER` becomes:
  `date,account,description,amount,category,flow,payee,check,transfer`
  - For a **transfer leg** (its `transferId` resolves to a counterpart): `transfer` = counterpart account name; `category` = blank; `flow` = blank (transfers are not income/expense).
  - For a **normal row** (and orphaned legs whose counterpart can't be resolved): `transfer` = blank; `category`/`flow` behave exactly as today.
  - Existing columns keep their positions, so the change is purely additive.
- **`data.json`:** no code change — it already serializes full transaction objects, so `transferId` round-trips on both legs. A test asserts this explicitly.

---

## Sort / filter / search scope (explicit YAGNI)

Transfer legs have `categoryId = null`, so:
- **Sorting** by Category treats them as uncategorized (empty → sorts last ascending), same as any null-category row. The transfer chip does not change sort order.
- **Filtering** by category never matches a transfer leg (it has no category).
- **Search** matches a transfer leg by its note (`description`) and amount, **not** by counterpart account name.

This is intentional for this phase and can be revisited later.

---

## Edge cases (resolved)

- **From === To:** prevented in the editor (Save disabled). Ledger does not crash if it happens.
- **Orphaned leg** (counterpart deleted via `deleteAccount`): kept with correct balance; `transferInfo` returns `null` so it renders as a plain row; clicking it opens `TransactionEditor`; CSV `transfer` column is blank for it. Dangling `transferId` is harmless.
- **Repointing endpoints on edit:** allowed. If an edit moves a leg between an on-sheet and an off-sheet account, net worth changes accordingly — correct and expected.
- **Off-sheet ↔ off-sheet or on-sheet ↔ off-sheet transfers:** allowed; net-worth neutrality is only guaranteed (and tested) for on-sheet ↔ on-sheet.

---

## Testing (TDD, mirroring Phase 1)

Each written test-first:

- **`useLedger.test.jsx`** — `addTransfer` appends two correctly-signed legs sharing one `transferId` and returns it; `updateTransfer` rewrites both legs in place (ids stable), reflects new amount/date/notes, and repoints endpoints; `deleteTransfer` removes both legs; `deleteAccount` leaves the counterpart leg intact (balance preserved).
- **`accountsModel.test.js`** — `transferCounterpart` (found / null / orphan); `transferInfo` (out vs in direction, counterpart name, null for non-transfer/orphan/missing account); **net-worth neutrality**: an on-sheet→on-sheet transfer leaves `householdTotals().netWorth` unchanged; an on-sheet→off-sheet transfer reduces it.
- **`TransferEditor.test.jsx`** — renders From/To/Date/Amount/Notes; Save disabled when From===To, when amount ≤ 0, or when an endpoint is missing; Save emits the correct payload (new vs edit with `transferId`); edit mode seeds From/To/amount from the pair; Delete fires with the `transferId`.
- **`Register.test.jsx`** — `⇄ Transfer` button calls `onTransfer` with the account id; a transfer row shows the chip with counterpart name and the correct direction arrow; an orphaned/normal row shows no chip.
- **`TransactionRow.test.jsx`** — given a `transfer` prop, the Category cell renders the chip (out → / in ←); without it, the row is unchanged; bank layout still routes the signed amount to Payment/Deposit.
- **`App` / smoke** — clicking a transfer leg opens `TransferEditor` (not `TransactionEditor`); clicking a normal leg opens `TransactionEditor`; saving/deleting a transfer is a single undo step. (Exact harness TBD during implementation, consistent with `__smoke__/setup.test.jsx`.)
- **`exportArchive.test.js`** — CSV gains the `transfer` column (counterpart name on legs, blank elsewhere; blank category/flow on legs); `data.json` preserves `transferId` on both legs.

## Implementation order

1. **Ledger pair methods** (`addTransfer`/`updateTransfer`/`deleteTransfer`) — pure-ish, fully unit-tested first.
2. **Model helpers** (`transferCounterpart`, `transferInfo`) + net-worth-neutrality test.
3. **`TransferEditor`** component (render, validation, payload, edit seeding, delete).
4. **Register + TransactionRow** display (button, per-row annotation, chip).
5. **`App` wiring** (state, `⇄ Transfer` button, row-click branching, save/delete handlers with `pushHistory`).
6. **Export** CSV column + `data.json` round-trip test.

Stop for review between logical milestones (suggested checkpoints: after step 2, after step 5, after step 6).

## Resolved decisions (from brainstorming)

- **Creation/edit UX:** dedicated `TransferEditor` dialog launched from a `⇄ Transfer` button in the register header; From/To pickers (From defaults to the selected account).
- **Category:** none — both legs have `categoryId = null`; transfers stay out of category/spending math; "Brokerage Transfer" remains a separate ordinary category.
- **Endpoints:** any account → any account; From ≠ To; net-worth neutrality holds and is tested for on-sheet ↔ on-sheet only.
- **Edit/delete:** full sync of both legs; endpoints repointable on edit; delete removes both legs; single-snapshot undo reverts the whole pair.
- **Register display:** transfer chip in the Category cell — `⇄ → {to}` (out) / `⇄ ← {from}` (in); amount keeps its sign.
- **Account deletion:** keep the surviving counterpart leg; resilient display renders an unresolvable leg as a plain row; dangling `transferId` left harmless.
- **CSV export:** add a `transfer` column (counterpart name); transfer legs get blank category and blank flow; `data.json` already round-trips `transferId`.

## Open items to finalize during implementation

- Exact prop shape for the resolved pair handed to `TransferEditor` in edit mode (`{ transferId, fromLeg, toLeg }` vs the two raw transactions) — lean: pass the resolved pair object.
- Whether `Register` passes the precomputed `transfer` annotation per row, or passes `accountsById` + `transactions` down so `TransactionRow` computes it — lean: precompute in `Register` to keep the row dumb.
- Exact App-level test harness for the row-click branching (mirroring `__smoke__/setup.test.jsx`).

---

## Addendum (2026-05-20) — grouped pickers & color-coded legs

Two UX refinements approved after the core feature was wired (commits through `8b53959`).

### Grouped account pickers

The `TransferEditor` From/To `<select>`s group accounts by their account-type **group**, using `<optgroup label="…">` headers in the **same order as the sidebar** (`groupOrder(types)`), accounts listed under each. `<optgroup>` labels are inherently non-selectable, so a group acts as a label only — exactly the requested behavior. Empty groups are omitted. Accounts whose type id is unknown fall under the fallback `Unassigned` group.

- New pure helper `groupAccounts(accounts, types, typesById) → [{ group, accounts }]` in `accountsModel.js`, in `groupOrder` order, empty groups filtered out.
- `TransferEditor` gains optional props `types` (ordered array, default `DEFAULT_ACCOUNT_TYPES`) and `typesById` (default `DEFAULT_ACCOUNT_TYPES_BY_ID`); `App` passes `accountTypes.types` / `accountTypes.typesById`.

### Color-coded transfer legs (by counterpart money-class)

A transfer leg's chip is tinted by the **counterpart account's money-class** — `asset` (green), `liability` (red), `offsheet` (purple) — so you can see "what kind" of account each transfer touches. Each leg is colored by *its own* counterpart's class (the outgoing and incoming legs may differ). Color shows **on the chip pill** only; normal rows are unchanged.

- `transferInfo(leg, transactions, accountsById, typesById)` gains a `counterpartClass` field (= `accountClass(counterpartAccount.type, typesById)`); `typesById` is optional (defaults via `accountClass`).
- `TransferChip` adds a modifier class `txn-transfer--{class}`; `App.css` maps the three classes to the existing `--green` / `--red` / `--purple` palette (`-dim` background, `-border` border).
- `Register` passes its `typesById` into `transferInfo`.

### Implementation order (continuation)

7. Grouped pickers (`groupAccounts` + `TransferEditor` optgroups).
8. Color-coded chip (`transferInfo.counterpartClass` + `TransferChip` modifier + CSS).
9. Export CSV `transfer` column + `data.json` round-trip (the originally-planned Task 7, done last).
