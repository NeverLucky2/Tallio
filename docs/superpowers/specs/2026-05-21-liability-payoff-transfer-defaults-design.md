# BillTracker — Liability Pay-Off Transfer Defaults

**Date:** 2026-05-21
**Status:** Approved for planning
**Branch context:** Builds on the transfers feature (Phase 2, `2026-05-20-transfers-design.md`) on branch `worktree-accounts-revamp-phase-1`, off `master`. Realizes the "Quick 'pay this balance' transfer" future-work item from that spec. Continues on the same branch as separate commits.

## Overview

When the user opens the transfer dialog from a **liability** account (credit card, loan, mortgage), pre-fill it so paying the balance is one or two clicks:

1. The liability becomes the transfer **destination** (To), because paying it down is `bank → liability`.
2. The **amount** pre-fills with the full owed balance (the "Owed: …" figure shown in the register header).
3. The **From** account pre-selects the bank last used to pay *this* liability, remembered per-account.

After a transfer into a liability is saved, the From account is remembered on that liability (`defaultPayFromId`), so the next payment pre-selects it automatically.

The feature is **additive**: it only changes the *initial* values of a *new* transfer dialog and adds one optional account field. Editing existing transfers, transfers from non-liability accounts, and all balance/net-worth math are unchanged. No schema-version bump, no migration.

## Goals

- Opening a new transfer from a liability pre-fills To = that liability, amount = owed, From = remembered bank.
- Remember the From account per-liability on save (last-used wins), stored on the account so it travels with Export and phone sync.
- Keep the liability/balance logic in pure, independently-tested functions; keep `TransferEditor` a presentational controlled form.
- One undo reverts both the payment and the remembered-bank update together.

## Non-Goals

- No change to transfers opened from non-liability accounts (bank / investment / person / untyped) — From stays the clicked account, To/amount blank, exactly as today.
- No change to **edit** mode — an existing transfer always seeds from its stored legs, never from these defaults.
- No locking of the pickers or amount — every pre-filled value stays editable.
- No partial-payment helpers, minimum-payment logic, or statement/due-date awareness.
- No new UI for viewing or clearing the remembered bank (it is set implicitly by paying; overwritten by the next payment).
- No separate device-local store — the remembered bank lives on the account object only.

---

## Scope: which accounts

The behavior applies to every account whose type **class is `liability`** — built-in `credit_card`, `loan`, `mortgage`, and any custom type with `klass: 'liability'`. (Decision: "all liabilities", confirmed in brainstorming. A mortgage will therefore default its amount to the entire balance owed, which the user overwrites for a normal installment.)

Class is resolved with the existing `accountClass(account.type, typesById)` helper, so custom liability types are covered automatically.

---

## Data model (unchanged schema)

A new **optional** field on liability account objects:

| Field | Meaning |
|---|---|
| `defaultPayFromId` | account id of the From account last used to pay this liability |

- Absent ⇒ "nothing remembered yet" (the common/initial state). No migration: existing accounts simply lack the field.
- Stored as an ordinary key in the accounts array, so it is included in `localStorage`, Export archives (`data.json`), and phone sync automatically — no serialization changes needed.
- On read, if `defaultPayFromId` points to an account that no longer exists, it is ignored and the fallback From applies (see below).
- Lifecycle: written by `App.saveTransfer` (see Ledger/App below); preserved through account edits because `AccountEditor.save` spreads `...(account || {})` and `useLedger.updateAccount` merges patches.

---

## Model helper — `accountsModel.js` (pure, new)

```
transferDraftForAccount(account, transactions, accounts, typesById)
  → { fromAccountId, toAccountId, initialAmount }
```

Computes the initial editor configuration for a **new** transfer launched from `account`.

- **Liability** (`accountClass(account.type, typesById) === 'liability'`):
  - `toAccountId = account.id`
  - `initialAmount = owed`, where `owed = Math.abs(Math.min(0, accountBalance(account, transactions)))`, but `null` when `owed === 0` (nothing owed → leave amount blank). This mirrors exactly the register header's "Owed" figure.
  - `fromAccountId` = the first of these that exists:
    1. `account.defaultPayFromId`, if it still resolves to an account in `accounts` and is not `account.id`;
    2. the first **asset**-class account in `accounts` that is not `account.id`;
    3. the first account in `accounts` that is not `account.id`;
    4. otherwise `undefined` (no usable From — only when the liability is the sole account).
- **Non-liability** (everything else):
  - `fromAccountId = account.id`, `toAccountId = undefined`, `initialAmount = null` (today's behavior).

Pure and fully unit-testable; no React, no storage.

---

## UI — `TransferEditor.jsx`

Two **new optional props**, used only as initial state and only for *new* transfers:

- `toAccountId = null` — preselects the To picker when no `transfer` (edit) is supplied.
- `initialAmount = null` — preselects the Amount field (a number) when no `transfer` is supplied; `null`/absent ⇒ blank, as today.

Initial-state changes (edit mode unaffected because `transfer` takes precedence):

```
const [toId, setToId] = useState(transfer ? transfer.toLeg.accountId : (toAccountId || ''));
const [magnitude, setMagnitude] = useState(
  transfer ? Math.abs(transfer.fromLeg.amount)
           : (initialAmount != null ? String(initialAmount) : '')
);
```

`fromId` already initializes from the `fromAccountId` prop — no change to that line. All validation (`From ≠ To`, amount > 0), grouping, save payload, and edit seeding are unchanged. Everything stays editable.

---

## App wiring — `App.jsx`

**Opening (`onTransfer`).** Replace the inline `onTransfer={(accountId) => setEditingTransfer({ mode:'new', fromAccountId: accountId })}` with a handler that runs the draft helper:

```
const openTransfer = (accountId) => {
  const account = ledger.accounts.find(a => a.id === accountId);
  const draft = transferDraftForAccount(
    account, ledger.transactions, ledger.accounts, accountTypes.typesById
  );
  setEditingTransfer({ mode: 'new', ...draft });
};
```

`editingTransfer` carries `fromAccountId`, `toAccountId`, and `initialAmount`; the rendered `<TransferEditor>` receives `toAccountId={editingTransfer.toAccountId || null}` and `initialAmount={editingTransfer.initialAmount ?? null}` alongside the existing `fromAccountId`.

**Saving (`saveTransfer`).** After the legs are written, remember the From account when the To account is a liability:

```
const saveTransfer = (data) => {
  pushHistory();
  if (data.transferId) ledger.updateTransfer(data.transferId, data);
  else ledger.addTransfer(data);
  const toAccount = ledger.accounts.find(a => a.id === data.toId);
  if (toAccount && accountClass(toAccount.type, accountTypes.typesById) === 'liability') {
    ledger.updateAccount(data.toId, { defaultPayFromId: data.fromId });
  }
  setEditingTransfer(null);
};
```

- Applies to both new and edited transfers (last-used wins; overwrites any prior value).
- `pushHistory()` snapshots accounts **and** transactions before any change, so a single undo reverts the payment *and* the `defaultPayFromId` update together.
- The `updateAccount` and `addTransfer`/`updateTransfer` calls batch in one React event; both land before the localStorage save effect runs.

No other component changes. The `⇄ Transfer` button in `Register` already calls `onTransfer(account.id)` — only App's handler behind it changes.

---

## Edge cases (resolved)

- **Liability with nothing owed** (balance 0 or in credit/positive): To still pre-selects the liability and From still pre-selects the remembered bank, but **amount is blank** (Save stays disabled until the user types one). No negative or zero amount is pre-filled.
- **Remembered bank deleted:** `defaultPayFromId` no longer resolves → ignored; From falls back to first asset account (then first other account). Stale id is never written back unless the user saves a new payment.
- **First-ever payment (no remembered bank):** From defaults to the first asset account that isn't the liability, so the dialog is not in a `From === To` invalid state; the user confirms or changes it, and that choice is remembered.
- **Liability is the only account:** `fromAccountId = undefined`; From falls back to the editor's existing default and Save remains disabled by the `From ≠ To` rule until another account exists. Pre-existing limitation, unchanged.
- **From is itself a liability** (e.g. paying a card from another card): allowed; whatever From was chosen is remembered. The next ordinary payment overwrites it. No special-casing.
- **Editing an existing transfer:** `transfer` prop is set, so `toId`/`magnitude` seed from the stored legs; `toAccountId`/`initialAmount` are ignored. Saving an edit whose To is a liability still refreshes `defaultPayFromId` (consistent "last-used").

---

## Testing (TDD, inline)

Each written test-first.

- **`accountsModel.test.js` — `transferDraftForAccount`:**
  - liability with owed balance → `toAccountId = self`, `initialAmount = owed`, `fromAccountId = defaultPayFromId` when set/valid;
  - liability with `defaultPayFromId` pointing to a deleted account → From falls back to first asset account;
  - liability with no `defaultPayFromId` → From = first asset account ≠ self;
  - liability with zero/positive balance → `initialAmount = null`, To still = self;
  - custom `klass: 'liability'` type → treated as liability (via `typesById`);
  - non-liability account → `fromAccountId = self`, `toAccountId = undefined`, `initialAmount = null`.
- **`TransferEditor.test.jsx`:**
  - `toAccountId` prop preselects the To picker on a new transfer;
  - `initialAmount` prop pre-fills the Amount field; `null`/absent ⇒ blank;
  - both props are ignored when a `transfer` (edit) is supplied — fields seed from the legs;
  - existing validation/payload tests still pass (From ≠ To, amount > 0).
- **`App` / smoke (mirroring `__smoke__/setup.test.jsx` and existing App tests):**
  - clicking `⇄ Transfer` on a liability opens the editor with To = that liability and amount = owed;
  - saving a transfer whose To is a liability writes `defaultPayFromId = fromId` on it;
  - reopening the transfer from that liability pre-selects the remembered From;
  - clicking `⇄ Transfer` on a bank account is unchanged (From = bank, To/amount blank);
  - undo after a payment reverts both the legs and `defaultPayFromId`.

(`useLedger.updateAccount` already merge-preserves arbitrary patch fields and is covered by existing tests; no new ledger method is needed.)

---

## Implementation order

1. **`transferDraftForAccount`** in `accountsModel.js` — pure, fully unit-tested first.
2. **`TransferEditor`** props `toAccountId` / `initialAmount` (initial state + tests).
3. **`App` wiring** — `openTransfer` using the helper; `saveTransfer` remembers `defaultPayFromId`; pass new props to `<TransferEditor>`; App/smoke tests.

Suggested checkpoint: after step 1 (helper + tests green), and after step 3 (end-to-end).

## Resolved decisions (from brainstorming)

- **Scope:** all `liability`-class accounts (credit cards, loans, mortgages, custom liabilities).
- **Direction:** clicking Transfer on a liability makes it the **destination**; the remembered/asset bank is the source (`bank → liability` reduces the owed balance). This changes today's "clicked account = From" only for liabilities.
- **Amount:** pre-fill the full owed balance (`abs(min(0, balance))`); blank when nothing is owed.
- **Remember From:** per-liability, stored as `defaultPayFromId` **on the account object** (travels with Export and phone sync); last-used wins; written on any save whose To is a liability.
- **Editability:** all pre-filled values remain editable; edit mode is never affected.
- **Undo:** one snapshot reverts the payment and the remembered-bank change together.
