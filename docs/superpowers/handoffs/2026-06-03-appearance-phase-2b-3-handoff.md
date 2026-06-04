# Handoff — Appearance: Phase 2b (photos) & Phase 3 (image-icons + library)

**Date:** 2026-06-03
**Branch:** `rename-to-tallio` (continue here — extends open **PR #10**)
**Status:** Phase 1 (themes) ✅ and Phase 2a (background rendering) ✅ are done, pushed, and user-verified. Next: **Phase 2b**, then **Phase 3**.

---

## TL;DR for the next session

Continue the "Make it Mine" Appearance feature. The design is already specced and approved; you're picking up at **writing + executing the Phase 2b plan**. Follow the user's workflow: **inline TDD by you (Claude), with a checkpoint after each task — NOT subagents.** Commit per task. Stay on `rename-to-tallio` (it extends PR #10).

**Paste-ready prompt is at the bottom of this file.**

---

## What's already built (don't redo)

All on `rename-to-tallio`, in PR #10.

**Phase 1 — Theming**
- `src/themes.js` — `hexToRgb/mix/alpha/relativeLuminance/contrastRatio`, `deriveTheme(essentials, overrides)`, `PRESETS` (nocturne, parchment, slate, forest, twilight, graphite), `essentialsForTheme`. **Nocturne reproduces the old `:root` exactly** (test-locked — don't change those values).
- `src/useAppearance.js` — persists `tallio-appearance` in localStorage; applies the theme to `document.documentElement` via CSS variables. Exposes `themeId, customTheme, background, appIcons, setTheme, updateCustom, resetCustomToPreset, updateBackground`.
- `src/ThemeTab.jsx`, `src/AppearanceScreen.jsx` (3 tabs: Theme / Background / Image Icons — Image Icons still a "coming soon" placeholder).
- `App.jsx`: 🎨 header button → `setScreen('appearance')`; `<AppearanceScreen>` rendered.

**Phase 2a — Background rendering**
- `src/backgroundMath.js` — `intensityToLayers(intensity)` → `{ scrimAlpha, surfaceAlpha, surfaceBlur }`. (surfaceAlpha/surfaceBlur are computed but **not yet applied to cards** — that's a 2b decision.)
- `src/BackgroundLayer.jsx` — fixed layer; renders Aurora/pulse effect divs (colored from theme CSS vars `--accent/--blue/--purple`) + a `.bg-scrim` (color `var(--bg)`, opacity = scrimAlpha). **Inert when base is solid AND both effects off** (no regression). Honors `reducedMotion` prop (defaults to `matchMedia`).
- `src/BackgroundTab.jsx` — effect toggles (role=switch) + intensity slider; calls `updateBackground`.
- `App.jsx`: `<BackgroundLayer background={appearance.background} />` mounted inside `.app-root` after `.app-bg-gradient`.
- `App.css`: `.bg-layer/.bg-aurora/.bg-pulse/.bg-scrim` + keyframes + `.bg-toggle` styles. `:root` already seeds `--surface-alpha: 1` / `--surface-blur: 0px`.

**Data model already in place** (`tallio-appearance` JSON):
```
{ themeId, customTheme|null,
  background: { base:'solid'|'preset'|'photos', presetId, photoIds:[], photoGroup,
               mode:'single'|'slideshow', intervalSec:30, intensity:25,
               effects:{aurora,pulse} },
  appIcons: {} }
```
The `photos/preset/slideshow/photoGroup/presetId` fields exist in the default shape but are **not yet consumed** — Phase 2b wires them up.

---

## Repo conventions (IMPORTANT — these bit us in Phase 1)

- **Tests:** Vitest + @testing-library/react, jsdom. Component tests **must** `import { cleanup } from '@testing-library/react'` and `afterEach(() => cleanup())`. **No jest-dom** — use `.toBeTruthy()`, `.getAttribute()`, `container.querySelector(...)`, NOT `toBeInTheDocument()`/`toHaveAttribute()`.
- Run one file: `npx vitest run src/foo.test.jsx`. Full suite: `npx vitest run` (currently **662 tests / 53 files**, all green).
- Controlled inputs use `onChange` (works with `fireEvent.change`/`.input`).
- Lint: `npx eslint <files>` — keep 0 errors. (One pre-existing warning in `CameraCapture` `useEffect` deps is not ours; ignore.)
- Commits: per task, with trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. The `LF will be replaced by CRLF` git warnings are benign on Windows.
- Build sanity: `npm run build` (the >500kB chunk warning is pre-existing).

## Workflow conventions (user preference)

- Flow: brainstorm → spec → plan → **inline TDD by Claude** with checkpoints. The user reviews between tasks. Do **not** dispatch subagents for implementation.
- After a phase: run `finishing-a-development-branch`; the user has chosen to **keep accumulating on `rename-to-tallio` / extend PR #10** (push updates the PR). Update the PR title/body to stay accurate.
- The user is a meticulous father tracking household finances; **readability must never regress** (reports reconcile to the dollar). He likes the **Forest** theme.

---

## Phase 2b — Photos & storage (next plan to write)

**Spec:** `docs/superpowers/specs/2026-06-03-appearance-and-backgrounds-design.md` (Phase 2 §2.1–2.5). Design is approved; go straight to `writing-plans` unless the user wants changes.

Scope:
1. **`src/imageStore.js`** — IndexedDB wrapper (`tallio-images` store): `putImage(file,{name,group})`, `getImage(id)`, `listImages()`, `updateImageMeta`, `deleteImage`. On put: re-encode + size-cap (~2560px), generate a square `thumb` (~96–128px), and cache a `palette` (dominant colors). Record: `{ id, blob, type, w, h, name, group, thumb, palette, createdAt }`.
2. **`src/imageColors.js`** — `extractPalette(pixels, w, h)` **pure** (operates on a `Uint8ClampedArray`) so it's unit-testable; a thin `imageToPixels(bitmap)` canvas wrapper is verified manually.
3. **Background base = photos** in `BackgroundLayer`: render the chosen image; **slideshow** = two stacked layers crossfading every `intervalSec` (reduced-motion shortens/stops). Effects read the **photo's cached palette** instead of theme colors when a photo is active.
4. **Surface frosting** (deferred from 2a): make card surfaces consume `--surface-alpha`/`--surface-blur` (e.g. `background: color-mix(in srgb, var(--bg-card) calc(var(--surface-alpha)*100%), transparent); backdrop-filter: blur(var(--surface-blur))`). **Risk:** touches core card styling app-wide — keep it a no-op at defaults (alpha 1 / blur 0) and only let `BackgroundLayer` drive these vars when a photo/effect is active. Verify no readability regression in Register/Reports/Manage.
5. **Background tab additions:** base selector (Solid / Preset wallpaper / Your photos), upload (file picker) + reorder, single vs slideshow + interval, "use group as slideshow source."
6. **Preset wallpapers:** a small bundled set of static assets.
7. **`src/exportArchive.js`:** bundle image blobs + `tallio-appearance` into the zip (`fflate` already used); restore on import. Note larger backups.

**Testability constraints (plan around these):** jsdom has **no canvas rendering and no IndexedDB**. Add `fake-indexeddb` as a devDependency for `imageStore` tests. Keep palette **clustering pure** (test on known pixel arrays). Canvas-dependent thin wrappers (re-encode, thumbnail, imageToPixels) are verified manually in `npm run dev`, not unit-tested. Consider splitting 2b into 2b-i (store + pure pixel/palette logic) and 2b-ii (photo rendering/slideshow/frosting/wallpapers/export) if it gets large.

## Phase 3 — Image-icons & library (after 2b)

**Spec:** same file, §3.1–3.4.
- `src/Icon.jsx` universal renderer: emoji → text; `img:<id>` → rounded `<img>` from an in-memory object-URL cache (loaded at startup so long lists render synchronously); missing → fallback glyph.
- Route **all** icon rendering through `<Icon>` (categories, accounts, nav, header avatar). Category/account `icon` field becomes emoji **or** `img:<id>`.
- Extend `src/IconPicker.jsx`: "Default icons" (existing `CURATED_ICONS`) + "Your images" gallery + Upload with a **square crop/zoom** step.
- Image **library**: named, grouped (Family/Pets/Scenery + custom), **searchable** (pure filter à la `src/categoriesSearch.js`). Delete → graceful glyph fallback + "used by N" hint.

## Out of scope (separate future specs — do NOT fold in)

- 📱 Phone batch-photo upload (extend existing PeerJS pairing → imageStore; store is built source-agnostic for it).
- 🎉 Celebrations / milestone rewards.
- ✨ Playful extras (easter eggs, seasonal, sound).
- Multiple saved custom themes; cross-device image sync.

---

## Paste-ready prompt for the next session

> Continue the Tallio "Make it Mine" Appearance feature on the `rename-to-tallio` branch (extends PR #10). Phase 1 (themes) and Phase 2a (background rendering) are already done, pushed, and verified — read `docs/superpowers/handoffs/2026-06-03-appearance-phase-2b-3-handoff.md` first for full context, conventions, and what's already built.
>
> Next is **Phase 2b — your own photos**: IndexedDB image store, upload + square crop, single image or crossfading slideshow, effects that sample the photo's colors, surface frosting via `--surface-alpha`/`--surface-blur`, preset wallpapers, and bundling images into the export archive. The design is already in `docs/superpowers/specs/2026-06-03-appearance-and-backgrounds-design.md` (Phase 2 §2.1–2.5) and is approved, so go straight to the `writing-plans` skill to create the Phase 2b plan, then execute it with **inline TDD and a checkpoint after each task (no subagents)**, committing per task.
>
> Mind the repo's test conventions: Vitest + RTL, `afterEach(cleanup)`, no jest-dom (`.toBeTruthy()`/`getAttribute`), `npx vitest run`. jsdom has no canvas/IndexedDB — add `fake-indexeddb` for store tests and keep palette/clustering logic pure & unit-tested; verify canvas wrappers manually via `npm run dev`. Keep readability uncompromised (the user reconciles reports to the dollar). After 2b, do **Phase 3 — image-icons + library**.
