# Phone Batch-Photo Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pair their phone and send many photos at once straight into the Tallio image library, so they become available as backgrounds and image-icons.

**Architecture:** A *second destination* on the existing PeerJS pairing transport. A new pure `batchProtocol.js` (built on `peerProtocol.js`) frames a multi-photo batch with per-photo acks; the phone gains a gallery multi-select + review-tray UI and a `sendBatch`; the desktop gains a library-mode receive path that commits each completed photo through the *same* `processImageFile` → `putRecord` pipeline as a file upload, into a desktop-chosen group, as one undo step. The "scan a bill" OCR flow is left unchanged.

**Tech Stack:** React, Vite, PeerJS (`^1.5.5`), IndexedDB (`imageStore`), Vitest + @testing-library/react (jsdom), `nanoid`, `qrcode.react`.

---

## Conventions (apply to every task)

- **One file test:** `npx vitest run src/<File>.test.jsx` · **Full:** `npx vitest run` · **Lint:** `npx eslint <files>` (0 new errors).
- Component tests: `import { cleanup }` + `afterEach(() => cleanup())`. **No jest-dom** — use `.toBeTruthy()`, `getAttribute(...)`, `container.querySelector(...)`, `.textContent`.
- jsdom has **no canvas/IndexedDB** and `URL.createObjectURL` **throws** — keep protocol + pixel math pure and unit-tested; verify canvas/peer bits manually via `npm run dev`. Steps marked **MANUAL-VERIFY** have no automated test by design (mirrors `processImageFile`/peer hooks already in the repo).
- Watch the `react-hooks/set-state-in-effect` ERROR rule.
- Commit per task with trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Push to `phone-batch-upload` after each commit.
- A failed/partial transfer must **never corrupt the library**: a record is written only on full `img-end` *and* successful processing.

## File Structure

**Create:**
- `src/batchProtocol.js` — pure batch framing: `makeBatchStart`, `makeImageAck`, `createBatchReceiver`, `createBatchSender`. Built on `peerProtocol.js`.
- `src/batchProtocol.test.js` — unit tests for the above.
- `src/pairLink.js` — pure `parsePairHash(hash)` → `{ sessionId, mode }` and `buildPairUrl(origin, sessionId, mode)`.
- `src/pairLink.test.js` — unit tests.
- `src/PhotoTray.jsx` — presentational review tray (thumbnails, per-photo progress, Send/Retry/Clear). No object-URLs, no peer — props only.
- `src/PhotoTray.test.jsx` — component tests.
- `src/PhonePhotoUpload.jsx` — phone library-mode page: file multi-select + downscale + `usePhonePeer.sendBatch` → `PhotoTray`. MANUAL-VERIFY wiring.
- `src/PhotoUploadPanel.jsx` — desktop library-mode pairing modal: QR + group selector + batch progress + done summary. Prop-driven (`peer`).
- `src/PhotoUploadPanel.test.jsx` — component tests (fake peer).

**Modify:**
- `src/peerProtocol.js` — `makeImageChunks(bytes, mime, extra = {})` merges `extra` into the `img-start` frame.
- `src/peerProtocol.test.js` — add extra-passthrough tests.
- `src/imageProcess.js` — add `downscaleImageFile(file, opts)` (canvas, MANUAL-VERIFY; reuses `fitWithin`).
- `src/usePhonePeer.js` — add inbound `img-ack` handling + `sendBatch(items, { onProgress, onAck })`. Leaves `sendImage` intact.
- `src/useDesktopPeer.js` — `start(mode = 'scan')`; library-mode `handleData` routing through `createBatchReceiver`; `onLibraryImage` opt + per-photo ack send; expose `batch` state.
- `src/App.jsx` — phone dispatcher (route `m=lib` → `PhonePhotoUpload`); `pairingMode`/`pairingGroup` state; `onLibraryImage` commit; batch-as-one-undo via `batchKeyRef`; render `PhotoUploadPanel`; pass `onAddFromPhone` down.
- `src/AppearanceScreen.jsx` — thread `onAddFromPhone` to `ImageIconsTab`.
- `src/ImageIconsTab.jsx` — add the "📱 Add photos from phone" toolbar button.
- `src/App.css` — styles for the tray + panel (MANUAL-VERIFY).

---

## Task 1: `makeImageChunks` carries extra `img-start` fields

**Files:**
- Modify: `src/peerProtocol.js:27-43`
- Test: `src/peerProtocol.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `src/peerProtocol.test.js` inside the existing `describe('makeImageChunks', ...)` block:

```js
  it('merges extra fields into the img-start frame', () => {
    const bytes = new Uint8Array(10);
    const result = makeImageChunks(bytes, 'image/png', { batchId: 'b1', index: 2, name: 'cat.png' });
    expect(result.start.batchId).toBe('b1');
    expect(result.start.index).toBe(2);
    expect(result.start.name).toBe('cat.png');
    expect(result.start.mime).toBe('image/png');
    expect(result.start.t).toBe('img-start');
  });

  it('omits extra fields when none are given (OCR path unchanged)', () => {
    const result = makeImageChunks(new Uint8Array(10), 'image/jpeg');
    expect(result.start.batchId).toBeUndefined();
    expect(result.start.index).toBeUndefined();
    expect(Object.keys(result.start).sort()).toEqual(['chunks', 'id', 'mime', 'size', 't'].sort());
  });

  it('uses extra.id as the shared frame id when provided (no random mint)', () => {
    const result = makeImageChunks(new Uint8Array(CHUNK_SIZE + 1), 'image/jpeg', { id: 'fixed-id', index: 1 });
    expect(result.start.id).toBe('fixed-id');
    expect(result.chunks.every(c => c.id === 'fixed-id')).toBe(true);
    expect(result.end.id).toBe('fixed-id');
    expect(result.start.index).toBe(1);
    expect(result.start).not.toHaveProperty('id', undefined);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/peerProtocol.test.js`
Expected: FAIL — `result.start.batchId` is `undefined` in the first new test.

- [ ] **Step 3: Implement**

In `src/peerProtocol.js`, change the signature and the `start` object:

```js
export function makeImageChunks(bytes, mime, extra = {}) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // extra.id (when given) becomes the shared frame id so a caller can key the
  // image on its own stable id; otherwise mint one. The remaining extra fields
  // (batchId/index/name) merge into the img-start frame only.
  const { id: overrideId, ...rest } = extra;
  const id = overrideId || crypto.randomUUID();
  const size = buffer.byteLength;
  const chunks = Math.max(1, Math.ceil(size / CHUNK_SIZE));
  const slices = [];
  for (let i = 0; i < chunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, size);
    slices.push(buffer.slice(start, end));
  }
  return {
    start: { t: 'img-start', id, mime, size, chunks, ...rest },
    chunks: slices.map((data, i) => ({ t: 'img-chunk', id, i, data })),
    end: { t: 'img-end', id },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/peerProtocol.test.js`
Expected: PASS (all, including the originals).

- [ ] **Step 5: Commit**

```bash
git add src/peerProtocol.js src/peerProtocol.test.js
git commit -m "feat(photos): makeImageChunks merges extra img-start fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `batchProtocol.js` — pure receiver + sender

**Files:**
- Create: `src/batchProtocol.js`
- Test: `src/batchProtocol.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/batchProtocol.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { makeImageChunks, CHUNK_SIZE } from './peerProtocol.js';
import {
  makeBatchStart, makeImageAck, createBatchReceiver, createBatchSender,
} from './batchProtocol.js';

function feedImage(receiver, bytes, { batchId, index, name, mime = 'image/jpeg' }) {
  const { start, chunks, end } = makeImageChunks(bytes, mime, { batchId, index, name });
  receiver.onMessage(start);
  let last = null;
  for (const c of chunks) last = receiver.onMessage(c);
  const done = receiver.onMessage(end);
  return { id: start.id, lastProgress: last, done };
}

describe('makeBatchStart / makeImageAck', () => {
  it('builds a batch-start frame', () => {
    expect(makeBatchStart('b1', 3)).toEqual({ t: 'batch-start', batchId: 'b1', count: 3 });
  });
  it('builds an img-ack frame with coerced boolean', () => {
    expect(makeImageAck('b1', 'id1', 0, 1)).toEqual({ t: 'img-ack', batchId: 'b1', id: 'id1', index: 0, ok: true });
  });
});

// Re-send the same image (same id) — models a phone retry after a lost/failed ack.
function resendImage(receiver, bytes, id, mime = 'image/jpeg') {
  const { start, chunks, end } = makeImageChunks(bytes, mime, { id });
  receiver.onMessage(start);
  for (const c of chunks) receiver.onMessage(c);
  return receiver.onMessage(end);
}

describe('createBatchReceiver', () => {
  it('reports the batch count from batch-start', () => {
    const r = createBatchReceiver();
    expect(r.onMessage(makeBatchStart('b1', 4))).toEqual({ type: 'batch-start', count: 4 });
    expect(r.count()).toBe(4);
  });

  it('emits image-complete with metadata and original bytes (no overall on the event)', () => {
    const r = createBatchReceiver();
    r.onMessage(makeBatchStart('b1', 1));
    const bytes = new Uint8Array(CHUNK_SIZE + 7).map((_, i) => i % 256);
    const { done } = feedImage(r, bytes, { batchId: 'b1', index: 0, name: 'a.jpg' });
    expect(done.type).toBe('image-complete');
    expect(done.index).toBe(0);
    expect(done.name).toBe('a.jpg');
    expect(done.mime).toBe('image/jpeg');
    expect(done.bytes).toBeInstanceOf(Uint8Array);
    expect(done.bytes.length).toBe(bytes.length);
    expect(Array.from(done.bytes)).toEqual(Array.from(bytes));
  });

  it('counts an image as committed only after markCommitted', () => {
    const r = createBatchReceiver();
    r.onMessage(makeBatchStart('b1', 2));
    const { id } = feedImage(r, new Uint8Array(10), { batchId: 'b1', index: 0, name: 'a' });
    expect(r.committedCount()).toBe(0);
    r.markCommitted(id);
    expect(r.committedCount()).toBe(1);
  });

  it('reports a DUPLICATE only for an id that was already committed (lost-ack retry)', () => {
    const r = createBatchReceiver();
    r.onMessage(makeBatchStart('b1', 1));
    const bytes = new Uint8Array(20).map((_, i) => i);
    const { id } = feedImage(r, bytes, { batchId: 'b1', index: 0, name: 'a' });
    r.markCommitted(id); // commit succeeded; the ack was then lost
    const ev = resendImage(r, bytes, id);
    expect(ev.type).toBe('duplicate');
    expect(ev.id).toBe(id);
    expect(r.committedCount()).toBe(1); // not double-counted
  });

  it('RE-EMITS image-complete for an uncommitted (nacked) id on retry — no silent loss', () => {
    const r = createBatchReceiver();
    r.onMessage(makeBatchStart('b1', 1));
    const bytes = new Uint8Array(25).map((_, i) => i);
    const { id } = feedImage(r, bytes, { batchId: 'b1', index: 0, name: 'a' });
    // Commit FAILED → markCommitted was never called. Phone retries the same id.
    const ev = resendImage(r, bytes, id);
    expect(ev.type).toBe('image-complete');
    expect(Array.from(ev.bytes)).toEqual(Array.from(bytes));
  });

  it('drops a corrupt image without affecting other images', () => {
    const r = createBatchReceiver();
    r.onMessage(makeBatchStart('b1', 2));
    // Corrupt image: start says size 100 but a chunk is out of range.
    r.onMessage({ t: 'img-start', id: 'bad', size: 100, chunks: 1, batchId: 'b1', index: 0, name: 'bad' });
    r.onMessage({ t: 'img-chunk', id: 'bad', i: 99, data: new Uint8Array(10) });
    const badEnd = r.onMessage({ t: 'img-end', id: 'bad' });
    expect(badEnd).toBeNull();
    // Good image still completes.
    const { done, id } = feedImage(r, new Uint8Array(30), { batchId: 'b1', index: 1, name: 'good' });
    expect(done.type).toBe('image-complete');
    r.markCommitted(id);
    expect(r.committedCount()).toBe(1);
  });

  it('ignores unknown messages', () => {
    const r = createBatchReceiver();
    expect(r.onMessage({ t: 'nonsense' })).toBeNull();
    expect(r.onMessage(null)).toBeNull();
  });
});

describe('createBatchSender', () => {
  const items = [{ id: 'a', mime: 'image/jpeg', name: 'a' }, { id: 'b', mime: 'image/jpeg', name: 'b' }];

  it('starts with all items pending', () => {
    const s = createBatchSender(items);
    expect(s.pending()).toEqual(['a', 'b']);
    expect(s.failed()).toEqual([]);
    expect(s.allSettled()).toBe(false);
  });

  it('marks items done or failed from acks', () => {
    const s = createBatchSender(items);
    s.onAck({ id: 'a', ok: true });
    s.onAck({ id: 'b', ok: false });
    expect(s.pending()).toEqual([]);
    expect(s.failed()).toEqual(['b']);
    expect(s.allSettled()).toBe(true);
  });

  it('markFailed only affects still-pending items', () => {
    const s = createBatchSender(items);
    s.onAck({ id: 'a', ok: true });
    s.markFailed('a'); // already done — no-op
    s.markFailed('b');
    expect(s.failed()).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/batchProtocol.test.js`
Expected: FAIL — `Failed to resolve import './batchProtocol.js'`.

- [ ] **Step 3: Implement**

Create `src/batchProtocol.js`:

```js
// src/batchProtocol.js
// Pure multi-photo batch framing on top of peerProtocol's per-image chunking.
// No canvas, no IndexedDB, no React — operates on raw bytes + message objects so
// it is fully unit-testable (the model is peerProtocol.test.js). Committing and
// ack-sending live in the impure peer hooks, not here.
import { createReassembler } from './peerProtocol.js';

export function makeBatchStart(batchId, count) {
  return { t: 'batch-start', batchId, count };
}

export function makeImageAck(batchId, id, index, ok) {
  return { t: 'img-ack', batchId, id, index, ok: !!ok };
}

// Desktop side. Feed it every inbound message; it returns one event or null.
// Events: { type:'batch-start', count } | { type:'img-start', id, index }
//       | { type:'progress', id, index, photoProgress }
//       | { type:'image-complete', id, index, name, mime, bytes }
//       | { type:'duplicate', id, index }
//
// Dedup is keyed on a CONFIRMED COMMIT, not on reassembly: the glue must call
// markCommitted(id) only after the photo is safely in the library. An id that
// reassembled but was NOT committed (a nacked photo) re-emits image-complete on
// retry, so a failed commit is never silently treated as done. Overall progress
// is the glue's concern (it knows committed vs. failed), so it is not tracked here.
export function createBatchReceiver() {
  const reassembler = createReassembler();
  const meta = new Map();        // id -> { index, name, mime }
  const committed = new Set();   // ids the glue confirmed are in the library
  let count = 0;

  return {
    onMessage(msg) {
      if (!msg || !msg.t) return null;
      if (msg.t === 'batch-start') {
        count = msg.count;
        return { type: 'batch-start', count };
      }
      if (msg.t === 'img-start') {
        meta.set(msg.id, { index: msg.index, name: msg.name, mime: msg.mime || 'image/jpeg' });
        reassembler.onStart(msg);
        return { type: 'img-start', id: msg.id, index: msg.index };
      }
      if (msg.t === 'img-chunk') {
        const u = reassembler.onChunk(msg);
        if (!u) return null;
        const m = meta.get(msg.id) || {};
        return { type: 'progress', id: msg.id, index: m.index, photoProgress: u.progress };
      }
      if (msg.t === 'img-end') {
        const m = meta.get(msg.id) || {};
        if (committed.has(msg.id)) {
          reassembler.drop(msg.id); // clear any re-sent buffer; do not re-deliver
          return { type: 'duplicate', id: msg.id, index: m.index };
        }
        const bytes = reassembler.onEnd(msg);
        if (!bytes) return null; // corrupt/unknown — dropped, other images unaffected
        return { type: 'image-complete', id: msg.id, index: m.index, name: m.name, mime: m.mime || 'image/jpeg', bytes };
      }
      return null;
    },
    markCommitted(id) { committed.add(id); },
    count: () => count,
    committedCount: () => committed.size,
  };
}

// Phone side. Pure status tracker; the hook owns the raw bytes + chunking and
// reports acks here. Retry = a fresh sender over failed() ids, reusing the same
// per-photo ids so the desktop dedups correctly.
export function createBatchSender(items) {
  const order = items.map(it => it.id);
  const status = new Map(order.map(id => [id, 'pending'])); // pending|done|failed
  return {
    pending: () => order.filter(id => status.get(id) === 'pending'),
    failed: () => order.filter(id => status.get(id) === 'failed'),
    onAck: ({ id, ok }) => { if (status.has(id)) status.set(id, ok ? 'done' : 'failed'); },
    markFailed: (id) => { if (status.get(id) === 'pending') status.set(id, 'failed'); },
    allSettled: () => order.every(id => status.get(id) !== 'pending'),
    statusOf: (id) => status.get(id),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/batchProtocol.test.js`
Expected: PASS (all describes).

- [ ] **Step 5: Lint + commit**

```bash
npx eslint src/batchProtocol.js src/batchProtocol.test.js
git add src/batchProtocol.js src/batchProtocol.test.js
git commit -m "feat(photos): batchProtocol receiver + sender (pure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `pairLink.js` — pure hash parse + URL build

**Files:**
- Create: `src/pairLink.js`
- Test: `src/pairLink.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/pairLink.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parsePairHash, buildPairUrl } from './pairLink.js';

describe('parsePairHash', () => {
  it('parses a scan link (no mode) → mode scan', () => {
    expect(parsePairHash('#s=abc-123')).toEqual({ sessionId: 'abc-123', mode: 'scan' });
  });
  it('parses a library link with m=lib', () => {
    expect(parsePairHash('#s=abc-123&m=lib')).toEqual({ sessionId: 'abc-123', mode: 'library' });
  });
  it('tolerates reversed param order', () => {
    expect(parsePairHash('#m=lib&s=xyz')).toEqual({ sessionId: 'xyz', mode: 'library' });
  });
  it('returns empty sessionId for an empty hash', () => {
    expect(parsePairHash('')).toEqual({ sessionId: '', mode: 'scan' });
  });
});

describe('buildPairUrl', () => {
  it('builds a scan url with no mode param', () => {
    expect(buildPairUrl('https://x.app', 'abc')).toBe('https://x.app/pair#s=abc');
  });
  it('builds a library url with m=lib', () => {
    expect(buildPairUrl('https://x.app', 'abc', 'library')).toBe('https://x.app/pair#s=abc&m=lib');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pairLink.test.js`
Expected: FAIL — cannot resolve `./pairLink.js`.

- [ ] **Step 3: Implement**

Create `src/pairLink.js`:

```js
// src/pairLink.js
// Pure helpers for the phone pairing deep-link. The link lives in the URL hash:
//   scan:    /pair#s=<sessionId>
//   library: /pair#s=<sessionId>&m=lib
export function parsePairHash(hash) {
  const raw = (hash || '').replace(/^#/, '');
  const params = new URLSearchParams(raw);
  return {
    sessionId: params.get('s') || '',
    mode: params.get('m') === 'lib' ? 'library' : 'scan',
  };
}

export function buildPairUrl(origin, sessionId, mode = 'scan') {
  const base = `${origin}/pair#s=${sessionId}`;
  return mode === 'library' ? `${base}&m=lib` : base;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pairLink.test.js`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npx eslint src/pairLink.js src/pairLink.test.js
git add src/pairLink.js src/pairLink.test.js
git commit -m "feat(photos): pairLink parse/build (pure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `downscaleImageFile` (canvas, MANUAL-VERIFY)

**Files:**
- Modify: `src/imageProcess.js` (append)

The pure dimension math (`fitWithin`) is already unit-tested in `imageProcess`. The canvas re-encode cannot run in jsdom, so this function is verified via `npm run dev` (a `PhonePhotoUpload` real-device send) at Task 11.

- [ ] **Step 1: Implement** (no automated test — canvas)

Append to `src/imageProcess.js`:

```js
// MANUAL-VERIFY (canvas): downscale a picked photo to a transfer-friendly JPEG
// before it goes over the data channel. The desktop re-runs processImageFile on
// arrival (thumb/palette/re-encode), so the phone need only cap the long edge.
export async function downscaleImageFile(file, { maxEdge = 2560, quality = 0.85 } = {}) {
  const bitmap = await createImageBitmap(file);
  const { w, h } = fitWithin(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  const blob = await toBlob(canvas, 'image/jpeg', quality);
  if (bitmap.close) bitmap.close();
  return blob;
}
```

- [ ] **Step 2: Verify the module still imports + lints**

Run: `npx vitest run src/imageProcess.test.js`
Expected: PASS (existing `fitWithin` tests unaffected).
Run: `npx eslint src/imageProcess.js`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/imageProcess.js
git commit -m "feat(photos): downscaleImageFile canvas helper (manual-verify)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `usePhonePeer.sendBatch` + inbound ack handling (MANUAL-VERIFY)

**Files:**
- Modify: `src/usePhonePeer.js`

Logic leans on the pure `createBatchSender`; the PeerJS data channel cannot be exercised in jsdom, so this is verified at Task 11. Keep `sendImage` (OCR) untouched.

- [ ] **Step 1: Implement**

In `src/usePhonePeer.js`:

(a) Update imports:

```js
import { PEER_CONFIG, peerIdFor, makeImageChunks, FATAL_PEER_ERRORS } from './peerProtocol.js';
import { makeBatchStart, createBatchSender } from './batchProtocol.js';
```

(b) Add an ack-waiters ref near the other refs (after `const connRef = useRef(null);`):

```js
  const ackWaitersRef = useRef(new Map()); // imageId -> (ok) => void
  const SEND_ACK_TIMEOUT_MS = 30 * 1000;
```

(c) In `dial()`, inside the `conn.on('open', ...)` wiring (alongside the existing `close`/`error` handlers), add a data handler for inbound acks:

```js
      conn.on('data', (msg) => {
        if (connRef.current !== conn) return;
        if (msg && msg.t === 'img-ack') {
          const resolve = ackWaitersRef.current.get(msg.id);
          if (resolve) { ackWaitersRef.current.delete(msg.id); resolve(!!msg.ok); }
        }
      });
```

(d) Add `sendBatch` (place after `sendImage`). The caller supplies a stable `item.id` per photo; that id IS the wire id (via `makeImageChunks(..., { id })`), the ack-waiter key, and the id passed back to `onProgress`/`onAck`. No id rewriting — a retry reuses the same id, so the desktop dedups correctly.

```js
  // Sends one image's frames and resolves with the desktop's ack (true/false).
  // Resolves false on connection loss or ack timeout so the batch can continue.
  const sendOneImage = useCallback((conn, batchId, item, index, onProgress) => {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => { if (!settled) { settled = true; ackWaitersRef.current.delete(item.id); resolve(ok); } };
      const { start, chunks, end } = makeImageChunks(item.bytes, item.mime, { id: item.id, batchId, index, name: item.name });
      ackWaitersRef.current.set(item.id, finish);
      const timer = setTimeout(() => finish(false), SEND_ACK_TIMEOUT_MS);
      (async () => {
        try {
          conn.send(start);
          for (let i = 0; i < chunks.length; i++) {
            if (connRef.current !== conn || !conn.open) throw new Error('lost');
            conn.send(chunks[i]);
            if (onProgress) onProgress((i + 1) / chunks.length);
            await new Promise(r => setTimeout(r, 0));
          }
          if (connRef.current !== conn || !conn.open) throw new Error('lost');
          conn.send(end);
        } catch {
          clearTimeout(timer);
          finish(false);
        }
      })();
    });
  }, []);

  const sendBatch = useCallback(async (items, { onProgress, onAck } = {}) => {
    const conn = connRef.current;
    if (!conn || !conn.open) throw new Error('Not connected');
    const batchId = crypto.randomUUID();
    const sender = createBatchSender(items); // keyed on caller-supplied item.id
    setStatus('sending');
    try {
      conn.send(makeBatchStart(batchId, items.length));
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (sender.statusOf(item.id) !== 'pending') continue;
        const ok = await sendOneImage(conn, batchId, item, index, (p) => onProgress && onProgress(item.id, p));
        sender.onAck({ id: item.id, ok });
        if (onAck) onAck(item.id, ok);
      }
    } finally {
      if (connRef.current === conn) setStatus('ready');
    }
    return { failed: sender.failed() };
  }, [sendOneImage]);
```

(e) Return `sendBatch` from the hook:

```js
  return { status, errorMessage, sendProgress, retry: dial, sendImage, sendBatch };
```

- [ ] **Step 2: Verify import + lint**

Run: `npx vitest run` (whole suite — nothing should regress; no test imports this hook).
Expected: PASS.
Run: `npx eslint src/usePhonePeer.js`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/usePhonePeer.js
git commit -m "feat(photos): usePhonePeer.sendBatch + inbound ack handling (manual-verify)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `PhotoTray.jsx` — presentational review tray

**Files:**
- Create: `src/PhotoTray.jsx`
- Test: `src/PhotoTray.test.jsx`

Pure presentational: takes photos + handlers, owns the `<input type="file">` (calls `onPick`), renders thumbnails from a passed-in `previewUrl` (no `URL.createObjectURL` here → testable).

- [ ] **Step 1: Write the failing tests**

Create `src/PhotoTray.test.jsx`:

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PhotoTray from './PhotoTray.jsx';

afterEach(() => cleanup());

const photos = (overrides = []) => ([
  { id: 'a', name: 'a.jpg', previewUrl: 'blob:a', state: 'pending', progress: 0 },
  { id: 'b', name: 'b.jpg', previewUrl: 'blob:b', state: 'pending', progress: 0 },
  ...overrides,
]);

describe('PhotoTray', () => {
  it('renders a thumbnail + name per photo', () => {
    const { container } = render(<PhotoTray photos={photos()} connected onPick={() => {}} onSend={() => {}} onRetry={() => {}} onClear={() => {}} />);
    expect(container.querySelectorAll('.phone-tray-thumb').length).toBe(2);
    expect(screen.getByText('a.jpg')).toBeTruthy();
  });

  it('calls onPick with selected files', () => {
    const onPick = vi.fn();
    const { container } = render(<PhotoTray photos={[]} connected onPick={onPick} onSend={() => {}} onRetry={() => {}} onClear={() => {}} />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0][0].name).toBe('p.jpg');
  });

  it('Send button shows the count and calls onSend', () => {
    const onSend = vi.fn();
    render(<PhotoTray photos={photos()} connected onPick={() => {}} onSend={onSend} onRetry={() => {}} onClear={() => {}} />);
    const btn = screen.getByRole('button', { name: /send 2 photos/i });
    fireEvent.click(btn);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('disables Send when disconnected or already sending', () => {
    const { rerender } = render(<PhotoTray photos={photos()} connected={false} onPick={() => {}} onSend={() => {}} onRetry={() => {}} onClear={() => {}} />);
    expect(screen.getByRole('button', { name: /send 2 photos/i }).hasAttribute('disabled')).toBe(true);
    rerender(<PhotoTray photos={photos()} connected sending onPick={() => {}} onSend={() => {}} onRetry={() => {}} onClear={() => {}} />);
    expect(screen.getByRole('button', { name: /send/i }).hasAttribute('disabled')).toBe(true);
  });

  it('shows Retry failed (N) only when there are failures', () => {
    const onRetry = vi.fn();
    const withFail = [
      { id: 'a', name: 'a', previewUrl: 'blob:a', state: 'done', progress: 1 },
      { id: 'b', name: 'b', previewUrl: 'blob:b', state: 'failed', progress: 0 },
    ];
    const { queryByRole, rerender } = render(<PhotoTray photos={photos()} connected onPick={() => {}} onSend={() => {}} onRetry={onRetry} onClear={() => {}} />);
    expect(queryByRole('button', { name: /retry failed/i })).toBeNull();
    rerender(<PhotoTray photos={withFail} connected onPick={() => {}} onSend={() => {}} onRetry={onRetry} onClear={() => {}} />);
    const retry = screen.getByRole('button', { name: /retry failed \(1\)/i });
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/PhotoTray.test.jsx`
Expected: FAIL — cannot resolve `./PhotoTray.jsx`.

- [ ] **Step 3: Implement**

Create `src/PhotoTray.jsx`:

```jsx
import React from 'react';

const STATE_MARK = { pending: '', sending: '', done: '✓', failed: '✗' };

export default function PhotoTray({ photos = [], connected = false, sending = false, onPick, onSend, onRetry, onClear }) {
  const failedCount = photos.filter(p => p.state === 'failed').length;
  const hasPhotos = photos.length > 0;

  const handlePick = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length && onPick) onPick(files);
  };

  return (
    <div className="phone-tray">
      <div className="phone-tray-topbar">
        <span className="phone-camera-title">Add to your library</span>
        <span className="phone-camera-status">{connected ? '● connected' : '○ offline'}</span>
      </div>

      {hasPhotos && (
        <div className="phone-tray-grid">
          {photos.map(p => (
            <div key={p.id} className={`phone-tray-cell phone-tray-${p.state}`}>
              <img className="phone-tray-thumb" src={p.previewUrl} alt={p.name} />
              {p.state === 'sending' && (
                <div className="phone-tray-bar"><span style={{ width: `${Math.round((p.progress || 0) * 100)}%` }} /></div>
              )}
              {STATE_MARK[p.state] && <span className="phone-tray-mark" aria-hidden="true">{STATE_MARK[p.state]}</span>}
              <span className="phone-tray-name">{p.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="phone-tray-actions">
        <label className="phone-btn">
          {hasPhotos ? 'Add more' : 'Choose photos'}
          <input type="file" accept="image/*" multiple aria-label="Choose photos" style={{ display: 'none' }} onChange={handlePick} />
        </label>
        {hasPhotos && <button type="button" className="phone-btn" onClick={onClear}>Clear</button>}
        {failedCount > 0 && (
          <button type="button" className="phone-btn phone-btn-primary" onClick={onRetry}>Retry failed ({failedCount})</button>
        )}
        <button
          type="button"
          className="phone-btn phone-btn-primary"
          disabled={!hasPhotos || !connected || sending}
          onClick={onSend}
        >
          Send {photos.length} photos
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/PhotoTray.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npx eslint src/PhotoTray.jsx src/PhotoTray.test.jsx
git add src/PhotoTray.jsx src/PhotoTray.test.jsx
git commit -m "feat(photos): PhotoTray presentational review tray

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `PhonePhotoUpload.jsx` + phone routing (MANUAL-VERIFY wiring)

**Files:**
- Create: `src/PhonePhotoUpload.jsx`
- Modify: `src/App.jsx` (default export dispatcher)
- Modify: `src/App.css` (tray styles — MANUAL-VERIFY)

`PhonePhotoUpload` wires the camera-free path: `usePhonePeer` + native picker + `downscaleImageFile` + `sendBatch` → `PhotoTray`. It uses canvas + object-URLs + PeerJS, so it is MANUAL-VERIFY (Task 11). `PhotoTray` already carries the tested UI logic.

- [ ] **Step 1: Implement `PhonePhotoUpload.jsx`**

Create `src/PhonePhotoUpload.jsx`:

```jsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import usePhonePeer from './usePhonePeer.js';
import { parsePairHash } from './pairLink.js';
import { downscaleImageFile } from './imageProcess.js';
import PhotoTray from './PhotoTray.jsx';

export default function PhonePhotoUpload() {
  const { sessionId } = parsePairHash(window.location.hash);
  const peer = usePhonePeer(sessionId);
  const [photos, setPhotos] = useState([]); // { id, file, name, previewUrl, state, progress }
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const onPick = useCallback((files) => {
    const added = files.map((file, i) => ({
      id: `pick-${Date.now()}-${i}`,
      file,
      name: file.name || `Phone photo ${i + 1}`,
      previewUrl: URL.createObjectURL(file),
      state: 'pending',
      progress: 0,
    }));
    setPhotos(prev => [...prev, ...added]);
  }, []);

  const patch = (id, fields) => setPhotos(prev => prev.map(p => (p.id === id ? { ...p, ...fields } : p)));

  const send = useCallback(async (subset) => {
    const targets = subset || photosRef.current.filter(p => p.state === 'pending' || p.state === 'failed');
    if (!targets.length) return;
    // Downscale each picked file, then send. item.id === the tray id (stable), so
    // the onProgress/onAck callbacks patch tray state directly by id.
    const items = [];
    for (const p of targets) {
      patch(p.id, { state: 'sending', progress: 0 });
      const blob = await downscaleImageFile(p.file);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      items.push({ id: p.id, bytes, mime: 'image/jpeg', name: p.name });
    }
    await peer.sendBatch(items, {
      onProgress: (id, prog) => patch(id, { progress: prog }),
      onAck: (id, ok) => patch(id, { state: ok ? 'done' : 'failed', progress: ok ? 1 : 0 }),
    });
  }, [peer]);

  // Revoke object-URLs for photos no longer present.
  const prevUrls = useRef(new Set());
  useEffect(() => {
    const current = new Set(photos.map(p => p.previewUrl));
    for (const url of prevUrls.current) if (!current.has(url)) { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }
    prevUrls.current = current;
  }, [photos]);
  useEffect(() => () => { for (const url of prevUrls.current) { try { URL.revokeObjectURL(url); } catch { /* ignore */ } } }, []);

  if (!sessionId) {
    return (<div className="phone-root phone-error"><h1>Invalid pairing link</h1><p>This link is missing a session ID.</p></div>);
  }
  if (peer.status === 'error') {
    return (<div className="phone-root phone-error"><h1>Couldn't pair</h1><p>{peer.errorMessage}</p><button className="phone-btn phone-btn-primary" onClick={peer.retry}>Retry</button></div>);
  }
  if (peer.status === 'connecting') {
    return (<div className="phone-root"><div className="phone-spinner" /><h1>Connecting…</h1><p className="phone-sub">Linking to your desktop</p></div>);
  }
  const allDone = photos.length > 0 && photos.every(p => p.state === 'done');
  if (allDone) {
    return (<div className="phone-root"><div className="phone-check">✓</div><h1>Added to your library</h1><p className="phone-sub">{photos.length} photos sent</p><button className="phone-btn" onClick={() => setPhotos([])}>Send more</button></div>);
  }

  return (
    <PhotoTray
      photos={photos}
      connected={peer.status === 'ready' || peer.status === 'sending'}
      sending={peer.status === 'sending'}
      onPick={onPick}
      onSend={() => send()}
      onRetry={() => send(photosRef.current.filter(p => p.state === 'failed'))}
      onClear={() => setPhotos([])}
    />
  );
}
```

- [ ] **Step 2: Wire the phone dispatcher in `App.jsx`**

Add the import near the other imports:

```js
import PhonePhotoUpload from './PhonePhotoUpload.jsx';
import { parsePairHash } from './pairLink.js';
```

Replace the default export (`src/App.jsx:594-599`) with:

```js
export default function App() {
  if (typeof window !== 'undefined' && window.location.pathname === '/pair') {
    const { mode } = parsePairHash(window.location.hash);
    return mode === 'library' ? <PhonePhotoUpload /> : <PhoneCapture />;
  }
  return <Tallio />;
}
```

- [ ] **Step 3: Add tray CSS (MANUAL-VERIFY)**

Append to `src/App.css` (reuses existing `.phone-*` tokens; tune at Task 11):

```css
.phone-tray { display: flex; flex-direction: column; min-height: 100vh; padding: 16px; gap: 12px; background: #0a0a0f; color: #f0e6d2; }
.phone-tray-topbar { display: flex; justify-content: space-between; align-items: center; }
.phone-tray-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; overflow-y: auto; flex: 1; }
.phone-tray-cell { position: relative; aspect-ratio: 1; border-radius: 10px; overflow: hidden; }
.phone-tray-thumb { width: 100%; height: 100%; object-fit: cover; display: block; }
.phone-tray-cell.phone-tray-failed { outline: 2px solid #d9534f; }
.phone-tray-cell.phone-tray-done { outline: 2px solid #5cb85c; }
.phone-tray-mark { position: absolute; top: 4px; right: 6px; font-weight: 700; text-shadow: 0 1px 2px #000; }
.phone-tray-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(255,255,255,.25); }
.phone-tray-bar > span { display: block; height: 100%; background: #f0e6d2; }
.phone-tray-name { position: absolute; left: 0; right: 0; bottom: 0; font-size: 10px; padding: 2px 4px; background: rgba(0,0,0,.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.phone-tray-actions { display: flex; gap: 8px; flex-wrap: wrap; }
```

- [ ] **Step 4: Verify suite + lint**

Run: `npx vitest run`
Expected: PASS (no regressions; `PhotoTray` tests still green).
Run: `npx eslint src/PhonePhotoUpload.jsx src/App.jsx src/usePhonePeer.js`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/PhonePhotoUpload.jsx src/App.jsx src/usePhonePeer.js src/App.css
git commit -m "feat(photos): phone library-mode upload page + /pair routing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `useDesktopPeer` library-mode receive + ack (MANUAL-VERIFY)

**Files:**
- Modify: `src/useDesktopPeer.js`

PeerJS isn't exercisable in jsdom → MANUAL-VERIFY (Task 11). The pure routing logic already lives in `createBatchReceiver` (tested). Keep the OCR `lastImage` path unchanged.

- [ ] **Step 1: Implement**

In `src/useDesktopPeer.js`:

(a) Imports:

```js
import { PEER_CONFIG, peerIdFor, createReassembler, FATAL_PEER_ERRORS } from './peerProtocol.js';
import { createBatchReceiver, makeImageAck } from './batchProtocol.js';
```

(b) Add a **module-scope** constant near the top of the file (next to `SESSION_TIMEOUT_MS`), so its reference is stable and never needs to appear in hook dependency arrays:

```js
const EMPTY_BATCH = { id: null, count: 0, completed: 0, failed: 0, photoProgress: 0, overall: 0, status: 'idle' };
```

Accept options + a mode ref + batch state. Change the signature:

```js
export default function useDesktopPeer({ onLibraryImage } = {}) {
```

After the existing `useState` declarations add:

```js
  const [batch, setBatch] = useState(EMPTY_BATCH);
  const modeRef = useRef('scan');
  const batchReceiverRef = useRef(null);
  const onLibraryImageRef = useRef(onLibraryImage);
  onLibraryImageRef.current = onLibraryImage;
```

(c) In `cleanup()`, also clear the batch receiver: add `batchReceiverRef.current = null;` next to `reassemblerRef.current = null;`.

(d) Add a library-mode data handler. It commits via `onLibraryImage`, and only after a *confirmed* commit does it call `markCommitted` (so a nacked photo's retry re-delivers — see Task 2). `overall` is computed here from committed+failed, since the receiver no longer tracks it:

```js
  const handleLibraryData = useCallback(async (msg, conn) => {
    if (!batchReceiverRef.current) batchReceiverRef.current = createBatchReceiver();
    const r = batchReceiverRef.current;
    const ev = r.onMessage(msg);
    if (!ev) return;
    if (ev.type === 'batch-start') {
      setBatch({ ...EMPTY_BATCH, id: msg.batchId, count: ev.count, status: 'receiving' });
    } else if (ev.type === 'progress') {
      setBatch(b => ({ ...b, photoProgress: ev.photoProgress }));
    } else if (ev.type === 'duplicate') {
      // Already committed (ack was lost); re-ack ok without re-committing.
      try { conn.send(makeImageAck(msg.batchId, ev.id, ev.index, true)); } catch { /* ignore */ }
    } else if (ev.type === 'image-complete') {
      let ok = false;
      try { ok = !!(await (onLibraryImageRef.current && onLibraryImageRef.current({ bytes: ev.bytes, mime: ev.mime, name: ev.name, index: ev.index, batchId: msg.batchId }))); } catch { ok = false; }
      if (ok) r.markCommitted(ev.id); // record AFTER a successful commit only
      try { conn.send(makeImageAck(msg.batchId, ev.id, ev.index, ok)); } catch { /* ignore */ }
      setBatch(b => {
        const completed = ok ? b.completed + 1 : b.completed;
        const failed = ok ? b.failed : b.failed + 1;
        const status = (completed + failed) >= b.count && b.count > 0 ? 'done' : 'receiving';
        const overall = b.count > 0 ? (completed + failed) / b.count : 0;
        return { ...b, completed, failed, overall, photoProgress: 0, status };
      });
    }
  }, []);
```

(`handleLibraryData`'s only free references are stable refs/setters and module/import bindings, so the empty dep array is correct.)

(e) In `wireConnection`, change the `conn.on('data', ...)` handler to dispatch by mode (library frames go to `handleLibraryData`; the OCR `handleData` is untouched and only runs in scan mode):

```js
    conn.on('data', (msg) => {
      if (connRef.current !== conn) return;
      if (modeRef.current === 'library') handleLibraryData(msg, conn);
      else handleData(msg);
    });
```

Add `handleLibraryData` to the `wireConnection` dependency array.

(f) `start(mode = 'scan')` — set the mode and reset batch. At the top of `start`:

```js
  const start = useCallback((mode = 'scan') => {
    cleanup();
    modeRef.current = mode;
    setBatch(EMPTY_BATCH);
    setLastImage(null);
    // ...rest unchanged...
```

`start`'s dependency array is unchanged (`[armExpiry, cleanup, wireConnection]`) — `EMPTY_BATCH` is a module-scope constant, not a dependency.

(g) In `unpair()`, reset: add `setBatch(EMPTY_BATCH); modeRef.current = 'scan';`.

(h) Expose batch + mode in the return object:

```js
  return {
    active, sessionId, status, errorMessage, lastImage, receiveProgress, expiresAt,
    batch, mode: modeRef.current,
    start, unpair, consumeImage,
  };
```

- [ ] **Step 2: Verify suite + lint**

Run: `npx vitest run`
Expected: PASS (no test imports this hook directly; OCR path intact).
Run: `npx eslint src/useDesktopPeer.js`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/useDesktopPeer.js
git commit -m "feat(photos): useDesktopPeer library-mode batch receive + per-photo ack

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: `PhotoUploadPanel.jsx` — desktop modal

**Files:**
- Create: `src/PhotoUploadPanel.jsx`
- Test: `src/PhotoUploadPanel.test.jsx`
- Modify: `src/App.css` (panel styles — MANUAL-VERIFY)

Prop-driven (like `PairingPanel`) so it is testable with a fake `peer`.

- [ ] **Step 1: Write the failing tests**

Create `src/PhotoUploadPanel.test.jsx`:

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PhotoUploadPanel from './PhotoUploadPanel.jsx';

afterEach(() => cleanup());

const basePeer = (batch) => ({
  sessionId: 'sess-1',
  status: 'paired',
  errorMessage: null,
  batch: { id: 'b1', count: 0, completed: 0, failed: 0, overall: 0, status: 'idle', ...batch },
  start: vi.fn(), unpair: vi.fn(),
});

const props = (over = {}) => ({
  peer: basePeer(over.batch),
  group: 'Uncategorized',
  groups: ['Uncategorized', 'Pets'],
  onChangeGroup: vi.fn(),
  onCreateGroup: vi.fn(),
  onClose: vi.fn(),
  ...over,
});

describe('PhotoUploadPanel', () => {
  it('renders the destination group selector with options', () => {
    const p = props();
    render(<PhotoUploadPanel {...p} />);
    const select = screen.getByLabelText(/photos will be added to/i);
    expect(select.querySelectorAll('option').length).toBe(2);
    fireEvent.change(select, { target: { value: 'Pets' } });
    expect(p.onChangeGroup).toHaveBeenCalledWith('Pets');
  });

  it('shows batch progress while receiving', () => {
    render(<PhotoUploadPanel {...props({ batch: { count: 6, completed: 2, failed: 0, status: 'receiving' } })} />);
    expect(screen.getByText(/receiving 3 of 6/i)).toBeTruthy();
  });

  it('shows a done summary when the batch completes', () => {
    render(<PhotoUploadPanel {...props({ group: 'Pets', batch: { count: 4, completed: 4, failed: 0, status: 'done' } })} />);
    expect(screen.getByText(/added 4 photos to pets/i)).toBeTruthy();
  });

  it('notes failures in the done summary', () => {
    render(<PhotoUploadPanel {...props({ batch: { count: 3, completed: 2, failed: 1, status: 'done' } })} />);
    expect(screen.getByText(/1 failed/i)).toBeTruthy();
  });

  it('creates a new group', () => {
    const p = props();
    render(<PhotoUploadPanel {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /new group/i }));
    const input = screen.getByLabelText(/new group name/i);
    fireEvent.change(input, { target: { value: 'Trips' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(p.onCreateGroup).toHaveBeenCalledWith('Trips');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/PhotoUploadPanel.test.jsx`
Expected: FAIL — cannot resolve `./PhotoUploadPanel.jsx`.

- [ ] **Step 3: Implement**

Create `src/PhotoUploadPanel.jsx`:

```jsx
import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { buildPairUrl } from './pairLink.js';

export default function PhotoUploadPanel({ peer, group, groups = [], onChangeGroup, onCreateGroup, onClose }) {
  const { sessionId, status, errorMessage, batch } = peer;
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const url = sessionId ? buildPairUrl(window.location.origin, sessionId, 'library') : null;
  const receiving = batch.status === 'receiving';
  const done = batch.status === 'done';
  const settled = batch.completed + batch.failed;

  const submitGroup = () => {
    const name = draft.trim();
    if (name && onCreateGroup) onCreateGroup(name);
    setDraft(''); setCreating(false);
  };

  return (
    <div className="pair-overlay" onClick={receiving ? undefined : onClose}>
      <div className="pair-modal" role="dialog" aria-modal="true" aria-labelledby="photo-up-title" onClick={(e) => e.stopPropagation()}>
        <div className="pair-header">
          <h2 id="photo-up-title" className="pair-title">Add photos from phone</h2>
          <button className="pair-close" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="pair-body">
          <label className="image-icons-appslot">
            <span>Photos will be added to</span>
            <select aria-label="Photos will be added to group" value={group} onChange={(e) => onChangeGroup(e.target.value)}>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          {creating ? (
            <div className="image-icons-newgroup">
              <input className="input" aria-label="New group name" autoFocus placeholder="Group name…" value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitGroup(); if (e.key === 'Escape') { setCreating(false); setDraft(''); } }} />
              <button type="button" className="btn btn-primary" onClick={submitGroup}>Add</button>
              <button type="button" className="btn" onClick={() => { setCreating(false); setDraft(''); }}>Cancel</button>
            </div>
          ) : (
            <button type="button" className="btn" onClick={() => setCreating(true)}>＋ New group</button>
          )}

          {status === 'error' ? (
            <div className="pair-error"><p>{errorMessage || 'Pairing failed.'}</p></div>
          ) : done ? (
            <div className="pair-status-pill pair-status-good">
              Added {batch.completed} photos to {group}{batch.failed > 0 ? ` · ${batch.failed} failed` : ''} ✓
            </div>
          ) : receiving ? (
            <div className="pair-status-pill pair-status-good">
              Receiving {Math.min(settled + 1, batch.count)} of {batch.count}…
            </div>
          ) : url ? (
            <>
              <div className="pair-qr-card">
                <QRCodeSVG value={url} size={232} bgColor="#f0e6d2" fgColor="#0a0a0f" level="M" includeMargin />
              </div>
              <p className="pair-instructions">Scan this with your phone, then choose photos to send.</p>
            </>
          ) : (
            <p className="pair-instructions">Generating pairing code…</p>
          )}
        </div>

        <div className="pair-footer">
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/PhotoUploadPanel.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npx eslint src/PhotoUploadPanel.jsx src/PhotoUploadPanel.test.jsx
git add src/PhotoUploadPanel.jsx src/PhotoUploadPanel.test.jsx
git commit -m "feat(photos): PhotoUploadPanel desktop modal (group + progress + done)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: App wiring — commit to library + batch-as-one-undo + entry button

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/AppearanceScreen.jsx`
- Modify: `src/ImageIconsTab.jsx`

`onLibraryImage` commits each received photo via the existing `library.addFromFile` (same pipeline as a file upload), into `pairingGroup`. A stable `batchKeyRef` value during the batch collapses every per-photo `pushHistory()` (fired by `registerBeforeChange`) into one undo step; it is cleared when the batch ends. Dedup is owned by `createBatchReceiver`, so `onLibraryImage` runs at most once per id.

- [ ] **Step 1: Add the entry button to `ImageIconsTab.jsx`**

Add `onAddFromPhone` to the prop list (`src/ImageIconsTab.jsx:23`):

```js
export default function ImageIconsTab({ appearance, categories = [], accounts = [], accountTypes = [], onBatch, onAddFromPhone }) {
```

In the toolbar (after the `＋ New group` button, `src/ImageIconsTab.jsx:105`), add:

```jsx
        {onAddFromPhone && <button type="button" className="btn" onClick={onAddFromPhone}>📱 Add photos from phone</button>}
```

- [ ] **Step 2: Thread the prop through `AppearanceScreen.jsx`**

Add `onAddFromPhone` to the component props (`src/AppearanceScreen.jsx:14`):

```js
export default function AppearanceScreen({ appearance, categories = [], accounts = [], accountTypes = [], onUndo, undoCount = 0, onBatch, onAddFromPhone, onClose }) {
```

Pass it to `ImageIconsTab` (`src/AppearanceScreen.jsx:54`):

```jsx
          <ImageIconsTab appearance={appearance} categories={categories} accounts={accounts} accountTypes={accountTypes} onBatch={onBatch} onAddFromPhone={onAddFromPhone} />
```

- [ ] **Step 3: App state, callback, and the desktop-peer hook options**

In `src/App.jsx`, update the React import (line 1) to add `useCallback` — it is **not** currently imported (`useRef`/`useEffect` already are):

```js
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
```

Add the new module imports near the others:

```js
import PhotoUploadPanel from './PhotoUploadPanel.jsx';
import { listImageGroups } from './imageGroups.js';
```

(`PhonePhotoUpload`/`parsePairHash` were added in Task 7.)

Locate `const desktopPeer = useDesktopPeer();` (`src/App.jsx:209`). Replace that line and add the photo-upload state + commit callback **immediately above it** (so they exist before the hook call). Use the `library` binding already in `App` (the one used at `App.jsx:148,159,192`):

```js
  const UNCATEGORIZED = 'Uncategorized';
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [pairingGroup, setPairingGroup] = useState(UNCATEGORIZED);
  const pairingGroupRef = useRef(pairingGroup);
  pairingGroupRef.current = pairingGroup;

  // Commit one received phone photo through the SAME pipeline as a file upload.
  // batchKeyRef makes every photo in the batch coalesce into a single undo step.
  const onLibraryImage = useCallback(async ({ bytes, mime, name, batchId }) => {
    batchKeyRef.current = `photo-batch:${batchId}`;
    try {
      const blob = new Blob([bytes], { type: mime || 'image/jpeg' });
      await library.addFromFile(blob, { name, group: pairingGroupRef.current });
      return true;
    } catch {
      return false;
    }
  }, [library]);

  const desktopPeer = useDesktopPeer({ onLibraryImage });
```

- [ ] **Step 4: Clear the batch undo-key when the batch ends**

Add an effect after `const desktopPeer = useDesktopPeer(...)`:

```js
  // Once a photo batch finishes (or the peer leaves library mode), stop coalescing
  // so the next discrete edit becomes its own undo step.
  useEffect(() => {
    if (desktopPeer.batch.status !== 'receiving' && batchKeyRef.current && batchKeyRef.current.startsWith('photo-batch:')) {
      batchKeyRef.current = null;
    }
  }, [desktopPeer.batch.status]);
```

- [ ] **Step 5: `openPhotoUpload` + render the panel**

Add near `openPairing` (`src/App.jsx:235`):

```js
  const openPhotoUpload = () => {
    setPairingGroup(UNCATEGORIZED);
    desktopPeer.start('library');
    setShowPhotoUpload(true);
  };
  const closePhotoUpload = () => {
    setShowPhotoUpload(false);
    desktopPeer.unpair();
  };
```

Pass `onAddFromPhone` to `AppearanceScreen` (`src/App.jsx:460-469` block):

```jsx
          onAddFromPhone={openPhotoUpload}
```

Render the panel next to `PairingPanel` (`src/App.jsx:458`):

```jsx
      {showPhotoUpload && (
        <PhotoUploadPanel
          peer={desktopPeer}
          group={pairingGroup}
          groups={listImageGroups(library.images, appearance.imageGroups)}
          onChangeGroup={setPairingGroup}
          onCreateGroup={(name) => { appearanceForUI.addImageGroup(name); setPairingGroup(name); }}
          onClose={closePhotoUpload}
        />
      )}
```

- [ ] **Step 6: Verify suite + lint**

Run: `npx vitest run`
Expected: PASS (all existing tests; no regressions).
Run: `npx eslint src/App.jsx src/AppearanceScreen.jsx src/ImageIconsTab.jsx`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/AppearanceScreen.jsx src/ImageIconsTab.jsx
git commit -m "feat(photos): wire phone batch upload into the library (one undo step)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Manual-verify checkpoint (real phone ↔ desktop)

**Files:** none (verification only). **PAUSE HERE for the user** — this needs a real phone on the same network via `npm run dev`.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` and open the app on the desktop. Open **Appearance → Image Icons**.

- [ ] **Step 2: Pair + library mode**

Click **📱 Add photos from phone**. Confirm the modal shows the group selector (default `Uncategorized`) and a QR. Scan with the phone → the phone opens the **review tray** (NOT the bill camera).

- [ ] **Step 3: Batch send (happy path)**

On the phone, choose 4–6 photos → tray shows thumbnails → **Send N photos**. Verify:
  - per-photo progress + ✓ marks on the phone;
  - desktop panel shows "Receiving X of N…" then "Added N photos to Uncategorized ✓";
  - photos appear in the Image Icons grid under Uncategorized **and** are available as Backgrounds (Background tab → Your photos);
  - a single **Ctrl+Z** removes the *whole* batch (one undo step); redo path not required.

- [ ] **Step 4: Group selection**

Re-open, create a new group ("Pets") in the panel, send 2 photos → they land in **Pets**.

- [ ] **Step 5: Partial failure + retry**

Start a send, then briefly disable Wi-Fi / lock the phone mid-batch to force failures. Verify: failed photos show ✗ + a **Retry failed (N)** button; retry re-sends only those; no duplicates appear in the library; already-landed photos are intact (library not corrupted).

- [ ] **Step 6: Large + edge**

Send ~15 photos to confirm memory stays flat (sequential). Confirm the OCR flow still works: header **Pair Phone** → live camera → bill scan unaffected.

- [ ] **Step 7: Record results + commit any tuning**

Note pass/fail per step back to the user. Commit only if CSS/tuning changed:

```bash
git add -A
git commit -m "chore(photos): manual-verify tuning (tray/panel polish)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** entry/mode → Tasks 3,7,9,10; phone gallery+tray → Tasks 6,7; group landing → Tasks 9,10; protocol+acks → Tasks 1,2,5,8; commit-as-you-go/atomic → Task 10 (`onLibraryImage`); dedup → Task 2 (`createBatchReceiver`) + Task 8; retry/in-session resume → Tasks 5,7 (Retry re-sends pending/failed); batch-as-one-undo → Task 10; testing split → pure (1,2,3) / component (6,9) / manual-verify (4,5,7,8,11). All spec sections map to a task.
- **Default-group note:** the spec's "group active in the Image Library screen" reduces to `Uncategorized` because `ImageIconsTab` has no single active-group concept; the panel dropdown lets the user change it. Implemented as default `Uncategorized` + dropdown.
- **Correctness — dedup keys on COMMIT, not reassembly:** `createBatchReceiver` only marks an id deduped after the glue calls `markCommitted` (Task 8, after a successful `onLibraryImage`). A reassembled-but-nacked photo re-emits `image-complete` on retry, so a failed commit is never silently acked as done (Task 2 has an explicit test for this). Upholds the "never lose data / never corrupt the library" bar.
- **Type consistency:** receiver events (`image-complete`/`progress`/`duplicate`/`batch-start`), `batch` shape (`{id,count,completed,failed,photoProgress,overall,status}`), `makeImageAck(batchId,id,index,ok)`, and `markCommitted(id)`/`committedCount()` are referenced identically across Tasks 2/5/8/9. Per-photo ids are stable end-to-end: the caller's tray id is passed to `makeImageChunks(..., { id })` (Task 1 override), so the wire id, ack-waiter key, and `onProgress`/`onAck` ids are the same value — no mapping, no id rewriting (Tasks 5,7).
- **`useDesktopPeer` signature change:** now `useDesktopPeer({ onLibraryImage })`; the only caller is `App.jsx` (Task 10), and the OCR consumers of its return value (`lastImage`/`consumeImage`/`status`/…) are unchanged.
