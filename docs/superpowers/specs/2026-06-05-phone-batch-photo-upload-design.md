# Phone Batch-Photo Upload → Image Library — Design Spec

**Date:** 2026-06-05
**Branch:** `phone-batch-upload` (stacked on `appearance-phase-2b`)
**Initiative:** Tallio "Make it Mine" — sub-project #2 (Phone Batch-Photo Upload)

## Goal

Let the user pair their phone and send **many photos at once** straight into the Tallio
image library, so they immediately become available as **backgrounds** and **image-icons**.

The image library was built source-agnostic for exactly this. This sub-project reuses the
existing PeerJS pairing transport and the image-library stack, and adds a *second
destination* (the library) alongside the existing "scan a bill" OCR path — which must stay
behaviorally unchanged.

## Governing constraint

The user reconciles reports to the dollar. **A failed or partial transfer must degrade
gracefully and never corrupt the library.** Every photo is committed atomically: a record is
written only after the full image arrives *and* processing succeeds. A partial batch means
*fewer valid photos landed* — never a corrupt one.

## What exists today (reused)

- **`peerProtocol.js`** (pure, unit-tested): `CHUNK_SIZE`, `makeImageChunks(bytes, mime)`
  (frames `img-start` / `img-chunk` / `img-end`, each carrying a per-image UUID),
  `createReassembler()` (already multi-image-capable via a `Map` keyed by id; drops corrupt
  transfers; handles out-of-order chunks), `peerIdFor`, `ICE_SERVERS`, `FATAL_PEER_ERRORS`.
- **`usePhonePeer.js`**: phone-side peer; today `sendImage(bytes)` sends one image (mime
  hardcoded `image/jpeg`), fire-and-forget with `setTimeout(0)` yields between chunks.
- **`useDesktopPeer.js`**: desktop-side peer; owns the session lifecycle (QR id, 5-min
  expiry, connect/disconnect/reconnect, receive-timeout) and surfaces a single `lastImage`
  consumed by `App.jsx` → `handleCapture(dataUrl, 'phone')` → Claude OCR → a transaction.
- **`PhoneCapture.jsx`**: phone page (live camera → one capture → send).
- **`PairingPanel.jsx`**: desktop pairing modal (QR + status pill + receive %).
- **Image library**: `imageStore.js` (IndexedDB: `putImage`/`putRecord`/`listImages`/
  `deleteImage`/`updateImageMeta`/`replaceAllImages`), `useImageLibrary.js`,
  root `IconLibraryProvider` (+ `iconLibraryContext.js`) owning CRUD + the `<Icon>` object-URL
  cache, consumed by `ImageIconsTab.jsx` / `BackgroundTab.jsx`. Record shape:
  `{ id, createdAt, name, group, blob, type, w, h, thumb, palette }`. Groups persist via
  `useAppearance.imageGroups` (+ `addImageGroup`/`removeImageGroup`); `ImageIconsTab` already
  has Select-mode **batch-move** (the re-filing safety net).
- **`imageProcess.js`**: `processImageFile(blob)` (canvas, manual-verify) → `{ blob, type, w,
  h, thumb, palette }`; pure `fitWithin(w, h, max)`.

## Decisions (from brainstorming)

1. **Entry point & mode** — A dedicated **"Add photos from phone"** button in the Image
   Library / Backgrounds screen opens the pairing modal in **library mode**. The mode is
   carried in the pair link (`/pair#s=<id>&m=lib`) so the phone opens straight onto the photo
   picker. The header's existing "Pair Phone" stays as the OCR door, untouched. The two flows
   never have to be disambiguated by the user.
2. **Phone capture UX** — **Native gallery multi-select** (`<input type="file"
   accept="image/*" multiple>`); the OS sheet also offers "Take Photo." Selected photos land
   in a **review tray** (thumbnails + per-photo progress + "Send N photos").
3. **Where photos land** — **Desktop picks the destination group up front**, shown in the
   panel as "Photos will be added to: [ group ▾ ]" defaulting to the group active in the Image
   Library screen (else `Uncategorized`) with "＋ New group". The whole batch lands there.
4. **Reliability** — **Commit-as-you-go + per-photo ack/nack + retry-failed + in-session
   resume + dedup-by-id.** Sequential (ack-gated) sends.

Naming (not a fork): each photo keeps its filename if meaningful, else "Phone photo N";
`createdAt` set on arrival like every other record.

## Architecture

### Wire protocol (over the PeerJS data channel)

All messages are plain JSON-able objects sent with `conn.send`:

| Message | Direction | Shape |
| --- | --- | --- |
| batch announce | phone → desktop | `{ t:'batch-start', batchId, count }` |
| image framing | phone → desktop | `img-start` `{ t, id, mime, size, chunks, batchId, index, name }`, `img-chunk` `{ t, id, i, data }`, `img-end` `{ t, id }` |
| per-photo ack | desktop → phone | `{ t:'img-ack', batchId, id, index, ok }` |

`makeImageChunks` is extended to `makeImageChunks(bytes, mime, extra = {})` — `extra` is
merged into the `img-start` frame. OCR callers pass no `extra`, so their frame is unchanged.

### New pure module: `batchProtocol.js` (+ `batchProtocol.test.js`)

The unit-tested core, modeled on `peerProtocol.test.js`. No canvas, no IndexedDB, no React —
operates on raw bytes and message objects.

- `makeBatchStart(batchId, count)` → `{ t:'batch-start', batchId, count }`
- `makeImageAck(batchId, id, index, ok)` → `{ t:'img-ack', batchId, id, index, ok }`
- **`createBatchReceiver()`** — composes a `createReassembler()`:
  - `onMessage(msg)` handles `batch-start` (sets `count`), `img-start`/`img-chunk`/`img-end`.
    Returns an event: `{ type:'batch-start', count }`, `{ type:'progress', id, index,
    photoProgress, overall }`, or `{ type:'image-complete', id, index, name, mime, bytes }`
    (on a clean `img-end`), or `null`.
  - **Dedup**: tracks completed ids; a repeated id (retry race) is ignored and reported so the
    glue can re-`ack(ok)` without re-committing.
  - **Isolation**: a corrupt image (bad chunk) is dropped by the underlying reassembler
    without affecting other images in the batch.
  - Accessors: `overall()` = completed / count, `count()`, `completedCount()`.
  - Committing (canvas + IndexedDB) and ack-sending live in the impure glue, not here.
- **`createBatchSender(items)`** — pure status tracker; `items = [{ id, mime, name }]` (the
  raw `bytes` stay with the impure hook, which owns chunking — the pure sender only needs ids
  and metadata):
  - `pending()` → ids not yet acked-ok; `failed()` → ids acked-not-ok / timed-out.
  - `onAck({ id, ok })` → marks the item done or failed.
  - `markFailed(id)` → for ack-timeouts.
  - `allSettled()` → every item is done-or-failed. Retry = construct a new sender (or reset)
    over `failed()` and resend, reusing the same per-photo ids so the desktop dedups correctly.

### Phone side

- **`PhonePhotoUpload.jsx`** (new) — rendered by the phone entry when the hash carries
  `m=lib`. Native `<input type="file" accept="image/*" multiple>`; a **review tray** of
  thumbnails (object-URLs — manual-verify, jsdom throws on `URL.createObjectURL`) with a
  per-photo status/progress and a "Send N photos" button; a "Retry failed (N)" affordance; a
  done state. Uses the existing connection states from `usePhonePeer`.
- **`usePhonePeer.js`** — add `sendBatch(items, { onProgress, onAck })`:
  - `items = [{ id, bytes, mime, name }]`.
  - Sends `batch-start`, then for each `pending()` item **sequentially**: `img-start`
    (with `{batchId, index, name, mime}`) + chunks + `img-end`, then **awaits that photo's
    `img-ack`** (resolved by an inbound-data handler the hook installs) with a timeout
    (~`SEND_ACK_TIMEOUT_MS`, ≈30s) → on timeout `markFailed` and continue.
  - Drives a `createBatchSender`; resolves when `allSettled()`. Retry re-invokes with the
    failed subset. Existing `sendImage` (OCR) is left intact.
  - The phone listens for inbound `img-ack` on the connection (today the phone only sends).
- **`downscaleImageFile(file, { maxEdge, quality })`** (canvas, manual-verify; reuses
  `fitWithin`) — produces transfer-friendly JPEG bytes from a picked file. Keeps bytes on the
  wire reasonable; the desktop still re-processes (so the phone need not compute thumb/palette).

### Desktop side

- **`useDesktopPeer.js`** — one peer, mode-branched:
  - `start(mode = 'scan', opts)` stores `mode` (and, for library, the chosen `group` — though
    the group is applied by App at commit time, so the hook need only expose batch state).
  - In `handleData`, when `mode === 'library'` route messages through a
    `createBatchReceiver`; on `image-complete`, invoke an injected
    `onLibraryImage({ bytes, mime, name, index, batchId })` callback that returns
    `Promise<boolean>` (committed ok?), then send `img-ack{ ok }` and update batch state.
    Dedup'd repeat ids re-`ack(true)` without re-calling `onLibraryImage`.
  - Expose `batch` state: `{ count, completed, failed, photoProgress, overall, status }`
    where `status ∈ idle|receiving|done`. The OCR path (`lastImage`/`consumeImage`) is
    unchanged and only active in `scan` mode.
- **`PhotoUploadPanel.jsx`** (new) — the library-mode pairing modal: QR card (reuses the same
  rendering as `PairingPanel`), a **group selector** ("Photos will be added to: [ group ▾ ]"
  + "＋ New group"), batch progress ("Receiving 4 of 6…"), and a done summary ("Added 6
  photos to <group> ✓"). A separate component (rather than mode-branching `PairingPanel`)
  keeps each modal a focused, readable unit. Shared QR/overlay chrome may be extracted into a
  tiny helper if duplication is non-trivial; otherwise the modest markup is duplicated.
- **`App.jsx` wiring**:
  - New state `pairingMode` (`'scan' | 'library'`) + `pairingGroup`. An `openPhotoUpload()`
    sets `mode='library'`, picks the default group, calls `desktopPeer.start('library')`, and
    shows `PhotoUploadPanel`. The Image Library / Backgrounds "Add photos from phone" button
    calls up to it.
  - `onLibraryImage` builds a `Blob` from `bytes`+`mime` and commits via the **same pipeline
    as a file upload** — `IconLibraryProvider`'s `addFromFile(blob, { name, group:
    pairingGroup })` (→ `processImageFile` → `putRecord`) — returning `true`/`false`.
  - **Dedup by id**: ownership lives in `createBatchReceiver`, which never re-emits
    `image-complete` for an already-completed id (so `onLibraryImage` runs at most once per
    id). A repeat is surfaced only so the glue can re-`ack(true)`. App does not keep a second
    independent id set.
  - **Default group**: the group currently active/selected in the Image Library screen when
    "Add photos from phone" is clicked, falling back to `Uncategorized` if none is selected.
  - **Batch = one undo step**: a single library snapshot is taken once before the batch's
    first commit (not per photo). Mechanism uses the existing appearance-undo coalescing
    (snapshot/restore + opKey-style coalesce keyed by `batchId`); exact wiring resolved in the
    plan against the in-flight appearance-undo system.
  - **Reload once**: the library view reloads a single time at batch end (the panel shows its
    own batch progress during transfer, not the library grid), avoiding per-photo re-render
    churn. `IconLibraryProvider` already diffs object-URLs incrementally, so this is about
    cleanliness, not flicker.

### Data flow (happy path)

1. Image Library screen → **"Add photos from phone"** → App: `mode='library'`, default
   group, `desktopPeer.start('library')`, show `PhotoUploadPanel`.
2. Phone scans → `/pair#s=…&m=lib` → `PhonePhotoUpload` → connects (`ready`).
3. Tap "Choose photos" → native multi-select → review tray → "Send 6 photos".
4. Phone downscales each → `sendBatch`: `batch-start{batchId,count}`; then per photo
   sequentially `img-start{batchId,index,name,mime}` + chunks + `img-end`; **await** that
   photo's `img-ack`.
5. Desktop reassembles each → App commits (processImageFile → putRecord into `pairingGroup`,
   dedup by id) → `img-ack{ok}`. Panel: "Receiving X of N…".
6. Phone marks each ✓/✗; "Sent 6 · 0 failed" or "Retry failed (N)".
7. Desktop reloads library once → photos available as backgrounds + icons → "Added 6 photos
   to <group> ✓". Whole batch = one undo step.

## Error handling

- **Channel drop mid-image** → the desktop never receives `img-end`, so no record is written
  and no ack is sent; the **phone's ack-timeout** marks the photo ✗; batch continues;
  retryable. (A `nack` — `img-ack{ok:false}` — only happens when the image *did* fully arrive
  but couldn't be committed.)
- **`processImageFile` throws** (corrupt/unsupported) → `onLibraryImage` returns `false` →
  `img-ack{ok:false}` → photo ✗; library untouched for it.
- **IndexedDB unavailable** (privacy mode) → commits fail → all nacked → "couldn't save";
  library not corrupted.
- **Duplicate id** (retry races an ack) → the receiver dedups by id and re-acks `ok` without
  re-committing.
- **Re-pick of the same photo** across batches → new id → treated as a genuine new add (no
  cross-batch content-hash dedup; YAGNI, and re-picking is intentional).
- **In-session resume**: committed photos survive a mid-batch disconnect; **as long as the
  phone page stays open** (the picked files and per-photo ack state are still in memory), on
  reconnect within the 5-min session the phone resends only un-acked photos. A phone-page
  reload loses the selection and requires re-picking. No persisted cross-session resume.
- **Memory**: sequential + commit-as-you-go ⇒ at most one image buffered per side, even for
  large batches.

## Testing strategy

Repo conventions: Vitest + `@testing-library/react`, jsdom; component tests
`import { cleanup }` + `afterEach(() => cleanup())`; **no jest-dom** (use `.toBeTruthy()`,
`getAttribute`, `container.querySelector`). jsdom has no canvas/IndexedDB and
`URL.createObjectURL` throws — use `fake-indexeddb`, stub `URL`, keep protocol + pixel logic
pure. Watch the `react-hooks/set-state-in-effect` ERROR rule.

- **Pure unit (no canvas/IDB)**:
  - `batchProtocol.test.js`: `batch-start` framing; `createBatchReceiver` reassembles multiple
    images, reports per-photo + overall progress, dedups repeated ids, isolates a corrupt
    image without affecting others, handles out-of-order chunks, ignores unknown ids; emits
    `image-complete` with correct metadata. `createBatchSender` tracks `pending()`/`failed()`
    from acks, marks timeouts failed, `allSettled()`, retry yields only failed ids.
  - `peerProtocol.test.js`: extend — `makeImageChunks` merges `extra` fields into `img-start`
    and leaves the no-`extra` (OCR) frame unchanged.
- **Component (jsdom + RTL, inject fakes, stub `URL.createObjectURL`)**:
  - `PhonePhotoUpload`: picking files shows a tray with N thumbnails; "Send" gating; "Retry
    failed" appears after nacks (drive via an injected fake `sendBatch`).
  - `PhotoUploadPanel`: group selector renders + changes target; batch progress text; done
    summary (drive via fake `peer.batch` state).
  - App-level commit wiring: an `image-complete` event calls `addFromFile` with the chosen
    group (inject fake library + fake peer).
- **Manual-verify (`npm run dev`, real phone↔desktop)**: native picker, canvas downscale,
  object-URL previews, real PeerJS transfer, a large batch, mid-batch disconnect + resume,
  retry-failed, photos appearing as backgrounds **and** image-icons, undo removing the whole
  batch.

## Rough task shape (for the plan)

Pure foundations first, then up the stack, pausing at manual-verify points:

1. **Pure protocol** (grouped): `makeImageChunks` `extra` passthrough + `batchProtocol.js`
   (`createBatchReceiver`, `createBatchSender`, constructors) + full unit tests.
2. **Phone send**: `usePhonePeer.sendBatch` + inbound-ack handling; `downscaleImageFile`
   helper.
3. **Phone UI**: `PhonePhotoUpload` (picker + tray + progress + retry); phone entry routes on
   `m=lib`.
4. **Desktop receive**: `useDesktopPeer` library-mode routing + `onLibraryImage` + ack send +
   `batch` state.
5. **Desktop UI**: `PhotoUploadPanel` (group selector + progress + done).
6. **App wiring**: entry button, `pairingMode`/`pairingGroup`, commit-to-library, dedup,
   batch-as-one-undo, reload-once.
7. **Manual-verify checkpoint**: real device end-to-end (camera/picker, transfer, resume,
   retry, undo).

Each task: inline TDD by Claude (no subagents), checkpoint + commit per task, push to the
branch as we go.

## Out of scope (YAGNI)

- Persisted cross-session resume; cross-batch content-hash dedup; pipelined (non-sequential)
  sends; an in-app burst camera; phone-side group selection; editing/cropping on the phone.
