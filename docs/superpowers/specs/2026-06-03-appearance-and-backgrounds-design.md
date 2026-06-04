# Appearance & Backgrounds ("Make it Mine") — Design Spec

**Date:** 2026-06-03

**Status:** First slice of a larger "make Tallio fun & personal" initiative. Later, independent specs will cover **phone batch-photo upload**, **celebrations / milestone rewards**, and **playful extras** (easter eggs, seasonal, sound). Those are explicitly out of scope here (see _Out of Scope_).

## Goal

Make Tallio feel like the user's own space rather than a sterile finance tool, through two cohesive capabilities:

1. **Appearance** — 6 ship-ready preset themes plus a single custom theme where the user tunes ~6 essential colors with live preview.
2. **Backgrounds & image-icons** — choose a background (solid, preset wallpaper, or the user's own uploaded photos as a single image or crossfading slideshow), optionally layer animated **effects** (Aurora drift / Nocturne pulse) whose colors are sampled from the photo, and replace **any icon anywhere** with an uploaded image. Uploaded images live in a named, grouped, searchable **library**.

The guiding constraint throughout: **readability is never sacrificed** — the user reconciles reports to the dollar, so numbers must stay legible at every setting.

## Background (current code)

- The app is a React 19 + Vite SPA. The whole visual system is driven by **CSS custom properties** declared in `:root` in `src/App.css` (`--bg`, `--bg-card`, `--text`, `--accent`, `--green`, `--red`, plus ~15 derived tokens for borders, hovers, `*-dim`/`*-border` tints, shadows). The global `--ui-scale` knob already proves runtime CSS-variable control works.
- `src/useSettings.js` is the established pattern for persisted preferences: load-from-`localStorage` initializer + a `save()` that writes through. Keys are namespaced `tallio-*`. `src/SettingsPanel.jsx` is a modal (API key, model, display size).
- The app root (`src/App.jsx:332`) is `.app-root` containing a fixed `.app-bg-gradient` (`:333`) and the `.container` (`:444`); a grain texture is drawn via `.app-root::after`. `index.css` sets the `#root { zoom: var(--ui-scale) }` and the base `body` background.
- Icons today are emoji strings. `src/IconPicker.jsx` exports `CURATED_ICONS` and an `IconPicker({ value, onChange })` popover (emoji grid + a free-text field for custom emoji). Categories carry an `icon` field (`src/useCategories.js`, `src/categoriesDefaults.js`).
- `src/categoriesSearch.js` already establishes a pure search/filter helper pattern (reused here for the library search).
- `src/exportArchive.js` zips with `fflate` (`zipSync`) — the hook point for bundling images into backups.

## Architecture overview

A new **Appearance screen** (peer of Register / Reports / Manage), opened from a palette button in the header next to the Settings gear. It has three sub-tabs: **Theme**, **Background**, **Image Icons**. The existing Settings modal is unchanged.

Two persistence tiers, split by size:

- **Small settings → `localStorage`** under a single `tallio-appearance` JSON key, owned by a new `useAppearance` hook (mirrors `useSettings`).
- **Large image blobs → IndexedDB** via a new `imageStore.js` wrapper.

`useAppearance` applies the active theme by writing CSS variables onto `document.documentElement`, so the entire app — which already reads those variables — updates instantly (free live preview). It also exposes the resolved background config to a new `<BackgroundLayer>`, and the icon image cache to a new `<Icon>` renderer.

The work is delivered in **three shippable phases** within this one spec.

## Data Model

### `tallio-appearance` (localStorage, one JSON object)

```
{
  themeId: 'nocturne' | 'parchment' | 'slate' | 'forest' | 'twilight' | 'graphite' | 'custom',
  customTheme: { bg, surface, text, accent, income, expense } | null,  // present only when used
  background: {
    base: 'solid' | 'preset' | 'photos',
    presetId: string | null,           // when base === 'preset'
    photoIds: string[],                // when base === 'photos' (ordered); used when photoGroup is null
    photoGroup: string | null,         // optional: if set, slideshow source = this library group (overrides photoIds)
    mode: 'single' | 'slideshow',
    intervalSec: number,               // slideshow crossfade interval; default 30
    intensity: number,                 // 0..100; drives scrim opacity + surface translucency
    effects: { aurora: boolean, pulse: boolean }
  },
  appIcons: { [slot: string]: string } // app-level icon overrides → image id (e.g. headerAvatar)
}
```

### IndexedDB `tallio-images` (object store, keyed by `id`)

```
{
  id, blob, type, w, h,
  name: string,              // user-facing label, searchable
  group: string,             // 'Family' | 'Pets' | 'Scenery' | custom group name
  thumb: Blob,               // small (~96–128px) pre-cropped square for icon use
  palette: string[],         // dominant colors extracted once, cached for effects
  createdAt: number
}
```

### Icon references (inline)

A category/account `icon` field holds **either** an emoji (`"🛒"`) **or** an image token (`"img:<imageId>"`). App-level icons use the `appIcons` map. A single resolver (`<Icon>`) interprets both. "Default icons" in pickers are the existing `CURATED_ICONS` emoji — not stored in IndexedDB.

## Approach

- **Theming is data + derivation.** Presets are seed objects of the 6 essentials (plus optional explicit overrides to preserve hand-tuned nuance — e.g. Nocturne's desaturated-blue `--text-muted`). A pure `deriveTheme(essentials, overrides?)` computes the full CSS-variable set the app already consumes; it keys off text-vs-background luminance so **light themes (Parchment) derive correctly**. The custom editor exposes only the 6 essentials and derives the rest, guaranteeing internal consistency.
- **Backgrounds are one fixed layer** rendered behind `.container`, composed back-to-front: Base → Effects → Scrim → (content above). A single `intensity` value drives both the scrim opacity and surface translucency/blur (via `--surface-alpha` / `--surface-blur` CSS variables consumed by card styles).
- **Effects sample the photo.** Dominant colors are extracted once per image (downscaled offscreen canvas) and cached on the IndexedDB record; effects read the cache and refresh on slideshow advance; Solid/preset bases fall back to theme colors.
- **Icons go through one renderer.** All icon rendering is routed through `<Icon value=…>` so emoji and uploaded images render uniformly with a graceful fallback glyph for missing/deleted images.
- **Reuse existing patterns:** `useSettings`'s load/save shape, `categoriesSearch`'s pure-filter style, `IconPicker`'s popover, `exportArchive`'s `fflate` zipping.

---

## Phase 1 — Theming foundation

### 1.1 `src/themes.js` (new)
- `PRESETS`: array of `{ id, name, isLight, essentials:{bg,surface,text,accent,income,expense}, overrides?:{…} }`. **Nocturne's seed = exactly today's `:root` values** (verified pixel-identical).
- `deriveTheme(essentials, overrides)` → full token map matching the names in `App.css :root` (`--border`, `--border-strong`, `--bg-card-hover`, `--text-muted`, `--text-dim`, `--accent-dim`, `--green-dim`, etc.). Derivation: alpha tints off text/accent, hover = surface nudged toward text, light/dark direction chosen by luminance.
- `contrastRatio(fg, bg)` (WCAG) helper for the readability guard.

### 1.2 `src/useAppearance.js` (new)
- Load/save `tallio-appearance` from localStorage (resilient to quota/privacy errors like `useSettings`).
- `applyTheme()`: resolve active tokens (preset or `deriveTheme(customTheme)`) and `setProperty` each onto `document.documentElement`. Runs on mount and whenever theme state changes.
- Exposes: `themeId`, `customTheme`, `setTheme(id)`, `updateCustom(partial)`, `resetCustomToPreset(id)`, plus the `background` config and setters (used in Phase 2).

### 1.3 `src/AppearanceScreen.jsx` (new) + header entry
- New screen with the three sub-tabs; registered in `App.jsx`'s screen switch and a palette button added to the header (`App.jsx` header region).
- **Theme tab:** 6 preset swatches (select → `setTheme`); "My Theme" editor with 6 labeled color inputs → `updateCustom` (applies live); **Reset** → `resetCustomToPreset`. A **non-blocking** "Hard to read here" hint appears when `contrastRatio(text, bg)` or `contrastRatio(text, surface)` drops below threshold.

### 1.4 `App.css`
- Move the literal `:root` values into being the Nocturne preset seed (kept identical). Add `--surface-alpha` / `--surface-blur` defaults (1 / 0) consumed by card backgrounds in Phase 2.

---

## Phase 2 — Backgrounds

### 2.1 `src/imageStore.js` (new) — IndexedDB wrapper
- `putImage(file, {name, group})`, `getImage(id)`, `listImages()`, `updateImageMeta(id, {name, group})`, `deleteImage(id)`.
- On `putImage`: **re-encode + size-cap** the original (max edge ~2560px) to bound storage; generate the square `thumb`; run color extraction → `palette`.

### 2.2 `src/imageColors.js` (new)
- `extractPalette(bitmap)` → few dominant colors via a ~32×32 offscreen-canvas downscale + simple clustering. Deterministic for a given pixel array (testable).

### 2.3 `src/BackgroundLayer.jsx` (new)
- Fixed, full-viewport, behind `.container` (inserted in `App.jsx` near `:333`; the default `.app-bg-gradient` shows only for the Solid base, hidden when a photo/wallpaper is active).
- **Base:** solid / preset wallpaper / photos. Slideshow = two stacked layers crossfading every `intervalSec`.
- **Effects:** Aurora drift and Nocturne pulse as CSS-animated divs, colored from the active image's `palette` (theme colors as fallback). **`prefers-reduced-motion: reduce` → static, no animation;** slideshow crossfade shortens/stops.
- **Scrim:** opacity = `intensity`; veil color adapts to theme luminance (dark veil on dark themes, light on Parchment).
- Sets `--surface-alpha` / `--surface-blur` from `intensity` so cards go solid → frosted.

### 2.4 Background tab (in `AppearanceScreen`)
- Base selector; live preview; **Effects** toggles; **Intensity** slider; under "Your photos": upload (file picker), reorder, single vs slideshow, interval, and optional "use group as slideshow source."
- Preset wallpapers: a small bundled curated set (static assets).

### 2.5 `src/exportArchive.js`
- Extend the archive to **bundle image blobs** (+ their metadata) and the `tallio-appearance` settings, so a backup is complete; import restores them. Document the larger backup size.

---

## Phase 3 — Image-icons & library

### 3.1 `src/Icon.jsx` (new) — universal renderer
- `<Icon value={…} className?>`: emoji → text; `img:<id>` → rounded/circular `<img>` (`object-fit: cover`) from the in-memory cache; missing → fallback glyph.
- Startup: `useAppearance`/`imageStore` loads all icon `thumb`s into an in-memory **object-URL cache** so `<Icon>` renders **synchronously** (no flicker in long Register lists). URLs revoked on cleanup.

### 3.2 Route all icons through `<Icon>`
- Audit category, account, nav, and header-avatar icon rendering; replace direct emoji output with `<Icon>`.

### 3.3 `src/IconPicker.jsx` — extend
- Keep `CURATED_ICONS` grid (now under a **"Default icons"** section). Add **"Your images"** (the library, grouped) and an **Upload** action with a **square crop/zoom** step (drag to position, zoom slider). One uploaded image is reusable across many icons. Selecting an image sets the field to `img:<id>`.

### 3.4 Image library (Image Icons tab + picker)
- Named, grouped, **searchable** list. Suggested groups **Family / Pets / Scenery** + "＋ New group". Search filters by `name` across sections (pure helper in the `categoriesSearch` style).
- View / rename / re-group / **delete**. Deleting an in-use image → `<Icon>` falls back to a glyph; a "used by N" hint is shown (graceful, no hard reference-counting).

---

## Testing (inline TDD — vitest + RTL, already in project)

- **Unit:** `deriveTheme` (token completeness; light vs dark direction; Nocturne seed reproduces current `:root`); `contrastRatio` + guard threshold; `extractPalette` (deterministic on known pixels); intensity→(scrim, surface) mapping; `imageStore` CRUD (fake-indexeddb); library search filter.
- **Component:** Appearance screen tab switching; custom-color edit applies to `document.documentElement` live + Reset restores preset; `BackgroundLayer` base/effects/scrim selection and reduced-motion fallback; `IconPicker` upload→crop→select flow; `<Icon>` emoji vs `img:` vs missing-fallback.

## Accessibility & quality

- `prefers-reduced-motion` honored by effects and slideshow.
- Custom-theme contrast guard (non-blocking warning).
- Picker/crop modals: keyboard + Escape, aria labels (match `SettingsPanel`).
- Scrim guarantees legible text at any intensity/theme.

## Out of Scope (future, separate specs)

- 📱 **Phone batch-photo upload** — extend the existing PeerJS pairing (`PairingPanel` / `usePhonePeer` / `PhoneCapture`) to send multiple photos straight into `imageStore`. The store is built **source-agnostic** so this needs no rework here.
- 🎉 **Celebrations / milestone rewards** (savings-goal hit, debt paid off, month reconciled).
- ✨ **Playful extras** — easter eggs, seasonal touches, sound cues, micro-interactions.
- Multiple saved custom themes (one "My Theme" slot for now).
- Cross-device image sync (images stay local; backups carry them).
