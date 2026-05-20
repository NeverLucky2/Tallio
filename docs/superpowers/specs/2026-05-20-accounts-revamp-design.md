# BillTracker — Accounts Revamp Design

**Date:** 2026-05-20
**Status:** Approved for planning
**Branch context:** current work is `multi-month-bills`; this revamp supersedes the month-centric organization.

## Overview

Today BillTracker organizes everything by **month**: you pick a month and see "bills," where each bill is named after a **vendor** (usually a credit card) and holds dated line **items** classified by **category**.

Dad uses Quicken, where money is organized by **account** (he currently shoehorns his accounts into Quicken's "categories"). He wants BillTracker reorganized the same way:

- Rename the "vendor" concept to **Account** and make Accounts the top-level organizing principle.
- Each account shows **all its transactions in chronological order across every month**, filterable.
- Track **inter-account transfers** (pay a credit card from a bank account; send Mom money for rent; send Brother money at college).
- Keep month-over-month insight via **Reports**, not a monthly dashboard. Dad reviews trends ("electricity over 5 months," "is the brokerage growing") by running reports, not by flipping a month toggle.

This is a large change, built in **three phases** (see Phasing).

## Goals

- Accounts as a first-class, top-level entity, separate from spending Categories.
- Per-account chronological **register** with a **running balance**.
- Account **types** so balances behave correctly (asset vs. liability vs. off-balance-sheet tracker).
- **Transfers** recorded once and reflected in both accounts' registers, kept in sync.
- **Reports** reoriented to multi-month **Trend** and **Composition (pie)** views.
- Migrate existing data without loss.

## Non-Goals (this revamp)

- Recurring-transaction auto-entry (the existing auto-spawn recurring chains are removed; recurring is a possible future phase).
- The tracked-keywords sidebar (removed).
- The monthly dashboard: Income/Spent/Saved/Net stat cards and the 12-month home spending chart (removed).
- Bank/statement API sync, reconciliation workflows, multi-currency.

Carried over unchanged: scan-via-Anthropic-API extraction, phone capture / pairing, ZIP export, category management (icons, colors, flow, keywords, templates, auto-categorize).

---

## Data Model

### Account (new, top-level)

```
Account {
  id            string
  name          string          // "Chase Checking", "Mastercard", "Mom (Rent)"
  icon          string          // emoji, like categories
  type          AccountType     // see below; migrated accounts start "untyped"
  openingBalance number          // default 0; user-settable
  archived      boolean          // optional, future
}
```

`AccountType`:

| Type | Class | Balance meaning |
|------|-------|-----------------|
| `bank` | asset (on balance sheet) | money you have (positive) |
| `investment` | asset (on balance sheet) | account value (positive) |
| `credit_card` | liability (on balance sheet) | amount owed (negative balance) |
| `loan` | liability (on balance sheet) | amount owed (negative balance) |
| `mortgage` | liability (on balance sheet) | amount owed (negative balance) |
| `person` | off balance sheet | running tally of money sent/received |
| `untyped` | unknown (migration default) | treated as non-bank, neutral, off net-worth until typed |

The **bank** type drives the Quicken-style register layout; all other types use the compact layout (see UI).

### Transaction (replaces bill "items")

```
Transaction {
  id            string
  accountId     string          // which account's register it belongs to
  date          string          // YYYY-MM-DD
  amount        number          // SIGNED delta applied to the account balance (see Sign Semantics)
  categoryId    string          // always set (needed for reports), even on bank rows
  description   string          // = "notes" in the bank layout
  payee         string|null     // bank layout; for transfers, the linked account's name
  checkNumber   string|null     // bank layout only
  transferId    string|null     // set on both legs of a transfer; links the pair
}
```

The "bill" container is removed. Scanned statements **flatten**: their line items become individual transactions in the chosen account.

### Category (unchanged)

Existing shape: `{ id, name, icon, color, flow: 'income'|'expense'|'savings', keywords[], templates[], builtin }`. A reserved **Transfer** category (flow-neutral) is added for transfer legs (see Transfers).

---

## Balance & Sign Semantics

`amount` is the **signed delta** to the owning account's running balance.

- **Asset accounts** (`bank`, `investment`): deposits are `+`, payments/withdrawals are `−`. Positive balance = money held.
- **Liability accounts** (`credit_card`, `loan`, `mortgage`): represented as **negative** balances (negative = owed). A new charge is `−` (owe more); a payment received is `+` (owe less). The register header shows `Owed: $|balance|`.
- **Person/External** (`person`): off balance sheet. Convention: the account's balance = **net amount transferred to that person** (a transfer from you to Mom is `+` in the Mom account). Sidebar presents this as a neutral "net sent/received" figure (no confusing minus sign). Excluded from net worth.

**Running balance** of a transaction = `openingBalance + Σ amount` of all transactions in that account up to and including it, ordered by `date` then insertion order for same-day ties.

**Household net worth** = Σ balances of all on-balance-sheet accounts (`bank`, `investment`, `credit_card`, `loan`, `mortgage`). `person` and `untyped` are excluded.

---

## UI

### Primary screen (Phase 1)

Replaces the month-centric home.

- **Top action bar:** Scan · + Transaction · ⇄ Transfer · Reports · Settings · Export.
- **Household strip:** Net worth · Cash + investments · You owe. (Roll-ups across on-balance-sheet accounts.)
- **Left — account list**, grouped by type class with a sub-header per group (Cash & Bank, Investments, Credit cards & loans, People & external). Each row shows the account's icon, name, and current balance. "+ Add account" at the bottom.
- **Right — register** for the selected account: header (icon, name, type, balance), a filter bar (search · month · category), and the transaction table. No month toggle in the chrome; month is just a filter here.

### Two register layouts (Phase 1)

Layout is chosen by account type.

**Bank/Cash** (`bank`):

`DATE · CHECK# · PAYEE · CATEGORY · NOTES · PAYMENT · DEPOSIT · BALANCE`

- `payment` column shows `|amount|` when `amount < 0`; `deposit` shows `amount` when `amount > 0`.
- For transfer rows, `payee` shows the linked account (e.g. `⇄ Mastercard`).
- Category is shown (so direct ACH bill payments like electricity/insurance are categorized for reports). Transfer legs show the Transfer category, color-coded.

**Everything else** (`credit_card`, `loan`, `mortgage`, `investment`, `person`, `untyped`):

`DATE · DESCRIPTION · CATEGORY · AMOUNT · BALANCE`

- `amount` shown signed (`−96.20`, `+1,100`).

Both layouts need a mobile-friendly collapse (stacked rows) consistent with the current `BillItem` mobile pattern.

### Transfer entry (Phase 2)

A single form: **From** account → **To** account, **Amount**, **Date**, **Category** (defaults to Transfer), **Notes**, and **Check #** (shown only when the source is a bank account).

Saving writes a **linked pair** of transactions sharing a `transferId`:

- Source leg — **Transfer Out**, colored **orange** (`#e89a4f`), `↗`.
- Destination leg — **Transfer In**, colored **teal** (`#46c2c8`), `↙`.

Editing or deleting either leg updates/removes its partner so the two registers never drift.

**Shortcuts** that open the form pre-filled:
- "⇄ Pay this card from another account" on a `credit_card`/`loan`/`mortgage` account → sets **To** = that account.
- "⇄ Send / Transfer" on a `person` account → sets **To** = that person.

**Transfer kinds & reporting:**
- **On-balance-sheet ↔ on-balance-sheet** (e.g. Chase → Mastercard, Chase → Savings): both legs use the **Transfer** category, the move is **net-zero** for net worth, and it is **excluded** from spending reports.
- **To a Person/External account** (e.g. Chase → Mom for rent): the **source** (outgoing) leg may carry a **real expense category** (Rent, Family Support) so it counts as spending in reports; the **destination** leg in the person account uses the **Transfer In** category so the amount is **not double-counted**. Net worth correctly drops (cash down; person account is off balance sheet).

### Reports (Phase 3)

Two report types (keep the existing Reports entry point; rebuild its contents).

1. **Trend** — pick *Track: Category* or *Track: Account*, a *Range* (e.g. last 6 months), optionally filtered to one account.
   - Category mode: monthly **spend** for that category (bar per month) with total / average / peak.
   - Account mode: month-end **balance** for that account (bar/line per month) with growth over the range.
2. **Composition (pie/donut)** — *Break down by: Category* or *Account/Payee*, over a *Timeframe*. Center shows total; legend shows each slice's % and $.
   - By Category: share of spending per category.
   - By Account/Payee: where money went by destination (Mortgage, Mom, Brother, card payments, …).

**Reports counting rule:** spending totals count `expense`-flow transactions only; **Transfer**-category legs are excluded. A person-account transfer's outgoing leg (carrying a real expense category) is counted exactly once.

---

## Migration

One-time, on first load of the new version. A backup of pre-migration state is written to localStorage first (mirrors the existing v1→v2 backup pattern in `initializeFromStorage.js`).

- Each distinct **vendor** becomes an **Account** with `type: 'untyped'`, `openingBalance: 0`, an icon derived from the existing vendor initial/color.
- Each bill **item** becomes a **Transaction** in that account: `date` preserved (falling back to the bill's anchor month → first of month, matching `getItemDate`), `amount` and `categoryId` preserved, `description` preserved, `payee`/`checkNumber`/`transferId` null.
- Bills sharing the same vendor name merge into one account register.
- After migration, Dad assigns a **type** to each account (which unlocks the bank layout where appropriate) and sets **opening balances** where he wants accurate balances.
- Categories, scanned-image settings, and export are untouched.

Existing schema migrations (v1→v2 category ids, v2→v3 flow) must still run before this account migration; this is an additive v3→v4 step. Migration code is pure and unit-tested, idempotent.

---

## Phasing

Each phase is independently usable and reviewable.

- **Phase 1 — Accounts & registers.** Account entity + types + management UI; migration; primary screen (account list + household strip); both register layouts with running balances; manual transaction add/edit/delete; scan flattens into a chosen account; filters (search/month/category). Removes the monthly dashboard, stat cards, home spending chart, tracked-keywords sidebar, and recurring auto-spawn.
- **Phase 2 — Transfers.** Transfer entry form; linked-pair create/edit/delete with sync; Transfer In/Out coloring; pay-card and send-to-person shortcuts; person-account expense-categorization rule; net-worth roll-up correctness.
- **Phase 3 — Reports.** Trend report (category spend / account balance over a range); Composition pie (by category / by account-payee, with timeframe). Apply the reports counting rule.

---

## Resolved Decisions (from brainstorming)

- Accounts are **top-level**, separate from Categories.
- Accounts have **running balances**.
- A few **built-in account types** (asset / liability / person-external).
- Landing is **accounts-only**; the monthly dashboard is removed; **Reports** is kept and reoriented to multi-month trends + a composition pie.
- Scanned statements **flatten** into the register.
- **Bank** accounts get Quicken-style columns incl. a Category column; other accounts get the compact layout.
- Transfer labels are **Transfer In / Transfer Out**, colored **teal in / orange out**.
- **Person/External** accounts are **off balance sheet** and their outgoing transfers can carry a real spending category.
- Migration converts vendors to **untyped** accounts.
- Recurring auto-spawn and tracked keywords are **dropped now, revisited later**.

## Open Items to Finalize During Implementation

- Exact sidebar presentation of a `person` account's tally ("$1,100 sent" vs. signed) — pick the least-confusing wording.
- Mobile/responsive collapse of the 8-column bank register.
- Whether `investment` accounts should support a manual "set balance as of date" entry (useful for brokerage value that changes via market, not transactions) — likely a Phase 3 nicety.
- Where the migration backup is surfaced for recovery in the UI.
