# Playful Extras — Design

**Date:** 2026-06-08
**Sub-project:** #4 (final) of the Tallio "Make it Mine" initiative
**Status:** Approved (brainstorming complete)

> **Update 2026-06-08 (during implementation):** the **Seasonal touches** module (Module 2 below) was built, then **removed during manual verify** — drifting particles over a financial UI were too distracting, contradicting the "never in the way" goal. Final #4 ships **Micro-interactions + Easter eggs** only. The Module 2 section is retained below for the historical record.

## Intent

The last and most "nice-to-have" slice of the initiative: small touches that make
Tallio feel personal and alive (vs. Quicken) — tasteful motion, seasonal ambience, and
a few hidden surprises. As always, the day-to-day user is a meticulous father who
reconciles to the dollar, so every extra must be **subtle, opt-out-able, reduced-motion
aware, and never interfere with data entry, readability, or accuracy.**

Built as **one spec with three independently-shippable modules**, implemented in order:
**Micro-interactions → Seasonal touches → Easter eggs.**

## Shared backbone

- **Reduced motion is the master calm switch.** `prefers-reduced-motion` makes
  micro-interactions instant/exact, renders the seasonal layer as nothing, and degrades
  egg reveals to the static toast — reusing the existing detection pattern
  (`window.matchMedia('(prefers-reduced-motion: reduce)')`, as in `BackgroundLayer`/
  `CelebrationLayer`).
- **Settings** gains a small "Delight" area in `SettingsPanel`: a **Seasonal effects**
  on/off toggle (default **on**) and a **Hidden fun hints** block. Micro-interactions and
  easter eggs need no toggle (micro is subtle + reduced-motion-aware; eggs are hidden by
  nature and deliberate to trigger).
- **Persistence:** only the seasonal toggle is persisted, via `useSettings`
  (`tallio-*`), alongside display size. Everything else is stateless or transient.
- **Isolation from the App.css WIP:** new CSS lives in its own files
  (`microMotion.css`, `SeasonalLayer.css`) imported by the relevant module, so the
  unrelated uncommitted `App.css` change stays untouched.
- **Reuse #3's `CelebrationLayer`** (already tested) to render easter-egg reveals.

## Module 1 — Micro-interactions

**A. Count-up on totals.** `microMotion.js` (pure: `easeOutCubic`, `interpolate(from,to,p)`)
+ `useCountUp(target, { durationMs = 900, enabled })`.
- Animates **only on first view** of a screen; when the target later changes (e.g. a new
  transaction), it **snaps** to the new value — never re-animates mid-edit. Always ends on
  the **exact** target.
- `prefers-reduced-motion` or `enabled = false` → returns the target immediately.
- Applied to headline numbers only: **SummaryScorecard** (income / spending / savings) and
  **household net worth**. Everyday register numbers stay static.

**B. Hover & press feedback.** CSS only, in `microMotion.css` (imported by `App.jsx`).
Targets existing classes (`.btn`, list rows, cards): ~**120ms** hover lift + shadow,
`:active` slight scale-down. Disabled under reduced-motion via media query.

**C. Smooth expand & transitions.** Snappy ~**160ms** ease. The per-sub report bars
expand/collapse eases open/closed instead of snapping; section/screen swaps and list-row
enters get a short fade/slide. CSS in `microMotion.css`; disabled under reduced-motion.

**D. Value-change highlight.** `useValueFlash(value)` hook: when a watched value changes,
returns a flag painting a brief (~**1s** fade) highlight, then clears. Applied to account
balances (AccountList / register header). Reduced-motion → no flash, value just updates.

**Testing:** `microMotion.js` fully unit-tested (easing + interpolation). `useCountUp`
covers deterministic branches (reduced-motion / disabled → exact target immediately);
animation feel is manual-verify. `useValueFlash` tested with fake timers (flags on change,
clears after duration, silent under reduced-motion). CSS (B/C) manual-verify.

## Module 2 — Seasonal touches

**`seasonalMath.js` (pure, fully tested):**
- `seasonForDate(date) → 'winter' | 'spring' | 'summer' | 'autumn'`
  (N. hemisphere by month: Dec–Feb / Mar–May / Jun–Aug / Sep–Nov).
- `holidayForDate(date) → 'newyear' | 'halloween' | null` — a small **fixed-date** set
  (New Year ✨ on Dec 31–Jan 1, Halloween 🎃 on Oct 31), easily extensible. A holiday
  accent **takes precedence** over the base season for that day. **Birthday deferred**
  (needs a configured date, intentionally out of scope).

**`SeasonalLayer.jsx` + `SeasonalLayer.css`:**
- Renders the active effect — **snow / petals / sunny-drift / leaves** (or a holiday
  accent) — as small, slow, low-opacity particles via CSS keyframes (sparser/calmer than
  the brainstorm demo).
- A **subtle front overlay**: full-viewport, `pointer-events:none`, low opacity so it
  never hurts readability or blocks interaction.
- Computes season/holiday from an injected `now` (testable). Renders **nothing** when the
  Seasonal toggle is off **or** under reduced-motion.
- **Summer = "Sunny drift"**: a warm sun-glow tint with a few beach icons (☀️🐚🌴🕶️)
  drifting slowly sideways.

**Settings:** the **Seasonal effects** toggle (default on), persisted in `useSettings`.

**Testing:** `seasonalMath` fully unit-tested (every month + holiday precedence).
`SeasonalLayer` component-tested: correct particles per season, nothing when
off/reduced-motion, `pointer-events:none`. Particle feel is manual-verify (summer tuned in
the smoke test).

## Module 3 — Easter eggs

**`konami.js` (pure, tested):** `KONAMI_SEQUENCE` (↑↑↓↓←→←→ B A) + `endsWithSequence(buffer, seq)`.

**`useEasterEggs.js` hook:**
- **Konami:** window `keydown` listener maintains a rolling buffer; a match produces a
  transient **reveal**. Ignored while typing in input/textarea/contentEditable (same guard
  as the undo handler).
- **Logo click-streak:** exposes `registerLogoClick()`; **7 clicks within 3s** on the
  header avatar/logo produces a reveal; the counter resets otherwise.
- Produces `reveal = { key, title, detail }` + `dismiss()`, rendered by reusing a
  **`CelebrationLayer`** instance with `style="festive"` (always celebratory when
  triggered; auto-degrades to the static toast under reduced-motion).
- **Independent of the milestone-celebration setting** — eggs are deliberate, so they fire
  even if celebrations are "Off."

**Hidden console art:** `consoleArt()` (pure, returns the styled strings) printed **once**
at app mount via `console.log('%c…')`. No UI impact, no motion.

**Settings hints:** a "Hidden fun" block in `SettingsPanel` that tips off the eggs'
existence without fully spoiling them (e.g. "try an old-school cheat code ⬆⬆⬇⬇…",
"give the logo a few quick taps", and a wink that DevTools has a note).

**Reveals:** Konami → confetti + e.g. *"🎮 You found the code!"*; logo-streak → e.g.
*"👋 Hey, that tickles!"*. Wording tunable in the smoke test.

**Testing:** `konami.js` fully unit-tested. `useEasterEggs` tested with simulated keydowns
(full sequence → reveal; wrong key resets; ignored while typing) and click-streak via fake
timers (7-in-3s → reveal; too slow → none); `dismiss` clears. `consoleArt` returns expected
strings. Reveal visuals reuse #3's tested `CelebrationLayer`.

## Out of scope (deferred)
- **Celebration sound** — deferred to the future ("for friends who use the app"; Dad is
  used to silence). `CelebrationLayer` remains structured so a sound hook can drop in later.
- **Birthday greeting / accent** — needs a configurable birthday date; skipped.
- **Holiday one-offs beyond New Year + Halloween** — easy to add later.

## File structure
- Create `src/microMotion.js` + `src/microMotion.test.js` (pure).
- Create `src/useCountUp.js` + `src/useCountUp.test.jsx`.
- Create `src/useValueFlash.js` + `src/useValueFlash.test.jsx`.
- Create `src/microMotion.css` (imported by `App.jsx`).
- Create `src/seasonalMath.js` + `src/seasonalMath.test.js` (pure).
- Create `src/SeasonalLayer.jsx` + `src/SeasonalLayer.css` + `src/SeasonalLayer.test.jsx`.
- Create `src/konami.js` + `src/konami.test.js` (pure).
- Create `src/useEasterEggs.js` + `src/useEasterEggs.test.jsx`.
- Create `src/consoleArt.js` + `src/consoleArt.test.js` (pure).
- Modify `src/App.jsx` (mount SeasonalLayer + egg CelebrationLayer, wire count-up/flash on
  scorecard/net-worth/balances, header-avatar click, console art on mount).
- Modify `src/SettingsPanel.jsx` (Seasonal toggle + Hidden-fun hints).
- Modify `src/useSettings.js` (persist `seasonalEffects`).
- Modify the SummaryScorecard / net-worth / AccountList render sites to use count-up / flash.

## Branch & workflow
Branch `playful-extras` off `master` (`c156892`). Inline TDD per task: failing test →
implement → green → lint → commit; push as we go. Three module checkpoints, each ending in
a `npm run dev` manual-verify (port 5174 `--strictPort`). Group the pure foundational tasks
per module first.
