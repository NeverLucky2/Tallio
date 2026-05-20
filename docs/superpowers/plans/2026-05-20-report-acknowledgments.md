# Report Acknowledgments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user tag recurring charges (ongoing / cancelled-as-of-month) and dismiss false-positive duplicates, persisted across sessions, so the Recurring report surfaces true zombies and dual charges instead of stale-data noise.

**Architecture:** Pure classification added to `reportsModel.js` (`recurringCharges.key`, `classifyRecurring`, `findDuplicates` signature + dismissed-filter). A new `useReportAcks` hook owns a `billtracker-report-acks` localStorage key. `RecurringList` is reworked into status groups with actions; `ReportsScreen` + `App.jsx` thread the acks; the export bundle gains a `reportAcks` field. Additive and back-compatible.

**Tech Stack:** React 19, Vitest + @testing-library/react (`renderHook`/`act` for hooks), inline SVG/CSS. Spec: `docs/superpowers/specs/2026-05-20-report-acknowledgments-design.md`.

**Conventions (match existing code):**
- Tests run with `npx vitest run src/<file>`; hooks tested with `renderHook, act` from `@testing-library/react` + `beforeEach(() => localStorage.clear())`; components with `render/screen/cleanup` + `userEvent` + `afterEach(() => cleanup())`; wrap emoji/glyphs in `<span aria-hidden>`.
- Lint touched files: `npx eslint src/<files>` — zero NEW errors/warnings.
- Do NOT `git add -A` (sweeps `.claude/settings.local.json`); add only named files. End commit messages with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

**Key identity rule:** acknowledgments are keyed by a recurring charge's **`key`** (its normalized label), NOT its display label. `RecurringList` calls callbacks with `r.key`; `classifyRecurring` looks up `subscriptions[r.key]`; the hook stores under that string. Duplicate dismissals are keyed by **`signature`** (the duplicate's `ids` sorted, joined with `|`).

**File structure:**
- Modify `src/reportsModel.js` + `src/reportsModel.test.js` (Task 1).
- Create `src/useReportAcks.js` + `src/useReportAcks.test.jsx` (Task 2).
- Rewrite `src/RecurringList.jsx` + `src/RecurringList.test.jsx`; modify `src/ReportsScreen.jsx` + `src/ReportsScreen.test.jsx`; append CSS to `src/App.css` (Task 3, atomic).
- Modify `src/exportArchive.js` + `src/exportArchive.test.js`; modify `src/App.jsx` (Task 4).

**Checkpoints:** stop for review after **Task 2** (pure model + persistence) and after **Task 4** (UI + export wired; verify in-app).

---

## Task 1: reportsModel — key, classifyRecurring, duplicate signature + dismissed filter

**Files:**
- Modify: `src/reportsModel.js`
- Test: `src/reportsModel.test.js`

- [ ] **Step 1: Write the failing tests** — append to `src/reportsModel.test.js`:

```js
import { classifyRecurring } from './reportsModel.js';

describe('recurringCharges key', () => {
  const cats4 = new Map([['exp', { flow: 'expense' }]]);
  const now2 = new Date(2026, 4, 20);
  const t = [
    { id: 'n1', accountId: 'a', date: '2026-03-04', amount: -15.99, categoryId: 'exp', payee: 'Netflix' },
    { id: 'n2', accountId: 'a', date: '2026-04-04', amount: -15.99, categoryId: 'exp', payee: 'Netflix' },
  ];
  it('exposes a normalized key for acknowledgments', () => {
    const rows = recurringCharges(t, cats4, { now: now2 });
    expect(rows[0].key).toBe('NETFLIX');
  });
});

describe('classifyRecurring', () => {
  const rows = [
    { key: 'NETFLIX', label: 'Netflix', lastDate: '2026-05-04' },
    { key: 'SPOTIFY', label: 'Spotify', lastDate: '2026-03-10' },
    { key: 'OLDGYM', label: 'OldGym', lastDate: '2026-01-15' },
    { key: 'NEWCHARGE', label: 'NewCharge', lastDate: '2026-05-01' },
  ];
  const subs = {
    NETFLIX: { status: 'ongoing' },
    SPOTIFY: { status: 'cancelled', cancelledAsOf: '2026-01' }, // last charge Mar > Jan → zombie
    OLDGYM: { status: 'cancelled', cancelledAsOf: '2026-01' },  // last charge in Jan == cancel month → clean
  };
  it('buckets by status; zombie only when charged strictly after the cancel month', () => {
    const { alerts, ongoing, cancelled, review } = classifyRecurring(rows, subs);
    expect(ongoing.map(r => r.key)).toEqual(['NETFLIX']);
    expect(alerts.map(r => r.key)).toEqual(['SPOTIFY']);
    expect(alerts[0].alert).toBe('zombie');
    expect(alerts[0].cancelledAsOf).toBe('2026-01');
    expect(cancelled.map(r => r.key)).toEqual(['OLDGYM']);
    expect(review.map(r => r.key)).toEqual(['NEWCHARGE']);
  });
  it('no subscriptions → everything is review', () => {
    expect(classifyRecurring(rows, {}).review).toHaveLength(4);
  });
});

describe('findDuplicates signature + dismissed', () => {
  const txns = [
    { id: 'd1', accountId: 'a', date: '2026-04-03', amount: -54.10, payee: 'Amazon', categoryId: 'exp' },
    { id: 'd2', accountId: 'a', date: '2026-04-03', amount: -54.10, payee: 'Amazon', categoryId: 'exp' },
  ];
  it('emits a sorted-id signature', () => {
    expect(findDuplicates(txns, {})[0].signature).toBe('d1|d2');
  });
  it('excludes dismissed signatures', () => {
    expect(findDuplicates(txns, { dismissed: new Set(['d1|d2']) })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/reportsModel.test.js`
Expected: FAIL — `classifyRecurring` not exported; `rows[0].key`/`signature` undefined.

- [ ] **Step 3: Add `key` to `recurringCharges`.** In `src/reportsModel.js`, change the results loop to iterate entries and include `key`:

Find:
```js
  const results = [];
  for (const occ of groups.values()) {
```
Replace with:
```js
  const results = [];
  for (const [key, occ] of groups) {
```
And inside the `results.push({ … })`, add `key` as the first field:
```js
    results.push({
      key,
      label: mode(occ.map(o => o.label)),
```

- [ ] **Step 4: Add `signature` + `dismissed` to `findDuplicates`.** Replace the whole `findDuplicates` body's output loop. Find:
```js
export function findDuplicates(transactions, opts = {}) {
  const groups = new Map();
  for (const t of filterRows(transactions, opts)) {
    if (t.transferId != null) continue;
    const date = typeof t.date === 'string' ? t.date : '';
    if (!DATE_RE.test(date)) continue;
    const amt = Number.isFinite(t.amount) ? Math.round(t.amount * 100) / 100 : 0;
    const key = `${t.accountId}|${date}|${amt}|${normalizeLabel(t.payee || t.description)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const out = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const t0 = list[0];
    out.push({
      accountId: t0.accountId,
      label: (t0.payee || t0.description || '').trim(),
      amount: t0.amount,
      date: t0.date,
      ids: list.map(t => t.id),
    });
  }
  return out;
}
```
Replace with:
```js
export function findDuplicates(transactions, opts = {}) {
  const dismissed = opts.dismissed || null;
  const groups = new Map();
  for (const t of filterRows(transactions, opts)) {
    if (t.transferId != null) continue;
    const date = typeof t.date === 'string' ? t.date : '';
    if (!DATE_RE.test(date)) continue;
    const amt = Number.isFinite(t.amount) ? Math.round(t.amount * 100) / 100 : 0;
    const key = `${t.accountId}|${date}|${amt}|${normalizeLabel(t.payee || t.description)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const out = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const t0 = list[0];
    const ids = list.map(t => t.id);
    const signature = [...ids].sort().join('|');
    if (dismissed && dismissed.has(signature)) continue;
    out.push({
      accountId: t0.accountId,
      label: (t0.payee || t0.description || '').trim(),
      amount: t0.amount,
      date: t0.date,
      ids,
      signature,
    });
  }
  return out;
}
```

- [ ] **Step 5: Add `classifyRecurring`.** Append to `src/reportsModel.js`:

```js
// Bucket recurringCharges rows by user-set status; flag zombies (charged after cancellation).
// `now` is intentionally NOT needed: a zombie is purely lastDate-month > cancelledAsOf.
export function classifyRecurring(rows, subscriptions = {}) {
  const alerts = [], ongoing = [], cancelled = [], review = [];
  for (const r of rows || []) {
    const ack = subscriptions && subscriptions[r.key];
    if (ack && ack.status === 'ongoing') {
      ongoing.push(r);
    } else if (ack && ack.status === 'cancelled') {
      const cancelledAsOf = ack.cancelledAsOf || '';
      const lastMonth = (r.lastDate || '').slice(0, 7);
      if (cancelledAsOf && lastMonth > cancelledAsOf) {
        alerts.push({ ...r, alert: 'zombie', cancelledAsOf });
      } else {
        cancelled.push({ ...r, cancelledAsOf });
      }
    } else {
      review.push(r);
    }
  }
  return { alerts, ongoing, cancelled, review };
}
```

- [ ] **Step 6: Run to verify pass + lint**

Run: `npx vitest run src/reportsModel.test.js` → Expected: PASS.
Run: `npx eslint src/reportsModel.js src/reportsModel.test.js` → Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/reportsModel.js src/reportsModel.test.js
git commit -m "feat(reports): recurring key + classifyRecurring + duplicate signature/dismissed

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: useReportAcks hook (CHECKPOINT after this task)

**Files:**
- Create: `src/useReportAcks.js`
- Test: `src/useReportAcks.test.jsx`

- [ ] **Step 1: Write the failing test** — create `src/useReportAcks.test.jsx`:

```jsx
// src/useReportAcks.test.jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useReportAcks from './useReportAcks.js';

const KEY = 'billtracker-report-acks';
beforeEach(() => localStorage.clear());

describe('useReportAcks', () => {
  it('starts empty when storage is empty', () => {
    const { result } = renderHook(() => useReportAcks());
    expect(result.current.subscriptions).toEqual({});
    expect(result.current.dismissedDuplicates).toEqual([]);
  });
  it('setStatus stores ongoing and cancelled (with month)', () => {
    const { result } = renderHook(() => useReportAcks());
    act(() => result.current.setStatus('NETFLIX', 'ongoing'));
    act(() => result.current.setStatus('SPOTIFY', 'cancelled', '2026-01'));
    expect(result.current.subscriptions.NETFLIX).toEqual({ status: 'ongoing' });
    expect(result.current.subscriptions.SPOTIFY).toEqual({ status: 'cancelled', cancelledAsOf: '2026-01' });
  });
  it('clearStatus removes an entry', () => {
    const { result } = renderHook(() => useReportAcks());
    act(() => result.current.setStatus('NETFLIX', 'ongoing'));
    act(() => result.current.clearStatus('NETFLIX'));
    expect(result.current.subscriptions.NETFLIX).toBeUndefined();
  });
  it('dismissDuplicate/restoreDuplicate manage signatures without dupes', () => {
    const { result } = renderHook(() => useReportAcks());
    act(() => result.current.dismissDuplicate('d1|d2'));
    act(() => result.current.dismissDuplicate('d1|d2'));
    expect(result.current.dismissedDuplicates).toEqual(['d1|d2']);
    act(() => result.current.restoreDuplicate('d1|d2'));
    expect(result.current.dismissedDuplicates).toEqual([]);
  });
  it('hydrates from localStorage', () => {
    localStorage.setItem(KEY, JSON.stringify({ subscriptions: { X: { status: 'ongoing' } }, dismissedDuplicates: ['a|b'] }));
    const { result } = renderHook(() => useReportAcks());
    expect(result.current.subscriptions.X.status).toBe('ongoing');
    expect(result.current.dismissedDuplicates).toEqual(['a|b']);
  });
  it('tolerates a corrupt key', () => {
    localStorage.setItem(KEY, '{not json');
    const { result } = renderHook(() => useReportAcks());
    expect(result.current.subscriptions).toEqual({});
  });
  it('exportSnapshot returns the current acks', () => {
    const { result } = renderHook(() => useReportAcks());
    act(() => result.current.setStatus('NETFLIX', 'ongoing'));
    expect(result.current.exportSnapshot()).toEqual({ subscriptions: { NETFLIX: { status: 'ongoing' } }, dismissedDuplicates: [] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/useReportAcks.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the hook** — create `src/useReportAcks.js`:

```js
// src/useReportAcks.js
import { useState, useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'billtracker-report-acks';
const PERSIST_DEBOUNCE_MS = 250;

const empty = () => ({ subscriptions: {}, dismissedDuplicates: [] });

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty();
    return {
      subscriptions: (parsed.subscriptions && typeof parsed.subscriptions === 'object') ? parsed.subscriptions : {},
      dismissedDuplicates: Array.isArray(parsed.dismissedDuplicates) ? parsed.dismissedDuplicates : [],
    };
  } catch {
    return empty();
  }
}

// Owns user acknowledgments for the Recurring report: per-subscription status
// (keyed by a recurring charge's normalized `key`) and dismissed duplicate signatures.
export default function useReportAcks() {
  const [acks, setAcks] = useState(load);
  const [storageError, setStorageError] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(acks));
        if (storageError !== null) setStorageError(null);
      } catch (e) {
        console.error('Failed to save report acks:', e);
        setStorageError({ message: "Couldn't save report settings — storage full." });
      }
    }, PERSIST_DEBOUNCE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [acks]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStatus = useCallback((key, status, cancelledAsOf) => {
    if (!key) return;
    const entry = status === 'cancelled' ? { status, cancelledAsOf } : { status };
    setAcks(prev => ({ ...prev, subscriptions: { ...prev.subscriptions, [key]: entry } }));
  }, []);

  const clearStatus = useCallback((key) => {
    setAcks(prev => {
      const next = { ...prev.subscriptions };
      delete next[key];
      return { ...prev, subscriptions: next };
    });
  }, []);

  const dismissDuplicate = useCallback((signature) => {
    if (!signature) return;
    setAcks(prev => prev.dismissedDuplicates.includes(signature)
      ? prev
      : { ...prev, dismissedDuplicates: [...prev.dismissedDuplicates, signature] });
  }, []);

  const restoreDuplicate = useCallback((signature) => {
    setAcks(prev => ({ ...prev, dismissedDuplicates: prev.dismissedDuplicates.filter(s => s !== signature) }));
  }, []);

  const clearStorageError = useCallback(() => setStorageError(null), []);
  const exportSnapshot = useCallback(
    () => ({ subscriptions: acks.subscriptions, dismissedDuplicates: acks.dismissedDuplicates }),
    [acks]
  );

  return {
    subscriptions: acks.subscriptions,
    dismissedDuplicates: acks.dismissedDuplicates,
    setStatus, clearStatus, dismissDuplicate, restoreDuplicate,
    storageError, clearStorageError, exportSnapshot,
  };
}
```

- [ ] **Step 4: Run to verify pass + lint**

Run: `npx vitest run src/useReportAcks.test.jsx` → Expected: PASS (7 tests).
Run: `npx eslint src/useReportAcks.js src/useReportAcks.test.jsx` → Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/useReportAcks.js src/useReportAcks.test.jsx
git commit -m "feat(reports): useReportAcks hook (subscription status + duplicate dismissals)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

> **CHECKPOINT — stop for review.** Pure model + persistence done. Confirm before reworking the UI.

---

## Task 3: RecurringList rework + ReportsScreen wiring + CSS (atomic; CHECKPOINT after)

This task changes the `RecurringList` contract (`items`→`classified` + actions) and updates `ReportsScreen` in the same commit so the suite never goes red between commits.

**Files:**
- Rewrite: `src/RecurringList.jsx`, `src/RecurringList.test.jsx`
- Modify: `src/ReportsScreen.jsx`, `src/ReportsScreen.test.jsx`
- Modify: `src/App.css`

- [ ] **Step 1: Replace `src/RecurringList.test.jsx`** with the new-API test:

```jsx
// src/RecurringList.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecurringList from './RecurringList.jsx';

const classified = {
  alerts: [{ key: 'SPOTIFY', label: 'Spotify', avgAmount: 9.99, cancelledAsOf: '2026-01', lastDate: '2026-03-10', alert: 'zombie' }],
  ongoing: [{ key: 'NETFLIX', label: 'Netflix', avgAmount: 15.99, occurrences: 3, lastDate: '2026-05-04' }],
  cancelled: [{ key: 'OLDGYM', label: 'OldGym', avgAmount: 40, cancelledAsOf: '2025-11', lastDate: '2025-11-01' }],
  review: [{ key: 'NEWCHARGE', label: 'NewCharge', avgAmount: 40, occurrences: 3, lastDate: '2026-05-01' }],
};
const duplicates = [{ accountId: 'a', label: 'OfficeMax', amount: -12.40, date: '2026-04-03', ids: ['d1', 'd2'], signature: 'd1|d2' }];

describe('RecurringList', () => {
  afterEach(() => cleanup());

  it('renders the four status groups with their charges', () => {
    render(<RecurringList classified={classified} duplicates={duplicates} />);
    expect(screen.getByText('Ongoing subscriptions')).toBeTruthy();
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.getByText('Needs review')).toBeTruthy();
    expect(screen.getByText('Netflix')).toBeTruthy();
    expect(screen.getByText('OldGym')).toBeTruthy();
    expect(screen.getByText('NewCharge')).toBeTruthy();
  });

  it('shows a zombie alert with the cancellation month', () => {
    render(<RecurringList classified={classified} duplicates={[]} />);
    expect(screen.getByText('Spotify')).toBeTruthy();
    expect(screen.getByText(/charged after cancellation \(cancelled Jan 2026\)/i)).toBeTruthy();
  });

  it('Mark ongoing fires onSetStatus with the key', async () => {
    const onSetStatus = vi.fn();
    render(<RecurringList classified={classified} duplicates={[]} onSetStatus={onSetStatus} />);
    await userEvent.click(screen.getByRole('button', { name: /mark ongoing/i }));
    expect(onSetStatus).toHaveBeenCalledWith('NEWCHARGE', 'ongoing');
  });

  it('Mark cancelled reveals a month input defaulting to last-seen month, then fires onSetStatus', async () => {
    const onSetStatus = vi.fn();
    render(<RecurringList classified={classified} duplicates={[]} onSetStatus={onSetStatus} />);
    await userEvent.click(screen.getByRole('button', { name: /mark cancelled/i }));
    const monthInput = screen.getByLabelText(/cancel NewCharge as of/i);
    expect(monthInput.value).toBe('2026-05');
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onSetStatus).toHaveBeenCalledWith('NEWCHARGE', 'cancelled', '2026-05');
  });

  it('Not a duplicate fires onDismissDuplicate with the signature', async () => {
    const onDismissDuplicate = vi.fn();
    render(<RecurringList classified={classified} duplicates={duplicates} onDismissDuplicate={onDismissDuplicate} />);
    await userEvent.click(screen.getByRole('button', { name: /not a duplicate/i }));
    expect(onDismissDuplicate).toHaveBeenCalledWith('d1|d2');
  });

  it('Change on an ongoing row fires onClearStatus with the key', async () => {
    const onClearStatus = vi.fn();
    render(<RecurringList classified={classified} duplicates={[]} onClearStatus={onClearStatus} />);
    await userEvent.click(screen.getAllByRole('button', { name: /change/i })[0]); // ongoing renders before cancelled
    expect(onClearStatus).toHaveBeenCalledWith('NETFLIX');
  });

  it('all-empty shows the empty state', () => {
    render(<RecurringList classified={{ alerts: [], ongoing: [], cancelled: [], review: [] }} duplicates={[]} />);
    expect(screen.getByText(/no recurring charges/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/RecurringList.test.jsx`
Expected: FAIL (old component renders the old shape; new assertions like "Ongoing subscriptions" / role buttons fail).

- [ ] **Step 3: Replace `src/RecurringList.jsx`** entirely:

```jsx
// src/RecurringList.jsx
import React, { useState } from 'react';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n || 0));
const MONTH_RE = /^\d{4}-\d{2}$/;
function monthLabel(m) {
  if (!m || !MONTH_RE.test(m)) return '';
  const [y, mo] = m.split('-').map(n => parseInt(n, 10));
  return new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default function RecurringList({
  classified,
  duplicates,
  onSetStatus = () => {},
  onClearStatus = () => {},
  onDismissDuplicate = () => {},
}) {
  const { alerts = [], ongoing = [], cancelled = [], review = [] } = classified || {};
  const dups = duplicates || [];
  const [cancelling, setCancelling] = useState(null); // { key, label, month }

  const isEmpty = alerts.length === 0 && ongoing.length === 0 && cancelled.length === 0 && review.length === 0 && dups.length === 0;
  if (isEmpty) return <p className="panel-empty">No recurring charges detected (need 2+ months of data)</p>;

  const startCancel = (r) => setCancelling({ key: r.key, label: r.label, month: (r.lastDate || '').slice(0, 7) });
  const confirmCancel = () => {
    if (cancelling && cancelling.month) onSetStatus(cancelling.key, 'cancelled', cancelling.month);
    setCancelling(null);
  };

  return (
    <div className="recurring">
      {(alerts.length > 0 || dups.length > 0) && (
        <div className="recurring-group">
          <h4 className="recurring-group-title is-alert"><span aria-hidden="true">⚠ </span>Alerts</h4>
          <ul className="recurring-list">
            {alerts.map((r) => (
              <li key={`al-${r.key}`} className="recurring-row is-alert">
                <span className="recurring-label">{r.label}</span>
                <span className="recurring-amt">{money(r.avgAmount)}/mo</span>
                <span className="recurring-flag">charged after cancellation (cancelled {monthLabel(r.cancelledAsOf)})</span>
              </li>
            ))}
            {dups.map((d) => (
              <li key={`dup-${d.signature}`} className="recurring-row is-alert">
                <span className="recurring-label">{d.label}</span>
                <span className="recurring-amt">{money(d.amount)} · {d.date} · {d.ids.length}× same day</span>
                <div className="recurring-actions">
                  <button type="button" className="recurring-btn" onClick={() => onDismissDuplicate(d.signature)}>Not a duplicate</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ongoing.length > 0 && (
        <div className="recurring-group">
          <h4 className="recurring-group-title is-ongoing"><span aria-hidden="true">✓ </span>Ongoing subscriptions</h4>
          <ul className="recurring-list">
            {ongoing.map((r) => (
              <li key={`on-${r.key}`} className="recurring-row is-active">
                <span className="recurring-label">{r.label}</span>
                <span className="recurring-amt">{money(r.avgAmount)}/mo · {r.occurrences}×</span>
                <div className="recurring-actions">
                  <button type="button" className="recurring-btn" onClick={() => onClearStatus(r.key)}>Change</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cancelled.length > 0 && (
        <div className="recurring-group">
          <h4 className="recurring-group-title">Cancelled</h4>
          <ul className="recurring-list">
            {cancelled.map((r) => (
              <li key={`ca-${r.key}`} className="recurring-row">
                <span className="recurring-label">{r.label}</span>
                <span className="recurring-amt">cancelled {monthLabel(r.cancelledAsOf)} — no further charges</span>
                <div className="recurring-actions">
                  <button type="button" className="recurring-btn" onClick={() => onClearStatus(r.key)}>Change</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {review.length > 0 && (
        <div className="recurring-group">
          <h4 className="recurring-group-title">Needs review</h4>
          <ul className="recurring-list">
            {review.map((r) => (
              <li key={`rv-${r.key}`} className="recurring-row">
                <span className="recurring-label">{r.label}</span>
                <span className="recurring-amt">{money(r.avgAmount)}/mo · {r.occurrences}× · last seen {monthLabel((r.lastDate || '').slice(0, 7))}</span>
                {cancelling && cancelling.key === r.key ? (
                  <div className="recurring-cancel-edit">
                    <input type="month" className="input" aria-label={`Cancel ${r.label} as of`}
                      value={cancelling.month} onChange={(e) => setCancelling({ ...cancelling, month: e.target.value })} />
                    <button type="button" className="recurring-btn" onClick={confirmCancel}>Confirm</button>
                  </div>
                ) : (
                  <div className="recurring-actions">
                    <button type="button" className="recurring-btn" onClick={() => onSetStatus(r.key, 'ongoing')}><span aria-hidden="true">✓ </span>Mark ongoing</button>
                    <button type="button" className="recurring-btn" onClick={() => startCancel(r)}>Mark cancelled…</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run RecurringList test to verify pass**

Run: `npx vitest run src/RecurringList.test.jsx`
Expected: PASS (7 tests). (ReportsScreen is now temporarily broken — fixed next; do not run it yet.)

- [ ] **Step 5: Update `src/ReportsScreen.jsx`.** Add the import, the new props, the classify/dismiss memos, and the new RecurringList props.

Change the import block — find:
```js
import {
  resolvePeriod, monthsInRange, scopeAccountIds,
  incomeExpenseSummary, spendingByCategory, cashFlowByMonth, netWorthByMonth,
  recurringCharges, findDuplicates,
} from './reportsModel.js';
```
Replace with:
```js
import {
  resolvePeriod, monthsInRange, scopeAccountIds,
  incomeExpenseSummary, spendingByCategory, cashFlowByMonth, netWorthByMonth,
  recurringCharges, findDuplicates, classifyRecurring,
} from './reportsModel.js';
```

Change the component signature — find:
```js
export default function ReportsScreen({ accounts, transactions, categories, types, typesById, onClose, now }) {
```
Replace with:
```js
export default function ReportsScreen({
  accounts, transactions, categories, types, typesById, onClose, now,
  subscriptions = {}, dismissedDuplicates = [],
  onSetStatus = () => {}, onClearStatus = () => {}, onDismissDuplicate = () => {},
}) {
```

Find:
```js
  const recurring = useMemo(() => recurringCharges(transactions, categoriesById, { ...opts, now: nowDate }), [transactions, categoriesById, opts, nowDate]);
  const duplicates = useMemo(() => findDuplicates(transactions, opts), [transactions, opts]);
```
Replace with:
```js
  const recurring = useMemo(() => recurringCharges(transactions, categoriesById, { ...opts, now: nowDate }), [transactions, categoriesById, opts, nowDate]);
  const classified = useMemo(() => classifyRecurring(recurring, subscriptions), [recurring, subscriptions]);
  const dismissedSet = useMemo(() => new Set(dismissedDuplicates), [dismissedDuplicates]);
  const duplicates = useMemo(() => findDuplicates(transactions, { ...opts, dismissed: dismissedSet }), [transactions, opts, dismissedSet]);
```

Find:
```js
          <RecurringList items={recurring} duplicates={duplicates} />
```
Replace with:
```js
          <RecurringList
            classified={classified}
            duplicates={duplicates}
            onSetStatus={onSetStatus}
            onClearStatus={onClearStatus}
            onDismissDuplicate={onDismissDuplicate}
          />
```

- [ ] **Step 6: Append a wiring test to `src/ReportsScreen.test.jsx`** (inside the existing `describe`, after the last test):

```jsx
  it('hides a duplicate whose signature has been dismissed', () => {
    const dupTxns = [
      { id: 'p1', accountId: 'a1', date: '2026-05-08', amount: -12.40, categoryId: 'gro', payee: 'OfficeMax' },
      { id: 'p2', accountId: 'a1', date: '2026-05-08', amount: -12.40, categoryId: 'gro', payee: 'OfficeMax' },
    ];
    const base = {
      accounts, categories, types: DEFAULT_ACCOUNT_TYPES, typesById: DEFAULT_ACCOUNT_TYPES_BY_ID,
      now: NOW, onClose: () => {},
    };
    const { rerender } = render(<ReportsScreen {...base} transactions={dupTxns} />);
    expect(screen.getByText('OfficeMax')).toBeTruthy();
    rerender(<ReportsScreen {...base} transactions={dupTxns} dismissedDuplicates={['p1|p2']} />);
    expect(screen.queryByText('OfficeMax')).toBeNull();
  });
```

- [ ] **Step 7: Append the Reports CSS** to `src/App.css` (end of file — read it first if your tool requires it, then add):

```css
/* Reports — recurring acknowledgments */
.recurring-group { margin-bottom: 10px; }
.recurring-group-title { margin: 8px 0 4px; font-size: 12px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
.recurring-group-title.is-alert { color: var(--red, #e06c6c); }
.recurring-group-title.is-ongoing { color: var(--green, #3ddba0); }
.recurring-row.is-alert { background: rgba(224, 108, 108, 0.12); }
.recurring-actions, .recurring-cancel-edit { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.recurring-btn { font-size: 11px; padding: 2px 8px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text); cursor: pointer; }
.recurring-btn:hover { border-color: var(--accent); }
.recurring-cancel-edit .input { font-size: 12px; padding: 2px 6px; }
```

- [ ] **Step 8: Run the affected suites + full suite + lint**

Run: `npx vitest run src/RecurringList.test.jsx src/ReportsScreen.test.jsx` → Expected: PASS.
Run: `npx vitest run` → Expected: all green.
Run: `npx eslint src/RecurringList.jsx src/RecurringList.test.jsx src/ReportsScreen.jsx src/ReportsScreen.test.jsx` → Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/RecurringList.jsx src/RecurringList.test.jsx src/ReportsScreen.jsx src/ReportsScreen.test.jsx src/App.css
git commit -m "feat(reports): status-grouped recurring card with greenlight/cancel/dismiss actions

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

> **CHECKPOINT — stop for review** after Task 4's in-app verification (App wiring lands first).

---

## Task 4: App wiring + export reportAcks (CHECKPOINT after)

**Files:**
- Modify: `src/exportArchive.js`, `src/exportArchive.test.js`
- Modify: `src/App.jsx`

- [ ] **Step 1: Write the failing export test** — append inside the `describe('export v4', …)` block in `src/exportArchive.test.js`:

```js
  it('includes reportAcks in data.json when provided', () => {
    const reportAcks = { subscriptions: { NETFLIX: { status: 'ongoing' } }, dismissedDuplicates: ['d1|d2'] };
    const bytes = buildArchive({ accounts, transactions, categories, reportAcks, schemaVersion: 4, appVersion: '1.0.0', now: new Date('2026-05-12T00:00:00Z') });
    const data = JSON.parse(strFromU8(unzipSync(bytes)['data.json']));
    expect(data.reportAcks.subscriptions.NETFLIX.status).toBe('ongoing');
    expect(data.reportAcks.dismissedDuplicates).toEqual(['d1|d2']);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/exportArchive.test.js`
Expected: FAIL — `data.reportAcks` is undefined.

- [ ] **Step 3: Thread `reportAcks` through `src/exportArchive.js`.**

Find:
```js
export function buildDataJson(accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now) {
  return JSON.stringify({
    schemaVersion,
    exportedAt: now.toISOString(),
    appVersion,
    accounts: accounts || [],
    transactions: transactions || [],
    categories: categories || [],
    accountTypes: accountTypes || [],
  }, null, 2);
}
```
Replace with:
```js
export function buildDataJson(accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now, reportAcks = null) {
  return JSON.stringify({
    schemaVersion,
    exportedAt: now.toISOString(),
    appVersion,
    accounts: accounts || [],
    transactions: transactions || [],
    categories: categories || [],
    accountTypes: accountTypes || [],
    reportAcks: reportAcks || { subscriptions: {}, dismissedDuplicates: [] },
  }, null, 2);
}
```

Find:
```js
export function buildArchive({ accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now }) {
  const categoriesById = new Map((categories || []).map(c => [c.id, c]));
  const jsonString = buildDataJson(accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now);
```
Replace with:
```js
export function buildArchive({ accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now, reportAcks }) {
  const categoriesById = new Map((categories || []).map(c => [c.id, c]));
  const jsonString = buildDataJson(accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now, reportAcks);
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/exportArchive.test.js` → Expected: PASS (all, including the new test).

- [ ] **Step 5: Wire `useReportAcks` into `src/App.jsx`.**

Add the import after the other hook imports (near `import useLedger from './useLedger.js';`):
```jsx
import useReportAcks from './useReportAcks.js';
```

Add the hook instance next to the other hooks (after `const accountTypes = useAccountTypes();`):
```jsx
  const acks = useReportAcks();
```

Update the export call — find:
```jsx
    const bytes = buildArchive({
      accounts: ledger.accounts, transactions: ledger.transactions,
      categories: cats.categories, accountTypes: accountTypes.types,
      schemaVersion: 4, appVersion: pkg.version, now: new Date(),
    });
```
Replace with:
```jsx
    const bytes = buildArchive({
      accounts: ledger.accounts, transactions: ledger.transactions,
      categories: cats.categories, accountTypes: accountTypes.types,
      reportAcks: acks.exportSnapshot(),
      schemaVersion: 4, appVersion: pkg.version, now: new Date(),
    });
```

Update the ReportsScreen render — find:
```jsx
      {screen === 'reports' && (
        <ReportsScreen
          accounts={ledger.accounts}
          transactions={ledger.transactions}
          categories={cats.categories}
          types={accountTypes.types}
          typesById={accountTypes.typesById}
          onClose={() => setScreen('main')}
        />
      )}
```
Replace with:
```jsx
      {screen === 'reports' && (
        <ReportsScreen
          accounts={ledger.accounts}
          transactions={ledger.transactions}
          categories={cats.categories}
          types={accountTypes.types}
          typesById={accountTypes.typesById}
          subscriptions={acks.subscriptions}
          dismissedDuplicates={acks.dismissedDuplicates}
          onSetStatus={acks.setStatus}
          onClearStatus={acks.clearStatus}
          onDismissDuplicate={acks.dismissDuplicate}
          onClose={() => setScreen('main')}
        />
      )}
```

Add an acks storage-error toast — find:
```jsx
      {ledger.storageError && (
        <div className="toast toast-error">{ledger.storageError.message}
          <button type="button" className="toast-dismiss" aria-label="Dismiss" onClick={ledger.clearStorageError}>×</button>
        </div>
      )}
```
Add immediately after it:
```jsx
      {acks.storageError && (
        <div className="toast toast-error">{acks.storageError.message}
          <button type="button" className="toast-dismiss" aria-label="Dismiss" onClick={acks.clearStorageError}>×</button>
        </div>
      )}
```

- [ ] **Step 6: Run the full suite + lint + build**

Run: `npx vitest run` → Expected: all green.
Run: `npx eslint src/exportArchive.js src/exportArchive.test.js src/App.jsx` → Expected: only the pre-existing `App.jsx:57` camera-stream warning (no new problems).
Run: `npm run build` → Expected: builds successfully.

- [ ] **Step 7: Verify in-app** (manual)

```bash
npm run dev -- --port 5174 --strictPort
```
Open http://localhost:5174 → **📊 Reports** → set period to **All time** or **Last 12 months** so recurring charges appear. Confirm: a detected charge sits under **Needs review** with **[✓ Mark ongoing]** / **[Mark cancelled…]**; marking ongoing moves it to the green **Ongoing subscriptions** group and persists across a refresh; marking cancelled with a past month surfaces a red **Alerts** zombie row if a later charge exists; **[Not a duplicate]** on a flagged duplicate removes it and it stays gone after refresh. **Stop the 5174 process when done** (leave 5173 alone).

- [ ] **Step 8: Commit**

```bash
git add src/exportArchive.js src/exportArchive.test.js src/App.jsx
git commit -m "feat(reports): persist report acknowledgments via useReportAcks + export

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

> **CHECKPOINT — stop for review.** Feature complete and verified in-app. Then proceed to finishing-a-development-branch when ready.

---

## Self-review (completed against the spec)

**Spec coverage:**
- Persisted subscription status keyed by normalized label → Task 2 `useReportAcks` (`setStatus`/`clearStatus`) + Task 1 `classifyRecurring` lookup on `r.key`. ✓
- Persisted duplicate dismissals by exact id-set → Task 1 `signature`, Task 2 `dismissDuplicate`/`restoreDuplicate`. ✓
- Status-grouped card (Alerts → Ongoing → Cancelled → Needs review) → Task 3 `RecurringList`. ✓
- Zombie detection (charge strictly after cancel month) → Task 1 `classifyRecurring` + tests (boundary: in-month = clean). ✓
- Pure, tested classification → Task 1. ✓
- Acks in export backup → Task 4 `exportArchive` + `App.exportData`. ✓
- Staleness red flag removed (red only for zombies) → Task 3 `RecurringList` renders neutral "last seen" for review; red only on `is-alert`. ✓
- App wiring incl. storageError toast, acks NOT in undo history → Task 4 (acks is a separate hook, never snapshotted by `useLedger`). ✓

**Placeholder scan:** none; every code step is complete.
**Type consistency:** `key`/`signature`/`classified {alerts,ongoing,cancelled,review}`/`{status, cancelledAsOf}` and callback args (`onSetStatus(key,status,month?)`, `onClearStatus(key)`, `onDismissDuplicate(signature)`) match across model, hook, component, and screen. ✓

**Deviation from spec (intentional, lint-driven):** `classifyRecurring(rows, subscriptions)` omits the `{ now }` parameter from the spec signature — a zombie is purely `lastDate`-month vs `cancelledAsOf`, so `now` is unused and would trip `no-unused-vars`. Behavior is unchanged.
