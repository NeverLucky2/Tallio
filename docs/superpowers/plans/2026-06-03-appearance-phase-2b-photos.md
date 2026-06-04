# Appearance Phase 2b — Your Photos, Wallpapers & Frosting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (the user has chosen **inline TDD by Claude with a checkpoint after each task — no subagents**). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user set their own uploaded photos (single image or crossfading slideshow) or a bundled wallpaper as the app background, with ambient effects sampling the photo's colors and card surfaces frosting to stay readable — plus bundle images + appearance into the export archive.

**Architecture:** Large image blobs live in IndexedDB (`tallio-images`) via a new `imageStore.js`; all canvas work (re-encode, square thumb, palette) is isolated in `imageProcess.js` (manually verified, canvas-free logic unit-tested). Pure helpers (`imageColors.extractPalette`, `backgroundPhotos.resolvePhotoIds`, `wallpapers`) are unit-tested. `BackgroundLayer` becomes a presentational renderer driven by props; a new `useBackgroundPhotos` hook does the async blob→object-URL loading + slideshow timer. The Background tab gains base/wallpaper/photo controls fed by a `useImageLibrary` hook. Card readability is driven by `--surface-alpha`/`--surface-blur` CSS variables that `BackgroundLayer` writes only when an image base is active (no-op at defaults).

**Tech Stack:** React 19, Vite, Vitest + @testing-library/react (jsdom), `fflate` (zip), `nanoid` (ids), new dev dep `fake-indexeddb`.

---

## Conventions (read before starting)

- **Tests:** Vitest + RTL, jsdom. Component tests **must** `import { cleanup } from '@testing-library/react'` and `afterEach(() => cleanup())`. Hook tests use `renderHook`/`act`. **No jest-dom** — use `.toBeTruthy()`, `.toBeNull()`, `container.querySelector(...)`, `el.getAttribute(...)`, `el.style.getPropertyValue(...)`. Do **not** use `toBeInTheDocument()`/`toHaveAttribute()`.
- Run one file: `npx vitest run src/foo.test.js`. Full suite: `npx vitest run`.
- Lint: `npx eslint <files>` — keep 0 errors.
- Commit per task with trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- jsdom has **no canvas rendering and no IndexedDB**. `fake-indexeddb/auto` supplies IndexedDB for store/hook tests. Canvas-dependent code (`processImageFile`, real photo painting, real `backdrop-filter`/`color-mix`) is **verified manually via `npm run dev`**, not unit-tested — those steps say so explicitly.
- Branch: stay on `rename-to-tallio` (extends PR #10).

## File structure

| File | New? | Responsibility |
|------|------|----------------|
| `src/imageColors.js` | new | Pure `extractPalette(pixels, count)` + `rgbToHex`. |
| `src/imageStore.js` | new | IndexedDB CRUD (`putRecord/getImage/listImages/updateImageMeta/deleteImage`) + `putImage(file, meta)`. |
| `src/imageProcess.js` | new | Pure `fitWithin`; canvas `processImageFile` (manual). |
| `src/backgroundPhotos.js` | new | Pure `resolvePhotoIds(background, metas)`. |
| `src/wallpapers.js` | new | Bundled gradient wallpapers + `getWallpaper(id)`. |
| `src/useBackgroundPhotos.js` | new | Async load blobs→object-URLs + slideshow timer; returns `{ photos, activeIndex }`. |
| `src/useImageLibrary.js` | new | Library list/reload/add/remove/updateMeta for the Background tab (reused in Phase 3). |
| `src/BackgroundLayer.jsx` | modify | Presentational: render solid/preset/photos base, palette-colored effects, scrim; write surface vars. |
| `src/BackgroundTab.jsx` | modify | Base selector, wallpaper picker, photo upload/gallery/slideshow controls. |
| `src/AppearanceScreen.jsx` | modify | Own `useImageLibrary`; pass images + upload to `BackgroundTab`. |
| `src/App.jsx` | modify | Mount `useBackgroundPhotos`; pass photos to `BackgroundLayer`; async export with images+appearance. |
| `src/App.css` | modify | `.bg-photo`/`.bg-wallpaper` styles; `--fx-*` effect fallbacks; `--surface` token + frosting on surfaces. |
| `src/exportArchive.js` | modify | Bundle image bytes + `appearance.json`; add `parseArchive(bytes)`. |

---

## Task 1: Add `fake-indexeddb` dev dependency

**Files:**
- Modify: `package.json` (devDependencies)

- [ ] **Step 1: Install the dev dependency**

Run: `npm install --save-dev fake-indexeddb`
Expected: `package.json` gains `"fake-indexeddb"` under `devDependencies`; no errors.

- [ ] **Step 2: Confirm it resolves**

Run: `node -e "import('fake-indexeddb/auto').then(()=>console.log('ok'))"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```
git add package.json package-lock.json
git commit -m "chore(appearance): add fake-indexeddb for IndexedDB tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `imageColors.js` — pure palette extraction

**Files:**
- Create: `src/imageColors.js`
- Test: `src/imageColors.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/imageColors.test.js
import { describe, it, expect } from 'vitest';
import { extractPalette, rgbToHex } from './imageColors.js';

// helper: build an RGBA Uint8ClampedArray from a list of [r,g,b,a] pixels
const px = (...pixels) => new Uint8ClampedArray(pixels.flat());

describe('rgbToHex', () => {
  it('formats and clamps channels to 2-digit hex', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    expect(rgbToHex(300, -5, 16)).toBe('#ff0010');
  });
});

describe('extractPalette', () => {
  it('returns the single dominant color for a solid image', () => {
    const pixels = px([255, 0, 0, 255], [255, 0, 0, 255], [255, 0, 0, 255], [255, 0, 0, 255]);
    expect(extractPalette(pixels)).toEqual(['#ff0000']);
  });

  it('orders colors by frequency (most common first)', () => {
    const pixels = px(
      [255, 0, 0, 255], [255, 0, 0, 255], [255, 0, 0, 255], // red x3
      [0, 0, 255, 255],                                     // blue x1
    );
    const out = extractPalette(pixels);
    expect(out[0]).toBe('#ff0000');
    expect(out[1]).toBe('#0000ff');
  });

  it('ignores near-transparent pixels', () => {
    const pixels = px([255, 0, 0, 255], [0, 0, 255, 10]);
    expect(extractPalette(pixels)).toEqual(['#ff0000']);
  });

  it('caps the result at the requested count', () => {
    const pixels = px(
      [10, 10, 10, 255], [80, 80, 80, 255], [140, 140, 140, 255],
      [200, 200, 200, 255], [250, 250, 250, 255], [40, 200, 40, 255],
    );
    expect(extractPalette(pixels, 3)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/imageColors.test.js`
Expected: FAIL — `extractPalette`/`rgbToHex` not exported.

- [ ] **Step 3: Write the implementation**

```js
// src/imageColors.js
// Pure color helpers for ambient effects. extractPalette buckets the pixels of a
// (typically tiny, ~32x32) RGBA array into a coarse color grid, then returns the
// averaged hex of the most frequent buckets. Deterministic for a given pixel
// order, so it is fully unit-testable without a canvas.

export function rgbToHex(r, g, b) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

const STEP = 32; // quantization bucket width per channel

export function extractPalette(pixels, count = 5) {
  const buckets = new Map(); // key -> { r, g, b, n } (running sums + count)
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue; // skip near-transparent
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const key = `${Math.floor(r / STEP)},${Math.floor(g / STEP)},${Math.floor(b / STEP)}`;
    const cur = buckets.get(key);
    if (cur) { cur.r += r; cur.g += g; cur.b += b; cur.n += 1; }
    else buckets.set(key, { r, g, b, n: 1 });
  }
  // Stable sort (V8) keeps insertion order for ties -> deterministic.
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map(c => rgbToHex(c.r / c.n, c.g / c.n, c.b / c.n));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/imageColors.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint**

Run: `npx eslint src/imageColors.js src/imageColors.test.js`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```
git add src/imageColors.js src/imageColors.test.js
git commit -m "feat(appearance): pure extractPalette for photo-colored effects

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `imageStore.js` — IndexedDB CRUD

**Files:**
- Create: `src/imageStore.js`
- Test: `src/imageStore.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/imageStore.test.js
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { putRecord, getImage, listImages, updateImageMeta, deleteImage } from './imageStore.js';

const reset = () => new Promise((resolve) => {
  const req = indexedDB.deleteDatabase('tallio-images');
  req.onsuccess = req.onerror = req.onblocked = () => resolve();
});

const rec = (id, over = {}) => ({
  id, blob: new Blob(['x'], { type: 'image/jpeg' }), type: 'image/jpeg',
  w: 10, h: 10, name: id, group: 'Family', thumb: new Blob(['t']),
  palette: ['#111111'], createdAt: 1, ...over,
});

describe('imageStore', () => {
  beforeEach(reset);

  it('puts and gets a record by id', async () => {
    await putRecord(rec('a'));
    const got = await getImage('a');
    expect(got.id).toBe('a');
    expect(got.name).toBe('a');
    expect(got.palette).toEqual(['#111111']);
  });

  it('getImage returns undefined for a missing id', async () => {
    expect(await getImage('nope')).toBeUndefined();
  });

  it('listImages returns all records sorted by createdAt', async () => {
    await putRecord(rec('a', { createdAt: 30 }));
    await putRecord(rec('b', { createdAt: 10 }));
    await putRecord(rec('c', { createdAt: 20 }));
    expect((await listImages()).map(r => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('updateImageMeta merges fields and keeps the blob', async () => {
    await putRecord(rec('a'));
    const updated = await updateImageMeta('a', { name: 'Beach', group: 'Scenery' });
    expect(updated.name).toBe('Beach');
    expect(updated.group).toBe('Scenery');
    expect((await getImage('a')).name).toBe('Beach');
  });

  it('updateImageMeta returns null for a missing id', async () => {
    expect(await updateImageMeta('nope', { name: 'x' })).toBeNull();
  });

  it('deleteImage removes the record', async () => {
    await putRecord(rec('a'));
    await deleteImage('a');
    expect(await getImage('a')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/imageStore.test.js`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Write the implementation**

```js
// src/imageStore.js
// IndexedDB wrapper for large image blobs. Kept source-agnostic (file upload now,
// phone upload later). All canvas processing lives in imageProcess.js; this file
// is pure DB plumbing so it is testable with fake-indexeddb.

const DB_NAME = 'tallio-images';
const STORE = 'images';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function asPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await fn(db.transaction(STORE, mode).objectStore(STORE));
  } finally {
    db.close();
  }
}

export function putRecord(record) {
  return withStore('readwrite', (s) => asPromise(s.put(record)).then(() => record));
}

export function getImage(id) {
  return withStore('readonly', (s) => asPromise(s.get(id)));
}

export function listImages() {
  return withStore('readonly', (s) => asPromise(s.getAll()))
    .then((all) => all.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
}

export async function updateImageMeta(id, patch) {
  const existing = await getImage(id);
  if (!existing) return null;
  return putRecord({ ...existing, ...patch });
}

export function deleteImage(id) {
  return withStore('readwrite', (s) => asPromise(s.delete(id)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/imageStore.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint**

Run: `npx eslint src/imageStore.js src/imageStore.test.js`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```
git add src/imageStore.js src/imageStore.test.js
git commit -m "feat(appearance): IndexedDB imageStore CRUD

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `imageProcess.js` — `fitWithin` (tested) + `processImageFile` (manual)

**Files:**
- Create: `src/imageProcess.js`
- Test: `src/imageProcess.test.js`

- [ ] **Step 1: Write the failing test (pure helper only)**

```js
// src/imageProcess.test.js
import { describe, it, expect } from 'vitest';
import { fitWithin } from './imageProcess.js';

describe('fitWithin', () => {
  it('leaves dimensions under the cap unchanged', () => {
    expect(fitWithin(800, 600, 2560)).toEqual({ w: 800, h: 600 });
  });

  it('scales a wide image by its width', () => {
    expect(fitWithin(5120, 2560, 2560)).toEqual({ w: 2560, h: 1280 });
  });

  it('scales a tall image by its height', () => {
    expect(fitWithin(2560, 5120, 2560)).toEqual({ w: 1280, h: 2560 });
  });

  it('handles a square image at the cap', () => {
    expect(fitWithin(4000, 4000, 2000)).toEqual({ w: 2000, h: 2000 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/imageProcess.test.js`
Expected: FAIL — `fitWithin` not exported.

- [ ] **Step 3: Write the implementation (pure helper + canvas glue)**

```js
// src/imageProcess.js
// Turns an uploaded File into a stored image record's media fields. The canvas
// work (re-encode, square thumbnail, palette sampling) cannot run in jsdom, so
// processImageFile is verified manually via `npm run dev`; only the pure
// dimension math (fitWithin) is unit-tested.
import { extractPalette } from './imageColors.js';

export function fitWithin(w, h, max) {
  if (w <= max && h <= max) return { w, h };
  const scale = w >= h ? max / w : max / h;
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// MANUAL-VERIFY (canvas): returns { blob, type, w, h, thumb, palette }.
export async function processImageFile(file, { maxEdge = 2560, thumbSize = 128 } = {}) {
  const bitmap = await createImageBitmap(file);
  const { w, h } = fitWithin(bitmap.width, bitmap.height, maxEdge);

  const main = document.createElement('canvas');
  main.width = w; main.height = h;
  main.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  const blob = await toBlob(main, 'image/jpeg', 0.85);

  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const tc = document.createElement('canvas');
  tc.width = thumbSize; tc.height = thumbSize;
  tc.getContext('2d').drawImage(bitmap, sx, sy, side, side, 0, 0, thumbSize, thumbSize);
  const thumb = await toBlob(tc, 'image/jpeg', 0.8);

  const pc = document.createElement('canvas');
  pc.width = 32; pc.height = 32;
  const pctx = pc.getContext('2d');
  pctx.drawImage(bitmap, 0, 0, 32, 32);
  const palette = extractPalette(pctx.getImageData(0, 0, 32, 32).data, 5);

  if (bitmap.close) bitmap.close();
  return { blob, type: 'image/jpeg', w, h, thumb, palette };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/imageProcess.test.js`
Expected: PASS (4 tests). `processImageFile` is intentionally untested (canvas) — it is exercised manually in Task 16.

- [ ] **Step 5: Lint**

Run: `npx eslint src/imageProcess.js src/imageProcess.test.js`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```
git add src/imageProcess.js src/imageProcess.test.js
git commit -m "feat(appearance): image processing (fitWithin + canvas re-encode/thumb/palette)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `imageStore.putImage(file, meta)` with injectable processor

**Files:**
- Modify: `src/imageStore.js`
- Test: `src/imageStore.test.js` (add a describe block)

- [ ] **Step 1: Write the failing test**

Append to `src/imageStore.test.js`:

```js
import { putImage } from './imageStore.js';

describe('imageStore.putImage', () => {
  beforeEach(reset);

  it('stores a record built from the processor output + metadata', async () => {
    const fakeProcess = async () => ({
      blob: new Blob(['img'], { type: 'image/jpeg' }), type: 'image/jpeg',
      w: 100, h: 80, thumb: new Blob(['t']), palette: ['#abcdef'],
    });
    const file = new File(['raw'], 'beach.jpg', { type: 'image/jpeg' });

    const saved = await putImage(file, { group: 'Scenery' }, { process: fakeProcess });

    expect(saved.id).toBeTruthy();
    expect(typeof saved.createdAt).toBe('number');
    expect(saved.name).toBe('beach.jpg'); // falls back to the file name
    expect(saved.group).toBe('Scenery');
    expect(saved.palette).toEqual(['#abcdef']);

    const got = await getImage(saved.id);
    expect(got.w).toBe(100);
    expect(got.type).toBe('image/jpeg');
  });

  it('prefers an explicit name over the file name', async () => {
    const fakeProcess = async () => ({ blob: new Blob(['i']), type: 'image/jpeg', w: 1, h: 1, thumb: new Blob(['t']), palette: [] });
    const file = new File(['raw'], 'IMG_0001.jpg', { type: 'image/jpeg' });
    const saved = await putImage(file, { name: 'Sunset' }, { process: fakeProcess });
    expect(saved.name).toBe('Sunset');
    expect(saved.group).toBe('Uncategorized'); // default group
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/imageStore.test.js`
Expected: FAIL — `putImage` not exported.

- [ ] **Step 3: Write the implementation**

Add to the top imports of `src/imageStore.js`:

```js
import { nanoid } from 'nanoid';
import { processImageFile } from './imageProcess.js';
```

Add at the end of `src/imageStore.js`:

```js
// Combines canvas processing + a DB put. The processor is injectable so tests
// can avoid canvas; production uses processImageFile.
export async function putImage(file, meta = {}, { process = processImageFile } = {}) {
  const processed = await process(file);
  const record = {
    id: nanoid(),
    createdAt: Date.now(),
    name: meta.name || (file && file.name) || 'Untitled',
    group: meta.group || 'Uncategorized',
    ...processed,
  };
  return putRecord(record);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/imageStore.test.js`
Expected: PASS (8 tests total).

- [ ] **Step 5: Lint**

Run: `npx eslint src/imageStore.js src/imageStore.test.js`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```
git add src/imageStore.js src/imageStore.test.js
git commit -m "feat(appearance): putImage combines processing + store with injectable processor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `backgroundPhotos.js` — `resolvePhotoIds` (pure)

**Files:**
- Create: `src/backgroundPhotos.js`
- Test: `src/backgroundPhotos.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/backgroundPhotos.test.js
import { describe, it, expect } from 'vitest';
import { resolvePhotoIds } from './backgroundPhotos.js';

const metas = [
  { id: 'a', group: 'Family',  createdAt: 30 },
  { id: 'b', group: 'Scenery', createdAt: 10 },
  { id: 'c', group: 'Family',  createdAt: 20 },
];

describe('resolvePhotoIds', () => {
  it('returns the explicit photoIds, filtered to existing images, in order', () => {
    const bg = { photoIds: ['c', 'gone', 'a'], photoGroup: null };
    expect(resolvePhotoIds(bg, metas)).toEqual(['c', 'a']);
  });

  it('when photoGroup is set, returns that group sorted by createdAt (overrides photoIds)', () => {
    const bg = { photoIds: ['a'], photoGroup: 'Family' };
    expect(resolvePhotoIds(bg, metas)).toEqual(['c', 'a']); // 20 before 30
  });

  it('returns [] for an empty group', () => {
    expect(resolvePhotoIds({ photoGroup: 'Pets' }, metas)).toEqual([]);
  });

  it('is safe with missing fields', () => {
    expect(resolvePhotoIds(null, null)).toEqual([]);
    expect(resolvePhotoIds({}, metas)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/backgroundPhotos.test.js`
Expected: FAIL — not exported.

- [ ] **Step 3: Write the implementation**

```js
// src/backgroundPhotos.js
// Resolve the ordered image ids a photo background should display. A set
// photoGroup overrides the explicit photoIds: it selects every library image in
// that group, ordered by createdAt. Otherwise the explicit, ordered photoIds are
// used, filtered to ids that still exist in the library. Pure + unit-testable.
export function resolvePhotoIds(background, metas) {
  const list = Array.isArray(metas) ? metas : [];
  const bg = background || {};
  if (bg.photoGroup) {
    return list
      .filter(m => m.group === bg.photoGroup)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .map(m => m.id);
  }
  const byId = new Set(list.map(m => m.id));
  return (bg.photoIds || []).filter(id => byId.has(id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/backgroundPhotos.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint + commit**

Run: `npx eslint src/backgroundPhotos.js src/backgroundPhotos.test.js`
Expected: 0 errors.

```
git add src/backgroundPhotos.js src/backgroundPhotos.test.js
git commit -m "feat(appearance): resolvePhotoIds (group overrides ordered ids)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `wallpapers.js` — bundled gradient wallpapers

**Files:**
- Create: `src/wallpapers.js`
- Test: `src/wallpapers.test.js`

> Wallpapers are CSS-gradient presets (no binary assets to author/maintain), each carrying a `palette` to color the ambient effects. The data shape is extensible to image-file wallpapers later.

- [ ] **Step 1: Write the failing test**

```js
// src/wallpapers.test.js
import { describe, it, expect } from 'vitest';
import { WALLPAPERS, getWallpaper } from './wallpapers.js';

describe('wallpapers', () => {
  it('exposes a non-empty curated set', () => {
    expect(WALLPAPERS.length).toBeGreaterThanOrEqual(3);
  });

  it('each wallpaper has id, name, css, and a palette', () => {
    for (const w of WALLPAPERS) {
      expect(typeof w.id).toBe('string');
      expect(typeof w.name).toBe('string');
      expect(w.css).toContain('gradient');
      expect(Array.isArray(w.palette)).toBe(true);
      expect(w.palette.length).toBeGreaterThan(0);
    }
  });

  it('getWallpaper finds by id and returns null for unknown', () => {
    expect(getWallpaper(WALLPAPERS[0].id).id).toBe(WALLPAPERS[0].id);
    expect(getWallpaper('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/wallpapers.test.js`
Expected: FAIL — not exported.

- [ ] **Step 3: Write the implementation**

```js
// src/wallpapers.js
// Bundled "preset wallpaper" backgrounds. Each is a pure CSS background value
// (no binary assets) plus a palette used to color ambient effects over it.
export const WALLPAPERS = [
  { id: 'dusk',   name: 'Dusk',   css: 'linear-gradient(160deg, #1a1033 0%, #3b1d5e 45%, #b65d8f 100%)', palette: ['#3b1d5e', '#b65d8f', '#1a1033'] },
  { id: 'tide',   name: 'Tide',   css: 'linear-gradient(160deg, #04263b 0%, #0a6e7a 55%, #46c0a8 100%)', palette: ['#0a6e7a', '#46c0a8', '#04263b'] },
  { id: 'ember',  name: 'Ember',  css: 'linear-gradient(160deg, #2a0f0f 0%, #7a2e1e 50%, #e0a45a 100%)', palette: ['#7a2e1e', '#e0a45a', '#2a0f0f'] },
  { id: 'forest', name: 'Forest', css: 'linear-gradient(160deg, #0c1f14 0%, #1f4d33 55%, #6fae7a 100%)', palette: ['#1f4d33', '#6fae7a', '#0c1f14'] },
];

export function getWallpaper(id) {
  return WALLPAPERS.find(w => w.id === id) || null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/wallpapers.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint + commit**

Run: `npx eslint src/wallpapers.js src/wallpapers.test.js`
Expected: 0 errors.

```
git add src/wallpapers.js src/wallpapers.test.js
git commit -m "feat(appearance): bundled gradient wallpapers with effect palettes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `BackgroundLayer` renders a preset wallpaper base

**Files:**
- Modify: `src/BackgroundLayer.jsx`
- Modify: `src/BackgroundLayer.test.jsx`
- Modify: `src/App.css` (add `.bg-wallpaper`)

> `BackgroundLayer` becomes presentational: new props `photos = []` and `activeIndex = 0` (used in Task 9). This task adds the `preset` base. Existing tests must keep passing (the `bg()` helper defaults `base: 'solid'`).

- [ ] **Step 1: Write the failing test**

Add to `src/BackgroundLayer.test.jsx`:

```js
import { getWallpaper } from './wallpapers.js';

describe('BackgroundLayer preset base', () => {
  afterEach(() => cleanup());

  it('renders a wallpaper layer with the preset gradient and a scrim', () => {
    const { container } = render(
      <BackgroundLayer background={bg({ base: 'preset', presetId: 'dusk' })} reducedMotion={false} />,
    );
    const wp = container.querySelector('.bg-wallpaper');
    expect(wp).not.toBeNull();
    expect(wp.style.background).toContain('gradient');
    expect(container.querySelector('.bg-scrim')).not.toBeNull(); // non-solid base is active
  });

  it('renders nothing extra for an unknown preset id', () => {
    const { container } = render(
      <BackgroundLayer background={bg({ base: 'preset', presetId: 'nope' })} reducedMotion={false} />,
    );
    expect(container.querySelector('.bg-wallpaper')).toBeNull();
    // sanity: getWallpaper agrees
    expect(getWallpaper('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/BackgroundLayer.test.jsx`
Expected: FAIL — no `.bg-wallpaper` rendered.

- [ ] **Step 3: Update `BackgroundLayer.jsx`**

Replace the whole file with:

```jsx
import React from 'react';
import { intensityToLayers } from './backgroundMath.js';
import { getWallpaper } from './wallpapers.js';

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function BackgroundLayer({ background, photos = [], activeIndex = 0, reducedMotion }) {
  const { base = 'solid', presetId = null, effects = {}, intensity = 25 } = background || {};
  const rm = reducedMotion ?? prefersReducedMotion();
  const active = base !== 'solid' || effects.aurora || effects.pulse;
  const scrimAlpha = active ? intensityToLayers(intensity).scrimAlpha : 0;

  const wallpaper = base === 'preset' ? getWallpaper(presetId) : null;

  return (
    <div className={`bg-layer${rm ? ' bg-reduced-motion' : ''}`} aria-hidden="true">
      {wallpaper && <div className="bg-wallpaper" style={{ background: wallpaper.css }} />}

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

- [ ] **Step 4: Add `.bg-wallpaper` CSS**

In `src/App.css`, immediately after the `.bg-layer { ... }` rule (the `/* ---- Ambient background effects ---- */` block), add:

```css
.bg-wallpaper { position: absolute; inset: 0; background-size: cover !important; background-position: center !important; }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/BackgroundLayer.test.jsx`
Expected: PASS (existing 4 + new 2).

- [ ] **Step 6: Lint + commit**

Run: `npx eslint src/BackgroundLayer.jsx src/BackgroundLayer.test.jsx`
Expected: 0 errors.

```
git add src/BackgroundLayer.jsx src/BackgroundLayer.test.jsx src/App.css
git commit -m "feat(appearance): BackgroundLayer renders preset wallpaper base

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: `BackgroundLayer` renders a photos base with crossfade markup

**Files:**
- Modify: `src/BackgroundLayer.jsx`
- Modify: `src/BackgroundLayer.test.jsx`
- Modify: `src/App.css` (add `.bg-photo`)

- [ ] **Step 1: Write the failing test**

Add to `src/BackgroundLayer.test.jsx`:

```js
describe('BackgroundLayer photos base', () => {
  afterEach(() => cleanup());

  const photos = [
    { id: 'a', url: 'blob:a', palette: ['#111111'] },
    { id: 'b', url: 'blob:b', palette: ['#222222'] },
  ];

  it('stacks one layer per photo and marks the active one', () => {
    const { container } = render(
      <BackgroundLayer background={bg({ base: 'photos' })} photos={photos} activeIndex={1} reducedMotion={false} />,
    );
    const layers = container.querySelectorAll('.bg-photo');
    expect(layers.length).toBe(2);
    expect(layers[0].className).not.toContain('on');
    expect(layers[1].className).toContain('on');
    expect(layers[1].style.backgroundImage).toContain('blob:b');
  });

  it('renders no photo layers when the list is empty', () => {
    const { container } = render(
      <BackgroundLayer background={bg({ base: 'photos' })} photos={[]} reducedMotion={false} />,
    );
    expect(container.querySelector('.bg-photo')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/BackgroundLayer.test.jsx`
Expected: FAIL — no `.bg-photo`.

- [ ] **Step 3: Update `BackgroundLayer.jsx`**

Add, right after the `{wallpaper && ...}` line in the returned JSX:

```jsx
      {base === 'photos' && photos.map((p, i) => (
        <div
          key={p.id || i}
          className={`bg-photo${i === activeIndex ? ' on' : ''}`}
          style={{ backgroundImage: `url(${p.url})` }}
        />
      ))}
```

- [ ] **Step 4: Add `.bg-photo` CSS**

In `src/App.css`, after the `.bg-wallpaper` rule added in Task 8, add:

```css
.bg-photo { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: 0; transition: opacity 1.2s ease; }
.bg-photo.on { opacity: 1; }
.bg-reduced-motion .bg-photo { transition: none; }
```

Also extend the existing reduced-motion media query block (the `@media (prefers-reduced-motion: reduce)` near the bottom of the effects section) so photo crossfades are instant:

Find:
```css
@media (prefers-reduced-motion: reduce) {
  .bg-blob, .bg-glow { animation: none; }
}
```
Replace with:
```css
@media (prefers-reduced-motion: reduce) {
  .bg-blob, .bg-glow { animation: none; }
  .bg-photo { transition: none; }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/BackgroundLayer.test.jsx`
Expected: PASS (existing + 2 new).

- [ ] **Step 6: Lint + commit**

Run: `npx eslint src/BackgroundLayer.jsx src/BackgroundLayer.test.jsx`
Expected: 0 errors.

```
git add src/BackgroundLayer.jsx src/BackgroundLayer.test.jsx src/App.css
git commit -m "feat(appearance): BackgroundLayer photo layers with crossfade markup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Effects sample the active image's palette

**Files:**
- Modify: `src/BackgroundLayer.jsx`
- Modify: `src/BackgroundLayer.test.jsx`
- Modify: `src/App.css` (effect color fallbacks)

> When a photo or wallpaper is active, the ambient effect blobs should be colored from that image's palette via inline `--fx-1/2/3` custom properties, falling back to the theme colors otherwise.

- [ ] **Step 1: Write the failing test**

Add to `src/BackgroundLayer.test.jsx`:

```js
describe('BackgroundLayer effect palette', () => {
  afterEach(() => cleanup());

  it('colors aurora from the active photo palette via --fx vars', () => {
    const photos = [{ id: 'a', url: 'blob:a', palette: ['#ff0000', '#00ff00', '#0000ff'] }];
    const { container } = render(
      <BackgroundLayer
        background={bg({ base: 'photos', effects: { aurora: true, pulse: false } })}
        photos={photos} activeIndex={0} reducedMotion={false}
      />,
    );
    const aurora = container.querySelector('.bg-aurora');
    expect(aurora.style.getPropertyValue('--fx-1')).toBe('#ff0000');
    expect(aurora.style.getPropertyValue('--fx-2')).toBe('#00ff00');
    expect(aurora.style.getPropertyValue('--fx-3')).toBe('#0000ff');
  });

  it('colors effects from the wallpaper palette for a preset base', () => {
    const { container } = render(
      <BackgroundLayer
        background={bg({ base: 'preset', presetId: 'dusk', effects: { aurora: true, pulse: false } })}
        reducedMotion={false}
      />,
    );
    const aurora = container.querySelector('.bg-aurora');
    expect(aurora.style.getPropertyValue('--fx-1')).toBe('#3b1d5e'); // dusk palette[0]
  });

  it('sets no --fx vars over a solid base (theme fallback applies)', () => {
    const { container } = render(
      <BackgroundLayer background={bg({ effects: { aurora: true, pulse: false } })} reducedMotion={false} />,
    );
    expect(container.querySelector('.bg-aurora').style.getPropertyValue('--fx-1')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/BackgroundLayer.test.jsx`
Expected: FAIL — `--fx-1` empty.

- [ ] **Step 3: Update `BackgroundLayer.jsx`**

After the `const wallpaper = ...` line, add the active-palette resolution + fx style:

```jsx
  const activePalette = base === 'photos'
    ? (photos[activeIndex] && photos[activeIndex].palette)
    : base === 'preset'
      ? (wallpaper && wallpaper.palette)
      : null;
  const fxStyle = activePalette && activePalette.length
    ? {
        '--fx-1': activePalette[0],
        '--fx-2': activePalette[1] || activePalette[0],
        '--fx-3': activePalette[2] || activePalette[0],
      }
    : undefined;
```

Then add `style={fxStyle}` to **both** effect containers:

```jsx
      {effects.aurora && (
        <div className="bg-aurora" style={fxStyle}>
          <span className="bg-blob b1" /><span className="bg-blob b2" /><span className="bg-blob b3" />
        </div>
      )}
      {effects.pulse && (
        <div className="bg-pulse" style={fxStyle}>
          <span className="bg-glow g1" /><span className="bg-glow g2" />
        </div>
      )}
```

- [ ] **Step 4: Update effect CSS to use `--fx-*` with theme fallbacks**

In `src/App.css`, change the effect color declarations:

`.bg-aurora .b1` `background: var(--accent);` → `background: var(--fx-1, var(--accent));`
`.bg-aurora .b2` `background: var(--blue);` → `background: var(--fx-2, var(--blue));`
`.bg-aurora .b3` `background: var(--purple);` → `background: var(--fx-3, var(--purple));`
`.bg-pulse .g1` `radial-gradient(ellipse at center, var(--accent), transparent 60%)` → `radial-gradient(ellipse at center, var(--fx-1, var(--accent)), transparent 60%)`
`.bg-pulse .g2` `radial-gradient(ellipse at center, var(--blue), transparent 60%)` → `radial-gradient(ellipse at center, var(--fx-2, var(--blue)), transparent 60%)`

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/BackgroundLayer.test.jsx`
Expected: PASS (all).

- [ ] **Step 6: Lint + commit**

Run: `npx eslint src/BackgroundLayer.jsx src/BackgroundLayer.test.jsx`
Expected: 0 errors.

```
git add src/BackgroundLayer.jsx src/BackgroundLayer.test.jsx src/App.css
git commit -m "feat(appearance): ambient effects sample the active image palette

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Surface frosting — drive `--surface-alpha`/`--surface-blur` + frost card surfaces

**Files:**
- Modify: `src/BackgroundLayer.jsx`
- Modify: `src/BackgroundLayer.test.jsx`
- Modify: `src/App.css` (add `--surface` token; frost surface rules)

> **Readability guard:** surface frosting only engages when an actual image is behind the cards (`base === 'photos' || base === 'preset'`). Over a solid base (even with effects on) cards stay fully opaque. At defaults the vars are `1`/`0px` — a complete no-op for every existing screen.

- [ ] **Step 1: Write the failing test**

Add to `src/BackgroundLayer.test.jsx` (and ensure the existing top-of-file imports include `afterEach`):

```js
describe('BackgroundLayer surface variables', () => {
  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('style');
  });

  const read = (k) => document.documentElement.style.getPropertyValue(k);

  it('frosts surfaces from intensity when a photo base is active', () => {
    render(<BackgroundLayer background={bg({ base: 'photos', intensity: 100 })} photos={[{ id: 'a', url: 'blob:a' }]} reducedMotion={false} />);
    expect(read('--surface-alpha')).toBe('0');
    expect(read('--surface-blur')).toBe('10px');
  });

  it('keeps surfaces opaque over a solid base', () => {
    render(<BackgroundLayer background={bg({ base: 'solid', effects: { aurora: true, pulse: false }, intensity: 100 })} reducedMotion={false} />);
    expect(read('--surface-alpha')).toBe('1');
    expect(read('--surface-blur')).toBe('0px');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/BackgroundLayer.test.jsx`
Expected: FAIL — vars are empty (component does not set them yet).

- [ ] **Step 3: Update `BackgroundLayer.jsx`**

Add a `useEffect` (BackgroundLayer already imports React; add `useEffect` usage via `React.useEffect`). Insert before the `return (`:

```jsx
  const imageBase = base === 'photos' || base === 'preset';
  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const reset = () => {
      root.style.setProperty('--surface-alpha', '1');
      root.style.setProperty('--surface-blur', '0px');
    };
    if (imageBase) {
      const { surfaceAlpha, surfaceBlur } = intensityToLayers(intensity);
      root.style.setProperty('--surface-alpha', String(surfaceAlpha));
      root.style.setProperty('--surface-blur', `${surfaceBlur}px`);
    } else {
      reset();
    }
    return reset;
  }, [imageBase, intensity]);
```

- [ ] **Step 4: Run JS test to verify it passes**

Run: `npx vitest run src/BackgroundLayer.test.jsx`
Expected: PASS (all).

- [ ] **Step 5: Add the `--surface` token and frost surfaces (MANUAL-VERIFY CSS)**

In `src/App.css` `:root`, immediately after the existing `--surface-blur: 0px;` line, add:

```css
  --surface: color-mix(in srgb, var(--bg-card) calc(var(--surface-alpha) * 100%), transparent);
```

Then, for each of these **surface** rules, change `background: var(--bg-card);` → `background: var(--surface);` and add the two backdrop-filter lines directly under it. Apply to: `.stat-card`, `.empty-state`, `.bill-card`, `.panel`, `.formats-panel`, `.spending-panel`. Example for `.panel`:

```css
.panel {
  background: var(--surface);
  backdrop-filter: blur(var(--surface-blur));
  -webkit-backdrop-filter: blur(var(--surface-blur));
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 19px;
}
```

**Do NOT change** the hover/active rules that also use `var(--bg-card)` (e.g. `.btn:hover`, `.btn-action:hover`, `.manage-list-row:hover`, `.manage-list-row.active`, `.picker-cell:hover`, `.template-chip:hover`) — those must stay opaque.

- [ ] **Step 6: Manual verification (canvas/CSS — `color-mix`/`backdrop-filter` don't render in jsdom)**

Run: `npm run dev`. With the **default** appearance (solid base) open Register, Reports, and Manage — confirm cards look **identical** to before (alpha 1 / blur 0 = no-op). Then in Appearance → Background pick a wallpaper and raise Intensity — confirm cards frost while **numbers stay legible**.

- [ ] **Step 7: Lint + commit**

Run: `npx eslint src/BackgroundLayer.jsx src/BackgroundLayer.test.jsx`
Expected: 0 errors.

```
git add src/BackgroundLayer.jsx src/BackgroundLayer.test.jsx src/App.css
git commit -m "feat(appearance): surface frosting via --surface-alpha/--surface-blur (image bases only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: `useBackgroundPhotos` hook — async load + slideshow

**Files:**
- Create: `src/useBackgroundPhotos.js`
- Test: `src/useBackgroundPhotos.test.jsx`

> Loads the resolved photo blobs into object URLs (revoked on change/unmount) and advances `activeIndex` on a timer for slideshows. Store accessors are injectable so tests use a stub backed by fake-indexeddb; `URL.createObjectURL` is stubbed (jsdom lacks it).

- [ ] **Step 1: Write the failing test**

```jsx
// src/useBackgroundPhotos.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import useBackgroundPhotos from './useBackgroundPhotos.js';

let counter;
beforeEach(() => {
  counter = 0;
  vi.stubGlobal('URL', {
    createObjectURL: () => `blob:${++counter}`,
    revokeObjectURL: () => {},
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const makeStore = (records) => ({
  list: async () => records,
  get: async (id) => records.find(r => r.id === id),
});

describe('useBackgroundPhotos', () => {
  it('returns [] for a non-photo base', async () => {
    const store = makeStore([]);
    const { result } = renderHook(() => useBackgroundPhotos({ base: 'solid' }, store));
    expect(result.current.photos).toEqual([]);
  });

  it('loads object URLs + palettes for the resolved photo ids', async () => {
    const records = [
      { id: 'a', blob: new Blob(['a']), palette: ['#111111'], createdAt: 1 },
      { id: 'b', blob: new Blob(['b']), palette: ['#222222'], createdAt: 2 },
    ];
    const bg = { base: 'photos', photoIds: ['a', 'b'], photoGroup: null, mode: 'single' };
    const { result } = renderHook(() => useBackgroundPhotos(bg, makeStore(records)));
    await waitFor(() => expect(result.current.photos.length).toBe(2));
    expect(result.current.photos[0].url).toContain('blob:');
    expect(result.current.photos[0].palette).toEqual(['#111111']);
  });

  it('advances activeIndex on the slideshow interval', async () => {
    const records = [
      { id: 'a', blob: new Blob(['a']), palette: [], createdAt: 1 },
      { id: 'b', blob: new Blob(['b']), palette: [], createdAt: 2 },
    ];
    const bg = { base: 'photos', photoIds: ['a', 'b'], photoGroup: null, mode: 'slideshow', intervalSec: 5 };
    const { result } = renderHook(() => useBackgroundPhotos(bg, makeStore(records)));
    await waitFor(() => expect(result.current.photos.length).toBe(2));

    vi.useFakeTimers();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.activeIndex).toBe(1);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.activeIndex).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useBackgroundPhotos.test.jsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```js
// src/useBackgroundPhotos.js
import { useState, useEffect, useRef } from 'react';
import { listImages, getImage } from './imageStore.js';
import { resolvePhotoIds } from './backgroundPhotos.js';

function reducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// deps: { list, get } injectable for tests; defaults to the real imageStore.
export default function useBackgroundPhotos(background, deps = {}) {
  const list = deps.list || listImages;
  const get = deps.get || getImage;

  const [photos, setPhotos] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const urlsRef = useRef([]);

  const isPhotos = (background && background.base) === 'photos';
  // Re-run the loader whenever the selection identity changes.
  const selectionKey = isPhotos
    ? JSON.stringify([background.photoIds || [], background.photoGroup || null])
    : '';

  useEffect(() => {
    let cancelled = false;
    if (!isPhotos) { setPhotos([]); setActiveIndex(0); return undefined; }

    (async () => {
      const metas = await list();
      const ids = resolvePhotoIds(background, metas);
      const loaded = [];
      for (const id of ids) {
        const rec = await get(id);
        if (rec && rec.blob) {
          loaded.push({ id, url: URL.createObjectURL(rec.blob), palette: rec.palette || [] });
        }
      }
      if (cancelled) { loaded.forEach(p => URL.revokeObjectURL(p.url)); return; }
      urlsRef.current.forEach(u => URL.revokeObjectURL(u));
      urlsRef.current = loaded.map(p => p.url);
      setPhotos(loaded);
      setActiveIndex(0);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPhotos, selectionKey]);

  const slideshow = isPhotos
    && (background.mode === 'slideshow')
    && photos.length > 1
    && !reducedMotion();
  const intervalMs = Math.max(5, Number(background && background.intervalSec) || 30) * 1000;

  useEffect(() => {
    if (!slideshow) return undefined;
    const t = setInterval(() => setActiveIndex(i => (i + 1) % photos.length), intervalMs);
    return () => clearInterval(t);
  }, [slideshow, intervalMs, photos.length]);

  // Revoke any outstanding URLs on unmount.
  useEffect(() => () => { urlsRef.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  return { photos, activeIndex };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useBackgroundPhotos.test.jsx`
Expected: PASS (3 tests).

> If the slideshow test is flaky because the async load hasn't flushed before `useFakeTimers`, invoke **superpowers:systematic-debugging**. The intended fix: keep the `await waitFor(...)` (real timers) for loading, then switch to fake timers only for the advance assertions, exactly as written above.

- [ ] **Step 5: Lint + commit**

Run: `npx eslint src/useBackgroundPhotos.js src/useBackgroundPhotos.test.jsx`
Expected: 0 errors.

```
git add src/useBackgroundPhotos.js src/useBackgroundPhotos.test.jsx
git commit -m "feat(appearance): useBackgroundPhotos loads blobs + drives slideshow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: `useImageLibrary` hook — list/add/remove/rename for the tab

**Files:**
- Create: `src/useImageLibrary.js`
- Test: `src/useImageLibrary.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// src/useImageLibrary.test.jsx
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import useImageLibrary from './useImageLibrary.js';
import { putRecord } from './imageStore.js';

const reset = () => new Promise((resolve) => {
  const req = indexedDB.deleteDatabase('tallio-images');
  req.onsuccess = req.onerror = req.onblocked = () => resolve();
});
const rec = (id, over = {}) => ({ id, blob: new Blob(['x']), name: id, group: 'Family', palette: [], createdAt: 1, ...over });

describe('useImageLibrary', () => {
  beforeEach(reset);
  afterEach(() => cleanup());

  it('loads existing images on mount', async () => {
    await putRecord(rec('a'));
    await putRecord(rec('b', { createdAt: 2 }));
    const { result } = renderHook(() => useImageLibrary());
    await waitFor(() => expect(result.current.images.length).toBe(2));
  });

  it('addFromFile (injected) stores then reloads', async () => {
    const fakePut = async (file, meta) => putRecord(rec('new', { name: meta.name }));
    const { result } = renderHook(() => useImageLibrary({ putImage: fakePut }));
    await waitFor(() => expect(result.current.images.length).toBe(0));
    await act(async () => { await result.current.addFromFile(new File(['x'], 'x.jpg'), { name: 'Pic' }); });
    await waitFor(() => expect(result.current.images.map(i => i.name)).toContain('Pic'));
  });

  it('remove deletes and reloads', async () => {
    await putRecord(rec('a'));
    const { result } = renderHook(() => useImageLibrary());
    await waitFor(() => expect(result.current.images.length).toBe(1));
    await act(async () => { await result.current.remove('a'); });
    await waitFor(() => expect(result.current.images.length).toBe(0));
  });

  it('updateMeta renames and reloads', async () => {
    await putRecord(rec('a'));
    const { result } = renderHook(() => useImageLibrary());
    await waitFor(() => expect(result.current.images.length).toBe(1));
    await act(async () => { await result.current.updateMeta('a', { name: 'Renamed' }); });
    await waitFor(() => expect(result.current.images[0].name).toBe('Renamed'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useImageLibrary.test.jsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```js
// src/useImageLibrary.js
import { useState, useEffect, useCallback } from 'react';
import * as store from './imageStore.js';

// deps lets tests inject store functions (e.g. a canvas-free putImage).
export default function useImageLibrary(deps = {}) {
  const api = {
    listImages: deps.listImages || store.listImages,
    putImage: deps.putImage || store.putImage,
    deleteImage: deps.deleteImage || store.deleteImage,
    updateImageMeta: deps.updateImageMeta || store.updateImageMeta,
  };
  const [images, setImages] = useState([]);

  const reload = useCallback(async () => {
    setImages(await api.listImages());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const addFromFile = useCallback(async (file, meta) => {
    const saved = await api.putImage(file, meta);
    await reload();
    return saved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const remove = useCallback(async (id) => {
    await api.deleteImage(id);
    await reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const updateMeta = useCallback(async (id, patch) => {
    await api.updateImageMeta(id, patch);
    await reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  return { images, reload, addFromFile, remove, updateMeta };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useImageLibrary.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint + commit**

Run: `npx eslint src/useImageLibrary.js src/useImageLibrary.test.jsx`
Expected: 0 errors.

```
git add src/useImageLibrary.js src/useImageLibrary.test.jsx
git commit -m "feat(appearance): useImageLibrary hook (list/add/remove/rename)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: Background tab — base selector + wallpaper picker

**Files:**
- Modify: `src/BackgroundTab.jsx`
- Modify: `src/BackgroundTab.test.jsx`

> `BackgroundTab` gains new props `images = []` and `onUpload` (used in Task 15). This task adds the base selector (Solid / Wallpaper / Your photos) and the wallpaper grid. Keep the existing effects toggles + intensity slider.

- [ ] **Step 1: Write the failing test**

Replace `src/BackgroundTab.test.jsx` content with:

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import BackgroundTab from './BackgroundTab.jsx';

const makeAppearance = (over = {}) => {
  const updateBackground = vi.fn();
  const background = {
    base: 'solid', presetId: null, photoIds: [], photoGroup: null,
    mode: 'single', intervalSec: 30, intensity: 25,
    effects: { aurora: false, pulse: false }, ...over,
  };
  return { appearance: { background, updateBackground }, updateBackground };
};

describe('BackgroundTab base selector', () => {
  afterEach(() => cleanup());

  it('renders three base options', () => {
    const { appearance } = makeAppearance();
    const { getByRole } = render(<BackgroundTab appearance={appearance} />);
    expect(getByRole('button', { name: /solid/i })).toBeTruthy();
    expect(getByRole('button', { name: /wallpaper/i })).toBeTruthy();
    expect(getByRole('button', { name: /your photos/i })).toBeTruthy();
  });

  it('clicking "Your photos" sets base to photos', () => {
    const { appearance, updateBackground } = makeAppearance();
    const { getByRole } = render(<BackgroundTab appearance={appearance} />);
    fireEvent.click(getByRole('button', { name: /your photos/i }));
    expect(updateBackground).toHaveBeenCalledWith({ base: 'photos' });
  });

  it('shows the wallpaper grid and selects a wallpaper when base is preset', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'preset' });
    const { getByRole } = render(<BackgroundTab appearance={appearance} />);
    fireEvent.click(getByRole('button', { name: /dusk/i }));
    expect(updateBackground).toHaveBeenCalledWith({ presetId: 'dusk' });
  });

  it('still renders the effects toggles and intensity slider', () => {
    const { appearance } = makeAppearance();
    const { getByLabelText } = render(<BackgroundTab appearance={appearance} />);
    expect(getByLabelText('Aurora drift')).toBeTruthy();
    expect(getByLabelText('Background intensity')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/BackgroundTab.test.jsx`
Expected: FAIL — base buttons not rendered.

- [ ] **Step 3: Update `BackgroundTab.jsx`**

Replace the file with (photo controls come in Task 15; `images`/`onUpload` props are accepted now):

```jsx
import React from 'react';
import { WALLPAPERS } from './wallpapers.js';

const BASES = [
  { id: 'solid', label: 'Solid' },
  { id: 'preset', label: 'Wallpaper' },
  { id: 'photos', label: 'Your photos' },
];

export default function BackgroundTab({ appearance, images = [], onUpload }) {
  const { background, updateBackground } = appearance;
  const { base, presetId, effects, intensity } = background;

  const toggle = (key) => updateBackground({ effects: { ...effects, [key]: !effects[key] } });

  return (
    <div className="background-tab">
      <div className="appearance-label">Base background</div>
      <div className="bg-base-selector" role="group" aria-label="Base background">
        {BASES.map(b => (
          <button
            key={b.id} type="button"
            className={`bg-base-btn${base === b.id ? ' on' : ''}`}
            aria-pressed={base === b.id}
            onClick={() => updateBackground({ base: b.id })}
          >
            {b.label}
          </button>
        ))}
      </div>

      {base === 'preset' && (
        <div className="bg-wallpaper-grid">
          {WALLPAPERS.map(w => (
            <button
              key={w.id} type="button"
              className={`bg-wallpaper-swatch${presetId === w.id ? ' selected' : ''}`}
              aria-label={w.name}
              style={{ background: w.css }}
              onClick={() => updateBackground({ presetId: w.id })}
            >
              <span className="bg-wallpaper-name">{w.name}</span>
            </button>
          ))}
        </div>
      )}

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/BackgroundTab.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Add minimal CSS for the new controls**

In `src/App.css`, after the `.bg-toggle` styles (search for `.bg-toggle`), add:

```css
.bg-base-selector { display: flex; gap: 8px; margin-bottom: 14px; }
.bg-base-btn { flex: 1; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--bg-input); color: var(--text-muted); font-size: 12px; cursor: pointer; }
.bg-base-btn.on { color: var(--text); border-color: var(--accent-border); background: var(--accent-dim); }
.bg-wallpaper-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; margin-bottom: 16px; }
.bg-wallpaper-swatch { position: relative; height: 56px; border: 2px solid transparent; border-radius: var(--r-md); cursor: pointer; overflow: hidden; }
.bg-wallpaper-swatch.selected { border-color: var(--accent); }
.bg-wallpaper-name { position: absolute; left: 6px; bottom: 4px; font-size: 10px; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.8); }
```

- [ ] **Step 6: Lint + commit**

Run: `npx eslint src/BackgroundTab.jsx src/BackgroundTab.test.jsx`
Expected: 0 errors.

```
git add src/BackgroundTab.jsx src/BackgroundTab.test.jsx src/App.css
git commit -m "feat(appearance): Background tab base selector + wallpaper picker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 15: Background tab — photo upload, gallery, slideshow controls

**Files:**
- Modify: `src/BackgroundTab.jsx`
- Modify: `src/BackgroundTab.test.jsx`

> When base is `photos`: an Upload button, a gallery of library images (toggle membership in `photoIds`), single/slideshow mode, interval (slideshow only), and an optional group source. `onUpload(file)` and `images` come from the parent (Task 16).

- [ ] **Step 1: Write the failing test**

Add to `src/BackgroundTab.test.jsx`:

```jsx
describe('BackgroundTab photo controls', () => {
  afterEach(() => cleanup());

  const images = [
    { id: 'a', name: 'Beach', group: 'Scenery' },
    { id: 'b', name: 'Dog',   group: 'Pets' },
  ];

  it('calls onUpload when a file is chosen', () => {
    const onUpload = vi.fn();
    const { appearance } = makeAppearance({ base: 'photos' });
    const { getByLabelText } = render(<BackgroundTab appearance={appearance} images={images} onUpload={onUpload} />);
    const input = getByLabelText('Upload photo');
    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onUpload.mock.calls[0][0]).toBe(file);
  });

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

  it('switches to slideshow mode and edits the interval', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'photos', mode: 'single' });
    const { getByRole, getByLabelText } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.click(getByRole('button', { name: /slideshow/i }));
    expect(updateBackground).toHaveBeenCalledWith({ mode: 'slideshow' });

    // interval visible only in slideshow mode
    const appearance2 = makeAppearance({ base: 'photos', mode: 'slideshow' });
    cleanup();
    render(<BackgroundTab appearance={appearance2.appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.change(getByLabelText('Slideshow interval (seconds)'), { target: { value: '45' } });
    expect(appearance2.updateBackground).toHaveBeenCalledWith({ intervalSec: 45 });
  });

  it('sets a group source from the dropdown', () => {
    const { appearance, updateBackground } = makeAppearance({ base: 'photos' });
    const { getByLabelText } = render(<BackgroundTab appearance={appearance} images={images} onUpload={vi.fn()} />);
    fireEvent.change(getByLabelText('Slideshow group source'), { target: { value: 'Pets' } });
    expect(updateBackground).toHaveBeenCalledWith({ photoGroup: 'Pets' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/BackgroundTab.test.jsx`
Expected: FAIL — photo controls not rendered.

- [ ] **Step 3: Update `BackgroundTab.jsx`**

Add helper logic inside the component (after `toggle`):

```jsx
  const photoIds = background.photoIds || [];
  const togglePhoto = (id) => {
    const next = photoIds.includes(id) ? photoIds.filter(x => x !== id) : [...photoIds, id];
    updateBackground({ photoIds: next });
  };
  const groups = Array.from(new Set(images.map(i => i.group).filter(Boolean)));
```

Insert this block in the JSX immediately **after** the `{base === 'preset' && (...)}` block:

```jsx
      {base === 'photos' && (
        <div className="bg-photos">
          <label className="bg-upload-btn">
            ↑ Upload photo
            <input
              type="file" accept="image/*" aria-label="Upload photo" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files[0]; if (f && onUpload) onUpload(f); e.target.value = ''; }}
            />
          </label>

          {images.length === 0 ? (
            <p className="appearance-hint">No photos yet — upload one to get started.</p>
          ) : (
            <div className="bg-photo-gallery">
              {images.map(img => (
                <button
                  key={img.id} type="button"
                  aria-label={`select ${img.name}`}
                  className={`bg-photo-cell${photoIds.includes(img.id) ? ' selected' : ''}`}
                  onClick={() => togglePhoto(img.id)}
                >
                  {img.name}
                </button>
              ))}
            </div>
          )}

          <div className="bg-mode-toggles">
            <button
              type="button" className={`bg-mode-btn${background.mode === 'single' ? ' on' : ''}`}
              aria-pressed={background.mode === 'single'} onClick={() => updateBackground({ mode: 'single' })}
            >Single</button>
            <button
              type="button" className={`bg-mode-btn${background.mode === 'slideshow' ? ' on' : ''}`}
              aria-pressed={background.mode === 'slideshow'} onClick={() => updateBackground({ mode: 'slideshow' })}
            >Slideshow</button>
          </div>

          {background.mode === 'slideshow' && (
            <label className="appearance-label" htmlFor="bg-interval">
              Interval
              <input
                id="bg-interval" type="number" min="5" max="600" className="bg-interval-input"
                aria-label="Slideshow interval (seconds)" value={background.intervalSec}
                onChange={(e) => updateBackground({ intervalSec: Number(e.target.value) })}
              />
            </label>
          )}

          <label className="appearance-label" htmlFor="bg-group">
            Use a group as the slideshow source
            <select
              id="bg-group" className="bg-group-select" aria-label="Slideshow group source"
              value={background.photoGroup || ''}
              onChange={(e) => updateBackground({ photoGroup: e.target.value || null })}
            >
              <option value="">None (use selected photos)</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
        </div>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/BackgroundTab.test.jsx`
Expected: PASS (all).

- [ ] **Step 5: Add minimal CSS**

In `src/App.css`, after the wallpaper grid styles from Task 14, add:

```css
.bg-photos { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
.bg-upload-btn { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; padding: 7px 14px; border: 1px solid var(--accent-border); border-radius: var(--r-md); background: var(--accent-dim); color: var(--accent); font-size: 12px; cursor: pointer; }
.bg-photo-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 8px; }
.bg-photo-cell { padding: 10px 8px; border: 2px solid var(--border); border-radius: var(--r-md); background: var(--bg-input); color: var(--text-muted); font-size: 11px; cursor: pointer; text-align: center; }
.bg-photo-cell.selected { border-color: var(--accent); color: var(--text); }
.bg-mode-toggles { display: flex; gap: 8px; }
.bg-mode-btn { padding: 6px 14px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--bg-input); color: var(--text-muted); font-size: 12px; cursor: pointer; }
.bg-mode-btn.on { color: var(--text); border-color: var(--accent-border); background: var(--accent-dim); }
.bg-interval-input { margin-left: 8px; width: 70px; padding: 4px 6px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--r-sm); color: var(--text); }
.bg-group-select { margin-left: 8px; padding: 4px 6px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--r-sm); color: var(--text); }
```

- [ ] **Step 6: Lint + commit**

Run: `npx eslint src/BackgroundTab.jsx src/BackgroundTab.test.jsx`
Expected: 0 errors.

```
git add src/BackgroundTab.jsx src/BackgroundTab.test.jsx src/App.css
git commit -m "feat(appearance): Background tab photo upload, gallery + slideshow controls

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 16: Wire it together — AppearanceScreen + App.jsx

**Files:**
- Modify: `src/AppearanceScreen.jsx`
- Modify: `src/AppearanceScreen.test.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Write the failing test (AppearanceScreen passes library to BackgroundTab)**

Add to `src/AppearanceScreen.test.jsx` (keep existing imports; ensure `afterEach(cleanup)` exists in the file):

```jsx
it('Background tab can switch the base to Your photos (library wired)', async () => {
  // useImageLibrary uses IndexedDB; provide it via fake-indexeddb
  await import('fake-indexeddb/auto');
  const appearance = {
    themeId: 'nocturne', customTheme: null,
    background: { base: 'solid', presetId: null, photoIds: [], photoGroup: null, mode: 'single', intervalSec: 30, intensity: 25, effects: { aurora: false, pulse: false } },
    appIcons: {}, setTheme: () => {}, updateCustom: () => {}, resetCustomToPreset: () => {}, updateBackground: vi.fn(),
  };
  const { getByRole } = render(<AppearanceScreen appearance={appearance} onClose={() => {}} />);
  fireEvent.click(getByRole('tab', { name: 'Background' }));
  fireEvent.click(getByRole('button', { name: /your photos/i }));
  expect(appearance.updateBackground).toHaveBeenCalledWith({ base: 'photos' });
});
```

> Add `import { vi } from 'vitest';` and `fireEvent` to the existing imports if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/AppearanceScreen.test.jsx`
Expected: FAIL — BackgroundTab still works but the test confirms wiring; if `useImageLibrary` is not yet used it will still pass the click… Verify it FAILS only if wiring is missing. If it already passes (BackgroundTab handles base without images), proceed — the substantive change is Step 3.

- [ ] **Step 3: Update `AppearanceScreen.jsx`**

```jsx
import React, { useState } from 'react';
import ThemeTab from './ThemeTab.jsx';
import BackgroundTab from './BackgroundTab.jsx';
import useImageLibrary from './useImageLibrary.js';

const TABS = [
  { id: 'theme', label: 'Theme' },
  { id: 'bg', label: 'Background' },
  { id: 'icons', label: 'Image Icons' },
];

export default function AppearanceScreen({ appearance, onClose }) {
  const [tab, setTab] = useState('theme');
  const library = useImageLibrary();

  return (
    <div className="container appearance-screen">
      <div className="header">
        <h1 className="title">✦ Appearance</h1>
        <div className="header-actions">
          <button type="button" className="btn" onClick={onClose}>Done</button>
        </div>
      </div>

      <div className="appearance-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`appearance-tab${tab === t.id ? ' on' : ''}`}
            onClick={() => setTab(t.id)}
          >
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
          />
        )}
        {tab === 'icons' && <p className="appearance-placeholder">Image icons — coming soon (Phase 3).</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire `App.jsx` to drive `BackgroundLayer` from `useBackgroundPhotos`**

In `src/App.jsx`, add the import near the other imports:

```jsx
import useBackgroundPhotos from './useBackgroundPhotos.js';
```

Find where `appearance` is created (search for `useAppearance(`). Immediately after it, add:

```jsx
  const bgPhotos = useBackgroundPhotos(appearance.background);
```

Replace the existing mount:

```jsx
      <BackgroundLayer background={appearance.background} />
```
with:

```jsx
      <BackgroundLayer
        background={appearance.background}
        photos={bgPhotos.photos}
        activeIndex={bgPhotos.activeIndex}
      />
```

- [ ] **Step 5: Run the relevant tests + full suite**

Run: `npx vitest run src/AppearanceScreen.test.jsx`
Expected: PASS.

Run: `npx vitest run`
Expected: all green (existing + new files).

- [ ] **Step 6: Manual verification (`npm run dev`)**

Open Appearance → Background → Your photos. Upload a photo; it appears in the gallery. Select it → it renders as the app background; numbers stay legible. Add a second photo, switch to Slideshow with a short interval → confirm a crossfade. Toggle Aurora → blobs pick up the photo's colors.

- [ ] **Step 7: Lint + commit**

Run: `npx eslint src/AppearanceScreen.jsx src/AppearanceScreen.test.jsx src/App.jsx`
Expected: 0 errors (ignore the pre-existing CameraCapture useEffect-deps warning).

```
git add src/AppearanceScreen.jsx src/AppearanceScreen.test.jsx src/App.jsx
git commit -m "feat(appearance): wire photo library + background photos into the app

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 17: Export archive bundles images + appearance; add `parseArchive`

**Files:**
- Modify: `src/exportArchive.js`
- Modify: `src/exportArchive.test.js`

- [ ] **Step 1: Write the failing test**

Add to `src/exportArchive.test.js`:

```js
import { parseArchive } from './exportArchive.js';

describe('export with appearance + images', () => {
  const u8 = (s) => new TextEncoder().encode(s);

  it('omits appearance/images keys when not provided (back-compat)', () => {
    const bytes = buildArchive({ accounts, transactions, categories, schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-12') });
    expect(Object.keys(unzipSync(bytes)).sort()).toEqual(['data.json', 'transactions.csv']);
  });

  it('bundles appearance.json when provided', () => {
    const appearance = { themeId: 'forest', background: { base: 'solid' } };
    const bytes = buildArchive({ accounts, transactions, categories, appearance, schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-12') });
    const files = unzipSync(bytes);
    expect(JSON.parse(strFromU8(files['appearance.json'])).themeId).toBe('forest');
  });

  it('bundles image bytes + an index and round-trips via parseArchive', () => {
    const images = [
      { id: 'a', name: 'Beach', group: 'Scenery', type: 'image/jpeg', w: 10, h: 10, palette: ['#111'], createdAt: 1, bytes: u8('IMGA'), thumbBytes: u8('THA') },
      { id: 'b', name: 'Dog', group: 'Pets', type: 'image/jpeg', w: 8, h: 8, palette: ['#222'], createdAt: 2, bytes: u8('IMGB') },
    ];
    const appearance = { themeId: 'nocturne' };
    const bytes = buildArchive({ accounts, transactions, categories, images, appearance, schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-12') });

    const parsed = parseArchive(bytes);
    expect(parsed.data.schemaVersion).toBe(4);
    expect(parsed.appearance.themeId).toBe('nocturne');
    expect(parsed.images.map(i => i.id).sort()).toEqual(['a', 'b']);
    const a = parsed.images.find(i => i.id === 'a');
    expect(strFromU8(a.bytes)).toBe('IMGA');
    expect(strFromU8(a.thumbBytes)).toBe('THA');
    const b = parsed.images.find(i => i.id === 'b');
    expect(b.thumbBytes).toBeNull();
  });

  it('parseArchive returns empty images for an archive without them', () => {
    const bytes = buildArchive({ accounts, transactions, categories, schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-12') });
    const parsed = parseArchive(bytes);
    expect(parsed.images).toEqual([]);
    expect(parsed.appearance).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/exportArchive.test.js`
Expected: FAIL — `parseArchive` missing / appearance & images not bundled.

- [ ] **Step 3: Update `exportArchive.js`**

Change the import line at the top:

```js
import { zipSync, unzipSync, strFromU8 } from 'fflate';
```

Replace the `buildArchive` function with (adds optional `images`, `appearance`):

```js
export function buildArchive({ accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now, reportAcks, images, appearance }) {
  const categoriesById = new Map((categories || []).map(c => [c.id, c]));
  const jsonString = buildDataJson(accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now, reportAcks);
  const csvString = buildTransactionsCsv(accounts, transactions, categoriesById);
  const encoder = new TextEncoder();
  const jsonBytes = new Uint8Array(Array.from(encoder.encode(jsonString)));
  const csvWithoutBom = csvString.charCodeAt(0) === 0xFEFF ? csvString.slice(1) : csvString;
  const csvContentBytes = new Uint8Array(Array.from(encoder.encode(csvWithoutBom)));
  const csvBytes = new Uint8Array(3 + csvContentBytes.length);
  csvBytes[0] = 0xEF; csvBytes[1] = 0xBB; csvBytes[2] = 0xBF;
  csvBytes.set(csvContentBytes, 3);

  const files = { 'data.json': jsonBytes, 'transactions.csv': csvBytes };

  if (appearance) {
    files['appearance.json'] = new Uint8Array(Array.from(encoder.encode(JSON.stringify(appearance, null, 2))));
  }
  if (images && images.length) {
    const index = images.map(({ bytes, thumbBytes, ...meta }) => meta); // eslint-disable-line no-unused-vars
    files['images/index.json'] = new Uint8Array(Array.from(encoder.encode(JSON.stringify(index, null, 2))));
    for (const img of images) {
      if (img.bytes) files[`images/${img.id}`] = img.bytes;
      if (img.thumbBytes) files[`images/${img.id}.thumb`] = img.thumbBytes;
    }
  }

  return zipSync(files);
}
```

Append `parseArchive`:

```js
// Reads an archive back into its parts. Image bytes are returned alongside their
// metadata; appearance + data are parsed JSON (null when absent). The inverse of
// buildArchive — used by import/restore.
export function parseArchive(bytes) {
  const files = unzipSync(bytes);
  const data = files['data.json'] ? JSON.parse(strFromU8(files['data.json'])) : null;
  const appearance = files['appearance.json'] ? JSON.parse(strFromU8(files['appearance.json'])) : null;
  let images = [];
  if (files['images/index.json']) {
    const index = JSON.parse(strFromU8(files['images/index.json']));
    images = index.map(meta => ({
      ...meta,
      bytes: files[`images/${meta.id}`] || null,
      thumbBytes: files[`images/${meta.id}.thumb`] || null,
    }));
  }
  return { data, appearance, images };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/exportArchive.test.js`
Expected: PASS (existing + 4 new).

- [ ] **Step 5: Lint + commit**

Run: `npx eslint src/exportArchive.js src/exportArchive.test.js`
Expected: 0 errors.

```
git add src/exportArchive.js src/exportArchive.test.js
git commit -m "feat(appearance): bundle images + appearance into export; add parseArchive

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 18: Include images + appearance in the actual export download

**Files:**
- Modify: `src/App.jsx` (the `exportData` function)

> `buildArchive` takes pre-read `Uint8Array` bytes (it stays sync), so `exportData` becomes async: it reads each image blob via `blob.arrayBuffer()` and the appearance JSON from localStorage. Verified manually (download contents) — no unit test for the DOM download path.

- [ ] **Step 1: Add the imageStore import to `App.jsx`**

Near the other imports:

```jsx
import { listImages } from './imageStore.js';
```

- [ ] **Step 2: Make `exportData` async and gather images + appearance**

Replace the existing `exportData` (around `const exportData = () => {`) with:

```jsx
  const exportData = async () => {
    let images = [];
    try {
      const recs = await listImages();
      images = await Promise.all(recs.map(async (r) => ({
        id: r.id, name: r.name, group: r.group, type: r.type,
        w: r.w, h: r.h, palette: r.palette, createdAt: r.createdAt,
        bytes: new Uint8Array(await r.blob.arrayBuffer()),
        thumbBytes: r.thumb ? new Uint8Array(await r.thumb.arrayBuffer()) : null,
      })));
    } catch { /* no images / IndexedDB unavailable */ }

    let appearance = null;
    try {
      const raw = window.localStorage.getItem('tallio-appearance');
      if (raw) appearance = JSON.parse(raw);
    } catch { /* ignore */ }

    const bytes = buildArchive({
      accounts: ledger.accounts, transactions: ledger.transactions,
      categories: cats.categories, accountTypes: accountTypes.types,
      reportAcks: acks.exportSnapshot(),
      images, appearance,
      schemaVersion: 4, appVersion: pkg.version, now: new Date(),
    });
    const blob = new Blob([bytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tallio-${new Date().toISOString().split('T')[0]}.zip`; a.click();
    URL.revokeObjectURL(url);
  };
```

> Note: confirm the original `exportData` body's `schemaVersion`/`appVersion`/`now` arguments match what's there now (the snippet preserves them). If the original passed different values, keep those — only the `images`/`appearance` additions and `async`/`await` are new.

- [ ] **Step 3: Run the full suite (no regressions)**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 4: Manual verification (`npm run dev`)**

Upload a photo, set it as the background, click Export. Open the downloaded `.zip` and confirm it contains `data.json`, `transactions.csv`, `appearance.json`, and `images/index.json` + the image file(s).

- [ ] **Step 5: Lint + commit**

Run: `npx eslint src/App.jsx`
Expected: 0 errors (ignore the pre-existing CameraCapture warning).

```
git add src/App.jsx
git commit -m "feat(appearance): export download includes images + appearance settings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Run the full suite: `npx vitest run` — all green.
- [ ] Lint the touched files: `npx eslint src/` — 0 errors (ignore the pre-existing CameraCapture useEffect-deps warning).
- [ ] Build sanity: `npm run build` — succeeds (the >500 kB chunk warning is pre-existing).
- [ ] Manual pass in `npm run dev`: default appearance unchanged on Register/Reports/Manage (frosting is a no-op); wallpaper + photo + slideshow + effects all work; numbers legible at max intensity.
- [ ] Run **superpowers:finishing-a-development-branch**: push to `rename-to-tallio` and update PR #10's title/body to include Phase 2b.
- [ ] Update the handoff/memory: mark Phase 2b done; Phase 3 (image-icons + library) is next.

---

## Spec coverage check

- §2.1 imageStore CRUD + re-encode/thumb/palette → Tasks 3, 4, 5 ✅
- §2.2 imageColors.extractPalette (pure, testable) → Task 2 ✅
- §2.3 BackgroundLayer photos/wallpaper base, slideshow crossfade, palette-colored effects, reduced-motion, scrim, surface vars → Tasks 8, 9, 10, 11, 12 ✅
- §2.4 Background tab base selector, wallpapers, upload/reorder*, single/slideshow + interval, group source → Tasks 14, 15 ✅ (*reorder is covered as add/remove toggle ordering by selection; full drag-reorder deferred — see note)
- §2.5 export bundles images + appearance; restore via parseArchive → Tasks 17, 18 ✅
- Preset wallpapers (bundled set) → Task 7 ✅ (gradient presets; image-file wallpapers later)

**Note on reorder:** the spec mentions reordering photos. This plan selects/deselects images into an ordered `photoIds` (append order). Full drag-to-reorder UI is deferred as a small follow-up to keep this phase focused; `resolvePhotoIds` already honors `photoIds` order, so reorder is purely a UI add later.
