# Smarter Bill Scanning — design

- **Date:** 2026-07-09
- **Status:** Approved design, pending implementation plan
- **Branch:** `feat/scan-review`

## Problem

Two friction points in the bill-scan flow:

1. Scanning immediately commits the extracted transactions to the currently-selected
   account (or silently auto-creates an "untyped" account named after the vendor) —
   the user never gets to say *which* account the bill belongs to, and there's no
   confirmation step.
2. A multi-page PDF scan is genuinely slow (a non-streamed Haiku request), and the
   loading overlay gives no cancel option and no expectation of how long it takes — so
   a working-but-slow scan reads as frozen. (Established during debugging on 2026-07-08:
   the request completes fine given ~a minute; the model ID and PDF path are correct.)

## Goals

1. After any bill scan (upload, camera, or phone), the user reviews and **chooses which
   account** the transactions go to — nothing is committed until they confirm.
2. **Smart guess:** pre-select the account by matching the card/vendor name printed at
   the top of the bill against existing account names. On no match, default to creating
   a new account named after the vendor (editable).
3. The processing overlay sets expectations and offers a **Cancel** that genuinely
   aborts the in-flight API request.
4. The **Upload** button matches the **Scan bill** button's accent color.

## Non-goals

- No change to the extraction prompt or model.
- No splitting a single bill's transactions across multiple accounts — all extracted
  items go to one chosen account (same as today).
- No fuzzy/ML matching beyond normalized string matching of vendor→account name.

## Architecture

Today `handleCapture(imageData, source)` (App.jsx ~490-526) does: extract → pick target
(`selectedAccountId`, else auto-create) → add all transactions → select the account.

Split this into **extract → review & assign → commit**:

```
handleCapture: extract → setPendingScan({ vendor, month, items, source })   // no commit
ScanReview dialog (open while pendingScan): user picks/creates an account
applyScan(accountId): pushHistory → add each transaction → select account → clear pendingScan
```

### 1. Upload button color
`App.jsx:772`: `className="btn"` → `className="btn btn-primary"` (Scan bill is `btn btn-primary` at `App.jsx:775`).

### 2. Loading text + Cancel (real abort)
- `App.jsx:499`: `'Reading bill…'` → `'Reading bill… multi-page PDFs can take up to a minute'`.
- Add a **Cancel** button to the `processing-overlay` (`App.jsx:646-648`).
- Thread an `AbortController` `signal` through `extractBillFromImage(imageDataUrl, { apiKey, model, signal })` into `client.messages.create(params, { signal })`.
- App holds the controller in a ref during processing; Cancel calls `.abort()`.
- A user-initiated cancel must NOT show the "Scan failed" banner. Distinguish it: the
  Anthropic SDK throws `APIUserAbortError` on abort; additionally set a `cancelledRef`
  flag when Cancel is pressed and skip the banner when it's set (SDK-agnostic guard).
  On cancel, just clear the overlay.

### 3. Vendor → account matcher (new pure module)
`src/scanMatch.js`: `matchAccountByVendor(vendor, accounts) → account | null`.
- Normalize both sides: lowercase, strip non-alphanumerics/spaces, collapse whitespace.
- Match if the normalized account name and normalized vendor are equal, or one contains
  the other, or they share a significant token (length ≥ 3). Return the first/best match,
  else `null`. Pure and unit-tested.

### 4. ScanReview dialog (new component)
`src/ScanReview.jsx` — a modal shown while `pendingScan` is set. Props:
`{ scan: { vendor, month, items }, accounts, types, typesById, onConfirm(accountId), onCancel, onCreateAccount }`.
- Header: "Found **N** transactions from **'<vendor>'**" (N = `items.length`).
- Account selector: grouped `<select className="select">` built from `groupAccounts(accounts, types, typesById)` plus a `＋ New account…` option (sentinel `__new_account__`) — the same pattern `TransferEditor` uses (`TransferEditor.jsx:85-108`), with an inline `AccountEditor` when creating.
- **Preselect:** on mount, `matchAccountByVendor(vendor, accounts)` → if found, select that
  account; else open in create-new mode with the `AccountEditor` prefilled `{ name: vendor }`.
- Buttons: **"Add N transactions"** (calls `onConfirm(accountId)`; when creating, first
  saves the new account, then confirms with its id) / **Cancel** (`onCancel`, discards).

### App wiring
- New state `pendingScan` (`{ vendor, month, items, source } | null`).
- `handleCapture`: on extraction success, `setPendingScan(...)` (do not commit); on
  abort, clear overlay silently; on real error, keep the existing banner.
- `applyScan(accountId)`: `pushHistory()` → for each item, `ledger.addTransaction(...)`
  (the loop currently at `App.jsx:506-518`) → `setSelectedAccountId(accountId)` →
  `setPendingScan(null)`.
- Reuse `groupAccounts` from `accountsModel.js` and the `AccountEditor` inline-create
  pattern already used by `TransferEditor`.

## Testing

- `scanMatch.test.js`: exact match, substring both directions, token match, no-match → null,
  empty/nullish vendor → null.
- `ScanReview.test.jsx`: renders vendor + count; pre-selects a matching account; defaults
  to create-new (prefilled vendor) when no match; "Add" calls `onConfirm` with the chosen
  id; Cancel calls `onCancel`.
- App-level smoke: a scan opens ScanReview (nothing committed yet); confirming commits the
  transactions to the chosen account; Cancel on the overlay aborts without a banner.
- Keep the full suite green.

## Risks

- **Abort detection differences across SDK versions** → guard with an explicit
  `cancelledRef` flag in addition to the SDK error name.
- **Over-eager vendor matching** (wrong account preselected) → the user still confirms
  every time, so a wrong guess is corrected in one click; keep the matcher conservative.
