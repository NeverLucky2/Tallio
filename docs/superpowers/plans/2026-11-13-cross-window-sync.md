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
