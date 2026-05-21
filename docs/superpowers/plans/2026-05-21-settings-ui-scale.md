# Adjustable Display Size (Settings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minus/plus display-size stepper to the Settings (⚙) panel — 5% steps, 90%–150%, default 110% — applied live and persisted, driving the existing `--ui-scale` zoom.

**Architecture:** Make `--ui-scale` a persisted setting. `useSettings` gains a `uiScale` field + a pure `clampUiScale` helper; `App.jsx` writes the value onto `document.documentElement` via an effect (CSS `#root { zoom: var(--ui-scale) }` is unchanged); `SettingsPanel` renders the stepper, which calls `save({ uiScale })` live.

**Tech Stack:** React 19, Vitest + `@testing-library/react` (`renderHook`/`act` for hooks; `render`/`screen`/`userEvent` for components). Spec: `docs/superpowers/specs/2026-05-21-settings-ui-scale-design.md`.

**Conventions (match existing code):**
- Hook tests: `renderHook, act` + `beforeEach(() => localStorage.clear())`. Component tests: `render/screen/cleanup` + `userEvent` + `afterEach(() => cleanup())`; wrap glyphs in `<span aria-hidden>`.
- Tests run with `npx vitest run src/<file>`; lint with `npx eslint src/<files>` — zero NEW errors/warnings (the only pre-existing warning in scope is `App.jsx` camera-stream `react-hooks/exhaustive-deps`).
- Do NOT `git add -A` (sweeps `.claude/settings.local.json`); add only named files. End commit messages with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

**Key interface:** `clampUiScale(n)` rounds to nearest `0.05` **then** clamps to `[0.9, 1.5]`; non-finite → `1.1`. Named exports from `useSettings.js`: `clampUiScale`, `DEFAULT_UI_SCALE`, `UI_SCALE_MIN`, `UI_SCALE_MAX`, `UI_SCALE_STEP`. The hook returns `uiScale`; `save({ uiScale })` persists it (partial-update, same as `apiKey`/`model`).

**File structure:**
- Modify `src/useSettings.js` + create `src/useSettings.test.jsx` (Task 1).
- Modify `src/SettingsPanel.jsx` + create `src/SettingsPanel.test.jsx` + append `src/App.css` (Task 2).
- Modify `src/App.jsx` (Task 3 — apply effect; verified in-app, no unit-test surface).

**Checkpoint:** stop for in-app verification after **Task 3**.

---

## Task 1: `useSettings` — `clampUiScale` + persisted `uiScale`

**Files:**
- Modify: `src/useSettings.js`
- Test: `src/useSettings.test.jsx` (new)

- [ ] **Step 1: Write the failing test** — create `src/useSettings.test.jsx`:

```jsx
// src/useSettings.test.jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useSettings, { clampUiScale, UI_SCALE_MIN, UI_SCALE_MAX } from './useSettings.js';

beforeEach(() => localStorage.clear());

describe('clampUiScale', () => {
  it('rounds to the nearest 5% then clamps to range', () => {
    expect(clampUiScale(1.13)).toBe(1.15);
    expect(clampUiScale(1.12)).toBe(1.1);
    expect(clampUiScale(0.7)).toBe(UI_SCALE_MIN); // 0.9
    expect(clampUiScale(2)).toBe(UI_SCALE_MAX);   // 1.5
  });
  it('falls back to default 1.1 for non-finite input', () => {
    expect(clampUiScale(NaN)).toBe(1.1);
    expect(clampUiScale(undefined)).toBe(1.1);
    expect(clampUiScale('big')).toBe(1.1);
  });
});

describe('useSettings uiScale', () => {
  it('defaults to 1.1 when storage is empty', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.uiScale).toBe(1.1);
  });
  it('save persists uiScale and updates state', () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.save({ uiScale: 1.2 }));
    expect(result.current.uiScale).toBe(1.2);
    expect(localStorage.getItem('billtracker-ui-scale')).toBe('1.2');
  });
  it('hydrates and clamps an out-of-range stored value', () => {
    localStorage.setItem('billtracker-ui-scale', '9');
    const { result } = renderHook(() => useSettings());
    expect(result.current.uiScale).toBe(UI_SCALE_MAX); // 1.5
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/useSettings.test.jsx`
Expected: FAIL — `clampUiScale` is not exported / `result.current.uiScale` is undefined.

- [ ] **Step 3: Rewrite `src/useSettings.js`** with the full contents below (adds the scale constants, pure helper, and threads `uiScale` through load/save/return; `apiKey`/`model` behavior unchanged):

```js
import { useState, useCallback } from 'react';

const KEY_STORAGE = 'billtracker-anthropic-key';
const MODEL_STORAGE = 'billtracker-anthropic-model';
const UI_SCALE_STORAGE = 'billtracker-ui-scale';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export const DEFAULT_UI_SCALE = 1.1;
export const UI_SCALE_MIN = 0.9;
export const UI_SCALE_MAX = 1.5;
export const UI_SCALE_STEP = 0.05;

// Round to the nearest 5% (integer math avoids float drift), then clamp to range.
export function clampUiScale(n) {
  if (!Number.isFinite(n)) return DEFAULT_UI_SCALE;
  const rounded = Math.round(n * 20) / 20;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, rounded));
}

function loadInitial() {
  if (typeof window === 'undefined') return { apiKey: '', model: DEFAULT_MODEL, uiScale: DEFAULT_UI_SCALE };
  try {
    return {
      apiKey: window.localStorage.getItem(KEY_STORAGE) || '',
      model: window.localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL,
      uiScale: clampUiScale(parseFloat(window.localStorage.getItem(UI_SCALE_STORAGE))),
    };
  } catch {
    return { apiKey: '', model: DEFAULT_MODEL, uiScale: DEFAULT_UI_SCALE };
  }
}

export default function useSettings() {
  const [state, setState] = useState(loadInitial);

  const save = useCallback(({ apiKey, model, uiScale } = {}) => {
    setState((prev) => {
      const next = {
        apiKey: apiKey !== undefined ? apiKey.trim() : prev.apiKey,
        model: model !== undefined ? (model || DEFAULT_MODEL) : prev.model,
        uiScale: uiScale !== undefined ? clampUiScale(uiScale) : prev.uiScale,
      };
      try {
        if (apiKey !== undefined) window.localStorage.setItem(KEY_STORAGE, next.apiKey);
        if (model !== undefined) window.localStorage.setItem(MODEL_STORAGE, next.model);
        if (uiScale !== undefined) window.localStorage.setItem(UI_SCALE_STORAGE, String(next.uiScale));
      } catch {
        // ignore quota / privacy-mode errors; in-memory state still updates
      }
      return next;
    });
  }, []);

  return {
    apiKey: state.apiKey,
    model: state.model,
    uiScale: state.uiScale,
    hasKey: state.apiKey.startsWith('sk-ant-'),
    save,
  };
}
```

- [ ] **Step 4: Run to verify pass + lint**

Run: `npx vitest run src/useSettings.test.jsx` → Expected: PASS (5 tests).
Run: `npx eslint src/useSettings.js src/useSettings.test.jsx` → Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/useSettings.js src/useSettings.test.jsx
git commit -m "feat(settings): persist uiScale + clampUiScale helper

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: `SettingsPanel` display-size stepper + CSS

**Files:**
- Modify: `src/SettingsPanel.jsx`
- Modify: `src/App.css`
- Test: `src/SettingsPanel.test.jsx` (new)

- [ ] **Step 1: Write the failing test** — create `src/SettingsPanel.test.jsx`:

```jsx
// src/SettingsPanel.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPanel from './SettingsPanel.jsx';

function makeSettings(uiScale = 1.1) {
  return { apiKey: 'sk-ant-test', model: 'claude-haiku-4-5-20251001', uiScale, save: vi.fn() };
}

describe('SettingsPanel display size', () => {
  afterEach(() => cleanup());

  it('shows the current scale as a percentage', () => {
    render(<SettingsPanel settings={makeSettings(1.15)} onClose={() => {}} />);
    expect(screen.getByText('115%')).toBeTruthy();
  });

  it('increase calls save with the next 5% step', async () => {
    const settings = makeSettings(1.1);
    render(<SettingsPanel settings={settings} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /increase display size/i }));
    expect(settings.save).toHaveBeenCalledWith({ uiScale: 1.15 });
  });

  it('decrease calls save with the previous 5% step', async () => {
    const settings = makeSettings(1.1);
    render(<SettingsPanel settings={settings} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /decrease display size/i }));
    expect(settings.save).toHaveBeenCalledWith({ uiScale: 1.05 });
  });

  it('disables decrease at the minimum and increase at the maximum', () => {
    const { rerender } = render(<SettingsPanel settings={makeSettings(0.9)} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /decrease display size/i }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /increase display size/i }).disabled).toBe(false);
    rerender(<SettingsPanel settings={makeSettings(1.5)} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /increase display size/i }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /decrease display size/i }).disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/SettingsPanel.test.jsx`
Expected: FAIL — no "Increase/Decrease display size" buttons, no `115%` text.

- [ ] **Step 3: Add the stepper imports + handlers to `src/SettingsPanel.jsx`.**

Find:
```jsx
import React, { useEffect, useState } from 'react';
```
Replace with:
```jsx
import React, { useEffect, useState } from 'react';
import { clampUiScale, UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_STEP } from './useSettings.js';
```

Find:
```jsx
  const { apiKey, model, save } = settings;
```
Replace with:
```jsx
  const { apiKey, model, uiScale, save } = settings;
  const pct = Math.round(uiScale * 100);
  const stepScale = (delta) => save({ uiScale: clampUiScale(uiScale + delta) });
```

- [ ] **Step 4: Add the stepper section to the panel body in `src/SettingsPanel.jsx`.**

Find:
```jsx
          <p className="settings-privacy">
            Key is stored only in this browser. Never sent to BillTracker servers.
          </p>
```
Replace with:
```jsx
          <label className="settings-label">Display size</label>
          <div className="settings-stepper">
            <button
              type="button"
              className="settings-step-btn"
              aria-label="Decrease display size"
              onClick={() => stepScale(-UI_SCALE_STEP)}
              disabled={uiScale <= UI_SCALE_MIN}
            ><span aria-hidden="true">−</span></button>
            <span className="settings-step-value">{pct}%</span>
            <button
              type="button"
              className="settings-step-btn"
              aria-label="Increase display size"
              onClick={() => stepScale(UI_SCALE_STEP)}
              disabled={uiScale >= UI_SCALE_MAX}
            ><span aria-hidden="true">+</span></button>
          </div>

          <p className="settings-privacy">
            Key is stored only in this browser. Never sent to BillTracker servers.
          </p>
```

- [ ] **Step 5: Run the SettingsPanel test to verify pass**

Run: `npx vitest run src/SettingsPanel.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Append the stepper CSS** to the end of `src/App.css` (read the file first if your editor requires it, then add):

```css
/* Settings — display-size stepper */
.settings-stepper { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 4px; }
.settings-step-btn {
  width: 34px; height: 34px; border-radius: 7px;
  border: 1px solid rgba(240, 230, 210, 0.18); background: rgba(8, 8, 14, 0.55);
  color: #f0e6d2; font-size: 18px; line-height: 1; cursor: pointer;
}
.settings-step-btn:hover:not(:disabled) { border-color: rgba(212, 168, 83, 0.5); }
.settings-step-btn:disabled { opacity: 0.4; cursor: default; }
.settings-step-value { font-family: 'JetBrains Mono', monospace; font-size: 14px; color: #d4a853; min-width: 52px; text-align: center; }
```

- [ ] **Step 7: Run full suite + lint**

Run: `npx vitest run` → Expected: all green.
Run: `npx eslint src/SettingsPanel.jsx src/SettingsPanel.test.jsx` → Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/SettingsPanel.jsx src/SettingsPanel.test.jsx src/App.css
git commit -m "feat(settings): display-size stepper control

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Apply `uiScale` in `App.jsx` (CHECKPOINT after — verify in-app)

`App.jsx` has no unit-test surface (no `App.test.jsx`); this is verified in-app (Step 4). `useEffect` is already imported.

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add the apply effect.** Find:
```jsx
  const desktopPeer = useDesktopPeer();
  const settings = useSettings();
```
Replace with:
```jsx
  const desktopPeer = useDesktopPeer();
  const settings = useSettings();
  // Drive the global UI zoom (#root { zoom: var(--ui-scale) }) from the persisted setting.
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale));
  }, [settings.uiScale]);
```

- [ ] **Step 2: Run full suite + lint + build**

Run: `npx vitest run` → Expected: all green.
Run: `npx eslint src/App.jsx` → Expected: only the pre-existing camera-stream `react-hooks/exhaustive-deps` warning (no new problems).
Run: `npm run build` → Expected: builds successfully.

- [ ] **Step 3: Sanity-check the wiring** (read-only)

Confirm `#root { zoom: var(--ui-scale, 1); }` is still in `src/index.css` and `:root { ... --ui-scale: 1.1; }` is still in `src/App.css` (the pre-mount fallback). The effect overrides that variable on `<html>` at runtime.

- [ ] **Step 4: Verify in-app** (manual)

```bash
npm run dev -- --port 5174 --strictPort
```
Open http://localhost:5174 → click the **⚙** (top-right) → **Display size** stepper:
- The readout starts at the current size (e.g. **110%**); **+** grows the whole app one 5% step, **−** shrinks it, live.
- The change persists across a full page refresh.
- **−** is disabled at **90%**, **+** is disabled at **150%**.
- The stepper works whether or not an API key is set (it is independent of the **Save** button).

**Stop the 5174 process when done** (leave 5173 alone).

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(settings): apply persisted uiScale to the document root

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

> **CHECKPOINT — stop for review.** Feature complete and verified in-app. Then proceed to finishing-a-development-branch when ready.

---

## Self-review (completed against the spec)

**Spec coverage:**
- Persisted `uiScale` (localStorage `billtracker-ui-scale`, default 1.1) + clamp-on-load → Task 1 (`loadInitial`, `save`, `clampUiScale`). ✓
- Pure `clampUiScale` (round-to-5%-then-clamp, non-finite → default) + exported bounds → Task 1 + tests. ✓
- App applies the value to `document.documentElement` via effect; CSS engine unchanged → Task 3. ✓
- Stepper UI (− / readout / +), live apply via `save({uiScale})`, disabled at bounds, independent of API-key Save flow, accessible labels → Task 2. ✓
- Range 90%–150%, 5% steps → `UI_SCALE_MIN/MAX/STEP` used in Task 1 + Task 2. ✓
- Testing: clampUiScale unit, useSettings load/save, SettingsPanel stepper, in-app effect → Tasks 1–3. ✓

**Placeholder scan:** none; every code step is complete.

**Type consistency:** `clampUiScale`/`UI_SCALE_MIN`/`UI_SCALE_MAX`/`UI_SCALE_STEP` defined in Task 1 are imported and used identically in Task 2; `save({ uiScale })` shape matches between hook (Task 1), component (Task 2), and test stubs; `settings.uiScale` read in Task 3 matches the hook's return. The CSS classes `.settings-stepper`/`.settings-step-btn`/`.settings-step-value` in Task 2 Step 4 match those styled in Step 6. ✓
