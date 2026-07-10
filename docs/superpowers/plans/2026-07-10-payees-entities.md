# Payees as First-Class Entities — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project note:** this repo's established workflow is INLINE TDD by the main session (not subagents), with user checkpoints between tasks. Follow that unless the user says otherwise.

**Goal:** Promote the free-text `payee` string on transactions into an id-referenced payee entity with migration, a searchable picker, default-category auto-fill, and a management screen (rename / merge / delete, all undoable).

**Architecture:** Payees become a persisted collection (`tallio-payees`) managed by a `usePayees` hook, mirroring how categories/templates work. Transactions swap `payee` (string) for `payeeId` (string|null). A one-time storage migration (schema version 4 → 5) seeds entities from existing strings and seeds default categories from history. Display code never stores names: `computeRegister` decorates rows with a derived `payeeName`, and reports/CSV resolve names through a `payeesById` Map.

**Tech Stack:** React 19 + Vite, vitest + @testing-library/react (jsdom), nanoid, fflate (archives), localStorage persistence. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-09-payees-design.md` (approved).

## Global Constraints

- **Two version spaces — do not confuse them.** Storage key `tallio-schema-version` bumps `'4'` → `'5'` (payees era). Archive `data.json` `schemaVersion` bumps `5` → `6`. They are different numbers by coincidence of history.
- Payee entity shape is exactly `{ id, name, defaultCategoryId: string|null, defaultSubcategoryId: string|null }`; ids are `nanoid(8)`.
- After this plan, **no code writes a `payee` field** on transactions, drafts, or templates — only `payeeId`. The derived display field is named `payeeName` and must never be persisted.
- Payee names are unique **case-insensitively** (trimmed). Payee stays optional and bank-layout-accounts-only, exactly as today.
- Tests run with `npx vitest run <path>` (the bare `npm test` is watch mode — don't use it in automation). The pre-existing suite (~1037 tests) must stay green; run `npx vitest run` at every task's end.
- Work happens on branch `feat/payees` off `master`, created **only after** `feat/pwa-standalone` has merged. Commit messages use the repo's `feat(payees): …` / `test(payees): …` style and end with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` footer.
- New UI reuses existing CSS: PayeePicker uses the `.cat-picker-*` classes, ManagePayeesScreen uses the `.manage-*` classes, row menus use `ActionMenu`. Add new CSS only if a rule is genuinely missing.
- Undo: every user-facing mutation goes through App's `pushHistory()` before mutating; merge and delete are each ONE `pushHistory()` call covering both the ledger change and the payee-list change.

---

### Task 0: Branch and baseline

**Files:** none (git only)

- [ ] **Step 1: Create the branch off up-to-date master**

```bash
git checkout master && git pull && git checkout -b feat/payees
```

- [ ] **Step 2: Commit the spec and this plan** (they were written earlier but deliberately left uncommitted)

```bash
git add docs/superpowers/specs/2026-07-09-payees-design.md docs/superpowers/plans/2026-07-10-payees-entities.md
git commit -m "docs: payees-as-entities spec + implementation plan"
```

- [ ] **Step 3: Verify the baseline suite is green**

Run: `npx vitest run`
Expected: all tests pass (~1037). If not, STOP and report — do not build on a red baseline.

---

### Task 1: Pure migration core (`payeesMigration.js`)

**Files:**
- Create: `src/payeesMigration.js`
- Test: `src/payeesMigration.test.js`

**Interfaces:**
- Consumes: nothing project-specific (pure module; `nanoid` only).
- Produces: `migrateToPayees({ transactions, templates }) → { payees, transactions, templates }` where `payees` is an array of payee entities, and returned transactions/templates carry `payeeId` instead of `payee`. Later tasks (initializeFromStorage) call this exact signature.

- [ ] **Step 1: Write the failing tests**

```js
// src/payeesMigration.test.js
import { describe, it, expect } from 'vitest';
import { migrateToPayees } from './payeesMigration.js';

const txn = (over = {}) => ({
  id: 't1', accountId: 'a1', date: '2026-01-05', amount: -10,
  categoryId: 'cat1', description: '', payee: null, checkNumber: null, transferId: null,
  ...over,
});

describe('migrateToPayees', () => {
  it('creates one entity per distinct trimmed name, case-insensitively, first-seen casing wins', () => {
    const { payees, transactions } = migrateToPayees({ transactions: [
      txn({ id: 't1', payee: 'Costco' }),
      txn({ id: 't2', payee: '  costco ' }),
      txn({ id: 't3', payee: 'COSTCO' }),
      txn({ id: 't4', payee: 'Safeway' }),
    ] });
    expect(payees).toHaveLength(2);
    const costco = payees.find(p => p.name === 'Costco');
    expect(costco).toBeTruthy();
    expect(transactions.map(t => t.payeeId)).toEqual([costco.id, costco.id, costco.id, payees.find(p => p.name === 'Safeway').id]);
    expect(transactions.every(t => !('payee' in t))).toBe(true);
  });

  it('skips empty/whitespace/null payees → payeeId null', () => {
    const { payees, transactions } = migrateToPayees({ transactions: [
      txn({ id: 't1', payee: null }), txn({ id: 't2', payee: '   ' }), txn({ id: 't3', payee: '' }),
    ] });
    expect(payees).toHaveLength(0);
    expect(transactions.map(t => t.payeeId)).toEqual([null, null, null]);
  });

  it('is a no-op on already-migrated transactions (preserves payeeId, creates nothing)', () => {
    const already = { ...txn({ id: 't1' }), payeeId: 'p9' };
    delete already.payee;
    const { payees, transactions } = migrateToPayees({ transactions: [already] });
    expect(payees).toHaveLength(0);
    expect(transactions[0].payeeId).toBe('p9');
  });

  it('rewrites transaction-kind template payloads, sharing entities with transactions', () => {
    const templates = [
      { id: 'tpl1', name: 'Gas', kind: 'transaction', payload: { description: '', amount: -40, categoryId: 'cat1', subId: null, payee: 'Shell', checkNumber: null, splits: null } },
      { id: 'tpl2', name: 'Move', kind: 'transfer', payload: { fromId: 'a1', toId: 'a2', amount: 100, categoryId: null, description: '', splits: null } },
    ];
    const out = migrateToPayees({ transactions: [txn({ id: 't1', payee: 'shell' })], templates });
    expect(out.payees).toHaveLength(1);
    expect(out.templates[0].payload.payeeId).toBe(out.payees[0].id);
    expect('payee' in out.templates[0].payload).toBe(false);
    expect(out.templates[1]).toEqual(templates[1]); // transfer payloads untouched
  });

  it('seeds default category from a strict majority of ≥2 categorized transactions', () => {
    const { payees } = migrateToPayees({ transactions: [
      txn({ id: 't1', payee: 'Costco', categoryId: 'groceries', subId: 'food' }),
      txn({ id: 't2', payee: 'Costco', categoryId: 'groceries', subId: 'food' }),
      txn({ id: 't3', payee: 'Costco', categoryId: 'household' }),
    ] });
    const costco = payees[0];
    expect(costco.defaultCategoryId).toBe('groceries');
    expect(costco.defaultSubcategoryId).toBe('food');
  });

  it('does NOT seed defaults on a tie, a single transaction, or uncategorized history', () => {
    const { payees } = migrateToPayees({ transactions: [
      txn({ id: 't1', payee: 'Tied', categoryId: 'a' }),
      txn({ id: 't2', payee: 'Tied', categoryId: 'b' }),
      txn({ id: 't3', payee: 'Once', categoryId: 'a' }),
      txn({ id: 't4', payee: 'Uncat', categoryId: null }),
      txn({ id: 't5', payee: 'Uncat', categoryId: null }),
    ] });
    for (const p of payees) {
      expect(p.defaultCategoryId).toBeNull();
      expect(p.defaultSubcategoryId).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/payeesMigration.test.js`
Expected: FAIL — cannot resolve `./payeesMigration.js`.

- [ ] **Step 3: Implement**

```js
// src/payeesMigration.js
import { nanoid } from 'nanoid';

// One-time storage v4 → v5 conversion: promote free-text `payee` strings on
// transactions and template payloads into id-referenced payee entities.
// Pure — takes plain arrays, returns new arrays; never mutates its inputs.
//
// Grouping is case-insensitive on the trimmed string; first-seen casing
// (transaction order, then template order) becomes the entity name. Defaults
// are seeded from history: ≥ 2 categorized transactions with one
// (categoryId, subId) pair holding a strict majority. Transfer legs carry
// payee null so they never contribute; split parents contribute their own
// (main) categoryId.
export function migrateToPayees({ transactions = [], templates = [] } = {}) {
  const byKey = new Map(); // trimmed lower-cased name → payee entity
  const ensurePayee = (raw) => {
    const name = (raw == null ? '' : String(raw)).trim();
    if (!name) return null;
    const key = name.toLowerCase();
    if (byKey.has(key)) return byKey.get(key);
    const p = { id: nanoid(8), name, defaultCategoryId: null, defaultSubcategoryId: null };
    byKey.set(key, p);
    return p;
  };

  const outTxns = transactions.map(t => {
    if (!t) return t;
    const { payee, ...rest } = t;
    const entity = ensurePayee(payee);
    return { ...rest, payeeId: entity ? entity.id : (rest.payeeId ?? null) };
  });

  const outTemplates = templates.map(tpl => {
    if (!tpl || tpl.kind !== 'transaction' || !tpl.payload || !('payee' in tpl.payload)) return tpl;
    const { payee, ...payload } = tpl.payload;
    const entity = ensurePayee(payee);
    return { ...tpl, payload: { ...payload, payeeId: entity ? entity.id : (payload.payeeId ?? null) } };
  });

  // Seed defaults: tally (categoryId, subId) pairs per payee over categorized rows.
  const tally = new Map(); // payeeId → Map<"catId|subId", count>
  for (const t of outTxns) {
    if (!t || !t.payeeId || !t.categoryId) continue;
    const pairKey = `${t.categoryId}|${t.subId || ''}`;
    const counts = tally.get(t.payeeId) || new Map();
    counts.set(pairKey, (counts.get(pairKey) || 0) + 1);
    tally.set(t.payeeId, counts);
  }
  for (const p of byKey.values()) {
    const counts = tally.get(p.id);
    if (!counts) continue;
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    if (total < 2) continue;
    let bestKey = null, bestCount = 0;
    for (const [k, n] of counts) if (n > bestCount) { bestKey = k; bestCount = n; }
    if (bestCount * 2 <= total) continue; // strict majority required
    const [categoryId, subId] = bestKey.split('|');
    p.defaultCategoryId = categoryId;
    p.defaultSubcategoryId = subId || null;
  }

  return { payees: [...byKey.values()], transactions: outTxns, templates: outTemplates };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/payeesMigration.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/payeesMigration.js src/payeesMigration.test.js
git commit -m "feat(payees): pure v4→v5 migration — entities from strings + seeded defaults"
```

---

### Task 2: Storage integration (`initializeFromStorage` → schema v5)

**Files:**
- Modify: `src/initializeFromStorage.js`
- Test: `src/initializeFromStorage.test.js` (append a describe block)

**Interfaces:**
- Consumes: `migrateToPayees` from Task 1.
- Produces: on load, storage at version `'5'` always holds `tallio-payees`, and `tallio-transactions` / `tallio-templates` carry `payeeId`. External signature of `initializeFromStorage(storage)` is unchanged. `usePayees` (Task 4) relies on `tallio-payees` being populated **before** React hooks run — guaranteed because `initializeFromStorage` runs inside App's first `useState` initializer, above the hook calls.

- [ ] **Step 1: Write the failing tests** — append to `src/initializeFromStorage.test.js` (match the file's existing fake-storage helper if one exists; otherwise use this Map-backed stub):

```js
// Append to src/initializeFromStorage.test.js
import { describe as describe2, it as it2, expect as expect2 } from 'vitest'; // only if the file lacks these imports; otherwise reuse

function memStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

describe('payees migration (v4 → v5)', () => {
  const v4Txns = [
    { id: 't1', accountId: 'a1', date: '2026-01-05', amount: -10, categoryId: 'c1', description: '', payee: 'Costco', checkNumber: null, transferId: null },
    { id: 't2', accountId: 'a1', date: '2026-01-06', amount: -20, categoryId: 'c1', description: '', payee: 'costco', checkNumber: null, transferId: null },
  ];

  it('migrates a v4 store: creates payees, rewrites txns + templates, sets version 5', () => {
    const storage = memStorage({
      'tallio-schema-version': '4',
      'tallio-accounts': JSON.stringify([{ id: 'a1', name: 'Chase' }]),
      'tallio-transactions': JSON.stringify(v4Txns),
      'tallio-templates': JSON.stringify([{ id: 'tpl1', name: 'G', kind: 'transaction', payload: { payee: 'Costco', amount: -5, categoryId: 'c1', description: '', checkNumber: null, splits: null } }]),
    });
    const { accounts, transactions, migrationError } = initializeFromStorage(storage);
    expect(migrationError).toBeNull();
    expect(accounts).toHaveLength(1);
    const payees = JSON.parse(storage.getItem('tallio-payees'));
    expect(payees).toHaveLength(1);
    expect(payees[0].name).toBe('Costco');
    expect(payees[0].defaultCategoryId).toBe('c1'); // 2 categorized txns, unanimous
    expect(transactions.every(t => t.payeeId === payees[0].id && !('payee' in t))).toBe(true);
    expect(JSON.parse(storage.getItem('tallio-transactions'))[0].payeeId).toBe(payees[0].id);
    expect(JSON.parse(storage.getItem('tallio-templates'))[0].payload.payeeId).toBe(payees[0].id);
    expect(storage.getItem('tallio-schema-version')).toBe('5');
  });

  it('leaves a v5 store completely alone', () => {
    const storage = memStorage({
      'tallio-schema-version': '5',
      'tallio-accounts': '[]',
      'tallio-transactions': JSON.stringify([{ id: 't1', accountId: 'a1', date: '2026-01-05', amount: -1, categoryId: null, description: '', payeeId: 'p1', checkNumber: null, transferId: null }]),
      'tallio-payees': JSON.stringify([{ id: 'p1', name: 'Kept', defaultCategoryId: null, defaultSubcategoryId: null }]),
    });
    const { transactions } = initializeFromStorage(storage);
    expect(transactions[0].payeeId).toBe('p1');
    expect(JSON.parse(storage.getItem('tallio-payees'))).toHaveLength(1);
  });

  it('a fresh/legacy (< v4) store still runs the old chain, then payees, landing on v5', () => {
    const storage = memStorage({});
    const { migrationError } = initializeFromStorage(storage);
    expect(migrationError).toBeNull();
    expect(storage.getItem('tallio-schema-version')).toBe('5');
    expect(JSON.parse(storage.getItem('tallio-payees'))).toEqual([]);
  });
});
```

(If the existing test file already defines a storage stub, reuse it instead of adding `memStorage` — keep one idiom per file.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/initializeFromStorage.test.js`
Expected: new tests FAIL (version stays '4', no `tallio-payees` key). Pre-existing tests in the file that assert `VERSION_KEY === '4'` will need updating to `'5'` in Step 3 — that expectation legitimately changed.

- [ ] **Step 3: Implement** — modify `src/initializeFromStorage.js`:

Add imports/keys at the top:

```js
import { migrateToPayees } from './payeesMigration.js';

const PAYEES_KEY    = 'tallio-payees';
const TEMPLATES_KEY = 'tallio-templates';
```

Add the helper above `initializeFromStorage`:

```js
// v4 → v5: promote payee strings to entities. Writes payees/transactions/
// templates back and stamps version 5. Returns the migrated transactions.
function runPayeesMigration(storage) {
  const transactions = JSON.parse(storage.getItem(TXN_KEY) || '[]');
  const templates = JSON.parse(storage.getItem(TEMPLATES_KEY) || '[]');
  const migrated = migrateToPayees({ transactions, templates });
  storage.setItem(PAYEES_KEY, JSON.stringify(migrated.payees));
  storage.setItem(TXN_KEY, JSON.stringify(migrated.transactions));
  storage.setItem(TEMPLATES_KEY, JSON.stringify(migrated.templates));
  storage.setItem(VERSION_KEY, '5');
  return migrated.transactions;
}
```

Replace the `if (ver >= 4)` block with:

```js
    // Already on v5 — load directly, no migration.
    if (ver >= 5) {
      return {
        accounts: JSON.parse(storage.getItem(ACCOUNTS_KEY) || '[]'),
        transactions: JSON.parse(storage.getItem(TXN_KEY) || '[]'),
        migrationError: null,
      };
    }

    // v4: accounts/transactions are already flat — only payees need promoting.
    if (ver === 4) {
      const accounts = JSON.parse(storage.getItem(ACCOUNTS_KEY) || '[]');
      const transactions = runPayeesMigration(storage);
      return { accounts, transactions, migrationError: null };
    }
```

And at the end of the legacy (< v4) path, replace:

```js
    storage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    storage.setItem(TXN_KEY, JSON.stringify(transactions));
    storage.setItem(VERSION_KEY, '4');
    // Legacy bills key is retained (untouched) so the backup path stays intact.

    return { accounts, transactions, migrationError: null };
```

with:

```js
    storage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    storage.setItem(TXN_KEY, JSON.stringify(transactions));
    // Legacy bills key is retained (untouched) so the backup path stays intact.

    const migratedTxns = runPayeesMigration(storage); // also stamps VERSION_KEY '5'
    return { accounts, transactions: migratedTxns, migrationError: null };
```

- [ ] **Step 4: Run to verify pass** (fix any pre-existing assertions that expected version `'4'`)

Run: `npx vitest run src/initializeFromStorage.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite** — other tests may seed v4-style data and assert on it; fix only what the version bump legitimately changed.

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/initializeFromStorage.js src/initializeFromStorage.test.js
git commit -m "feat(payees): storage schema v5 — run payee migration on load"
```

---

### Task 3: Ledger speaks `payeeId` (`useLedger`)

**Files:**
- Modify: `src/useLedger.js`
- Test: `src/useLedger.test.jsx` (update seeds + add cases)

**Interfaces:**
- Consumes: nothing new.
- Produces: transactions store `payeeId: string|null` (never `payee`); split-transfer counterparts inherit `payeeId: parent.payeeId`; transfer legs always `payeeId: null`. New methods `clearPayee(payeeId)` and `reassignPayee(fromId, toId)`, both single-`setTransactions` (atomic, snapshot-friendly). App (Task 11) calls these inside merge/delete handlers.

- [ ] **Step 1: Write the failing tests** — in `src/useLedger.test.jsx`, update the seed transaction's `payee: null` to `payeeId: null`, then add:

```jsx
  it('stores payeeId on add, and split-transfer counterparts inherit it', () => {
    const { result } = renderHook(() => useLedger(seed));
    act(() => { result.current.addAccount({ name: 'Savings', type: 'bank' }); });
    const target = result.current.accounts.find(a => a.name === 'Savings');
    let tid;
    act(() => {
      tid = result.current.addTransaction(
        { accountId: 'a1', date: '2026-06-01', amount: -100, categoryId: 'c', description: '', payeeId: 'p1',
          splits: [
            { id: 's1', amount: -60, categoryId: 'c', description: '' },
            { id: 's2', amount: -40, description: '', transferId: 'tr_x' },
          ] },
        { splitTargets: new Map([['s2', target.id]]) },
      );
    });
    const parent = result.current.transactions.find(t => t.id === tid);
    expect(parent.payeeId).toBe('p1');
    expect('payee' in parent).toBe(false);
    const counterpart = result.current.transactions.find(t => t.transferId === 'tr_x' && t.id !== tid);
    expect(counterpart.payeeId).toBe('p1');
  });

  it('addTransfer legs carry payeeId null', () => {
    const { result } = renderHook(() => useLedger(seed));
    act(() => { result.current.addAccount({ name: 'Savings', type: 'bank' }); });
    const target = result.current.accounts.find(a => a.name === 'Savings');
    act(() => { result.current.addTransfer({ fromId: 'a1', toId: target.id, amount: 50, date: '2026-06-02' }); });
    const legs = result.current.transactions.filter(t => t.transferId);
    expect(legs).toHaveLength(2);
    expect(legs.every(l => l.payeeId === null)).toBe(true);
  });

  it('clearPayee nulls payeeId only on matching transactions; reassignPayee moves them', () => {
    const withPayees = { accounts: seed.accounts, transactions: [
      { id: 't1', accountId: 'a1', date: '2026-05-01', amount: -5, categoryId: 'c', description: '', payeeId: 'p1', checkNumber: null, transferId: null },
      { id: 't2', accountId: 'a1', date: '2026-05-02', amount: -6, categoryId: 'c', description: '', payeeId: 'p2', checkNumber: null, transferId: null },
    ] };
    const { result } = renderHook(() => useLedger(withPayees));
    act(() => { result.current.reassignPayee('p1', 'p2'); });
    expect(result.current.transactions.map(t => t.payeeId)).toEqual(['p2', 'p2']);
    act(() => { result.current.clearPayee('p2'); });
    expect(result.current.transactions.map(t => t.payeeId)).toEqual([null, null]);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/useLedger.test.jsx`
Expected: FAIL — `payeeId` is undefined on stored transactions; `clearPayee` is not a function.

- [ ] **Step 3: Implement** — in `src/useLedger.js`, replace every `payee` field with `payeeId` (7 sites):

| Line (pre-change) | Old | New |
|---|---|---|
| 90 (addTransaction parent) | `payee: txn.payee ?? null,` | `payeeId: txn.payeeId ?? null,` |
| 112 (split counterpart) | `payee: parent.payee,` | `payeeId: parent.payeeId,` |
| 163 (update: added counterpart) | `payee: next.payee ?? null,` | `payeeId: next.payeeId ?? null,` |
| 183 (update: patched counterpart) | `payee: next.payee ?? null,` | `payeeId: next.payeeId ?? null,` |
| 213 (addTransfer base) | `payee: null,` | `payeeId: null,` |
| 265 (updateTransfer from-leg) | `payee: null,` | `payeeId: null,` |
| 271 (updateTransfer to-leg) | `payee: null,` | `payeeId: null,` |

Then add after `clearSubcategory` (line ~298):

```js
  // Null out one payee across the ledger (used by App when deleting a payee).
  const clearPayee = useCallback((payeeId) => {
    if (!payeeId) return;
    setTransactions(prev => prev.map(t => (t.payeeId === payeeId ? { ...t, payeeId: null } : t)));
  }, []);

  // Move every transaction from one payee to another (used by App when merging).
  const reassignPayee = useCallback((fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    setTransactions(prev => prev.map(t => (t.payeeId === fromId ? { ...t, payeeId: toId } : t)));
  }, []);
```

And add `clearPayee, reassignPayee,` to the returned object (next to `clearSubcategory`).

- [ ] **Step 4: Run to verify pass, then the full suite** — other test files seed `payee:` on transactions; update those seeds to `payeeId:` where the assertion depends on it (display assertions will be handled in Tasks 7–8; here only fix crashes/direct field assertions).

Run: `npx vitest run src/useLedger.test.jsx && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat(payees): ledger stores payeeId; clearPayee + reassignPayee"
```

---

### Task 4: `usePayees` hook + App state/undo integration

**Files:**
- Create: `src/usePayees.js`
- Test: `src/usePayees.test.jsx`
- Modify: `src/App.jsx` (hook, undo snapshot/restore, storage-error toast)

**Interfaces:**
- Consumes: `tallio-payees` storage (populated by Task 2 before hooks run).
- Produces: `usePayees() → { payees, payeesById, addPayee(name)→id|null, renamePayee(id, name)→{ok, reason?, conflictId?}, setDefaultCategory(id, categoryId, subcategoryId), deletePayee(id), mergePayee(sourceId, targetId), snapshot(), restore(list), storageError, clearStorageError }`. `payeesById` is a `Map<id, payee>`. All later UI tasks consume exactly these names.

- [ ] **Step 1: Write the failing tests**

```jsx
// src/usePayees.test.jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import usePayees from './usePayees.js';

beforeEach(() => localStorage.clear());

const seedStorage = (list) => localStorage.setItem('tallio-payees', JSON.stringify(list));

describe('usePayees', () => {
  it('hydrates from tallio-payees and persists changes back', () => {
    seedStorage([{ id: 'p1', name: 'Costco', defaultCategoryId: null, defaultSubcategoryId: null }]);
    const { result } = renderHook(() => usePayees());
    expect(result.current.payees).toHaveLength(1);
    act(() => { result.current.addPayee('Shell'); });
    expect(JSON.parse(localStorage.getItem('tallio-payees'))).toHaveLength(2);
  });

  it('addPayee trims, rejects empty, and returns the existing id on a case-insensitive match', () => {
    const { result } = renderHook(() => usePayees());
    let id1, id2, id3;
    act(() => { id1 = result.current.addPayee('  Costco '); });
    act(() => { id2 = result.current.addPayee('costco'); });
    act(() => { id3 = result.current.addPayee('   '); });
    expect(result.current.payees).toHaveLength(1);
    expect(result.current.payees[0].name).toBe('Costco');
    expect(id2).toBe(id1);
    expect(id3).toBeNull();
  });

  it('renamePayee blocks case-insensitive conflicts with the other payee id', () => {
    seedStorage([
      { id: 'p1', name: 'Costco', defaultCategoryId: null, defaultSubcategoryId: null },
      { id: 'p2', name: 'Shell', defaultCategoryId: null, defaultSubcategoryId: null },
    ]);
    const { result } = renderHook(() => usePayees());
    let res;
    act(() => { res = result.current.renamePayee('p2', ' COSTCO '); });
    expect(res).toEqual({ ok: false, reason: 'duplicate', conflictId: 'p1' });
    act(() => { res = result.current.renamePayee('p2', 'Chevron'); });
    expect(res).toEqual({ ok: true });
    expect(result.current.payeesById.get('p2').name).toBe('Chevron');
  });

  it('setDefaultCategory sets and clears the pair (clearing category clears sub too)', () => {
    seedStorage([{ id: 'p1', name: 'Costco', defaultCategoryId: null, defaultSubcategoryId: null }]);
    const { result } = renderHook(() => usePayees());
    act(() => { result.current.setDefaultCategory('p1', 'cat1', 'sub1'); });
    expect(result.current.payeesById.get('p1').defaultCategoryId).toBe('cat1');
    expect(result.current.payeesById.get('p1').defaultSubcategoryId).toBe('sub1');
    act(() => { result.current.setDefaultCategory('p1', null); });
    expect(result.current.payeesById.get('p1').defaultCategoryId).toBeNull();
    expect(result.current.payeesById.get('p1').defaultSubcategoryId).toBeNull();
  });

  it('mergePayee removes the source; deletePayee removes; snapshot/restore round-trips', () => {
    seedStorage([
      { id: 'p1', name: 'Costco', defaultCategoryId: null, defaultSubcategoryId: null },
      { id: 'p2', name: 'costco warehouse', defaultCategoryId: null, defaultSubcategoryId: null },
    ]);
    const { result } = renderHook(() => usePayees());
    let snap;
    act(() => { snap = result.current.snapshot(); });
    act(() => { result.current.mergePayee('p2', 'p1'); });
    expect(result.current.payees.map(p => p.id)).toEqual(['p1']);
    act(() => { result.current.deletePayee('p1'); });
    expect(result.current.payees).toHaveLength(0);
    act(() => { result.current.restore(snap); });
    expect(result.current.payees).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/usePayees.test.jsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```js
// src/usePayees.js
import { useState, useCallback, useEffect, useMemo } from 'react';
import { nanoid } from 'nanoid';

const STORAGE_KEY = 'tallio-payees';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const norm = (name) => (name || '').trim().toLowerCase();

// Managed payee entities: { id, name, defaultCategoryId, defaultSubcategoryId }.
// Names are unique case-insensitively; addPayee returns the existing id on a match.
export default function usePayees() {
  const [payees, setPayees] = useState(load);
  const [storageError, setStorageError] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payees));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (storageError !== null) setStorageError(null);
    } catch (e) {
      console.error('Failed to save payees:', e);
      setStorageError({ message: "Couldn't save payee — storage full." });
    }
  }, [payees]); // eslint-disable-line react-hooks/exhaustive-deps

  const addPayee = useCallback((name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const existing = payees.find(p => norm(p.name) === norm(trimmed));
    if (existing) return existing.id;
    const id = nanoid(8);
    setPayees(prev => [...prev, { id, name: trimmed, defaultCategoryId: null, defaultSubcategoryId: null }]);
    return id;
  }, [payees]);

  const renamePayee = useCallback((id, name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return { ok: false, reason: 'empty' };
    const conflict = payees.find(p => p.id !== id && norm(p.name) === norm(trimmed));
    if (conflict) return { ok: false, reason: 'duplicate', conflictId: conflict.id };
    setPayees(prev => prev.map(p => (p.id === id ? { ...p, name: trimmed } : p)));
    return { ok: true };
  }, [payees]);

  const setDefaultCategory = useCallback((id, categoryId, subcategoryId = null) => {
    setPayees(prev => prev.map(p => (p.id === id
      ? { ...p, defaultCategoryId: categoryId || null, defaultSubcategoryId: categoryId ? (subcategoryId || null) : null }
      : p)));
  }, []);

  const deletePayee = useCallback((id) => {
    setPayees(prev => prev.filter(p => p.id !== id));
  }, []);

  // Merge = drop the source entity; the caller reassigns the source's
  // transactions (ledger.reassignPayee) so App can make both one undo step.
  // The target's defaults are deliberately left unchanged (spec).
  const mergePayee = useCallback((sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setPayees(prev => prev.filter(p => p.id !== sourceId));
  }, []);

  const payeesById = useMemo(() => new Map(payees.map(p => [p.id, p])), [payees]);

  const snapshot = useCallback(() => payees, [payees]);
  const restore = useCallback((list) => setPayees(Array.isArray(list) ? list : []), []);
  const clearStorageError = useCallback(() => setStorageError(null), []);

  return {
    payees, payeesById,
    addPayee, renamePayee, setDefaultCategory, deletePayee, mergePayee,
    snapshot, restore, storageError, clearStorageError,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/usePayees.test.jsx`
Expected: PASS.

- [ ] **Step 5: Wire into App (state + undo + error toast)** — in `src/App.jsx`:

1. Import: `import usePayees from './usePayees.js';`
2. Below `const acks = useReportAcks();` add: `const payees = usePayees();`
3. In `pushHistory`'s snapshot object add: `payees: payees.snapshot(),`
4. In `undo()` after `acks.restore(entry.acks);` add: `payees.restore(entry.payees);`
5. Next to the `acks.storageError` toast add:

```jsx
      {payees.storageError && (
        <div className="toast toast-error">{payees.storageError.message}
          <button type="button" className="toast-dismiss" aria-label="Dismiss" onClick={payees.clearStorageError}>×</button>
        </div>
      )}
```

- [ ] **Step 6: Full suite + commit**

Run: `npx vitest run`
Expected: PASS (smoke tests render App; if one asserts on toast count or hook order, adjust it).

```bash
git add src/usePayees.js src/usePayees.test.jsx src/App.jsx
git commit -m "feat(payees): usePayees hook wired into App state + undo"
```

---

### Task 5: Drafts, templates, copy/paste (`entryDrafts`)

**Files:**
- Modify: `src/entryDrafts.js`
- Modify: `src/App.jsx` (labelFor / instantiate call sites)
- Test: `src/entryDrafts.test.js` (update + add)

**Interfaces:**
- Consumes: nothing new (pure module).
- Produces: transaction draft payloads carry `payeeId` (never `payee`); `instantiateTransaction(draft, { …, payeesById })` degrades a missing/deleted `payeeId` to `null`; `labelFor(draft, payeesById = null)` resolves the label through the map. TransactionEditor (Task 10) emits drafts in this shape.

- [ ] **Step 1: Write the failing tests** — in `src/entryDrafts.test.js`, update any seeds using `payee:` to `payeeId:`, then add:

```js
describe('payeeId in drafts', () => {
  const bankAccount = { id: 'a1', name: 'Chase', type: 'bank' };
  const personAccount = { id: 'a2', name: 'Dad', type: 'person' };
  const payeesById = new Map([['p1', { id: 'p1', name: 'Costco', defaultCategoryId: null, defaultSubcategoryId: null }]]);

  it('makeTransactionDraft carries payeeId, never payee', () => {
    const draft = makeTransactionDraft({ description: 'x', amount: -5, categoryId: 'c', subId: null, payeeId: 'p1', checkNumber: null, splits: null });
    expect(draft.payload.payeeId).toBe('p1');
    expect('payee' in draft.payload).toBe(false);
  });

  it('instantiateTransaction keeps a live payeeId on bank accounts, degrades a dead one, strips on non-bank', () => {
    const draft = makeTransactionDraft({ description: 'x', amount: -5, categoryId: 'c', subId: null, payeeId: 'p1', checkNumber: null, splits: null });
    expect(instantiateTransaction(draft, { account: bankAccount, payeesById }).payeeId).toBe('p1');
    const dead = makeTransactionDraft({ description: 'x', amount: -5, categoryId: 'c', subId: null, payeeId: 'gone', checkNumber: null, splits: null });
    expect(instantiateTransaction(dead, { account: bankAccount, payeesById }).payeeId).toBeNull();
    expect(instantiateTransaction(draft, { account: personAccount, payeesById }).payeeId).toBeNull();
  });

  it('labelFor resolves the payee name via payeesById, falling back to description', () => {
    const draft = makeTransactionDraft({ description: 'weekly run', amount: -5, categoryId: 'c', subId: null, payeeId: 'p1', checkNumber: null, splits: null });
    expect(labelFor(draft, payeesById)).toBe('Costco');
    expect(labelFor(draft)).toBe('weekly run'); // no map → fall back
    const bare = makeTransactionDraft({ description: '', amount: -5, categoryId: 'c', subId: null, payeeId: null, checkNumber: null, splits: null });
    expect(labelFor(bare, payeesById)).toBe('Transaction');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/entryDrafts.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** — in `src/entryDrafts.js`:

In `makeTransactionDraft`, replace `payee: f.payee || null,` with:

```js
    payeeId: f.payeeId || null,
```

In `instantiateTransaction`, change the signature to add `payeesById`:

```js
export function instantiateTransaction(draft, { account, typesById = DEFAULT_ACCOUNT_TYPES_BY_ID, date = todayISO(), fallbackCategoryId = null, payeesById = null } = {}) {
```

and replace `payee: isBank ? (p.payee || null) : null,` with:

```js
    payeeId: isBank && p.payeeId && (!payeesById || payeesById.has(p.payeeId)) ? p.payeeId : null,
```

Replace `labelFor` with:

```js
export function labelFor(draft, payeesById = null) {
  const p = (draft && draft.payload) || {};
  if (draft && draft.kind === 'transfer') return p.description || 'Transfer';
  const payeeName = payeesById && p.payeeId ? (payeesById.get(p.payeeId)?.name || '') : '';
  return payeeName || p.description || 'Transaction';
}
```

- [ ] **Step 4: Update App call sites** — in `src/App.jsx`:

- `copyEntry`: `const label = labelFor(draft, payees.payeesById);`
- `pasteEntry` / `duplicateEntry` / `applyTemplate`: every `instantiateTransaction(draft, { account: …, typesById: …, fallbackCategoryId: … })` gains `payeesById: payees.payeesById` in its options object (three call sites).
- `requestSaveTemplate`: `setTemplateDraft({ draft, defaultName: labelFor(draft, payees.payeesById) });`

- [ ] **Step 5: Run to verify pass, then full suite**

Run: `npx vitest run src/entryDrafts.test.js && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/entryDrafts.js src/entryDrafts.test.js src/App.jsx
git commit -m "feat(payees): drafts/templates/copy-paste carry payeeId with graceful degrade"
```

---

### Task 6: Archive schema v6 (export + restore)

**Files:**
- Modify: `src/exportArchive.js`
- Modify: `src/archiveRestore.js`
- Modify: `src/App.jsx` (`buildCurrentArchiveBytes`)
- Test: `src/exportArchive.test.js`, `src/archiveRestore.test.js`

**Interfaces:**
- Consumes: `payees` list + `payeesById` from App.
- Produces: `buildDataJson(accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now, reportAcks, templates, payees)`; `buildTransactionsCsv(accounts, transactions, categoriesById, payeesById)`; `buildArchive({ …, payees })`. `SUPPORTED_SCHEMA_VERSION = 6`. Restore of a v6 archive writes `tallio-payees` and stamps storage version `'5'`; restore of v≤5 removes `tallio-payees` and stamps `'4'` so Task 2's migration re-runs on reload.

- [ ] **Step 1: Write the failing tests**

Append to `src/exportArchive.test.js` (reuse its existing imports/idioms):

```js
describe('archive v6 payees', () => {
  const payees = [{ id: 'p1', name: 'Costco', defaultCategoryId: null, defaultSubcategoryId: null }];
  const payeesById = new Map(payees.map(p => [p.id, p]));
  const accounts = [{ id: 'a1', name: 'Chase' }];
  const txns = [{ id: 't1', accountId: 'a1', date: '2026-01-05', amount: -10, categoryId: 'c1', description: 'run', payeeId: 'p1', checkNumber: null, transferId: null }];

  it('buildDataJson includes payees', () => {
    const data = JSON.parse(buildDataJson(accounts, txns, [], [], 6, '1.0.0', new Date('2026-01-02T00:00:00Z'), null, null, payees));
    expect(data.schemaVersion).toBe(6);
    expect(data.payees).toEqual(payees);
  });

  it('buildTransactionsCsv resolves the payee column to the entity name', () => {
    const csv = buildTransactionsCsv(accounts, txns, new Map(), payeesById);
    const dataRow = csv.split('\n')[1];
    expect(dataRow).toContain('Costco');
  });

  it('buildArchive round-trips payees through parseArchive', () => {
    const bytes = buildArchive({ accounts, transactions: txns, categories: [], accountTypes: [], schemaVersion: 6, appVersion: '1', now: new Date('2026-01-02T00:00:00Z'), payees });
    const { data } = parseArchive(bytes);
    expect(data.payees).toEqual(payees);
  });
});
```

Append to `src/archiveRestore.test.js` (it already has a storage stub — reuse it):

```js
  it('accepts v6, writes tallio-payees, and stamps storage version 5', async () => {
    const storage = makeStorage(); // reuse the file's existing stub factory
    await restoreArchiveToStorage({ data: {
      schemaVersion: 6, accounts: [], transactions: [], categories: [], accountTypes: [], templates: [],
      reportAcks: { subscriptions: {}, dismissedDuplicates: [] },
      payees: [{ id: 'p1', name: 'Costco', defaultCategoryId: null, defaultSubcategoryId: null }],
    }, appearance: null, images: [] }, { storage, imageStore: fakeImageStore });
    expect(JSON.parse(storage.getItem('tallio-payees'))).toHaveLength(1);
    expect(storage.getItem('tallio-schema-version')).toBe('5');
  });

  it('restoring a v5 archive clears tallio-payees and drops storage version to 4 (migration re-runs on reload)', async () => {
    const storage = makeStorage();
    storage.setItem('tallio-payees', '[{"id":"stale"}]');
    storage.setItem('tallio-schema-version', '5');
    await restoreArchiveToStorage({ data: {
      schemaVersion: 5, accounts: [], transactions: [], categories: [], accountTypes: [], templates: [],
      reportAcks: { subscriptions: {}, dismissedDuplicates: [] },
    }, appearance: null, images: [] }, { storage, imageStore: fakeImageStore });
    expect(storage.getItem('tallio-payees')).toBeNull();
    expect(storage.getItem('tallio-schema-version')).toBe('4');
  });

  it('rejects archives newer than v6', () => {
    expect(() => assertSupportedSchema({ data: { schemaVersion: 7 } })).toThrow(/newer version/i);
  });
```

(Also update the file's existing `SUPPORTED_SCHEMA_VERSION + 1` / `schemaVersion: 5` assertions where they hard-code 5 as the max — v5 must remain *accepted*.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/exportArchive.test.js src/archiveRestore.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `exportArchive.js`**

```js
export function buildTransactionsCsv(accounts, transactions, categoriesById, payeesById = null) {
```

and inside the row mapper replace `payee: t.payee || '',` with:

```js
        payee: (payeesById && t.payeeId && (payeesById.get(t.payeeId)?.name)) || '',
```

`buildDataJson` gains a trailing `payees` param and field:

```js
export function buildDataJson(accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now, reportAcks = null, templates = null, payees = null) {
  return JSON.stringify({
    // …existing fields unchanged…
    templates: templates || [],
    payees: payees || [],
  }, null, 2);
}
```

`buildArchive` destructures `payees`, builds the map, and passes both through:

```js
export function buildArchive({ accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now, reportAcks, images, appearance, templates, payees }) {
  const categoriesById = new Map((categories || []).map(c => [c.id, c]));
  const payeesById = new Map((payees || []).map(p => [p.id, p]));
  const jsonString = buildDataJson(accounts, transactions, categories, accountTypes, schemaVersion, appVersion, now, reportAcks, templates, payees);
  const csvString = buildTransactionsCsv(accounts, transactions, categoriesById, payeesById);
  // …rest unchanged…
```

- [ ] **Step 4: Implement `archiveRestore.js`**

```js
export const SUPPORTED_SCHEMA_VERSION = 6;
```

In `restoreArchiveToStorage`, capture the version and add the payees/version-key logic after the existing `setItem` calls:

```js
export async function restoreArchiveToStorage(parsed, { storage = localStorage, imageStore = realImageStore } = {}) {
  const v = assertSupportedSchema(parsed);
  const { data, appearance, images } = parsed;
  // …existing setItem calls unchanged…

  if (v >= 6) {
    storage.setItem('tallio-payees', JSON.stringify(data.payees || []));
    storage.setItem('tallio-schema-version', '5');
  } else {
    // Pre-payees archive: drop the storage version back so the payee migration
    // re-runs from this archive's string payees on the post-restore reload.
    storage.removeItem('tallio-payees');
    storage.setItem('tallio-schema-version', '4');
  }
  // …image handling unchanged…
```

- [ ] **Step 5: Update App export** — in `buildCurrentArchiveBytes` change `schemaVersion: 5` to `schemaVersion: 6` and add `payees: payees.payees,` to the `buildArchive` call.

- [ ] **Step 6: Run to verify pass, then full suite**

Run: `npx vitest run src/exportArchive.test.js src/archiveRestore.test.js && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/exportArchive.js src/archiveRestore.js src/App.jsx src/exportArchive.test.js src/archiveRestore.test.js
git commit -m "feat(payees): archive schema v6 — payees in exports, v5 imports re-migrate"
```

---

### Task 7: Register display — resolve names, search, sort

**Files:**
- Modify: `src/accountsModel.js` (`computeRegister`, `filterTransactions`, `sortRows`)
- Modify: `src/TransactionRow.jsx` (line ~90)
- Modify: `src/Register.jsx` (thread `payeesById`)
- Modify: `src/App.jsx` (pass prop; strip display fields in `saveTransaction`)
- Test: `src/accountsModel.test.js` (add cases), `src/Register.test.jsx` (update seeds if needed)

**Interfaces:**
- Consumes: `payeesById` from `usePayees`.
- Produces: `computeRegister(account, transactions, payeesById = null)` decorates each row with derived `payeeName: string`; `filterTransactions` searches it; `sortRows` sorts the `'payee'` column by it. **`payeeName` is display-only** — App's `saveTransaction` strips it (plus the pre-existing `balance`/`_matchedSplitId` leaks) before the ledger sees a patch.

- [ ] **Step 1: Write the failing tests** — append to `src/accountsModel.test.js`:

```js
describe('payee name resolution in the register', () => {
  const account = { id: 'a1', name: 'Chase', type: 'bank', openingBalance: 0 };
  const payeesById = new Map([['p1', { id: 'p1', name: 'Costco' }]]);
  const txns = [
    { id: 't1', accountId: 'a1', date: '2026-01-05', amount: -10, categoryId: 'c1', description: 'run', payeeId: 'p1', checkNumber: null, transferId: null },
    { id: 't2', accountId: 'a1', date: '2026-01-06', amount: -20, categoryId: 'c1', description: 'atm', payeeId: null, checkNumber: null, transferId: null },
  ];

  it('computeRegister decorates rows with payeeName', () => {
    const rows = computeRegister(account, txns, payeesById);
    expect(rows.find(r => r.id === 't1').payeeName).toBe('Costco');
    expect(rows.find(r => r.id === 't2').payeeName).toBe('');
  });

  it('filterTransactions matches on the resolved payee name', () => {
    const rows = computeRegister(account, txns, payeesById);
    expect(filterTransactions(rows, { search: 'costco' }).map(r => r.id)).toEqual(['t1']);
  });

  it('sortRows key "payee" orders by resolved name, empty last on asc', () => {
    const rows = computeRegister(account, txns, payeesById);
    expect(sortRows(rows, { key: 'payee', dir: 'asc' }).map(r => r.id)).toEqual(['t1', 't2']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/accountsModel.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `accountsModel.js`**

`computeRegister` (line ~72) gains the param and decoration:

```js
export function computeRegister(account, transactions, payeesById = null) {
  // …unchanged filtering/sorting…
  let bal = opening(account);
  return mine.map(({ t }) => {
    bal += Number.isFinite(t.amount) ? t.amount : 0;
    return {
      ...t,
      balance: bal,
      payeeName: (payeesById && t.payeeId && (payeesById.get(t.payeeId)?.name)) || '',
    };
  });
}
```

`filterTransactions` (line ~148): replace `if ((r.payee || '').toLowerCase().includes(term)) return true;` with:

```js
    if ((r.payeeName || '').toLowerCase().includes(term)) return true;
```

`sortRows` (line ~202): replace the string-key branch with:

```js
      } else if (key === 'payee' || key === 'checkNumber' || key === 'description') {
        const field = key === 'payee' ? 'payeeName' : key;
        sa = (a[field] || '').toLowerCase();
        sb = (b[field] || '').toLowerCase();
      } else { // 'date' (default)
```

- [ ] **Step 4: Update the consumers**

`src/TransactionRow.jsx` line ~90: `<td className="txn-payee">{row.payeeName || '—'}</td>`

`src/Register.jsx`: add `payeesById = null` to the destructured props; pass it through:

```js
  const rows = useMemo(() => {
    const computed = computeRegister(account, transactions, payeesById);
    const filtered = filterTransactions(computed, { search, month: month || null, categoryId: categoryId || null }, categoriesById);
    return sortRows(filtered, sort, categoriesById);
  }, [account, transactions, payeesById, search, month, categoryId, categoriesById, sort]);
```

`src/App.jsx`: pass `payeesById={payees.payeesById}` to `<Register …>`, and harden `saveTransaction` so derived row fields never reach storage:

```js
  const saveTransaction = (data) => {
    pushHistory();
    // Strip display-only fields that ride along when a register row is edited.
    const { splitTargets, payeeName, balance, _matchedSplitId, ...rest } = data; // eslint-disable-line no-unused-vars
    const opts = splitTargets ? { splitTargets } : {};
    if (rest.id) ledger.updateTransaction(rest.id, rest, opts);
    else ledger.addTransaction(rest, opts);
    setEditingTxn(null);
  };
```

- [ ] **Step 5: Run to verify pass, then full suite** — Register/TransactionRow tests seeding `payee: 'x'` strings must switch to `payeeId` + a `payeesById` prop.

Run: `npx vitest run src/accountsModel.test.js src/Register.test.jsx src/TransactionRow.test.jsx && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat(payees): register resolves payeeName for display, search, and sort"
```

---

### Task 8: Reports resolve payee names

**Files:**
- Modify: `src/reportsModel.js` (`recurringCharges`, `findDuplicates`, `flattenForReports`)
- Modify: `src/ReportsScreen.jsx` (accept + thread `payeesById`)
- Modify: `src/App.jsx` (pass prop)
- Test: `src/reportsModel.test.js` (update + add)

**Interfaces:**
- Consumes: `payeesById` via `opts.payeesById` on the two grouping functions.
- Produces: recurring/duplicate grouping keys and labels use the resolved payee name (falling back to description, as before); `flattenForReports` passes `payeeId` through instead of `payee`.

- [ ] **Step 1: Write the failing tests** — append to `src/reportsModel.test.js`:

```js
describe('payee resolution in reports', () => {
  const payeesById = new Map([['p1', { id: 'p1', name: 'Netflix' }]]);
  const cats = new Map([['c1', { id: 'c1', name: 'Fun', flow: 'expense' }]]);
  const t = (id, date, over = {}) => ({ id, accountId: 'a1', date, amount: -15.99, categoryId: 'c1', description: '', payeeId: 'p1', checkNumber: null, transferId: null, ...over });

  it('recurringCharges groups by resolved payee name across months', () => {
    const rows = recurringCharges([t('t1', '2026-01-05'), t('t2', '2026-02-05')], cats, { payeesById, now: new Date('2026-02-20') });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Netflix');
  });

  it('findDuplicates keys on resolved payee name', () => {
    const dupes = findDuplicates([t('t1', '2026-01-05'), t('t2', '2026-01-05')], { payeesById });
    expect(dupes).toHaveLength(1);
    expect(dupes[0].label).toBe('Netflix');
  });

  it('flattenForReports passes payeeId through on split rows', () => {
    const parent = t('t1', '2026-01-05', { splits: [{ id: 's1', amount: -15.99, categoryId: 'c1', description: '' }] });
    const [row] = [...flattenForReports([parent])];
    expect(row.payeeId).toBe('p1');
    expect('payee' in row).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/reportsModel.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `reportsModel.js`**

Add a tiny resolver next to `normalizeLabel` (line ~203):

```js
function payeeNameOf(t, payeesById) {
  return (payeesById && t.payeeId && (payeesById.get(t.payeeId)?.name)) || '';
}
```

`recurringCharges` (line ~218): destructure the option — `const { now = new Date(), payeesById = null } = opts;` — then replace the two `t.payee` reads:

```js
    const key = normalizeLabel(payeeNameOf(t, payeesById) || t.description);
    // …
      label: (payeeNameOf(t, payeesById) || t.description || '').trim(),
```

`findDuplicates` (line ~274): read `const payeesById = opts.payeesById || null;` near the top, then:

```js
    const key = `${t.accountId}|${date}|${amt}|${normalizeLabel(payeeNameOf(t, payeesById) || t.description)}`;
    // …
      label: (payeeNameOf(t0, payeesById) || t0.description || '').trim(),
```

`flattenForReports` (line ~374): replace `payee: t.payee,` with `payeeId: t.payeeId,` in the yielded split row.

- [ ] **Step 4: Thread through the screen** — `src/ReportsScreen.jsx`: add `payeesById = null` to the destructured props; add it to both call sites (lines ~40 and ~43) inside the opts object — `{ ...opts, payeesById, now: nowDate }` and `{ ...opts, payeesById, dismissed: dismissedSet }` — and to both `useMemo` dependency arrays. In `src/App.jsx`, pass `payeesById={payees.payeesById}` to `<ReportsScreen …>`.

- [ ] **Step 5: Run to verify pass, then full suite** (update any reportsModel test seeds still using `payee:` strings)

Run: `npx vitest run src/reportsModel.test.js src/ReportsScreen.test.jsx && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/reportsModel.js src/reportsModel.test.js src/ReportsScreen.jsx src/App.jsx
git commit -m "feat(payees): reports group and label by resolved payee names"
```

---

### Task 9: `PayeePicker` component

**Files:**
- Create: `src/PayeePicker.jsx`
- Test: `src/PayeePicker.test.jsx`

**Interfaces:**
- Consumes: `.cat-picker-*` CSS (existing).
- Produces: `<PayeePicker payees value onChange onCreate ariaLabel />` — `value` is a payeeId or null; `onChange(payeeId|null)`; `onCreate(name) → id` (App supplies `payees.addPayee` wrapped in `pushHistory`). Case-insensitive exact match hides the create row. Always offers "— No payee —". TransactionEditor (Task 10) renders this.

- [ ] **Step 1: Write the failing tests**

```jsx
// src/PayeePicker.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PayeePicker from './PayeePicker.jsx';

const payees = [
  { id: 'p1', name: 'Costco', defaultCategoryId: null, defaultSubcategoryId: null },
  { id: 'p2', name: 'Shell', defaultCategoryId: null, defaultSubcategoryId: null },
];

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Payee' }));

describe('PayeePicker', () => {
  it('shows the selected name on the trigger, or the none label', () => {
    const { rerender } = render(<PayeePicker payees={payees} value="p1" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Payee' }).textContent).toContain('Costco');
    rerender(<PayeePicker payees={payees} value={null} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Payee' }).textContent).toContain('No payee');
  });

  it('filters by query and selects on click', () => {
    const onChange = vi.fn();
    render(<PayeePicker payees={payees} value={null} onChange={onChange} />);
    open();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'she' } });
    expect(screen.queryByText('Costco')).toBeNull();
    fireEvent.click(screen.getByText('Shell'));
    expect(onChange).toHaveBeenCalledWith('p2');
  });

  it('clears via the none option', () => {
    const onChange = vi.fn();
    render(<PayeePicker payees={payees} value="p1" onChange={onChange} />);
    open();
    fireEvent.click(screen.getByText('— No payee —'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('offers inline create for a novel name, but not for a case-insensitive match', () => {
    const onCreate = vi.fn(() => 'p9');
    const onChange = vi.fn();
    render(<PayeePicker payees={payees} value={null} onChange={onChange} onCreate={onCreate} />);
    open();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'costco' } });
    expect(screen.queryByText(/New payee/)).toBeNull();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Trader Joes' } });
    fireEvent.click(screen.getByText(/New payee/));
    expect(onCreate).toHaveBeenCalledWith('Trader Joes');
    expect(onChange).toHaveBeenCalledWith('p9');
  });

  it('supports keyboard: arrows + Enter select the highlighted option', () => {
    const onChange = vi.fn();
    render(<PayeePicker payees={payees} value={null} onChange={onChange} />);
    open();
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('p2'); // Costco is index 0; ArrowDown → Shell
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/PayeePicker.test.jsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** (modeled on CategoryPicker; reuses its CSS classes)

```jsx
// src/PayeePicker.jsx
// Searchable payee selector with inline create — CategoryPicker's interaction
// pattern (search, keyboard nav, drop-up, outside-click close) on a flat list.
import { useState, useRef, useEffect, useMemo } from 'react';

export default function PayeePicker({ payees = [], value = null, onChange, onCreate = null, ariaLabel = 'Payee' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [dropUp, setDropUp] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const sorted = useMemo(
    () => [...payees].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [payees]
  );
  const q = query.trim();
  const options = useMemo(
    () => (q ? sorted.filter(p => p.name.toLowerCase().includes(q.toLowerCase())) : sorted),
    [sorted, q]
  );
  const selected = payees.find(p => p.id === value) || null;
  const exactExists = sorted.some(p => p.name.trim().toLowerCase() === q.toLowerCase());
  const showCreate = !!onCreate && q !== '' && !exactExists;

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setHighlight(0); }, [query, open]);

  const toggleOpen = (e) => {
    if (!open) {
      const r = e.currentTarget.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      const spaceBelow = vh - r.bottom;
      setDropUp(spaceBelow < 320 && r.top > spaceBelow);
    }
    setOpen(o => !o);
  };
  const choose = (id) => { onChange(id); setQuery(''); setOpen(false); };
  const create = () => {
    const id = onCreate(q);
    if (id) choose(id);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[highlight]) choose(options[highlight].id);
      else if (showCreate) create();
    }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  return (
    <div className="cat-picker" ref={rootRef}>
      <button type="button" className="cat-picker-trigger select" aria-label={ariaLabel}
        aria-haspopup="listbox" aria-expanded={open} onClick={toggleOpen}>
        <span className="cat-picker-value">{selected ? selected.name : '— No payee —'}</span>
        <span className="cat-picker-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={`cat-picker-popover${dropUp ? ' drop-up' : ''}`}>
          <input ref={inputRef} type="text" role="combobox" className="cat-picker-input input"
            aria-label={`${ariaLabel} search`} aria-expanded="true" placeholder="Type to filter…"
            value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} />
          <ul className="cat-picker-list" role="listbox">
            <li role="option" aria-selected={!selected} className="cat-picker-option cat-picker-none"
              onMouseDown={(e) => e.preventDefault()} onClick={() => choose(null)}>
              — No payee —
            </li>
            {options.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === highlight}
                className={`cat-picker-option${i === highlight ? ' active' : ''}`}
                onMouseEnter={() => setHighlight(i)} onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p.id)}>
                <span className="cat-picker-opt-name">{p.name}</span>
              </li>
            ))}
            {options.length === 0 && <li className="cat-picker-empty">No matches</li>}
          </ul>
          {showCreate && (
            <button type="button" className="cat-picker-create"
              onMouseDown={(e) => e.preventDefault()} onClick={create}>
              ＋ New payee “{q}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/PayeePicker.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PayeePicker.jsx src/PayeePicker.test.jsx
git commit -m "feat(payees): searchable PayeePicker with inline create"
```

---

### Task 10: TransactionEditor — picker + default-category auto-fill

**Files:**
- Modify: `src/TransactionEditor.jsx`
- Modify: `src/App.jsx` (new editor props)
- Test: `src/TransactionEditor.test.jsx` (update + add)

**Interfaces:**
- Consumes: `PayeePicker` (Task 9), `payeeId` drafts (Task 5), `payees`/`payeesById`/`addPayee` from App.
- Produces: editor state `payeeId`; `onSave` payload carries `payeeId: isBank ? (payeeId || null) : null` and never `payee`; template drafts carry `payeeId`; `SplitsEditor` receives the resolved payee *name*.
- **Spec interpretation (documented deliberately):** the spec says auto-fill applies "only when the current category is empty", but a new entry always pre-seeds `categories[0]`. The faithful implementation is **untouched-category** semantics: auto-fill applies on new entries while the user hasn't explicitly chosen a category (the seeded default doesn't count as a choice; a template prefill's category does). Never on edit.

- [ ] **Step 1: Write the failing tests** — in `src/TransactionEditor.test.jsx`, update seeds (`payee: 'x'` → `payeeId: 'px'` plus a `payees` prop), then add:

```jsx
describe('payee picker + defaults', () => {
  const bankAccount = { id: 'a1', name: 'Chase', type: 'bank', openingBalance: 0 };
  const categories = [
    { id: 'c-first', name: 'First', flow: 'expense', icon: '🧾' },
    { id: 'c-groceries', name: 'Groceries', flow: 'expense', icon: '🛒' },
  ];
  const payees = [{ id: 'p1', name: 'Costco', defaultCategoryId: 'c-groceries', defaultSubcategoryId: null }];
  const payeesById = new Map(payees.map(p => [p.id, p]));
  const base = { account: bankAccount, categories, payees, payeesById, onSave: () => {}, onDelete: () => {}, onClose: () => {}, onUndo: () => {} };

  it('renders a payee picker (not a text input) on bank accounts', () => {
    render(<TransactionEditor {...base} transaction={null} />);
    expect(screen.getByRole('button', { name: 'Payee' })).toBeTruthy();
  });

  it('saves payeeId from the picker selection', () => {
    const onSave = vi.fn();
    render(<TransactionEditor {...base} onSave={onSave} transaction={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Payee' }));
    fireEvent.click(screen.getByText('Costco'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const saved = onSave.mock.calls[0][0];
    expect(saved.payeeId).toBe('p1');
    expect('payee' in saved).toBe(false);
  });

  it('picking a payee on a NEW entry auto-fills its default category (untouched seed)', () => {
    const onSave = vi.fn();
    render(<TransactionEditor {...base} onSave={onSave} transaction={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Payee' }));
    fireEvent.click(screen.getByText('Costco'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave.mock.calls[0][0].categoryId).toBe('c-groceries');
  });

  it('does NOT auto-fill after the user explicitly chose a category', () => {
    const onSave = vi.fn();
    render(<TransactionEditor {...base} onSave={onSave} transaction={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Category' }));
    fireEvent.click(screen.getByText('First'));
    fireEvent.click(screen.getByRole('button', { name: 'Payee' }));
    fireEvent.click(screen.getByText('Costco'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave.mock.calls[0][0].categoryId).toBe('c-first');
  });

  it('does NOT auto-fill when editing an existing transaction', () => {
    const onSave = vi.fn();
    const txn = { id: 't1', accountId: 'a1', date: '2026-01-05', amount: -10, categoryId: 'c-first', description: '', payeeId: null, checkNumber: null, transferId: null };
    render(<TransactionEditor {...base} onSave={onSave} transaction={txn} />);
    fireEvent.click(screen.getByRole('button', { name: 'Payee' }));
    fireEvent.click(screen.getByText('Costco'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave.mock.calls[0][0].categoryId).toBe('c-first');
  });
});
```

(Adapt `render` helpers/queries to the file's existing conventions — e.g. if it wraps render or uses `getByLabelText`, follow suit. The CategoryPicker option for 'First' renders as `🧾 First` inside the popover — if `getByText('First')` is ambiguous, use the option role query the file already uses for category selection.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/TransactionEditor.test.jsx`
Expected: new tests FAIL (payee is still a text input).

- [ ] **Step 3: Implement** — in `src/TransactionEditor.jsx`:

1. Import: `import PayeePicker from './PayeePicker.jsx';`
2. Props: add `payees = []`, `payeesById = null`, `onCreatePayee = null` to the destructured list.
3. Replace `const [payee, setPayee] = useState(seed?.payee || '');` with:

```js
  const [payeeId, setPayeeId] = useState(seed?.payeeId ?? null);
  // Auto-fill guard: a template prefill that names a category counts as chosen;
  // the plain new-entry seed (categories[0]) does not.
  const [categoryTouched, setCategoryTouched] = useState(isEdit || !!prefill?.categoryId);
```

(Note: `isEdit` is declared above this line already.)

4. Add the payee-selection handler after `openSplits`:

```js
  const choosePayee = (id) => {
    setPayeeId(id);
    if (isEdit || categoryTouched || !id) return;
    const p = payeesById && payeesById.get(id);
    if (p && p.defaultCategoryId) {
      setCategoryId(p.defaultCategoryId);
      setSubId(p.defaultSubcategoryId || null);
    }
  };
```

5. Mark explicit category choices as touched — CategoryPicker `onChange`:

```jsx
          <CategoryPicker categories={categories} value={{ categoryId, subId }}
            onChange={({ categoryId: c, subId: s }) => { setCategoryId(c); setSubId(s); setCategoryTouched(true); }} ariaLabel="Category"
```

and in `onSplitsDone`, inside the `if (promotedCategoryId)` branch add `setCategoryTouched(true);`, and in the `else` branch (splits kept) also add `setCategoryTouched(true);` (splitting is an explicit categorization act).

6. Replace the payee `<label>`/`<input>` block (keep Check # as-is):

```jsx
            <div className="field"><span>Payee</span>
              <PayeePicker payees={payees} value={payeeId} onChange={choosePayee} onCreate={onCreatePayee} ariaLabel="Payee" />
            </div>
```

7. In `save()`, replace `payee: isBank ? (payee.trim() || null) : null,` with:

```js
      payeeId: isBank ? (payeeId || null) : null,
```

8. In `buildTemplateDraft`, replace `payee: isBank ? (payee.trim() || null) : null,` with:

```js
    payeeId: isBank ? (payeeId || null) : null,
```

9. SplitsEditor gets the resolved name: `parentPayee={payeesById?.get(payeeId)?.name || ''}`

- [ ] **Step 4: Wire App props** — in `src/App.jsx`'s `<TransactionEditor …>` add:

```jsx
          payees={payees.payees}
          payeesById={payees.payeesById}
          onCreatePayee={(name) => { pushHistory(); return payees.addPayee(name); }}
```

- [ ] **Step 5: Run to verify pass, then full suite** (existing TransactionEditor tests typing into the old payee input must be rewritten against the picker)

Run: `npx vitest run src/TransactionEditor.test.jsx && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/TransactionEditor.jsx src/TransactionEditor.test.jsx src/App.jsx
git commit -m "feat(payees): editor payee picker with default-category auto-fill"
```

---

### Task 11: Manage Payees screen + navigation

**Files:**
- Create: `src/ManagePayeesScreen.jsx`
- Test: `src/ManagePayeesScreen.test.jsx`
- Modify: `src/App.jsx` (screen, nav link, handlers)

**Interfaces:**
- Consumes: `ActionMenu`, `CategoryPicker` (`allowNone`), `PayeePicker`, `UndoButton`; `usePayees` + `useLedger` methods via App handlers.
- Produces: `<ManagePayeesScreen payees transactions categories onClose onRename onSetDefaultCategory onMerge onDelete onUndo undoCount />` where `onRename(id, name) → {ok, reason?, conflictId?}`, `onSetDefaultCategory(id, categoryId, subId)`, `onMerge(sourceId, targetId)`, `onDelete(id)`. App composes merge = `reassignPayee` + `mergePayee` and delete = `clearPayee` + `deletePayee`, each under ONE `pushHistory()`.

- [ ] **Step 1: Write the failing tests**

```jsx
// src/ManagePayeesScreen.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ManagePayeesScreen from './ManagePayeesScreen.jsx';

const payees = [
  { id: 'p1', name: 'Costco', defaultCategoryId: 'c1', defaultSubcategoryId: null },
  { id: 'p2', name: 'costco warehouse', defaultCategoryId: null, defaultSubcategoryId: null },
  { id: 'p3', name: 'Shell', defaultCategoryId: null, defaultSubcategoryId: null },
];
const categories = [{ id: 'c1', name: 'Groceries', flow: 'expense', icon: '🛒', subcategories: [] }];
const transactions = [
  { id: 't1', accountId: 'a1', date: '2026-01-05', amount: -10, categoryId: 'c1', description: '', payeeId: 'p1', checkNumber: null, transferId: null },
  { id: 't2', accountId: 'a1', date: '2026-01-06', amount: -20, categoryId: 'c1', description: '', payeeId: 'p1', checkNumber: null, transferId: null },
  { id: 't3', accountId: 'a1', date: '2026-01-07', amount: -30, categoryId: 'c1', description: '', payeeId: 'p3', checkNumber: null, transferId: null },
];

const base = { payees, transactions, categories, onClose: () => {}, onRename: () => ({ ok: true }), onSetDefaultCategory: () => {}, onMerge: () => {}, onDelete: () => {}, onUndo: () => {}, undoCount: 0 };

const rowFor = (name) => screen.getByText(name).closest('li');

describe('ManagePayeesScreen', () => {
  beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('lists payees with usage counts and default chips, filterable by search', () => {
    render(<ManagePayeesScreen {...base} />);
    expect(within(rowFor('Costco')).getByText('2 uses')).toBeTruthy();
    expect(within(rowFor('Costco')).getByText(/Groceries/)).toBeTruthy();
    expect(within(rowFor('Shell')).getByText('1 use')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search payees'), { target: { value: 'shell' } });
    expect(screen.queryByText('Costco')).toBeNull();
    expect(screen.getByText('Shell')).toBeTruthy();
  });

  it('renames inline, and surfaces a duplicate-name rejection', () => {
    const onRename = vi.fn()
      .mockReturnValueOnce({ ok: false, reason: 'duplicate', conflictId: 'p1' })
      .mockReturnValueOnce({ ok: true });
    render(<ManagePayeesScreen {...base} onRename={onRename} />);
    fireEvent.click(within(rowFor('Shell')).getByRole('button', { name: 'Payee actions for Shell' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = screen.getByLabelText('Rename payee');
    fireEvent.change(input, { target: { value: 'Costco' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText(/already exists/i)).toBeTruthy();
    fireEvent.change(input, { target: { value: 'Chevron' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenLastCalledWith('p3', 'Chevron');
  });

  it('merge picks a target (self excluded) and calls onMerge(source, target)', () => {
    const onMerge = vi.fn();
    render(<ManagePayeesScreen {...base} onMerge={onMerge} />);
    fireEvent.click(within(rowFor('costco warehouse')).getByRole('button', { name: 'Payee actions for costco warehouse' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Merge into…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Merge target' }));
    expect(screen.queryAllByText('costco warehouse').length).toBe(1); // only the row title; not offered as a target
    fireEvent.click(screen.getAllByText('Costco').find(el => el.closest('.cat-picker-popover')));
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(onMerge).toHaveBeenCalledWith('p2', 'p1');
  });

  it('delete confirms with the usage count and calls onDelete', () => {
    const onDelete = vi.fn();
    render(<ManagePayeesScreen {...base} onDelete={onDelete} />);
    fireEvent.click(within(rowFor('Costco')).getByRole('button', { name: 'Payee actions for Costco' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('2'));
    expect(onDelete).toHaveBeenCalledWith('p1');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ManagePayeesScreen.test.jsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```jsx
// src/ManagePayeesScreen.jsx
// Payee maintenance: searchable list with usage counts, rename / set-default /
// merge / delete via a per-row ⋮ menu. Reuses the manage-* screen chrome.
import { useState, useMemo } from 'react';
import ActionMenu from './ActionMenu.jsx';
import CategoryPicker from './CategoryPicker.jsx';
import PayeePicker from './PayeePicker.jsx';
import UndoButton from './UndoButton.jsx';
import { iconGlyph } from './iconValue.js';

export default function ManagePayeesScreen({
  payees = [], transactions = [], categories = [],
  onClose, onRename, onSetDefaultCategory, onMerge, onDelete,
  onUndo, undoCount = 0,
}) {
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState(null);
  const [defaultForId, setDefaultForId] = useState(null);
  const [mergeSourceId, setMergeSourceId] = useState(null);
  const [mergeTargetId, setMergeTargetId] = useState(null);

  const usageCounts = useMemo(() => {
    const counts = new Map();
    for (const t of transactions) {
      if (t && t.payeeId) counts.set(t.payeeId, (counts.get(t.payeeId) || 0) + 1);
    }
    return counts;
  }, [transactions]);

  const defaultChip = (p) => {
    if (!p.defaultCategoryId) return null;
    const cat = categories.find(c => c.id === p.defaultCategoryId);
    if (!cat) return null;
    const sub = p.defaultSubcategoryId
      ? (cat.subcategories || []).find(s => s.id === p.defaultSubcategoryId)
      : null;
    return `${iconGlyph(cat.icon)} ${cat.name}${sub ? ` › ${sub.name}` : ''}`;
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? payees.filter(p => p.name.toLowerCase().includes(q)) : payees;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [payees, query]);

  const startRename = (p) => { setRenamingId(p.id); setRenameValue(p.name); setRenameError(null); };
  const commitRename = () => {
    const res = onRename(renamingId, renameValue);
    if (res && res.ok) { setRenamingId(null); setRenameError(null); }
    else if (res && res.reason === 'duplicate') setRenameError('That name already exists — use Merge instead.');
    else setRenameError('Enter a name.');
  };

  const startMerge = (p) => { setMergeSourceId(p.id); setMergeTargetId(null); };
  const commitMerge = () => {
    if (mergeSourceId && mergeTargetId) onMerge(mergeSourceId, mergeTargetId);
    setMergeSourceId(null); setMergeTargetId(null);
  };

  const confirmDelete = (p) => {
    const n = usageCounts.get(p.id) || 0;
    if (window.confirm(`Delete "${p.name}"? ${n} transaction${n === 1 ? '' : 's'} will lose this payee.`)) {
      onDelete(p.id);
    }
  };

  const mergeSource = payees.find(p => p.id === mergeSourceId) || null;

  return (
    <div className="manage-screen">
      <header className="manage-header">
        <button type="button" className="btn" onClick={onClose}>‹ Back</button>
        <h1 className="manage-title">Manage Payees</h1>
        <UndoButton count={undoCount} onUndo={onUndo} />
      </header>

      <div className="manage-body">
        <div className="manage-list" style={{ width: '100%' }}>
          <input type="text" className="input" aria-label="Search payees" placeholder="Search payees…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
          <ul className="manage-items">
            {visible.map(p => {
              const n = usageCounts.get(p.id) || 0;
              return (
                <li key={p.id} className="manage-item">
                  {renamingId === p.id ? (
                    <span className="manage-item-rename">
                      <input type="text" className="input" aria-label="Rename payee" autoFocus
                        value={renameValue}
                        onChange={(e) => { setRenameValue(e.target.value); setRenameError(null); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                          else if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null); }
                        }} />
                      <button type="button" className="btn btn-small" onClick={commitRename}>Save</button>
                      {renameError && <span className="manage-item-error" role="alert">{renameError}</span>}
                    </span>
                  ) : (
                    <>
                      <span className="manage-item-name">{p.name}</span>
                      <span className="manage-item-meta">{n} {n === 1 ? 'use' : 'uses'}</span>
                      {defaultChip(p) && <span className="manage-item-chip">{defaultChip(p)}</span>}
                    </>
                  )}
                  {defaultForId === p.id && (
                    <CategoryPicker categories={categories} value={{ categoryId: p.defaultCategoryId, subId: p.defaultSubcategoryId }}
                      allowNone noneLabel="— No default —" ariaLabel={`Default category for ${p.name}`}
                      onChange={({ categoryId, subId }) => { onSetDefaultCategory(p.id, categoryId, subId); setDefaultForId(null); }} />
                  )}
                  <ActionMenu label={`Payee actions for ${p.name}`} items={[
                    { label: 'Rename', onSelect: () => startRename(p) },
                    { label: 'Set default category', onSelect: () => setDefaultForId(defaultForId === p.id ? null : p.id) },
                    { label: 'Merge into…', onSelect: () => startMerge(p) },
                    { label: 'Delete', danger: true, onSelect: () => confirmDelete(p) },
                  ]} />
                </li>
              );
            })}
            {visible.length === 0 && <li className="manage-empty">No payees.</li>}
          </ul>
        </div>
      </div>

      {mergeSource && (
        <div className="dialog-overlay" onClick={() => setMergeSourceId(null)}>
          <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="dialog-title">Merge “{mergeSource.name}” into…</h2>
            <p className="dialog-note">
              {(usageCounts.get(mergeSource.id) || 0)} transaction{(usageCounts.get(mergeSource.id) || 0) === 1 ? '' : 's'} will move
              to the target payee. The target keeps its own default category.
            </p>
            <PayeePicker ariaLabel="Merge target"
              payees={payees.filter(p => p.id !== mergeSource.id)}
              value={mergeTargetId} onChange={setMergeTargetId} />
            <div className="dialog-actions">
              <div className="dialog-actions-primary">
                <button type="button" className="btn" onClick={() => setMergeSourceId(null)}>Cancel</button>
                <button type="button" className="btn btn-primary" disabled={!mergeTargetId} onClick={commitMerge}>Merge</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

(If `manage-items` / `manage-item*` / `dialog-note` classes don't exist in `App.css`, add minimal rules alongside the existing `.manage-*` block — list layout, muted `.manage-item-meta`, small rounded `.manage-item-chip`, red `.manage-item-error` — matching the file's variable-based styling.)

- [ ] **Step 4: Wire App** — in `src/App.jsx`:

1. Import: `import ManagePayeesScreen from './ManagePayeesScreen.jsx';`
2. Nav (header, after Categories): `<button type="button" className="top-nav-link" onClick={() => setScreen('manage-payees')}>Payees</button>`
3. Screen block next to `manage-categories`:

```jsx
      {screen === 'manage-payees' && (
        <ManagePayeesScreen
          payees={payees.payees}
          transactions={ledger.transactions}
          categories={cats.categories}
          onClose={() => setScreen('main')}
          onRename={(id, name) => {
            // Validate BEFORE pushing history so a rejected rename isn't an undo step.
            const trimmed = (name || '').trim();
            const conflict = payees.payees.find(p => p.id !== id && p.name.trim().toLowerCase() === trimmed.toLowerCase());
            if (!trimmed) return { ok: false, reason: 'empty' };
            if (conflict) return { ok: false, reason: 'duplicate', conflictId: conflict.id };
            pushHistory();
            return payees.renamePayee(id, trimmed);
          }}
          onSetDefaultCategory={(id, categoryId, subId) => { pushHistory(); payees.setDefaultCategory(id, categoryId, subId); }}
          onMerge={(sourceId, targetId) => {
            pushHistory(); // one step: reassignment + entity removal undo together
            ledger.reassignPayee(sourceId, targetId);
            payees.mergePayee(sourceId, targetId);
          }}
          onDelete={(id) => {
            pushHistory(); // one step: clearing + entity removal undo together
            ledger.clearPayee(id);
            payees.deletePayee(id);
          }}
          onUndo={undo}
          undoCount={history.length}
        />
      )}
```

- [ ] **Step 5: Run to verify pass, then full suite**

Run: `npx vitest run src/ManagePayeesScreen.test.jsx && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat(payees): Manage Payees screen — rename, defaults, merge, delete (undoable)"
```

---

### Task 12: Sweep, full verification, and hand-check

**Files:**
- Possibly small fixes anywhere; no new features.

- [ ] **Step 1: Sweep for stragglers** — every remaining non-test read/write of the old field must be gone:

Run: `grep -rn "\.payee\b\|payee:" src --include="*.js" --include="*.jsx" | grep -v test | grep -v payeeId | grep -v payeeName | grep -v payeeNameOf | grep -v "'payee'" | grep -v parentPayee`
Expected: only `src/accountsMigration.js:41` (`payee: null` in the pure v3→v4 step — intentionally untouched; the v4→v5 migration converts it) and comment lines. Anything else: fix it now.

- [ ] **Step 2: Full suite**

Run: `npx vitest run`
Expected: ALL tests pass (original ~1037 + the ~40 new ones). Zero skips.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean (or only pre-existing warnings).

- [ ] **Step 4: Hand verification (use the verify/run skill at execution time)** — `npm run dev`, then walk:
  1. A ledger seeded with v4-style data (set `tallio-schema-version` to `4` and string payees in devtools → reload) migrates: payees appear, register shows names.
  2. New entry on a bank account: payee picker searches, inline-creates, and picking "Costco" pre-fills its default category; choosing a category first prevents the auto-fill.
  3. Manage Payees: rename (and a blocked duplicate), set default, merge two payees (register updates), delete (payee cleared) — and **Undo reverts each in one step, including merge/delete**.
  4. Register: search by payee name; sort by the Payee column; row displays names.
  5. Reports: recurring/duplicates group under payee names.
  6. Export → wipe → import round-trips payees (v6). Import an old v5 archive → payees regenerate from its strings.
  7. Copy/paste + templates carry the payee; template label shows the payee name.

- [ ] **Step 5: Final commit + report**

```bash
git add -A
git commit -m "test(payees): final sweep — suite green end to end"
```

Report to the user with the superpowers:finishing-a-development-branch skill (merge vs PR decision is theirs).

---

## Self-Review (performed at plan-writing time)

- **Spec coverage:** data model + `tallio-payees` (T4), migration incl. templates + default seeding (T1–T2), entry UX picker/inline-create/clearable/bank-only (T9–T10), drafts degrade (T5), display fallbacks → name lookup (T5 `labelFor`, T7 register, T8 reports), default auto-fill rules (T10), manage screen rename/duplicate-block/set-default/merge/delete (T11), undo one-step merge/delete (T11 handlers), archive v6 + v5 import (T6), CSV names (T6), splits inherit parent payeeId (T3). Non-goals untouched.
- **Deliberate deviations from spec letter (flagged):** (1) auto-fill implements *untouched-category* semantics because a new entry pre-seeds `categories[0]` — the spec's "empty category" state doesn't exist in the editor; (2) migration idempotency is enforced by the `tallio-schema-version` key (the codebase's established mechanism) rather than shape-sniffing, with `migrateToPayees` itself still safe on re-run.
- **Type consistency check:** `payeeId` (stored) / `payeeName` (derived, display-only) / `payeesById` (Map) / `defaultCategoryId`+`defaultSubcategoryId` used consistently across all tasks; `onSetDefaultCategory(id, categoryId, subId)` matches T4's `setDefaultCategory(id, categoryId, subcategoryId)`.
