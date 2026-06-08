# Playful Extras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three subtle, opt-out, reduced-motion-aware "delight" modules — micro-interactions, seasonal touches, and easter eggs — that make Tallio feel personal without ever interfering with data entry, readability, or accuracy.

**Architecture:** Pure helpers + small hooks + thin presentational layers, mirroring the existing `spendingMath`/`backgroundMath` + `BackgroundLayer`/`CelebrationLayer` patterns. Reduced motion is the master calm switch; one Seasonal toggle in `useSettings`; egg reveals reuse #3's `CelebrationLayer`. New CSS lives in its own files so the uncommitted `App.css` WIP stays untouched.

**Tech Stack:** React (hooks), Vite, Vitest + @testing-library/react (jsdom), CSS animations (no canvas).

**Conventions (must follow):**
- Component tests: `import { render, cleanup } from '@testing-library/react'` + `afterEach(() => cleanup())`. **No jest-dom** — use `.toBeTruthy()`, `.toBeNull()`/`.not.toBeNull()`, `getAttribute`, `container.querySelector`, `.style.*`.
- Hook tests: `renderHook`, `act` from `@testing-library/react`; `beforeEach(() => localStorage.clear())` where storage is touched.
- jsdom has **no `window.matchMedia`** by default. The `shouldAnimate()` helper (Task 1) treats "no matchMedia" as **do not animate**, so component tests are deterministic (immediate values) with no mocking. Tests that need the animating branch mock `window.matchMedia`.
- Run one file: `npx vitest run src/<File>.test.<ext>`. Full: `npx vitest run`. Lint: `npx eslint <files>` (zero NEW errors). Build: `npm run build`.
- react-hooks v6 `react-hooks/refs`: never mirror state into a ref during render; only write refs in effects/handlers; `useRef(initialValue)` is fine.
- **Never `git add -A`** — stage only named files (`src/App.css` has an unrelated uncommitted WIP that must stay untouched).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch: `playful-extras` (already created off master, spec committed). Push after each task.

**File structure:**
- `src/microMotion.js` (+ `.test.js`) — pure `easeOutCubic`, `interpolate`, `shouldAnimate`.
- `src/useCountUp.js` (+ `.test.jsx`), `src/useValueFlash.js` (+ `.test.jsx`).
- `src/microMotion.css` — hover/press/expand/entrance CSS (imported by `App.jsx`).
- `src/seasonalMath.js` (+ `.test.js`) — `seasonForDate`, `holidayForDate`.
- `src/SeasonalLayer.jsx` + `src/SeasonalLayer.css` (+ `.test.jsx`).
- `src/konami.js` (+ `.test.js`), `src/consoleArt.js` (+ `.test.js`), `src/useEasterEggs.js` (+ `.test.jsx`).
- Modify `src/SummaryScorecard.jsx`, `src/AccountList.jsx`, `src/useSettings.js`, `src/SettingsPanel.jsx`, `src/App.jsx`.

---

# Module 1 — Micro-interactions

## Task 1: `microMotion.js` — easing, interpolation, animate gate

**Files:** Create `src/microMotion.js`, `src/microMotion.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, afterEach, vi } from 'vitest';
import { easeOutCubic, interpolate, shouldAnimate } from './microMotion.js';

describe('easeOutCubic', () => {
  it('maps 0->0 and 1->1 and eases out', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5); // ease-out is past halfway at t=0.5
  });
});

describe('interpolate', () => {
  it('blends from->to by progress', () => {
    expect(interpolate(0, 100, 0)).toBe(0);
    expect(interpolate(0, 100, 1)).toBe(100);
    expect(interpolate(100, 200, 0.5)).toBe(150);
  });
});

describe('shouldAnimate', () => {
  afterEach(() => { delete window.matchMedia; });
  it('is false when matchMedia is unavailable (e.g. jsdom)', () => {
    expect(shouldAnimate()).toBe(false);
  });
  it('is true when motion is allowed', () => {
    window.matchMedia = () => ({ matches: false });
    expect(shouldAnimate()).toBe(true);
  });
  it('is false when reduced motion is preferred', () => {
    window.matchMedia = () => ({ matches: true });
    expect(shouldAnimate()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/microMotion.test.js`
Expected: FAIL — "Failed to resolve import './microMotion.js'".

- [ ] **Step 3: Write minimal implementation**

```js
// src/microMotion.js
// Pure helpers for tasteful motion. shouldAnimate() is the single gate: it is
// false unless the browser exposes matchMedia AND the user hasn't asked for
// reduced motion — so jsdom (no matchMedia) is non-animating and deterministic.
export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function interpolate(from, to, p) {
  return from + (to - from) * p;
}

export function shouldAnimate() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/microMotion.test.js`
Expected: PASS.

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/microMotion.js src/microMotion.test.js
git add src/microMotion.js src/microMotion.test.js
git commit -m "feat(playful): microMotion pure helpers (easing, interpolate, animate gate)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 2: `useCountUp` hook

**Files:** Create `src/useCountUp.js`, `src/useCountUp.test.jsx`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import useCountUp from './useCountUp.js';

describe('useCountUp', () => {
  afterEach(() => { delete window.matchMedia; });

  it('returns the exact target immediately when not animating (jsdom: no matchMedia)', () => {
    const { result } = renderHook(() => useCountUp(1280));
    expect(result.current).toBe(1280);
  });

  it('returns the target immediately when disabled', () => {
    window.matchMedia = () => ({ matches: false }); // motion allowed...
    const { result } = renderHook(() => useCountUp(500, { enabled: false })); // ...but disabled
    expect(result.current).toBe(500);
  });

  it('snaps to a new target on change (no re-animation)', () => {
    const { result, rerender } = renderHook(({ t }) => useCountUp(t), { initialProps: { t: 100 } });
    expect(result.current).toBe(100);
    rerender({ t: 250 });
    expect(result.current).toBe(250);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useCountUp.test.jsx`
Expected: FAIL — cannot resolve `./useCountUp.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/useCountUp.js
// Animates a number from 0 -> target on first view only; later target changes
// snap (no re-animation while editing). Always settles on the exact target.
// Non-animating environments (reduced motion, no matchMedia, disabled) return
// the target immediately.
import { useState, useRef, useEffect } from 'react';
import { easeOutCubic, interpolate, shouldAnimate } from './microMotion.js';

export default function useCountUp(target, { durationMs = 900, enabled = true } = {}) {
  const animate = enabled && shouldAnimate();
  const [value, setValue] = useState(animate ? 0 : target);
  const didInit = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    if (didInit.current) { setValue(target); return undefined; } // subsequent change -> snap
    didInit.current = true;
    if (!animate) { setValue(target); return undefined; }
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / durationMs, 1);
      setValue(interpolate(0, target, easeOutCubic(p)));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else setValue(target);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, animate, durationMs]);

  return value;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useCountUp.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/useCountUp.js src/useCountUp.test.jsx
git add src/useCountUp.js src/useCountUp.test.jsx
git commit -m "feat(playful): useCountUp (first-view animation, snaps on change, exact target)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 3: `useValueFlash` hook

**Files:** Create `src/useValueFlash.js`, `src/useValueFlash.test.jsx`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useValueFlash from './useValueFlash.js';

describe('useValueFlash', () => {
  beforeEach(() => { vi.useFakeTimers(); window.matchMedia = () => ({ matches: false }); });
  afterEach(() => { vi.useRealTimers(); delete window.matchMedia; });

  it('does not flash on mount', () => {
    const { result } = renderHook(() => useValueFlash(100));
    expect(result.current).toBe(false);
  });

  it('flashes on change then clears after the duration', () => {
    const { result, rerender } = renderHook(({ v }) => useValueFlash(v, { durationMs: 1000 }), { initialProps: { v: 100 } });
    rerender({ v: 200 });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(false);
  });

  it('never flashes under reduced motion', () => {
    window.matchMedia = () => ({ matches: true });
    const { result, rerender } = renderHook(({ v }) => useValueFlash(v), { initialProps: { v: 1 } });
    rerender({ v: 2 });
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useValueFlash.test.jsx`
Expected: FAIL — cannot resolve `./useValueFlash.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/useValueFlash.js
// Returns true briefly when `value` changes, so a number can highlight what moved.
// Silent on mount and under reduced motion.
import { useState, useRef, useEffect } from 'react';
import { shouldAnimate } from './microMotion.js';

export default function useValueFlash(value, { durationMs = 1000 } = {}) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current === value) return undefined;
    prev.current = value;
    if (!shouldAnimate()) return undefined;
    setFlash(true);
    const h = setTimeout(() => setFlash(false), durationMs);
    return () => clearTimeout(h);
  }, [value, durationMs]);

  return flash;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useValueFlash.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/useValueFlash.js src/useValueFlash.test.jsx
git add src/useValueFlash.js src/useValueFlash.test.jsx
git commit -m "feat(playful): useValueFlash (brief highlight on change, reduced-motion silent)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 4: Wire count-up + flash into SummaryScorecard & AccountList

**Files:** Modify `src/SummaryScorecard.jsx`, `src/AccountList.jsx`

In jsdom (no matchMedia) the hooks return exact targets immediately, so existing
`SummaryScorecard.test.jsx` / `AccountList.test.jsx` stay green unchanged.

- [ ] **Step 1: Update SummaryScorecard to count up its three headline numbers**

Replace the body of `src/SummaryScorecard.jsx` with:

```jsx
// src/SummaryScorecard.jsx
import React from 'react';
import useCountUp from './useCountUp.js';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const pct = (r) => `${Math.round((r || 0) * 100)}%`;

export default function SummaryScorecard({ summary }) {
  const { income = 0, spending = 0, savings = 0, savingsRate = 0, earmarked = 0 } = summary || {};
  const incomeV = useCountUp(income);
  const spendingV = useCountUp(spending);
  const savingsV = useCountUp(savings);
  return (
    <div className="scorecard">
      <div className="scorecard-row">
        <div className="scorecard-item">
          <span className="scorecard-label">Income</span>
          <span className="scorecard-value scorecard-pos">{money(incomeV)}</span>
        </div>
        <div className="scorecard-item">
          <span className="scorecard-label">Spending</span>
          <span className="scorecard-value scorecard-neg">{money(spendingV)}</span>
        </div>
        <div className="scorecard-item scorecard-item-hero">
          <span className="scorecard-label">Savings</span>
          <span className={`scorecard-value ${savings >= 0 ? 'scorecard-pos' : 'scorecard-neg'}`}>{money(savingsV)}</span>
          <span className="scorecard-rate">Savings rate {pct(savingsRate)}</span>
        </div>
      </div>
      {earmarked > 0 && (
        <p className="scorecard-sub">of which earmarked to savings categories: {money(earmarked)}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update AccountList net worth to count up + flash on change**

In `src/AccountList.jsx`, add imports after line 4 (`import Icon ...`):

```jsx
import useCountUp from './useCountUp.js';
import useValueFlash from './useValueFlash.js';
```

Inside the component, after the `totals` useMemo (line 11), add:

```jsx
  const netWorthV = useCountUp(totals.netWorth);
  const netWorthFlash = useValueFlash(totals.netWorth);
```

Replace the net-worth `<strong>` (line 27):

```jsx
          <strong className={totals.netWorth >= 0 ? 'pos' : 'neg'}>{fmt(totals.netWorth)}</strong>
```

with:

```jsx
          <strong className={`${totals.netWorth >= 0 ? 'pos' : 'neg'}${netWorthFlash ? ' value-flash' : ''}`}>{fmt(netWorthV)}</strong>
```

- [ ] **Step 3: Run the affected + full suite**

Run: `npx vitest run src/SummaryScorecard.test.jsx src/AccountList.test.jsx`
Expected: PASS (values render immediately in jsdom).

Run: `npx vitest run`
Expected: PASS (whole suite).

- [ ] **Step 4: Lint & commit**

```bash
npx eslint src/SummaryScorecard.jsx src/AccountList.jsx
git add src/SummaryScorecard.jsx src/AccountList.jsx
git commit -m "feat(playful): count-up scorecard + net worth, flash net worth on change

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 5: `microMotion.css` — hover/press, snappy expand, entrance, value-flash

**Files:** Create `src/microMotion.css`; modify `src/App.jsx` (one import line). CSS only — manual-verify.

- [ ] **Step 1: Create `src/microMotion.css`**

```css
/* Micro-interactions. All disabled under reduced motion. */

/* B. Hover & press feedback */
.btn, .btn-icon, .btn-primary {
  transition: transform .12s ease, box-shadow .12s ease, background-color .12s ease;
}
.btn:hover, .btn-icon:hover, .btn-primary:hover { transform: translateY(-1px); }
.btn:active, .btn-icon:active, .btn-primary:active { transform: translateY(0) scale(.97); }
.account-row { transition: transform .12s ease, background-color .12s ease; }
.account-row:hover { transform: translateX(2px); }
.account-row:active { transform: scale(.99); }

/* C. Snappy expand (per-sub report bars mount) + gentle app entrance */
.cat-sub-list { animation: micro-expand 160ms ease-out both; }
@keyframes micro-expand {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.container { animation: micro-fade-in 240ms ease-out both; }
@keyframes micro-fade-in { from { opacity: 0; } to { opacity: 1; } }

/* D. Value-change highlight */
.value-flash { animation: micro-flash 1s ease-out; border-radius: 6px; }
@keyframes micro-flash {
  0% { background: rgba(61, 220, 151, .35); }
  100% { background: transparent; }
}

@media (prefers-reduced-motion: reduce) {
  .btn, .btn-icon, .btn-primary, .account-row { transition: none; }
  .btn:hover, .btn-icon:hover, .btn-primary:hover,
  .account-row:hover, .btn:active, .btn-icon:active, .btn-primary:active, .account-row:active { transform: none; }
  .cat-sub-list, .container, .value-flash { animation: none; }
}
```

- [ ] **Step 2: Import it in `src/App.jsx`**

After the existing `import './App.css';` line, add:

```jsx
import './microMotion.css';
```

- [ ] **Step 3: Verify build + full suite + lint**

Run: `npx vitest run`
Expected: PASS (no behavior change in tests).

Run: `npm run build`
Expected: build succeeds.

Run: `npx eslint src/App.jsx`
Expected: zero NEW errors (pre-existing camera-stream warning excepted).

- [ ] **Step 4: Commit**

```bash
git add src/microMotion.css src/App.jsx
git commit -m "feat(playful): micro-interaction CSS (hover/press, snappy expand, entrance, flash)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

- [ ] **Step 5: MODULE 1 CHECKPOINT — manual verify** (`npm run dev -- --port 5174 --strictPort`)

Confirm with the user: scorecard + net worth count up on first view (exact final values); buttons/rows lift on hover and depress on click; per-sub report bars ease open (~160ms); net worth briefly highlights after adding a transaction; OS reduce-motion removes all of it. Pause for sign-off.

---

# Module 2 — Seasonal touches

## Task 6: `seasonalMath.js` — season + holiday by date

**Files:** Create `src/seasonalMath.js`, `src/seasonalMath.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { seasonForDate, holidayForDate } from './seasonalMath.js';

const d = (s) => new Date(s + 'T12:00:00');

describe('seasonForDate', () => {
  it('maps months to N-hemisphere seasons', () => {
    expect(seasonForDate(d('2026-01-15'))).toBe('winter');
    expect(seasonForDate(d('2026-02-15'))).toBe('winter');
    expect(seasonForDate(d('2026-04-15'))).toBe('spring');
    expect(seasonForDate(d('2026-07-15'))).toBe('summer');
    expect(seasonForDate(d('2026-10-15'))).toBe('autumn');
    expect(seasonForDate(d('2026-12-15'))).toBe('winter');
  });
});

describe('holidayForDate', () => {
  it('flags fixed-date holidays, else null', () => {
    expect(holidayForDate(d('2026-01-01'))).toBe('newyear');
    expect(holidayForDate(d('2026-12-31'))).toBe('newyear');
    expect(holidayForDate(d('2026-10-31'))).toBe('halloween');
    expect(holidayForDate(d('2026-07-04'))).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/seasonalMath.test.js`
Expected: FAIL — cannot resolve `./seasonalMath.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/seasonalMath.js
// Pure date -> season / holiday mapping (Northern hemisphere).
export function seasonForDate(date) {
  const m = (date instanceof Date ? date.getMonth() : new Date().getMonth()); // 0-11
  if (m === 11 || m === 0 || m === 1) return 'winter';
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  return 'autumn';
}

export function holidayForDate(date) {
  const m = date.getMonth() + 1;
  const day = date.getDate();
  if ((m === 12 && day === 31) || (m === 1 && day === 1)) return 'newyear';
  if (m === 10 && day === 31) return 'halloween';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/seasonalMath.test.js`
Expected: PASS.

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/seasonalMath.js src/seasonalMath.test.js
git add src/seasonalMath.js src/seasonalMath.test.js
git commit -m "feat(playful): seasonalMath (season + fixed-date holiday by date)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 7: `SeasonalLayer` component + styles

**Files:** Create `src/SeasonalLayer.jsx`, `src/SeasonalLayer.css`, `src/SeasonalLayer.test.jsx`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import SeasonalLayer from './SeasonalLayer.jsx';

const d = (s) => new Date(s + 'T12:00:00');
afterEach(() => cleanup());

describe('SeasonalLayer', () => {
  it('renders winter snow particles in January', () => {
    const { container } = render(<SeasonalLayer now={d('2026-01-15')} enabled={true} reducedMotion={false} />);
    const layer = container.querySelector('.seasonal-layer');
    expect(layer).not.toBeNull();
    expect(layer.className).toContain('seasonal-winter');
    expect(container.querySelectorAll('.seasonal-particle').length).toBeGreaterThan(0);
    expect(layer.style.pointerEvents).toBe('none');
  });

  it('renders the summer sunny-drift variant in July', () => {
    const { container } = render(<SeasonalLayer now={d('2026-07-15')} enabled={true} reducedMotion={false} />);
    expect(container.querySelector('.seasonal-layer').className).toContain('seasonal-summer');
  });

  it('renders a holiday accent over the base season (Halloween)', () => {
    const { container } = render(<SeasonalLayer now={d('2026-10-31')} enabled={true} reducedMotion={false} />);
    expect(container.querySelector('.seasonal-layer').className).toContain('seasonal-halloween');
  });

  it('renders nothing when disabled', () => {
    const { container } = render(<SeasonalLayer now={d('2026-01-15')} enabled={false} reducedMotion={false} />);
    expect(container.querySelector('.seasonal-layer')).toBeNull();
  });

  it('renders nothing under reduced motion', () => {
    const { container } = render(<SeasonalLayer now={d('2026-01-15')} enabled={true} reducedMotion={true} />);
    expect(container.querySelector('.seasonal-layer')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/SeasonalLayer.test.jsx`
Expected: FAIL — cannot resolve `./SeasonalLayer.jsx`.

- [ ] **Step 3: Write minimal implementation**

Create `src/SeasonalLayer.jsx`:

```jsx
// src/SeasonalLayer.jsx
// Subtle, off-able, reduced-motion-safe ambient seasonal effect. Full-viewport
// front overlay with pointer-events:none so it never blocks or obscures use.
import React from 'react';
import { seasonForDate, holidayForDate } from './seasonalMath.js';
import './SeasonalLayer.css';

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Glyph set + particle count per effect.
const EFFECTS = {
  winter:    { glyphs: ['❄', '❅', '❆'], count: 14 },
  spring:    { glyphs: ['🌸', '🌷', '🌼'], count: 12 },
  summer:    { glyphs: ['☀️', '🐚', '🌴', '🕶️'], count: 8 },
  autumn:    { glyphs: ['🍂', '🍁'], count: 14 },
  newyear:   { glyphs: ['✨', '🎉', '⭐'], count: 14 },
  halloween: { glyphs: ['🎃', '👻', '🦇'], count: 12 },
};

export default function SeasonalLayer({ now = new Date(), enabled = true, reducedMotion }) {
  const rm = reducedMotion ?? prefersReducedMotion();
  if (!enabled || rm) return null;

  const holiday = holidayForDate(now);
  const kind = holiday || seasonForDate(now);
  const effect = EFFECTS[kind];
  if (!effect) return null;

  const pieces = Array.from({ length: effect.count }).map((_, i) => ({
    glyph: effect.glyphs[i % effect.glyphs.length],
    left: (i * 100) / effect.count,
    delay: (i % 6) * 0.7,
    dur: 7 + (i % 5),
  }));

  return (
    <div className={`seasonal-layer seasonal-${kind}`} style={{ pointerEvents: 'none' }} aria-hidden="true">
      {kind === 'summer' && <div className="seasonal-sunglow" />}
      {pieces.map((p, i) => (
        <span
          key={i}
          className="seasonal-particle"
          style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}
        >
          {p.glyph}
        </span>
      ))}
    </div>
  );
}
```

Create `src/SeasonalLayer.css`:

```css
/* Subtle seasonal overlay: above content, never interactive, low opacity. */
.seasonal-layer { position: fixed; inset: 0; z-index: 900; pointer-events: none; overflow: hidden; }
.seasonal-particle {
  position: absolute; top: -24px; font-size: 16px; opacity: .55;
  animation-name: seasonal-fall; animation-timing-function: linear; animation-iteration-count: infinite;
  will-change: transform;
}
@keyframes seasonal-fall {
  0%   { transform: translateY(-24px) translateX(0) rotate(0deg); }
  100% { transform: translateY(105vh) translateX(24px) rotate(120deg); }
}

/* Summer "sunny drift": warm glow + breezy sideways float instead of falling. */
.seasonal-summer .seasonal-particle {
  top: auto; animation-name: seasonal-drift;
}
@keyframes seasonal-drift {
  0%   { transform: translateX(-6vw) translateY(0); }
  100% { transform: translateX(106vw) translateY(-12px); }
}
.seasonal-summer .seasonal-particle:nth-child(odd) { top: 30%; }
.seasonal-summer .seasonal-particle:nth-child(even) { top: 60%; }
.seasonal-sunglow {
  position: absolute; right: -60px; top: -60px; width: 240px; height: 240px; border-radius: 50%;
  background: radial-gradient(circle, rgba(255,201,107,.35), rgba(255,157,47,0) 70%); filter: blur(6px);
}

@media (prefers-reduced-motion: reduce) { .seasonal-layer { display: none; } }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/SeasonalLayer.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/SeasonalLayer.jsx src/SeasonalLayer.test.jsx
git add src/SeasonalLayer.jsx src/SeasonalLayer.css src/SeasonalLayer.test.jsx
git commit -m "feat(playful): SeasonalLayer (snow/petals/sunny-drift/leaves + holiday accents)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 8: Persist the Seasonal toggle in `useSettings`

**Files:** Modify `src/useSettings.js`, `src/useSettings.test.jsx`

- [ ] **Step 1: Write the failing test**

Append to `src/useSettings.test.jsx` (inside its top-level `describe`, or as a new `describe`):

```js
import { describe as describe2, it as it2, expect as expect2, beforeEach as beforeEach2 } from 'vitest';
import { renderHook as renderHook2, act as act2 } from '@testing-library/react';
import useSettings2 from './useSettings.js';

describe2('useSettings seasonalEffects', () => {
  beforeEach2(() => localStorage.clear());
  it2('defaults seasonalEffects to true', () => {
    const { result } = renderHook2(() => useSettings2());
    expect2(result.current.seasonalEffects).toBe(true);
  });
  it2('persists a seasonalEffects change', () => {
    const h1 = renderHook2(() => useSettings2());
    act2(() => h1.result.current.save({ seasonalEffects: false }));
    const h2 = renderHook2(() => useSettings2());
    expect2(h2.result.current.seasonalEffects).toBe(false);
  });
});
```

(If `useSettings.test.jsx` already imports `describe/it/expect/beforeEach/renderHook/act`, reuse those names instead of the aliased imports — the aliases just avoid duplicate-identifier errors when appending.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useSettings.test.jsx`
Expected: FAIL — `seasonalEffects` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/useSettings.js`, add the storage key after `UI_SCALE_STORAGE`:

```js
const SEASONAL_STORAGE = 'tallio-seasonal-effects';
```

In `loadInitial()`, add `seasonalEffects` to both the success and fallback returns:

```js
function loadInitial() {
  if (typeof window === 'undefined') return { apiKey: '', model: DEFAULT_MODEL, uiScale: DEFAULT_UI_SCALE, seasonalEffects: true };
  try {
    return {
      apiKey: window.localStorage.getItem(KEY_STORAGE) || '',
      model: window.localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL,
      uiScale: clampUiScale(parseFloat(window.localStorage.getItem(UI_SCALE_STORAGE))),
      seasonalEffects: window.localStorage.getItem(SEASONAL_STORAGE) !== 'false',
    };
  } catch {
    return { apiKey: '', model: DEFAULT_MODEL, uiScale: DEFAULT_UI_SCALE, seasonalEffects: true };
  }
}
```

In `save`, handle `seasonalEffects`:

```js
  const save = useCallback(({ apiKey, model, uiScale, seasonalEffects } = {}) => {
    setState((prev) => {
      const next = {
        apiKey: apiKey !== undefined ? apiKey.trim() : prev.apiKey,
        model: model !== undefined ? (model || DEFAULT_MODEL) : prev.model,
        uiScale: uiScale !== undefined ? clampUiScale(uiScale) : prev.uiScale,
        seasonalEffects: seasonalEffects !== undefined ? !!seasonalEffects : prev.seasonalEffects,
      };
      try {
        if (apiKey !== undefined) window.localStorage.setItem(KEY_STORAGE, next.apiKey);
        if (model !== undefined) window.localStorage.setItem(MODEL_STORAGE, next.model);
        if (uiScale !== undefined) window.localStorage.setItem(UI_SCALE_STORAGE, String(next.uiScale));
        if (seasonalEffects !== undefined) window.localStorage.setItem(SEASONAL_STORAGE, String(next.seasonalEffects));
      } catch {
        // ignore quota / privacy-mode errors; in-memory state still updates
      }
      return next;
    });
  }, []);
```

Add `seasonalEffects` to the returned object:

```js
  return {
    apiKey: state.apiKey,
    model: state.model,
    uiScale: state.uiScale,
    seasonalEffects: state.seasonalEffects,
    hasKey: state.apiKey.startsWith('sk-ant-'),
    save,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useSettings.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/useSettings.js src/useSettings.test.jsx
git add src/useSettings.js src/useSettings.test.jsx
git commit -m "feat(playful): persist seasonalEffects toggle in useSettings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 9: Mount SeasonalLayer + Settings toggle (manual-verify)

**Files:** Modify `src/App.jsx`, `src/SettingsPanel.jsx`

- [ ] **Step 1: Import + mount SeasonalLayer in `src/App.jsx`**

Add after the `import CelebrationLayer ...` line:

```jsx
import SeasonalLayer from './SeasonalLayer.jsx';
```

After the existing `<CelebrationLayer ... />` (milestone celebrations) element, add:

```jsx
      <SeasonalLayer enabled={settings.seasonalEffects} />
```

- [ ] **Step 2: Add the Seasonal toggle to `src/SettingsPanel.jsx`**

Immediately after the "Display size" `.settings-stepper` block's closing `</div>` (before the `<p className="settings-privacy">`), insert:

```jsx
          <label className="settings-label" htmlFor="settings-seasonal">Seasonal effects</label>
          <label className="settings-toggle">
            <input
              id="settings-seasonal"
              type="checkbox"
              checked={settings.seasonalEffects}
              onChange={(e) => settings.save({ seasonalEffects: e.target.checked })}
            />
            <span>Gentle seasonal touches (snow, leaves, petals, summer drift) — off under reduced motion</span>
          </label>
```

- [ ] **Step 3: Verify suite + lint + build**

Run: `npx vitest run`
Expected: PASS (existing `SettingsPanel.test.jsx` still green).

Run: `npx eslint src/App.jsx src/SettingsPanel.jsx`
Expected: zero NEW errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/SettingsPanel.jsx
git commit -m "feat(playful): mount SeasonalLayer + Settings seasonal toggle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

- [ ] **Step 5: MODULE 2 CHECKPOINT — manual verify** (`npm run dev -- --port 5174 --strictPort`)

Confirm: current-season particles drift subtly behind interaction (never block clicks); Settings toggle turns them off/on and persists; reduced motion hides them; (optionally set the clock to test other seasons / Oct 31 / New Year). Tune summer density/feel. Pause for sign-off.

---

# Module 3 — Easter eggs

## Task 10: `konami.js` — sequence matcher

**Files:** Create `src/konami.js`, `src/konami.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { KONAMI_SEQUENCE, endsWithSequence } from './konami.js';

describe('endsWithSequence', () => {
  it('matches when the buffer ends with the full sequence', () => {
    expect(endsWithSequence(KONAMI_SEQUENCE, KONAMI_SEQUENCE)).toBe(true);
    expect(endsWithSequence(['x', 'y', ...KONAMI_SEQUENCE], KONAMI_SEQUENCE)).toBe(true);
  });
  it('does not match a partial or wrong tail', () => {
    expect(endsWithSequence(KONAMI_SEQUENCE.slice(0, -1), KONAMI_SEQUENCE)).toBe(false);
    expect(endsWithSequence(['a', 'b'], KONAMI_SEQUENCE)).toBe(false);
  });
  it('has the classic 10-key sequence', () => {
    expect(KONAMI_SEQUENCE).toEqual(['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/konami.test.js`
Expected: FAIL — cannot resolve `./konami.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/konami.js
export const KONAMI_SEQUENCE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a',
];

// True when the tail of `buffer` equals `seq` (case already normalized by caller).
export function endsWithSequence(buffer, seq) {
  if (buffer.length < seq.length) return false;
  const tail = buffer.slice(buffer.length - seq.length);
  return seq.every((k, i) => tail[i] === k);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/konami.test.js`
Expected: PASS.

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/konami.js src/konami.test.js
git add src/konami.js src/konami.test.js
git commit -m "feat(playful): konami sequence matcher (pure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 11: `consoleArt.js`

**Files:** Create `src/consoleArt.js`, `src/consoleArt.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from 'vitest';
import { consoleArt, printConsoleArt } from './consoleArt.js';

describe('consoleArt', () => {
  it('returns a banner string and a css style string', () => {
    const { text, style } = consoleArt();
    expect(typeof text).toBe('string');
    expect(text).toContain('Tallio');
    expect(text).toContain('%c');
    expect(typeof style).toBe('string');
    expect(style.length).toBeGreaterThan(0);
  });
  it('printConsoleArt logs once', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printConsoleArt();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/consoleArt.test.js`
Expected: FAIL — cannot resolve `./consoleArt.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/consoleArt.js
// A little wink for anyone who opens DevTools.
export function consoleArt() {
  return {
    text: '%c✦ Tallio — made with love. Curious? Try ↑↑↓↓←→←→ B A ✦',
    style: 'color:#5b8def;font-weight:700;font-size:13px;padding:4px 0;',
  };
}

export function printConsoleArt() {
  const { text, style } = consoleArt();
  console.log(text, style);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/consoleArt.test.js`
Expected: PASS.

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/consoleArt.js src/consoleArt.test.js
git add src/consoleArt.js src/consoleArt.test.js
git commit -m "feat(playful): hidden console art

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 12: `useEasterEggs` hook

**Files:** Create `src/useEasterEggs.js`, `src/useEasterEggs.test.jsx`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, fireEvent } from '@testing-library/react';
import useEasterEggs from './useEasterEggs.js';
import { KONAMI_SEQUENCE } from './konami.js';

const press = (key, target = window) => fireEvent.keyDown(target, { key });

describe('useEasterEggs', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reveals on the full Konami sequence', () => {
    const { result } = renderHook(() => useEasterEggs());
    act(() => { KONAMI_SEQUENCE.forEach((k) => press(k)); });
    expect(result.current.reveal).toBeTruthy();
    act(() => result.current.dismiss());
    expect(result.current.reveal).toBeNull();
  });

  it('a wrong key resets progress (no reveal)', () => {
    const { result } = renderHook(() => useEasterEggs());
    act(() => { KONAMI_SEQUENCE.slice(0, 5).forEach((k) => press(k)); press('x'); KONAMI_SEQUENCE.slice(0, 4).forEach((k) => press(k)); });
    expect(result.current.reveal).toBeNull();
  });

  it('ignores keystrokes while typing in an input', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const { result } = renderHook(() => useEasterEggs());
    act(() => { KONAMI_SEQUENCE.forEach((k) => press(k, input)); });
    expect(result.current.reveal).toBeNull();
    document.body.removeChild(input);
  });

  it('reveals on 7 logo clicks within 3s, but not if too slow', () => {
    const { result } = renderHook(() => useEasterEggs());
    act(() => { for (let i = 0; i < 7; i++) result.current.registerLogoClick(); });
    expect(result.current.reveal).toBeTruthy();
    act(() => result.current.dismiss());
    // too slow: clicks spaced beyond the window
    act(() => { for (let i = 0; i < 6; i++) { result.current.registerLogoClick(); vi.advanceTimersByTime(1000); } });
    expect(result.current.reveal).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useEasterEggs.test.jsx`
Expected: FAIL — cannot resolve `./useEasterEggs.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/useEasterEggs.js
// Detects the Konami code and a rapid logo click-streak, producing a transient
// reveal (rendered by reusing CelebrationLayer). No persistence; purely playful.
import { useState, useRef, useCallback, useEffect } from 'react';
import { KONAMI_SEQUENCE, endsWithSequence } from './konami.js';

const REVEALS = {
  konami: { key: 'egg:konami', title: '🎮 You found the code!', detail: 'Up up down down… nice.' },
  logo:   { key: 'egg:logo', title: '👋 Hey, that tickles!', detail: 'You found a secret.' },
};

export default function useEasterEggs({ clickThreshold = 7, clickWindowMs = 3000 } = {}) {
  const [reveal, setReveal] = useState(null);
  const bufferRef = useRef([]);
  const clicksRef = useRef([]);

  // Konami: window keydown, ignored while typing in fields.
  useEffect(() => {
    const onKeyDown = (e) => {
      const el = e.target;
      const tag = el && el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el && el.isContentEditable)) return;
      const key = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const buf = [...bufferRef.current, key].slice(-KONAMI_SEQUENCE.length);
      bufferRef.current = buf;
      if (endsWithSequence(buf, KONAMI_SEQUENCE)) {
        bufferRef.current = [];
        setReveal(REVEALS.konami);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const registerLogoClick = useCallback(() => {
    const now = Date.now();
    const recent = [...clicksRef.current, now].filter((t) => now - t <= clickWindowMs);
    clicksRef.current = recent;
    if (recent.length >= clickThreshold) {
      clicksRef.current = [];
      setReveal(REVEALS.logo);
    }
  }, [clickThreshold, clickWindowMs]);

  const dismiss = useCallback(() => setReveal(null), []);

  return { reveal, dismiss, registerLogoClick };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useEasterEggs.test.jsx`
Expected: PASS.

Note: the test uses fake timers so `Date.now()` advances only via `vi.advanceTimersByTime`. The 7 rapid clicks share one timestamp (within the window → reveal); the spaced loop advances 1000ms each (6 clicks span 5000ms > 3000ms window → never reaches threshold).

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/useEasterEggs.js src/useEasterEggs.test.jsx
git add src/useEasterEggs.js src/useEasterEggs.test.jsx
git commit -m "feat(playful): useEasterEggs (konami + logo click-streak -> reveal)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 13: Wire easter eggs into App + Settings hints (manual-verify)

**Files:** Modify `src/App.jsx`, `src/SettingsPanel.jsx`

- [ ] **Step 1: Imports in `src/App.jsx`**

Add after the `import SeasonalLayer ...` line:

```jsx
import useEasterEggs from './useEasterEggs.js';
import { printConsoleArt } from './consoleArt.js';
```

- [ ] **Step 2: Instantiate the hook + console art**

After `const celebrations = useCelebrations({ ... });`, add:

```jsx
  const eggs = useEasterEggs();
```

Near the other top-level effects (e.g. after the Ctrl+Z `useEffect`), add a one-time console-art effect:

```jsx
  useEffect(() => { printConsoleArt(); }, []);
```

- [ ] **Step 3: Render the egg reveal + wire the logo click**

After the `<SeasonalLayer ... />` element, add a second CelebrationLayer for egg reveals:

```jsx
      <CelebrationLayer
        celebration={eggs.reveal}
        style="festive"
        onDismiss={eggs.dismiss}
      />
```

Wrap the header avatar (line ~600) with a click handler. Replace:

```jsx
            <Icon value={appearance.appIcons.headerAvatar} fallback="✦" className="header-avatar" title="Your avatar" />
```

with:

```jsx
            <span className="header-avatar-wrap" onClick={eggs.registerLogoClick} role="presentation">
              <Icon value={appearance.appIcons.headerAvatar} fallback="✦" className="header-avatar" title="Your avatar" />
            </span>
```

- [ ] **Step 4: Add the "Hidden fun" hints block to `src/SettingsPanel.jsx`**

After the Seasonal-effects toggle block (from Task 9), insert:

```jsx
          <label className="settings-label">Hidden fun</label>
          <p className="settings-help">
            Tallio has a few secrets 🥚 — try an old-school cheat code (⬆⬆⬇⬇…),
            give the avatar a few quick taps, or peek at the browser console.
          </p>
```

- [ ] **Step 5: Verify suite + lint + build**

Run: `npx vitest run`
Expected: PASS.

Run: `npx eslint src/App.jsx src/SettingsPanel.jsx`
Expected: zero NEW errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/SettingsPanel.jsx
git commit -m "feat(playful): wire easter eggs (konami/logo reveal, console art) + Settings hints

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

- [ ] **Step 7: MODULE 3 CHECKPOINT — manual verify** (`npm run dev -- --port 5174 --strictPort`)

Confirm: typing the Konami code triggers a confetti reveal; 7 quick avatar clicks trigger a reveal; both dismiss and don't block the UI; the console shows the art on load; eggs fire even with celebrations set to Off; Settings shows the "Hidden fun" hints. Tune wording. Pause for sign-off, then finish the branch.

---

## Self-review (completed)

**Spec coverage:** Micro-interactions A/B/C/D → Tasks 1–5 (count-up A, hover/press B, snappy expand C, value-flash D; C at 160ms). Seasonal (4 seasons + holiday accents, summer sunny-drift, front overlay, toggle, reduced-motion) → Tasks 6–9. Easter eggs (Konami, 7-in-3s logo streak, console art, reuse CelebrationLayer, independent of celebration setting, Settings hints) → Tasks 10–13. Shared backbone (reduced-motion gate, one Seasonal toggle in useSettings, isolated CSS files) → Tasks 1/5/7/8/9. Deferred items (sound, birthday) intentionally absent.

**Placeholder scan:** none — every code step has complete code and exact commands.

**Type consistency:** `shouldAnimate()` used by Tasks 2/3; `useCountUp(target, {durationMs,enabled})→number`; `useValueFlash(value,{durationMs})→bool` + `.value-flash` CSS (Task 5); `seasonForDate`/`holidayForDate` shared by Task 7; `SeasonalLayer` props `{now, enabled, reducedMotion}` match Task 9's `enabled={settings.seasonalEffects}`; `settings.seasonalEffects`/`save({seasonalEffects})` consistent across Tasks 8/9; `KONAMI_SEQUENCE`/`endsWithSequence` shared by Task 12; `useEasterEggs()→{reveal,dismiss,registerLogoClick}` consumed in Task 13; egg `reveal` shape `{key,title,detail}` matches `CelebrationLayer`'s `celebration` prop from #3.
