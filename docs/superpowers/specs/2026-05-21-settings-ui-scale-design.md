# Adjustable Display Size (Settings) — Design Spec

**Date:** 2026-05-21

## Goal

Let the user adjust the whole-app display size from the Settings (⚙) panel with a minus/plus stepper — 5% steps over a 90%–150% range, default 110% — applied live and persisted across sessions. This makes the existing `--ui-scale` zoom (currently a hardcoded `1.1` in CSS) a user-controlled setting.

## Background

A prior change made the entire UI scale via CSS `zoom`: `#root { zoom: var(--ui-scale, 1); }` (`src/index.css`) reads `--ui-scale: 1.1` from `:root` in `src/App.css`. The app is px-based, so this `zoom` is the scaling engine. This spec keeps that engine and makes the variable adjustable at runtime.

Settings already exist:
- `src/useSettings.js` — persists `apiKey` + `model` to localStorage with a partial-update `save({ apiKey, model })`, SSR guard, and quota-tolerant writes.
- `src/SettingsPanel.jsx` — the ⚙ modal (opened from `App.jsx`), with a draft-then-**Save** flow whose Save button is disabled unless the API key is valid.

The display-size control must **not** ride the API-key draft/Save flow (it would be trapped behind key validation, and a whole-page zoom is best applied live). It is its own instantly-applied, instantly-persisted control.

## Architecture

Reuse the `zoom` engine. Make `--ui-scale` a persisted setting that `App.jsx` writes onto `document.documentElement` at runtime; the stepper drives that same variable live.

## Changes

### 1. `src/useSettings.js` — persist `uiScale`

- New constants: `UI_SCALE_STORAGE = 'billtracker-ui-scale'`, `DEFAULT_UI_SCALE = 1.1`, `UI_SCALE_MIN = 0.9`, `UI_SCALE_MAX = 1.5`, `UI_SCALE_STEP = 0.05`.
- New **pure exported helper** `clampUiScale(n)`: returns `DEFAULT_UI_SCALE` for non-finite input; otherwise **first** rounds to the nearest `UI_SCALE_STEP` (via integer math to avoid float drift, `Math.round(n * 20) / 20`), **then** clamps to `[UI_SCALE_MIN, UI_SCALE_MAX]`. Because min/max are multiples of the step, output is always on-grid and in-range.
- `loadInitial()` reads `uiScale` from localStorage (`parseFloat`) through `clampUiScale`, so a corrupt/out-of-range stored value cannot break layout.
- `save()` accepts `uiScale` alongside `apiKey`/`model` (same partial-update shape): when `uiScale !== undefined`, store `clampUiScale(uiScale)` to localStorage and state.
- Return `uiScale` from the hook (in addition to existing fields). Export `clampUiScale`, `UI_SCALE_MIN`, `UI_SCALE_MAX`, `UI_SCALE_STEP` as named exports for the UI.

### 2. `src/App.jsx` — apply the scale

Add one effect after the settings hook is available:

```jsx
useEffect(() => {
  document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale));
}, [settings.uiScale]);
```

The inline custom property on `<html>` overrides the App.css `:root` default and cascades into `#root`'s `zoom`. `src/App.css` keeps `--ui-scale: 1.1` as the pre-mount fallback (avoids a flash before React mounts).

### 3. `src/SettingsPanel.jsx` — the stepper

A new "Display size" section below the Model control:

- Layout: `[ − ]  110%  [ + ]`, readout = `Math.round(uiScale * 100)%`.
- `−` computes `clampUiScale(uiScale - UI_SCALE_STEP)`; `+` computes `clampUiScale(uiScale + UI_SCALE_STEP)`; each calls `settings.save({ uiScale: next })` → live apply (via the App effect) + persist. No Save button involved.
- `−` disabled when `uiScale <= UI_SCALE_MIN`; `+` disabled when `uiScale >= UI_SCALE_MAX`.
- Accessibility: buttons carry `aria-label` ("Decrease display size" / "Increase display size"); the `−`/`+` glyphs are wrapped `aria-hidden`; the percentage readout is plain text adjacent to the buttons.

## Data Flow

Tap **+** → `save({ uiScale: 1.15 })` → `useSettings` clamps, persists to `billtracker-ui-scale`, updates state → App effect sets `--ui-scale: 1.15` on `<html>` → `#root` `zoom` recomputes → whole UI grows. Reload → `loadInitial` restores `1.15`.

## Testing

- **`clampUiScale`** (pure) — new `src/useSettings.test.jsx`: below min → `0.9`; above max → `1.5`; rounds to nearest 5% (e.g. `1.13 → 1.15`, `1.12 → 1.10`); `NaN`/non-number → `1.1`.
- **`useSettings`** — `save({ uiScale })` writes `billtracker-ui-scale` and updates `uiScale`; `loadInitial` hydrates a stored value and clamps an out-of-range one. `beforeEach(() => localStorage.clear())`.
- **`SettingsPanel`** — new `src/SettingsPanel.test.jsx`: clicking **+** / **−** calls `save` with the correctly clamped `uiScale`; **−** disabled at `0.9`, **+** disabled at `1.5`. Uses `render/screen/cleanup` + `userEvent` with a stub `settings` object.
- **App `<html>` effect** — no `App.test.jsx` surface; verify in-app: open ⚙, nudge size, confirm the UI changes live and the choice persists across a refresh.

## Out of Scope

- No slider or preset-button variants.
- No per-element or per-screen overrides.
- No keyboard zoom shortcut.
- No retrofitted tests for the pre-existing `apiKey`/`model` logic beyond what the `uiScale` tests touch.
