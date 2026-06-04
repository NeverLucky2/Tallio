# Appearance Phase 2b Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (the user has chosen **inline TDD by Claude with a checkpoint after each task — no subagents**). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users frame background photos (focal point + zoom), see ambient effects glow over photos with a strength control, make "single" mode replace the selection, and rename/delete library photos in place.

**Architecture:** All four features are driven by pure helpers (unit-tested) plus presentational rendering. Framing/effect-strength live in the `background` config (no new IndexedDB fields, no re-encoding); `BackgroundLayer` reads them from the `background` prop it already receives. `BackgroundTab` gains a framing editor, an effect-strength slider, and per-photo rename/delete (reusing the existing `useImageLibrary`). The scrim is re-ordered below the effects, which blend with `mix-blend-mode: screen`.

**Tech Stack:** React 19, Vite, Vitest + @testing-library/react (jsdom). Existing modules: `useAppearance`, `backgroundPhotos.js`, `backgroundMath.js`, `BackgroundLayer.jsx`, `BackgroundTab.jsx`, `AppearanceScreen.jsx`, `useImageLibrary.js`.

---

## Conventions (read before starting)

- **Tests:** Vitest + RTL, jsdom. Component tests **must** `import { cleanup } from '@testing-library/react'` and `afterEach(() => cleanup())`. **No jest-dom** — use `.toBeTruthy()`, `.toBeNull()`, `container.querySelector(...)`, `el.getAttribute(...)`, `el.style.getPropertyValue(...)`, `el.style.transform`. Hooks use `renderHook`/`act`.
- Run one file: `npx vitest run src/foo.test.jsx`. Full suite: `npx vitest run`.
- Lint: `npx eslint <files>` — keep 0 errors. (Pre-existing eslint errors in `CategoryEditor`, `ColorPicker`, `IconPicker`, `spendingMath` and the `CameraCapture`/`useCategories` warnings are NOT ours — ignore them.)
- Commit per task with trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- Branch: stay on `rename-to-tallio` (extends PR #10; Phase 2b commits `d35e9f5..fce489d` are already here, unpushed).
- jsdom note: `URL.createObjectURL` exists but **throws "Not implemented"**, so the framing-editor preview wraps it in try/catch (keeps tests green without stubbing).

## File structure

| File | Change | Responsibility |
|------|--------|----------------|
| `src/useAppearance.js` | modify | Add `framing: {}` + `effectStrength: 50` defaults; deep-merge `background` on load so existing users get new fields. |
| `src/backgroundPhotos.js` | modify | Pure helpers: `clampFraming`, `togglePhotoSelection`, `pruneDeletedPhoto`, `focalFromPointer`. |
| `src/backgroundMath.js` | modify | Pure `effectOpacity(strength)`. |
| `src/BackgroundLayer.jsx` | modify | Apply framing per photo layer; re-order scrim below effects; set effect-container opacity. |
| `src/App.css` | modify | `mix-blend-mode: screen` on effect blobs. |
| `src/BackgroundTab.jsx` | modify | Single-mode replace; effect-strength slider; framing editor; rename/delete. |
| `src/AppearanceScreen.jsx` | modify | Pass `onRename`/`onDelete` to `BackgroundTab`. |

No `App.jsx` change is needed: `BackgroundLayer` and `useBackgroundPhotos` already receive `appearance.background`, which now carries `framing`/`effectStrength`.

---

## Task 1: Background config — framing + effectStrength defaults

**Files:**
- Modify: `src/useAppearance.js`
- Test: `src/useAppearance.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to `src/useAppearance.test.jsx` (inside the `describe('useAppearance', ...)` block):

```jsx
  it('defaults the background to empty framing and effectStrength 50', () => {
    const { result } = renderHook(() => useAppearance());
    expect(result.current.background.framing).toEqual({});
    expect(result.current.background.effectStrength).toBe(50);
  });

  it('back-fills new background fields for a saved config that predates them', () => {
    window.localStorage.setItem('tallio-appearance', JSON.stringify({
      themeId: 'nocturne',
      background: { base: 'photos', photoIds: ['x'], intensity: 40 },
    }));
    const { result } = renderHook(() => useAppearance());
    expect(result.current.background.framing).toEqual({});
    expect(result.current.background.effectStrength).toBe(50);
    expect(result.current.background.photoIds).toEqual(['x']); // saved value preserved
    expect(result.current.background.intensity).toBe(40);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useAppearance.test.jsx`
Expected: FAIL — `framing`/`effectStrength` undefined.

- [ ] **Step 3: Update `useAppearance.js`**

Change `DEFAULT_BACKGROUND`:

```js
const DEFAULT_BACKGROUND = {
  base: 'solid', presetId: null, photoIds: [], photoGroup: null,
  mode: 'single', intervalSec: 30, intensity: 25, effects: { aurora: false, pulse: false },
  framing: {}, effectStrength: 50,
};
```

Change `loadInitial` to deep-merge the background so saved configs gain new fields:

```js
function loadInitial() {
  if (typeof window === 'undefined') return defaults();
  try {
    const raw = window.localStorage.getItem(STORAGE);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    return {
      ...defaults(),
      ...parsed,
      background: { ...DEFAULT_BACKGROUND, ...(parsed.background || {}) },
    };
  } catch {
    return defaults();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useAppearance.test.jsx`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Lint + commit**

Run: `npx eslint src/useAppearance.js src/useAppearance.test.jsx`
Expected: 0 errors.

```
git add src/useAppearance.js src/useAppearance.test.jsx
git commit -m "feat(appearance): framing + effectStrength defaults with back-fill

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Pure helpers — framing, selection, prune, focal point

**Files:**
- Modify: `src/backgroundPhotos.js`
- Test: `src/backgroundPhotos.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/backgroundPhotos.test.js`:

```js
import { clampFraming, togglePhotoSelection, pruneDeletedPhoto, focalFromPointer } from './backgroundPhotos.js';

describe('clampFraming', () => {
  it('fills defaults when empty/missing', () => {
    expect(clampFraming()).toEqual({ posX: 50, posY: 50, zoom: 1 });
    expect(clampFraming({})).toEqual({ posX: 50, posY: 50, zoom: 1 });
  });
  it('clamps position to 0..100 and zoom to 1..3', () => {
    expect(clampFraming({ posX: -10, posY: 140, zoom: 5 })).toEqual({ posX: 0, posY: 100, zoom: 3 });
    expect(clampFraming({ posX: 30, posY: 70, zoom: 0.2 })).toEqual({ posX: 30, posY: 70, zoom: 1 });
  });
});

describe('togglePhotoSelection', () => {
  it('single mode replaces the selection with the clicked id', () => {
    expect(togglePhotoSelection(['a', 'b'], 'c', 'single')).toEqual(['c']);
    expect(togglePhotoSelection([], 'a', 'single')).toEqual(['a']);
  });
  it('slideshow mode toggles membership, preserving order', () => {
    expect(togglePhotoSelection(['a'], 'b', 'slideshow')).toEqual(['a', 'b']);
    expect(togglePhotoSelection(['a', 'b'], 'a', 'slideshow')).toEqual(['b']);
  });
});

describe('pruneDeletedPhoto', () => {
  it('removes the id from photoIds and framing', () => {
    const bg = { photoIds: ['a', 'b'], framing: { a: { posX: 1 }, b: { posX: 2 } } };
    expect(pruneDeletedPhoto(bg, 'a')).toEqual({ photoIds: ['b'], framing: { b: { posX: 2 } } });
  });
  it('is safe when fields are missing', () => {
    expect(pruneDeletedPhoto({}, 'a')).toEqual({ photoIds: [], framing: {} });
  });
});

describe('focalFromPointer', () => {
  it('maps a pointer position within a rect to 0..100 percentages', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    expect(focalFromPointer(rect, 200, 100)).toEqual({ posX: 50, posY: 50 }); // center
    expect(focalFromPointer(rect, 100, 50)).toEqual({ posX: 0, posY: 0 });    // top-left
    expect(focalFromPointer(rect, 300, 150)).toEqual({ posX: 100, posY: 100 }); // bottom-right
  });
  it('clamps pointers outside the rect', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    expect(focalFromPointer(rect, -20, 200)).toEqual({ posX: 0, posY: 100 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/backgroundPhotos.test.js`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Append the implementations to `src/backgroundPhotos.js`**

```js
const clampNum = (n, lo, hi, dflt) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return dflt;
  return Math.max(lo, Math.min(hi, v));
};

// Normalize a per-photo framing record, filling defaults (centered, no zoom).
export function clampFraming(framing) {
  const f = framing || {};
  return {
    posX: clampNum(f.posX, 0, 100, 50),
    posY: clampNum(f.posY, 0, 100, 50),
    zoom: clampNum(f.zoom, 1, 3, 1),
  };
}

// Single mode keeps exactly one photo (clicking replaces); slideshow toggles.
export function togglePhotoSelection(photoIds, id, mode) {
  const ids = Array.isArray(photoIds) ? photoIds : [];
  if (mode === 'single') return [id];
  return ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
}

// Drop a deleted image from the background's selection + framing.
export function pruneDeletedPhoto(background, id) {
  const bg = background || {};
  const photoIds = (bg.photoIds || []).filter(x => x !== id);
  const framing = { ...(bg.framing || {}) };
  delete framing[id];
  return { photoIds, framing };
}

// Convert a pointer position (within a DOMRect-like) to focal 0..100 percentages.
export function focalFromPointer(rect, clientX, clientY) {
  const pct = (val, start, size) => {
    if (!size) return 50;
    return Math.round(Math.max(0, Math.min(1, (val - start) / size)) * 100);
  };
  return { posX: pct(clientX, rect.left, rect.width), posY: pct(clientY, rect.top, rect.height) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/backgroundPhotos.test.js`
Expected: PASS (existing 4 + new).

- [ ] **Step 5: Lint + commit**

Run: `npx eslint src/backgroundPhotos.js src/backgroundPhotos.test.js`
Expected: 0 errors.

```
git add src/backgroundPhotos.js src/backgroundPhotos.test.js
git commit -m "feat(appearance): framing/selection/prune/focal pure helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `effectOpacity` strength mapping

**Files:**
- Modify: `src/backgroundMath.js`
- Test: `src/backgroundMath.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/backgroundMath.test.js`:

```js
import { effectOpacity } from './backgroundMath.js';

describe('effectOpacity', () => {
  it('maps 0..100 strength to a 0.15..1 opacity multiplier', () => {
    expect(effectOpacity(0)).toBe(0.15);
    expect(effectOpacity(100)).toBe(1);
    expect(effectOpacity(50)).toBe(0.575);
  });
  it('clamps out-of-range input', () => {
    expect(effectOpacity(-20)).toBe(0.15);
    expect(effectOpacity(200)).toBe(1);
    expect(effectOpacity(undefined)).toBe(0.575); // default 50
  });
});
```

> Confirm `src/backgroundMath.test.js` already imports `describe`/`it`/`expect` from `vitest` (it does). Add `effectOpacity` to the import line if a combined import is used, or add the new import line shown above.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/backgroundMath.test.js`
Expected: FAIL — `effectOpacity` not exported.

- [ ] **Step 3: Append to `src/backgroundMath.js`**

```js
// Maps the 0..100 effect-strength slider to an opacity multiplier applied to the
// ambient effect layers (subtle 0.15 -> vivid 1.0). Default 50 when unset.
export function effectOpacity(strength) {
  const s = Number.isFinite(Number(strength)) ? Number(strength) : 50;
  const t = Math.max(0, Math.min(100, s)) / 100;
  return +(0.15 + t * 0.85).toFixed(3);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/backgroundMath.test.js`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

Run: `npx eslint src/backgroundMath.js src/backgroundMath.test.js`
Expected: 0 errors.

```
git add src/backgroundMath.js src/backgroundMath.test.js
git commit -m "feat(appearance): effectOpacity strength mapping

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: BackgroundLayer applies per-photo framing

**Files:**
- Modify: `src/BackgroundLayer.jsx`
- Test: `src/BackgroundLayer.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to `src/BackgroundLayer.test.jsx` (the `bg()` helper there defaults `base: 'solid'`; pass `base: 'photos'`):

```js
describe('BackgroundLayer photo framing', () => {
  afterEach(() => cleanup());

  it('applies background-position and scale transform from framing', () => {
    const photos = [{ id: 'a', url: 'blob:a', palette: [] }];
    const background = bg({ base: 'photos', framing: { a: { posX: 20, posY: 80, zoom: 2 } } });
    const { container } = render(<BackgroundLayer background={background} photos={photos} activeIndex={0} reducedMotion={false} />);
    const layer = container.querySelector('.bg-photo');
    expect(layer.style.backgroundPosition).toBe('20% 80%');
    expect(layer.style.transform).toBe('scale(2)');
  });

  it('defaults to centered, no zoom when a photo has no framing', () => {
    const photos = [{ id: 'a', url: 'blob:a', palette: [] }];
    const { container } = render(<BackgroundLayer background={bg({ base: 'photos' })} photos={photos} reducedMotion={false} />);
    const layer = container.querySelector('.bg-photo');
    expect(layer.style.backgroundPosition).toBe('50% 50%');
    expect(layer.style.transform).toBe('scale(1)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/BackgroundLayer.test.jsx`
Expected: FAIL — no `backgroundPosition`/`transform` on the layer yet.

- [ ] **Step 3: Update `BackgroundLayer.jsx`**

Add `clampFraming` to the imports:

```jsx
import { clampFraming } from './backgroundPhotos.js';
```

Add `framing` to the destructured background (line with `base`/`presetId`/`effects`/`intensity`):

```jsx
  const { base = 'solid', presetId = null, effects = {}, intensity = 25, framing = {} } = background || {};
```

Replace the photo-layer map with framing-aware styles:

```jsx
      {base === 'photos' && photos.map((p, i) => {
        const f = clampFraming(framing[p.id]);
        return (
          <div
            key={p.id || i}
            className={`bg-photo${i === activeIndex ? ' on' : ''}`}
            style={{
              backgroundImage: `url(${p.url})`,
              backgroundPosition: `${f.posX}% ${f.posY}%`,
              transform: `scale(${f.zoom})`,
              transformOrigin: `${f.posX}% ${f.posY}%`,
            }}
          />
        );
      })}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/BackgroundLayer.test.jsx`
Expected: PASS (all).

- [ ] **Step 5: Lint + commit**

Run: `npx eslint src/BackgroundLayer.jsx src/BackgroundLayer.test.jsx`
Expected: 0 errors.

```
git add src/BackgroundLayer.jsx src/BackgroundLayer.test.jsx
git commit -m "feat(appearance): BackgroundLayer applies per-photo framing (position + zoom)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Effects glow over the scrim + strength

**Files:**
- Modify: `src/BackgroundLayer.jsx`
- Modify: `src/App.css`
- Test: `src/BackgroundLayer.test.jsx`

> Re-order so the scrim paints **before** the effects (Base → Scrim → Effects); blend effects with `screen` and scale their opacity by `effectOpacity(effectStrength)`.

- [ ] **Step 1: Write the failing test**

Add to `src/BackgroundLayer.test.jsx`:

```js
describe('BackgroundLayer effect layering + strength', () => {
  afterEach(() => cleanup());

  it('paints the scrim before the effects (effects glow on top)', () => {
    const { container } = render(
      <BackgroundLayer background={bg({ base: 'photos', effects: { aurora: true, pulse: false } })} photos={[{ id: 'a', url: 'blob:a' }]} reducedMotion={false} />,
    );
    const kids = Array.from(container.querySelector('.bg-layer').children).map(c => c.className);
    const scrimIdx = kids.findIndex(c => c.includes('bg-scrim'));
    const auroraIdx = kids.findIndex(c => c.includes('bg-aurora'));
    expect(scrimIdx).toBeGreaterThanOrEqual(0);
    expect(auroraIdx).toBeGreaterThan(scrimIdx);
  });

  it('scales effect-container opacity from effectStrength', () => {
    const { container } = render(
      <BackgroundLayer background={bg({ base: 'photos', effects: { aurora: true, pulse: false }, effectStrength: 100 })} photos={[{ id: 'a', url: 'blob:a' }]} reducedMotion={false} />,
    );
    expect(container.querySelector('.bg-aurora').style.opacity).toBe('1');
  });

  it('uses the default strength (0.575) when effectStrength is unset', () => {
    const b = bg({ base: 'photos', effects: { aurora: true, pulse: false } });
    delete b.effectStrength;
    const { container } = render(<BackgroundLayer background={b} photos={[{ id: 'a', url: 'blob:a' }]} reducedMotion={false} />);
    expect(container.querySelector('.bg-aurora').style.opacity).toBe('0.575');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/BackgroundLayer.test.jsx`
Expected: FAIL — effects currently render before the scrim and have no opacity.

- [ ] **Step 3: Update `BackgroundLayer.jsx`**

Add `effectOpacity` to the backgroundMath import:

```jsx
import { intensityToLayers, effectOpacity } from './backgroundMath.js';
```

Add `effectStrength` to the destructure:

```jsx
  const { base = 'solid', presetId = null, effects = {}, intensity = 25, framing = {}, effectStrength = 50 } = background || {};
```

Compute the effect style (merge the existing `fxStyle` palette vars with opacity). Replace the `fxStyle` definition's usage by adding, just after the `fxStyle` block:

```jsx
  const effectStyle = { ...(fxStyle || {}), opacity: effectOpacity(effectStrength) };
```

Re-order the JSX so the scrim comes before the effects, and use `effectStyle` on the effect containers:

```jsx
      {active && <div className="bg-scrim" style={{ opacity: scrimAlpha }} />}

      {effects.aurora && (
        <div className="bg-aurora" style={effectStyle}>
          <span className="bg-blob b1" /><span className="bg-blob b2" /><span className="bg-blob b3" />
        </div>
      )}
      {effects.pulse && (
        <div className="bg-pulse" style={effectStyle}>
          <span className="bg-glow g1" /><span className="bg-glow g2" />
        </div>
      )}
```

(Delete the old `{active && <div className="bg-scrim" .../>}` line at the bottom — the scrim now appears once, above the effects.)

- [ ] **Step 4: Run JS test to verify it passes**

Run: `npx vitest run src/BackgroundLayer.test.jsx`
Expected: PASS (all). Also re-run the existing effect-palette tests in this file pass (they assert `--fx-*` on `.bg-aurora`, still present via `effectStyle`).

- [ ] **Step 5: Add `screen` blend to effect blobs (CSS — MANUAL visual)**

In `src/App.css`, add `mix-blend-mode: screen;` to the two blob base rules:

Find:
```css
.bg-aurora .bg-blob { position: absolute; border-radius: 50%; filter: blur(64px); opacity: 0.5; }
```
Replace with:
```css
.bg-aurora .bg-blob { position: absolute; border-radius: 50%; filter: blur(64px); opacity: 0.5; mix-blend-mode: screen; }
```

Find:
```css
.bg-pulse .bg-glow { position: absolute; }
```
Replace with:
```css
.bg-pulse .bg-glow { position: absolute; mix-blend-mode: screen; }
```

- [ ] **Step 6: Manual verification (`npm run dev`)**

With a photo background + Aurora and/or Nocturne pulse on: confirm the effects now **glow visibly** over the photo (not just dimming), and the **Effect strength** slider (Task 7) ramps them subtle→vivid. If the default looks too faint, the blob base opacities (`0.5`, `0.18`, `0.16`) may be nudged up here — readability is unaffected since content sits above the layer.

- [ ] **Step 7: Lint + commit**

Run: `npx eslint src/BackgroundLayer.jsx src/BackgroundLayer.test.jsx`
Expected: 0 errors.

```
git add src/BackgroundLayer.jsx src/BackgroundLayer.test.jsx src/App.css
git commit -m "feat(appearance): effects glow over scrim with screen blend + strength

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Single mode replaces the selection

**Files:**
- Modify: `src/BackgroundTab.jsx`
- Modify: `src/BackgroundTab.test.jsx`

- [ ] **Step 1: Update/replace the relevant tests**

In `src/BackgroundTab.test.jsx`, in the `describe('BackgroundTab photo controls', ...)` block, replace the two selection tests with mode-aware versions:

Replace:
```js
  it('toggles a library image into photoIds', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'photos', photoIds: [] });
    const { getByRole } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.click(getByRole('button', { name: /select Beach/i }));
    expect(updateBackground).toHaveBeenCalledWith({ photoIds: ['a'] });
  });

  it('removes an already-selected image from photoIds', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'photos', photoIds: ['a', 'b'] });
    const { getByRole } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.click(getByRole('button', { name: /select Beach/i }));
    expect(updateBackground).toHaveBeenCalledWith({ photoIds: ['b'] });
  });
```
With:
```js
  it('single mode replaces the selection with the clicked image', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'photos', mode: 'single', photoIds: ['b'] });
    const { getByRole } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.click(getByRole('button', { name: /select Beach/i }));
    expect(updateBackground).toHaveBeenCalledWith({ photoIds: ['a'] });
  });

  it('slideshow mode toggles selection membership', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'photos', mode: 'slideshow', photoIds: ['a', 'b'] });
    const { getByRole } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.click(getByRole('button', { name: /select Beach/i }));
    expect(updateBackground).toHaveBeenCalledWith({ photoIds: ['b'] });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/BackgroundTab.test.jsx`
Expected: FAIL — single mode currently appends (`['b','a']`) instead of replacing.

- [ ] **Step 3: Update `BackgroundTab.jsx`**

Add `togglePhotoSelection` to the imports:

```jsx
import { togglePhotoSelection } from './backgroundPhotos.js';
```

Replace `togglePhoto`:

```jsx
  const togglePhoto = (id) => updateBackground({ photoIds: togglePhotoSelection(photoIds, id, background.mode) });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/BackgroundTab.test.jsx`
Expected: PASS (all).

- [ ] **Step 5: Lint + commit**

Run: `npx eslint src/BackgroundTab.jsx src/BackgroundTab.test.jsx`
Expected: 0 errors.

```
git add src/BackgroundTab.jsx src/BackgroundTab.test.jsx
git commit -m "fix(appearance): single-mode photo selection replaces instead of accumulating

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Effect-strength slider

**Files:**
- Modify: `src/BackgroundTab.jsx`
- Modify: `src/BackgroundTab.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to `src/BackgroundTab.test.jsx` (in the `describe('BackgroundTab effects + intensity', ...)` block):

```js
  it('hides the effect-strength slider when no effect is on', () => {
    const { appearance } = makeAppearance({ effects: { aurora: false, pulse: false } });
    const { queryByLabelText } = render(<BackgroundTab appearance={appearance} />);
    expect(queryByLabelText('Effect strength')).toBeNull();
  });

  it('shows the effect-strength slider when an effect is on and updates it', () => {
    const { appearance, updateBackground } = makeAppearance({ effects: { aurora: true, pulse: false }, effectStrength: 50 });
    const { getByLabelText } = render(<BackgroundTab appearance={appearance} />);
    fireEvent.change(getByLabelText('Effect strength'), { target: { value: '80' } });
    expect(updateBackground).toHaveBeenCalledWith({ effectStrength: 80 });
  });
```

> Note: `makeAppearance` in this file builds the full background shape; it already includes `effectStrength` via `...over`. Confirm the default object in `makeAppearance` includes `effectStrength: 50` — if not, add it there so the slider renders with a value.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/BackgroundTab.test.jsx`
Expected: FAIL — no "Effect strength" control.

- [ ] **Step 3: Update `BackgroundTab.jsx`**

In the `makeAppearance`-fed component, derive whether any effect is on (near the top, after `const { base, presetId, effects, intensity } = background;`):

```jsx
  const anyEffect = effects.aurora || effects.pulse;
```

Add the slider right after the existing Intensity `<input>` (before the closing `</div>` of `.background-tab`):

```jsx
      {anyEffect && (
        <>
          <label className="appearance-label" htmlFor="bg-effect-strength">Effect strength — subtle ↔ vivid</label>
          <input
            id="bg-effect-strength" type="range" min="0" max="100" className="bg-intensity"
            aria-label="Effect strength"
            value={background.effectStrength ?? 50}
            onChange={(e) => updateBackground({ effectStrength: Number(e.target.value) })}
          />
        </>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/BackgroundTab.test.jsx`
Expected: PASS (all).

- [ ] **Step 5: Lint + commit**

Run: `npx eslint src/BackgroundTab.jsx src/BackgroundTab.test.jsx`
Expected: 0 errors.

```
git add src/BackgroundTab.jsx src/BackgroundTab.test.jsx
git commit -m "feat(appearance): effect-strength slider (shown when an effect is on)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Framing editor (focal point + zoom)

**Files:**
- Modify: `src/BackgroundTab.jsx`
- Modify: `src/App.css`
- Test: `src/BackgroundTab.test.jsx`

> A selected photo shows an **Adjust** button that opens an inline editor: a live preview (drag to set focal point, keyboard arrows for accessibility) and a zoom slider. The drag/preview rendering is verified manually; the Adjust affordance + zoom slider + arrow-key nudge are unit-tested.

- [ ] **Step 1: Write the failing test**

Add a new describe block to `src/BackgroundTab.test.jsx`:

```js
describe('BackgroundTab framing editor', () => {
  afterEach(() => cleanup());

  const images = [{ id: 'a', name: 'Beach', group: 'Scenery' }];

  it('shows Adjust only for a selected photo and opens the editor with a zoom slider', () => {
    const { appearance } = makeAppearance({ base: 'photos', photoIds: ['a'] });
    const { getByRole, queryByLabelText, getByLabelText } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    expect(queryByLabelText('Zoom')).toBeNull(); // editor closed
    fireEvent.click(getByRole('button', { name: /adjust Beach/i }));
    expect(getByLabelText('Zoom')).toBeTruthy();
  });

  it('does not show Adjust for an unselected photo', () => {
    const { appearance } = makeAppearance({ base: 'photos', photoIds: [] });
    const { queryByRole } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    expect(queryByRole('button', { name: /adjust Beach/i })).toBeNull();
  });

  it('zoom slider writes framing for the photo', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'photos', photoIds: ['a'] });
    const { getByRole, getByLabelText } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.click(getByRole('button', { name: /adjust Beach/i }));
    fireEvent.change(getByLabelText('Zoom'), { target: { value: '2' } });
    expect(updateBackground).toHaveBeenCalledWith({ framing: { a: { posX: 50, posY: 50, zoom: 2 } } });
  });

  it('arrow keys nudge the focal point', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'photos', photoIds: ['a'] });
    const { getByRole, getByLabelText } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.click(getByRole('button', { name: /adjust Beach/i }));
    fireEvent.keyDown(getByLabelText('Focal point — drag or use arrow keys'), { key: 'ArrowRight' });
    expect(updateBackground).toHaveBeenCalledWith({ framing: { a: { posX: 52, posY: 50, zoom: 1 } } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/BackgroundTab.test.jsx`
Expected: FAIL — no Adjust button / editor.

- [ ] **Step 3: Update `BackgroundTab.jsx`**

Add imports / state. Update the React import and add `clampFraming` + `focalFromPointer`:

```jsx
import React, { useState, useEffect } from 'react';
import { WALLPAPERS } from './wallpapers.js';
import { togglePhotoSelection, clampFraming, focalFromPointer } from './backgroundPhotos.js';
```

Inside the component, add framing state/helpers (after `const groups = ...`):

```jsx
  const framing = background.framing || {};
  const [editingId, setEditingId] = useState(null);
  const [editUrl, setEditUrl] = useState(null);

  const setFraming = (id, patch) => {
    const next = clampFraming({ ...framing[id], ...patch });
    updateBackground({ framing: { ...framing, [id]: next } });
  };

  // Object URL for the editor preview (jsdom throws on createObjectURL — guard it).
  useEffect(() => {
    if (!editingId) { setEditUrl(null); return undefined; }
    const img = images.find(i => i.id === editingId);
    if (!img || !img.blob) { setEditUrl(null); return undefined; }
    let url = null;
    try { url = URL.createObjectURL(img.blob); } catch { url = null; }
    setEditUrl(url);
    return () => { if (url) { try { URL.revokeObjectURL(url); } catch { /* ignore */ } } };
  }, [editingId, images]);

  const onFocalKey = (e) => {
    const f = clampFraming(framing[editingId]);
    const step = 2;
    const map = { ArrowLeft: { posX: f.posX - step }, ArrowRight: { posX: f.posX + step }, ArrowUp: { posY: f.posY - step }, ArrowDown: { posY: f.posY + step } };
    if (map[e.key]) { e.preventDefault(); setFraming(editingId, map[e.key]); }
  };

  const onFocalPointer = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setFraming(editingId, focalFromPointer(rect, e.clientX, e.clientY));
  };
```

In the gallery item button list, add an Adjust button for selected photos. Replace the gallery `images.map(...)` block:

```jsx
            <div className="bg-photo-gallery">
              {images.map(img => (
                <div key={img.id} className="bg-photo-item">
                  <button
                    type="button"
                    aria-label={`select ${img.name}`}
                    className={`bg-photo-cell${photoIds.includes(img.id) ? ' selected' : ''}`}
                    onClick={() => togglePhoto(img.id)}
                  >
                    {img.name}
                  </button>
                  {photoIds.includes(img.id) && (
                    <button
                      type="button" className="bg-photo-action" aria-label={`adjust ${img.name}`}
                      onClick={() => setEditingId(editingId === img.id ? null : img.id)}
                    >Adjust</button>
                  )}
                </div>
              ))}
            </div>
```

Add the editor panel right after the gallery `)}` (still inside `base === 'photos'`):

```jsx
          {editingId && (() => {
            const f = clampFraming(framing[editingId]);
            return (
              <div className="bg-framing-editor">
                <div
                  className="bg-framing-clip"
                  role="slider"
                  tabIndex={0}
                  aria-label="Focal point — drag or use arrow keys"
                  aria-valuetext={`${f.posX}% ${f.posY}%`}
                  onPointerDown={onFocalPointer}
                  onKeyDown={onFocalKey}
                >
                  {/* Inner image uses the SAME technique as BackgroundLayer (cover + position + scale) for WYSIWYG. */}
                  <div
                    className="bg-framing-img"
                    style={editUrl ? {
                      backgroundImage: `url(${editUrl})`,
                      backgroundPosition: `${f.posX}% ${f.posY}%`,
                      transform: `scale(${f.zoom})`,
                      transformOrigin: `${f.posX}% ${f.posY}%`,
                    } : undefined}
                  />
                </div>
                <label className="appearance-label" htmlFor="bg-zoom">
                  Zoom
                  <input
                    id="bg-zoom" type="range" min="1" max="3" step="0.1" className="bg-intensity"
                    aria-label="Zoom" value={f.zoom}
                    onChange={(e) => setFraming(editingId, { zoom: Number(e.target.value) })}
                  />
                </label>
                <button type="button" className="bg-mode-btn" onClick={() => setEditingId(null)}>Done</button>
              </div>
            );
          })()}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/BackgroundTab.test.jsx`
Expected: PASS (all).

> If `getByLabelText('Zoom')` matches more than one node (the label wraps the input AND the input has the same aria-label), the test uses the input's `aria-label="Zoom"`; the wrapping `<label>` text is "Zoom" too. RTL `getByLabelText` returns the form control, so this resolves to the input. If a duplicate-match error occurs, change the visible label text to "Zoom level" while keeping the input `aria-label="Zoom"`.

- [ ] **Step 5: Add editor CSS**

In `src/App.css`, after the `.bg-group-select` rule, add:

```css
.bg-photo-item { display: flex; flex-direction: column; gap: 4px; }
.bg-photo-action { padding: 3px 8px; font-size: 10px; border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--bg-input); color: var(--text-muted); cursor: pointer; }
.bg-framing-editor { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--bg-input); }
.bg-framing-clip { position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: var(--r-md); overflow: hidden; background-color: var(--bg-card); cursor: crosshair; outline: none; }
.bg-framing-clip:focus-visible { box-shadow: 0 0 0 2px var(--accent-border); }
.bg-framing-img { position: absolute; inset: 0; background-size: cover; background-repeat: no-repeat; }
```

- [ ] **Step 6: Manual verification (`npm run dev`)**

Select a photo → **Adjust** → drag in the preview to reposition the focal point and use the zoom slider; confirm the **live preview matches** what then renders as the actual background.

- [ ] **Step 7: Lint + commit**

Run: `npx eslint src/BackgroundTab.jsx src/BackgroundTab.test.jsx`
Expected: 0 errors.

```
git add src/BackgroundTab.jsx src/BackgroundTab.test.jsx src/App.css
git commit -m "feat(appearance): per-photo framing editor (focal point + zoom)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Rename + delete library photos

**Files:**
- Modify: `src/BackgroundTab.jsx`
- Modify: `src/AppearanceScreen.jsx`
- Modify: `src/AppearanceScreen.test.jsx`
- Modify: `src/BackgroundTab.test.jsx`
- Modify: `src/App.css`

- [ ] **Step 1: Write the failing tests (BackgroundTab)**

Add a new describe block to `src/BackgroundTab.test.jsx`:

```js
describe('BackgroundTab rename + delete', () => {
  afterEach(() => cleanup());

  const images = [{ id: 'a', name: 'Beach', group: 'Scenery' }];

  it('renames an image via the rename field', () => {
    const onRename = vi.fn();
    const { appearance } = makeAppearance({ base: 'photos', photoIds: [] });
    const { getByRole, getByLabelText } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} onRename={onRename} onDelete={vi.fn()} />);
    fireEvent.click(getByRole('button', { name: /rename Beach/i }));
    const input = getByLabelText('Name for Beach');
    fireEvent.change(input, { target: { value: 'Sunset Cove' } });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledWith('a', 'Sunset Cove');
  });

  it('deletes an image after confirm and prunes it from the selection', () => {
    const onDelete = vi.fn();
    const { appearance, updateBackground } = makeAppearance({ base: 'photos', photoIds: ['a'], framing: { a: { posX: 10, posY: 10, zoom: 1 } } });
    const { getByRole } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} onRename={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(getByRole('button', { name: /delete Beach/i }));
    fireEvent.click(getByRole('button', { name: /confirm delete Beach/i }));
    expect(onDelete).toHaveBeenCalledWith('a');
    expect(updateBackground).toHaveBeenCalledWith({ photoIds: [], framing: {} });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/BackgroundTab.test.jsx`
Expected: FAIL — no rename/delete controls.

- [ ] **Step 3: Update `BackgroundTab.jsx`**

Add `pruneDeletedPhoto` to the backgroundPhotos import:

```jsx
import { togglePhotoSelection, clampFraming, focalFromPointer, pruneDeletedPhoto } from './backgroundPhotos.js';
```

Accept the new props:

```jsx
export default function BackgroundTab({ appearance, images = [], onUpload, onRename, onDelete }) {
```

Add rename/delete UI state (near the other state):

```jsx
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const commitRename = (id) => {
    if (onRename && renameDraft.trim()) onRename(id, renameDraft.trim());
    setRenamingId(null);
  };
  const doDelete = (id) => {
    if (onDelete) onDelete(id);
    updateBackground(pruneDeletedPhoto(background, id));
    setConfirmDeleteId(null);
    if (editingId === id) setEditingId(null);
  };
```

Extend each gallery item (replace the `.bg-photo-item` block from Task 8) so it holds rename + delete actions:

```jsx
                <div key={img.id} className="bg-photo-item">
                  {renamingId === img.id ? (
                    <input
                      className="bg-photo-rename" aria-label={`Name for ${img.name}`}
                      autoFocus value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => commitRename(img.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(img.id); }}
                    />
                  ) : (
                    <button
                      type="button"
                      aria-label={`select ${img.name}`}
                      className={`bg-photo-cell${photoIds.includes(img.id) ? ' selected' : ''}`}
                      onClick={() => togglePhoto(img.id)}
                    >
                      {img.name}
                    </button>
                  )}
                  <div className="bg-photo-actions">
                    {photoIds.includes(img.id) && (
                      <button
                        type="button" className="bg-photo-action" aria-label={`adjust ${img.name}`}
                        onClick={() => setEditingId(editingId === img.id ? null : img.id)}
                      >Adjust</button>
                    )}
                    <button
                      type="button" className="bg-photo-action" aria-label={`rename ${img.name}`}
                      onClick={() => { setRenamingId(img.id); setRenameDraft(img.name); }}
                    >Rename</button>
                    {confirmDeleteId === img.id ? (
                      <>
                        <button type="button" className="bg-photo-action danger" aria-label={`confirm delete ${img.name}`} onClick={() => doDelete(img.id)}>Delete?</button>
                        <button type="button" className="bg-photo-action" aria-label={`cancel delete ${img.name}`} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                      </>
                    ) : (
                      <button type="button" className="bg-photo-action" aria-label={`delete ${img.name}`} onClick={() => setConfirmDeleteId(img.id)}>Delete</button>
                    )}
                  </div>
                </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/BackgroundTab.test.jsx`
Expected: PASS (all).

- [ ] **Step 5: Wire `AppearanceScreen.jsx`**

Pass the library actions to `BackgroundTab`:

```jsx
          <BackgroundTab
            appearance={appearance}
            images={library.images}
            onUpload={(file) => library.addFromFile(file, {})}
            onRename={(id, name) => library.updateMeta(id, { name })}
            onDelete={(id) => library.remove(id)}
          />
```

- [ ] **Step 6: Add a guard test in `AppearanceScreen.test.jsx`**

Add (the file already imports `fake-indexeddb/auto`, `vi`, `fireEvent`, `screen`):

```jsx
  it('passes rename/delete handlers so the Background tab renders photo actions', () => {
    const local = {
      themeId: 'nocturne', customTheme: null,
      background: { base: 'photos', presetId: null, photoIds: [], photoGroup: null, mode: 'single', intervalSec: 30, intensity: 25, effects: { aurora: false, pulse: false }, framing: {}, effectStrength: 50 },
      appIcons: {}, setTheme: vi.fn(), updateCustom: vi.fn(), resetCustomToPreset: vi.fn(), updateBackground: vi.fn(),
    };
    render(<AppearanceScreen appearance={local} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Background' }));
    // No images in the (empty) library, so the empty hint shows — assert no crash + upload control present.
    expect(screen.getByLabelText('Upload photo')).toBeTruthy();
  });
```

- [ ] **Step 7: Add CSS for the actions**

In `src/App.css`, extend the Task 8 `.bg-photo-item` styles by adding:

```css
.bg-photo-actions { display: flex; gap: 4px; flex-wrap: wrap; }
.bg-photo-action.danger { color: var(--red); border-color: var(--red-border); }
.bg-photo-rename { width: 100%; padding: 9px 8px; font-size: 11px; background: var(--bg-input); border: 1px solid var(--accent-border); border-radius: var(--r-md); color: var(--text); }
```

- [ ] **Step 8: Run both component tests + lint**

Run: `npx vitest run src/BackgroundTab.test.jsx src/AppearanceScreen.test.jsx`
Expected: PASS.
Run: `npx eslint src/BackgroundTab.jsx src/AppearanceScreen.jsx src/BackgroundTab.test.jsx src/AppearanceScreen.test.jsx`
Expected: 0 errors.

- [ ] **Step 9: Manual verification (`npm run dev`)**

Upload a photo; rename it; delete it (with confirm) and confirm it disappears and is removed as the active background.

- [ ] **Step 10: Commit**

```
git add src/BackgroundTab.jsx src/AppearanceScreen.jsx src/BackgroundTab.test.jsx src/AppearanceScreen.test.jsx src/App.css
git commit -m "feat(appearance): rename + delete library photos from the Background tab

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Full suite: `npx vitest run` — all green.
- [ ] Lint touched files: `npx eslint src/useAppearance.js src/backgroundPhotos.js src/backgroundMath.js src/BackgroundLayer.jsx src/BackgroundTab.jsx src/AppearanceScreen.jsx` — 0 errors.
- [ ] Build: `npm run build` — succeeds (pre-existing >500 kB chunk warning only).
- [ ] Manual `npm run dev` pass covering all 4: framing (focal+zoom WYSIWYG), effects glow + strength slider, single-mode replace, rename/delete.
- [ ] Then resume **superpowers:finishing-a-development-branch**: push Phase 2b + this polish to `rename-to-tallio` and update PR #10's title/body.
- [ ] Update memory + handoff: Phase 2b + polish done; Phase 3 (image-icons + library, incl. appearance-undo) next.

---

## Spec coverage check

- §1 Framing (focal+zoom, config storage, CSS render, editor UI) → Tasks 1, 2, 4, 8 ✅
- §2 Effects glow-on-top + screen blend + strength control → Tasks 1, 3, 5, 7 ✅
- §3 Single mode replace → Tasks 2, 6 ✅
- §4 Rename + delete + prune → Tasks 2, 9 ✅
- §5 Undo → explicitly deferred to Phase 3 (no task) ✅
- Accessibility (keyboard focal nudge, labels, delete confirm) → Tasks 8, 9 ✅
