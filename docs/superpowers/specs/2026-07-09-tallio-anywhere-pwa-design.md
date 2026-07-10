# Tallio Anywhere — installable web app + real files (Phase 1)

- **Date:** 2026-07-09
- **Status:** Approved design, pending implementation plan
- **Branch (phase):** `feat/pwa-standalone`

## Problem

Today Tallio runs only via the Vite dev server (`npm run dev` → localhost). That is a
non-starter for non-technical friends: it requires Node, a terminal, and a running
process. We want anyone to be able to *run* Tallio without touching a terminal, while
keeping the property that **no user financial data is ever stored on a cloud** — all
data stays on the user's own computer, like older versions of Quicken.

The good news, established during brainstorming: Tallio is already 100% client-side.
There is no backend. Core financial data lives in the browser's `localStorage`; images
(receipts, icons) live in `IndexedDB` (`imageStore.js`). Nothing is uploaded anywhere.
So "keep data local" is already true — the work is purely about **delivery** (getting
the app to friends without localhost) and **making data a real, safe, portable file**.

## Guiding constraint (non-negotiable)

No server ever stores, receives, or backs up user data. Hosting serves only the app's
*code* (static files) over HTTPS. Every byte of financial data stays on the user's
machine. This rules out any cloud sync, telemetry of data, or server-side storage —
now and in future phases.

## Goals (this phase)

1. A friend can open Tallio from a **link**, "install" it, and use it offline like a
   real app — no terminal, no localhost.
2. Their data is **durable** (not silently evicted by the browser) and **portable** as
   a real file they can see, back up, and restore.
3. On Chrome/Edge, offer a **linked live file** that auto-saves — the beginnings of the
   Quicken-style "document" feel — with graceful fallback everywhere else.
4. Keep the existing app and its ~1037-test suite intact; add layers, don't rewrite.

## Non-goals (later phases)

- **Tauri desktop installer** + true live-document file on Windows/Mac — **Phase 2**.
  That is where the file becomes the source of truth on every OS with no browser limits.
- **Mobile layout** / phone-optimized PWA — **Phase 3** (no mobile layout exists yet).
- **Any cloud sync / multi-device sync** — never.

## Architecture — three thin layers over the existing app

The existing app (hooks writing to `localStorage` + `IndexedDB`) remains the **working
store, untouched**. We add two layers on top, both reusing the existing
`buildArchive()` / `parseArchive()` serialization in `src/exportArchive.js`:

```
┌─────────────────────────────────────────────────────────┐
│ PWA shell  (installable, offline, app icon)              │
├─────────────────────────────────────────────────────────┤
│ File layer                                               │
│  • Universal tier (all browsers): Export + Import/Restore│
│  • Chromium tier (Chrome/Edge): linked live auto-save    │
├─────────────────────────────────────────────────────────┤
│ Existing app  (hooks → localStorage + IndexedDB)  UNCHANGED
└─────────────────────────────────────────────────────────┘
```

### 1. PWA / installability

- Add `vite-plugin-pwa` (Workbox) to precache the built assets → offline-capable.
- Web manifest: name "Tallio", theme/background colors, `display: standalone`, app
  icons at 192×192, 512×512, plus a maskable icon. Replace the default `vite.svg`
  favicon with a real Tallio icon set in `public/`.
- **Self-host the fonts.** `index.html` currently loads Fraunces / Geist / Geist Mono /
  IBM Plex Mono from Google's CDN. Download the `woff2` files into `public/fonts/`, add
  `@font-face` rules, and remove the `<link>`s. This makes the app truly offline **and**
  stops leaking every visitor's IP to Google (aligns with the no-cloud ethos).
- Result: friend opens the link → browser offers "Install app" → real icon in
  taskbar/dock, own window, works with no internet.

### 2. Persistent storage & health

- On load (feature-detected), call `navigator.storage.persist()` so the browser will
  not evict Tallio's data under disk pressure.
- Small **storage-health indicator** using `navigator.storage.estimate()` (usage vs.
  quota, persistent yes/no). Reassures the reconcile-to-the-dollar audience and gives an
  early warning long before any limit.

### 3. Backup / restore — universal (every browser)

- **Export** already exists: `buildArchive({...})` → zip Blob → download. Standardize
  the filename/extension to **`.tallio`** (zip contents; gives the file its own identity
  and is forward-compatible with the Phase-2 Tauri file association). Current code writes
  `tallio-<date>.zip` at `App.jsx:452`; update to `<name>.tallio`.
- **Import / Restore** (new — the missing half). File `<input type="file">` →
  `parseArchive(bytes)` → load into the app via the **same snapshot-restore mechanism the
  Undo system already uses** (`App.jsx:190-201`):
  - `ledger.restore(...)` ← `data.accounts` + `data.transactions`
  - `cats.restore(data.categories)`
  - `accountTypes.restore(data.accountTypes)`
  - `acks.restore(data.reportAcks)`
  - `appearance.restore(appearance)`
  - `library.restore(images)`
  - **`templates.restore(data.templates)`** — NOTE: templates is exported
    (`templates.exportSnapshot()`) but is **not** part of the Undo snapshot, so a
    matching `restore` path for templates must be verified/added.
- Guardrails: confirm-before-replace dialog (import overwrites current data),
  `schemaVersion` check (archive is v5) with a clear message on mismatch, friendly error
  handling for a corrupt/non-Tallio file (never a blank crash).
- A gentle **"last backed up N days ago"** nudge so users keep a fresh backup.

### 4. Linked live file — Chromium progressive enhancement (Chrome/Edge)

Feature-detected on `window.showSaveFilePicker`. Hidden entirely where absent
(Safari/Firefox get section 3 only).

- **"New budget file…" / "Open budget file…"** via `showSaveFilePicker` /
  `showOpenFilePicker`. Keep the returned `FileSystemFileHandle`; persist it in
  IndexedDB (reuse `imageStore.js`'s DB) so it survives reload. On launch, re-request
  permission (`handle.queryPermission` / `requestPermission`) to auto-reopen the file.
- **Model: browser storage stays the working store; the linked file is an auto-synced
  mirror.**
  - *Open/link* = file → app: `parseArchive` → restore into hooks (same path as §3),
    with a confirm (it replaces current working data).
  - *Edits* = app → file: debounced autosave (`buildArchive` → write to handle).
- **Write cadence (avoid re-zipping a large image library on every keystroke):** core
  financial data drives a fast debounce; the full archive including images is written on
  a coarser cadence (e.g. on window `blur` / visibilitychange / an idle timer). Exact
  thresholds are an implementation detail for the plan.
- **Status pill:** "Linked to `MyBudget.tallio` · saved just now" vs. "Not linked ·
  using browser storage."
- Wrap FSAA in a small **adapter module** (e.g. `fileStore.js`) so the picker/handle
  APIs and the `<input>` fallback are behind one interface and are mockable in tests.

### 5. Deploy

- `vite build` → deploy static output to **Cloudflare Pages** (or Netlify) with a
  **custom domain** (~$10/yr). HTTPS is provided by the host and is required anyway
  (PWA, File System Access API, and `storage.persist()` all need a secure context).
- No backend, no database, no serverless functions — purely static file hosting. The
  domain name is TBD (e.g. an available `tallio.*`).

## File format

Reuse the existing archive verbatim: a zip (via `fflate`) containing `data.json`
(accounts, transactions, categories, accountTypes, reportAcks, templates),
`transactions.csv`, `appearance.json`, and `images/`. Only the **extension/identity**
changes to `.tallio`; the bytes are still a valid zip. `schemaVersion` stays 5.

## Testing

- Unit-test the **import → restore round-trip** (builds on the existing `parseArchive`
  tests in `exportArchive.test.js`): `buildArchive` → `parseArchive` → restore into
  mock hooks reproduces the original state, **including templates**.
- Test the file-layer **adapter** with both backends mocked: FSAA path (handle
  read/write, permission re-request) and the `<input>`/download fallback.
- Feature-detection guards (`persist`, `showSaveFilePicker`) must no-op cleanly under
  jsdom so the existing suite stays green.
- Manual verification pass: install as a PWA and load it offline; on Chrome, link a
  file, edit, confirm autosave, reload, confirm auto-reopen; on Safari + Firefox,
  confirm export + import work and the live-file UI is absent.

## Risks & mitigations

- **Browser storage eviction / "Clear browsing data" wipes data.** → `storage.persist()`
  + prominent, easy backup/restore + backup-age nudge.
- **Users distrust "it's on a website."** → in-app copy explaining data never leaves
  their device; the visible `.tallio` file makes ownership concrete.
- **Re-zipping images on autosave is expensive.** → split write cadence (§4).
- **FSAA is Chromium-only.** → strict feature detection + universal export/import
  fallback; true cross-OS live file deferred to the Tauri phase.
- **Fonts fail offline.** → self-host (§1).

## Out of scope (restated)

Tauri desktop app + true live-document file (Phase 2); mobile layout (Phase 3); any
cloud/multi-device sync (never).
