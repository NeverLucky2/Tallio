# Celebrations / Milestone Rewards — Design

**Date:** 2026-06-08
**Sub-project:** #3 of the Tallio "Make it Mine" initiative
**Status:** Approved (brainstorming complete)

## Intent

Make Tallio feel personal and motivating (vs. Quicken) by surfacing a satisfying,
*earned* moment when the user hits a real financial milestone — detected purely from
their own ledger/report data.

The day-to-day user is a meticulous father who reconciles to the dollar. So the
overriding constraint is **trust**: a celebration must never interfere with data entry,
reconciliation, or accuracy; it must never produce a false positive; and it must never
re-celebrate the same achievement. It is ephemeral, dismissible UI layered on top of —
and strictly separate from — the financial data.

## Milestones (v1)

Four milestones, each a pure function over ledger/report state. Two more
(savings-goal, month-reconciled) are explicitly **deferred** — each needs a new
underlying feature (a goal model / a reconcile feature) that does not exist yet.

### A. Debt paid off — `paidoff:<accountId>`
For each **liability**-class account, compute running balances (via
`accountsModel.computeRegister` / `accountBalance`). Achieved when the **minimum running
balance was ever < 0 AND the current balance is ≥ 0**.

The "ever negative" guard means a brand-new $0 account, or an account that never carried
a balance, never triggers. Once per account.

### B. Net-worth milestone crossed — `networth:<amount>`
Household net worth (on-balance-sheet assets − liabilities, transfers excluded — the
existing `accountsModel.householdTotals`) crosses a round number.

Ladder: **25,000 · 50,000 · 100,000 · 250,000 · 500,000 · 750,000 · 1,000,000, then
every 500,000.** Achieved = every ladder value ≤ current net worth. (Pre-existing
crossings are baselined; see Baselining.)

### C. Best savings month ever — `bestmonth:<YYYY-MM>`
Over **completed** months only (the current partial month is excluded, using injected
`now`), savings = income − spending per month (`reportsModel.cashFlowByMonth`, `net`).
Achieved = the single completed month whose savings **strictly beats every prior month**,
provided there are **≥ 3 completed months** of history and the record is **> 0**.

When a new month sets a new record, its key becomes the achieved key and fires; the old
record's key stays in `seen`. Ties (equal to the record) do not fire.

### D. Savings streak — `streak:<n>`
Consecutive **completed, net-positive** months (income > spending). A month with no
activity is net-zero and breaks the streak. Thresholds: **3, 6, 12, then every 12**
(24, 36, …). Achieved = every threshold ≤ current ongoing streak length.

Keyed by threshold, **once ever**: a streak that breaks and rebuilds to 3 will not
re-celebrate 3, but new higher thresholds keep arriving. (Deliberate: trades long-term
repetition for zero nagging.)

## Architecture

Mirrors the established pattern: pure math module + hook + thin presentational component
(like `spendingMath`/`backgroundMath` + `BackgroundLayer`).

### `celebrationMath.js` — pure, no React, no storage
- The four detectors (each individually exported and unit-tested).
- `detectAchieved({ accounts, transactions, typesById, categoriesById, now }) → [{ key, type, title, detail }]`
  — the union of all achieved milestones, each carrying display text:
  - `{ key:"paidoff:ab12", type:"paidoff", title:"Visa paid off!", detail:"You cleared it 🎉" }`
  - `{ key:"networth:100000", type:"networth", title:"$100k net worth!", detail:"A new milestone" }`
  - `{ key:"bestmonth:2026-05", type:"bestmonth", title:"Best savings month ever!", detail:"You saved $3,150 in May 2026" }`
  - `{ key:"streak:6", type:"streak", title:"6-month savings streak!", detail:"Keep it going" }`
- `diffCelebrations(achieved, state) → { toCelebrate, nextState }` — the per-type
  baseline + dedup logic (pure, so the trickiest part is testable without a DOM).

### `useCelebrations.js` — hook (persistence + queue + wiring)
- Persists to its **own** key `tallio-celebrations` (strict separation from financial data):
  ```js
  {
    seen: { "<key>": <timestamp> },
    baselinedTypes: ["paidoff", "networth", "bestmonth", "streak"],
    settings: { style: "festive" }   // "festive" | "quiet" | "off"
  }
  ```
- Runs `detectAchieved` in a **debounced effect** (~400ms) over `accounts`/`transactions`,
  so a balance transiently crossing zero mid-edit does not fire.
- Feeds the result through `diffCelebrations`, enqueues `toCelebrate`, persists `nextState`.
- Exposes: the current celebration queue (head + dismiss), `style`, `setStyle`.

### Baselining — the no-false-positive guarantee (in `diffCelebrations`)
- **Per-type baselining.** For any milestone `type` **not yet in `baselinedTypes`**, its
  currently-achieved keys are silently absorbed into `seen` (no celebration) and the type
  is marked baselined.
- This covers **both** the first-ever load (everything already true is baselined → no
  parade on install) **and** any milestone type shipped in a future version (it will not
  retro-fire on existing data).
- For already-baselined types: `toCelebrate = achieved − seen`. Each key fires **exactly
  once, ever**.
- Intended consequence: a milestone reached while the app was **closed** *does* fire on
  next open — only the first encounter of a type is silent.

### `CelebrationLayer.jsx` — thin, presentational
Sibling to `<BackgroundLayer>` in `App.jsx`, driven by the hook's queue. Shows **one at a
time**; the next appears after the current dismisses/expires.

Resolves an effective style:
```
style === 'off'                        → render nothing
style === 'festive' && !reducedMotion  → confetti + toast
otherwise (quiet, or reduced-motion)   → toast/banner only, no animation
```
- **Festive:** CSS-based confetti (DOM `<span>`s + keyframes — **no `<canvas>`**, so it
  works in jsdom and degrades cleanly) raining above all content with
  `pointer-events:none`, plus a small toast naming the win. Confetti colors pulled from
  active theme tokens to match Appearance.
- **Quiet / reduced-motion:** just the toast/banner — static, dismissible, no motion.
- **Toast:** auto-dismisses (~6s) or on ×; `role="status"` / `aria-live="polite"`; never
  covers or disables anything.

### Settings surface
A single three-way "Celebrations" control in the existing **SettingsPanel**:
**Festive · Quiet · Off** (default **Festive**), read/written through `useCelebrations`.
Reduced-motion is auto-detected on top — no separate toggle.

## Data flow

```
useLedger (accounts, transactions) ──┐
useAccountTypes (typesById) ─────────┤
useCategories (categoriesById) ──────┤
                                     ▼
              useCelebrations (debounced effect)
              detectAchieved(...) → diffCelebrations(achieved, state)
                                     │
                 persist nextState (tallio-celebrations)
                                     │
                          enqueue toCelebrate
                                     ▼
              CelebrationLayer (queue head → confetti/toast/banner)
```

Financial state is **read-only** to the celebration path; nothing in the ledger/report
data is ever mutated to drive a celebration.

## Edge cases
- Account deleted after being celebrated → stale `seen` key is harmless.
- Liability run back up after pay-off → leaves achieved set, stays in `seen` → no re-fire.
- New record month ties the old record → not "strictly beats" → no fire.
- Net worth dips then re-crosses a threshold → key already in `seen` → no re-fire.
- Empty ledger / fewer than 3 completed months → detectors return `[]`.
- Mid-edit transient states → debounce absorbs them.
- Corrupt/missing `tallio-celebrations` → safe defaults (empty `seen`, empty
  `baselinedTypes` so the first run baselines, `style:"festive"`).
- localStorage quota errors swallowed (in-memory state still updates), like the other hooks.

## Testing
Repo conventions: Vitest + `@testing-library/react`, jsdom; component tests import
`{ cleanup }` + `afterEach(() => cleanup())`; **no jest-dom** (use `.toBeTruthy()`,
`getAttribute`, `container.querySelector`). jsdom has no canvas — confetti is CSS/DOM only.

- **`celebrationMath.test.js`** — each detector across achieved / not-achieved / guard
  cases; `diffCelebrations` baseline-on-first-encounter, once-ever, per-type. Pure.
- **`useCelebrations.test.jsx`** — fake `localStorage` + injected ledger snapshots:
  first load baselines silently; a subsequent qualifying change fires exactly once; style
  persists; corrupt storage recovers.
- **`CelebrationLayer.test.jsx`** — festive / quiet / off / reduced-motion variants;
  toast dismiss; `pointer-events:none` on confetti; `aria-live` present.
- **Manual-verify (`npm run dev`, port 5174 `--strictPort`):** confetti feel, theme-tint,
  auto-dismiss timing, reduced-motion degradation, SettingsPanel toggle. Checkpoint with
  the user.

## Out of scope (deferred)
- **Savings-goal reached** (milestone F) — needs a goal model + UI; good future feature.
- **Month reconciled** (milestone G) — needs a reconcile feature first; possible future.
- **Sound** — belongs to sub-project #4 (Playful extras); the layer is structured so a
  sound hook can drop in later. v1 is visual-only.
- **Every net-positive month** (option E) — too noisy for a household that saves monthly.

## Branch & workflow
Branch `celebrations-milestones` off `master` (PR #12 merged). Inline TDD per the user's
workflow: failing test → implement → green → lint → commit per task; push as we go;
checkpoint at manual-verify points. Group the pure foundational tasks
(`celebrationMath` + `diffCelebrations`) first.
