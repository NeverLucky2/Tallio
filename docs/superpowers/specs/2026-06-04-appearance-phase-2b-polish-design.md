# Appearance Phase 2b — Polish (framing, effects, library management) — Design Spec

**Date:** 2026-06-04

**Status:** Approved. Follow-up to Phase 2b (photos), committed locally on `rename-to-tallio` (commits `d35e9f5..fce489d`, not yet pushed). This polish round addresses user feedback from visual verification, to land **before** pushing/PR-updating Phase 2b. Phase 3 (image-icons + library) follows.

## Context (what exists after Phase 2b)

- `src/imageStore.js` — IndexedDB blobs (`putImage/getImage/listImages/updateImageMeta/deleteImage`).
- `src/useImageLibrary.js` — `{ images, reload, addFromFile, remove, updateMeta }` (already supports rename/delete; no UI yet).
- `src/useBackgroundPhotos.js` — loads chosen photos → object URLs `[{ id, url, palette }]` + slideshow `activeIndex`.
- `src/BackgroundLayer.jsx` — presentational; renders solid/preset/photos base, then **effects, then scrim** (current order), sets `--surface-*`. Photo layers are `.bg-photo` with `background-size: cover; background-position: center` and an opacity crossfade.
- `src/BackgroundTab.jsx` — base selector, wallpaper picker, photo upload + **gallery (toggle into `photoIds`)**, single/slideshow, interval, group source, effect toggles, Intensity slider.
- `background` config: `{ base, presetId, photoIds[], photoGroup, mode, intervalSec, intensity, effects:{aurora,pulse} }`.

## User feedback driving this round

1. **Framing:** background photos are auto cover-fit/centered; user wants to choose *which part* of a photo shows.
2. **Rename:** can't rename an uploaded image.
3. **Delete:** can't delete an uploaded image.
4. **Single mode bug:** with `mode: 'single'`, multiple images can be selected and the *first* shows; selecting a new one should **replace** the prior.
5. **Undo (next phase):** wants to undo appearance changes — **deferred to Phase 3**, not built here.
6. **Effects invisible over a photo:** with a photo base + aurora/pulse, the photo just dims. Cause: the readability **scrim is painted on top of the effects** (Base→Effects→Scrim) at ~0.63 opacity by default, veiling them.

## Design

### 1. Photo framing — focal point + zoom (no re-encode)

**Data model.** Add to `background`:
```
framing: { [photoId: string]: { posX: number, posY: number, zoom: number } }
```
- `posX`/`posY` are 0–100 (percent focal point; default 50/50). `zoom` is 1–3 (default 1).
- Stored per-photo in the **background** config (not the image record): background framing (viewport aspect) differs from the future square icon crop. Default shape: `framing: {}` (missing entry ⇒ centered, no zoom).

**Rendering (`BackgroundLayer`).** For each `.bg-photo` layer, given the photo's framing `{posX,posY,zoom}` (or the default), apply inline style:
- `backgroundPosition: '${posX}% ${posY}%'`
- `transform: 'scale(${zoom})'`, `transformOrigin: '${posX}% ${posY}%'`

`.bg-layer` already clips (`overflow: hidden`). At zoom 1 this is equivalent to today's behavior with a movable focal point; at zoom > 1 it magnifies toward the focal point. `useBackgroundPhotos` is unchanged (framing is a display concern read from config, passed through to `BackgroundLayer` alongside `photos`).

**Pure helper (`src/backgroundPhotos.js`).** `clampFraming(framing)` → `{ posX, posY, zoom }` clamped to ranges with defaults filled (posX/posY 0–100→default 50; zoom 1–3→default 1). Unit-tested.

**UI (`BackgroundTab`).** Each gallery image that is *currently selected* shows an **"Adjust"** button → opens an inline **framing editor** panel (not a separate screen):
- A live preview box rendering the photo with the **same** `background-position` + `scale` CSS (WYSIWYG).
- **Drag** within the preview to move the focal point (updates posX/posY).
- A **zoom slider** (1×–3×).
- Changes call `updateBackground({ framing: { ...framing, [id]: next } })` live.
- The drag/preview interaction is verified manually; `clampFraming` and the focal-point math helper are unit-tested.

### 2. Effects: glow on top + strength control

**Layering.** Re-order `BackgroundLayer` so the scrim is painted **before** the effects: **Base → Scrim → Effects**. Give the effect blobs `mix-blend-mode: screen` (CSS) so aurora/pulse read as additive colored light over the scrim-dimmed photo. Readability is preserved: app content lives in `.container` (z-index 1) above the entire `.bg-layer`, and cards frost over it.

**Strength control.** Add `background.effectStrength` (0–100, default 50). A **"Effect strength"** slider appears in the Background tab **only when an effect is enabled**, distinct from the existing **Intensity** slider (which keeps controlling scrim + surface frosting).
- Pure helper `effectOpacity(strength)` in `src/backgroundMath.js` maps 0–100 → an opacity multiplier (e.g., 0→0.15, 50→0.55, 100→1.0; linear, rounded). Unit-tested.
- `BackgroundLayer` applies the resulting opacity to the effect containers via an inline style (`opacity`), layered with the existing per-blob opacities/`screen` blend. Default 50 ≈ today's visible strength but now on top of the scrim.

### 3. Single mode = replace, not accumulate

Pure helper `togglePhotoSelection(photoIds, id, mode)` in `src/backgroundPhotos.js`:
- `mode === 'single'` → returns `[id]` (replaces; or `[]` if `id` was the only selection and is toggled off — selecting a different one always replaces).
- otherwise (`slideshow`) → adds/removes `id` (current toggle behavior).

`BackgroundTab` uses it for gallery clicks. Unit-tested for both modes.

### 4. Library rename + delete (Background tab gallery)

Reusing `useImageLibrary` (already wired through `AppearanceScreen`):
- Pass `onRename(id, name)` → `library.updateMeta(id, {name})` and `onDelete(id)` → `library.remove(id)` into `BackgroundTab`.
- Each gallery image gains: an inline **rename** (editable name field / small edit affordance) and a **delete** button with a confirm step.
- **On delete**, also remove the id from `photoIds` and drop its `framing` entry via `updateBackground`, so the active background stays consistent and never references a deleted image. A pure helper `pruneDeletedPhoto(background, id)` returns the cleaned `{ photoIds, framing }`; unit-tested.
- The fuller grouped/searchable library (groups, regroup, "used by N") remains **Phase 3**; this is the minimal manage-in-place the user needs now.

### 5. Undo of appearance changes — deferred to Phase 3

Not built in this round. Phase 3 will design appearance undo (a Reset/Revert affordance and/or integration with the app's global ⎌ history stack).

## Out of scope (unchanged from Phase 2b)

- Import/restore UI (export remains download-only; `parseArchive` ready).
- Full drag-reorder of `photoIds` (selection order only).
- Phone batch upload, celebrations, playful extras, multiple saved custom themes.

## Testing (inline TDD — vitest + RTL; repo conventions: `afterEach(cleanup)`, no jest-dom)

- **Pure unit:** `clampFraming` (range clamps + defaults); `effectOpacity` (endpoints + midpoint, monotonic); `togglePhotoSelection` (single replaces, slideshow toggles); `pruneDeletedPhoto` (removes id from photoIds + framing).
- **Component (`BackgroundLayer`):** photo layer applies `background-position` + `scale` transform from framing (and defaults when absent); effects render **after** the scrim in DOM order; effect container opacity reflects `effectStrength`.
- **Component (`BackgroundTab`):** single-mode click replaces selection; slideshow-mode click toggles; "Adjust" appears for the selected image and zoom slider calls `updateBackground` with framing; rename calls `onRename`; delete calls `onDelete` (after confirm) and prunes selection; effect-strength slider visible only when an effect is on and updates `effectStrength`.
- **Manual (`npm run dev`):** focal-point **drag** + live preview WYSIWYG; aurora/pulse visibly glow over a photo and respond to the strength slider; readability unaffected at defaults.

## Accessibility & quality

- Framing editor: keyboard-adjustable focal point (arrow keys) + labeled zoom slider; `aria-label`s; Escape/close consistent with existing panels.
- Delete confirm prevents accidental loss (meticulous-user data safety).
- `prefers-reduced-motion` still disables animation; `screen`-blended static effects remain (no motion) under reduced motion.
- Numbers remain legible at every framing/strength/intensity combination (the guiding constraint).
