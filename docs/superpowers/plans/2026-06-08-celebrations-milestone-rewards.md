# Celebrations / Milestone Rewards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Celebrate genuine, data-derived financial milestones (debt paid off, net-worth threshold crossed, best savings month, savings streak) with an ephemeral, dismissible, theme-matched overlay that never interferes with data entry and never false-fires or re-fires.

**Architecture:** Pure detection module (`celebrationMath.js`) + persistence/queue hook (`useCelebrations.js`) + thin presentational layer (`CelebrationLayer.jsx` + `CelebrationLayer.css`), wired into `App.jsx` with a three-way style control in `SettingsPanel.jsx`. Per-type baselining gives the no-false-positive / once-ever guarantee. Mirrors the existing `spendingMath`/`backgroundMath` + `BackgroundLayer` pattern.

**Tech Stack:** React (hooks), Vite, Vitest + @testing-library/react (jsdom), CSS confetti (no canvas). localStorage persistence under key `tallio-celebrations`.

**Conventions (must follow):**
- Component tests: `import { render, cleanup } from '@testing-library/react'` + `afterEach(() => cleanup())`. **No jest-dom** — assert with `.toBeTruthy()`, `.toBeNull()`/`.not.toBeNull()`, `getAttribute`, `container.querySelector`, `.style.*`.
- Hook tests: `renderHook`, `act` from `@testing-library/react`; `beforeEach(() => localStorage.clear())`.
- Run one file: `npx vitest run src/<File>.test.<ext>`. Full suite: `npx vitest run`. Lint: `npx eslint <files>` (zero NEW errors).
- react-hooks v6 `react-hooks/refs` ERRORS on mirroring state into a ref **during render** — only sync refs via `useEffect`.
- **Never `git add -A`** — stage only the named files each commit. (`src/App.css` has an unrelated uncommitted WIP change that must stay untouched; this is why celebration styles live in their own `CelebrationLayer.css`.)
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Branch: `celebrations-milestones` (already created off master, spec committed). Push after each task.

**File structure:**
- Create `src/celebrationMath.js` — pure detectors + `detectAchieved` + `diffCelebrations` (Tasks 1–6).
- Create `src/celebrationMath.test.js` — pure unit tests (Tasks 1–6).
- Create `src/useCelebrations.js` — hook: persistence, debounced detection, queue, style (Task 7).
- Create `src/useCelebrations.test.jsx` — hook tests (Task 7).
- Create `src/CelebrationLayer.jsx` + `src/CelebrationLayer.css` — presentational (Task 8).
- Create `src/CelebrationLayer.test.jsx` — component tests (Task 8).
- Modify `src/App.jsx` — instantiate hook + mount layer + pass style props to SettingsPanel (Task 9).
- Modify `src/SettingsPanel.jsx` — three-way Celebrations control (Task 9).

---

## Task 1: Net-worth threshold detection + formatting helpers

**Files:**
- Create: `src/celebrationMath.js`
- Test: `src/celebrationMath.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/celebrationMath.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  formatThreshold,
  networthThresholdsReached,
  detectNetWorth,
} from './celebrationMath.js';
import { DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';

const typesById = DEFAULT_ACCOUNT_TYPES_BY_ID;

describe('formatThreshold', () => {
  it('formats thousands and millions', () => {
    expect(formatThreshold(25000)).toBe('$25k');
    expect(formatThreshold(100000)).toBe('$100k');
    expect(formatThreshold(750000)).toBe('$750k');
    expect(formatThreshold(1000000)).toBe('$1M');
    expect(formatThreshold(1500000)).toBe('$1.5M');
    expect(formatThreshold(2000000)).toBe('$2M');
  });
});

describe('networthThresholdsReached', () => {
  it('returns every ladder value at or below net worth', () => {
    expect(networthThresholdsReached(0)).toEqual([]);
    expect(networthThresholdsReached(60000)).toEqual([25000, 50000]);
    expect(networthThresholdsReached(300000)).toEqual([25000, 50000, 100000, 250000]);
  });
  it('extends past $1M in $500k steps', () => {
    expect(networthThresholdsReached(2000000)).toEqual([
      25000, 50000, 100000, 250000, 500000, 750000, 1000000, 1500000, 2000000,
    ]);
  });
});

describe('detectNetWorth', () => {
  it('emits a milestone per reached threshold from household net worth', () => {
    const accounts = [{ id: 'b', name: 'Checking', type: 'bank', openingBalance: 60000 }];
    const res = detectNetWorth(accounts, [], typesById);
    expect(res.map(r => r.key)).toEqual(['networth:25000', 'networth:50000']);
    expect(res[1]).toMatchObject({ type: 'networth', title: '$50k net worth!' });
  });
  it('returns nothing when net worth is below the first rung', () => {
    const accounts = [{ id: 'b', name: 'Checking', type: 'bank', openingBalance: 100 }];
    expect(detectNetWorth(accounts, [], typesById)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/celebrationMath.test.js`
Expected: FAIL — "Failed to resolve import './celebrationMath.js'" / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/celebrationMath.js`:

```js
// src/celebrationMath.js
// Pure milestone detection over ledger/report state. No React, no storage.
import { accountClass, computeRegister, householdTotals } from './accountsModel.js';
import { cashFlowByMonth } from './reportsModel.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const NETWORTH_BASE = [25000, 50000, 100000, 250000, 500000, 750000, 1000000];
const NETWORTH_STEP = 500000; // beyond $1M, every $500k

export function formatThreshold(amount) {
  if (amount >= 1000000) {
    const m = amount / 1000000;
    return `$${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  return `$${amount / 1000}k`;
}

export function formatMoney(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function monthLabel(ym) {
  const [y, mo] = (ym || '').split('-').map((x) => parseInt(x, 10));
  if (!y || !mo) return ym || '';
  return `${MONTH_NAMES[mo - 1]} ${y}`;
}

export function networthThresholdsReached(netWorth) {
  const reached = [];
  for (const t of NETWORTH_BASE) if (netWorth >= t) reached.push(t);
  let t = 1000000 + NETWORTH_STEP;
  while (netWorth >= t) { reached.push(t); t += NETWORTH_STEP; }
  return reached;
}

export function detectNetWorth(accounts, transactions, typesById) {
  const { netWorth } = householdTotals(accounts, transactions, typesById);
  return networthThresholdsReached(netWorth).map((t) => ({
    key: `networth:${t}`,
    type: 'networth',
    title: `${formatThreshold(t)} net worth!`,
    detail: 'A new milestone reached',
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/celebrationMath.test.js`
Expected: PASS (all Task 1 describes green).

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/celebrationMath.js src/celebrationMath.test.js
git add src/celebrationMath.js src/celebrationMath.test.js
git commit -m "feat(celebrations): net-worth threshold detection + format helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 2: Debt paid-off detection

**Files:**
- Modify: `src/celebrationMath.js`
- Test: `src/celebrationMath.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/celebrationMath.test.js`:

```js
import { detectPaidOff } from './celebrationMath.js';

describe('detectPaidOff', () => {
  it('fires when a liability that was ever negative is now >= 0', () => {
    const accounts = [{ id: 'cc', name: 'Visa', type: 'credit_card', openingBalance: -500 }];
    const transactions = [{ id: 't1', accountId: 'cc', date: '2026-01-10', amount: 500 }];
    const res = detectPaidOff(accounts, transactions, typesById);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ key: 'paidoff:cc', type: 'paidoff' });
    expect(res[0].title).toContain('Visa');
  });
  it('does not fire for a liability still in debt', () => {
    const accounts = [{ id: 'cc', name: 'Visa', type: 'credit_card', openingBalance: -500 }];
    const transactions = [{ id: 't1', accountId: 'cc', date: '2026-01-10', amount: 200 }];
    expect(detectPaidOff(accounts, transactions, typesById)).toEqual([]);
  });
  it('does not fire for a liability that was never negative (no activity)', () => {
    const accounts = [{ id: 'cc', name: 'New Card', type: 'credit_card', openingBalance: 0 }];
    expect(detectPaidOff(accounts, [], typesById)).toEqual([]);
  });
  it('ignores asset accounts at zero', () => {
    const accounts = [{ id: 'b', name: 'Checking', type: 'bank', openingBalance: -10 }];
    const transactions = [{ id: 't1', accountId: 'b', date: '2026-01-10', amount: 10 }];
    expect(detectPaidOff(accounts, transactions, typesById)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/celebrationMath.test.js`
Expected: FAIL — `detectPaidOff is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/celebrationMath.js` (after `detectNetWorth`):

```js
export function detectPaidOff(accounts, transactions, typesById) {
  const out = [];
  for (const a of accounts || []) {
    if (accountClass(a.type, typesById) !== 'liability') continue;
    const reg = computeRegister(a, transactions);
    if (reg.length === 0) continue;
    const opening = Number.isFinite(a.openingBalance) ? a.openingBalance : 0;
    let minBal = opening;
    for (const r of reg) if (r.balance < minBal) minBal = r.balance;
    const current = reg[reg.length - 1].balance;
    if (minBal < 0 && current >= 0) {
      out.push({
        key: `paidoff:${a.id}`,
        type: 'paidoff',
        title: `${a.name || 'Account'} paid off!`,
        detail: 'You cleared the balance 🎉',
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/celebrationMath.test.js`
Expected: PASS.

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/celebrationMath.js src/celebrationMath.test.js
git add src/celebrationMath.js src/celebrationMath.test.js
git commit -m "feat(celebrations): debt paid-off detection (ever-negative -> cleared)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 3: Best-savings-month detection

**Files:**
- Modify: `src/celebrationMath.js`
- Test: `src/celebrationMath.test.js`

Note: `cashFlowByMonth(transactions, categoriesById, {})` returns ascending `[{ month, income, spending, net }]` over all months between the first and last transaction; `net = income − spending`. Categories must carry `flow` ('income' | 'expense' | 'savings').

- [ ] **Step 1: Write the failing test**

Append to `src/celebrationMath.test.js`:

```js
import { detectBestMonth } from './celebrationMath.js';

const cats = new Map([
  ['inc', { id: 'inc', flow: 'income' }],
  ['exp', { id: 'exp', flow: 'expense' }],
]);
// Helpers to build a month's worth of income/expense rows on a bank account.
const income = (id, date, amt) => ({ id, accountId: 'b', date, amount: amt, categoryId: 'inc' });
const expense = (id, date, amt) => ({ id, accountId: 'b', date, amount: -amt, categoryId: 'exp' });
const NOW = () => new Date('2026-06-15T00:00:00');

describe('detectBestMonth', () => {
  it('returns nothing with fewer than 3 completed months', () => {
    const txns = [income('i1', '2026-01-05', 1000), income('i2', '2026-02-05', 2000)];
    expect(detectBestMonth(txns, cats, NOW())).toEqual([]);
  });
  it('flags the single completed month that beats all priors', () => {
    const txns = [
      income('i1', '2026-01-05', 1000), expense('e1', '2026-01-06', 200), // net 800
      income('i2', '2026-02-05', 1000), expense('e2', '2026-02-06', 100), // net 900
      income('i3', '2026-03-05', 3000), expense('e3', '2026-03-06', 100), // net 2900 (best)
      income('i4', '2026-04-05', 1000),                                   // net 1000
    ];
    const res = detectBestMonth(txns, cats, NOW());
    expect(res).toHaveLength(1);
    expect(res[0].key).toBe('bestmonth:2026-03');
    expect(res[0].detail).toContain('March 2026');
  });
  it('excludes the current (incomplete) month from records', () => {
    const txns = [
      income('i1', '2026-01-05', 1000), income('i2', '2026-02-05', 1000), income('i3', '2026-03-05', 1000),
      income('i4', '2026-06-05', 9999), // current month — must not be the record
    ];
    const res = detectBestMonth(txns, cats, NOW());
    expect(res[0].key).not.toBe('bestmonth:2026-06');
  });
  it('returns nothing when the best completed month is not positive', () => {
    const txns = [
      expense('e1', '2026-01-06', 200), expense('e2', '2026-02-06', 100), expense('e3', '2026-03-06', 100),
    ];
    expect(detectBestMonth(txns, cats, NOW())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/celebrationMath.test.js`
Expected: FAIL — `detectBestMonth is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/celebrationMath.js`:

```js
function completedMonths(transactions, categoriesById, now) {
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return cashFlowByMonth(transactions, categoriesById, {}).filter((m) => m.month < cur);
}

export function detectBestMonth(transactions, categoriesById, now = new Date()) {
  const months = completedMonths(transactions, categoriesById, now);
  if (months.length < 3) return [];
  let best = null;
  for (const m of months) if (best === null || m.net > best.net) best = m;
  if (!best || best.net <= 0) return [];
  return [{
    key: `bestmonth:${best.month}`,
    type: 'bestmonth',
    title: 'Best savings month ever!',
    detail: `You saved ${formatMoney(best.net)} in ${monthLabel(best.month)}`,
  }];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/celebrationMath.test.js`
Expected: PASS.

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/celebrationMath.js src/celebrationMath.test.js
git add src/celebrationMath.js src/celebrationMath.test.js
git commit -m "feat(celebrations): best-savings-month detection (completed months only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 4: Savings-streak detection

**Files:**
- Modify: `src/celebrationMath.js`
- Test: `src/celebrationMath.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/celebrationMath.test.js`:

```js
import { streakThresholdsReached, detectStreak } from './celebrationMath.js';

describe('streakThresholdsReached', () => {
  it('returns crossed thresholds 3/6/12 then every 12', () => {
    expect(streakThresholdsReached(2)).toEqual([]);
    expect(streakThresholdsReached(6)).toEqual([3, 6]);
    expect(streakThresholdsReached(13)).toEqual([3, 6, 12]);
    expect(streakThresholdsReached(24)).toEqual([3, 6, 12, 24]);
  });
});

describe('detectStreak', () => {
  it('counts the trailing run of net-positive completed months', () => {
    // Jan..Jun all net-positive; current month June excluded -> Jan..May = 5 -> [3]
    const txns = [];
    for (const mo of ['01', '02', '03', '04', '05']) {
      txns.push(income(`i${mo}`, `2026-${mo}-05`, 1000));
      txns.push(expense(`e${mo}`, `2026-${mo}-06`, 100));
    }
    const res = detectStreak(txns, cats, NOW());
    expect(res.map(r => r.key)).toEqual(['streak:3']);
    expect(res[0].title).toContain('3-month');
  });
  it('a non-positive month breaks the streak', () => {
    const txns = [
      income('i1', '2026-01-05', 1000),                              // +1000
      income('i2', '2026-02-05', 1000),                              // +1000
      expense('e3', '2026-03-06', 100),                              // -100 (breaks)
      income('i4', '2026-04-05', 1000),                              // +1000
      income('i5', '2026-05-05', 1000),                              // +1000
    ];
    // trailing run = Apr,May = 2 -> no threshold
    expect(detectStreak(txns, cats, NOW())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/celebrationMath.test.js`
Expected: FAIL — `streakThresholdsReached is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/celebrationMath.js`:

```js
export function streakThresholdsReached(streak) {
  const out = [];
  for (const t of [3, 6, 12]) if (streak >= t) out.push(t);
  let t = 24;
  while (streak >= t) { out.push(t); t += 12; }
  return out;
}

export function detectStreak(transactions, categoriesById, now = new Date()) {
  const months = completedMonths(transactions, categoriesById, now);
  let streak = 0;
  for (let i = months.length - 1; i >= 0; i -= 1) {
    if (months[i].net > 0) streak += 1; else break;
  }
  return streakThresholdsReached(streak).map((n) => ({
    key: `streak:${n}`,
    type: 'streak',
    title: `${n}-month savings streak!`,
    detail: 'Keep it going',
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/celebrationMath.test.js`
Expected: PASS.

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/celebrationMath.js src/celebrationMath.test.js
git add src/celebrationMath.js src/celebrationMath.test.js
git commit -m "feat(celebrations): savings-streak detection (trailing net-positive run)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 5: `detectAchieved` composition

**Files:**
- Modify: `src/celebrationMath.js`
- Test: `src/celebrationMath.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/celebrationMath.test.js`:

```js
import { detectAchieved, CELEBRATION_TYPES } from './celebrationMath.js';

describe('detectAchieved', () => {
  it('unions all detector outputs', () => {
    const accounts = [
      { id: 'b', name: 'Checking', type: 'bank', openingBalance: 60000 },
      { id: 'cc', name: 'Visa', type: 'credit_card', openingBalance: -500 },
    ];
    const transactions = [{ id: 't1', accountId: 'cc', date: '2026-01-10', amount: 500 }];
    const keys = detectAchieved({ accounts, transactions, typesById, categoriesById: cats, now: NOW() }).map(r => r.key);
    expect(keys).toContain('paidoff:cc');
    expect(keys).toContain('networth:25000'); // 60000 (bank) - 0 (cc now) = 60000 net worth
  });
  it('returns [] for an empty ledger and exposes the known type list', () => {
    expect(detectAchieved({ accounts: [], transactions: [], typesById, categoriesById: cats, now: NOW() })).toEqual([]);
    expect(CELEBRATION_TYPES).toEqual(['paidoff', 'networth', 'bestmonth', 'streak']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/celebrationMath.test.js`
Expected: FAIL — `detectAchieved is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/celebrationMath.js`:

```js
export const CELEBRATION_TYPES = ['paidoff', 'networth', 'bestmonth', 'streak'];

export function detectAchieved({
  accounts = [], transactions = [], typesById, categoriesById, now = new Date(),
} = {}) {
  return [
    ...detectPaidOff(accounts, transactions, typesById),
    ...detectNetWorth(accounts, transactions, typesById),
    ...detectBestMonth(transactions, categoriesById, now),
    ...detectStreak(transactions, categoriesById, now),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/celebrationMath.test.js`
Expected: PASS.

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/celebrationMath.js src/celebrationMath.test.js
git add src/celebrationMath.js src/celebrationMath.test.js
git commit -m "feat(celebrations): detectAchieved composition + CELEBRATION_TYPES

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 6: `diffCelebrations` — per-type baseline + once-ever dedup

**Files:**
- Modify: `src/celebrationMath.js`
- Test: `src/celebrationMath.test.js`

This is the no-false-positive / no-re-celebrate core.

- [ ] **Step 1: Write the failing test**

Append to `src/celebrationMath.test.js`:

```js
import { diffCelebrations } from './celebrationMath.js';

const ach = (key, type) => ({ key, type, title: key, detail: '' });

describe('diffCelebrations', () => {
  it('first encounter of a type baselines silently (no celebration)', () => {
    const { toCelebrate, nextState } = diffCelebrations(
      [ach('paidoff:a', 'paidoff')],
      { seen: {}, baselinedTypes: [] },
    );
    expect(toCelebrate).toEqual([]);
    expect(nextState.seen['paidoff:a']).toBeTruthy();
    expect(nextState.baselinedTypes).toEqual(expect.arrayContaining(['paidoff', 'networth', 'bestmonth', 'streak']));
  });
  it('fires once for a new key after the type is baselined', () => {
    const baseline = diffCelebrations([], { seen: {}, baselinedTypes: [] }).nextState;
    const { toCelebrate, nextState } = diffCelebrations([ach('paidoff:a', 'paidoff')], baseline);
    expect(toCelebrate.map(m => m.key)).toEqual(['paidoff:a']);
    // already seen -> never again
    const again = diffCelebrations([ach('paidoff:a', 'paidoff')], nextState);
    expect(again.toCelebrate).toEqual([]);
  });
  it('keeps a seen key even when no longer achieved (no re-fire on re-cross)', () => {
    const baseline = diffCelebrations([], { seen: {}, baselinedTypes: [] }).nextState;
    const fired = diffCelebrations([ach('networth:100000', 'networth')], baseline).nextState;
    // dips below then crosses again — still seen, no celebration
    const recross = diffCelebrations([ach('networth:100000', 'networth')], fired);
    expect(recross.toCelebrate).toEqual([]);
    expect(recross.nextState.seen['networth:100000']).toBeTruthy();
  });
  it('baselines a newly-introduced type silently while still firing known types', () => {
    // state baselined for the old types only; a future type "newkind" appears
    const state = { seen: {}, baselinedTypes: ['paidoff', 'networth', 'bestmonth', 'streak'] };
    const { toCelebrate } = diffCelebrations(
      [ach('paidoff:a', 'paidoff'), ach('newkind:x', 'newkind')],
      state,
    );
    // paidoff:a is baselined+new -> fires; newkind:x first-seen type -> silent
    expect(toCelebrate.map(m => m.key)).toEqual(['paidoff:a']);
  });
  it('tolerates null/empty inputs', () => {
    const { toCelebrate, nextState } = diffCelebrations(null, undefined);
    expect(toCelebrate).toEqual([]);
    expect(nextState.seen).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/celebrationMath.test.js`
Expected: FAIL — `diffCelebrations is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/celebrationMath.js`:

```js
// Per-type baselining gives the guarantees:
//  - A milestone type's keys that are already achieved the first time we ever
//    run detection (or the first run after a NEW type ships) are absorbed into
//    `seen` silently — never celebrated.
//  - After a type is baselined, each of its keys fires exactly once, ever.
//  - Keys stay in `seen` even when no longer achieved, so re-crossing never re-fires.
export function diffCelebrations(achieved, state) {
  const seen = { ...((state && state.seen) || {}) };
  const baselined = new Set((state && state.baselinedTypes) || []);
  const toCelebrate = [];
  const stamp = Date.now();
  for (const m of achieved || []) {
    if (!baselined.has(m.type)) {
      seen[m.key] = stamp; // type not yet baselined -> absorb silently
    } else if (!(m.key in seen)) {
      toCelebrate.push(m);
      seen[m.key] = stamp;
    }
  }
  const baselinedTypes = Array.from(new Set([...baselined, ...CELEBRATION_TYPES]));
  return { toCelebrate, nextState: { seen, baselinedTypes } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/celebrationMath.test.js`
Expected: PASS (whole file green).

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/celebrationMath.js src/celebrationMath.test.js
git add src/celebrationMath.js src/celebrationMath.test.js
git commit -m "feat(celebrations): diffCelebrations per-type baseline + once-ever dedup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

**CHECKPOINT — pure detection complete.** Run `npx vitest run src/celebrationMath.test.js` and confirm all green before continuing.

---

## Task 7: `useCelebrations` hook (persistence + debounced detection + queue)

**Files:**
- Create: `src/useCelebrations.js`
- Test: `src/useCelebrations.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/useCelebrations.test.jsx`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useCelebrations from './useCelebrations.js';
import { DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';

const typesById = DEFAULT_ACCOUNT_TYPES_BY_ID;
const cats = new Map([['inc', { id: 'inc', flow: 'income' }]]);
const now = () => new Date('2026-06-15T00:00:00');
const STORAGE = 'tallio-celebrations';

const paidOffAccounts = [{ id: 'cc', name: 'Visa', type: 'credit_card', openingBalance: -100 }];
const paidOffTxns = [{ id: 't1', accountId: 'cc', date: '2026-02-10', amount: 100, categoryId: 'inc' }];

const tick = () => act(() => { vi.advanceTimersByTime(1); });

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useCelebrations', () => {
  it('baselines pre-existing milestones silently on first load', () => {
    const { result } = renderHook(() => useCelebrations({
      accounts: paidOffAccounts, transactions: paidOffTxns, typesById, categoriesById: cats, now, debounceMs: 0,
    }));
    tick();
    expect(result.current.current).toBeNull();
    const saved = JSON.parse(localStorage.getItem(STORAGE));
    expect(saved.seen['paidoff:cc']).toBeTruthy();
    expect(saved.baselinedTypes).toContain('paidoff');
  });

  it('fires exactly once for a milestone achieved after baseline, then dismiss clears it', () => {
    const { result, rerender } = renderHook(
      (props) => useCelebrations({ ...props, typesById, categoriesById: cats, now, debounceMs: 0 }),
      { initialProps: { accounts: [], transactions: [] } },
    );
    tick(); // baseline with empty ledger
    expect(result.current.current).toBeNull();

    rerender({ accounts: paidOffAccounts, transactions: paidOffTxns });
    tick();
    expect(result.current.current).toBeTruthy();
    expect(result.current.current.key).toBe('paidoff:cc');
    expect(result.current.current.title).toContain('Visa');

    act(() => result.current.dismiss());
    expect(result.current.current).toBeNull();

    // re-running detection on the same state does not re-fire
    rerender({ accounts: paidOffAccounts, transactions: [...paidOffTxns] });
    tick();
    expect(result.current.current).toBeNull();
  });

  it('style "off" suppresses the toast but still records the milestone as seen', () => {
    const { result, rerender } = renderHook(
      (props) => useCelebrations({ ...props, typesById, categoriesById: cats, now, debounceMs: 0 }),
      { initialProps: { accounts: [], transactions: [] } },
    );
    tick();
    act(() => result.current.setStyle('off'));
    expect(result.current.style).toBe('off');
    expect(JSON.parse(localStorage.getItem(STORAGE)).settings.style).toBe('off');

    rerender({ accounts: paidOffAccounts, transactions: paidOffTxns });
    tick();
    expect(result.current.current).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE)).seen['paidoff:cc']).toBeTruthy();
  });

  it('hydrates style from storage and tolerates corrupt storage', () => {
    localStorage.setItem(STORAGE, JSON.stringify({
      seen: {}, baselinedTypes: ['paidoff', 'networth', 'bestmonth', 'streak'], settings: { style: 'quiet' },
    }));
    const a = renderHook(() => useCelebrations({ accounts: [], transactions: [], typesById, categoriesById: cats, now, debounceMs: 0 }));
    expect(a.result.current.style).toBe('quiet');

    localStorage.setItem(STORAGE, '{bad json');
    const b = renderHook(() => useCelebrations({ accounts: [], transactions: [], typesById, categoriesById: cats, now, debounceMs: 0 }));
    expect(b.result.current.style).toBe('festive');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useCelebrations.test.jsx`
Expected: FAIL — "Failed to resolve import './useCelebrations.js'".

- [ ] **Step 3: Write minimal implementation**

Create `src/useCelebrations.js`:

```js
// src/useCelebrations.js
// Owns celebration tracking state (separate from financial data), runs debounced
// detection over the ledger, and exposes a one-at-a-time queue + the style setting.
import { useState, useEffect, useRef, useCallback } from 'react';
import { detectAchieved, diffCelebrations } from './celebrationMath.js';

const STORAGE_KEY = 'tallio-celebrations';
const VALID_STYLES = ['festive', 'quiet', 'off'];

export function loadCelebrationState() {
  const base = { seen: {}, baselinedTypes: [], style: 'festive' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw);
    const style = p && p.settings && VALID_STYLES.includes(p.settings.style) ? p.settings.style : 'festive';
    return {
      seen: (p && typeof p.seen === 'object' && p.seen) || {},
      baselinedTypes: Array.isArray(p && p.baselinedTypes) ? p.baselinedTypes : [],
      style,
    };
  } catch {
    return base;
  }
}

export default function useCelebrations({
  accounts, transactions, typesById, categoriesById, now, debounceMs = 400,
} = {}) {
  const [tracking, setTracking] = useState(() => {
    const i = loadCelebrationState();
    return { seen: i.seen, baselinedTypes: i.baselinedTypes };
  });
  const [style, setStyleState] = useState(() => loadCelebrationState().style);
  const [queue, setQueue] = useState([]);

  // Refs synced via effects only (react-hooks/refs v6: no ref mirroring in render).
  const trackingRef = useRef(tracking);
  useEffect(() => { trackingRef.current = tracking; }, [tracking]);
  const styleRef = useRef(style);
  useEffect(() => { styleRef.current = style; }, [style]);
  const nowRef = useRef(now);
  useEffect(() => { nowRef.current = now; }, [now]);

  const write = useCallback((tr, st) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        seen: tr.seen, baselinedTypes: tr.baselinedTypes, settings: { style: st },
      }));
    } catch { /* ignore quota */ }
  }, []);

  // Debounced detection: a transient balance crossing mid-edit won't fire.
  useEffect(() => {
    const handle = setTimeout(() => {
      const nowVal = nowRef.current ? nowRef.current() : new Date();
      const achieved = detectAchieved({ accounts, transactions, typesById, categoriesById, now: nowVal });
      const { toCelebrate, nextState } = diffCelebrations(achieved, trackingRef.current);
      setTracking(nextState);
      write(nextState, styleRef.current);
      if (styleRef.current !== 'off' && toCelebrate.length > 0) {
        setQueue((prev) => [...prev, ...toCelebrate]);
      }
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [accounts, transactions, typesById, categoriesById, debounceMs, write]);

  const dismiss = useCallback(() => setQueue((prev) => prev.slice(1)), []);

  const setStyle = useCallback((next) => {
    if (!VALID_STYLES.includes(next)) return;
    setStyleState(next);
    write(trackingRef.current, next);
  }, [write]);

  return { current: queue[0] || null, queueLength: queue.length, dismiss, style, setStyle };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useCelebrations.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/useCelebrations.js src/useCelebrations.test.jsx
git add src/useCelebrations.js src/useCelebrations.test.jsx
git commit -m "feat(celebrations): useCelebrations hook (persist + debounced detect + queue)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

**CHECKPOINT — detection + persistence complete.** Run `npx vitest run` and confirm the full suite is green before the visual layer.

---

## Task 8: `CelebrationLayer` component + styles

**Files:**
- Create: `src/CelebrationLayer.jsx`
- Create: `src/CelebrationLayer.css`
- Test: `src/CelebrationLayer.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/CelebrationLayer.test.jsx`:

```js
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import CelebrationLayer from './CelebrationLayer.jsx';

const cel = { key: 'paidoff:a', type: 'paidoff', title: 'Visa paid off!', detail: 'You cleared it 🎉' };
const noop = () => {};

afterEach(() => cleanup());

describe('CelebrationLayer', () => {
  it('renders nothing when style is off', () => {
    const { container } = render(<CelebrationLayer celebration={cel} style="off" reducedMotion={false} onDismiss={noop} autoDismissMs={0} />);
    expect(container.querySelector('.celebration')).toBeNull();
  });

  it('renders nothing when there is no celebration', () => {
    const { container } = render(<CelebrationLayer celebration={null} style="festive" reducedMotion={false} onDismiss={noop} autoDismissMs={0} />);
    expect(container.querySelector('.celebration')).toBeNull();
  });

  it('festive: renders confetti + toast with title and detail', () => {
    const { container } = render(<CelebrationLayer celebration={cel} style="festive" reducedMotion={false} onDismiss={noop} autoDismissMs={0} />);
    expect(container.querySelector('.celebration-confetti')).not.toBeNull();
    expect(container.querySelectorAll('.confetti-piece').length).toBeGreaterThan(0);
    expect(container.querySelector('.celebration-title').textContent).toBe('Visa paid off!');
    expect(container.querySelector('.celebration-detail').textContent).toContain('cleared');
  });

  it('quiet: toast only, no confetti', () => {
    const { container } = render(<CelebrationLayer celebration={cel} style="quiet" reducedMotion={false} onDismiss={noop} autoDismissMs={0} />);
    expect(container.querySelector('.celebration-confetti')).toBeNull();
    expect(container.querySelector('.celebration-toast')).not.toBeNull();
  });

  it('reduced-motion degrades festive to quiet (no confetti)', () => {
    const { container } = render(<CelebrationLayer celebration={cel} style="festive" reducedMotion={true} onDismiss={noop} autoDismissMs={0} />);
    expect(container.querySelector('.celebration-confetti')).toBeNull();
    expect(container.querySelector('.celebration').className).toContain('celebration-quiet');
  });

  it('confetti/overlay never blocks clicks; only the toast is interactive', () => {
    const { container } = render(<CelebrationLayer celebration={cel} style="festive" reducedMotion={false} onDismiss={noop} autoDismissMs={0} />);
    expect(container.querySelector('.celebration').style.pointerEvents).toBe('none');
    expect(container.querySelector('.celebration-toast').style.pointerEvents).toBe('auto');
  });

  it('is announced politely via aria-live', () => {
    const { container } = render(<CelebrationLayer celebration={cel} style="quiet" reducedMotion={false} onDismiss={noop} autoDismissMs={0} />);
    expect(container.querySelector('.celebration').getAttribute('aria-live')).toBe('polite');
  });

  it('the close button calls onDismiss', () => {
    let dismissed = false;
    const { getByLabelText } = render(<CelebrationLayer celebration={cel} style="quiet" reducedMotion={false} onDismiss={() => { dismissed = true; }} autoDismissMs={0} />);
    fireEvent.click(getByLabelText('Dismiss celebration'));
    expect(dismissed).toBe(true);
  });

  it('auto-dismisses after autoDismissMs', () => {
    vi.useFakeTimers();
    let count = 0;
    render(<CelebrationLayer celebration={cel} style="quiet" reducedMotion={false} onDismiss={() => { count += 1; }} autoDismissMs={6000} />);
    act(() => { vi.advanceTimersByTime(6000); });
    expect(count).toBe(1);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/CelebrationLayer.test.jsx`
Expected: FAIL — "Failed to resolve import './CelebrationLayer.jsx'".

- [ ] **Step 3: Write minimal implementation**

Create `src/CelebrationLayer.jsx`:

```jsx
// src/CelebrationLayer.jsx
// Thin presentational layer for one celebration at a time. Confetti is CSS/DOM
// (no canvas) and never blocks clicks; the toast carries the specifics.
import React, { useEffect } from 'react';
import './CelebrationLayer.css';

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const CONFETTI_COUNT = 24;

export default function CelebrationLayer({
  celebration, style = 'festive', reducedMotion, onDismiss, autoDismissMs = 6000,
}) {
  const rm = reducedMotion ?? prefersReducedMotion();
  const effective = style === 'off'
    ? 'off'
    : (style === 'festive' && !rm ? 'festive' : 'quiet');

  useEffect(() => {
    if (!celebration || effective === 'off' || !autoDismissMs) return undefined;
    const h = setTimeout(() => { if (onDismiss) onDismiss(); }, autoDismissMs);
    return () => clearTimeout(h);
  }, [celebration, effective, autoDismissMs, onDismiss]);

  if (!celebration || effective === 'off') return null;

  return (
    <div
      className={`celebration celebration-${effective}`}
      style={{ pointerEvents: 'none' }}
      role="status"
      aria-live="polite"
    >
      {effective === 'festive' && (
        <div className="celebration-confetti" aria-hidden="true">
          {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
            <span
              key={i}
              className={`confetti-piece p${i % 6}`}
              style={{ left: `${(i * 100) / CONFETTI_COUNT}%`, animationDelay: `${(i % 6) * 0.15}s` }}
            />
          ))}
        </div>
      )}
      <div className="celebration-toast" style={{ pointerEvents: 'auto' }}>
        <span className="celebration-emoji" aria-hidden="true">🎉</span>
        <div className="celebration-text">
          <div className="celebration-title">{celebration.title}</div>
          {celebration.detail && <div className="celebration-detail">{celebration.detail}</div>}
        </div>
        <button
          type="button"
          className="celebration-close"
          aria-label="Dismiss celebration"
          onClick={() => { if (onDismiss) onDismiss(); }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
```

Create `src/CelebrationLayer.css`:

```css
/* Celebration overlay — layered above all content, ignores clicks except the toast. */
.celebration { position: fixed; inset: 0; z-index: 1000; pointer-events: none; }

.celebration-confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.confetti-piece {
  position: absolute; top: -12px; width: 9px; height: 14px; border-radius: 2px;
  opacity: 0.9; animation: confetti-fall 2.8s linear forwards;
}
.confetti-piece.p0 { background: var(--accent, #5b8def); }
.confetti-piece.p1 { background: var(--green, #3ddc97); }
.confetti-piece.p2 { background: var(--warning, #ffd23f); }
.confetti-piece.p3 { background: var(--danger, #ee6c4d); }
.confetti-piece.p4 { background: var(--accent-2, #a06bff); }
.confetti-piece.p5 { background: var(--green, #3ddc97); }
@keyframes confetti-fall {
  0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(105vh) rotate(540deg); opacity: 0.9; }
}

.celebration-toast {
  position: absolute; right: 18px; bottom: 18px; pointer-events: auto;
  display: flex; align-items: center; gap: 10px; max-width: 320px;
  background: var(--bg-raised, #1a1f2b); color: var(--text, #e8edf5);
  border: 1px solid var(--border-strong, #3a4456); border-radius: 12px;
  padding: 12px 14px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
  animation: celebration-pop 0.25s ease-out;
}
.celebration-quiet .celebration-toast { animation: none; }
.celebration-emoji { font-size: 22px; }
.celebration-title { font-weight: 700; }
.celebration-detail { font-size: 13px; opacity: 0.8; }
.celebration-close {
  margin-left: 4px; background: none; border: none; color: inherit;
  font-size: 18px; line-height: 1; cursor: pointer; opacity: 0.6;
}
.celebration-close:hover { opacity: 1; }
@keyframes celebration-pop {
  from { transform: translateY(8px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .confetti-piece { animation: none; }
  .celebration-toast { animation: none; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/CelebrationLayer.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/CelebrationLayer.jsx src/CelebrationLayer.test.jsx
git add src/CelebrationLayer.jsx src/CelebrationLayer.css src/CelebrationLayer.test.jsx
git commit -m "feat(celebrations): CelebrationLayer (confetti/toast, reduced-motion, a11y)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 9: Wire into App + SettingsPanel control (manual-verify)

**Files:**
- Modify: `src/App.jsx` (import + hook instantiation near line 141; `<CelebrationLayer>` after `<BackgroundLayer>` ~line 441; SettingsPanel props ~line 523)
- Modify: `src/SettingsPanel.jsx`

No automated test (App has no test harness; SettingsPanel changes are verified manually + in the existing `SettingsPanel.test.jsx` smoke if present). This task ends in a manual-verify checkpoint.

- [ ] **Step 1: Add imports to `src/App.jsx`**

After the existing `import BackgroundLayer from './BackgroundLayer.jsx';` (line 14), add:

```jsx
import CelebrationLayer from './CelebrationLayer.jsx';
import useCelebrations from './useCelebrations.js';
```

- [ ] **Step 2: Instantiate the hook**

Immediately after `const library = useIconLibrary();` (line 141), add:

```jsx
  const celebrations = useCelebrations({
    accounts: ledger.accounts,
    transactions: ledger.transactions,
    typesById: accountTypes.typesById,
    categoriesById,
  });
```

- [ ] **Step 3: Mount the layer**

Immediately after the `<BackgroundLayer ... />` element (closes at line 441), add:

```jsx
      <CelebrationLayer
        celebration={celebrations.current}
        style={celebrations.style}
        onDismiss={celebrations.dismiss}
      />
```

- [ ] **Step 4: Pass style props to SettingsPanel**

Replace the SettingsPanel render (line 523):

```jsx
      {showSettings && <SettingsPanel settings={settings} onClose={closeSettings} banner={settingsBanner} />}
```

with:

```jsx
      {showSettings && (
        <SettingsPanel
          settings={settings}
          celebrationStyle={celebrations.style}
          onSetCelebrationStyle={celebrations.setStyle}
          onClose={closeSettings}
          banner={settingsBanner}
        />
      )}
```

- [ ] **Step 5: Add the Celebrations control to `src/SettingsPanel.jsx`**

Update the component signature (line 17):

```jsx
export default function SettingsPanel({ settings, celebrationStyle = 'festive', onSetCelebrationStyle, onClose, banner }) {
```

Then, inside `.settings-body`, immediately after the "Display size" stepper block (the `</div>` that closes `.settings-stepper`, line 108), insert:

```jsx
          <label className="settings-label" htmlFor="settings-celebrations">Celebrations</label>
          <select
            id="settings-celebrations"
            value={celebrationStyle}
            onChange={(e) => onSetCelebrationStyle && onSetCelebrationStyle(e.target.value)}
            className="settings-select"
          >
            <option value="festive">Festive — confetti + toast</option>
            <option value="quiet">Quiet — banner only</option>
            <option value="off">Off</option>
          </select>
          <p className="settings-help">
            A brief, dismissible note when you hit a milestone (debt paid off, net-worth
            goal, best savings month, savings streak). Respects reduced-motion.
          </p>
```

- [ ] **Step 6: Run the full suite + lint**

Run: `npx vitest run`
Expected: PASS (entire suite, including any existing `SettingsPanel.test.jsx`).

Run: `npx eslint src/App.jsx src/SettingsPanel.jsx`
Expected: zero NEW errors (pre-existing warnings in CategoryEditor/ColorPicker/IconPicker/spendingMath and the App.jsx camera-stream warning are not ours).

- [ ] **Step 7: Manual verify (`npm run dev -- --port 5174 --strictPort`)**

Confirm with the user, in the running app:
1. **No false fire on load** — existing data does not trigger a parade (baselined).
2. **Settings toggle** — Settings shows Festive / Quiet / Off; switching persists across reload.
3. **Festive** — make a milestone happen (e.g. add a transaction that clears a credit-card balance to ≥ 0): confetti + toast appear, confetti does not block clicks, toast × dismisses, auto-dismiss after ~6s.
4. **Quiet** — same milestone shows the toast with no confetti/animation.
5. **Off** — no celebration; re-enabling later does not replay the backlog.
6. **Reduced motion** — with OS "reduce motion" on, Festive degrades to the static toast.
7. **No re-fire** — reload after a celebration; it does not fire again.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/SettingsPanel.jsx
git commit -m "feat(celebrations): wire CelebrationLayer + useCelebrations into App; Settings toggle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Self-review (completed)

**Spec coverage:** A→Task 2; B→Task 1; C→Task 3; D→Task 4; `detectAchieved`→Task 5; per-type baselining / no-false-positive / once-ever→Task 6; debounced detection + `tallio-celebrations` persistence + queue + style→Task 7; festive/quiet/off + reduced-motion + CSS confetti + a11y + never-block→Task 8; App mount + SettingsPanel control + manual-verify of baseline/off/reduced-motion→Task 9. Deferred items (goal, reconcile, sound, every-net-positive) intentionally absent.

**Placeholder scan:** none — every step has complete code and exact commands.

**Type consistency:** detector outputs everywhere are `{ key, type, title, detail }`; `diffCelebrations(achieved, state)` → `{ toCelebrate, nextState:{ seen, baselinedTypes } }`; hook exposes `{ current, queueLength, dismiss, style, setStyle }`; `CelebrationLayer` props `{ celebration, style, reducedMotion, onDismiss, autoDismissMs }`; `CELEBRATION_TYPES` consistent across Tasks 5/6. Storage shape `{ seen, baselinedTypes, settings:{ style } }` consistent across hook load/write and tests.
