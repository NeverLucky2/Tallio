# Appearance Phase 2a — Background Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render tasteful ambient backgrounds (Aurora drift / Nocturne pulse) behind the app, tinted from the active theme, with a readability "intensity" scrim and reduced-motion support — controlled from the Appearance → Background tab.

**Architecture:** A single fixed `BackgroundLayer` mounts behind the app content and renders the enabled effects plus a theme-colored scrim veil. A pure `intensityToLayers()` maps the 0–100 intensity slider to a scrim opacity (and surface-frosting values reserved for Phase 2b). Background settings live in the `background` sub-object already present in `useAppearance`; a new `updateBackground()` setter persists them. Effects use the app's existing theme CSS variables for color, so they re-tint automatically when the theme changes. **Default app appearance is unchanged** until the user turns an effect on (the layer is inert when base is solid and no effect is enabled).

**Tech Stack:** React 19, Vite, Vitest + @testing-library/react (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-03-appearance-and-backgrounds-design.md` (Phase 2 section). This plan implements the rendering backbone; the photo/image pipeline (IndexedDB store, upload/crop, slideshow, photo-sampled palettes, preset wallpapers, export bundling) is **Phase 2b** (separate plan).

**Builds on Phase 1:** `useAppearance` already owns `background = { base, presetId, photoIds, photoGroup, mode, intervalSec, intensity, effects:{aurora,pulse} }` and `App.css :root` already seeds `--surface-alpha`/`--surface-blur`.

---

## File Structure

- **Create `src/backgroundMath.js`** — `intensityToLayers(intensity)`. Pure 0–100 → `{ scrimAlpha, surfaceAlpha, surfaceBlur }` mapping. No React.
- **Create `src/backgroundMath.test.js`** — unit tests.
- **Create `src/BackgroundLayer.jsx`** — presentational fixed layer: renders enabled effects + scrim; honors reduced motion. Props only; no data fetching.
- **Create `src/BackgroundLayer.test.jsx`** — component tests.
- **Create `src/BackgroundTab.jsx`** — the Background tab UI (effects toggles + intensity slider), wired to `appearance.updateBackground`.
- **Create `src/BackgroundTab.test.jsx`** — component tests.
- **Modify `src/useAppearance.js`** — add `updateBackground(partial)`; expose it.
- **Modify `src/useAppearance.test.jsx`** — cover `updateBackground`.
- **Modify `src/AppearanceScreen.jsx`** — render `BackgroundTab` instead of the bg placeholder.
- **Modify `src/AppearanceScreen.test.jsx`** — bg tab now shows effect toggles, not "coming soon".
- **Modify `src/App.jsx`** — mount `<BackgroundLayer background={appearance.background} />` inside `.app-root`.
- **Modify `src/App.css`** — `.bg-layer`, effect keyframes/classes (theme-colored), `.bg-scrim`, reduced-motion guard.

**Repo test conventions (from Phase 1):** component tests import `cleanup` from `@testing-library/react` and call `afterEach(() => cleanup())`; assert with `.toBeTruthy()` / `.getAttribute()` (NO jest-dom — `toBeInTheDocument` is unavailable). Run a single file with `npx vitest run <path>`.

---

## Task 1: intensityToLayers()

**Files:**
- Create: `src/backgroundMath.js`
- Test: `src/backgroundMath.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/backgroundMath.test.js
import { describe, it, expect } from 'vitest';
import { intensityToLayers } from './backgroundMath.js';

describe('intensityToLayers', () => {
  it('at 0 (readable): heavy scrim, opaque solid surfaces', () => {
    expect(intensityToLayers(0)).toEqual({ scrimAlpha: 0.8, surfaceAlpha: 1, surfaceBlur: 0 });
  });

  it('at 100 (immersive): light scrim, transparent blurred surfaces', () => {
    expect(intensityToLayers(100)).toEqual({ scrimAlpha: 0.12, surfaceAlpha: 0, surfaceBlur: 10 });
  });

  it('clamps out-of-range input', () => {
    expect(intensityToLayers(150)).toEqual(intensityToLayers(100));
    expect(intensityToLayers(-20)).toEqual(intensityToLayers(0));
  });

  it('scrim decreases monotonically as intensity rises', () => {
    expect(intensityToLayers(25).scrimAlpha).toBeLessThan(intensityToLayers(0).scrimAlpha);
    expect(intensityToLayers(50).scrimAlpha).toBeLessThan(intensityToLayers(25).scrimAlpha);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/backgroundMath.test.js`
Expected: FAIL — `does not provide an export named 'intensityToLayers'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/backgroundMath.js

// Maps the 0..100 "intensity" slider to render values.
// scrimAlpha: opacity of the readability veil over the background.
// surfaceAlpha / surfaceBlur: card translucency + blur — reserved for Phase 2b
// (photos); kept here so the slider has one source of truth.
export function intensityToLayers(intensity) {
  const t = Math.max(0, Math.min(100, Number(intensity) || 0)) / 100;
  const lerp = (a, b, x) => a + (b - a) * x;
  return {
    scrimAlpha: +lerp(0.8, 0.12, t).toFixed(3),
    surfaceAlpha: +lerp(1, 0, Math.min(1, t * 1.25)).toFixed(3),
    surfaceBlur: +lerp(0, 10, t).toFixed(1),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/backgroundMath.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backgroundMath.js src/backgroundMath.test.js
git commit -m "feat(appearance): intensityToLayers mapping for background readability"
```

---

## Task 2: useAppearance.updateBackground

**Files:**
- Modify: `src/useAppearance.js`
- Test: `src/useAppearance.test.jsx`

- [ ] **Step 1: Write the failing test (append to the existing describe block)**

```jsx
// add inside describe('useAppearance', ...) in src/useAppearance.test.jsx
  it('updateBackground merges into the background object and persists', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.updateBackground({ effects: { aurora: true, pulse: false } }));
    expect(result.current.background.effects).toEqual({ aurora: true, pulse: false });
    // unrelated fields preserved
    expect(result.current.background.intensity).toBe(25);
    const saved = JSON.parse(window.localStorage.getItem('tallio-appearance'));
    expect(saved.background.effects.aurora).toBe(true);
  });

  it('updateBackground can set intensity without dropping effects', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.updateBackground({ effects: { aurora: true, pulse: false } }));
    act(() => result.current.updateBackground({ intensity: 80 }));
    expect(result.current.background.intensity).toBe(80);
    expect(result.current.background.effects.aurora).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useAppearance.test.jsx`
Expected: FAIL — `result.current.updateBackground is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/useAppearance.js`, add the setter after `resetCustomToPreset`:

```js
  const updateBackground = useCallback((partial) => {
    setState(prev => persist({ ...prev, background: { ...prev.background, ...partial } }));
  }, [persist]);
```

And add it to the returned object:

```js
    setTheme,
    updateCustom,
    resetCustomToPreset,
    updateBackground,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useAppearance.test.jsx`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/useAppearance.js src/useAppearance.test.jsx
git commit -m "feat(appearance): updateBackground setter on useAppearance"
```

---

## Task 3: BackgroundLayer

**Files:**
- Create: `src/BackgroundLayer.jsx`
- Test: `src/BackgroundLayer.test.jsx`

The layer is inert (renders nothing visible) unless an effect is on or the base is non-solid, so the default app look is unchanged.

- [ ] **Step 1: Write the failing test**

```jsx
// src/BackgroundLayer.test.jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import BackgroundLayer from './BackgroundLayer.jsx';

const bg = (over = {}) => ({ base: 'solid', effects: { aurora: false, pulse: false }, intensity: 25, ...over });

describe('BackgroundLayer', () => {
  afterEach(() => cleanup());

  it('renders no effects or scrim when solid base with effects off', () => {
    const { container } = render(<BackgroundLayer background={bg()} reducedMotion={false} />);
    expect(container.querySelector('.bg-aurora')).toBeNull();
    expect(container.querySelector('.bg-pulse')).toBeNull();
    expect(container.querySelector('.bg-scrim')).toBeNull();
  });

  it('renders the aurora effect and a scrim when aurora is on', () => {
    const { container } = render(<BackgroundLayer background={bg({ effects: { aurora: true, pulse: false } })} reducedMotion={false} />);
    expect(container.querySelector('.bg-aurora')).not.toBeNull();
    expect(container.querySelector('.bg-pulse')).toBeNull();
    expect(container.querySelector('.bg-scrim')).not.toBeNull();
  });

  it('scrim opacity follows intensity (0 -> 0.8)', () => {
    const { container } = render(<BackgroundLayer background={bg({ effects: { aurora: true, pulse: false }, intensity: 0 })} reducedMotion={false} />);
    expect(container.querySelector('.bg-scrim').style.opacity).toBe('0.8');
  });

  it('adds the reduced-motion class when reducedMotion is true', () => {
    const { container } = render(<BackgroundLayer background={bg({ effects: { aurora: true, pulse: false } })} reducedMotion={true} />);
    expect(container.querySelector('.bg-layer').className).toContain('bg-reduced-motion');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/BackgroundLayer.test.jsx`
Expected: FAIL — cannot find module `./BackgroundLayer.jsx`.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/BackgroundLayer.jsx
import React from 'react';
import { intensityToLayers } from './backgroundMath.js';

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function BackgroundLayer({ background, reducedMotion }) {
  const { base = 'solid', effects = {}, intensity = 25 } = background || {};
  const rm = reducedMotion ?? prefersReducedMotion();
  const active = base !== 'solid' || effects.aurora || effects.pulse;
  const scrimAlpha = active ? intensityToLayers(intensity).scrimAlpha : 0;

  return (
    <div className={`bg-layer${rm ? ' bg-reduced-motion' : ''}`} aria-hidden="true">
      {effects.aurora && (
        <div className="bg-aurora">
          <span className="bg-blob b1" /><span className="bg-blob b2" /><span className="bg-blob b3" />
        </div>
      )}
      {effects.pulse && (
        <div className="bg-pulse">
          <span className="bg-glow g1" /><span className="bg-glow g2" />
        </div>
      )}
      {active && <div className="bg-scrim" style={{ opacity: scrimAlpha }} />}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/BackgroundLayer.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/BackgroundLayer.jsx src/BackgroundLayer.test.jsx
git commit -m "feat(appearance): BackgroundLayer renders ambient effects + scrim"
```

---

## Task 4: BackgroundTab + wire into AppearanceScreen

**Files:**
- Create: `src/BackgroundTab.jsx`
- Test: `src/BackgroundTab.test.jsx`
- Modify: `src/AppearanceScreen.jsx`
- Modify: `src/AppearanceScreen.test.jsx`

- [ ] **Step 1: Write the failing test for BackgroundTab**

```jsx
// src/BackgroundTab.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import BackgroundTab from './BackgroundTab.jsx';

function stub(over = {}) {
  return {
    background: { base: 'solid', effects: { aurora: false, pulse: false }, intensity: 25, ...over },
    updateBackground: vi.fn(),
  };
}

describe('BackgroundTab', () => {
  afterEach(() => cleanup());

  it('renders the two effect switches and an intensity slider', () => {
    render(<BackgroundTab appearance={stub()} />);
    expect(screen.getByRole('switch', { name: /aurora/i })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /nocturne pulse/i })).toBeTruthy();
    expect(screen.getByLabelText(/intensity/i)).toBeTruthy();
  });

  it('toggling Aurora updates effects without dropping pulse', () => {
    const a = stub({ effects: { aurora: false, pulse: true } });
    render(<BackgroundTab appearance={a} />);
    fireEvent.click(screen.getByRole('switch', { name: /aurora/i }));
    expect(a.updateBackground).toHaveBeenCalledWith({ effects: { aurora: true, pulse: true } });
  });

  it('moving the slider updates intensity as a number', () => {
    const a = stub();
    render(<BackgroundTab appearance={a} />);
    fireEvent.change(screen.getByLabelText(/intensity/i), { target: { value: '80' } });
    expect(a.updateBackground).toHaveBeenCalledWith({ intensity: 80 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/BackgroundTab.test.jsx`
Expected: FAIL — cannot find module `./BackgroundTab.jsx`.

- [ ] **Step 3: Write BackgroundTab**

```jsx
// src/BackgroundTab.jsx
import React from 'react';

export default function BackgroundTab({ appearance }) {
  const { background, updateBackground } = appearance;
  const { effects, intensity } = background;

  const toggle = (key) => updateBackground({ effects: { ...effects, [key]: !effects[key] } });

  return (
    <div className="background-tab">
      <div className="appearance-label">Base background</div>
      <p className="appearance-hint">Solid (your theme). Preset wallpapers and your own photos arrive in the next update.</p>

      <div className="appearance-label">Effects — gentle motion behind your data</div>
      <div className="bg-effect-toggles">
        <button
          type="button" role="switch" aria-checked={effects.aurora} aria-label="Aurora drift"
          className={`bg-toggle${effects.aurora ? ' on' : ''}`} onClick={() => toggle('aurora')}
        >
          <span className="bg-toggle-knob" /> Aurora drift
        </button>
        <button
          type="button" role="switch" aria-checked={effects.pulse} aria-label="Nocturne pulse"
          className={`bg-toggle${effects.pulse ? ' on' : ''}`} onClick={() => toggle('pulse')}
        >
          <span className="bg-toggle-knob" /> Nocturne pulse
        </button>
      </div>

      <label className="appearance-label" htmlFor="bg-intensity">Intensity — readable ↔ immersive</label>
      <input
        id="bg-intensity" type="range" min="0" max="100" className="bg-intensity"
        aria-label="Background intensity"
        value={intensity}
        onChange={(e) => updateBackground({ intensity: Number(e.target.value) })}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run BackgroundTab test to verify it passes**

Run: `npx vitest run src/BackgroundTab.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Swap the placeholder in `src/AppearanceScreen.jsx`**

Add the import at the top (after the `ThemeTab` import):

```jsx
import BackgroundTab from './BackgroundTab.jsx';
```

Replace this line:

```jsx
        {tab === 'bg' && <p className="appearance-placeholder">Backgrounds — coming soon (Phase 2).</p>}
```

with:

```jsx
        {tab === 'bg' && <BackgroundTab appearance={appearance} />}
```

- [ ] **Step 6: Update the AppearanceScreen test**

In `src/AppearanceScreen.test.jsx`, the stub `appearance` lacks background fields — extend it, and change the bg-tab assertion. Replace the `const appearance = {…}` block with:

```jsx
const appearance = {
  themeId: 'nocturne', customTheme: null,
  background: { base: 'solid', effects: { aurora: false, pulse: false }, intensity: 25 },
  setTheme: vi.fn(), updateCustom: vi.fn(), resetCustomToPreset: vi.fn(), updateBackground: vi.fn(),
};
```

Replace the "switching to Background shows the phase-2 placeholder" test with:

```jsx
  it('switching to Background shows the effect controls', () => {
    render(<AppearanceScreen appearance={appearance} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /background/i }));
    expect(screen.getByRole('switch', { name: /aurora/i })).toBeTruthy();
  });
```

- [ ] **Step 7: Run both component test files**

Run: `npx vitest run src/BackgroundTab.test.jsx src/AppearanceScreen.test.jsx`
Expected: PASS (3 + 3 tests).

- [ ] **Step 8: Commit**

```bash
git add src/BackgroundTab.jsx src/BackgroundTab.test.jsx src/AppearanceScreen.jsx src/AppearanceScreen.test.jsx
git commit -m "feat(appearance): Background tab with effect toggles + intensity slider"
```

---

## Task 5: Mount in App + effect styles

**Files:**
- Modify: `src/App.jsx` (the `.app-root` / `.app-bg-gradient` region near `:332`)
- Modify: `src/App.css` (append effect styles)

- [ ] **Step 1: Import BackgroundLayer in `src/App.jsx`**

Add after the `import AppearanceScreen ...` line:

```jsx
import BackgroundLayer from './BackgroundLayer.jsx';
```

- [ ] **Step 2: Mount the layer inside `.app-root`**

Replace:

```jsx
    <div className="app-root">
      <div className="app-bg-gradient" />
```

with:

```jsx
    <div className="app-root">
      <div className="app-bg-gradient" />
      <BackgroundLayer background={appearance.background} />
```

- [ ] **Step 3: Append effect styles to `src/App.css`**

Add at the end of `src/App.css`:

```css
/* ---- Ambient background effects (Appearance → Background) ---- */
.bg-layer { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }

.bg-aurora .bg-blob { position: absolute; border-radius: 50%; filter: blur(64px); opacity: 0.5; }
.bg-aurora .b1 { width: 42vw; height: 42vw; left: -8vw;  top: -12vh;    background: var(--accent); animation: bgDrift1 22s ease-in-out infinite alternate; }
.bg-aurora .b2 { width: 36vw; height: 36vw; right: -6vw; top: 4vh;      background: var(--blue);   animation: bgDrift2 26s ease-in-out infinite alternate; }
.bg-aurora .b3 { width: 32vw; height: 32vw; left: 22vw;  bottom: -14vh; background: var(--purple); animation: bgDrift3 19s ease-in-out infinite alternate; }
@keyframes bgDrift1 { to { transform: translate(7vw, 6vh) scale(1.15); } }
@keyframes bgDrift2 { to { transform: translate(-6vw, 4vh) scale(1.1); } }
@keyframes bgDrift3 { to { transform: translate(5vw, -5vh) scale(1.2); } }

.bg-pulse .bg-glow { position: absolute; }
.bg-pulse .g1 { width: 120vw; height: 60vh; left: -10vw; top: -15vh;
  background: radial-gradient(ellipse at center, var(--accent), transparent 60%); opacity: 0.18;
  animation: bgBreathe1 16s ease-in-out infinite alternate; }
.bg-pulse .g2 { width: 90vw; height: 55vh; right: -10vw; bottom: -12vh;
  background: radial-gradient(ellipse at center, var(--blue), transparent 60%); opacity: 0.16;
  animation: bgBreathe2 20s ease-in-out infinite alternate; }
@keyframes bgBreathe1 { from { opacity: 0.1; transform: scale(0.9); } to { opacity: 0.28; transform: scale(1.1); } }
@keyframes bgBreathe2 { from { opacity: 0.08; transform: scale(1.05); } to { opacity: 0.24; transform: scale(0.92); } }

/* Scrim veils the effects toward the theme background for readability (opacity set inline). */
.bg-scrim { position: absolute; inset: 0; background: var(--bg); }

.bg-reduced-motion .bg-blob,
.bg-reduced-motion .bg-glow { animation: none; }
@media (prefers-reduced-motion: reduce) {
  .bg-blob, .bg-glow { animation: none; }
}

/* ---- Background tab controls ---- */
.appearance-hint { color: var(--text-muted); font-size: 12px; margin: 0 0 18px; }
.bg-effect-toggles { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 22px; }
.bg-toggle { display: inline-flex; align-items: center; gap: 9px; background: var(--bg-input);
  border: 1px solid var(--border); border-radius: var(--r-md); color: var(--text);
  font-family: var(--font-ui); font-size: 13px; padding: 9px 13px; cursor: pointer; }
.bg-toggle-knob { width: 30px; height: 17px; border-radius: 99px; background: var(--text-dim); position: relative; transition: background var(--transition); }
.bg-toggle-knob::after { content: ''; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: #fff; transition: left var(--transition); }
.bg-toggle.on .bg-toggle-knob { background: var(--green); }
.bg-toggle.on .bg-toggle-knob::after { left: 15px; }
.bg-intensity { width: 100%; max-width: 320px; }
```

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all prior suites plus the three new files; no regressions.

- [ ] **Step 5: Lint the touched files**

Run: `npx eslint src/backgroundMath.js src/BackgroundLayer.jsx src/BackgroundTab.jsx src/useAppearance.js src/AppearanceScreen.jsx src/App.jsx`
Expected: 0 errors.

- [ ] **Step 6: Manual verification**

Run `npm run dev`, then:
1. Open Appearance → **Background** tab. Toggle **Aurora drift** on → a soft, slowly drifting glow (gold/blue/purple from the current theme) appears behind the content; numbers stay readable.
2. Drag **Intensity** toward immersive → the scrim thins and the effect becomes more vivid; toward readable → it dims.
3. Toggle **Nocturne pulse** on → a gentle breathing glow; both effects can stack.
4. Switch the theme (Theme tab → Slate) → the effects re-tint to the new theme's colors automatically.
5. Turn both effects off → the app returns to exactly its solid-theme look (no scrim, no motion).
6. Reload → effect/intensity choices persist.
7. (If you can enable OS "reduce motion") → the effects render static (no animation).

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat(appearance): mount BackgroundLayer + ambient effect styles"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage (this slice):** ambient effects Aurora/Nocturne pulse tinted from theme (Tasks 3, 5); readability intensity scrim (Tasks 1, 3); reduced-motion fallback (Tasks 3, 5); Background tab with effect toggles + intensity (Task 4). Effects "layered additively / toggleable" per the brainstorm.
- **Deferred to Phase 2b (separate plan):** IndexedDB `imageStore`, photo upload + crop, single/slideshow base, **photo-sampled** effect palettes, preset wallpapers, surface-frosting of cards (`--surface-alpha`/`--surface-blur` are mapped by `intensityToLayers` and seeded in `:root`, but not yet applied to card surfaces), and export-archive image bundling.
- **No-regression guard:** `BackgroundLayer` renders nothing when base is solid and both effects are off (the default), so existing screens are visually unchanged until the user opts in.
- **Type consistency:** `background` always has `{ base, effects:{aurora,pulse}, intensity }` (plus the Phase-1 fields); `updateBackground(partial)` shallow-merges into it; `intensityToLayers` returns `{ scrimAlpha, surfaceAlpha, surfaceBlur }`.
```
