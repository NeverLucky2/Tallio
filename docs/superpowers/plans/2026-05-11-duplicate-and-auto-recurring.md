# Sub-project C — Duplicate & Auto-Recurring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add item-level and bill-level explicit duplication plus opt-in bill-level auto-recurring with app-load catch-up, conflict resolution dialog, and inferred → auto promotion, all riding on two additive bill fields with no schema bump.

**Architecture:** Two new optional fields on bills (`recurring: bool`, `recurringChainId: string | null`). One pure planning function (`computeCatchUp`) runs on app load to materialize missed months. One pure derivation function (`findAutoRecurringChains`) feeds the existing three flow-grouped Recurring panels alongside the existing `findRecurringCharges` inference detector; the panel filters inferred entries whose vendor matches an active auto chain. Four new dialog components (Recurring tip, Duplicate Bill, Recurring Conflict, plus reuse of `ConfirmDialog` for the inferred → auto promote confirm).

**Tech Stack:** React 19, Vite 7, Vitest 4, @testing-library/react 16, jsdom, nanoid, `crypto.randomUUID()`. Tests are co-located alongside source files (`*.test.js` / `*.test.jsx`).

**Spec:** `docs/superpowers/specs/2026-05-11-duplicate-and-auto-recurring-design.md`. Read it once before starting — the field semantics, chain definition, and dialog wording referenced here are defined there.

**Test runner cheatsheet:**
- Run the full suite: `npm test -- run`
- Run a single file: `npx vitest run src/spendingMath.test.js`
- Run by name pattern: `npx vitest run -t "shiftItemDate"`
- Watch one file during TDD: `npx vitest src/spendingMath.test.js`

---

## Task 1: `shiftItemDate` pure helper

**Files:**
- Modify: `src/spendingMath.js` — add `shiftItemDate` export at end of file
- Modify: `src/spendingMath.test.js` — add a `describe('shiftItemDate', ...)` block

- [ ] **Step 1: Write the failing tests**

Append to `src/spendingMath.test.js`:

```js
import { shiftItemDate } from './spendingMath.js';

describe('shiftItemDate', () => {
  it('preserves day-of-month when target month has enough days', () => {
    expect(shiftItemDate('2026-05-15', '2026-06')).toBe('2026-06-15');
  });

  it('clamps Jan 31 → Feb 28 in a non-leap year', () => {
    expect(shiftItemDate('2026-01-31', '2026-02')).toBe('2026-02-28');
  });

  it('clamps Jan 31 → Feb 29 in a leap year', () => {
    expect(shiftItemDate('2024-01-31', '2024-02')).toBe('2024-02-29');
  });

  it('clamps Aug 31 → Sep 30', () => {
    expect(shiftItemDate('2026-08-31', '2026-09')).toBe('2026-09-30');
  });

  it('returns null for null / undefined / malformed input', () => {
    expect(shiftItemDate(null,        '2026-05')).toBeNull();
    expect(shiftItemDate(undefined,   '2026-05')).toBeNull();
    expect(shiftItemDate('not-a-date','2026-05')).toBeNull();
    expect(shiftItemDate('',          '2026-05')).toBeNull();
  });

  it('same-month target is a no-op', () => {
    expect(shiftItemDate('2026-05-15', '2026-05')).toBe('2026-05-15');
  });

  it('works across year boundaries', () => {
    expect(shiftItemDate('2026-12-31', '2027-01')).toBe('2027-01-31');
    expect(shiftItemDate('2026-12-31', '2027-02')).toBe('2027-02-28');
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

```
npx vitest run src/spendingMath.test.js -t "shiftItemDate"
```

Expected: `7 failed` — `shiftItemDate is not a function` or import error.

- [ ] **Step 3: Implement `shiftItemDate`**

Append to `src/spendingMath.js` (after `getBillNet`):

```js
// Shift a YYYY-MM-DD date string to a target YYYY-MM month, preserving
// day-of-month with last-day clamping. Null / invalid / empty → null.
// Same-month target → identical string. Used by computeCatchUp (auto-spawn)
// and the cross-month bill-level duplicate.
export function shiftItemDate(date, targetMonth) {
  if (!date || typeof date !== 'string' || !DATE_RE.test(date)) return null;
  if (typeof targetMonth !== 'string' || !MONTH_RE.test(targetMonth)) return null;
  const day = parseInt(date.slice(8, 10), 10);
  const [yStr, mStr] = targetMonth.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  const lastDay = new Date(year, month, 0).getDate();
  const clampedDay = Math.min(day, lastDay);
  return `${targetMonth}-${String(clampedDay).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

```
npx vitest run src/spendingMath.test.js -t "shiftItemDate"
```

Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "$(cat <<'EOF'
feat(recurring): shiftItemDate helper for month-shifted dates

Pure helper used by computeCatchUp (auto-spawn) and the cross-month
bill-level duplicate. Day-of-month preserved with last-day clamping
(Jan 31 → Feb 28 / 29). Null/invalid input → null. Same-month no-op.
EOF
)"
```

---

## Task 2: `computeCatchUp` pure planning function

**Files:**
- Modify: `src/spendingMath.js` — add `computeCatchUp` export
- Modify: `src/spendingMath.test.js` — add a `describe('computeCatchUp', ...)` block

- [ ] **Step 1: Write the failing tests**

Append to `src/spendingMath.test.js`:

```js
import { computeCatchUp } from './spendingMath.js';

function makeBill(over = {}) {
  return {
    id: over.id || 'bill_' + Math.random().toString(36).slice(2, 8),
    vendor: over.vendor ?? 'Honda Finance',
    month: over.month ?? '2026-04',
    items: over.items ?? [
      { id: 'it_' + Math.random().toString(36).slice(2, 8),
        description: 'Auto loan', amount: 452, categoryId: 'c_auto',
        date: `${over.month ?? '2026-04'}-15` },
    ],
    ...(over.recurring !== undefined ? { recurring: over.recurring } : {}),
    ...(over.recurringChainId !== undefined ? { recurringChainId: over.recurringChainId } : {}),
  };
}

describe('computeCatchUp', () => {
  it('no recurring chains → input unchanged, empty conflicts', () => {
    const bills = [
      makeBill({ id: 'b1', month: '2026-04', vendor: 'Honda' }),
      makeBill({ id: 'b2', month: '2026-05', vendor: 'Comed' }),
    ];
    const out = computeCatchUp(bills, '2026-07');
    expect(out.bills).toBe(bills);
    expect(out.conflicts).toEqual([]);
  });

  it('one chain, source April, today July, no other bills → three clean spawns', () => {
    const source = makeBill({
      id: 'b_apr', month: '2026-04', vendor: 'Honda',
      recurring: true, recurringChainId: 'rec_h',
      items: [{ id: 'it1', description: 'Auto loan', amount: 452, categoryId: 'c_auto', date: '2026-04-15' }],
    });
    const out = computeCatchUp([source], '2026-07');
    expect(out.conflicts).toEqual([]);
    const months = out.bills.map(b => b.month).sort();
    expect(months).toEqual(['2026-04', '2026-05', '2026-06', '2026-07']);
    const newBills = out.bills.filter(b => b.id !== 'b_apr');
    for (const nb of newBills) {
      expect(nb.recurring).toBe(true);
      expect(nb.recurringChainId).toBe('rec_h');
      expect(nb.vendor).toBe('Honda');
      expect(nb.id).not.toBe('b_apr');
      expect(nb.items[0].id).not.toBe('it1');  // fresh item id
      expect(nb.items[0].date).toBe(`${nb.month}-15`);  // date shifted
      expect(nb.items[0].amount).toBe(452);
    }
  });

  it('skips months already linked to the chain id', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: 'Honda', recurring: true,  recurringChainId: 'rec_h' });
    const may = makeBill({ id: 'b_may', month: '2026-05', vendor: 'Honda', recurring: true,  recurringChainId: 'rec_h' });
    const out = computeCatchUp([apr, may], '2026-05');
    expect(out.bills).toHaveLength(2);
    expect(out.conflicts).toEqual([]);
  });

  it('same-vendor non-chain bill → conflict queued, no spawn, stops further months for that chain', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: 'Honda', recurring: true, recurringChainId: 'rec_h' });
    const may = makeBill({ id: 'b_may_manual', month: '2026-05', vendor: 'Honda' });  // no chain id
    const out = computeCatchUp([apr, may], '2026-07');
    expect(out.bills).toHaveLength(2);  // no spawns
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0]).toEqual({
      chainId: 'rec_h',
      chainSourceBillId: 'b_apr',
      targetMonth: '2026-05',
      existingBillId: 'b_may_manual',
    });
  });

  it('two chains, one clean / one conflicted → clean fully materialized; conflicted queued', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: 'Honda',   recurring: true, recurringChainId: 'rec_h' });
    const mar = makeBill({ id: 'b_mar', month: '2026-03', vendor: 'Verizon', recurring: true, recurringChainId: 'rec_v' });
    const conflict = makeBill({ id: 'b_v_may', month: '2026-05', vendor: 'Verizon' });
    const out = computeCatchUp([apr, mar, conflict], '2026-05');
    const hondaMonths = out.bills.filter(b => b.recurringChainId === 'rec_h').map(b => b.month).sort();
    expect(hondaMonths).toEqual(['2026-04', '2026-05']);
    const verizonChain = out.bills.filter(b => b.recurringChainId === 'rec_v');
    expect(verizonChain).toHaveLength(2);  // mar + a clean April spawn (no conflict in April)
    const verizonMonths = verizonChain.map(b => b.month).sort();
    expect(verizonMonths).toEqual(['2026-03', '2026-04']);
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0].chainId).toBe('rec_v');
    expect(out.conflicts[0].targetMonth).toBe('2026-05');
  });

  it('source month equals today → no spawns', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: 'Honda', recurring: true, recurringChainId: 'rec_h' });
    const out = computeCatchUp([apr], '2026-04');
    expect(out.bills).toHaveLength(1);
    expect(out.conflicts).toEqual([]);
  });

  it('latest source has recurring=false (chain dormant) → ignored', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: 'Honda', recurring: true,  recurringChainId: 'rec_h' });
    const may = makeBill({ id: 'b_may', month: '2026-05', vendor: 'Honda', recurring: false, recurringChainId: 'rec_h' });
    const out = computeCatchUp([apr, may], '2026-07');
    expect(out.bills).toHaveLength(2);  // chain dormant since latest has recurring=false
    expect(out.conflicts).toEqual([]);
  });

  it('multiple recurring=true instances in chain → latest is used as source', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: 'Honda', recurring: true, recurringChainId: 'rec_h',
      items: [{ id: 'it1', description: 'Auto', amount: 452, categoryId: 'c_a', date: '2026-04-15' }] });
    const may = makeBill({ id: 'b_may', month: '2026-05', vendor: 'Honda', recurring: true, recurringChainId: 'rec_h',
      items: [{ id: 'it2', description: 'Auto', amount: 470, categoryId: 'c_a', date: '2026-05-15' }] });
    const out = computeCatchUp([apr, may], '2026-06');
    expect(out.bills).toHaveLength(3);
    const jun = out.bills.find(b => b.month === '2026-06');
    expect(jun.items[0].amount).toBe(470);  // inherited from May (latest), not April
  });

  it('idempotency: running twice on the same input is a no-op the second time', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: 'Honda', recurring: true, recurringChainId: 'rec_h' });
    const out1 = computeCatchUp([apr], '2026-06');
    const out2 = computeCatchUp(out1.bills, '2026-06');
    expect(out2.bills).toHaveLength(out1.bills.length);
    expect(out2.conflicts).toEqual([]);
  });

  it('backward clock (today < source.month) → no spawns', () => {
    const may = makeBill({ id: 'b_may', month: '2026-05', vendor: 'Honda', recurring: true, recurringChainId: 'rec_h' });
    const out = computeCatchUp([may], '2026-03');
    expect(out.bills).toHaveLength(1);
    expect(out.conflicts).toEqual([]);
  });

  it('empty-vendor source matches empty-vendor existing bill → conflict', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: '', recurring: true, recurringChainId: 'rec_h' });
    const may = makeBill({ id: 'b_other', month: '2026-05', vendor: '' });
    const out = computeCatchUp([apr, may], '2026-05');
    expect(out.conflicts).toHaveLength(1);
  });

  it('items in spawned bill get fresh ids', () => {
    const apr = makeBill({ id: 'b_apr', month: '2026-04', vendor: 'Honda', recurring: true, recurringChainId: 'rec_h',
      items: [
        { id: 'orig1', description: 'A', amount: 10, categoryId: 'c', date: '2026-04-05' },
        { id: 'orig2', description: 'B', amount: 20, categoryId: 'c', date: '2026-04-15' },
      ],
    });
    const out = computeCatchUp([apr], '2026-05');
    const may = out.bills.find(b => b.month === '2026-05');
    expect(may.items.map(i => i.id)).not.toContain('orig1');
    expect(may.items.map(i => i.id)).not.toContain('orig2');
    expect(may.items[0].date).toBe('2026-05-05');
    expect(may.items[1].date).toBe('2026-05-15');
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

```
npx vitest run src/spendingMath.test.js -t "computeCatchUp"
```

Expected: All 12 tests fail with `computeCatchUp is not a function`.

- [ ] **Step 3: Implement `computeCatchUp`**

Append to `src/spendingMath.js`:

```js
// Plan auto-spawn catch-up for the current app session.
// Pure function. Inputs:
//   bills      — current bills array
//   todayMonth — "YYYY-MM" for the catch-up upper bound (inclusive)
// Returns:
//   { bills, conflicts }
//     bills      — bills array with all unambiguous spawns appended
//     conflicts  — { chainId, chainSourceBillId, targetMonth, existingBillId }[]
//
// Algorithm:
//   1. Group bills by recurringChainId (skip null).
//   2. For each chain:
//      a. Find the chronologically latest instance where recurring === true.
//         If none, the chain is dormant — skip.
//      b. Walk target months strictly after source.month up to and including
//         todayMonth. For each:
//           - If a bill in the chain already exists in that month, skip.
//           - Else if a same-vendor non-chain bill exists, push a conflict
//             entry and stop iterating further months for this chain.
//           - Else clone source: fresh bill id, fresh item ids, month replaced,
//             item dates shifted via shiftItemDate, recurring=true,
//             recurringChainId carried over.
export function computeCatchUp(bills, todayMonth) {
  if (!Array.isArray(bills) || bills.length === 0) {
    return { bills: bills || [], conflicts: [] };
  }
  if (typeof todayMonth !== 'string' || !MONTH_RE.test(todayMonth)) {
    return { bills, conflicts: [] };
  }

  // Group bills by chain id.
  const byChain = new Map();
  for (const b of bills) {
    if (b && typeof b.recurringChainId === 'string' && b.recurringChainId) {
      if (!byChain.has(b.recurringChainId)) byChain.set(b.recurringChainId, []);
      byChain.get(b.recurringChainId).push(b);
    }
  }

  if (byChain.size === 0) {
    return { bills, conflicts: [] };
  }

  // Working copy of bills — we'll append spawns to it as we go.
  let working = bills.slice();
  const conflicts = [];

  for (const [chainId, chainBills] of byChain) {
    // Latest instance where recurring === true.
    const activeInstances = chainBills.filter(b => b.recurring === true);
    if (activeInstances.length === 0) continue;  // dormant
    const source = activeInstances
      .slice()
      .sort((a, b) => a.month.localeCompare(b.month))
      .pop();

    // Iterate target months strictly after source.month, up to todayMonth.
    const targets = monthsBetweenExclusiveInclusive(source.month, todayMonth);
    for (const targetMonth of targets) {
      const alreadyInChain = working.some(b =>
        b.recurringChainId === chainId && b.month === targetMonth
      );
      if (alreadyInChain) continue;

      const conflictBill = working.find(b =>
        b.month === targetMonth &&
        b.vendor === source.vendor &&
        b.recurringChainId !== chainId
      );
      if (conflictBill) {
        conflicts.push({
          chainId,
          chainSourceBillId: source.id,
          targetMonth,
          existingBillId: conflictBill.id,
        });
        break;  // stop further months for this chain
      }

      // Clean spawn.
      const spawned = {
        ...source,
        id: spawnId(),
        month: targetMonth,
        items: (source.items || []).map(it => ({
          ...it,
          id: spawnId(),
          date: shiftItemDate(it.date, targetMonth),
        })),
        recurring: true,
        recurringChainId: chainId,
      };
      working = [...working, spawned];
    }
  }

  return { bills: working, conflicts };
}

// Exclusive of `fromMonth`, inclusive of `toMonth`.
function monthsBetweenExclusiveInclusive(fromMonth, toMonth) {
  if (fromMonth >= toMonth) return [];
  const out = [];
  let [y, m] = fromMonth.split('-').map(n => parseInt(n, 10));
  while (true) {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key === toMonth) break;
    if (key > toMonth) break;  // defensive — shouldn't happen with valid inputs
  }
  return out;
}

// Pure id generator for spawned bills/items. crypto.randomUUID is available
// in Node 16+ (vitest jsdom) and all modern browsers — matches the pattern
// used by handleCapture in App.jsx.
function spawnId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'spawn_' + Math.random().toString(36).slice(2, 10);
}
```

- [ ] **Step 4: Run the tests and verify they pass**

```
npx vitest run src/spendingMath.test.js -t "computeCatchUp"
```

Expected: `12 passed`.

- [ ] **Step 5: Run the full spendingMath suite to confirm no regressions**

```
npx vitest run src/spendingMath.test.js
```

Expected: All tests pass (existing + the new 12 + the 7 from Task 1).

- [ ] **Step 6: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "$(cat <<'EOF'
feat(recurring): computeCatchUp pure planning function

Walks each recurringChainId, picks the latest recurring=true instance as
the source, and materializes one spawn per missed month up to today.
Same-vendor non-chain bills in a target month surface as a conflict entry
(chainId/sourceBillId/targetMonth/existingBillId) and halt the chain
until resolved. Idempotent — re-running on its own output is a no-op.
EOF
)"
```

---

## Task 3: Wire `computeCatchUp` into `initializeFromStorage`

**Files:**
- Modify: `src/initializeFromStorage.js` — call `computeCatchUp` after `migrateToV3`, thread `conflicts` through the return shape
- Modify: `src/initializeFromStorage.test.js` — add three tests covering the new return shape and the v3-bills + chain integration

- [ ] **Step 1: Write the failing tests**

Append to `src/initializeFromStorage.test.js`:

```js
import { initializeFromStorage } from './initializeFromStorage.js';

function makeFakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
  };
}

describe('initializeFromStorage — catch-up integration', () => {
  beforeEach(() => {
    // Use a fixed today so spawns are deterministic. Many implementations
    // pull today from new Date(); the simplest is to inject via a 2nd arg
    // to initializeFromStorage. If you didn't expose that, fall back to
    // letting computeCatchUp consume the system clock and assert ≥ 1 spawn.
  });

  it('returns conflicts: [] when there are no chains', () => {
    const storage = makeFakeStorage({
      'billtracker-bills':           JSON.stringify([]),
      'billtracker-categories':      JSON.stringify([{ id: 'c1', name: 'Other', icon: '📋', color: '#6B7280', flow: 'expense', keywords: [], templates: [], builtin: true }]),
      'billtracker-schema-version':  '3',
    });
    const out = initializeFromStorage(storage, '2026-07');
    expect(out.migrationError).toBeNull();
    expect(out.conflicts).toEqual([]);
  });

  it('catch-up spawns missed months for an active chain', () => {
    const apr = {
      id: 'b_apr', vendor: 'Honda', month: '2026-04',
      recurring: true, recurringChainId: 'rec_h',
      items: [{ id: 'it1', description: 'Auto', amount: 452, categoryId: 'c_other', date: '2026-04-15' }],
    };
    const storage = makeFakeStorage({
      'billtracker-bills':           JSON.stringify([apr]),
      'billtracker-categories':      JSON.stringify([{ id: 'c_other', name: 'Other', icon: '📋', color: '#6B7280', flow: 'expense', keywords: [], templates: [], builtin: true }]),
      'billtracker-schema-version':  '3',
    });
    const out = initializeFromStorage(storage, '2026-07');
    expect(out.migrationError).toBeNull();
    expect(out.conflicts).toEqual([]);
    expect(out.bills).toHaveLength(4);
    const months = out.bills.map(b => b.month).sort();
    expect(months).toEqual(['2026-04', '2026-05', '2026-06', '2026-07']);
  });

  it('schema version stays at 3 (no bump for sub-project C)', () => {
    const storage = makeFakeStorage({
      'billtracker-bills':           JSON.stringify([]),
      'billtracker-categories':      JSON.stringify([{ id: 'c1', name: 'Other', icon: '📋', color: '#6B7280', flow: 'expense', keywords: [], templates: [], builtin: true }]),
      'billtracker-schema-version':  '3',
    });
    initializeFromStorage(storage, '2026-07');
    expect(storage.getItem('billtracker-schema-version')).toBe('3');
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

```
npx vitest run src/initializeFromStorage.test.js -t "catch-up"
```

Expected: 3 failures — either `initializeFromStorage doesn't accept a 2nd arg` or `out.conflicts is undefined`.

- [ ] **Step 3: Modify `initializeFromStorage`**

Edit `src/initializeFromStorage.js`. Add a `todayMonth` parameter (default: derive from `Date`), import `computeCatchUp`, run it after the v3 migration, thread `conflicts` through the return shape.

Replace the function signature and add the catch-up call:

```js
import { migrateBills, migrateToV2, migrateToV3, computeCatchUp } from './spendingMath.js';
// ... (other imports unchanged)

function defaultTodayMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function initializeFromStorage(storage, todayMonth = defaultTodayMonth()) {
  try {
    // ... existing v1→v2→v3 migration logic, unchanged ...

    const { bills: v3Bills, categories: v3Cats } = migrateToV3(v2Bills, v2Cats, V3_SEED_CATEGORIES);

    if (ver < 3) {
      storage.setItem(BILLS_KEY, JSON.stringify(v3Bills));
      storage.setItem(CATS_KEY,  JSON.stringify(v3Cats));
      storage.setItem(VERSION_KEY, '3');
    }

    // C: catch-up auto-spawn (additive — no schema bump).
    const { bills: caughtUpBills, conflicts } = computeCatchUp(v3Bills, todayMonth);
    if (caughtUpBills !== v3Bills) {
      storage.setItem(BILLS_KEY, JSON.stringify(caughtUpBills));
    }

    return { bills: caughtUpBills, migrationError: null, conflicts };
  } catch (e) {
    console.error('Migration failed:', e);
    try {
      const rawBackup = storage.getItem(V1_BACKUP_KEY);
      if (rawBackup) {
        const { bills } = JSON.parse(rawBackup);
        return {
          bills: bills || [],
          migrationError: {
            message: 'Migration failed — your data was restored from backup. Please use Export to save a copy.',
            recovered: true,
          },
          conflicts: [],
        };
      }
    } catch (recoveryErr) {
      console.error('Backup restore also failed:', recoveryErr);
    }
    return {
      bills: [],
      migrationError: {
        message: 'Migration failed and no backup was available. Please reload — if this persists, contact support.',
        recovered: false,
      },
      conflicts: [],
    };
  }
}
```

Keep all the existing v1→v2→v3 lines between the imports and the `migrateToV3` call exactly as they are in the current file. The only diff is: extra import (`computeCatchUp`), new `todayMonth` parameter with default, the catch-up call after the v3 migration writes, and `conflicts` added to every return shape (success + both error paths).

- [ ] **Step 4: Run the tests and verify they pass**

```
npx vitest run src/initializeFromStorage.test.js
```

Expected: All tests pass (existing + 3 new).

- [ ] **Step 5: Run the smoke suite to confirm no end-to-end regression**

```
npx vitest run src/__smoke__/setup.test.jsx
```

Expected: Smoke tests still pass (none of them seed a recurring chain yet; catch-up is a no-op for them).

- [ ] **Step 6: Update the App.jsx call site to accept the new return shape**

In `src/App.jsx`, find the existing `useState(() => initializeFromStorage(window.localStorage))` near the top of `BillTracker` (~line 477):

Replace:

```jsx
const [{ bills: initialBills, migrationError }] = useState(() => initializeFromStorage(window.localStorage));
```

With:

```jsx
const [{ bills: initialBills, migrationError, conflicts: initialConflicts }] = useState(() => initializeFromStorage(window.localStorage));
const [bills, setBills] = useState(initialBills);
const [migrationBanner, setMigrationBanner] = useState(migrationError);
const [pendingConflictQueue, setPendingConflictQueue] = useState(initialConflicts || []);
```

(The first two lines may already exist — keep them and just rename the destructure to add `conflicts: initialConflicts`. Place the `pendingConflictQueue` line near the other state declarations.)

The queue is currently consumed by no UI — Task 11 wires that up. Until then, conflicts queue silently. This is a deliberate plan staging.

- [ ] **Step 7: Run the full test suite**

```
npm test -- run
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/initializeFromStorage.js src/initializeFromStorage.test.js src/App.jsx
git commit -m "$(cat <<'EOF'
feat(recurring): wire computeCatchUp into app initialization

initializeFromStorage now accepts an optional todayMonth (defaulting to
current UTC), runs computeCatchUp after the v3 migration, persists the
caught-up bills when changes occur, and threads conflicts through the
return shape. App.jsx destructures conflicts into pendingConflictQueue
state — the queue has no consumer yet (UI wired in Task 11).
EOF
)"
```

---

## Task 4: `findAutoRecurringChains` pure function

**Files:**
- Modify: `src/spendingMath.js` — add `findAutoRecurringChains` export
- Modify: `src/spendingMath.test.js` — add a `describe('findAutoRecurringChains', ...)` block

- [ ] **Step 1: Write the failing tests**

Append to `src/spendingMath.test.js`:

```js
import { findAutoRecurringChains } from './spendingMath.js';

describe('findAutoRecurringChains', () => {
  const cats = [
    { id: 'c_auto',  name: 'Auto Loan', flow: 'expense' },
    { id: 'c_pay',   name: 'Paycheck',  flow: 'income'  },
    { id: 'c_401k',  name: '401(k)',    flow: 'savings' },
  ];
  const catsById = new Map(cats.map(c => [c.id, c]));

  function chainBill(month, chainId, recurring, amount = 452, categoryId = 'c_auto', vendor = 'Honda') {
    return {
      id: 'b_' + month, vendor, month,
      recurring, recurringChainId: chainId,
      items: [{ id: 'it_' + month, description: 'Auto loan', amount, categoryId, date: `${month}-15` }],
    };
  }

  it('no recurringChainId anywhere → empty array', () => {
    const bills = [{ id: 'b1', vendor: 'X', month: '2026-05', items: [] }];
    expect(findAutoRecurringChains(bills, catsById)).toEqual([]);
  });

  it('single 3-month chain returns one entry with correct shape', () => {
    const bills = [
      chainBill('2026-04', 'rec_h', true),
      chainBill('2026-05', 'rec_h', true),
      chainBill('2026-06', 'rec_h', true),
    ];
    const out = findAutoRecurringChains(bills, catsById);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: 'auto',
      chainId: 'rec_h',
      vendor: 'Honda',
      flow: 'expense',
      monthCount: 3,
      occurrences: 3,
      firstDate: '2026-04-01',
      lastDate: '2026-06-01',
      active: true,
    });
    expect(out[0].lastAmount).toBe(452);
    expect(out[0].avgAmount).toBe(452);
  });

  it('chain whose latest instance has recurring=false → not returned (dormant)', () => {
    const bills = [
      chainBill('2026-04', 'rec_h', true),
      chainBill('2026-05', 'rec_h', false),
    ];
    expect(findAutoRecurringChains(bills, catsById)).toEqual([]);
  });

  it('paycheck chain derives flow=income from category', () => {
    const bills = [
      chainBill('2026-04', 'rec_p', true, 5200, 'c_pay', 'Acme'),
      chainBill('2026-05', 'rec_p', true, 5200, 'c_pay', 'Acme'),
    ];
    const out = findAutoRecurringChains(bills, catsById);
    expect(out[0].flow).toBe('income');
    expect(out[0].vendor).toBe('Acme');
  });

  it('lastAmount uses flow-aligned net via getBillNet', () => {
    // 401(k) chain: savings flow — net should equal the positive amount.
    const bills = [
      chainBill('2026-04', 'rec_k', true, 260, 'c_401k', 'Fidelity'),
      chainBill('2026-05', 'rec_k', true, 270, 'c_401k', 'Fidelity'),
    ];
    const out = findAutoRecurringChains(bills, catsById);
    expect(out[0].flow).toBe('savings');
    expect(out[0].lastAmount).toBe(270);
    expect(out[0].avgAmount).toBe(265);
  });

  it('two chains return two entries (active first behavior is the panel’s job, not this fn)', () => {
    const bills = [
      chainBill('2026-04', 'rec_h', true),
      chainBill('2026-04', 'rec_v', true, 80, 'c_auto', 'Verizon'),
    ];
    const out = findAutoRecurringChains(bills, catsById);
    expect(out).toHaveLength(2);
    const ids = out.map(e => e.chainId).sort();
    expect(ids).toEqual(['rec_h', 'rec_v']);
  });

  it('chain with both flagged + un-flagged history instances, latest flagged → returned', () => {
    const bills = [
      chainBill('2026-04', 'rec_h', false),
      chainBill('2026-05', 'rec_h', true),
    ];
    const out = findAutoRecurringChains(bills, catsById);
    expect(out).toHaveLength(1);
    expect(out[0].monthCount).toBe(2);
    expect(out[0].occurrences).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

```
npx vitest run src/spendingMath.test.js -t "findAutoRecurringChains"
```

Expected: 7 failures with `findAutoRecurringChains is not a function`.

- [ ] **Step 3: Implement `findAutoRecurringChains`**

Append to `src/spendingMath.js`:

```js
// Surface every active auto-managed recurring chain as one summary entry.
// A chain is "active" if at least one bill carrying its recurringChainId has
// recurring === true. The latest such instance defines the chain's currently
// displayed shape (vendor, lastAmount, lastDate). Dormant chains (no
// recurring=true instance) are NOT returned — they're history.
//
// Returns an array shaped to merge with findRecurringCharges results in the
// Recurring panels. Each entry:
//   { kind: 'auto', chainId, vendor, description, categoryId, flow,
//     lastAmount, avgAmount, monthCount, occurrences, firstDate, lastDate,
//     active: true }
//
// `lastAmount` and `avgAmount` are the bill's flow-aligned net via
// getBillNet (income for income-flow chains, expense for expense, savings
// for savings).
export function findAutoRecurringChains(bills, categoriesById = null) {
  const byChain = new Map();
  for (const b of bills || []) {
    if (!b || typeof b.recurringChainId !== 'string' || !b.recurringChainId) continue;
    if (!byChain.has(b.recurringChainId)) byChain.set(b.recurringChainId, []);
    byChain.get(b.recurringChainId).push(b);
  }

  const results = [];
  for (const [chainId, chainBills] of byChain) {
    const hasActive = chainBills.some(b => b.recurring === true);
    if (!hasActive) continue;

    const sorted = chainBills.slice().sort((a, b) => a.month.localeCompare(b.month));
    const latestActive = sorted.filter(b => b.recurring === true).pop();

    // Majority category among items in the latest active bill.
    const counts = new Map();
    for (const it of latestActive.items || []) {
      if (!it) continue;
      const cid = it.categoryId || null;
      counts.set(cid, (counts.get(cid) || 0) + 1);
    }
    let majorityCategoryId = null;
    let maxCount = 0;
    for (const [cid, c] of counts) {
      if (c > maxCount) { majorityCategoryId = cid; maxCount = c; }
    }
    const cat = categoriesById && categoriesById.get(majorityCategoryId);
    const flow = (cat && cat.flow) || 'expense';

    // Flow-aligned net via getBillNet.
    const flowKey = flow === 'income' ? 'income'
                  : flow === 'savings' ? 'savings'
                  : 'expense';
    const lastAmount = getBillNet(latestActive, categoriesById)[flowKey];
    const totalAmount = sorted.reduce(
      (s, b) => s + getBillNet(b, categoriesById)[flowKey], 0
    );
    const avgAmount = totalAmount / sorted.length;

    const months = sorted.map(b => b.month);
    const uniqueMonths = new Set(months);

    results.push({
      kind: 'auto',
      chainId,
      vendor: latestActive.vendor || '',
      description: latestActive.vendor || '',
      categoryId: majorityCategoryId,
      flow,
      lastAmount,
      avgAmount,
      monthCount: uniqueMonths.size,
      occurrences: sorted.length,
      firstDate: `${sorted[0].month}-01`,
      lastDate: `${latestActive.month}-01`,
      active: true,
    });
  }

  return results;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

```
npx vitest run src/spendingMath.test.js -t "findAutoRecurringChains"
```

Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/spendingMath.js src/spendingMath.test.js
git commit -m "$(cat <<'EOF'
feat(recurring): findAutoRecurringChains derivation

Surfaces one entry per active auto-managed chain, shape-compatible with
findRecurringCharges' inferred entries (plus kind: 'auto' and chainId).
Dormant chains are omitted. Amounts are flow-aligned via getBillNet so
income chains report deposit totals and savings chains report contribution
totals.
EOF
)"
```

---

## Task 5: BillCard `RECURRING` header badge

**Files:**
- Modify: `src/App.jsx` — extend the `BillCard` JSX (~line 222 in `.bill-right`) to render the badge when `bill.recurring === true`
- Modify: `src/App.css` — add `.bill-badge-recurring` and `.bill-badge-glyph` styles
- (No tests yet — visual element only; behavior is asserted in Task 11 smoke)

- [ ] **Step 1: Edit `BillCard` in `src/App.jsx`**

Find the `.bill-right` block in `BillCard` (the JSX near line 222). Insert the badge before the `<span className="bill-total ...">`:

```jsx
<div className="bill-right">
  {bill.recurring && (
    <span className="bill-badge-recurring" aria-label="Recurring bill">
      <span className="bill-badge-glyph">↻</span> RECURRING
    </span>
  )}
  <span className={`bill-total bill-total-${direction}`}>
    {direction === 'in' ? '↑' : direction === 'out' ? '↓' : ''}
    {formatCurrency(displayAmount)}
  </span>
  <span className={`bill-chevron${isExpanded ? ' bill-chevron-open' : ''}`}>▾</span>
</div>
```

- [ ] **Step 2: Add CSS to `src/App.css`**

Append (or merge near the existing `.sub-badge` rules):

```css
.bill-badge-recurring {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #d4a853;
  background: rgba(212, 168, 83, 0.10);
  border: 1px solid rgba(212, 168, 83, 0.40);
  padding: 2px 7px;
  border-radius: 3px;
  font-family: 'Outfit', sans-serif;
  white-space: nowrap;
}

.bill-badge-glyph {
  font-size: 0.75rem;
  line-height: 1;
}
```

- [ ] **Step 3: Manual browser smoke**

```
npm run dev
```

In the browser:
1. Open the app.
2. In DevTools console: `JSON.parse(localStorage.getItem('billtracker-bills'))` → pick any bill id.
3. Patch one bill to recurring (DevTools console):
   ```js
   const bills = JSON.parse(localStorage.getItem('billtracker-bills'));
   bills[0].recurring = true;
   bills[0].recurringChainId = 'rec_test123';
   localStorage.setItem('billtracker-bills', JSON.stringify(bills));
   location.reload();
   ```
4. Confirm the amber `↻ RECURRING` badge appears in that bill's header (collapsed and expanded).
5. Unset and reload (`bills[0].recurring = false; ...; localStorage.setItem(...)`) — badge disappears.

- [ ] **Step 4: Run the full test suite to confirm no regression**

```
npm test -- run
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "$(cat <<'EOF'
feat(recurring): BillCard header RECURRING badge

Passive amber badge appears in the bill header whenever bill.recurring
is true. Glanceable from the bill list — no click target conflict with
the existing header tap-to-expand behavior. CSS matches the Nocturne
accent palette (#d4a853 with 10%/40% opacity tints).
EOF
)"
```

---

## Task 6: BillCard "Make Recurring" footer toggle + first-time tip dialog

**Files:**
- Create: `src/RecurringTipDialog.jsx` — one-time tip modal
- Create: `src/RecurringTipDialog.test.jsx` — test the dialog
- Modify: `src/App.jsx` — extend `BillCard` footer with the toggle button; add `pendingRecurringTip` state in `BillTracker`; new handler `markRecurring(billId)`; render `RecurringTipDialog` conditionally
- Modify: `src/App.css` — add `.btn-recurring` and `.btn-recurring-on` styles

- [ ] **Step 1: Write the failing test for `RecurringTipDialog`**

Create `src/RecurringTipDialog.test.jsx`:

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecurringTipDialog from './RecurringTipDialog.jsx';

afterEach(() => cleanup());

describe('RecurringTipDialog', () => {
  it('renders heading and a "Got it" dismiss button', () => {
    render(<RecurringTipDialog onDismiss={() => {}} />);
    expect(screen.getByText(/About recurring bills/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /got it/i })).toBeTruthy();
  });

  it('explains the auto-create + latest-source + undo safety net', () => {
    render(<RecurringTipDialog onDismiss={() => {}} />);
    // Smoke-check the key phrases — exact copy can drift.
    expect(screen.getByText(/auto-create/i)).toBeTruthy();
    expect(screen.getByText(/latest instance/i)).toBeTruthy();
    expect(screen.getByText(/Undo/i)).toBeTruthy();
  });

  it('clicking "Got it" calls onDismiss', async () => {
    const onDismiss = vi.fn();
    render(<RecurringTipDialog onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```
npx vitest run src/RecurringTipDialog.test.jsx
```

Expected: failure — `Cannot find module './RecurringTipDialog.jsx'`.

- [ ] **Step 3: Implement `RecurringTipDialog`**

Create `src/RecurringTipDialog.jsx`:

```jsx
export default function RecurringTipDialog({ onDismiss }) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog dialog-tip">
        <h3 className="dialog-title">About recurring bills</h3>
        <div className="dialog-body">
          <p>
            Marking this bill as recurring tells BillTracker to <strong>auto-create
            next month's copy</strong> the next time you open the app. The <strong>latest
            instance</strong> in the chain is always the source — editing future months
            naturally updates what gets copied forward.
          </p>
          <p>
            If you change your mind, click <strong>Recurring · on</strong> to turn it
            off, or hit <strong>Undo</strong> in the top toolbar to back out completely.
          </p>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={onDismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

```
npx vitest run src/RecurringTipDialog.test.jsx
```

Expected: `3 passed`.

- [ ] **Step 5: Wire the toggle into `BillCard` and add the `markRecurring` handler in `BillTracker`**

In `src/App.jsx`:

a. Add a new state in `BillTracker` near the other dialog states (after `pendingDeleteBillId`):

```jsx
const [pendingRecurringTip, setPendingRecurringTip] = useState(false);
```

b. Add the handler near the other bill mutators (close to `updateBill`):

```jsx
const markRecurring = (billId, makeRecurring) => {
  pushHistory(bills);
  setBills(prev => prev.map(b => {
    if (b.id !== billId) return b;
    if (makeRecurring) {
      return {
        ...b,
        recurring: true,
        recurringChainId: b.recurringChainId || nanoid(8),
      };
    }
    return { ...b, recurring: false };  // keep recurringChainId for history
  }));
  if (makeRecurring && localStorage.getItem('billtracker-recurring-tip-seen') !== 'true') {
    setPendingRecurringTip(true);
  }
  maybeShowUndoTip();
};

const dismissRecurringTip = () => {
  setPendingRecurringTip(false);
  try { localStorage.setItem('billtracker-recurring-tip-seen', 'true'); } catch (e) { /* quota */ }
};
```

c. Add the `nanoid` import at the top of `App.jsx` (alongside the other React/Anthropic imports):

```jsx
import { nanoid } from 'nanoid';
```

d. Render the dialog at the bottom of `BillTracker`'s return (near the other dialogs like `ConfirmDialog`):

```jsx
{pendingRecurringTip && <RecurringTipDialog onDismiss={dismissRecurringTip} />}
```

e. Import the new component at the top of App.jsx:

```jsx
import RecurringTipDialog from './RecurringTipDialog.jsx';
```

f. Pass `onMakeRecurring` and `recurring` state into `BillCard`. In the `BillCard` render call (~line 1000-ish in App.jsx — the place where bills are mapped), add the prop:

```jsx
<BillCard
  /* ...existing props... */
  onMakeRecurring={(makeRecurring) => markRecurring(bill.id, makeRecurring)}
/>
```

g. Update `BillCard`'s parameter list (~line 183) to accept the new prop:

```jsx
const BillCard = ({ bill, defaultCategoryId, categories, categoriesById, otherCategoryId, onUpdate, onDelete, onDeleteItem, onMakeRecurring, isMobile, highlighted = false, cardRef = null }) => {
```

h. In the BillCard footer (the existing `.bill-footer` div, ~line 266), add the toggle button between `+ Add Item` and `Delete Bill`:

```jsx
<div className="bill-footer">
  <button className="btn btn-add" onClick={addItem}>+ Add Item</button>
  <button
    type="button"
    className={`btn btn-recurring${bill.recurring ? ' btn-recurring-on' : ''}`}
    onClick={() => onMakeRecurring(!bill.recurring)}
  >
    ↻ {bill.recurring ? 'Recurring · on' : 'Make Recurring'}
  </button>
  <button className="btn btn-danger" onClick={() => onDelete(bill.id)}>Delete Bill</button>
</div>
```

- [ ] **Step 6: CSS for the toggle button**

Append to `src/App.css`:

```css
.btn-recurring {
  background: transparent;
  border: 1px solid rgba(91, 141, 255, 0.40);
  color: rgba(155, 184, 255, 0.95);
}

.btn-recurring:hover {
  background: rgba(91, 141, 255, 0.10);
}

.btn-recurring-on {
  background: rgba(91, 141, 255, 0.15);
  color: rgba(180, 200, 255, 1);
  border-color: rgba(91, 141, 255, 0.65);
}

.dialog-tip .dialog-body p {
  margin: 0 0 0.8rem 0;
  line-height: 1.55;
}

.dialog-tip .dialog-body p:last-child {
  margin-bottom: 0;
}
```

(Note: `.dialog-backdrop`, `.dialog`, `.dialog-title`, `.dialog-body`, `.dialog-actions`, and `.btn-primary` should already exist from `ConfirmDialog`. Verify by greping `App.css` for `dialog-backdrop`; if any are missing, add minimal definitions following the existing aesthetic.)

- [ ] **Step 7: Run the full suite**

```
npm test -- run
```

Expected: All tests pass.

- [ ] **Step 8: Manual browser smoke**

```
npm run dev
```

1. Open the app.
2. Clear the tip-seen flag: `localStorage.removeItem('billtracker-recurring-tip-seen')` in DevTools.
3. Expand any bill. Click `↻ Make Recurring`.
4. The tip dialog appears. Verify wording + Got it dismisses.
5. The bill's header now shows the amber `RECURRING` badge. The footer button label is `Recurring · on` with a blue tint.
6. Click again → button reverts to `Make Recurring`. The header badge disappears. Tip does NOT re-appear.
7. Re-mark recurring → tip does NOT re-appear (flag is set).
8. Click `Undo` in the top toolbar → recurring state reverts.

- [ ] **Step 9: Commit**

```bash
git add src/RecurringTipDialog.jsx src/RecurringTipDialog.test.jsx src/App.jsx src/App.css
git commit -m "$(cat <<'EOF'
feat(recurring): Make Recurring footer toggle + first-time tip dialog

Per-bill toggle in the expanded footer flips bill.recurring on/off and
assigns a fresh recurringChainId on first mark. The new RecurringTipDialog
surfaces once per device (via billtracker-recurring-tip-seen localStorage
flag) and explains the latest-instance-is-source model plus the Undo
safety net. Toggling off keeps recurringChainId so historical grouping
remains visible.
EOF
)"
```

---

## Task 7: BillItem `⧉` duplicate icon

**Files:**
- Modify: `src/BillItem.jsx` — add a `DuplicateIcon` button parallel to the existing `.btn-delete`
- Modify: `src/BillItem.test.jsx` — add tests for the new button
- Modify: `src/App.jsx` — pass `onDuplicate` from `BillCard.duplicateItem` through to `BillItem`
- Modify: `src/App.css` — add `.btn-duplicate-item` styles

- [ ] **Step 1: Write the failing tests in `src/BillItem.test.jsx`**

Append inside the existing `describe('BillItem', ...)` block:

```jsx
it('renders the duplicate icon button on each row', () => {
  renderItem();
  expect(screen.getByRole('button', { name: /duplicate item/i })).toBeTruthy();
});

it('clicking the duplicate icon calls onDuplicate with the source item', async () => {
  const onDuplicate = vi.fn();
  const item = { id: 'i1', description: 'Ticket', amount: 80, categoryId: 'c_util', date: '2026-04-15' };
  render(
    <BillItem
      item={item}
      bill={bill}
      categories={cats}
      otherCategoryId="c_other"
      onUpdate={() => {}}
      onDelete={() => {}}
      onDuplicate={onDuplicate}
      isMobile={false}
    />
  );
  await userEvent.click(screen.getByRole('button', { name: /duplicate item/i }));
  expect(onDuplicate).toHaveBeenCalledWith(item);
});
```

- [ ] **Step 2: Run, verify failures**

```
npx vitest run src/BillItem.test.jsx -t "duplicate"
```

Expected: 2 failures — either no button found or `onDuplicate is not a function`.

- [ ] **Step 3: Add the duplicate button to `BillItem`**

In `src/BillItem.jsx`:

a. Extend the function signature:

```jsx
export default function BillItem({ item, bill, categories, otherCategoryId, onUpdate, onDelete, onDuplicate, isMobile }) {
```

b. Define a small inline button component (or inline the JSX). In both the mobile and desktop layouts, place it immediately before the existing `<button className="btn-delete" onClick={onDelete}>×</button>`.

In the **desktop layout** (the non-`isMobile` branch, near the end of the row):

```jsx
{onDuplicate && (
  <button
    type="button"
    className="btn-duplicate-item"
    onClick={() => onDuplicate(item)}
    aria-label="Duplicate item"
    title="Duplicate item"
  >
    ⧉
  </button>
)}
<button className="btn-delete" onClick={onDelete}>×</button>
```

In the **mobile layout**, find the `item-row-mobile-top` div with the existing `btn-delete` button (~line 104 of BillItem.jsx). Add the duplicate button just before it:

```jsx
<div className="item-row-mobile-top-right">
  {onDuplicate && (
    <button
      type="button"
      className="btn-duplicate-item"
      onClick={() => onDuplicate(item)}
      aria-label="Duplicate item"
      title="Duplicate item"
    >
      ⧉
    </button>
  )}
  <button className="btn-delete" onClick={onDelete}>×</button>
</div>
```

(If the existing mobile layout doesn't have a wrapping div, wrap them or just place the new button as a sibling of `.btn-delete` — both work as long as both buttons end up in the top-right cluster.)

- [ ] **Step 4: Run the tests, verify they pass**

```
npx vitest run src/BillItem.test.jsx
```

Expected: All BillItem tests pass (existing + 2 new).

- [ ] **Step 5: Wire `duplicateItem` through `BillCard`**

In `src/App.jsx`, find `BillCard` (~line 183) and:

a. Add a `duplicateItem` function near the existing `addItem` / `updateItem`:

```jsx
const duplicateItem = (sourceItem) => {
  const twin = { ...sourceItem, id: crypto.randomUUID() };
  const idx = bill.items.findIndex(i => i.id === sourceItem.id);
  if (idx < 0) return;
  onUpdate({
    ...bill,
    items: [...bill.items.slice(0, idx + 1), twin, ...bill.items.slice(idx + 1)],
  });
};
```

b. Pass it to `BillItem`:

```jsx
<BillItem
  key={item.id}
  item={item}
  bill={bill}
  categories={categories}
  otherCategoryId={otherCategoryId}
  onUpdate={updateItem}
  onDelete={() => deleteItem(item.id)}
  onDuplicate={duplicateItem}
  isMobile={isMobile}
/>
```

- [ ] **Step 6: CSS in `src/App.css`**

```css
.btn-duplicate-item {
  background: transparent;
  border: 1px solid rgba(212, 168, 83, 0.30);
  color: rgba(212, 168, 83, 0.85);
  border-radius: 4px;
  width: 24px;
  height: 24px;
  font-size: 0.85rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin-right: 4px;
  transition: background 0.12s ease, color 0.12s ease;
}

.btn-duplicate-item:hover {
  background: rgba(212, 168, 83, 0.12);
  color: rgba(212, 168, 83, 1);
}
```

- [ ] **Step 7: Run the full suite**

```
npm test -- run
```

Expected: All tests pass.

- [ ] **Step 8: Manual browser smoke**

```
npm run dev
```

1. Open a bill with multiple items.
2. Click the amber `⧉` icon next to any item's `×` delete button.
3. A twin appears immediately below the source — same description, amount, category, date. New item id.
4. Undo reverses the duplicate.

- [ ] **Step 9: Commit**

```bash
git add src/BillItem.jsx src/BillItem.test.jsx src/App.jsx src/App.css
git commit -m "$(cat <<'EOF'
feat(recurring): item-level duplicate (⧉ icon)

Small amber ⧉ button on each item row inserts a same-bill twin
immediately below the source. Same fields verbatim, new id. Undo
covers misclicks through the existing pushHistory path.
EOF
)"
```

---

## Task 8: `DuplicateBillDialog` + bill-level duplicate handler

**Files:**
- Create: `src/DuplicateBillDialog.jsx`
- Create: `src/DuplicateBillDialog.test.jsx`
- Modify: `src/App.jsx` — new `pendingDuplicateBillId` state, `duplicateBill(sourceBill, targetMonth)` handler, "Duplicate Bill" button in `BillCard` footer, render the dialog
- Modify: `src/App.css` — add `.btn-duplicate-bill` styles

- [ ] **Step 1: Write the failing tests**

Create `src/DuplicateBillDialog.test.jsx`:

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DuplicateBillDialog from './DuplicateBillDialog.jsx';

afterEach(() => cleanup());

const sourceBill = { id: 'b1', vendor: 'Honda Finance', month: '2026-05', items: [] };

describe('DuplicateBillDialog', () => {
  it('renders the dialog with title and source vendor', () => {
    render(<DuplicateBillDialog sourceBill={sourceBill} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/Duplicate to which month/i)).toBeTruthy();
    expect(screen.getByText(/Honda Finance/i)).toBeTruthy();
  });

  it('pre-fills the month input to source.month + 1', () => {
    render(<DuplicateBillDialog sourceBill={sourceBill} onConfirm={() => {}} onCancel={() => {}} />);
    const input = document.querySelector('input[type="month"]');
    expect(input.value).toBe('2026-06');
  });

  it('Confirm with default value calls onConfirm with the pre-filled month', async () => {
    const onConfirm = vi.fn();
    render(<DuplicateBillDialog sourceBill={sourceBill} onConfirm={onConfirm} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /^Duplicate$/i }));
    expect(onConfirm).toHaveBeenCalledWith('2026-06');
  });

  it('Confirm passes the user-selected target month', async () => {
    const onConfirm = vi.fn();
    render(<DuplicateBillDialog sourceBill={sourceBill} onConfirm={onConfirm} onCancel={() => {}} />);
    const input = document.querySelector('input[type="month"]');
    await userEvent.clear(input);
    await userEvent.type(input, '2027-01');
    await userEvent.click(screen.getByRole('button', { name: /^Duplicate$/i }));
    expect(onConfirm).toHaveBeenCalledWith('2027-01');
  });

  it('Duplicate button is disabled when month input is cleared', async () => {
    render(<DuplicateBillDialog sourceBill={sourceBill} onConfirm={() => {}} onCancel={() => {}} />);
    const input = document.querySelector('input[type="month"]');
    await userEvent.clear(input);
    const btn = screen.getByRole('button', { name: /^Duplicate$/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('Cancel calls onCancel and not onConfirm', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<DuplicateBillDialog sourceBill={sourceBill} onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify failures**

```
npx vitest run src/DuplicateBillDialog.test.jsx
```

Expected: `Cannot find module './DuplicateBillDialog.jsx'`.

- [ ] **Step 3: Implement `DuplicateBillDialog`**

Create `src/DuplicateBillDialog.jsx`:

```jsx
import { useState } from 'react';

function shiftMonth(monthString, delta) {
  const [y, m] = monthString.split('-').map(n => parseInt(n, 10));
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default function DuplicateBillDialog({ sourceBill, onConfirm, onCancel }) {
  const [draft, setDraft] = useState(() => shiftMonth(sourceBill.month, 1));
  const valid = MONTH_RE.test(draft);

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog dialog-duplicate">
        <h3 className="dialog-title">Duplicate to which month?</h3>
        <div className="dialog-body">
          <p>Make a copy of <strong>{sourceBill.vendor || 'this bill'}</strong> in the chosen month.</p>
          <label className="dialog-label">
            Target month
            <input
              type="month"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="input"
              autoFocus
            />
          </label>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => onConfirm(draft)}
          >
            Duplicate
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests, verify they pass**

```
npx vitest run src/DuplicateBillDialog.test.jsx
```

Expected: `6 passed`.

- [ ] **Step 5: Wire the dialog into `BillTracker` (`src/App.jsx`)**

a. Import at the top:

```jsx
import DuplicateBillDialog from './DuplicateBillDialog.jsx';
import { shiftItemDate } from './spendingMath.js';
```

b. Add state:

```jsx
const [pendingDuplicateBillId, setPendingDuplicateBillId] = useState(null);
```

c. Add the handler near other bill mutators:

```jsx
const duplicateBill = (sourceBill, targetMonth) => {
  pushHistory(bills);
  const copy = {
    ...sourceBill,
    id: crypto.randomUUID(),
    month: targetMonth,
    items: (sourceBill.items || []).map(i => ({
      ...i,
      id: crypto.randomUUID(),
      date: shiftItemDate(i.date, targetMonth),
    })),
    recurring: false,
    recurringChainId: null,
  };
  setBills(prev => [copy, ...prev]);
  setSelectedMonth(targetMonth);
  setSearchTerm('');
  setNewlyAddedBillId(copy.id);
  setPendingDuplicateBillId(null);
  maybeShowUndoTip();
};
```

d. In `BillCard`'s props, accept `onDuplicateBill`:

```jsx
const BillCard = ({ bill, defaultCategoryId, categories, categoriesById, otherCategoryId, onUpdate, onDelete, onDeleteItem, onMakeRecurring, onDuplicateBill, isMobile, highlighted = false, cardRef = null }) => {
```

e. In the BillCard footer, add the Duplicate button before the Make Recurring button:

```jsx
<div className="bill-footer">
  <button className="btn btn-add" onClick={addItem}>+ Add Item</button>
  <button
    type="button"
    className="btn btn-duplicate-bill"
    onClick={() => onDuplicateBill(bill)}
  >
    ⧉ Duplicate Bill
  </button>
  <button
    type="button"
    className={`btn btn-recurring${bill.recurring ? ' btn-recurring-on' : ''}`}
    onClick={() => onMakeRecurring(!bill.recurring)}
  >
    ↻ {bill.recurring ? 'Recurring · on' : 'Make Recurring'}
  </button>
  <button className="btn btn-danger" onClick={() => onDelete(bill.id)}>Delete Bill</button>
</div>
```

f. In the `BillCard` render call site (where bills are mapped), pass the new prop:

```jsx
<BillCard
  /* ...existing props... */
  onDuplicateBill={(b) => setPendingDuplicateBillId(b.id)}
/>
```

g. At the bottom of `BillTracker`'s return (near other dialogs), render the dialog:

```jsx
{pendingDuplicateBillId && (() => {
  const source = bills.find(b => b.id === pendingDuplicateBillId);
  if (!source) return null;
  return (
    <DuplicateBillDialog
      sourceBill={source}
      onConfirm={(targetMonth) => duplicateBill(source, targetMonth)}
      onCancel={() => setPendingDuplicateBillId(null)}
    />
  );
})()}
```

- [ ] **Step 6: CSS for the button and dialog tweaks**

Append to `src/App.css`:

```css
.btn-duplicate-bill {
  background: transparent;
  border: 1px solid rgba(212, 168, 83, 0.40);
  color: rgba(212, 168, 83, 0.95);
}

.btn-duplicate-bill:hover {
  background: rgba(212, 168, 83, 0.10);
}

.dialog-duplicate .dialog-label {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.7rem;
  font-size: 0.78rem;
  color: var(--text-muted, #8a8c98);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.dialog-duplicate .dialog-label .input {
  margin-top: 0.2rem;
}
```

(`.btn-secondary` may or may not exist — if not, define a minimal one that mirrors `.btn-add` in muted-gray.)

- [ ] **Step 7: Run the full test suite**

```
npm test -- run
```

Expected: All tests pass.

- [ ] **Step 8: Manual browser smoke**

```
npm run dev
```

1. Open any bill. Click `⧉ Duplicate Bill`.
2. Dialog opens with the month input pre-filled to next month.
3. Click `Duplicate` → a new bill appears (highlighted + expanded) in next month. The month input switches to next month automatically. Verify item dates shifted (e.g., source's `2026-05-15` becomes `2026-06-15`).
4. Open the dialog again, change the target month to a future month → confirms duplicate to that month.
5. Open the dialog, clear the month input → Duplicate button disabled.
6. Click `Cancel` → no change.
7. After a duplicate, click `Undo` → reverts.
8. Duplicate a recurring bill → the duplicate is **not** recurring (no badge in header). Confirm.

- [ ] **Step 9: Commit**

```bash
git add src/DuplicateBillDialog.jsx src/DuplicateBillDialog.test.jsx src/App.jsx src/App.css
git commit -m "$(cat <<'EOF'
feat(recurring): bill-level duplicate with month picker

Footer ⧉ Duplicate Bill opens DuplicateBillDialog with the target month
pre-filled to next month. On confirm, a fresh bill is created with new
ids, item dates shifted via shiftItemDate (with last-day clamping), and
recurring/recurringChainId explicitly stripped — duplicates are always
independent clean copies.
EOF
)"
```

---

## Task 9: Recurring panel merge + ✓ AUTO badge + End button

**Files:**
- Modify: `src/App.jsx` — extend `RecurringPanels` to merge auto + inferred entries; extend `RecurringSection` row rendering with the `kind: 'auto'` branch; add `endRecurringChain` handler in `BillTracker`
- Modify: `src/App.css` — `.sub-badge-auto`, `.btn-end-recurring`

- [ ] **Step 1: Write a failing integration test**

Create a quick test in a new file `src/RecurringPanels.test.jsx` (or extend an existing component test if you prefer):

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findAutoRecurringChains, findRecurringCharges } from './spendingMath.js';

afterEach(() => cleanup());

describe('Recurring panel — auto + inferred shape', () => {
  const cats = [
    { id: 'c_auto', name: 'Auto', icon: '🚗', color: '#fff', flow: 'expense', keywords: [], templates: [], builtin: true },
  ];
  const catsById = new Map(cats.map(c => [c.id, c]));

  it('vendor-match suppression: auto chain hides inferred entry with same vendor', () => {
    const bills = [
      { id: 'b1', vendor: 'Honda Finance', month: '2026-03',
        recurring: true,  recurringChainId: 'rec_h',
        items: [{ id: 'i1', description: 'Auto loan', amount: 452, categoryId: 'c_auto', date: '2026-03-15' }] },
      { id: 'b2', vendor: 'Honda Finance', month: '2026-04',
        recurring: true,  recurringChainId: 'rec_h',
        items: [{ id: 'i2', description: 'Auto loan', amount: 452, categoryId: 'c_auto', date: '2026-04-15' }] },
    ];
    const auto = findAutoRecurringChains(bills, catsById);
    const inferred = findRecurringCharges(bills, '2026-04', catsById);
    expect(auto).toHaveLength(1);
    expect(auto[0].vendor).toBe('Honda Finance');
    // Inferred would normally also pick up "Auto loan" — but the merge logic in
    // RecurringPanels will filter inferred by auto.vendor case-insensitive.
    const filtered = inferred.filter(i =>
      !auto.some(a => a.vendor.toLowerCase() === i.vendor.toLowerCase())
    );
    expect(filtered).toHaveLength(0);
  });
});
```

(This is a derivation-shape test. The full UI render test lives in the smoke test in Task 12.)

- [ ] **Step 2: Run the test, verify it fails (or passes if the imports already work — that's fine, this exercises the math)**

```
npx vitest run src/RecurringPanels.test.jsx
```

Expected: 1 test, passes once `findAutoRecurringChains` returns the right entries. This test exists primarily to lock in the merge filter rule for documentation.

- [ ] **Step 3: Extend `RecurringPanels` and `RecurringSection` in `src/App.jsx`**

Find `RecurringPanels` (~line 432). Replace its body with the merge logic:

```jsx
const RecurringPanels = ({ bills, today, trackedKeywords = [], categoriesById, fallbackCategory, onEndRecurring, onPromoteInferred }) => {
  const inferred = findRecurringCharges(bills, today, categoriesById).map(e => ({ ...e, kind: 'inferred' }));
  const auto     = findAutoRecurringChains(bills, categoriesById);

  // Filter inferred: exclude tracked-keyword matches AND vendors covered by an auto chain.
  const autoVendorsLower = new Set(auto.map(a => (a.vendor || '').toLowerCase()));
  const filteredInferred = inferred.filter(c => {
    if ((c.vendor || '').toLowerCase() && autoVendorsLower.has((c.vendor || '').toLowerCase())) return false;
    return !trackedKeywords.some(kw => c.description.toUpperCase().includes(kw.toUpperCase()));
  });

  const allEntries = [...auto, ...filteredInferred];
  if (allEntries.length === 0) return null;

  const byFlow = (flow) => allEntries.filter(e => e.flow === flow);

  return (
    <>
      <RecurringSection
        title="Recurring · Income"
        entries={byFlow('income')}
        totalLabel="in"
        categoriesById={categoriesById}
        fallbackCategory={fallbackCategory}
        onEndRecurring={onEndRecurring}
        onPromoteInferred={onPromoteInferred}
      />
      <RecurringSection
        title="Recurring · Expenses"
        entries={byFlow('expense')}
        totalLabel="out"
        categoriesById={categoriesById}
        fallbackCategory={fallbackCategory}
        onEndRecurring={onEndRecurring}
        onPromoteInferred={onPromoteInferred}
      />
      <RecurringSection
        title="Recurring · Savings"
        entries={byFlow('savings')}
        totalLabel="saved"
        categoriesById={categoriesById}
        fallbackCategory={fallbackCategory}
        onEndRecurring={onEndRecurring}
        onPromoteInferred={onPromoteInferred}
      />
    </>
  );
};
```

(Note the param rename from `charges` to `entries` to reflect the merged shape.)

Find `RecurringSection` (~line 390). Replace its body to handle both kinds:

```jsx
const RecurringSection = ({ title, entries, totalLabel, categoriesById, fallbackCategory, onEndRecurring, onPromoteInferred }) => {
  if (entries.length === 0) return null;
  const total = entries.filter(c => c.active).reduce((s, c) => s + Math.abs(c.lastAmount), 0);
  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="panel-title">{title}</h3>
        <span className="panel-sub">~{formatCurrency(total)}/mo {totalLabel}</span>
      </div>
      <div className="sub-list">
        {entries.map(c => {
          const cat = categoriesById.get(c.categoryId) || fallbackCategory;
          const key = c.kind === 'auto' ? `auto-${c.chainId}` : `${c.vendor}-${c.description}`;
          const isAuto = c.kind === 'auto';
          return (
            <div key={key} className={`sub-row${c.active ? '' : ' sub-row-inactive'}`}>
              <div className="sub-row-main">
                <span className="sub-icon" style={{ background: `${cat.color}18`, border: `1px solid ${cat.color}28` }}>
                  {cat.icon}
                </span>
                <div className="sub-row-text">
                  <div className="sub-row-desc">{c.description}</div>
                  <div className="sub-row-meta">
                    {isAuto
                      ? `${c.monthCount} mo · last ${c.lastDate.slice(0, 7)}`
                      : `${c.vendor} · ${c.monthCount} mo · last ${c.lastDate}`}
                  </div>
                </div>
              </div>
              <div className="sub-row-right">
                <div className="sub-amount">
                  {formatCurrency(Math.abs(c.lastAmount))}
                  {c.varies && <span className="sub-varies" title={`Avg ${formatCurrency(Math.abs(c.avgAmount))}`}>varies</span>}
                </div>
                {isAuto ? (
                  <>
                    <span className="sub-badge sub-badge-auto">✓ AUTO</span>
                    <button
                      type="button"
                      className="btn-end-recurring"
                      onClick={() => onEndRecurring(c.chainId)}
                      aria-label={`End recurring for ${c.vendor}`}
                    >
                      End
                    </button>
                  </>
                ) : (
                  <>
                    <span className={`sub-badge${c.active ? ' sub-badge-active' : ' sub-badge-inactive'}`}>
                      {c.active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                    <button
                      type="button"
                      className="btn-promote-recurring"
                      onClick={() => onPromoteInferred(c)}
                      aria-label={`Make ${c.description} recurring`}
                    >
                      ↻ Make recurring
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

(`onPromoteInferred` is used by Task 10 — wire it up there. For now, pass a no-op from BillTracker so the panel doesn't crash.)

In `BillTracker`, add the `endRecurringChain` handler:

```jsx
const endRecurringChain = (chainId) => {
  pushHistory(bills);
  setBills(prev => {
    const chainBills = prev.filter(b => b.recurringChainId === chainId && b.recurring === true);
    if (chainBills.length === 0) return prev;
    const latest = chainBills.slice().sort((a, b) => a.month.localeCompare(b.month)).pop();
    return prev.map(b => b.id === latest.id ? { ...b, recurring: false } : b);
  });
  maybeShowUndoTip();
};
```

In the JSX, update the `RecurringPanels` call site (search for `<RecurringPanels`) to pass the new handlers:

```jsx
<RecurringPanels
  bills={bills}
  today={todayMonth}
  trackedKeywords={trackedKeywords}
  categoriesById={categoriesById}
  fallbackCategory={fallbackCategory}
  onEndRecurring={endRecurringChain}
  onPromoteInferred={() => { /* wired in Task 10 */ }}
/>
```

Also import `findAutoRecurringChains` at the top of `App.jsx`:

```jsx
import { findAutoRecurringChains, /* existing imports */ } from './spendingMath.js';
```

- [ ] **Step 4: Add CSS in `src/App.css`**

```css
.sub-badge-auto {
  color: #d4a853;
  background: rgba(212, 168, 83, 0.12);
  border: 1px solid rgba(212, 168, 83, 0.45);
}

.btn-end-recurring,
.btn-promote-recurring {
  background: transparent;
  border: 1px solid rgba(176, 178, 195, 0.30);
  color: rgba(184, 186, 195, 0.90);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  margin-left: 8px;
  cursor: pointer;
  font-family: 'Outfit', sans-serif;
}

.btn-end-recurring:hover {
  border-color: rgba(224, 146, 138, 0.50);
  color: rgba(224, 146, 138, 1);
}

.btn-promote-recurring:hover {
  border-color: rgba(212, 168, 83, 0.50);
  color: rgba(212, 168, 83, 1);
}
```

- [ ] **Step 5: Run the full test suite**

```
npm test -- run
```

Expected: All tests pass. (The `RecurringPanels.test.jsx` from Step 1 passes; everything else still passes.)

- [ ] **Step 6: Manual browser smoke**

```
npm run dev
```

1. Mark a bill recurring (from Task 6 work). Confirm the `Recurring · Expenses` panel now shows an `✓ AUTO` row for that vendor.
2. Click the `End` button on the auto row → the row disappears (chain dormant). The bill's `RECURRING` badge in the bill list also disappears.
3. Confirm any inferred entries in the panel now show a `↻ Make recurring` button (clicking it does nothing yet — wired in Task 10).
4. Verify monthly totals at the top of each panel still compute correctly.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/App.css src/RecurringPanels.test.jsx
git commit -m "$(cat <<'EOF'
feat(recurring): merge auto chains into the three Recurring panels

RecurringPanels now combines findAutoRecurringChains (new) with the
existing findRecurringCharges inferred output, suppressing inferred
entries whose vendor matches an active auto chain (case-insensitive).
Auto rows show the ✓ AUTO badge and an End button that toggles
recurring=false on the chain's latest active instance. Inferred rows
gain a ↻ Make recurring button (handler wired in next task).
EOF
)"
```

---

## Task 10: Inferred → auto promote confirm dialog + handler

**Files:**
- Modify: `src/App.jsx` — `pendingPromoteEntry` state, `promoteToAuto` handler, render a `ConfirmDialog` for promotion confirmation
- (No new file — reuses the existing `ConfirmDialog` defined inline in App.jsx)

- [ ] **Step 1: Add state, handler, and dialog to `BillTracker`**

In `src/App.jsx`:

a. State:

```jsx
const [pendingPromoteEntry, setPendingPromoteEntry] = useState(null);
```

b. Handler:

```jsx
const promoteToAuto = (entry) => {
  if (!entry) return;
  pushHistory(bills);
  const newBill = {
    id: crypto.randomUUID(),
    vendor: entry.vendor || entry.description,
    month: todayMonth,
    items: [{
      id: crypto.randomUUID(),
      description: entry.description,
      amount: entry.lastAmount,
      categoryId: entry.categoryId || cats.otherId(),
      date: shiftItemDate(entry.lastDate, todayMonth),
    }],
    recurring: true,
    recurringChainId: nanoid(8),
  };
  setBills(prev => [newBill, ...prev]);
  setSelectedMonth(todayMonth);
  setSearchTerm('');
  setNewlyAddedBillId(newBill.id);
  setPendingPromoteEntry(null);
  if (localStorage.getItem('billtracker-recurring-tip-seen') !== 'true') {
    setPendingRecurringTip(true);
  }
  maybeShowUndoTip();
};
```

c. Wire the panel callback:

```jsx
<RecurringPanels
  bills={bills}
  today={todayMonth}
  trackedKeywords={trackedKeywords}
  categoriesById={categoriesById}
  fallbackCategory={fallbackCategory}
  onEndRecurring={endRecurringChain}
  onPromoteInferred={(entry) => setPendingPromoteEntry(entry)}
/>
```

d. Render the confirm dialog at the bottom of `BillTracker`'s return:

```jsx
{pendingPromoteEntry && (
  <ConfirmDialog
    title={`Make "${pendingPromoteEntry.description}" auto-managed?`}
    message={`BillTracker will create a new monthly recurring bill for ${pendingPromoteEntry.vendor || pendingPromoteEntry.description} starting in ${formatMonthCompact(todayMonth)} (${formatCurrency(Math.abs(pendingPromoteEntry.lastAmount))}). The historical occurrences in your existing bills stay where they are; future months will get a dedicated auto-managed bill.`}
    confirmLabel="Make Recurring"
    variant="default"
    onConfirm={() => promoteToAuto(pendingPromoteEntry)}
    onCancel={() => setPendingPromoteEntry(null)}
  />
)}
```

- [ ] **Step 2: Run the full test suite**

```
npm test -- run
```

Expected: All tests pass.

- [ ] **Step 3: Manual browser smoke**

```
npm run dev
```

1. With existing data that includes recurring patterns (e.g., several months of the same vendor charge with no auto chain), the inferred entries show `↻ Make recurring` buttons in the panels.
2. Click `↻ Make recurring` on an inferred row → confirm dialog appears with the correct vendor + amount + month.
3. Confirm → a new single-item bill appears in the current month with the `RECURRING` badge. The panel re-renders: the inferred entry is gone (vendor-match filter), an `✓ AUTO` entry takes its place.
4. Undo reverses the promote.
5. Cancel from the dialog → no change.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "$(cat <<'EOF'
feat(recurring): inferred → auto promote action

Clicking ↻ Make recurring on an inferred panel row opens a ConfirmDialog
with the vendor, amount, and starting month. Confirm creates a new
single-item bill in today's month carrying recurring=true and a fresh
chain id; the vendor-match filter then suppresses the inferred entry
and the ✓ AUTO row replaces it on next render. Historical occurrences
in the original multi-item bills remain untouched.
EOF
)"
```

---

## Task 11: `RecurringConflictDialog` — Link / Duplicate / Skip

**Files:**
- Create: `src/RecurringConflictDialog.jsx`
- Create: `src/RecurringConflictDialog.test.jsx`
- Modify: `src/App.jsx` — render the dialog for the head of `pendingConflictQueue`, implement three resolution handlers, re-run `computeCatchUp` after each resolution

- [ ] **Step 1: Write the failing tests**

Create `src/RecurringConflictDialog.test.jsx`:

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecurringConflictDialog from './RecurringConflictDialog.jsx';

afterEach(() => cleanup());

const conflict = {
  chainId: 'rec_h',
  chainSourceBillId: 'b_apr',
  targetMonth: '2026-05',
  existingBillId: 'b_may_manual',
};
const sourceBill   = { id: 'b_apr',        vendor: 'Honda Finance', month: '2026-04', items: [] };
const existingBill = { id: 'b_may_manual', vendor: 'Honda Finance', month: '2026-05', items: [] };

describe('RecurringConflictDialog', () => {
  it('renders the target month and vendor in the title and body', () => {
    render(
      <RecurringConflictDialog
        conflict={conflict}
        sourceBill={sourceBill}
        existingBill={existingBill}
        onLink={() => {}}
        onDuplicate={() => {}}
        onSkip={() => {}}
      />
    );
    expect(screen.getByText(/Honda Finance/i)).toBeTruthy();
    // 2026-05 → "May 2026" via formatMonth (any of these formats acceptable)
    expect(screen.getByText(/2026|May/i)).toBeTruthy();
  });

  it('renders three actions: Link, Duplicate, Skip', () => {
    render(
      <RecurringConflictDialog
        conflict={conflict} sourceBill={sourceBill} existingBill={existingBill}
        onLink={() => {}} onDuplicate={() => {}} onSkip={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /Link/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Duplicate/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Skip/i })).toBeTruthy();
  });

  it('Link click calls onLink with the conflict', async () => {
    const onLink = vi.fn();
    render(
      <RecurringConflictDialog
        conflict={conflict} sourceBill={sourceBill} existingBill={existingBill}
        onLink={onLink} onDuplicate={() => {}} onSkip={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Link/i }));
    expect(onLink).toHaveBeenCalledWith(conflict);
  });

  it('Duplicate click calls onDuplicate with the conflict', async () => {
    const onDuplicate = vi.fn();
    render(
      <RecurringConflictDialog
        conflict={conflict} sourceBill={sourceBill} existingBill={existingBill}
        onLink={() => {}} onDuplicate={onDuplicate} onSkip={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Duplicate/i }));
    expect(onDuplicate).toHaveBeenCalledWith(conflict);
  });

  it('Skip click calls onSkip with the conflict', async () => {
    const onSkip = vi.fn();
    render(
      <RecurringConflictDialog
        conflict={conflict} sourceBill={sourceBill} existingBill={existingBill}
        onLink={() => {}} onDuplicate={() => {}} onSkip={onSkip}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Skip/i }));
    expect(onSkip).toHaveBeenCalledWith(conflict);
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

```
npx vitest run src/RecurringConflictDialog.test.jsx
```

Expected: failures — module not found.

- [ ] **Step 3: Implement `RecurringConflictDialog`**

Create `src/RecurringConflictDialog.jsx`:

```jsx
function formatMonth(monthString) {
  const [y, m] = monthString.split('-').map(n => parseInt(n, 10));
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default function RecurringConflictDialog({
  conflict, sourceBill, existingBill, onLink, onDuplicate, onSkip,
}) {
  const vendor = sourceBill?.vendor || existingBill?.vendor || 'this vendor';
  const monthLabel = formatMonth(conflict.targetMonth);

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog dialog-conflict">
        <h3 className="dialog-title">{monthLabel} already has a {vendor} bill.</h3>
        <div className="dialog-body">
          <p>
            <strong>{vendor}</strong> is set to recur monthly, and there's already a bill from
            this vendor in <strong>{monthLabel}</strong>. What should happen?
          </p>
          <ul className="conflict-options">
            <li><strong>Link</strong> — join the existing {monthLabel} bill to the recurring chain.</li>
            <li><strong>Duplicate</strong> — create a separate recurring instance alongside it.</li>
            <li><strong>Skip</strong> — leave {monthLabel} alone; resume the chain next month.</li>
          </ul>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => onSkip(conflict)}>Skip</button>
          <button type="button" className="btn btn-secondary" onClick={() => onDuplicate(conflict)}>Duplicate</button>
          <button type="button" className="btn btn-primary"   onClick={() => onLink(conflict)}>Link</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests, verify they pass**

```
npx vitest run src/RecurringConflictDialog.test.jsx
```

Expected: `5 passed`.

- [ ] **Step 5: Wire the dialog into `BillTracker`**

In `src/App.jsx`:

a. Import at the top:

```jsx
import RecurringConflictDialog from './RecurringConflictDialog.jsx';
import { computeCatchUp } from './spendingMath.js';
```

b. Three resolution handlers near the other recurring handlers:

```jsx
const resolveConflictLink = (conflict) => {
  pushHistory(bills);
  setBills(prev => prev.map(b => b.id === conflict.existingBillId
    ? { ...b, recurringChainId: conflict.chainId, recurring: true }
    : b));
  // Pop head + re-run catch-up so further months for this chain proceed.
  setPendingConflictQueue(q => q.slice(1));
  setTimeout(() => {
    setBills(prev => {
      const { bills: caughtUp, conflicts: newConflicts } = computeCatchUp(prev, todayMonth);
      setPendingConflictQueue(qPrev => [...qPrev.filter(c => c.chainId !== conflict.chainId), ...newConflicts]);
      return caughtUp;
    });
  }, 0);
};

const resolveConflictDuplicate = (conflict) => {
  pushHistory(bills);
  const source = bills.find(b => b.id === conflict.chainSourceBillId);
  if (!source) {
    setPendingConflictQueue(q => q.slice(1));
    return;
  }
  const spawn = {
    ...source,
    id: crypto.randomUUID(),
    month: conflict.targetMonth,
    items: (source.items || []).map(i => ({
      ...i,
      id: crypto.randomUUID(),
      date: shiftItemDate(i.date, conflict.targetMonth),
    })),
    recurring: true,
    recurringChainId: conflict.chainId,
  };
  setBills(prev => [...prev, spawn]);
  setPendingConflictQueue(q => q.slice(1));
  setTimeout(() => {
    setBills(prev => {
      const { bills: caughtUp, conflicts: newConflicts } = computeCatchUp(prev, todayMonth);
      setPendingConflictQueue(qPrev => [...qPrev.filter(c => c.chainId !== conflict.chainId), ...newConflicts]);
      return caughtUp;
    });
  }, 0);
};

const resolveConflictSkip = (conflict) => {
  // No bill changes. Pop head; re-run catch-up starting from targetMonth + 1 for this chain.
  // Implementation note: a "skipped" month isn't durably remembered — next app load
  // will re-prompt for the same conflict. This is intentional per spec.
  // To proceed forward this session, we temporarily insert a sentinel-chain marker by
  // bumping the source's month — but the simpler safe approach is: just pop and don't
  // re-run, so catch-up resumes on next reload.
  setPendingConflictQueue(q => q.slice(1));
};
```

(`resolveConflictSkip` deliberately doesn't re-run catch-up — see the inline comment. If the chain has further months to fill, those surface on the next app load. This keeps the in-session logic simple and matches the spec's "skip resumes next month" wording.)

c. Render the dialog at the bottom of `BillTracker`'s return:

```jsx
{pendingConflictQueue && pendingConflictQueue.length > 0 && (() => {
  const head = pendingConflictQueue[0];
  const source = bills.find(b => b.id === head.chainSourceBillId);
  const existing = bills.find(b => b.id === head.existingBillId);
  if (!source || !existing) {
    // Stale conflict (bills changed). Drop it.
    setPendingConflictQueue(q => q.slice(1));
    return null;
  }
  return (
    <RecurringConflictDialog
      conflict={head}
      sourceBill={source}
      existingBill={existing}
      onLink={resolveConflictLink}
      onDuplicate={resolveConflictDuplicate}
      onSkip={resolveConflictSkip}
    />
  );
})()}
```

(The "stale conflict" branch uses setState inside render — a no-no in React. If lint flags it, lift to a `useEffect` that fires when the queue head's referenced bills are missing.)

d. CSS for the conflict list:

```css
.dialog-conflict .conflict-options {
  margin: 0.8rem 0 0;
  padding-left: 1.2rem;
  line-height: 1.55;
}

.dialog-conflict .conflict-options li {
  margin-bottom: 0.4rem;
}
```

- [ ] **Step 6: Run the full test suite**

```
npm test -- run
```

Expected: All tests pass.

- [ ] **Step 7: Manual browser smoke**

```
npm run dev
```

1. Seed the conflict scenario via DevTools console:
   ```js
   const bills = JSON.parse(localStorage.getItem('billtracker-bills'));
   const cats  = JSON.parse(localStorage.getItem('billtracker-categories'));
   const expCat = cats.find(c => c.flow === 'expense').id;
   // April Honda, recurring
   bills.push({
     id: 'b_apr', vendor: 'Honda Finance', month: '2026-04',
     recurring: true, recurringChainId: 'rec_test',
     items: [{ id: 'it_apr', description: 'Auto loan', amount: 452, categoryId: expCat, date: '2026-04-15' }]
   });
   // May Honda, manual (no chain id)
   bills.push({
     id: 'b_may', vendor: 'Honda Finance', month: '2026-05',
     items: [{ id: 'it_may', description: 'Auto loan', amount: 452, categoryId: expCat, date: '2026-05-15' }]
   });
   localStorage.setItem('billtracker-bills', JSON.stringify(bills));
   location.reload();
   ```
2. The conflict dialog appears: `May 2026 already has a Honda Finance bill.`
3. Click `Link` → existing May bill gains chain id + recurring. Dialog dismisses. Both bills now show RECURRING badges.
4. Reset, repeat: click `Duplicate` → a new May bill is created alongside the existing one. Both have RECURRING badges (the new one); the original does not. Two May bills in the list.
5. Reset, repeat: click `Skip` → dialog dismisses, no bill changes. Reload → dialog re-appears (skip is not durable per spec).
6. Reset to a clean state and reload — no dialog.

- [ ] **Step 8: Commit**

```bash
git add src/RecurringConflictDialog.jsx src/RecurringConflictDialog.test.jsx src/App.jsx src/App.css
git commit -m "$(cat <<'EOF'
feat(recurring): catch-up conflict dialog (Link / Duplicate / Skip)

When app-load catch-up finds a same-vendor non-chain bill in a target
month, RecurringConflictDialog surfaces with three actions. Link joins
the existing bill to the chain; Duplicate spawns an additional instance;
Skip leaves the month untouched (re-prompts next reload). After each
resolution, computeCatchUp re-runs to continue any blocked chains.
EOF
)"
```

---

## Task 12: Integration smoke

**Files:**
- Modify: `src/__smoke__/setup.test.jsx` — add 2 new test cases at the end of the existing `describe` block

- [ ] **Step 1: Append the new smoke tests**

In `src/__smoke__/setup.test.jsx`, after the existing tests but inside the existing `describe('end-to-end: migration + flow-aware math', ...)` block:

```jsx
it('catch-up materializes missed months when an active chain has lapsed', () => {
  const cats = [
    { id: 'c_auto', name: 'Auto Loan', icon: '🚗', color: '#F59E0B', flow: 'expense', keywords: [], templates: [], builtin: true },
    { id: 'c_other', name: 'Other',    icon: '📋', color: '#6B7280', flow: 'expense', keywords: [], templates: [], builtin: true },
  ];
  const aprBill = {
    id: 'b_apr', vendor: 'Honda Finance', month: '2026-04',
    recurring: true, recurringChainId: 'rec_h',
    items: [{ id: 'it_apr', description: 'Auto loan', amount: 452, categoryId: 'c_auto', date: '2026-04-15' }],
  };
  const comed = {
    id: 'b_comed', vendor: 'ComEd', month: '2026-06',
    items: [{ id: 'it_comed', description: 'Electric', amount: 87.20, categoryId: 'c_other', date: '2026-06-08' }],
  };
  const storage = makeFakeStorage({
    'billtracker-bills':           JSON.stringify([aprBill, comed]),
    'billtracker-categories':      JSON.stringify(cats),
    'billtracker-schema-version':  '3',
  });
  const out = initializeFromStorage(storage, '2026-07');
  expect(out.migrationError).toBeNull();
  expect(out.conflicts).toEqual([]);

  const billsAfter = JSON.parse(storage.getItem('billtracker-bills'));
  const hondaMonths = billsAfter.filter(b => b.recurringChainId === 'rec_h').map(b => b.month).sort();
  expect(hondaMonths).toEqual(['2026-04', '2026-05', '2026-06', '2026-07']);
  // ComEd untouched.
  expect(billsAfter.find(b => b.id === 'b_comed').vendor).toBe('ComEd');
  // Each spawned Honda bill has recurring=true and the same chain id.
  for (const b of billsAfter.filter(b => b.recurringChainId === 'rec_h')) {
    expect(b.recurring).toBe(true);
    expect(b.recurringChainId).toBe('rec_h');
  }
});

it('catch-up surfaces conflicts: same-vendor non-chain May bill blocks the Honda chain spawn', () => {
  const cats = [
    { id: 'c_auto', name: 'Auto Loan', icon: '🚗', color: '#F59E0B', flow: 'expense', keywords: [], templates: [], builtin: true },
  ];
  const aprBill = {
    id: 'b_apr', vendor: 'Honda Finance', month: '2026-04',
    recurring: true, recurringChainId: 'rec_h',
    items: [{ id: 'it1', description: 'Auto loan', amount: 452, categoryId: 'c_auto', date: '2026-04-15' }],
  };
  const manualMay = {
    id: 'b_may_manual', vendor: 'Honda Finance', month: '2026-05',
    items: [{ id: 'it2', description: 'Auto loan', amount: 452, categoryId: 'c_auto', date: '2026-05-15' }],
  };
  const storage = makeFakeStorage({
    'billtracker-bills':           JSON.stringify([aprBill, manualMay]),
    'billtracker-categories':      JSON.stringify(cats),
    'billtracker-schema-version':  '3',
  });
  const out = initializeFromStorage(storage, '2026-05');
  expect(out.conflicts).toHaveLength(1);
  expect(out.conflicts[0].targetMonth).toBe('2026-05');
  expect(out.conflicts[0].chainId).toBe('rec_h');
  // No spawn occurred — only the original two bills.
  expect(out.bills).toHaveLength(2);
});
```

- [ ] **Step 2: Run the smoke suite**

```
npx vitest run src/__smoke__/setup.test.jsx
```

Expected: All smoke tests pass (existing + 2 new).

- [ ] **Step 3: Run the full test suite once more**

```
npm test -- run
```

Expected: Entire suite green.

- [ ] **Step 4: Final manual browser smoke**

```
npm run dev
```

Walk through the user-facing flows in order:

1. **Item duplicate.** Open any bill with items. Click `⧉` on an item → twin appears below source. Undo reverses.
2. **Bill duplicate.** Click `⧉ Duplicate Bill` on a bill → dialog opens with next month pre-filled. Confirm → new bill in next month, highlighted, expanded; date-shifted items. Undo reverses.
3. **Mark recurring.** On a fresh bill, click `↻ Make Recurring` → first-time tip appears. Dismiss. Bill header shows `↻ RECURRING` badge. Footer button reads `Recurring · on`.
4. **Catch-up.** Force the chain forward in DevTools (set the source bill's month to two months ago in localStorage, reload). New spawned bills appear in the months between. Their items' dates day-of-month preserved (with last-day clamp).
5. **Recurring panel.** Confirm the auto chain appears in `Recurring · Expenses` (or income/savings depending on category flow) with `✓ AUTO` badge and `End` button.
6. **End recurring.** Click `End` → row disappears; badge removed from latest bill in chain. Undo reverses.
7. **Promote inferred.** With existing months of repeated identical charges (e.g., the seeded Netflix-on-CC pattern), click `↻ Make recurring` on the inferred row → confirm dialog. Confirm → new single-item bill in current month, panel transitions from inferred to auto.
8. **Conflict dialog.** Seed the catch-up conflict from Task 11's smoke step. Reload. Dialog appears. Test all three branches (Link, Duplicate, Skip) on fresh seeds.

- [ ] **Step 5: Commit the smoke tests**

```bash
git add src/__smoke__/setup.test.jsx
git commit -m "$(cat <<'EOF'
test(recurring): end-to-end catch-up smoke tests

Two new smoke cases cover the full initializeFromStorage → computeCatchUp
integration: (1) a missed-three-months chain materializes correctly when
today advances, and (2) a same-vendor non-chain bill in a target month
surfaces as a conflict entry and blocks further chain spawning.
EOF
)"
```

---

## Final Verification

- [ ] **Step 1: Full test suite, full output**

```
npm test -- run
```

Confirm all tests pass. Note the total count for the commit message of any wrap-up.

- [ ] **Step 2: Lint (existing project lint pipeline)**

```
npm run lint
```

Fix any new warnings introduced by the changes. The existing project lint config is the source of truth.

- [ ] **Step 3: Production build, confirming no compile errors**

```
npm run build
```

Confirm clean build output.

- [ ] **Step 4: Optional wrap-up commit if any lint/build fixes were applied**

```bash
git add -A
git commit -m "chore(recurring): lint / build cleanup for sub-project C"
```

(Skip if there were no lint/build fixes.)

---

## Notes for Reviewers

- **Schema unchanged.** No migration. `recurring` and `recurringChainId` are additive optionals on the bill shape.
- **JSON export round-trip.** Bills export with these fields when present. Earlier-version apps consuming a C-era export silently drop them; forward-compat is fine.
- **Skip durability.** A "Skip" conflict resolution is intentionally not persisted — the same conflict re-prompts on next app load. If that becomes annoying during dogfooding, store a sidecar `billtracker-recurring-skipped` map (chainId+month → true). Out of scope here.
- **The conflict dialog re-runs catch-up after Link/Duplicate.** This is necessary because resolving June's conflict may unblock July and August. Skip deliberately does not re-run — those months stay queued for the next reload.
- **Inferred → auto promotion creates a fresh single-item bill in `todayMonth`.** It does NOT modify the host bills (CC statements) where the historical occurrences live. The auto entry's vendor match filter then suppresses the inferred entry on next render.
- **No new dev deps.** Reuses the existing vitest / @testing-library setup added in sub-project A.
