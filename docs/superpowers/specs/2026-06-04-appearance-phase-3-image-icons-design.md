# Appearance Phase 3 — Image-Icons, Library & Appearance-Undo — Design Spec

**Date:** 2026-06-04

**Status:** Third and final phase of the "Make it Mine" Appearance initiative. Phase 1 (theming) and Phase 2a (background rendering) are merged (PR #10); Phase 2b (photo backgrounds + polish) is in open PR #11. This phase stacks on `appearance-phase-2b`.

This spec refines and supersedes §3.1–3.4 of `2026-06-03-appearance-and-backgrounds-design.md` and absorbs the "Undo deferred to Phase 3" note from `2026-06-04-appearance-phase-2b-polish-design.md`.

## Goal

Let the user replace **any icon anywhere** with one of their own photos, managed in a named/grouped/searchable **library**, and make all appearance changes **undoable** through the app's existing Ctrl+Z. The guiding constraint is unchanged: **readability is never sacrificed**, and a deleted-but-in-use image must degrade to a glyph, never crash — the user reconciles reports to the dollar.

## Locked design decisions (from brainstorming)

1. **Icon crop = baked square thumb.** On crop "Done", re-encode one small (~160px) square `thumb` from the retained full `blob`, baking the chosen crop. `<Icon>` then renders a plain `<img object-fit:cover>` — synchronous, tiny memory, crisp. The crop framing `{posX,posY,zoom}` is also persisted so the editor reopens where the user left off; re-cropping re-encodes from the full blob (no cumulative quality loss). **One crop per image**, shared by every icon that references it (no per-icon crops).
2. **IconPicker = two tabs** ("Emoji" / "Your images") with search + Upload pinned on the Images tab. Default tab is **context-aware**: open to "Your images" when the field already holds an `img:` token, otherwise "Emoji".
3. **Image Icons tab = grouped square thumbs**, name-searchable, each managed by a shared **⋮ ActionMenu** (Adjust crop / Rename / Move to group ▸ / Delete). The same `ActionMenu` replaces the inline Adjust/Rename/× buttons on the Background "Your photos" cells (consistency refactor).
4. **Appearance undo = folded into the global Ctrl+Z** (option B), with **opKey coalescing** so continuous controls (sliders, color inputs) collapse into a single undo step rather than flooding the shared 20-slot history. A visible **⎌ Undo** button in the Appearance header triggers the same global undo. Undo-only (no redo).
5. **`<Icon>` cache = React context provider** (`IconLibraryProvider`) mounted at the app root, owning a single image-library instance and an incremental object-URL map. Engineer's call (no behavioral fork); chosen for codebase idiom (hooks, no global singletons) and clean revocation via effect cleanup.
6. **Shared `FramingEditor`**: extract the Phase 2b drag-pan + zoom editor from `BackgroundTab` into one reusable component, used by both the Background "Adjust framing" flow and the icon crop modal. Phase 2b behavior stays identical.
7. **Fallback glyph** for a missing/deleted image id is **🖼️** (overridable via an `<Icon fallback>` prop).

## Data model

### IndexedDB `tallio-images` record — one new field

```
{ id, blob, type, w, h, name, group, thumb, palette, createdAt,
  iconCrop: { posX, posY, zoom }   // NEW — square crop framing; defaults {50,50,1} (centered, no zoom)
}
```

- `thumb` is re-baked from `blob` on every crop commit, so it always reflects the current `iconCrop`.
- Records created before Phase 3 (Phase 2b photos) simply lack `iconCrop`; readers default it via the existing `clampFraming`, and their `thumb` is the original center-crop until the user adjusts.

### `tallio-appearance` (localStorage) — unchanged shape

`appIcons: { [slot]: string }` already exists; Phase 3 begins using it. The one concrete slot this phase ships is **`headerAvatar`**: a small avatar element in the app header renders `<Icon value={appIcons.headerAvatar} fallback='✦'>`, set via an `IconPicker` in a small "App icons" section at the top of the Image Icons tab. The `appIcons` mechanism (+ `setAppIcon`, snapshot/restore, undo) is general so future slots need no rework. Category/account `icon` continues to hold an emoji **or** an `img:<id>` token.

### Icon reference resolution

A single pure parser interprets the `icon` string everywhere:
- `"🛒"` → emoji
- `"img:<id>"` → image (rendered by `<Icon>`; `iconGlyph` substitutes the fallback in text-only contexts)
- `""`/nullish → empty

## Architecture

### Pure modules (unit-tested; no canvas, no React)

- **`src/iconValue.js`**
  - `parseIconValue(value)` → `{ kind: 'emoji' | 'image' | 'empty', emoji?, id? }`.
  - `iconGlyph(value, fallback = '🖼️')` → the emoji for emoji values, the `fallback` glyph for `img:` values, `''` for empty. Used in `<option>` / text-only spots that cannot embed an `<img>`.
- **`src/iconCrop.js`**
  - `cropRect(srcW, srcH, framing)` → `{ sx, sy, sw, sh }`: the square source rectangle to pass to `drawImage`, derived from `clampFraming(framing)` (`posX/posY` focal %, `zoom`). Square output. Deterministic → unit-tested on known dimensions.
  - Reuses `clampFraming` from `backgroundPhotos.js` (square aspect, identical shape).
- **`src/iconUsage.js`**
  - `countIconUsage(imageId, { categories, accounts, accountTypes, appIcons })` → integer count of references to `img:<imageId>` across categories (incl. subcategories), accounts, account types, and app icon slots. Best-effort for the "used by N" hint; never blocks deletion.
- **`src/appearanceHistory.js`**
  - `coalesceHistory(prev, makeEntry, opKey, cap = 20)` → next history array. If `opKey` is truthy and equals the top entry's `opKey`, returns `prev` unchanged (coalesce); otherwise appends `makeEntry()` (tagged with `opKey`) and trims to `cap`. Pure → unit-tested independently of `App.jsx`.

### Canvas module (MANUAL-VERIFY boundary; pure math extracted)

- **`src/imageProcess.js`** — add `recropThumb(blob, framing, { thumbSize = 160 } = {})`: `createImageBitmap(blob)` → `cropRect` → `drawImage` square → `toBlob`. Returns a new `thumb` Blob. The pixel math is `cropRect` (pure, tested); the canvas call is verified via `npm run dev`, mirroring `processImageFile`.

### React modules

- **`src/IconLibraryProvider.jsx`** (+ `IconLibraryContext`)
  - Mounted once at the app root. Owns a single `useImageLibrary()` instance.
  - Maintains an **incremental** `Map<id, objectURL>` built from each record's `thumb`: create URLs only for new ids, revoke URLs for removed ids, keep stable URLs for unchanged ids (no flicker on add/delete). Object-URL creation wrapped in try/catch (jsdom throws); the lifecycle effect consolidates to a single `setState` with a scoped `// eslint-disable-next-line react-hooks/set-state-in-effect`.
  - Exposes `{ images, urlForId(id), addFromFile, remove, updateMeta, reload }`. `AppearanceScreen` consumes the same context so uploads/deletes are reflected app-wide and in `<Icon>` simultaneously.
  - All URLs revoked on unmount.
- **`src/Icon.jsx`**
  - `<Icon value className title fallback='🖼️'>`. Uses `parseIconValue`:
    - emoji → `<span aria-hidden>` text (matches today's markup so styling/`aria-hidden` is preserved).
    - image → `<img src={urlForId(id)} class="icon-img" />` with `object-fit: cover`, rounded; `alt=""`.
    - image id missing from cache (deleted, or not yet loaded) → the `fallback` glyph span.
  - Reads the cache synchronously from context; no per-instance async.
- **`src/ActionMenu.jsx`**
  - Shared kebab control: a `⋮` trigger button (`aria-haspopup`, `aria-expanded`) + a popover list of `{ label, onSelect, danger? }` items. Escape and outside-click close; arrow/enter optional. Mirrors `SettingsPanel`/popover a11y conventions.
- **`src/FramingEditor.jsx`**
  - Extracted from `BackgroundTab`: the `.bg-framing-clip` drag-to-pan surface (pointer + arrow keys) + zoom slider, driven by `clampFraming`/`panFraming`, with the guarded object-URL preview. Props: `{ imageBlob | imageUrl, framing, onChange, aspect='square'|'free' }`. `BackgroundTab` is refactored to use it (behavior unchanged); the icon crop modal uses it with `aspect='square'`.
- **`src/ImageCropModal.jsx`**
  - Modal wrapping `FramingEditor` (square) + Done/Cancel. On Done, calls back with the final `iconCrop`; the caller runs `recropThumb` and persists `{ thumb, iconCrop }` via `updateMeta`. Keyboard + Escape + aria like `SettingsPanel`.
- **`src/ImageIconsTab.jsx`**
  - Replaces the "coming soon" placeholder. A small **App icons** section at the top exposes the `headerAvatar` slot via `IconPicker` (→ `setAppIcon('headerAvatar', value)`). Below it: toolbar (search, ↑ Upload, ＋ New group); grouped square thumbs; each thumb has an `ActionMenu` (Adjust crop → `ImageCropModal`; Rename → inline; Move to group ▸ → submenu of groups + "New group…"; Delete → inline confirm showing `countIconUsage` "Used by N"). Search filters by `name` across groups via a pure helper in the `categoriesSearch` style.
- **`src/IconPicker.jsx`** — extended
  - Two tabs: **Emoji** (existing `CURATED_ICONS` grid + paste field) and **Your images** (grouped gallery + search + ↑ Upload). Selecting an emoji → `onChange(emoji)`; selecting an image → `onChange('img:' + id)`. Upload opens `ImageCropModal`, processes + crops, adds to the library, and selects the new image. Default tab is context-aware (Images when `value` is `img:`).
  - The trigger preview uses `<Icon value={value}>` so the current image shows in the button.
  - Optional cleanup: move `CURATED_ICONS` to `src/curatedIcons.js` to clear the pre-existing `react-refresh/only-export-components` lint error.

### Routing audit — replace direct emoji output with `<Icon>`

Display contexts → `<Icon value={…}>`:
`AccountList`, `AccountTypesScreen`, `CategoryBarList`, `CategoryBreakdown` (3 spots), `CategoryEditor` (preview at `:104`), `ManageCategoriesScreen` (`:123`), `Register` title (`:61`), `TransactionRow` (2 spots), and a **new** small header avatar element in `App.jsx` (`value = appIcons.headerAvatar`, `fallback='✦'`).

`<option>` contexts (cannot embed an `<img>`) → wrap with `iconGlyph(c.icon)`:
`Register` (`:74`), `TransactionEditor` (`:102`), `TransferEditor` (`:110`), `SplitsEditor` (`:115`), `CategoryEditor` (`:208`).

### Appearance undo (option B, in `App.jsx`)

- `useAppearance` gains:
  - `snapshot()` → plain copy of `{ themeId, customTheme, background, appIcons }`.
  - `restore(snap)` → `setState(snap)` + persist (the existing theme-apply effect re-applies tokens to `:root`).
  - `setAppIcon(slot, value)` → set/clear an entry in `appIcons`.
- `App.jsx`:
  - `pushHistory(opKey = null)` includes `appearance: appearance.snapshot()` in each entry and uses `coalesceHistory` (skip when `opKey` matches the top entry's `opKey`). Entries are tagged with `opKey`.
  - `undo()` additionally calls `appearance.restore(entry.appearance)`.
  - Appearance setters are wrapped so each mutation calls `pushHistory(opKey)` first. Continuous controls pass a stable `opKey` (`appearance:custom:<colorKey>`, `appearance:bg:intensity`, `appearance:bg:effectStrength`, `appearance:bg:framing:<id>`, `appearance:bg:intervalSec`); discrete actions pass `null` (always a fresh step).
  - A visible **⎌ Undo** button is added to the Appearance header (`AppearanceScreen`), wired to the global `undo` (passed in as a prop); disabled when history is empty.
- **Scope:** theme (preset/custom), background (base, photos, framing, effects, intensity, effect strength), and `appIcons`. Category/account `icon` changes already ride the existing `categories`/`accountTypes` snapshots — no double-handling. Library image **add/delete** (IndexedDB) stays out of undo; its safety net is the "Used by N" delete confirm. A deleted image's `img:<id>` references simply fall back to the glyph via `<Icon>`/`iconGlyph`.

## Data flow

### Crop / upload
File → `processImageFile` (full `blob` + initial center `thumb` + `palette`) → `ImageCropModal` opens on the full blob → user pans/zooms → **Done** → `recropThumb(blob, iconCrop)` bakes the square thumb → `updateMeta(id, { thumb, iconCrop })` → `IconLibraryProvider` refreshes that id's object URL → every `<Icon img:id>` updates. "Adjust crop" later reopens the modal seeded with the saved `iconCrop`.

### Render
App root `IconLibraryProvider` loads records → diffs `thumb`s into object URLs. `<Icon img:id>` reads `urlForId(id)` synchronously (brief glyph only on the very first IndexedDB load), then stable and flicker-free in long Register lists.

## Accessibility & quality

- `ActionMenu` and `ImageCropModal`: keyboard operable, Escape to close, aria labels (match `SettingsPanel`).
- `<Icon>` images use `alt=""` / `aria-hidden` to match the existing decorative-icon treatment; names remain the accessible label.
- Reduced-motion behavior of backgrounds/effects is untouched.
- Readability guard from Phase 1 is untouched.

## Testing (inline TDD — vitest + RTL)

- **Pure unit:** `parseIconValue` / `iconGlyph`; `cropRect` (square source rect on known dims, clamping, zoom); `countIconUsage` (categories incl. subs, accounts, types, appIcons; zero when unused); IconPicker/library search filter; `coalesceHistory` (coalesce same opKey, push on different/null, cap trim); `useAppearance` `snapshot`/`restore` round-trip.
- **Component (RTL, `import { cleanup }` + `afterEach(() => cleanup())`, no jest-dom):** `<Icon>` emoji vs `img:` vs missing-fallback (stub `URL.createObjectURL`); `IconLibraryProvider` exposes URLs and falls back gracefully when IndexedDB is unavailable (fake-indexeddb + stubbed `URL`); `ActionMenu` open/select/Escape; `IconPicker` tab switch, select image → `onChange('img:id')`, Upload opens the modal; `ImageIconsTab` rename / move group / delete-with-used-by; routing smoke (a category whose `icon` is `img:` renders an `<img>`); appearance undo reverts a theme change and a coalesced slider drag via Ctrl+Z.
- **MANUAL-VERIFY (`npm run dev`):** `recropThumb` output quality; crop modal WYSIWYG; no flicker in long lists; `<option>` dropdowns show the glyph fallback; reduced-motion still honored.

## Out of scope (unchanged from the initiative)

Phone batch-photo upload; celebrations/milestones; playful extras; multiple saved custom themes; cross-device image sync; redo; undo of library image add/delete.

## Workflow & branch

Stacked on `appearance-phase-2b` (PR #11 open). Inline TDD, one commit per task, **pushed to the branch as work proceeds** so the PR stays current. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Lint each touched file to 0 new errors (pre-existing errors in `CategoryEditor.jsx`/`ColorPicker.jsx`/`spendingMath.js` are out of scope; the `IconPicker.jsx` `react-refresh` error is cleared by the optional `curatedIcons.js` move).
