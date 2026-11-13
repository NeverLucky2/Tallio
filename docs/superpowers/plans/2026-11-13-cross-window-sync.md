# Cross-window sync — implementation plan

> Inline TDD by Claude (user: "do implementation however you wish").

**Goal:** Other open Tallio windows reload when one window saves main data, then show
"Updated from another Tallio window".
**Spec:** `docs/superpowers/specs/2026-11-13-cross-window-sync-design.md`
**Tech:** React 19, Vitest + jsdom, Testing Library.

## Global constraints

- **Synced keys:** exactly the eight in the spec, plus `key === null`. Events must come from `localStorage`.
- **Toast copy:** `Updated from another Tallio window`
- **One-shot flag:** `sessionStorage` key `tallio-reloaded-by-other-window`.

## Review focus

1. **Reload loop.** Hooks re-save on mount, so check that two tabs don't ping-pong (live smoke).
2. **Second event.** The ledger writes two keys in a row. The second event must not double-toast; the flag is one-shot.
3. **`sessionStorage` unavailable.** If it throws (privacy mode), the reload must still happen; only the note is lost.

---

### Task 1: `src/crossWindowSync.js`

**Produces:**

- `SYNCED_KEYS: string[]`
- `watchOtherWindows(onChange, { target = window, storage = window.localStorage } = {}) → unsubscribe()`
  - Calls `onChange(key)` for a `storage` event whose `storageArea === storage` and whose
    key is in `SYNCED_KEYS` or is `null`.
- `noteReloadFromOtherWindow(session = window.sessionStorage)` sets the flag. It swallows errors.
- `takeReloadNote(session = window.sessionStorage) → boolean` returns true once (then clears the flag), and false on error.

**Tests (`src/crossWindowSync.test.js`):**

- fires for each synced key
- fires for `key: null`
- ignores `tallio-clipboard`, `tallio-celebrations` and unrelated keys
- ignores a `sessionStorage`-area event
- unsubscribe stops calls
- the note round-trips once (true, then false)
- the note helpers survive a throwing storage (`noteReloadFromOtherWindow` doesn't throw; `takeReloadNote` → false)

**Commit:** `feat(sync): detect Tallio data changes from other windows`

### Task 2: wire into `App.jsx`

**Consumes:** Task 1.

**What to add:**

- An effect that calls `watchOtherWindows(() => { noteReloadFromOtherWindow(); reloadApp(); })`.
- A mount effect: `if (takeReloadNote()) flashToast('Updated from another Tallio window')`.
- **Ruling (during implementation):** `main.jsx` renders inside `<StrictMode>`, which runs mount
  effects twice in dev (and the launcher runs dev). Taking the one-shot note inside an effect
  would get `true` then `false`, and the existing toast-timer cleanup would cancel the hide timer,
  leaving the note stuck on screen. So `main.jsx` calls `takeReloadNote()` once before render and
  passes `reloadedByOtherWindow` to `<App>` → `<Tallio>`. The effect only reads the prop, so it is
  idempotent. The smoke test renders `<App reloadedByOtherWindow />` instead of pre-setting the flag.

**Smoke tests (`src/__smoke__/crossWindow.test.jsx`, mock `../reloadApp.js`):**

- dispatching a `storage` event for `tallio-transactions` calls `reloadApp` and sets the flag
- a `tallio-clipboard` event does not
- rendering with the flag pre-set shows the toast and clears the flag

**Then:** run the full suite (`npx vitest run`), and lint the touched files.

**Commit:** `feat(sync): reload when another Tallio window saves, with a note`

### Task 3: live smoke (no real data)

- Run the dev server on **5174** (a different origin from 5173, so the real data is never touched).
- Open two tabs. Add an account in tab 1. Tab 2 should reload and show the note, and tab 1 must not reload.
- Confirm there's no ping-pong: both tabs stay settled for 10 s.

## Final review (fresh reviewer) — outcome

**Fixed (each RED→GREEN, suite 1187/1187, live two-tab re-check on 5174):**

- **Important — a reloading window blind-wrote its startup copy on mount**, so it could erase a save
  another window made between its render and its effects.
  - `startCrossWindowSync()` now runs in `main.jsx` before render.
  - New `useStorageWriter` (`src/storageWriter.js`) skips identical writes in all six stores.
  - Tests: `storesNoBlindWrite.test.jsx`, `storageWriter.test.jsx`, `startCrossWindowSync` unit tests.
- **Important — the image library (IndexedDB) had no cross-window signal**; a stale window's Undo
  could wipe another window's uploads.
  - Every library change and the end of an archive restore write a fresh `tallio-images-rev`,
    which is now in `SYNCED_KEYS`.
  - Tests: `useImageLibrary.test.jsx`, `archiveRestore.test.js`, `crossWindowSync.test.js`.

**Rulings:**

- **Keep the reload even while a scan, scan review or phone pairing is active** in the other window.
  Deferring would leave that window stale and able to clobber. Cost if wrong: an interrupted scan or
  pairing in the rare two-windows case.

**Deferred minors:**

- **Unload race.** In the few ms between another window's save and this window's unload, a commit
  here still writes a stale copy. Closing it fully needs a revision check before each write, or Web Locks.
- **Linked `.tallio` file can miss the last edit.** This happens when the window with a pending 1.5 s
  autosave is reloaded by a non-ledger save elsewhere. The next ledger edit rewrites the file.
- **Restore with a second window open.** The other window can reload mid-restore, and its startup
  seeding or migration may reload the restoring window with a misleading note.
- **Reload storm.** Dragging an appearance slider in one window reloads the other repeatedly.
- **Windows opened before this change** aren't protected until reloaded once.
