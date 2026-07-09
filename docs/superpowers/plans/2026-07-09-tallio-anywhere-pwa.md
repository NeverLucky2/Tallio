# Tallio Anywhere (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this project's owner runs tasks **inline** with checkpoints — NOT subagent-driven). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tallio runnable by non-technical users from a hosted link with no localhost — installable, offline-capable, with bulletproof real-file backup/restore and a Chromium linked-live-file — while keeping 100% of data on the user's machine.

**Architecture:** Two thin layers over the existing untouched client-side app. A **PWA shell** (vite-plugin-pwa + manifest + self-hosted fonts) makes it installable/offline. A **file layer** turns data into real `.tallio` files, reusing the existing `buildArchive()`/`parseArchive()` in `exportArchive.js`: a universal export + import/restore tier (every browser) and a Chrome/Edge linked-live-file tier (File System Access API, feature-detected with graceful fallback). Import is a race-free storage-level write + reload.

**Tech Stack:** React 19, Vite 7, Vitest 4, fflate (existing archive), `vite-plugin-pwa` (Workbox), Fontsource (self-hosted fonts), File System Access API, `navigator.storage`. Hosting: Cloudflare Pages (static) + custom domain.

## Global Constraints

- **No cloud data, ever.** Hosting serves only static code over HTTPS. No server storage, no telemetry of user data, no sync.
- **React 19 / Vite 7 / Vitest 4.** Match existing patterns: function-module hooks, `tallio-*` storage keys, colocated `*.test.{js,jsx}`.
- **Keep the full suite green** (~1037 tests). New browser-only APIs (`storage.persist`, `showSaveFilePicker`, service worker) MUST be feature-detected and no-op cleanly under jsdom.
- **Archive format is unchanged.** Reuse `buildArchive`/`parseArchive`; `schemaVersion` stays `5`. Only the file extension standardizes to `.tallio` (zip contents).
- **Exact storage keys:** `tallio-accounts`, `tallio-transactions`, `tallio-categories`, `tallio-account-types`, `tallio-templates`, `tallio-report-acks`, `tallio-appearance`; images in IndexedDB `tallio-images` via `imageStore.js`.
- **Commit after every task.** Run `npm test` before each commit; it must pass.

---

### Task 1: Storage persistence module

Ask the browser to keep Tallio's data (no eviction) and report usage. Both are feature-detected and jsdom-safe.

**Files:**
- Create: `src/storagePersist.js`
- Test: `src/storagePersist.test.js`

**Interfaces:**
- Produces:
  - `requestPersistentStorage(): Promise<{supported: boolean, persisted: boolean}>`
  - `getStorageEstimate(): Promise<{supported: boolean, usage: number, quota: number}>`

- [ ] **Step 1: Write the failing test**

```js
// src/storagePersist.test.js
import { describe, it, expect, afterEach, vi } from 'vitest';
import { requestPersistentStorage, getStorageEstimate } from './storagePersist.js';

const orig = navigator.storage;
afterEach(() => { Object.defineProperty(navigator, 'storage', { value: orig, configurable: true }); });
function mockStorage(obj) { Object.defineProperty(navigator, 'storage', { value: obj, configurable: true }); }

describe('storagePersist', () => {
  it('reports unsupported when the API is absent', async () => {
    mockStorage(undefined);
    expect(await requestPersistentStorage()).toEqual({ supported: false, persisted: false });
    expect(await getStorageEstimate()).toEqual({ supported: false, usage: 0, quota: 0 });
  });

  it('returns early when storage is already persisted (no re-request)', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    mockStorage({ persisted: vi.fn().mockResolvedValue(true), persist });
    expect(await requestPersistentStorage()).toEqual({ supported: true, persisted: true });
    expect(persist).not.toHaveBeenCalled();
  });

  it('requests persistence when not yet persisted', async () => {
    mockStorage({ persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(true) });
    expect(await requestPersistentStorage()).toEqual({ supported: true, persisted: true });
  });

  it('estimates usage and quota', async () => {
    mockStorage({ estimate: vi.fn().mockResolvedValue({ usage: 10, quota: 100 }) });
    expect(await getStorageEstimate()).toEqual({ supported: true, usage: 10, quota: 100 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/storagePersist.test.js`
Expected: FAIL — `Failed to resolve import "./storagePersist.js"`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/storagePersist.js
// Ask the browser not to evict Tallio's data, and report storage usage.
// Every call is feature-detected so it is safe under jsdom (benign defaults).

export async function requestPersistentStorage() {
  const s = typeof navigator !== 'undefined' && navigator.storage;
  if (!s || typeof s.persist !== 'function') return { supported: false, persisted: false };
  let persisted = typeof s.persisted === 'function' ? await s.persisted() : false;
  if (!persisted) persisted = await s.persist();
  return { supported: true, persisted: !!persisted };
}

export async function getStorageEstimate() {
  const s = typeof navigator !== 'undefined' && navigator.storage;
  if (!s || typeof s.estimate !== 'function') return { supported: false, usage: 0, quota: 0 };
  const { usage = 0, quota = 0 } = await s.estimate();
  return { supported: true, usage, quota };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/storagePersist.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/storagePersist.js src/storagePersist.test.js
git commit -m "feat(storage): feature-detected persistent-storage + estimate helpers"
```

---

### Task 2: Archive → storage restore mapping

Turn `parseArchive()` output into a race-free write to the app's storage keys + image store. Framework-free and fully unit-testable.

**Files:**
- Create: `src/archiveRestore.js`
- Test: `src/archiveRestore.test.js`

**Interfaces:**
- Consumes: `parseArchive` output `{ data, appearance, images }` from `exportArchive.js`; `replaceAllImages` from `imageStore.js`.
- Produces:
  - `SUPPORTED_SCHEMA_VERSION = 5`
  - `assertSupportedSchema(parsed): number` — throws on missing/newer format.
  - `restoreArchiveToStorage(parsed, { storage?, imageStore? }): Promise<void>` — writes localStorage keys + `imageStore.replaceAllImages`. Defaults to real `localStorage` and the real `imageStore` module.

- [ ] **Step 1: Write the failing test**

```js
// src/archiveRestore.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildArchive } from './exportArchive.js';
import { parseArchive } from './exportArchive.js';
import { assertSupportedSchema, restoreArchiveToStorage, SUPPORTED_SCHEMA_VERSION } from './archiveRestore.js';

function memStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}

describe('assertSupportedSchema', () => {
  it('rejects a missing format', () => {
    expect(() => assertSupportedSchema({ data: {} })).toThrow(/valid Tallio backup/i);
  });
  it('rejects a newer format', () => {
    expect(() => assertSupportedSchema({ data: { schemaVersion: SUPPORTED_SCHEMA_VERSION + 1 } })).toThrow(/newer version/i);
  });
  it('accepts the current format', () => {
    expect(assertSupportedSchema({ data: { schemaVersion: 5 } })).toBe(5);
  });
});

describe('restoreArchiveToStorage', () => {
  let storage, imageStore;
  beforeEach(() => { storage = memStorage(); imageStore = { replaceAllImages: vi.fn().mockResolvedValue() }; });

  it('writes every storage key from a round-tripped archive', async () => {
    const bytes = buildArchive({
      accounts: [{ id: 'a1', name: 'Checking' }],
      transactions: [{ id: 't1', accountId: 'a1', amount: -5, date: '2026-01-01' }],
      categories: [{ id: 'c1', name: 'Food' }],
      accountTypes: [{ id: 'ty1', name: 'Bank' }],
      reportAcks: { subscriptions: { x: 1 }, dismissedDuplicates: ['d'] },
      templates: [{ id: 'tpl1', name: 'Rent' }],
      images: [], appearance: { themeId: 'nocturne' },
      schemaVersion: 5, appVersion: '9.9.9', now: new Date('2026-01-02T00:00:00Z'),
    });
    await restoreArchiveToStorage(parseArchive(bytes), { storage, imageStore });

    expect(JSON.parse(storage.getItem('tallio-accounts'))).toEqual([{ id: 'a1', name: 'Checking' }]);
    expect(JSON.parse(storage.getItem('tallio-transactions'))[0].id).toBe('t1');
    expect(JSON.parse(storage.getItem('tallio-categories'))).toEqual([{ id: 'c1', name: 'Food' }]);
    expect(JSON.parse(storage.getItem('tallio-account-types'))).toEqual([{ id: 'ty1', name: 'Bank' }]);
    expect(JSON.parse(storage.getItem('tallio-templates'))).toEqual([{ id: 'tpl1', name: 'Rent' }]);
    expect(JSON.parse(storage.getItem('tallio-report-acks'))).toEqual({ subscriptions: { x: 1 }, dismissedDuplicates: ['d'] });
    expect(JSON.parse(storage.getItem('tallio-appearance'))).toEqual({ themeId: 'nocturne' });
    expect(imageStore.replaceAllImages).toHaveBeenCalledWith([]);
  });

  it('converts archive image bytes back into Blob records', async () => {
    const bytes = buildArchive({
      accounts: [], transactions: [], categories: [], accountTypes: [],
      reportAcks: { subscriptions: {}, dismissedDuplicates: [] }, templates: [],
      images: [{ id: 'img1', name: 'r.png', group: 'G', type: 'image/png', w: 1, h: 1, palette: [], createdAt: 5, bytes: new Uint8Array([1, 2, 3]), thumbBytes: new Uint8Array([9]) }],
      appearance: null, schemaVersion: 5, appVersion: '1', now: new Date('2026-01-02T00:00:00Z'),
    });
    await restoreArchiveToStorage(parseArchive(bytes), { storage, imageStore });
    const records = imageStore.replaceAllImages.mock.calls[0][0];
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('img1');
    expect(records[0].blob).toBeInstanceOf(Blob);
    expect(records[0].thumb).toBeInstanceOf(Blob);
  });

  it('throws on a non-Tallio blob', async () => {
    await expect(restoreArchiveToStorage({ data: null }, { storage, imageStore })).rejects.toThrow(/valid Tallio backup/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/archiveRestore.test.js`
Expected: FAIL — cannot resolve `./archiveRestore.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/archiveRestore.js
// Write a parsed archive (from parseArchive) straight into the app's storage keys
// and image store. Callers reload the page afterward so every provider re-reads
// fresh storage — no React-effect timing hazards. Framework-free + injectable.
import * as realImageStore from './imageStore.js';

export const SUPPORTED_SCHEMA_VERSION = 5;

export function assertSupportedSchema(parsed) {
  const v = parsed && parsed.data && parsed.data.schemaVersion;
  if (v == null) throw new Error('Not a valid Tallio backup: unknown format.');
  if (v > SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`This backup was made by a newer version of Tallio (format v${v}). Please update Tallio and try again.`);
  }
  return v;
}

export async function restoreArchiveToStorage(parsed, { storage = localStorage, imageStore = realImageStore } = {}) {
  assertSupportedSchema(parsed);
  const { data, appearance, images } = parsed;
  storage.setItem('tallio-accounts', JSON.stringify(data.accounts || []));
  storage.setItem('tallio-transactions', JSON.stringify(data.transactions || []));
  storage.setItem('tallio-categories', JSON.stringify(data.categories || []));
  storage.setItem('tallio-account-types', JSON.stringify(data.accountTypes || []));
  storage.setItem('tallio-templates', JSON.stringify(data.templates || []));
  storage.setItem('tallio-report-acks', JSON.stringify(data.reportAcks || { subscriptions: {}, dismissedDuplicates: [] }));
  if (appearance) storage.setItem('tallio-appearance', JSON.stringify(appearance));

  const records = (images || []).map(img => {
    const type = img.type || 'application/octet-stream';
    return {
      id: img.id, name: img.name, group: img.group, type,
      w: img.w, h: img.h, palette: img.palette, createdAt: img.createdAt,
      blob: new Blob([img.bytes], { type }),
      thumb: img.thumbBytes ? new Blob([img.thumbBytes], { type }) : undefined,
    };
  });
  await imageStore.replaceAllImages(records);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/archiveRestore.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/archiveRestore.js src/archiveRestore.test.js
git commit -m "feat(backup): restore a parsed archive to storage + image store"
```

---

### Task 3: File-store adapter (universal + File System Access)

One module behind which live all file I/O: universal download/read, plus the Chrome/Edge File System Access API (pickers, handle read/write, permission) and handle persistence in IndexedDB. Wrapping it makes the app feature-detect once and keeps the FSAA calls mockable.

**Files:**
- Create: `src/fileStore.js`
- Test: `src/fileStore.test.js`

**Interfaces:**
- Produces:
  - `TALLIO_FILE_TYPES` (picker `types` array), `DEFAULT_FILE_NAME = 'MyBudget.tallio'`
  - `downloadArchive(bytes: Uint8Array, filename?: string): void`
  - `readBytesFromFile(file: File): Promise<Uint8Array>`
  - `isLiveFileSupported(): boolean`
  - `pickSaveFile(suggestedName?): Promise<FileSystemFileHandle>`
  - `pickOpenFile(): Promise<FileSystemFileHandle>`
  - `readHandle(handle): Promise<Uint8Array>`
  - `writeHandle(handle, bytes: Uint8Array): Promise<void>`
  - `ensurePermission(handle, mode?): Promise<boolean>`
  - `saveHandle(handle): Promise<void>`, `loadHandle(): Promise<FileSystemFileHandle|null>`, `clearHandle(): Promise<void>`

- [ ] **Step 1: Write the failing test**

```js
// src/fileStore.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  isLiveFileSupported, pickSaveFile, readHandle, writeHandle, ensurePermission,
  saveHandle, loadHandle, clearHandle, readBytesFromFile,
} from './fileStore.js';

function fakeHandle(initialBytes = new Uint8Array()) {
  let bytes = initialBytes;
  const chunks = [];
  return {
    name: 'MyBudget.tallio',
    createWritable: vi.fn().mockResolvedValue({
      write: vi.fn().mockImplementation(b => { chunks.push(b); return Promise.resolve(); }),
      close: vi.fn().mockImplementation(() => { bytes = chunks.at(-1); return Promise.resolve(); }),
    }),
    getFile: vi.fn().mockImplementation(() => Promise.resolve({ arrayBuffer: () => Promise.resolve(bytes.buffer ?? new Uint8Array(bytes).buffer) })),
    queryPermission: vi.fn().mockResolvedValue('granted'),
    requestPermission: vi.fn().mockResolvedValue('granted'),
    _get: () => bytes,
  };
}

afterEach(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; vi.restoreAllMocks(); });

describe('feature detection', () => {
  it('is false when the API is absent (jsdom default)', () => {
    expect(isLiveFileSupported()).toBe(false);
  });
  it('is true when showSaveFilePicker exists', () => {
    window.showSaveFilePicker = () => {};
    expect(isLiveFileSupported()).toBe(true);
  });
});

describe('handle read/write', () => {
  it('writes bytes through a writable and reads them back', async () => {
    const h = fakeHandle();
    await writeHandle(h, new Uint8Array([1, 2, 3]));
    const back = await readHandle(h);
    expect(Array.from(back)).toEqual([1, 2, 3]);
  });
  it('ensurePermission returns true when already granted', async () => {
    expect(await ensurePermission(fakeHandle())).toBe(true);
  });
  it('ensurePermission requests when prompt', async () => {
    const h = fakeHandle();
    h.queryPermission.mockResolvedValue('prompt');
    expect(await ensurePermission(h)).toBe(true);
    expect(h.requestPermission).toHaveBeenCalled();
  });
});

describe('pickSaveFile', () => {
  it('delegates to showSaveFilePicker', async () => {
    const h = fakeHandle();
    window.showSaveFilePicker = vi.fn().mockResolvedValue(h);
    expect(await pickSaveFile('X.tallio')).toBe(h);
    expect(window.showSaveFilePicker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'X.tallio' }));
  });
});

describe('handle persistence', () => {
  beforeEach(async () => { await clearHandle(); });
  it('round-trips a handle through IndexedDB', async () => {
    const h = fakeHandle();
    await saveHandle(h);
    const loaded = await loadHandle();
    expect(loaded).toBeTruthy();
    expect(loaded.name).toBe('MyBudget.tallio');
  });
  it('returns null after clear', async () => {
    await saveHandle(fakeHandle());
    await clearHandle();
    expect(await loadHandle()).toBeNull();
  });
});

describe('readBytesFromFile', () => {
  it('reads a File to a Uint8Array', async () => {
    const file = { arrayBuffer: () => Promise.resolve(new Uint8Array([7, 8]).buffer) };
    expect(Array.from(await readBytesFromFile(file))).toEqual([7, 8]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/fileStore.test.js`
Expected: FAIL — cannot resolve `./fileStore.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/fileStore.js
// All file I/O behind one interface: a universal download/read path, plus the
// Chrome/Edge File System Access API (pickers, handle read/write, permission) and
// persistence of the chosen handle in IndexedDB. Feature-detected; jsdom-safe.

export const DEFAULT_FILE_NAME = 'MyBudget.tallio';
export const TALLIO_FILE_TYPES = [
  { description: 'Tallio budget', accept: { 'application/x-tallio': ['.tallio'] } },
];

// --- Universal (every browser) ---
export function downloadArchive(bytes, filename = DEFAULT_FILE_NAME) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export async function readBytesFromFile(file) {
  return new Uint8Array(await file.arrayBuffer());
}

// --- File System Access API (Chrome/Edge) ---
export function isLiveFileSupported() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

export async function pickSaveFile(suggestedName = DEFAULT_FILE_NAME) {
  return window.showSaveFilePicker({ suggestedName, types: TALLIO_FILE_TYPES });
}

export async function pickOpenFile() {
  const [handle] = await window.showOpenFilePicker({ types: TALLIO_FILE_TYPES, multiple: false });
  return handle;
}

export async function writeHandle(handle, bytes) {
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

export async function readHandle(handle) {
  const file = await handle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

export async function ensurePermission(handle, mode = 'readwrite') {
  if (!handle || typeof handle.queryPermission !== 'function') return true;
  if ((await handle.queryPermission({ mode })) === 'granted') return true;
  return (await handle.requestPermission({ mode })) === 'granted';
}

// --- Handle persistence (IndexedDB; FileSystemFileHandle is structured-cloneable) ---
const HANDLE_DB = 'tallio-file';
const HANDLE_STORE = 'handles';
const HANDLE_KEY = 'current';

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(HANDLE_STORE)) req.result.createObjectStore(HANDLE_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(HANDLE_STORE, mode);
    const out = fn(t.objectStore(HANDLE_STORE));
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
  });
}

export async function saveHandle(handle) {
  const db = await openHandleDb();
  try { await tx(db, 'readwrite', s => s.put(handle, HANDLE_KEY)); } finally { db.close(); }
}

export async function loadHandle() {
  const db = await openHandleDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(HANDLE_STORE, 'readonly').objectStore(HANDLE_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

export async function clearHandle() {
  const db = await openHandleDb();
  try { await tx(db, 'readwrite', s => s.delete(HANDLE_KEY)); } finally { db.close(); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/fileStore.test.js`
Expected: PASS (all groups).

- [ ] **Step 5: Commit**

```bash
git add src/fileStore.js src/fileStore.test.js
git commit -m "feat(files): universal + File System Access adapter with handle persistence"
```

---

### Task 4: Universal Import/Restore + standardize Export to `.tallio`

Wire the universal backup loop into `App.jsx`: extract a shared archive builder, rename the export to `.tallio`, and add a "Restore from backup…" menu item that reads a file, confirms, restores to storage, and reloads.

**Files:**
- Create: `src/reloadApp.js` (injectable reload so the handler is testable)
- Test: `src/reloadApp.test.js`
- Modify: `src/App.jsx` (export fn ~423-454; drawer items ~543-547; add a hidden import `<input>` near the existing one ~725)

**Interfaces:**
- Consumes: `parseArchive` (exportArchive.js), `restoreArchiveToStorage` (Task 2), `readBytesFromFile`/`downloadArchive` (Task 3).
- Produces (App-internal): `buildCurrentArchiveBytes(): Promise<Uint8Array>`, `handleImportFile(file): Promise<void>`.
- Produces (module): `reloadApp(): void`.

- [ ] **Step 1: Write the failing test (reload shim)**

```js
// src/reloadApp.test.js
import { describe, it, expect } from 'vitest';
import { reloadApp } from './reloadApp.js';
describe('reloadApp', () => {
  it('is a callable function', () => { expect(typeof reloadApp).toBe('function'); });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/reloadApp.test.js`
Expected: FAIL — cannot resolve `./reloadApp.js`.

- [ ] **Step 3: Implement the reload shim**

```js
// src/reloadApp.js
// Single injectable seam for a full reload after a wholesale data restore, so the
// import handler can be tested without jsdom's unimplemented location.reload.
export function reloadApp() {
  if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
    window.location.reload();
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/reloadApp.test.js`
Expected: PASS.

- [ ] **Step 5: Refactor export into a shared builder in `App.jsx`**

Replace the body of `exportData` (App.jsx ~423-454). Add imports at the top (near the `buildArchive` import ~45):

```js
import { buildArchive, parseArchive } from './exportArchive.js';
import { restoreArchiveToStorage } from './archiveRestore.js';
import { downloadArchive, readBytesFromFile } from './fileStore.js';
import { reloadApp } from './reloadApp.js';
```

Add a shared builder and rewrite export + import handlers (place beside `exportData`):

```js
// Build the full archive bytes from current state (shared by Export + live-file autosave).
const buildCurrentArchiveBytes = async () => {
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
  let appearanceSettings = null;
  try { const raw = window.localStorage.getItem('tallio-appearance'); if (raw) appearanceSettings = JSON.parse(raw); }
  catch { /* ignore */ }
  return buildArchive({
    accounts: ledger.accounts, transactions: ledger.transactions,
    categories: cats.categories, accountTypes: accountTypes.types,
    reportAcks: acks.exportSnapshot(), templates: templates.exportSnapshot(),
    images, appearance: appearanceSettings,
    schemaVersion: 5, appVersion: pkg.version, now: new Date(),
  });
};

const exportData = async () => {
  const bytes = await buildCurrentArchiveBytes();
  downloadArchive(bytes, `Tallio-${new Date().toISOString().split('T')[0]}.tallio`);
};

const handleImportFile = async (file) => {
  if (!file) return;
  try {
    const bytes = await readBytesFromFile(file);
    const parsed = parseArchive(bytes);
    if (!window.confirm('Restore this backup? It replaces ALL current data on this device.')) return;
    await restoreArchiveToStorage(parsed);
    reloadApp();
  } catch (e) {
    window.alert(`Couldn't restore that file: ${e.message}`);
  }
};
```

- [ ] **Step 6: Add the hidden import input + menu item in `App.jsx`**

Add a ref near other refs: `const importInputRef = useRef(null);`

Add a hidden input beside the existing image input (~725):

```jsx
<input
  type="file" ref={importInputRef} accept=".tallio,.zip,application/zip"
  onChange={(e) => { handleImportFile(e.target.files?.[0]); e.target.value = ''; }}
  style={{ display: 'none' }}
/>
```

Add a drawer item after Export (~546):

```js
{ icon: '↙', label: 'Restore from backup', onSelect: () => importInputRef.current?.click() },
```

- [ ] **Step 7: Write the wiring test**

```js
// src/__smoke__/importExport.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import IconLibraryProvider from '../IconLibraryProvider.jsx';
import App from '../App.jsx';
import { buildArchive } from '../exportArchive.js';

vi.mock('../reloadApp.js', () => ({ reloadApp: vi.fn() }));
import { reloadApp } from '../reloadApp.js';

function renderApp() { return render(<IconLibraryProvider><App /></IconLibraryProvider>); }

describe('Restore from backup', () => {
  beforeEach(() => { localStorage.clear(); vi.spyOn(window, 'confirm').mockReturnValue(true); });

  it('imports an archive and reloads', async () => {
    const { container } = renderApp();
    const bytes = buildArchive({
      accounts: [{ id: 'a1', name: 'Imported Acct' }], transactions: [],
      categories: [], accountTypes: [], reportAcks: { subscriptions: {}, dismissedDuplicates: [] },
      templates: [], images: [], appearance: null,
      schemaVersion: 5, appVersion: '1', now: new Date('2026-01-01T00:00:00Z'),
    });
    const file = new File([bytes], 'backup.tallio');
    const input = container.querySelector('input[accept=".tallio,.zip,application/zip"]');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('tallio-accounts'))[0].name).toBe('Imported Acct');
      expect(reloadApp).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 8: Run the wiring test + full suite**

Run: `npx vitest run src/__smoke__/importExport.test.jsx`
Expected: PASS. Then `npm test` — all green.

- [ ] **Step 9: Commit**

```bash
git add src/reloadApp.js src/reloadApp.test.js src/App.jsx src/__smoke__/importExport.test.jsx
git commit -m "feat(backup): universal Restore-from-backup + .tallio export"
```

---

### Task 5: Live-file hook (`useLiveFile`)

React hook managing the linked-file lifecycle: link (save-as), open, unlink, debounced autosave, and reattach-on-mount. FSAA calls come from `fileStore` (mocked in tests).

**Files:**
- Create: `src/useLiveFile.js`
- Test: `src/useLiveFile.test.jsx`

**Interfaces:**
- Consumes: `fileStore` (Task 3), a `getBytes: () => Promise<Uint8Array>` and `applyBytes: (bytes) => Promise<void>` supplied by the caller.
- Produces hook return: `{ supported, status: 'unlinked'|'linked', fileName, lastSavedAt, linkNewFile(), openFile(), unlink(), scheduleSave() }`.
- Autosave debounce: 1500 ms (a `SAVE_DEBOUNCE_MS` export).

- [ ] **Step 1: Write the failing test**

```js
// src/useLiveFile.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('./fileStore.js', () => ({
  isLiveFileSupported: vi.fn(() => true),
  pickSaveFile: vi.fn(), pickOpenFile: vi.fn(),
  readHandle: vi.fn(), writeHandle: vi.fn().mockResolvedValue(),
  ensurePermission: vi.fn().mockResolvedValue(true),
  saveHandle: vi.fn().mockResolvedValue(), loadHandle: vi.fn().mockResolvedValue(null), clearHandle: vi.fn().mockResolvedValue(),
}));
import * as fileStore from './fileStore.js';
import useLiveFile, { SAVE_DEBOUNCE_MS } from './useLiveFile.js';

const getBytes = vi.fn().mockResolvedValue(new Uint8Array([1]));
const applyBytes = vi.fn().mockResolvedValue();
function setup() { return renderHook(() => useLiveFile({ getBytes, applyBytes })); }

beforeEach(() => { vi.clearAllMocks(); fileStore.isLiveFileSupported.mockReturnValue(true); fileStore.loadHandle.mockResolvedValue(null); });
afterEach(() => vi.useRealTimers());

describe('useLiveFile', () => {
  it('starts unlinked and supported', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('unlinked'));
    expect(result.current.supported).toBe(true);
  });

  it('linkNewFile picks a file, writes current bytes, and links', async () => {
    fileStore.pickSaveFile.mockResolvedValue({ name: 'MyBudget.tallio' });
    const { result } = setup();
    await act(async () => { await result.current.linkNewFile(); });
    expect(fileStore.writeHandle).toHaveBeenCalled();
    expect(fileStore.saveHandle).toHaveBeenCalled();
    expect(result.current.status).toBe('linked');
    expect(result.current.fileName).toBe('MyBudget.tallio');
  });

  it('scheduleSave debounces writes to the handle', async () => {
    vi.useFakeTimers();
    fileStore.pickSaveFile.mockResolvedValue({ name: 'B.tallio' });
    const { result } = setup();
    await act(async () => { await result.current.linkNewFile(); });
    fileStore.writeHandle.mockClear();
    act(() => { result.current.scheduleSave(); result.current.scheduleSave(); result.current.scheduleSave(); });
    expect(fileStore.writeHandle).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10); });
    expect(fileStore.writeHandle).toHaveBeenCalledTimes(1);
  });

  it('reattaches a persisted handle on mount without importing', async () => {
    fileStore.loadHandle.mockResolvedValue({ name: 'Saved.tallio' });
    const { result } = setup();
    await waitFor(() => expect(result.current.status).toBe('linked'));
    expect(applyBytes).not.toHaveBeenCalled();
    expect(result.current.fileName).toBe('Saved.tallio');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/useLiveFile.test.jsx`
Expected: FAIL — cannot resolve `./useLiveFile.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/useLiveFile.js
// Manage a linked .tallio file (Chrome/Edge): link (save-as), open, unlink,
// debounced autosave, and silent reattach on mount. Browser storage stays the
// working store; the file is an auto-synced mirror.
import { useState, useEffect, useRef, useCallback } from 'react';
import * as fileStore from './fileStore.js';

export const SAVE_DEBOUNCE_MS = 1500;

export default function useLiveFile({ getBytes, applyBytes }) {
  const supported = fileStore.isLiveFileSupported();
  const [handle, setHandle] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const timerRef = useRef(null);
  const handleRef = useRef(null);
  handleRef.current = handle;

  // Reattach a previously linked file on mount (no import — storage is source of truth).
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      const saved = await fileStore.loadHandle();
      if (cancelled || !saved) return;
      if (await fileStore.ensurePermission(saved)) { setHandle(saved); setFileName(saved.name); }
    })();
    return () => { cancelled = true; };
  }, [supported]);

  const saveNow = useCallback(async () => {
    const h = handleRef.current;
    if (!h) return;
    await fileStore.writeHandle(h, await getBytes());
    setLastSavedAt(Date.now());
  }, [getBytes]);

  const scheduleSave = useCallback(() => {
    if (!handleRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { saveNow(); }, SAVE_DEBOUNCE_MS);
  }, [saveNow]);

  const linkNewFile = useCallback(async () => {
    const h = await fileStore.pickSaveFile();
    await fileStore.writeHandle(h, await getBytes());
    await fileStore.saveHandle(h);
    setHandle(h); setFileName(h.name); setLastSavedAt(Date.now());
  }, [getBytes]);

  const openFile = useCallback(async () => {
    const h = await fileStore.pickOpenFile();
    if (!(await fileStore.ensurePermission(h))) return;
    const bytes = await fileStore.readHandle(h);
    await fileStore.saveHandle(h);
    await applyBytes(bytes); // caller restores + reloads
  }, [applyBytes]);

  const unlink = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await fileStore.clearHandle();
    setHandle(null); setFileName(null); setLastSavedAt(null);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return {
    supported,
    status: handle ? 'linked' : 'unlinked',
    fileName, lastSavedAt,
    linkNewFile, openFile, unlink, scheduleSave,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/useLiveFile.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/useLiveFile.js src/useLiveFile.test.jsx
git commit -m "feat(files): useLiveFile hook — link/open/unlink + debounced autosave"
```

---

### Task 6: Wire the live file into `App.jsx` + status pill

Add the Chrome/Edge menu actions and a status pill, and trigger `scheduleSave()` whenever the ledger changes. Everything is hidden when `supported` is false.

**Files:**
- Modify: `src/App.jsx` (imports; hook init; drawer items; an effect; render a status pill)
- Create: `src/LiveFilePill.jsx`
- Test: `src/LiveFilePill.test.jsx`

**Interfaces:**
- Consumes: `useLiveFile` (Task 5), `buildCurrentArchiveBytes`/`handleImportFile` (Task 4).
- Produces: `<LiveFilePill status fileName lastSavedAt />`.

- [ ] **Step 1: Write the failing test (pill)**

```jsx
// src/LiveFilePill.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LiveFilePill from './LiveFilePill.jsx';

describe('LiveFilePill', () => {
  it('shows the linked file name', () => {
    render(<LiveFilePill status="linked" fileName="MyBudget.tallio" lastSavedAt={Date.now()} />);
    expect(screen.getByText(/MyBudget\.tallio/)).toBeTruthy();
  });
  it('shows an unlinked hint', () => {
    render(<LiveFilePill status="unlinked" fileName={null} lastSavedAt={null} />);
    expect(screen.getByText(/browser storage/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/LiveFilePill.test.jsx`
Expected: FAIL — cannot resolve `./LiveFilePill.jsx`.

- [ ] **Step 3: Implement the pill**

```jsx
// src/LiveFilePill.jsx
// Small status indicator for the linked live file.
export default function LiveFilePill({ status, fileName, lastSavedAt }) {
  if (status === 'linked') {
    return (
      <span className="live-file-pill live-file-pill--linked" title={fileName}>
        ● Linked to {fileName}{lastSavedAt ? ' · saved' : ''}
      </span>
    );
  }
  return <span className="live-file-pill">○ Not linked · using browser storage</span>;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/LiveFilePill.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into `App.jsx`**

Add imports:

```js
import useLiveFile from './useLiveFile.js';
import LiveFilePill from './LiveFilePill.jsx';
```

Initialize the hook after `handleImportFile`/`buildCurrentArchiveBytes` are defined:

```js
const liveFile = useLiveFile({
  getBytes: buildCurrentArchiveBytes,
  applyBytes: async (bytes) => { await restoreArchiveToStorage(parseArchive(bytes)); reloadApp(); },
});
```

Autosave when the ledger changes:

```js
useEffect(() => {
  if (liveFile.status === 'linked') liveFile.scheduleSave();
}, [ledger.accounts, ledger.transactions]); // eslint-disable-line react-hooks/exhaustive-deps
```

Add drawer items (after "Restore from backup"), gated on support:

```js
...(liveFile.supported ? [
  { icon: '🔗', label: liveFile.status === 'linked' ? 'Save to a different file' : 'Save to a budget file', onSelect: () => liveFile.linkNewFile() },
  { icon: '📂', label: 'Open a budget file', onSelect: () => liveFile.openFile() },
  ...(liveFile.status === 'linked' ? [{ icon: '⛓', label: 'Unlink file', onSelect: () => liveFile.unlink() }] : []),
] : []),
```

Render the pill inside the drawer (pass to `AvatarDrawer` or render near the version line). Add to the `AvatarDrawer` usage:

```jsx
statusSlot={liveFile.supported ? <LiveFilePill status={liveFile.status} fileName={liveFile.fileName} lastSavedAt={liveFile.lastSavedAt} /> : null}
```

(If `AvatarDrawer` has no slot prop, add a `statusSlot` prop that renders above `items`; keep it a one-line addition.)

- [ ] **Step 6: Add minimal pill styles**

In `src/App.css`, append:

```css
.live-file-pill { display:inline-flex; align-items:center; gap:.35em; font-size:.75rem; opacity:.8; padding:.15em .5em; border-radius:999px; }
.live-file-pill--linked { color: var(--good, #2e7d32); }
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all green (existing AvatarDrawer test still passes; if it snapshots items, update it for the new prop).

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/App.css src/LiveFilePill.jsx src/LiveFilePill.test.jsx
git commit -m "feat(files): linked live-file menu actions + status pill (Chrome/Edge)"
```

---

### Task 7: Request persistent storage + storage-health line

Call `requestPersistentStorage()` on mount and show a small health line (persisted? usage) in the Settings panel.

**Files:**
- Modify: `src/App.jsx` (mount effect)
- Modify: `src/SettingsPanel.jsx` (add a health line) — confirm exact filename first (`SettingsPanel.test.jsx` exists)
- Test: extend `src/SettingsPanel.test.jsx`

**Interfaces:**
- Consumes: `requestPersistentStorage`, `getStorageEstimate` (Task 1).

- [ ] **Step 1: Add the mount effect in `App.jsx`**

```js
import { requestPersistentStorage } from './storagePersist.js';
// ...inside the component, with other effects:
useEffect(() => { requestPersistentStorage(); }, []);
```

- [ ] **Step 2: Write the failing test for the health line**

```jsx
// add to src/SettingsPanel.test.jsx
import { vi } from 'vitest';
vi.mock('./storagePersist.js', () => ({
  requestPersistentStorage: vi.fn().mockResolvedValue({ supported: true, persisted: true }),
  getStorageEstimate: vi.fn().mockResolvedValue({ supported: true, usage: 5 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
}));

it('shows a storage-health line', async () => {
  // render SettingsPanel per this file's existing render helper
  // expect text matching /storage/i and a persisted indicator to appear
});
```

Flesh out the render using the file's existing pattern; assert `await screen.findByText(/protected|persisted/i)` and a usage figure like `/5(\.0)? ?MB/`.

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/SettingsPanel.test.jsx`
Expected: FAIL — no storage-health text yet.

- [ ] **Step 4: Add the health line to `SettingsPanel.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { getStorageEstimate } from './storagePersist.js';

function StorageHealth() {
  const [info, setInfo] = useState(null);
  useEffect(() => { getStorageEstimate().then(setInfo); }, []);
  if (!info || !info.supported) return null;
  const mb = n => `${(n / 1024 / 1024).toFixed(1)} MB`;
  return (
    <p className="settings-storage-health">
      Data lives only on this device. Using {mb(info.usage)} of {mb(info.quota)}.
    </p>
  );
}
```

Render `<StorageHealth />` in the panel body.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/SettingsPanel.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/SettingsPanel.jsx src/SettingsPanel.test.jsx
git commit -m "feat(storage): request persistence on load + storage-health line"
```

---

### Task 8: PWA — plugin, manifest, icons, service worker

Make Tallio installable and offline via `vite-plugin-pwa`.

**Files:**
- Modify: `package.json` (dev dep), `vite.config.js` (plugin), `src/main.jsx` (register)
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`, `public/apple-touch-icon.png`

- [ ] **Step 1: Install the plugin**

Run: `npm install -D vite-plugin-pwa`
Expected: added to devDependencies.

- [ ] **Step 2: Add app icons**

Create the four PNGs in `public/icons/` (192, 512, maskable 512 with safe padding, 180 apple-touch). Use the Tallio mark; solid background for the maskable one.

- [ ] **Step 3: Configure the plugin in `vite.config.js`**

```js
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'apple-touch-icon.png', 'fonts/**/*'],
      manifest: {
        name: 'Tallio', short_name: 'Tallio',
        description: 'Personal finance tracker — your data stays on your device.',
        start_url: '/', scope: '/', display: 'standalone',
        background_color: '#12100e', theme_color: '#12100e',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,png,svg}'], navigateFallback: '/index.html' },
    }),
  ],
  // ...existing server/test config unchanged
})
```

- [ ] **Step 4: Register the service worker in `main.jsx`**

```js
import { registerSW } from 'virtual:pwa-register'
if (import.meta.env.PROD) registerSW({ immediate: true })
```

- [ ] **Step 5: Verify tests still pass**

Run: `npm test`
Expected: all green (the virtual module is PROD-gated, so jsdom/test is unaffected).

- [ ] **Step 6: Verify the build emits PWA assets**

Run: `npm run build`
Expected: `dist/manifest.webmanifest`, `dist/sw.js`, and `dist/workbox-*.js` exist.
Then: `npm run preview`, open the URL, confirm the browser offers "Install", and DevTools → Application → Service Workers shows an active worker.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.js src/main.jsx public/icons public/apple-touch-icon.png
git commit -m "feat(pwa): installable + offline via vite-plugin-pwa, manifest, icons"
```

---

### Task 9: Self-host fonts (offline + privacy)

Remove the Google Fonts CDN and bundle fonts via Fontsource so the app is fully offline and leaks no visitor IPs.

**Files:**
- Modify: `package.json` (font deps), `src/index.css` (imports), `index.html` (remove CDN links)
- Create: `src/fonts.test.js` (regression guard)

- [ ] **Step 1: Write the failing regression test**

```js
// src/fonts.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('offline fonts', () => {
  it('index.html does not reference the Google Fonts CDN', () => {
    const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
    expect(html).not.toMatch(/fonts\.googleapis\.com/);
    expect(html).not.toMatch(/fonts\.gstatic\.com/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/fonts.test.js`
Expected: FAIL — the CDN links are still present.

- [ ] **Step 3: Install Fontsource packages**

Run: `npm install @fontsource-variable/fraunces @fontsource-variable/geist @fontsource-variable/geist-mono @fontsource/ibm-plex-mono`
Expected: added to dependencies. (If a package name 404s, check the exact Fontsource id on npm and adjust — the four families are Fraunces, Geist, Geist Mono, IBM Plex Mono.)

- [ ] **Step 4: Import fonts in `src/index.css`** (top of file)

```css
@import '@fontsource-variable/fraunces';
@import '@fontsource-variable/geist';
@import '@fontsource-variable/geist-mono';
@import '@fontsource/ibm-plex-mono/400.css';
@import '@fontsource/ibm-plex-mono/500.css';
@import '@fontsource/ibm-plex-mono/600.css';
```

- [ ] **Step 5: Remove the CDN links from `index.html`**

Delete the three `<link>` tags (`preconnect` ×2 and the `fonts.googleapis.com/css2…` stylesheet).

- [ ] **Step 6: Run the guard + full suite**

Run: `npx vitest run src/fonts.test.js` → PASS. Then `npm test` → all green.

- [ ] **Step 7: Verify visually**

Run: `npm run dev`, confirm headings (Fraunces) and mono figures still render correctly; then DevTools → Network, reload, confirm no request to `fonts.googleapis.com`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/index.css index.html src/fonts.test.js
git commit -m "feat(pwa): self-host fonts via Fontsource (offline + no CDN IP leak)"
```

---

### Task 10: Deploy config + docs (Cloudflare Pages + custom domain)

Add SPA-hosting config and a deploy runbook. No backend.

**Files:**
- Create: `public/_redirects` (SPA fallback), `docs/DEPLOY.md`

- [ ] **Step 1: Add SPA fallback for the static host**

```
# public/_redirects  (Cloudflare Pages / Netlify)
/*    /index.html   200
```

- [ ] **Step 2: Write `docs/DEPLOY.md`**

Document: build command `npm run build`, output dir `dist`, deploy to Cloudflare Pages (connect the Git repo, or `npx wrangler pages deploy dist`), then attach the custom domain in the Pages dashboard and point DNS. State plainly: **static hosting only — no server ever receives user data.** Include a note that HTTPS is required for PWA install, File System Access, and `storage.persist`, and that Pages provides it automatically. Add a privacy blurb to reuse in-app: "Tallio stores all your data on this device only; nothing is uploaded."

- [ ] **Step 3: Verify a production build serves cleanly**

Run: `npm run build && npm run preview`
Expected: app loads at the preview URL; refresh on a deep view still resolves (SPA fallback); DevTools shows the service worker active and no external font/data requests.

- [ ] **Step 4: Commit**

```bash
git add public/_redirects docs/DEPLOY.md
git commit -m "chore(deploy): SPA fallback + Cloudflare Pages deploy runbook"
```

- [ ] **Step 5: Final full-suite gate**

Run: `npm test`
Expected: all green. Manual acceptance pass: install PWA + load offline; on Chrome link a file → edit → confirm autosave → reopen; on Safari/Firefox confirm Export + Restore work and the live-file items are absent.

---

## Self-Review

**Spec coverage:**
- §1 PWA/installability → Task 8. Self-host fonts → Task 9. ✓
- §2 persistent storage + health → Tasks 1, 7. ✓
- §3 universal export (.tallio) + import/restore → Task 4 (+ Task 2 core). ✓
- §4 Chromium live file (link/open/unlink, autosave, reattach, status pill, cadence, feature-gate) → Tasks 3, 5, 6. ✓
- §5 deploy + custom domain → Task 10. ✓
- §File format `.tallio`/schema 5 → Tasks 2, 3, 4. ✓
- §Testing (import round-trip, adapter mocks, jsdom-safe, suite green) → every task's tests + final gate. ✓
- §Risks (eviction, images cadence, FSAA-only, fonts offline) → Tasks 1/7, 5, 3/6, 9. ✓

**Placeholder scan:** Task 7's SettingsPanel test is intentionally described against "this file's existing render helper" because the panel's test harness is file-specific; the assertions and component code are concrete. No `TBD`/`TODO` in code steps.

**Type consistency:** `restoreArchiveToStorage(parsed, {storage, imageStore})`, `buildCurrentArchiveBytes()`, `handleImportFile(file)`, `reloadApp()`, and the `useLiveFile` return shape (`supported/status/fileName/lastSavedAt/linkNewFile/openFile/unlink/scheduleSave`) are used identically across Tasks 2, 4, 5, 6. Image records use `{blob, thumb}` to match `imageStore` record shape. ✓

**Note for executor:** Task 6 references an `AvatarDrawer` `statusSlot` prop; confirm the component's props and add a one-line slot if absent (its test may need updating for the new prop).
