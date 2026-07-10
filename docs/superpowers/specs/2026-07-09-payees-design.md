# Payees as First-Class Entities — Design

**Date:** 2026-07-09
**Status:** Approved (brainstorm complete); implementation deferred until the Tallio Anywhere PWA branch (`feat/pwa-standalone`) lands
**Arc:** Business-finance arc, sub-project 1 of 6 (payees → P&L → business mode/class → invoicing/AR → tax flags → receipts)

## Context

Tallio is being positioned as a local-first finance manager for households and small businesses (Quicken Home & Business model: one app; audience-neutral features for everyone, invoicing/AR later behind an opt-in business mode). Payees are the foundation: structured vendor/customer identity unlocks per-payee reporting, default-category auto-fill, and — later — invoices that reference customers by id.

Transactions already carry a free-text `payee` field (bank-account entries only; `TransactionEditor.jsx`, `useLedger.js`). This sub-project promotes that string into an id-referenced entity, consistent with how categories, subcategories, and account types already work.

## Goals

1. Payees are a managed collection; transactions reference them by id.
2. Existing ledger data migrates automatically, with no user action and no data loss.
3. Entry stays fast: searchable picker with inline create, matching the category-picker pattern.
4. Picking a payee can pre-fill its default category/subcategory.
5. Payee list is maintainable: rename, merge, delete — all undoable.

## Non-goals (deferred)

- Vendor/customer role field (invoicing sub-project adds a customer flag when needed)
- Spend-by-payee report (arrives with the P&L sub-project)
- Business mode, invoicing, tax flags (later sub-projects)
- Payee contact info / notes

## Data model

New collection persisted at `tallio-payees`, exposed through `useLedger` like the other collections:

```js
{ id, name, defaultCategoryId: string|null, defaultSubcategoryId: string|null }
```

- `id` uses the same id-generation idiom as accounts/categories.
- `name` is unique case-insensitively (enforced at create/rename).

Transactions replace `payee` (string) with `payeeId` (string|null). Payee remains optional and bank-account-only, exactly as today. Split children continue to inherit the parent's payee (now `payeeId`), matching current behavior.

## Migration (one-time, on load)

Same style as `accountsMigration`. Triggered when transactions still carry string `payee` fields (and/or `tallio-payees` is absent); idempotent — re-running is a no-op.

1. Collect payee strings from all transactions, trimmed; skip empty/whitespace.
2. Group case-insensitively; the first-seen casing (transaction array order) becomes the entity `name`.
3. Create one payee per group; rewrite every transaction: remove `payee`, set `payeeId` (null where there was none).
4. Migrate templates (`tallio-templates`) the same way: template drafts holding payee strings are rewritten to `payeeId`, creating entities for names not already seen.
5. **Seed default categories from history:** for each payee, consider only its *categorized* transactions (splits contribute the parent's main category; transfers have no payee and are excluded). If it has ≥ 2 categorized transactions and one (category, subcategory) pair holds a strict majority, that pair becomes the payee's defaults. Otherwise defaults stay null.

## Entry UX

- The payee text input in `TransactionEditor` becomes a searchable picker with the CategoryPicker interaction set: type-to-filter, keyboard navigation, drop-up positioning where space-constrained, and an inline "Create '<typed>'" row.
- Inline create with a name matching an existing payee case-insensitively selects the existing payee instead of creating a duplicate.
- The field is clearable (payee stays optional).
- Templates and copy/paste (`entryDrafts`) serialize `payeeId`; applying a draft whose `payeeId` no longer exists degrades to no payee.
- Display fallbacks that read `p.payee` (e.g. entry titles in `entryDrafts.js`) switch to a payee-name lookup by id.

## Default category auto-fill

- Fires only in a **new-entry** draft, only when the current category is **empty**: picking a payee with defaults fills `defaultCategoryId`/`defaultSubcategoryId`.
- Never overwrites a category the user has set (if the user clears the category and then picks a payee, the default applies — the rule is simply "fill only into empty").
- Never fires when editing an existing transaction.
- Payees without defaults do nothing.
- Defaults are edited in the payee editor via the existing category tree picker.

## Manage Payees screen

Modeled on `ManageCategoriesScreen`, reachable from the same management area:

- Searchable list; each row shows name, usage count, and default-category chip (if set).
- Per-payee ⋮ menu: **Rename**, **Set default category**, **Merge into…**, **Delete**.
- **Rename:** inline editor. Renaming to a name that case-insensitively matches another payee is blocked with a message suggesting Merge.
- **Set default category:** opens the existing category tree picker directly (no separate payee editor dialog); clearing is supported.
- **Merge into…:** target chosen via searchable picker (self excluded). All of the source's transactions are reassigned to the target, the source is removed, and the target's defaults are kept unchanged. One undoable action.
- **Delete:** confirmation shows usage count; affected transactions get `payeeId: null`; the payee is removed. One undoable action.

## Undo

All mutations (create, rename, set-default, merge, delete, migration excluded) flow through the existing undo-everywhere infrastructure. Merge and delete are single compound undo entries that restore both the entity and every affected transaction.

## Archive

- `exportArchive` schema bumps v5 → **v6**; exports include `payees`, restore writes `tallio-payees`.
- `SUPPORTED_SCHEMA_VERSION` becomes 6 in `archiveRestore.js`.
- Importing a v5-or-older archive stays supported: restore writes the archive's data as-is, and the normal load migration then creates payees from its string fields (including default seeding).

## Testing

TDD inline per the established workflow. Coverage:

- Migration: dedupe, case-insensitive grouping with first-seen casing, empty/whitespace skipping, template rewriting, default seeding (majority rule, ≥2 threshold, splits via parent category), idempotency.
- Picker: search, inline create, case-insensitive duplicate prevention, clearability, drop-up.
- Auto-fill: fills only empty category on new entries; never on edit; respects user's choice.
- Management: rename (including blocked-duplicate path), merge reassignment, delete nulling, usage counts — each with undo restoring exact prior state.
- Archive: v6 round-trip; v5 import upgrades via migration.
- Full suite (~1037 tests) stays green.

## Rollout / sequencing

Implementation starts **after** `feat/pwa-standalone` is finished and merged, on a fresh branch off master (suggested: `feat/payees`). This spec is written now but committed once that branch exists, to avoid touching the in-flight PWA branch.
