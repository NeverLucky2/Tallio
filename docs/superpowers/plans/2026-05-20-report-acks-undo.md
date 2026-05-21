# Undoable Report Acknowledgments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every recurring-report acknowledgment action (Mark ongoing, Mark cancelled, Change, Not a duplicate) revertible by the existing global ↩ Undo button.

**Architecture:** Fold the `useReportAcks` state into the same `history` snapshot stack `App.jsx` already uses for the ledger. The hook gains a `restore()` to mirror its existing `exportSnapshot()`; `App.jsx` snapshots `{ ledger, acks }` together, restores both on undo, and routes the three acks callbacks through `pushHistory()` first.

**Tech Stack:** React 19, Vitest + `@testing-library/react` (`renderHook`/`act` for hooks). Spec: `docs/superpowers/specs/2026-05-20-report-acks-undo-design.md`.

**Conventions (match existing code):**
- Hooks tested with `renderHook, act` from `@testing-library/react` + `beforeEach(() => localStorage.clear())`. Mirror the existing `useLedger.test.jsx:51` "snapshot/restore round-trips for undo" test.
- Tests run with `npx vitest run src/<file>`; lint touched files with `npx eslint src/<files>` — zero NEW errors/warnings.
- Do NOT `git add -A` (sweeps `.claude/settings.local.json`); add only named files. End commit messages with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

**Key interface rule:** `exportSnapshot()` and `restore()` use the same shape — `{ subscriptions, dismissedDuplicates }`. `restore()` must tolerate a missing/partial snapshot (fall back to `{}` / `[]`).

**File structure:**
- Modify `src/useReportAcks.js` + `src/useReportAcks.test.jsx` (Task 1).
- Modify `src/App.jsx` (Task 2 — App-level undo wiring; verified in-app, no unit test surface today).

**Checkpoint:** stop for in-app verification after **Task 2**.

---

## Task 1: `useReportAcks.restore()` (mirror of `exportSnapshot`)

**Files:**
- Modify: `src/useReportAcks.js`
- Test: `src/useReportAcks.test.jsx`

- [ ] **Step 1: Write the failing test** — append inside the existing `describe('useReportAcks', …)` block in `src/useReportAcks.test.jsx`, after the last test (the `exportSnapshot` one):

```jsx
  it('restore replaces the full state from a snapshot (undo round-trip)', () => {
    const { result } = renderHook(() => useReportAcks());
    let snap;
    act(() => { snap = result.current.exportSnapshot(); }); // empty snapshot
    act(() => result.current.setStatus('NETFLIX', 'ongoing'));
    act(() => result.current.dismissDuplicate('d1|d2'));
    expect(result.current.subscriptions.NETFLIX).toEqual({ status: 'ongoing' });
    expect(result.current.dismissedDuplicates).toEqual(['d1|d2']);
    act(() => result.current.restore(snap));
    expect(result.current.subscriptions).toEqual({});
    expect(result.current.dismissedDuplicates).toEqual([]);
  });

  it('restore tolerates a missing or partial snapshot', () => {
    const { result } = renderHook(() => useReportAcks());
    act(() => result.current.setStatus('NETFLIX', 'ongoing'));
    act(() => result.current.restore(undefined));
    expect(result.current.subscriptions).toEqual({});
    expect(result.current.dismissedDuplicates).toEqual([]);
    act(() => result.current.restore({ subscriptions: { X: { status: 'ongoing' } } }));
    expect(result.current.subscriptions.X.status).toBe('ongoing');
    expect(result.current.dismissedDuplicates).toEqual([]);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/useReportAcks.test.jsx`
Expected: FAIL — `result.current.restore is not a function`.

- [ ] **Step 3: Add `restore`.** In `src/useReportAcks.js`, add the callback next to `exportSnapshot` (just before the `return` block). Find:

```js
  const clearStorageError = useCallback(() => setStorageError(null), []);
  const exportSnapshot = useCallback(
    () => ({ subscriptions: acks.subscriptions, dismissedDuplicates: acks.dismissedDuplicates }),
    [acks]
  );
```

Replace with:

```js
  const clearStorageError = useCallback(() => setStorageError(null), []);
  const exportSnapshot = useCallback(
    () => ({ subscriptions: acks.subscriptions, dismissedDuplicates: acks.dismissedDuplicates }),
    [acks]
  );
  const restore = useCallback((snapshot) => {
    setAcks({
      subscriptions: (snapshot && typeof snapshot.subscriptions === 'object' && snapshot.subscriptions) ? snapshot.subscriptions : {},
      dismissedDuplicates: Array.isArray(snapshot && snapshot.dismissedDuplicates) ? snapshot.dismissedDuplicates : [],
    });
  }, []);
```

- [ ] **Step 4: Export `restore`.** In the hook's `return` block, find:

```js
    setStatus, clearStatus, dismissDuplicate, restoreDuplicate,
    storageError, clearStorageError, exportSnapshot,
```

Replace with:

```js
    setStatus, clearStatus, dismissDuplicate, restoreDuplicate,
    storageError, clearStorageError, exportSnapshot, restore,
```

- [ ] **Step 5: Run to verify pass + lint**

Run: `npx vitest run src/useReportAcks.test.jsx` → Expected: PASS (9 tests).
Run: `npx eslint src/useReportAcks.js src/useReportAcks.test.jsx` → Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/useReportAcks.js src/useReportAcks.test.jsx
git commit -m "feat(reports): useReportAcks.restore() for undo snapshot round-trip

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: App undo wiring (CHECKPOINT after — verify in-app)

This task wires acks into the existing `history` stack. There is no `App.test.jsx` and the undo flow (`history`/`pushHistory`/`undo`) is inline UI state, so this task has no unit-test surface; it is verified in-app (Step 5). The full suite must stay green throughout.

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Snapshot acks alongside the ledger in `pushHistory`.** Find:

```jsx
  // Undo: snapshots of the whole ledger.
  const [history, setHistory] = useState([]);
  const pushHistory = () => setHistory(prev => [...prev.slice(-19), ledger.snapshot()]);
  const undo = () => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      ledger.restore(prev[prev.length - 1]);
      return prev.slice(0, -1);
    });
  };
```

Replace with:

```jsx
  // Undo: snapshots of the whole ledger + report acknowledgments.
  const [history, setHistory] = useState([]);
  const pushHistory = () => setHistory(prev => [...prev.slice(-19), { ledger: ledger.snapshot(), acks: acks.exportSnapshot() }]);
  const undo = () => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const entry = prev[prev.length - 1];
      ledger.restore(entry.ledger);
      acks.restore(entry.acks);
      return prev.slice(0, -1);
    });
  };
```

- [ ] **Step 2: Route the three acks callbacks through `pushHistory`.** In the `ReportsScreen` render, find:

```jsx
          subscriptions={acks.subscriptions}
          dismissedDuplicates={acks.dismissedDuplicates}
          onSetStatus={acks.setStatus}
          onClearStatus={acks.clearStatus}
          onDismissDuplicate={acks.dismissDuplicate}
          onClose={() => setScreen('main')}
```

Replace with:

```jsx
          subscriptions={acks.subscriptions}
          dismissedDuplicates={acks.dismissedDuplicates}
          onSetStatus={(key, status, month) => { pushHistory(); acks.setStatus(key, status, month); }}
          onClearStatus={(key) => { pushHistory(); acks.clearStatus(key); }}
          onDismissDuplicate={(sig) => { pushHistory(); acks.dismissDuplicate(sig); }}
          onClose={() => setScreen('main')}
```

- [ ] **Step 3: Run the full suite + lint + build**

Run: `npx vitest run` → Expected: all green (no regression; `useReportAcks` restore tests from Task 1 pass).
Run: `npx eslint src/App.jsx` → Expected: only the pre-existing `App.jsx` camera-stream `react-hooks/exhaustive-deps` warning (no new problems).
Run: `npm run build` → Expected: builds successfully.

- [ ] **Step 4: Sanity-check the wiring** (read-only)

Confirm in `src/App.jsx` that `undo` reads `entry.ledger`/`entry.acks` (matching the new `pushHistory` shape) and that no other call site reads a history entry as a bare `{ accounts, transactions }`. `pushHistory`/`undo` are the only producer/consumer of `history`.

- [ ] **Step 5: Verify in-app** (manual)

```bash
npm run dev -- --port 5174 --strictPort
```
Open http://localhost:5174 → **📊 Reports** → period **All time** or **Last 12 months**. Confirm each action is undoable via the header **↩ Undo** button:
- **Not a duplicate** on a flagged duplicate removes it and bumps the Undo count → **Undo** brings the duplicate row back.
- **Mark ongoing** on a *Needs review* charge moves it to **Ongoing subscriptions** → **Undo** returns it to **Needs review**.
- **Mark cancelled…** with a month → **Undo** returns it to **Needs review** (and clears any zombie alert it produced).
- A restored dismissal stays restored after a page refresh (persistence intact).
- A normal ledger op (edit a transaction) still undoes correctly — acks unaffected.

**Stop the 5174 process when done** (leave 5173 alone).

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat(reports): route report-ack actions through undo history

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

> **CHECKPOINT — stop for review.** Feature complete and verified in-app. Then proceed to finishing-a-development-branch when ready.

---

## Self-review (completed against the spec)

**Spec coverage:**
- `useReportAcks.restore()` mirroring `exportSnapshot`, tolerant of partial snapshots → Task 1 (`restore` + two tests). ✓
- App history entry shape `{ ledger, acks }` + `undo` restores both → Task 2 Step 1. ✓
- Three acks callbacks (`onSetStatus`/`onClearStatus`/`onDismissDuplicate`) routed through `pushHistory` → Task 2 Step 2. ✓
- No change to `ReportsScreen`/`RecurringList` → not in file list; confirmed. ✓
- Persistence of undone state via debounced effect → exercised by Task 1 (`restore` calls `setAcks`) + Task 2 Step 5 refresh check. ✓
- 20-entry cap + disabled-at-empty unchanged → `pushHistory` keeps `slice(-19)`; `undo` keeps the empty guard. ✓
- `restoreDuplicate` left unwired (out of scope) → untouched. ✓

**Placeholder scan:** none; every code step is complete.

**Type consistency:** `restore(snapshot)` consumes exactly the `{ subscriptions, dismissedDuplicates }` produced by `exportSnapshot()`; history entries are written as `{ ledger, acks }` in `pushHistory` and read as `entry.ledger`/`entry.acks` in `undo`. Callback arg shapes (`onSetStatus(key, status, month)`, `onClearStatus(key)`, `onDismissDuplicate(sig)`) match `useReportAcks` and `RecurringList`'s call sites. ✓
