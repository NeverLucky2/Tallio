# Appearance Phase 3 — Image-Icons, Library & Appearance-Undo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **User preference for THIS project: inline TDD by Claude with a checkpoint after each task — no subagents.**

**Goal:** Let the user replace any icon anywhere with their own cropped photos, managed in a named/grouped/searchable library, and make all appearance changes undoable through the app's existing Ctrl+Z.

**Architecture:** Pure helpers (`iconValue`, `iconCrop`, `iconUsage`, `appearanceHistory`, `iconUrlCache`) hold all testable logic. Canvas re-encode (`recropThumb`) and IndexedDB stay behind the established MANUAL-VERIFY / fake-indexeddb boundaries. A root `IconLibraryProvider` owns one image library + an incremental object-URL cache that `<Icon>` reads synchronously. A shared `FramingEditor` (extracted from `BackgroundTab`) powers both background framing and a square `ImageCropModal`. Appearance state joins the global undo stack with opKey coalescing.

**Tech Stack:** React 19 + Vite, Vitest + @testing-library/react (jsdom), fake-indexeddb, nanoid, IndexedDB, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-06-04-appearance-phase-3-image-icons-design.md`

**Branch:** `appearance-phase-3` (already created, stacked on `appearance-phase-2b`). Commit per task; **push to the branch after each task** so PR stays current.

**Conventions (do not relearn the hard way):**
- Component tests: `import { cleanup } from '@testing-library/react'` + `afterEach(() => cleanup())`. **No jest-dom** — use `.toBeTruthy()`, `.toBeNull()`, `container.querySelector`, `el.getAttribute`, `el.textContent`, `el.style.getPropertyValue`.
- jsdom: no canvas, no IndexedDB, `URL.createObjectURL` throws. Use `fake-indexeddb` + stub `URL` via `vi.stubGlobal`. Keep canvas/crop math pure; verify canvas/visual via `npm run dev`.
- Lint rule `react-hooks/set-state-in-effect` is an ERROR — consolidate object-URL effects to one `setState` + a scoped `// eslint-disable-next-line react-hooks/set-state-in-effect`.
- Single file: `npx vitest run src/Foo.test.jsx`. Full: `npx vitest run`. Lint: `npx eslint <files>`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. `LF will be replaced by CRLF` warnings are benign.

---

## Task 1: `iconValue.js` — parse icon strings + text fallback

**Files:**
- Create: `src/iconValue.js`
- Test: `src/iconValue.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/iconValue.test.js
import { describe, it, expect } from 'vitest';
import { parseIconValue, iconGlyph } from './iconValue.js';

describe('parseIconValue', () => {
  it('classifies emoji, image tokens, and empty', () => {
    expect(parseIconValue('🛒')).toEqual({ kind: 'emoji', emoji: '🛒' });
    expect(parseIconValue('img:abc123')).toEqual({ kind: 'image', id: 'abc123' });
    expect(parseIconValue('')).toEqual({ kind: 'empty' });
    expect(parseIconValue(null)).toEqual({ kind: 'empty' });
    expect(parseIconValue(undefined)).toEqual({ kind: 'empty' });
  });
});

describe('iconGlyph', () => {
  it('returns the emoji for emoji, the fallback for images, empty string for empty', () => {
    expect(iconGlyph('🛒')).toBe('🛒');
    expect(iconGlyph('img:abc')).toBe('🖼️');
    expect(iconGlyph('img:abc', '🏷️')).toBe('🏷️');
    expect(iconGlyph('')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/iconValue.test.js`
Expected: FAIL — `parseIconValue is not a function` / module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/iconValue.js
// One resolver for the "emoji OR img:<id>" icon convention used by categories,
// accounts, account types, and app-level slots. Pure; no React, no DOM.
export function parseIconValue(value) {
  if (!value) return { kind: 'empty' };
  if (typeof value === 'string' && value.startsWith('img:')) {
    return { kind: 'image', id: value.slice(4) };
  }
  return { kind: 'emoji', emoji: value };
}

// For text-only contexts (e.g. <option>) that cannot embed an <img>: emoji
// passes through, an image token shows a fallback glyph, empty shows nothing.
export function iconGlyph(value, fallback = '🖼️') {
  const parsed = parseIconValue(value);
  if (parsed.kind === 'emoji') return parsed.emoji;
  if (parsed.kind === 'image') return fallback;
  return '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/iconValue.test.js`
Expected: PASS (5 assertions).

- [ ] **Step 5: Lint + commit**

```bash
npx eslint src/iconValue.js src/iconValue.test.js
git add src/iconValue.js src/iconValue.test.js
git commit -m "feat(icons): parseIconValue + iconGlyph pure helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push -u origin appearance-phase-3
```

---

## Task 2: `iconCrop.js` — square crop rectangle math

**Files:**
- Create: `src/iconCrop.js`
- Test: `src/iconCrop.test.js`

`cropRect` derives the square source rectangle for `drawImage` from a focal-point + zoom framing, using background-position semantics (posX/posY 0→left/top, 100→right/bottom). Square side = `min(srcW, srcH) / zoom`.

- [ ] **Step 1: Write the failing test**

```js
// src/iconCrop.test.js
import { describe, it, expect } from 'vitest';
import { cropRect } from './iconCrop.js';

describe('cropRect', () => {
  it('centers the largest square at default framing', () => {
    expect(cropRect(400, 300, { posX: 50, posY: 50, zoom: 1 }))
      .toEqual({ sx: 50, sy: 0, sw: 300, sh: 300 });
  });

  it('shrinks and re-centers the window as zoom increases', () => {
    expect(cropRect(400, 300, { posX: 50, posY: 50, zoom: 2 }))
      .toEqual({ sx: 125, sy: 75, sw: 150, sh: 150 });
  });

  it('moves the window to an edge by focal point', () => {
    expect(cropRect(400, 300, { posX: 0, posY: 100, zoom: 1 }))
      .toEqual({ sx: 0, sy: 0, sw: 300, sh: 300 });
    expect(cropRect(400, 300, { posX: 100, posY: 50, zoom: 1 }))
      .toEqual({ sx: 100, sy: 0, sw: 300, sh: 300 });
  });

  it('clamps junk framing to centered/no-zoom defaults', () => {
    expect(cropRect(200, 200, {})).toEqual({ sx: 0, sy: 0, sw: 200, sh: 200 });
    expect(cropRect(200, 200, { posX: 999, posY: -5, zoom: 99 }).sw).toBeLessThan(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/iconCrop.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/iconCrop.js
// Pure square-crop math for image-icons. Reuses clampFraming (square aspect,
// identical shape to the background framing). Returns the source rectangle to
// pass to canvas drawImage; the canvas call itself lives in imageProcess.js.
import { clampFraming } from './backgroundPhotos.js';

export function cropRect(srcW, srcH, framing) {
  const f = clampFraming(framing);
  const side = Math.min(srcW, srcH) / f.zoom;
  const sx = (f.posX / 100) * (srcW - side);
  const sy = (f.posY / 100) * (srcH - side);
  return {
    sx: Math.round(sx),
    sy: Math.round(sy),
    sw: Math.round(side),
    sh: Math.round(side),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/iconCrop.test.js`
Expected: PASS.

- [ ] **Step 5: Lint + commit + push**

```bash
npx eslint src/iconCrop.js src/iconCrop.test.js
git add src/iconCrop.js src/iconCrop.test.js
git commit -m "feat(icons): cropRect square-crop math

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 3: `iconUsage.js` — count references to an image

**Files:**
- Create: `src/iconUsage.js`
- Test: `src/iconUsage.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/iconUsage.test.js
import { describe, it, expect } from 'vitest';
import { countIconUsage } from './iconUsage.js';

const data = {
  categories: [
    { id: 'c1', icon: 'img:photo1' },
    { id: 'c2', icon: '🛒', subcategories: [{ id: 's1', icon: 'img:photo1' }] },
  ],
  accounts: [{ id: 'a1', icon: 'img:photo1' }, { id: 'a2', icon: '🏦' }],
  accountTypes: [{ id: 't1', icon: '🏷️' }],
  appIcons: { headerAvatar: 'img:photo1' },
};

describe('countIconUsage', () => {
  it('counts every category, sub, account, type, and app-icon reference', () => {
    expect(countIconUsage('photo1', data)).toBe(4);
  });
  it('returns 0 for an unused image', () => {
    expect(countIconUsage('nope', data)).toBe(0);
  });
  it('tolerates missing collections', () => {
    expect(countIconUsage('photo1', {})).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/iconUsage.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/iconUsage.js
// Best-effort count of how many things point at an image (for the delete
// "Used by N" hint). Never enforces — deletion is always allowed; a stale
// img:<id> reference simply falls back to a glyph in <Icon>. Pure.
export function countIconUsage(imageId, { categories = [], accounts = [], accountTypes = [], appIcons = {} } = {}) {
  const token = `img:${imageId}`;
  let n = 0;
  for (const c of categories || []) {
    if (c && c.icon === token) n++;
    for (const s of (c && c.subcategories) || []) if (s && s.icon === token) n++;
  }
  for (const a of accounts || []) if (a && a.icon === token) n++;
  for (const t of accountTypes || []) if (t && t.icon === token) n++;
  for (const v of Object.values(appIcons || {})) if (v === token) n++;
  return n;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/iconUsage.test.js`
Expected: PASS.

- [ ] **Step 5: Lint + commit + push**

```bash
npx eslint src/iconUsage.js src/iconUsage.test.js
git add src/iconUsage.js src/iconUsage.test.js
git commit -m "feat(icons): countIconUsage for the used-by-N delete hint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 4: `appearanceHistory.js` — coalescing undo reducer

**Files:**
- Create: `src/appearanceHistory.js`
- Test: `src/appearanceHistory.test.js`

`coalesceHistory(prev, makeEntry, opKey, cap)` appends a tagged snapshot, but if `opKey` is truthy and equals the top entry's `opKey`, returns `prev` unchanged (so a slider drag collapses to one step). `makeEntry` is only called when actually pushing.

- [ ] **Step 1: Write the failing test**

```js
// src/appearanceHistory.test.js
import { describe, it, expect, vi } from 'vitest';
import { coalesceHistory } from './appearanceHistory.js';

describe('coalesceHistory', () => {
  it('pushes a tagged entry and trims to cap', () => {
    let prev = [];
    for (let i = 0; i < 25; i++) prev = coalesceHistory(prev, () => ({ v: i }), null, 20);
    expect(prev.length).toBe(20);
    expect(prev[prev.length - 1].v).toBe(24);
    expect(prev[prev.length - 1].opKey).toBeNull();
  });

  it('coalesces consecutive entries with the same opKey', () => {
    let prev = coalesceHistory([], () => ({ v: 'a' }), 'bg:intensity', 20);
    const make = vi.fn(() => ({ v: 'b' }));
    prev = coalesceHistory(prev, make, 'bg:intensity', 20);
    expect(prev.length).toBe(1);
    expect(prev[0].v).toBe('a');        // pre-drag snapshot kept
    expect(make).not.toHaveBeenCalled(); // snapshot not even computed
  });

  it('pushes a new entry when opKey differs or is null', () => {
    let prev = coalesceHistory([], () => ({ v: 'a' }), 'bg:intensity', 20);
    prev = coalesceHistory(prev, () => ({ v: 'b' }), 'bg:effectStrength', 20);
    prev = coalesceHistory(prev, () => ({ v: 'c' }), null, 20);
    expect(prev.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/appearanceHistory.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/appearanceHistory.js
// Pure helper that powers undo coalescing in App.jsx. Continuous controls
// (sliders, color inputs) pass a stable opKey so a burst collapses into one
// undo step; discrete actions pass null and always push a fresh step.
export function coalesceHistory(prev, makeEntry, opKey, cap = 20) {
  const list = Array.isArray(prev) ? prev : [];
  if (opKey && list.length && list[list.length - 1].opKey === opKey) {
    return list; // coalesce — keep the pre-burst snapshot, compute nothing
  }
  const entry = { ...makeEntry(), opKey: opKey || null };
  return [...list.slice(-(cap - 1)), entry];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/appearanceHistory.test.js`
Expected: PASS.

- [ ] **Step 5: Lint + commit + push**

```bash
npx eslint src/appearanceHistory.js src/appearanceHistory.test.js
git add src/appearanceHistory.js src/appearanceHistory.test.js
git commit -m "feat(appearance): coalesceHistory undo reducer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 5: `useAppearance` — snapshot / restore / setAppIcon

**Files:**
- Modify: `src/useAppearance.js`
- Test: `src/useAppearance.test.jsx` (extend existing)

- [ ] **Step 1: Write the failing test (append to the existing describe file)**

```jsx
// Append these imports if missing at top of src/useAppearance.test.jsx:
//   import { renderHook, act, cleanup } from '@testing-library/react';
//   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
//   import useAppearance from './useAppearance.js';
// and afterEach(() => cleanup());

describe('useAppearance — undo support', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });

  it('snapshot + restore round-trips theme + background + appIcons', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.setTheme('forest'));
    act(() => result.current.setAppIcon('headerAvatar', 'img:abc'));
    const snap = result.current.snapshot();
    act(() => result.current.setTheme('parchment'));
    act(() => result.current.setAppIcon('headerAvatar', ''));
    expect(result.current.themeId).toBe('parchment');
    expect(result.current.appIcons.headerAvatar).toBeUndefined();
    act(() => result.current.restore(snap));
    expect(result.current.themeId).toBe('forest');
    expect(result.current.appIcons.headerAvatar).toBe('img:abc');
  });

  it('setAppIcon sets a slot and clears it on empty value', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.setAppIcon('headerAvatar', 'img:zzz'));
    expect(result.current.appIcons.headerAvatar).toBe('img:zzz');
    act(() => result.current.setAppIcon('headerAvatar', ''));
    expect(result.current.appIcons.headerAvatar).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useAppearance.test.jsx`
Expected: FAIL — `snapshot is not a function`.

- [ ] **Step 3: Implement — add three callbacks and return them**

In `src/useAppearance.js`, after `updateBackground` (before the `return {`), add:

```js
  const snapshot = useCallback(() => JSON.parse(JSON.stringify({
    themeId: state.themeId,
    customTheme: state.customTheme,
    background: state.background,
    appIcons: state.appIcons,
  })), [state]);

  const restore = useCallback((snap) => {
    if (!snap) return;
    setState(prev => persist({
      ...prev,
      themeId: snap.themeId,
      customTheme: snap.customTheme ?? null,
      background: { ...DEFAULT_BACKGROUND, ...(snap.background || {}) },
      appIcons: snap.appIcons || {},
    }));
  }, [persist]);

  const setAppIcon = useCallback((slot, value) => {
    setState(prev => {
      const appIcons = { ...prev.appIcons };
      if (value) appIcons[slot] = value; else delete appIcons[slot];
      return persist({ ...prev, appIcons });
    });
  }, [persist]);
```

Then add `snapshot, restore, setAppIcon` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useAppearance.test.jsx`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Lint + commit + push**

```bash
npx eslint src/useAppearance.js src/useAppearance.test.jsx
git add src/useAppearance.js src/useAppearance.test.jsx
git commit -m "feat(appearance): snapshot/restore/setAppIcon for undo + app icons

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 6: `recropThumb` — bake a square thumb (canvas; MANUAL-VERIFY)

**Files:**
- Modify: `src/imageProcess.js`

No automated test — `createImageBitmap`/canvas do not run in jsdom (same boundary as `processImageFile`; the pixel math is `cropRect`, already tested in Task 2). Verified in the final manual-verify task.

- [ ] **Step 1: Implement `recropThumb`**

Add to `src/imageProcess.js`:

```js
import { cropRect } from './iconCrop.js';

// MANUAL-VERIFY (canvas): re-encode a square thumb from the full blob, baking
// the user's crop. Used when an icon image is uploaded or its crop is adjusted.
export async function recropThumb(blob, framing, { thumbSize = 160 } = {}) {
  const bitmap = await createImageBitmap(blob);
  const { sx, sy, sw, sh } = cropRect(bitmap.width, bitmap.height, framing);
  const c = document.createElement('canvas');
  c.width = thumbSize; c.height = thumbSize;
  c.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, thumbSize, thumbSize);
  const thumb = await toBlob(c, 'image/jpeg', 0.85);
  if (bitmap.close) bitmap.close();
  return thumb;
}
```

(`toBlob` already exists in this file; `import { cropRect }` goes at the top with the other imports.)

- [ ] **Step 2: Verify the existing imageProcess test still passes (fitWithin unaffected)**

Run: `npx vitest run src/imageProcess.test.js` (if present) or `npx vitest run src/imageProcess`
Expected: PASS (no change to `fitWithin`).

- [ ] **Step 3: Lint + commit + push**

```bash
npx eslint src/imageProcess.js
git add src/imageProcess.js
git commit -m "feat(icons): recropThumb canvas re-encode (manual-verify)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 7: `iconUrlCache.js` — incremental object-URL diff

**Files:**
- Create: `src/iconUrlCache.js`
- Test: `src/iconUrlCache.test.js`

`diffIconUrls(prev, images, make, revoke)` returns a `Map<id, {url, thumb}>`: reuse the URL for an unchanged thumb, create one for a new/changed thumb (revoking the old), and revoke URLs for removed images. This is what keeps long lists flicker-free across add/delete/recrop.

- [ ] **Step 1: Write the failing test**

```js
// src/iconUrlCache.test.js
import { describe, it, expect, vi } from 'vitest';
import { diffIconUrls } from './iconUrlCache.js';

const thumbA = new Blob(['a']); const thumbB = new Blob(['b']);

describe('diffIconUrls', () => {
  it('creates urls for new images, skips images without a thumb', () => {
    const make = vi.fn((b) => `blob:${b === thumbA ? 'A' : 'B'}`);
    const next = diffIconUrls(new Map(), [
      { id: '1', thumb: thumbA }, { id: '2' }, // #2 has no thumb
    ], make, () => {});
    expect(next.get('1').url).toBe('blob:A');
    expect(next.has('2')).toBe(false);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('reuses the url for an unchanged thumb, revokes for removed', () => {
    const prev = new Map([['1', { url: 'blob:A', thumb: thumbA }], ['9', { url: 'blob:Z', thumb: thumbB }]]);
    const make = vi.fn(() => 'blob:NEW');
    const revoke = vi.fn();
    const next = diffIconUrls(prev, [{ id: '1', thumb: thumbA }], make, revoke);
    expect(next.get('1').url).toBe('blob:A'); // reused
    expect(make).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:Z'); // #9 removed
  });

  it('revokes + recreates when the thumb blob changes (re-crop)', () => {
    const prev = new Map([['1', { url: 'blob:OLD', thumb: thumbA }]]);
    const make = vi.fn(() => 'blob:NEW'); const revoke = vi.fn();
    const next = diffIconUrls(prev, [{ id: '1', thumb: thumbB }], make, revoke);
    expect(revoke).toHaveBeenCalledWith('blob:OLD');
    expect(next.get('1').url).toBe('blob:NEW');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/iconUrlCache.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/iconUrlCache.js
// Pure diff for the <Icon> object-URL cache. Stable urls for unchanged thumbs
// (no flicker), new urls for new/changed thumbs, revoke for removed. The actual
// createObjectURL/revokeObjectURL are injected so this is testable in jsdom.
export function diffIconUrls(prev, images, make, revoke) {
  const next = new Map();
  const seen = new Set();
  for (const img of images || []) {
    if (!img || !img.id || !img.thumb) continue;
    seen.add(img.id);
    const existing = prev.get(img.id);
    if (existing && existing.thumb === img.thumb) {
      next.set(img.id, existing);
    } else {
      if (existing) revoke(existing.url);
      next.set(img.id, { url: make(img.thumb), thumb: img.thumb });
    }
  }
  for (const [id, entry] of prev) {
    if (!seen.has(id)) revoke(entry.url);
  }
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/iconUrlCache.test.js`
Expected: PASS.

- [ ] **Step 5: Lint + commit + push**

```bash
npx eslint src/iconUrlCache.js src/iconUrlCache.test.js
git add src/iconUrlCache.js src/iconUrlCache.test.js
git commit -m "feat(icons): diffIconUrls incremental object-URL cache

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 8: `IconLibraryProvider` — root context owning library + URL cache

**Files:**
- Create: `src/IconLibraryProvider.jsx`
- Test: `src/IconLibraryProvider.test.jsx`

Owns one `useImageLibrary()` and the diffed URL cache; exposes `{ images, urlForId, addFromFile, remove, updateMeta, reload }`. A safe default context value lets `<Icon>` render (fallback) without a provider in isolated tests.

- [ ] **Step 1: Write the failing test**

```jsx
// src/IconLibraryProvider.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import IconLibraryProvider, { useIconLibrary } from './IconLibraryProvider.jsx';
import { putRecord } from './imageStore.js';

let n;
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  n = 0;
  vi.stubGlobal('URL', { createObjectURL: () => `blob:${++n}`, revokeObjectURL: () => {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Probe() {
  const { images, urlForId } = useIconLibrary();
  return <div data-testid="probe">{images.length}:{urlForId('seed-1') || 'none'}</div>;
}

describe('IconLibraryProvider', () => {
  it('loads thumbs into object urls reachable via urlForId', async () => {
    await putRecord({ id: 'seed-1', thumb: new Blob(['x']), name: 'Seed', group: 'G', createdAt: 1 });
    const { getByTestId } = render(
      <IconLibraryProvider><Probe /></IconLibraryProvider>
    );
    await waitFor(() => expect(getByTestId('probe').textContent).toContain('blob:'));
    expect(getByTestId('probe').textContent.startsWith('1:')).toBe(true);
  });

  it('useIconLibrary returns a safe default outside a provider', () => {
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('0:none');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/IconLibraryProvider.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/IconLibraryProvider.jsx
import React, { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback } from 'react';
import useImageLibrary from './useImageLibrary.js';
import { diffIconUrls } from './iconUrlCache.js';

const DEFAULT = {
  images: [], urlForId: () => undefined,
  addFromFile: async () => {}, remove: async () => {},
  updateMeta: async () => {}, reload: () => {},
};

export const IconLibraryContext = createContext(DEFAULT);
export function useIconLibrary() { return useContext(IconLibraryContext); }

export default function IconLibraryProvider({ children }) {
  const lib = useImageLibrary();
  const mapRef = useRef(new Map());
  const [, setVersion] = useState(0);

  useEffect(() => {
    const make = (blob) => { try { return URL.createObjectURL(blob); } catch { return ''; } };
    const revoke = (url) => { try { if (url) URL.revokeObjectURL(url); } catch { /* ignore */ } };
    mapRef.current = diffIconUrls(mapRef.current, lib.images, make, revoke);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVersion(v => v + 1);
  }, [lib.images]);

  // Revoke everything on unmount.
  useEffect(() => () => {
    for (const entry of mapRef.current.values()) {
      try { URL.revokeObjectURL(entry.url); } catch { /* ignore */ }
    }
  }, []);

  const urlForId = useCallback((id) => {
    const e = mapRef.current.get(id);
    return e ? e.url : undefined;
  }, []);

  const value = useMemo(() => ({
    images: lib.images,
    urlForId,
    addFromFile: lib.addFromFile,
    remove: lib.remove,
    updateMeta: lib.updateMeta,
    reload: lib.reload,
  }), [lib.images, lib.addFromFile, lib.remove, lib.updateMeta, lib.reload, urlForId]);

  return <IconLibraryContext.Provider value={value}>{children}</IconLibraryContext.Provider>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/IconLibraryProvider.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint + commit + push**

```bash
npx eslint src/IconLibraryProvider.jsx src/IconLibraryProvider.test.jsx
git add src/IconLibraryProvider.jsx src/IconLibraryProvider.test.jsx
git commit -m "feat(icons): IconLibraryProvider context (library + url cache)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 9: `Icon.jsx` — universal renderer

**Files:**
- Create: `src/Icon.jsx`
- Test: `src/Icon.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// src/Icon.test.jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import Icon from './Icon.jsx';
import { IconLibraryContext } from './IconLibraryProvider.jsx';

afterEach(() => cleanup());

const withCache = (urlForId, ui) => render(
  <IconLibraryContext.Provider value={{ images: [], urlForId, addFromFile: async () => {}, remove: async () => {}, updateMeta: async () => {}, reload: () => {} }}>{ui}</IconLibraryContext.Provider>
);

describe('Icon', () => {
  it('renders an emoji as text', () => {
    const { container } = render(<Icon value="🛒" className="cat-icon" />);
    const span = container.querySelector('.cat-icon');
    expect(span.textContent).toBe('🛒');
    expect(span.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders an <img> for a cached image token', () => {
    const { container } = withCache((id) => (id === 'p1' ? 'blob:1' : undefined), <Icon value="img:p1" className="cat-icon" />);
    const img = container.querySelector('img.icon-img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('blob:1');
    expect(img.getAttribute('alt')).toBe('');
  });

  it('falls back to a glyph when the image id is missing/deleted', () => {
    const { container } = withCache(() => undefined, <Icon value="img:gone" className="cat-icon" fallback="🏷️" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.cat-icon').textContent).toBe('🏷️');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/Icon.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/Icon.jsx
// One renderer for every icon. Emoji -> text span; img:<id> -> <img> from the
// IconLibrary url cache; missing/deleted id -> fallback glyph (never a crash).
import React from 'react';
import { parseIconValue } from './iconValue.js';
import { useIconLibrary } from './IconLibraryProvider.jsx';

export default function Icon({ value, className = '', title, fallback = '🖼️' }) {
  const { urlForId } = useIconLibrary();
  const parsed = parseIconValue(value);

  if (parsed.kind === 'image') {
    const url = urlForId(parsed.id);
    if (url) {
      return <img className={`icon-img ${className}`.trim()} src={url} alt="" title={title} />;
    }
    return <span className={className} aria-hidden="true" title={title}>{fallback}</span>;
  }

  return (
    <span className={className} aria-hidden="true" title={title}>
      {parsed.kind === 'emoji' ? parsed.emoji : ''}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/Icon.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint + commit + push**

```bash
npx eslint src/Icon.jsx src/Icon.test.jsx
git add src/Icon.jsx src/Icon.test.jsx
git commit -m "feat(icons): <Icon> universal renderer with glyph fallback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 10: Icon + header-avatar CSS (MANUAL-VERIFY visual)

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Add styles** (append near the appearance/background styles)

```css
/* Image-icons: square thumb rendered in place of an emoji glyph. Sized to the
   line so it matches emoji icons in lists/rows; circular by default. */
.icon-img {
  display: inline-block;
  width: 1.15em;
  height: 1.15em;
  border-radius: 50%;
  object-fit: cover;
  vertical-align: -0.2em;
}
/* Account/type tiles read better with a soft square. */
.account-row-icon.icon-img,
.type-row-icon.icon-img,
.manage-list-icon.icon-img { border-radius: 22%; }

/* Header avatar */
.header-avatar { width: 1.4em; height: 1.4em; border-radius: 50%; }

/* Square framing clip variant for the icon crop modal. */
.bg-framing-editor.framing-square .bg-framing-clip { aspect-ratio: 1 / 1; width: 220px; max-width: 100%; }

/* Image Icons tab + ActionMenu */
.action-menu { position: relative; display: inline-block; }
.action-menu-trigger { background: rgba(0,0,0,.55); color: #fff; border: none; border-radius: 6px; width: 22px; height: 22px; line-height: 22px; cursor: pointer; }
.action-menu-popover { position: absolute; top: 26px; right: 0; min-width: 160px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 12px 34px rgba(0,0,0,.45); padding: 5px; z-index: 30; }
.action-menu-item { display: block; width: 100%; text-align: left; background: none; border: none; color: var(--text); padding: 7px 10px; border-radius: 6px; cursor: pointer; font: inherit; }
.action-menu-item:hover { background: var(--bg-card-hover); }
.action-menu-item.danger { color: var(--red); }
.image-icons-grid { display: flex; flex-wrap: wrap; gap: 14px; }
.image-icon-cell { position: relative; text-align: center; }
.image-icon-thumb { width: 64px; height: 64px; border-radius: 14px; object-fit: cover; display: block; }
.image-icon-cell .action-menu { position: absolute; top: 4px; right: 4px; }
```

- [ ] **Step 2: Commit + push** (CSS isn't linted by the project's eslint; visual correctness is deferred to the final manual-verify task)

```bash
git add src/App.css
git commit -m "style(icons): <Icon>, header avatar, ActionMenu, image-icons grid

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 11: `ActionMenu.jsx` — shared kebab menu

**Files:**
- Create: `src/ActionMenu.jsx`
- Test: `src/ActionMenu.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// src/ActionMenu.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import ActionMenu from './ActionMenu.jsx';

afterEach(() => cleanup());

const items = (onRename, onDelete) => [
  { label: 'Rename', onSelect: onRename },
  { label: 'Delete', onSelect: onDelete, danger: true },
];

describe('ActionMenu', () => {
  it('opens on trigger and lists items', () => {
    const { getByLabelText, queryByText, getByText } = render(<ActionMenu label="Options for Mom" items={items(() => {}, () => {})} />);
    expect(queryByText('Rename')).toBeNull();
    fireEvent.click(getByLabelText('Options for Mom'));
    expect(getByText('Rename')).toBeTruthy();
    expect(getByText('Delete')).toBeTruthy();
  });

  it('calls the item handler and closes', () => {
    const onRename = vi.fn();
    const { getByLabelText, getByText, queryByText } = render(<ActionMenu label="Options" items={items(onRename, () => {})} />);
    fireEvent.click(getByLabelText('Options'));
    fireEvent.click(getByText('Rename'));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(queryByText('Rename')).toBeNull();
  });

  it('closes on Escape', () => {
    const { getByLabelText, getByText, queryByText } = render(<ActionMenu label="Options" items={items(() => {}, () => {})} />);
    fireEvent.click(getByLabelText('Options'));
    fireEvent.keyDown(getByText('Rename'), { key: 'Escape' });
    expect(queryByText('Rename')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ActionMenu.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/ActionMenu.jsx
// Shared kebab (⋮) menu used by the Image Icons tab and Background photo cells.
import React, { useState, useRef, useEffect } from 'react';

export default function ActionMenu({ label, items = [] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <span className="action-menu" ref={ref} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
      <button
        type="button" className="action-menu-trigger"
        aria-haspopup="menu" aria-expanded={open} aria-label={label}
        onClick={() => setOpen(o => !o)}
      >⋮</button>
      {open && (
        <div className="action-menu-popover" role="menu">
          {items.map((it) => (
            <button
              key={it.label} type="button" role="menuitem"
              className={`action-menu-item${it.danger ? ' danger' : ''}`}
              onClick={() => { setOpen(false); it.onSelect(); }}
            >{it.label}</button>
          ))}
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ActionMenu.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint + commit + push**

```bash
npx eslint src/ActionMenu.jsx src/ActionMenu.test.jsx
git add src/ActionMenu.jsx src/ActionMenu.test.jsx
git commit -m "feat(appearance): shared ActionMenu kebab component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 12: `FramingEditor.jsx` — extract drag-pan + zoom from BackgroundTab

**Files:**
- Create: `src/FramingEditor.jsx`
- Test: `src/FramingEditor.test.jsx`
- Modify: `src/BackgroundTab.jsx` (use the extracted component)
- Regression: `src/BackgroundTab.test.jsx` must stay green

- [ ] **Step 1: Write the failing test for FramingEditor**

```jsx
// src/FramingEditor.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import FramingEditor from './FramingEditor.jsx';

beforeEach(() => { vi.stubGlobal('URL', { createObjectURL: () => 'blob:1', revokeObjectURL: () => {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('FramingEditor', () => {
  it('renders the focal slider and emits a zoom patch', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <FramingEditor blob={new Blob(['x'])} framing={{ posX: 50, posY: 50, zoom: 1 }} onChange={onChange} aspect="square" />
    );
    expect(getByLabelText('Focal point — drag or use arrow keys')).toBeTruthy();
    fireEvent.change(getByLabelText('Zoom'), { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith({ zoom: 2 });
  });

  it('emits a focal patch on arrow keys', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <FramingEditor blob={new Blob(['x'])} framing={{ posX: 50, posY: 50, zoom: 1 }} onChange={onChange} />
    );
    fireEvent.keyDown(getByLabelText('Focal point — drag or use arrow keys'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith({ posX: 52 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/FramingEditor.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write FramingEditor**

```jsx
// src/FramingEditor.jsx
// Drag-to-pan + zoom framing editor, extracted from BackgroundTab so the icon
// crop modal and the background framing share one WYSIWYG editor. Manages its
// own preview object URL (jsdom throws on createObjectURL — guarded). The parent
// owns/clamps the framing; this emits patches.
import React, { useState, useEffect, useRef } from 'react';
import { clampFraming, panFraming } from './backgroundPhotos.js';

export default function FramingEditor({ blob, framing, onChange, aspect = 'free' }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let u = null;
    if (blob) { try { u = URL.createObjectURL(blob); } catch { u = null; } }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u);
    return () => { if (u) { try { URL.revokeObjectURL(u); } catch { /* ignore */ } } };
  }, [blob]);

  const f = clampFraming(framing);
  const dragRef = useRef(null);

  const onKey = (e) => {
    const step = 2;
    const map = {
      ArrowLeft: { posX: f.posX - step }, ArrowRight: { posX: f.posX + step },
      ArrowUp: { posY: f.posY - step }, ArrowDown: { posY: f.posY + step },
    };
    if (map[e.key]) { e.preventDefault(); onChange(map[e.key]); }
  };
  const onDown = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { x: e.clientX, y: e.clientY, start: f, w: rect.width, h: rect.height };
    if (e.currentTarget.setPointerCapture) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    onChange(panFraming(d.start, e.clientX - d.x, e.clientY - d.y, d.w, d.h));
  };
  const onUp = () => { dragRef.current = null; };

  return (
    <div className={`bg-framing-editor${aspect === 'square' ? ' framing-square' : ''}`}>
      <div
        className="bg-framing-clip"
        role="slider" tabIndex={0}
        aria-label="Focal point — drag or use arrow keys"
        aria-valuetext={`${f.posX}% ${f.posY}%`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        onKeyDown={onKey}
      >
        <div
          className="bg-framing-img"
          style={url ? {
            backgroundImage: `url(${url})`,
            backgroundPosition: `${f.posX}% ${f.posY}%`,
            transform: `scale(${f.zoom})`,
            transformOrigin: `${f.posX}% ${f.posY}%`,
          } : undefined}
        />
      </div>
      <label className="appearance-label" htmlFor="framing-zoom">
        Zoom
        <input
          id="framing-zoom" type="range" min="1" max="3" step="0.1" className="bg-intensity"
          aria-label="Zoom" value={f.zoom}
          onChange={(e) => onChange({ zoom: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Run the FramingEditor test (PASS), then refactor BackgroundTab**

Run: `npx vitest run src/FramingEditor.test.jsx` → PASS.

In `src/BackgroundTab.jsx`:
1. Update imports: `import { togglePhotoSelection, clampFraming, pruneDeletedPhoto } from './backgroundPhotos.js';` (drop `panFraming`) and add `import FramingEditor from './FramingEditor.jsx';`.
2. Delete the `editUrl` state, the object-URL `useEffect`, `onFocalKey`, `dragRef`, `onDragStart`, `onDragMove`, `onDragEnd` (all now inside FramingEditor).
3. Replace the entire inline `{editingId && (() => { ... })()}` editor block with:

```jsx
          {editingId && (
            <div className="bg-framing-editor-wrap">
              <FramingEditor
                blob={(images.find(i => i.id === editingId) || {}).blob}
                framing={framing[editingId]}
                onChange={(patch) => setFraming(editingId, patch)}
                aspect="free"
              />
              <button type="button" className="bg-mode-btn" onClick={() => setEditingId(null)}>Done</button>
            </div>
          )}
```

- [ ] **Step 5: Run the BackgroundTab regression test**

Run: `npx vitest run src/BackgroundTab.test.jsx`
Expected: PASS (the editor still exposes role="slider" + "Focal point…" + "Zoom" + "Done"). If a test asserted the removed `editUrl` internals, update it to assert on the rendered slider/zoom instead.

- [ ] **Step 6: Lint + commit + push**

```bash
npx eslint src/FramingEditor.jsx src/FramingEditor.test.jsx src/BackgroundTab.jsx
git add src/FramingEditor.jsx src/FramingEditor.test.jsx src/BackgroundTab.jsx
git commit -m "refactor(appearance): extract shared FramingEditor; BackgroundTab uses it

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 13: `ImageCropModal.jsx` — square crop modal

**Files:**
- Create: `src/ImageCropModal.jsx`
- Test: `src/ImageCropModal.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// src/ImageCropModal.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import ImageCropModal from './ImageCropModal.jsx';

beforeEach(() => { vi.stubGlobal('URL', { createObjectURL: () => 'blob:1', revokeObjectURL: () => {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ImageCropModal', () => {
  it('renders the square framing editor and confirms with the framing', () => {
    const onDone = vi.fn(); const onCancel = vi.fn();
    const { getByLabelText, getByText } = render(
      <ImageCropModal blob={new Blob(['x'])} onDone={onDone} onCancel={onCancel} />
    );
    expect(getByLabelText('Focal point — drag or use arrow keys')).toBeTruthy();
    fireEvent.change(getByLabelText('Zoom'), { target: { value: '2' } });
    fireEvent.click(getByText('Done'));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ zoom: 2 }));
  });

  it('cancels on the Cancel button and on Escape', () => {
    const onCancel = vi.fn();
    const { getByText, getByLabelText } = render(
      <ImageCropModal blob={new Blob(['x'])} onDone={() => {}} onCancel={onCancel} />
    );
    fireEvent.click(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(getByLabelText('Crop image'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ImageCropModal.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/ImageCropModal.jsx
// Square crop/zoom modal over an uploaded blob. Wraps the shared FramingEditor;
// on Done returns the chosen {posX,posY,zoom} for the caller to bake a thumb.
import React, { useState } from 'react';
import FramingEditor from './FramingEditor.jsx';
import { clampFraming } from './backgroundPhotos.js';

export default function ImageCropModal({ blob, initialFraming, onDone, onCancel }) {
  const [framing, setFraming] = useState(() => clampFraming(initialFraming));
  const patch = (p) => setFraming(prev => clampFraming({ ...prev, ...p }));

  return (
    <div
      className="modal-overlay" role="dialog" aria-modal="true" aria-label="Crop image"
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <div className="modal crop-modal">
        <h3 className="modal-title">Position your image</h3>
        <FramingEditor blob={blob} framing={framing} onChange={patch} aspect="square" />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => onDone(framing)}>Done</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ImageCropModal.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint + commit + push**

```bash
npx eslint src/ImageCropModal.jsx src/ImageCropModal.test.jsx
git add src/ImageCropModal.jsx src/ImageCropModal.test.jsx
git commit -m "feat(icons): ImageCropModal square crop/zoom

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 14: `curatedIcons.js` + extend `IconPicker` (two tabs, search, upload→crop)

**Files:**
- Create: `src/curatedIcons.js`
- Modify: `src/IconPicker.jsx`
- Test: `src/IconPicker.test.jsx` (extend)

- [ ] **Step 1: Move CURATED_ICONS to its own module (clears the pre-existing react-refresh lint error)**

```js
// src/curatedIcons.js
export const CURATED_ICONS = [
  '⚡', '🛒', '💊', '🧗', '🛡️', '🎬', '🚗', '🍽️', '🛍️', '📱',
  '🅿️', '🙏', '📋', '💰', '🏠', '✈️', '🎮', '📚', '🎓', '👶',
  '🐾', '🏥', '💼', '🎁', '🍷', '☕', '🧾', '💡', '🔧', '🌱',
];
```

- [ ] **Step 2: Write the failing tests (append to src/IconPicker.test.jsx)**

```jsx
// Ensure these imports exist at the top of src/IconPicker.test.jsx:
//   import { render, fireEvent, cleanup } from '@testing-library/react';
//   import { describe, it, expect, vi, afterEach } from 'vitest';
//   import IconPicker from './IconPicker.jsx';
//   import { IconLibraryContext } from './IconLibraryProvider.jsx';
// and afterEach(() => cleanup());

const libValue = (over = {}) => ({
  images: [
    { id: 'p1', name: 'Mom', group: 'Family', thumb: new Blob(['m']) },
    { id: 'p2', name: 'Rusty', group: 'Pets', thumb: new Blob(['r']) },
  ],
  urlForId: (id) => `blob:${id}`,
  addFromFile: vi.fn(async () => ({ id: 'new1', blob: new Blob(['n']) })),
  remove: async () => {}, updateMeta: async () => {}, reload: () => {},
  ...over,
});
const renderPicker = (props, over) => render(
  <IconLibraryContext.Provider value={libValue(over)}><IconPicker {...props} /></IconLibraryContext.Provider>
);

describe('IconPicker — images', () => {
  it('defaults to the Your images tab when the value is an image token', () => {
    const { getByLabelText, getByText } = renderPicker({ value: 'img:p1', onChange: () => {} });
    fireEvent.click(getByLabelText('Icon picker'));
    expect(getByText('Mom')).toBeTruthy(); // gallery visible without switching tabs
  });

  it('selecting an image emits an img: token', () => {
    const onChange = vi.fn();
    const { getByLabelText, getByText } = renderPicker({ value: '🛒', onChange });
    fireEvent.click(getByLabelText('Icon picker'));
    fireEvent.click(getByText('Your images'));
    fireEvent.click(getByText('Mom'));
    expect(onChange).toHaveBeenCalledWith('img:p1');
  });

  it('search filters the gallery by name', () => {
    const { getByLabelText, getByText, queryByText } = renderPicker({ value: '🛒', onChange: () => {} });
    fireEvent.click(getByLabelText('Icon picker'));
    fireEvent.click(getByText('Your images'));
    fireEvent.change(getByLabelText('Search images'), { target: { value: 'rust' } });
    expect(getByText('Rusty')).toBeTruthy();
    expect(queryByText('Mom')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/IconPicker.test.jsx`
Expected: FAIL — `Your images` / gallery not found.

- [ ] **Step 4: Rewrite IconPicker**

```jsx
// src/IconPicker.jsx
import React, { useState } from 'react';
import { CURATED_ICONS } from './curatedIcons.js';
import { useIconLibrary } from './IconLibraryProvider.jsx';
import { parseIconValue } from './iconValue.js';
import { recropThumb } from './imageProcess.js';
import ImageCropModal from './ImageCropModal.jsx';
import Icon from './Icon.jsx';

export default function IconPicker({ value, onChange }) {
  const lib = useIconLibrary();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(() => (parseIconValue(value).kind === 'image' ? 'images' : 'emoji'));
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [cropBlob, setCropBlob] = useState(null);
  const [cropId, setCropId] = useState(null);

  const submitEmoji = () => {
    const v = draft.trim();
    if (v) { onChange(v); setDraft(''); setOpen(false); }
  };

  const q = query.trim().toLowerCase();
  const gallery = lib.images.filter(im => !q || (im.name || '').toLowerCase().includes(q));
  const groups = Array.from(new Set(gallery.map(im => im.group || 'Uncategorized')));

  const onPickFile = async (file) => {
    if (!file) return;
    const saved = await lib.addFromFile(file, {});  // full blob + center thumb + palette
    setCropId(saved.id);
    setCropBlob(saved.blob);
  };
  const onCropDone = async (framing) => {
    try {
      const thumb = await recropThumb(cropBlob, framing);
      await lib.updateMeta(cropId, { thumb, iconCrop: framing });
    } catch { /* canvas unavailable in tests — meta crop still recorded below */ }
    onChange(`img:${cropId}`);
    setCropBlob(null); setCropId(null); setOpen(false);
  };

  return (
    <div className="picker">
      <button type="button" className="picker-trigger" aria-label="Icon picker" onClick={() => setOpen(o => !o)}>
        <Icon value={value} /> ▾
      </button>
      {open && (
        <div className="picker-popover">
          <div className="picker-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'emoji'} className={`picker-tab${tab === 'emoji' ? ' on' : ''}`} onClick={() => setTab('emoji')}>Emoji</button>
            <button type="button" role="tab" aria-selected={tab === 'images'} className={`picker-tab${tab === 'images' ? ' on' : ''}`} onClick={() => setTab('images')}>Your images</button>
          </div>

          {tab === 'emoji' ? (
            <>
              <div className="picker-grid">
                {CURATED_ICONS.map(icon => (
                  <button key={icon} type="button" className="picker-cell" onClick={() => { onChange(icon); setOpen(false); }}>{icon}</button>
                ))}
              </div>
              <input type="text" className="picker-input" placeholder="Or paste any emoji" value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitEmoji(); } }} />
            </>
          ) : (
            <div className="picker-images">
              <div className="picker-images-bar">
                <input type="text" className="picker-input" aria-label="Search images" placeholder="🔍 Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
                <label className="btn picker-upload">↑ Upload
                  <input type="file" accept="image/*" aria-label="Upload image" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; onPickFile(f); }} />
                </label>
              </div>
              {gallery.length === 0 ? (
                <p className="appearance-hint">No images yet — upload one.</p>
              ) : groups.map(g => (
                <div key={g} className="picker-image-group">
                  <div className="appearance-label">{g}</div>
                  <div className="picker-image-row">
                    {gallery.filter(im => (im.group || 'Uncategorized') === g).map(im => (
                      <button key={im.id} type="button" className="picker-image-cell" aria-label={`Select ${im.name}`}
                        onClick={() => { onChange(`img:${im.id}`); setOpen(false); }}>
                        <img className="image-icon-thumb" src={lib.urlForId(im.id)} alt="" />
                        <span className="picker-image-name">{im.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {cropBlob && (
        <ImageCropModal blob={cropBlob} onDone={onCropDone} onCancel={() => { setCropBlob(null); setCropId(null); }} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/IconPicker.test.jsx`
Expected: PASS (existing emoji tests + 3 new image tests). The `recropThumb` canvas path is swallowed in jsdom; `onChange('img:id')` still fires.

- [ ] **Step 6: Lint + commit + push**

```bash
npx eslint src/curatedIcons.js src/IconPicker.jsx src/IconPicker.test.jsx
git add src/curatedIcons.js src/IconPicker.jsx src/IconPicker.test.jsx
git commit -m "feat(icons): IconPicker two-tab emoji/images + upload-crop

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 15: `ImageIconsTab.jsx` — library management + App icons section

**Files:**
- Create: `src/ImageIconsTab.jsx`
- Test: `src/ImageIconsTab.test.jsx`

Uses `useIconLibrary()` for images/CRUD, `countIconUsage` for the delete hint, `ActionMenu` per thumb, `ImageCropModal` for Adjust, `IconPicker` for the header-avatar app slot.

- [ ] **Step 1: Write the failing test**

```jsx
// src/ImageIconsTab.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import ImageIconsTab from './ImageIconsTab.jsx';
import { IconLibraryContext } from './IconLibraryProvider.jsx';

afterEach(() => cleanup());

const appearance = { appIcons: {}, setAppIcon: vi.fn() };
const usageData = { categories: [{ id: 'c', icon: 'img:p1' }], accounts: [], accountTypes: [] };

const lib = (over = {}) => ({
  images: [{ id: 'p1', name: 'Mom', group: 'Family', thumb: new Blob(['m']) }],
  urlForId: (id) => `blob:${id}`,
  addFromFile: vi.fn(async () => ({ id: 'n', blob: new Blob(['n']) })),
  remove: vi.fn(async () => {}), updateMeta: vi.fn(async () => {}), reload: () => {},
  ...over,
});
const renderTab = (over) => {
  const value = lib(over);
  const utils = render(
    <IconLibraryContext.Provider value={value}>
      <ImageIconsTab appearance={appearance} {...usageData} />
    </IconLibraryContext.Provider>
  );
  return { ...utils, value };
};

describe('ImageIconsTab', () => {
  it('lists grouped thumbs and opens the kebab menu', () => {
    const { getByLabelText, getByText } = renderTab();
    expect(getByText('Family')).toBeTruthy();
    fireEvent.click(getByLabelText('Actions for Mom'));
    expect(getByText('Rename')).toBeTruthy();
    expect(getByText('Delete')).toBeTruthy();
  });

  it('delete shows a used-by hint then removes', () => {
    const { getByLabelText, getByText, value } = renderTab();
    fireEvent.click(getByLabelText('Actions for Mom'));
    fireEvent.click(getByText('Delete'));
    expect(getByText(/Used by 1/)).toBeTruthy();
    fireEvent.click(getByText('Delete', { selector: '.image-icon-confirm-delete' }));
    expect(value.remove).toHaveBeenCalledWith('p1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ImageIconsTab.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/ImageIconsTab.jsx
import React, { useState } from 'react';
import { useIconLibrary } from './IconLibraryProvider.jsx';
import { countIconUsage } from './iconUsage.js';
import { recropThumb } from './imageProcess.js';
import ActionMenu from './ActionMenu.jsx';
import ImageCropModal from './ImageCropModal.jsx';
import IconPicker from './IconPicker.jsx';

export default function ImageIconsTab({ appearance, categories = [], accounts = [], accountTypes = [] }) {
  const lib = useIconLibrary();
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [cropId, setCropId] = useState(null);
  const [movingId, setMovingId] = useState(null);

  const q = query.trim().toLowerCase();
  const shown = lib.images.filter(im => !q || (im.name || '').toLowerCase().includes(q));
  const groups = Array.from(new Set(shown.map(im => im.group || 'Uncategorized')));
  const allGroups = Array.from(new Set(lib.images.map(im => im.group || 'Uncategorized')));
  const cropImage = cropId ? lib.images.find(im => im.id === cropId) : null;

  const commitRename = (id) => { if (renameDraft.trim()) lib.updateMeta(id, { name: renameDraft.trim() }); setRenamingId(null); };
  const moveTo = (id, group) => { lib.updateMeta(id, { group }); setMovingId(null); };
  const onCropDone = async (framing) => {
    try { const thumb = await recropThumb(cropImage.blob, framing); await lib.updateMeta(cropId, { thumb, iconCrop: framing }); }
    catch { await lib.updateMeta(cropId, { iconCrop: framing }); }
    setCropId(null);
  };

  return (
    <div className="image-icons-tab">
      <div className="appearance-label">App icons</div>
      <label className="image-icons-appslot">
        <span>Header avatar</span>
        <IconPicker value={appearance.appIcons.headerAvatar || ''} onChange={(v) => appearance.setAppIcon('headerAvatar', v)} />
      </label>

      <div className="image-icons-toolbar">
        <input type="text" className="input" aria-label="Search images" placeholder="🔍 Search images…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="btn">↑ Upload
          <input type="file" accept="image/*" aria-label="Upload image" style={{ display: 'none' }}
            onChange={async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) { const saved = await lib.addFromFile(f, {}); setCropId(saved.id); } }} />
        </label>
      </div>

      {lib.images.length === 0 && <p className="appearance-hint">No images yet — upload one to get started.</p>}

      {groups.map(g => (
        <div key={g} className="image-icons-group">
          <div className="appearance-label">{g}</div>
          <div className="image-icons-grid">
            {shown.filter(im => (im.group || 'Uncategorized') === g).map(im => (
              <div key={im.id} className="image-icon-cell">
                <img className="image-icon-thumb" src={lib.urlForId(im.id)} alt="" />
                <ActionMenu label={`Actions for ${im.name}`} items={[
                  { label: 'Adjust crop', onSelect: () => setCropId(im.id) },
                  { label: 'Rename', onSelect: () => { setRenamingId(im.id); setRenameDraft(im.name); } },
                  { label: 'Move to group', onSelect: () => setMovingId(im.id) },
                  { label: 'Delete', danger: true, onSelect: () => setConfirmDeleteId(im.id) },
                ]} />
                {renamingId === im.id ? (
                  <input className="image-icon-rename" aria-label={`Name for ${im.name}`} autoFocus value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)} onBlur={() => commitRename(im.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(im.id); }} />
                ) : (
                  <span className="image-icon-name">{im.name}</span>
                )}
                {movingId === im.id && (
                  <div className="image-icon-move">
                    {allGroups.filter(x => x !== (im.group || 'Uncategorized')).map(x => (
                      <button key={x} type="button" className="btn" onClick={() => moveTo(im.id, x)}>{x}</button>
                    ))}
                    <button type="button" className="btn" onClick={() => { const name = (window.prompt && window.prompt('New group')) || ''; if (name.trim()) moveTo(im.id, name.trim()); }}>＋ New group</button>
                  </div>
                )}
                {confirmDeleteId === im.id && (
                  <div className="image-icon-confirm">
                    <span className="image-icon-usage">Used by {countIconUsage(im.id, { categories, accounts, accountTypes, appIcons: appearance.appIcons })}. Delete?</span>
                    <button type="button" className="btn btn-danger image-icon-confirm-delete" onClick={() => { lib.remove(im.id); setConfirmDeleteId(null); }}>Delete</button>
                    <button type="button" className="btn" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {cropImage && (
        <ImageCropModal blob={cropImage.blob} initialFraming={cropImage.iconCrop} onDone={onCropDone} onCancel={() => setCropId(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ImageIconsTab.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint + commit + push**

```bash
npx eslint src/ImageIconsTab.jsx src/ImageIconsTab.test.jsx
git add src/ImageIconsTab.jsx src/ImageIconsTab.test.jsx
git commit -m "feat(icons): ImageIconsTab library management + app icons

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 16: Mount provider + wire AppearanceScreen + header avatar

**Files:**
- Modify: `src/main.jsx`, `src/AppearanceScreen.jsx`, `src/App.jsx`
- Regression: `src/AppearanceScreen.test.jsx`

- [ ] **Step 1: Wrap the app in the provider** (`src/main.jsx`)

Add `import IconLibraryProvider from './IconLibraryProvider.jsx';` and wrap:

```jsx
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <IconLibraryProvider>
      <App />
    </IconLibraryProvider>
  </StrictMode>,
)
```

- [ ] **Step 2: AppearanceScreen consumes the shared library + renders ImageIconsTab**

Rewrite `src/AppearanceScreen.jsx`:

```jsx
import React, { useState } from 'react';
import ThemeTab from './ThemeTab.jsx';
import BackgroundTab from './BackgroundTab.jsx';
import ImageIconsTab from './ImageIconsTab.jsx';
import UndoButton from './UndoButton.jsx';
import { useIconLibrary } from './IconLibraryProvider.jsx';

const TABS = [
  { id: 'theme', label: 'Theme' },
  { id: 'bg', label: 'Background' },
  { id: 'icons', label: 'Image Icons' },
];

export default function AppearanceScreen({ appearance, categories = [], accounts = [], accountTypes = [], onUndo, undoCount = 0, onClose }) {
  const [tab, setTab] = useState('theme');
  const library = useIconLibrary();
  return (
    <div className="container appearance-screen">
      <div className="header">
        <h1 className="title">✦ Appearance</h1>
        <div className="header-actions">
          <UndoButton count={undoCount} onUndo={onUndo} />
          <button type="button" className="btn" onClick={onClose}>Done</button>
        </div>
      </div>

      <div className="appearance-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={`appearance-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="appearance-body">
        {tab === 'theme' && <ThemeTab appearance={appearance} />}
        {tab === 'bg' && (
          <BackgroundTab
            appearance={appearance}
            images={library.images}
            onUpload={(file) => library.addFromFile(file, {})}
            onRename={(id, name) => library.updateMeta(id, { name })}
            onDelete={(id) => library.remove(id)}
          />
        )}
        {tab === 'icons' && (
          <ImageIconsTab appearance={appearance} categories={categories} accounts={accounts} accountTypes={accountTypes} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: App.jsx — pass data + undo to AppearanceScreen, add header avatar**

In `src/App.jsx`:
1. `import Icon from './Icon.jsx';` (top with other imports).
2. In the header `.brand` block, after the `<p className="brand-sub">Accounts</p>` line, add:

```jsx
            <Icon value={appearance.appIcons.headerAvatar} fallback="✦" className="header-avatar" title="Your avatar" />
```

3. Update the AppearanceScreen render (around line 423):

```jsx
      {screen === 'appearance' && (
        <AppearanceScreen
          appearance={appearance}
          categories={cats.categories}
          accounts={ledger.accounts}
          accountTypes={accountTypes.types}
          onUndo={undo}
          undoCount={history.length}
          onClose={() => setScreen('main')}
        />
      )}
```

(`appearance` here is still the raw hook for now; Task 19 swaps in the undo-wrapped object.)

- [ ] **Step 4: Run the regression tests**

Run: `npx vitest run src/AppearanceScreen.test.jsx`
Expected: PASS. The screen now calls `useIconLibrary()` — if a test renders `AppearanceScreen` bare, the default context value keeps it working. If it asserted the old "coming soon" placeholder text, update that assertion to expect the Image Icons tab content (e.g. the "App icons" label).

- [ ] **Step 5: Lint + commit + push**

```bash
npx eslint src/main.jsx src/AppearanceScreen.jsx src/App.jsx
git add src/main.jsx src/AppearanceScreen.jsx src/App.jsx
git commit -m "feat(icons): mount IconLibraryProvider; wire ImageIconsTab + header avatar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 17: Route display icons through `<Icon>`

**Files:**
- Modify: `src/AccountList.jsx`, `src/AccountTypesScreen.jsx`, `src/CategoryBarList.jsx`, `src/CategoryBreakdown.jsx`, `src/CategoryEditor.jsx`, `src/ManageCategoriesScreen.jsx`, `src/Register.jsx`, `src/TransactionRow.jsx`
- Regression: each file's existing `*.test.jsx` must stay green (emoji fixtures render identical text via `<Icon>`).

- [ ] **Step 1: Apply each edit** (add `import Icon from './Icon.jsx';` to each file's imports)

`AccountList.jsx:55` — replace
`<span className="account-row-icon" aria-hidden="true">{a.icon}</span>`
with `<Icon value={a.icon} className="account-row-icon" />`

`AccountTypesScreen.jsx:40` — replace
`<span className="type-row-icon" aria-hidden="true">{t.icon}</span>`
with `<Icon value={t.icon} className="type-row-icon" />`

`CategoryBarList.jsx:17` — replace
`<span className="cat-icon" aria-hidden="true">{i.icon}</span>`
with `<Icon value={i.icon} className="cat-icon" />`

`CategoryBreakdown.jsx` — replace all three direct renders:
- `:81` `<span className="cat-icon">{category.icon}</span>` → `<Icon value={category.icon} className="cat-icon" />`
- `:96` `{category.icon} {category.name}` → `<Icon value={category.icon} /> {category.name}`
- `:120` `<span className="cat-icon">{category.icon}</span>` → `<Icon value={category.icon} className="cat-icon" />`
(Leave the `<IconPicker>` at `:105` unchanged.)

`CategoryEditor.jsx:103-105` — replace the preview body
`<span className="cat-editor-icon" style={{ background: `${category.color}22` }}>{category.icon}</span>`
with
`<span className="cat-editor-icon" style={{ background: `${category.color}22` }}><Icon value={category.icon} /></span>`
(Leave the `<IconPicker>` at `:129` unchanged.)

`ManageCategoriesScreen.jsx:119-124` — replace the `{cat.icon}` inside the `manage-list-icon` span with `<Icon value={cat.icon} />` (keep the surrounding styled span).

`Register.jsx:61` — replace
`<span className="register-icon" aria-hidden="true">{account.icon}</span>`
with `<Icon value={account.icon} className="register-icon" />`

`TransactionRow.jsx`:
- `:10` (CategoryCell) replace `<span className="txn-cat-icon" aria-hidden="true">{cat.icon}</span>` with `<Icon value={cat.icon} className="txn-cat-icon" />`
- `:29` (TransferChip) replace `<span aria-hidden="true">{category.icon}</span>` with `<Icon value={category.icon} />`
Add `import Icon from './Icon.jsx';` at top of TransactionRow.jsx.

- [ ] **Step 2: Run the affected component tests**

Run: `npx vitest run src/AccountList.test.jsx src/AccountTypesScreen.test.jsx src/CategoryBarList.test.jsx src/CategoryBreakdown.test.jsx src/CategoryEditor.test.jsx src/ManageCategoriesScreen.test.jsx src/Register.test.jsx src/TransactionRow.test.jsx`
Expected: PASS. (Emoji fixtures render the same text; `<Icon>` uses the default context, so no provider is needed.)

- [ ] **Step 3: Lint + commit + push**

```bash
npx eslint src/AccountList.jsx src/AccountTypesScreen.jsx src/CategoryBarList.jsx src/CategoryBreakdown.jsx src/CategoryEditor.jsx src/ManageCategoriesScreen.jsx src/Register.jsx src/TransactionRow.jsx
git add src/AccountList.jsx src/AccountTypesScreen.jsx src/CategoryBarList.jsx src/CategoryBreakdown.jsx src/CategoryEditor.jsx src/ManageCategoriesScreen.jsx src/Register.jsx src/TransactionRow.jsx
git commit -m "feat(icons): route display icons through <Icon>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 18: Route `<option>` icons through `iconGlyph`

**Files:**
- Modify: `src/Register.jsx`, `src/TransactionEditor.jsx`, `src/TransferEditor.jsx`, `src/SplitsEditor.jsx`, `src/CategoryEditor.jsx`
- Regression: existing tests stay green.

`<option>` cannot hold an `<img>`, so an `img:` token would print as raw text. Wrap with `iconGlyph`.

- [ ] **Step 1: Apply each edit** (add `import { iconGlyph } from './iconValue.js';` to each file)

- `Register.jsx:74` — `{c.icon} {c.name}` → `{iconGlyph(c.icon)} {c.name}`
- `TransactionEditor.jsx:102` — `{c.icon} {c.name}` → `{iconGlyph(c.icon)} {c.name}`
- `TransferEditor.jsx:110` — `{c.icon} {c.name}` → `{iconGlyph(c.icon)} {c.name}`
- `SplitsEditor.jsx:115` — `{c.icon} {c.name}` → `{iconGlyph(c.icon)} {c.name}`
- `CategoryEditor.jsx:208` — `{c.icon} {c.name}` → `{iconGlyph(c.icon)} {c.name}`

- [ ] **Step 2: Run the affected tests**

Run: `npx vitest run src/Register.test.jsx src/TransactionEditor.test.jsx src/TransferEditor.test.jsx src/SplitsEditor.test.jsx src/CategoryEditor.test.jsx`
Expected: PASS (emoji fixtures unchanged).

- [ ] **Step 3: Lint + commit + push**

```bash
npx eslint src/Register.jsx src/TransactionEditor.jsx src/TransferEditor.jsx src/SplitsEditor.jsx src/CategoryEditor.jsx
git add src/Register.jsx src/TransactionEditor.jsx src/TransferEditor.jsx src/SplitsEditor.jsx src/CategoryEditor.jsx
git commit -m "feat(icons): glyph fallback for icons in <option> dropdowns

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 19: Fold appearance into the global undo stack

**Files:**
- Modify: `src/App.jsx`

Wire appearance into `pushHistory`/`undo` with coalescing, and pass an undo-wrapped appearance to `AppearanceScreen`. (App-level Ctrl+Z behavior is verified manually in Task 21 — no full-App test harness exists; the logic is covered by Task 4 `coalesceHistory` + Task 5 `snapshot/restore`.)

- [ ] **Step 1: Import the reducer**

Add to `src/App.jsx` imports: `import { coalesceHistory } from './appearanceHistory.js';`

- [ ] **Step 2: Replace `pushHistory` and `undo`** (around lines 135-151)

```jsx
  const pushHistory = (opKey = null) => setHistory(prev => coalesceHistory(prev, () => ({
    ledger: ledger.snapshot(),
    acks: acks.exportSnapshot(),
    categories: cats.snapshot(),
    accountTypes: accountTypes.snapshot(),
    appearance: appearance.snapshot(),
  }), opKey));

  const undo = () => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const entry = prev[prev.length - 1];
      ledger.restore(entry.ledger);
      acks.restore(entry.acks);
      cats.restore(entry.categories);
      accountTypes.restore(entry.accountTypes);
      appearance.restore(entry.appearance);
      return prev.slice(0, -1);
    });
  };
```

Note: `appearance` is declared at line ~173, after `pushHistory`. Move the `const appearance = useAppearance();` line up to just before `const [history, setHistory] = useState([]);` so `pushHistory`/`undo` can reference it. (`useBackgroundPhotos(appearance.background)` stays where it is.)

- [ ] **Step 3: Build the undo-wrapped appearance and pass it to AppearanceScreen**

Just before the `return (` of the component, add:

```jsx
  const appearanceForUI = {
    ...appearance,
    setTheme: (id) => { pushHistory(); appearance.setTheme(id); },
    updateCustom: (partial, colorKey) => { pushHistory(colorKey ? `appearance:custom:${colorKey}` : null); appearance.updateCustom(partial); },
    resetCustomToPreset: (id) => { pushHistory(); appearance.resetCustomToPreset(id); },
    updateBackground: (partial, opKey) => { pushHistory(opKey || null); appearance.updateBackground(partial); },
    setAppIcon: (slot, value) => { pushHistory(); appearance.setAppIcon(slot, value); },
  };
```

Change the AppearanceScreen render to pass `appearance={appearanceForUI}` (keep the other props from Task 16).

- [ ] **Step 4: Verify nothing regressed in the suite touching App's children**

Run: `npx vitest run src/AppearanceScreen.test.jsx src/ThemeTab.test.jsx src/BackgroundTab.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint + commit + push**

```bash
npx eslint src/App.jsx
git add src/App.jsx
git commit -m "feat(appearance): fold appearance changes into global undo (coalesced)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 20: Pass undo opKeys from the continuous controls

**Files:**
- Modify: `src/ThemeTab.jsx`, `src/BackgroundTab.jsx`
- Regression: `src/ThemeTab.test.jsx`, `src/BackgroundTab.test.jsx`

The wrapped setters from Task 19 accept an opKey; pass stable keys from sliders/color inputs so a drag coalesces into one undo step.

- [ ] **Step 1: ThemeTab — pass the color channel key**

`src/ThemeTab.jsx:53` — change
`onChange={(e) => updateCustom({ [c.key]: e.target.value })}`
to
`onChange={(e) => updateCustom({ [c.key]: e.target.value }, c.key)}`

- [ ] **Step 2: BackgroundTab — pass opKeys for the continuous controls**

In `src/BackgroundTab.jsx`:
- Intensity (`bg-intensity`): `onChange={(e) => updateBackground({ intensity: Number(e.target.value) }, 'appearance:bg:intensity')}`
- Effect strength (`bg-effect-strength`): `onChange={(e) => updateBackground({ effectStrength: Number(e.target.value) }, 'appearance:bg:effectStrength')}`
- Interval (`bg-interval`): `onChange={(e) => updateBackground({ intervalSec: Number(e.target.value) }, 'appearance:bg:intervalSec')}`
- Framing setter: change `setFraming` to tag with the per-image key:
```jsx
  const setFraming = (id, patch) => {
    const next = clampFraming({ ...framing[id], ...patch });
    updateBackground({ framing: { ...framing, [id]: next } }, `appearance:bg:framing:${id}`);
  };
```
(Discrete controls — base buttons, mode toggle, effect toggles, photo select, group source, presetId — keep calling `updateBackground({...})` with no second arg, so each is its own undo step.)

- [ ] **Step 3: Run the regression tests**

Run: `npx vitest run src/ThemeTab.test.jsx src/BackgroundTab.test.jsx`
Expected: PASS (the mock `updateBackground`/`updateCustom` simply receive an extra arg).

- [ ] **Step 4: Lint + commit + push**

```bash
npx eslint src/ThemeTab.jsx src/BackgroundTab.jsx
git add src/ThemeTab.jsx src/BackgroundTab.jsx
git commit -m "feat(appearance): coalesce slider/color undo steps via opKeys

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 21: Full verification + manual checkpoint + finish

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all green (≈745 prior + new tests). Fix any regressions before proceeding.

- [ ] **Step 2: Lint the whole changed set**

Run: `npx eslint src/iconValue.js src/iconCrop.js src/iconUsage.js src/appearanceHistory.js src/iconUrlCache.js src/IconLibraryProvider.jsx src/Icon.jsx src/ActionMenu.jsx src/FramingEditor.jsx src/ImageCropModal.jsx src/curatedIcons.js src/IconPicker.jsx src/ImageIconsTab.jsx src/AppearanceScreen.jsx src/App.jsx src/main.jsx`
Expected: 0 errors. (Pre-existing errors in `CategoryEditor.jsx`/`ColorPicker.jsx`/`spendingMath.js` are out of scope; `IconPicker.jsx`'s old `react-refresh` error is now cleared by `curatedIcons.js`.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success (the >500 kB chunk warning is pre-existing).

- [ ] **Step 4: MANUAL-VERIFY (`npm run dev`) — the user drives**

Checklist (canvas/visual/integration that jsdom can't cover):
- Upload an image as a category icon via the IconPicker → crop modal pans/zooms WYSIWYG → Done → the category row shows a crisp circular thumb; the same in Register rows, account list, nav, header avatar.
- Long Register list scrolls with **no icon flicker**.
- Image Icons tab: rename, move to group, Adjust crop (re-bakes), Delete shows "Used by N"; a deleted-but-in-use icon falls back to 🖼️ (no crash).
- `<option>` category dropdowns show the glyph fallback for image icons (never `img:...` text).
- Ctrl+Z: change a theme color → reverts; drag the intensity slider across many values → **one** Ctrl+Z reverts the whole drag; ledger undo still works after appearance tweaks. The ⎌ button in the Appearance header does the same.
- `prefers-reduced-motion`: effects/slideshow still static.

- [ ] **Step 5: Update the handoff/memory and finish the branch**

- Invoke `superpowers:finishing-a-development-branch` to choose how to integrate (the PR for `appearance-phase-3` stacks on `appearance-phase-2b`; if #11 merged meanwhile, rebase onto `master`).
- Stop the visual companion server if still running.

---

## Self-Review (completed by planner)

- **Spec coverage:** §3.1 `<Icon>` → Tasks 7-9; §3.2 routing → Tasks 17-18; §3.3 IconPicker crop → Tasks 6,12-14; §3.4 library → Task 15; appearance-undo → Tasks 4,5,19,20; data model `iconCrop` → Tasks 2,6,14,15; header avatar/appIcons → Tasks 5,15,16; ActionMenu/FramingEditor reuse → Tasks 11,12. All covered.
- **Placeholders:** none — every code step is complete.
- **Type/name consistency:** `parseIconValue`/`iconGlyph`, `cropRect`, `countIconUsage`, `coalesceHistory`, `diffIconUrls`, `recropThumb`, `useIconLibrary`/`urlForId`, `IconLibraryContext`, `FramingEditor({blob,framing,onChange,aspect})`, `ImageCropModal({blob,initialFraming,onDone,onCancel})`, `ActionMenu({label,items})`, `setAppIcon`/`snapshot`/`restore` are used identically across tasks.
