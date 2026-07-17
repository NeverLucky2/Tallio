# Business Mode + Business/Personal Class Tagging — Design

**Date:** 2026-07-17
**Status:** Approved (brainstorm complete)
**Arc:** Business-finance arc (payees → P&L → spend-by-payee → **business mode / class** → invoicing/AR → tax flags → receipts)
**Branch:** `feat/business-class` (off master)

## Context

Tallio is being repositioned as small-business finance management (resume-led; the user's father runs a small real business). The prior arc items shipped payees as first-class entities, a Profit & Loss statement, and a spend-by-payee report. The next step is separating **business** money from **personal** money so reports can show one slice, the other, or both.

In the father's real setup, business lives in its **own accounts** kept apart from personal accounts (confirmed during brainstorming). That makes an **account-level** class flag sufficient — every transaction inherits its account's class; no per-transaction tagging and no transaction backfill are needed.

This follows the Quicken Home & Business model: the class controls are hidden by default (the personal app looks exactly as it does today) and appear only behind an opt-in **business mode** toggle (progressive disclosure).

### Naming — avoid a collision

The codebase already exports `accountClass(typeId)` / a type's `klass`, meaning **asset / liability / offsheet** (the balance-sheet class that drives net-worth math; see `accountsModel.js` and `AccountList.jsx:64`). The new business-vs-personal axis is a *different* concept. To avoid confusion it is named **`bizClass`** everywhere in code (`account.bizClass`, `bizClassOf`, `bizClassAccountIds`). User-facing copy just says **Personal / Business / Shared**.

## Goals

1. An account carries a business/personal **class**: `personal` (default), `business`, or `shared`.
2. An opt-in **business mode** setting reveals all class UI; when off, the app is byte-for-byte today's.
3. A per-report **All · Personal · Business** view filter on the **P&L** and **Reports** screens (shown only in business mode).
4. **"Shared ∈ both"**: a Shared account's transactions appear in *both* the Personal and the Business views.
5. A small **Business / Shared badge** on account rows (business mode only).
6. Money is counted **identically** to today — the class filter only narrows which accounts are in scope; it reuses the existing `filterRows` pipeline. Report accuracy is paramount (transfers still excluded, no double counting).

## Non-goals (deferred to later arc items)

- **Per-transaction** class overrides (the "commingled" case) — not needed given separate accounts.
- **Tax / Schedule-C** mapping and deductible flags — the later "tax flags" sub-project.
- **Invoicing / AR** — the later invoicing sub-project.
- Splitting **net worth / balances** by class — this sub-project is flows-only (P&L + Reports). Net worth stays whole.
- Any **regrouping** of the accounts sidebar by class — a badge only, no new sections.

## Data model

### The class field — no schema bump

- New optional field **`account.bizClass`** ∈ `'personal' | 'business' | 'shared'`.
- Resolver **`bizClassOf(account)`** in `accountsModel.js`: returns the stored value when it is one of the three, else `'personal'`. A missing field therefore reads as `'personal'`.
- **No storage-schema-version bump and no migration.** Existing accounts simply resolve to `'personal'`; the field is written only once a user sets it. This is non-destructive and lower-risk than the payees migration — there is nothing to backfill and no ambiguity to resolve.
- **Archive:** `bizClass` round-trips for free because accounts are serialized whole. No `archive schemaVersion` bump is required for the field itself.

*Alternatives rejected:* (a) an explicit migration stamping every account `bizClass:'personal'` plus a schema bump — unnecessary risk; (b) storing class on the account **type** — then two accounts of one type (personal checking + business checking) could not differ; it must be per-account.

### Filter helpers — `reportsModel.js`

Two new pure functions, plus reuse of the existing scope plumbing:

- **`bizClassAccountIds(accounts, filter) → Set<id> | null`**
  - `filter === 'all'` (or falsy) → `null` (no restriction).
  - `filter === 'personal'` → ids where `bizClassOf(a)` ∈ `{ 'personal', 'shared' }`.
  - `filter === 'business'` → ids where `bizClassOf(a)` ∈ `{ 'business', 'shared' }`.
  - This is the single place the **"Shared ∈ both"** rule is enforced.
- **`intersectAccountIds(a, b) → Set<id> | null`**
  - `null` means "no restriction", so `null ∩ x = x` (either side), and `set ∩ set` = the intersection.

Each report screen computes:
`accountIds = intersectAccountIds(scopeAccountIds(accounts, scope, typesById), bizClassAccountIds(accounts, bizFilter))`
and passes `accountIds` into `opts` exactly as today. Everything downstream — `filterRows`, `flattenForReports`, `flowOf`, `profitAndLoss`, `payeeActivity`, `incomeExpenseSummary` — is **untouched**. `bizClassOf` is imported by `reportsModel` from `accountsModel`.

## Business mode setting — `useSettings.js`

- New boolean **`businessMode`**, persisted under key **`tallio-business-mode`** (`'1'` / absent), following the existing per-key pattern in `useSettings`.
- `save({ businessMode })` writes the key; `loadInitial` reads it.
- **Auto-enable** (turning it on is a one-way convenience; turning off is always explicit and non-destructive):
  1. When an account is saved with `bizClass` set to `'business'` or `'shared'` while business mode is off, the app turns business mode on (see the first-tag link below).
  2. When an archive is imported/restored that contains any account with `bizClass` ∈ `{business, shared}`, business mode is turned on so the data is not silently hidden. (Checked in the restore path — `archiveRestore.js` / `initializeFromStorage.js` consumer in `App.jsx`.)
- **Turning business mode off is non-destructive:** every account keeps its stored `bizClass`; only the UI (pickers, filters, badges) hides. Flipping it back on restores everything.

## UI

### Settings panel

- A **Business mode** toggle in `SettingsPanel.jsx` (a labeled control in the settings body), reading/writing `settings.businessMode`. Help text: business mode adds business/personal tagging to accounts and a Personal/Business filter to reports; turning it off hides those but keeps your tags.

### Account editor — `AccountEditor.jsx`

- **When business mode is on:** a new **Class** field (a `Personal / Business / Shared` `<select>`, styled like the existing Type field). Its value seeds from `account?.bizClass` and is included in the `onSave` payload as `bizClass`.
- **When business mode is off:** the picker is hidden, but one quiet secondary link sits near the bottom of the dialog: **"This is a business account →"**. Clicking it enables business mode (auto-enable) and reveals the Class picker inline (pre-set to `business`). This is the first-tag discovery path; it is the *only* class-related element visible while business mode is off, and it appears **only in the account dialog** — the main app chrome, reports, and registers are unchanged until business mode is on.
- Saving an account with a non-personal `bizClass` while mode is still off also triggers auto-enable (belt-and-suspenders with the link).

### Account list — `AccountList.jsx`

- **When business mode is on:** account rows whose `bizClassOf(a)` is `business` or `shared` show a small chip (`Business` / `Shared`) next to the name. No regrouping, no change to net-worth math or balances. Hidden when mode is off.

### Report screens — `ProfitLossScreen.jsx` and `ReportsScreen.jsx`

- **When business mode is on:** a segmented control **All · Personal · Business** in the existing `.reports-controls` row (a `bizFilter` state, default `'all'`), next to the scope/period controls. Styled like the existing `period-chips`.
- The screen computes `accountIds` via `intersectAccountIds` (above) and threads it into `opts`, so the P&L grid, the spending/payee panels, and the P&L **CSV/print export** all reflect the selected slice with no further changes.
- **When business mode is off:** the control is absent and `bizFilter` is effectively `'all'` — the screens render exactly as today.

## Testing

Inline TDD, pure helpers first, per the project workflow (write failing test → `npx vitest run <file>` red → implement → green → lint → commit).

- **`accountsModel` — `bizClassOf`:** missing → `'personal'`; each valid value passes through; unknown/garbage → `'personal'`.
- **`reportsModel` — `bizClassAccountIds`:** `'all'`/falsy → `null`; `'personal'` includes personal + shared, excludes business; `'business'` includes business + shared, excludes personal; empty accounts → empty set (not null) for a specific filter.
- **`reportsModel` — `intersectAccountIds`:** null∩null→null; null∩set→set (both orders); disjoint sets→empty; overlapping sets→intersection.
- **Integration (model level):** a Business filter over a mixed ledger yields P&L / payee totals equal to summing only business+shared accounts, and transfers between a personal and a business account remain excluded (no double count).
- **`useSettings`:** `businessMode` defaults false; `save({ businessMode: true })` persists and reloads; toggling off does not touch account data.
- **`AccountEditor` (RTL, with `afterEach(cleanup)` — no global RTL cleanup in this project):** Class picker hidden when mode off; first-tag link visible when off and, when clicked, reveals the picker and reports `businessMode` on; picker visible + saves `bizClass` when mode on.
- **`AccountList` (RTL):** Business/Shared chips render only in business mode.
- **`ProfitLossScreen` / `ReportsScreen` (RTL):** the All/Personal/Business control renders only in business mode; changing it re-filters (assert a business-only figure differs from all).
- **Archive round-trip:** exporting then restoring preserves `bizClass`; restoring an archive containing a business/shared account turns business mode on. (App smoke tests that seed `tallio-accounts` must also seed `tallio-schema-version='4'`, else the migration path wipes accounts — established project gotcha.)
- Full suite stays green; zero new lint errors/warnings from touched files.

## Rollout / sequencing

Implemented on `feat/business-class` off master via inline TDD. Spec committed first; the implementation plan (writing-plans) follows, then task-by-task TDD with review checkpoints. Local `master` is currently 15 commits ahead of origin (P&L + spend-by-payee); pushing is a separate, user-initiated step and not a prerequisite for this work.
