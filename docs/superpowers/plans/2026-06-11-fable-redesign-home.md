# Tallio Premium Redesign (Bullion/Instrument) — Home Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Project override:** the user requires **inline TDD execution by Claude (not subagents)** with review checkpoints → use superpowers:executing-plans.

**Goal:** Implement the approved spec `docs/superpowers/specs/2026-06-11-fable-redesign-design.md` — one home-screen skeleton with two selectable finishes (Bullion default / Instrument), shared TallyMark brand, new font foundations, finish-aware tokens, restructured top bar / sidebar / register, and a finish picker in Appearance → Theme.

**Architecture:** Finish is a new `appearance.finish` field (persisted in `tallio-appearance`, undoable) surfaced as `data-finish` on `.app-root`; a new `src/finishes.css` holds the two token sets plus Instrument-scoped structural overrides. Components keep their DOM contracts (class names, aria labels) wherever tests rely on them; new DOM (net-worth block, register footer) gets new classes and updated tests.

**Tech Stack:** React 19 + Vite, vitest + @testing-library/react (jsdom), plain CSS with custom properties + `color-mix()`. Fonts via Google Fonts: Fraunces, Geist, Geist Mono, IBM Plex Mono.

**Constraints (do not violate):**
- Do NOT read/borrow from `feat/tallio-styles`, `docs/superpowers/specs/2026-06-11-tallio-styles-design.md`, `docs/superpowers/plans/2026-06-11-tallio-styles-phase1.md`, or `.superpowers/brainstorm/2052-*` (the competing model's session).
- All finish dress uses theme tokens (`var(--accent)` etc.) — never literal colors (Nocturne's gold appears only as a fallback value).
- Keep working: Icon.jsx, 6 themes + custom, backgrounds/effects + frost knobs, undo everywhere, Scan/Upload/pairing, `tallio-*` storage, `--ui-scale`.
- Full `npx vitest run` green + `npm run build` clean at every commit.

**Reference (visual contract):** `.superpowers/brainstorm/3045-1781201340/content/finish-toggle-v2.html` — the approved live-toggle demo.

---

## Task 1: Font foundations (Fraunces / Geist / monos)

**Files:**
- Modify: `index.html` (Google Fonts link, line 10)
- Modify: `src/App.css` (`:root` font tokens + new finish-fallback tokens)

- [ ] **Step 1.1: Swap the Google Fonts link in `index.html`**

Replace the existing `<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond...` line with:

```html
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

- [ ] **Step 1.2: Update `:root` tokens in `src/App.css`**

Replace the three font tokens:

```css
  --font-display:  'Fraunces', Georgia, serif;
  --font-ui:       'Geist', system-ui, sans-serif;
  --font-mono:     'IBM Plex Mono', monospace;
```

and add finish-fallback tokens directly below them (finishes.css overrides these per finish in Task 5):

```css
  /* Finish-scoped tokens (defaults = Bullion; finishes.css overrides per data-finish). */
  --debit-color:   var(--text);
  --well-radius:   50%;
  --well-border:   color-mix(in srgb, var(--accent) 22%, transparent);
```

- [ ] **Step 1.3: Verify suite + build**

Run: `npx vitest run` → Expected: all tests pass (CSS/HTML-only change).
Run: `npm run build` → Expected: clean exit.

- [ ] **Step 1.4: Commit**

```bash
git add index.html src/App.css
git commit -m "feat(redesign): font foundations - Fraunces/Geist/IBM Plex Mono replace Cormorant/Outfit/JetBrains"
```

---

## Task 2: TallyMark brand component

**Files:**
- Create: `src/TallyMark.jsx`
- Create: `src/TallyMark.test.jsx`

- [ ] **Step 2.1: Write the failing test**

`src/TallyMark.test.jsx`:

```jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import TallyMark from './TallyMark.jsx';

describe('TallyMark', () => {
  afterEach(() => cleanup());

  it('renders a decorative svg with five tally strokes', () => {
    const { container } = render(<TallyMark />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('line')).toHaveLength(5);
  });

  it('scales via the size prop', () => {
    const { container } = render(<TallyMark size={28} />);
    expect(container.querySelector('svg').getAttribute('width')).toBe('28');
  });

  it('passes className through', () => {
    const { container } = render(<TallyMark className="brand-mark" />);
    expect(container.querySelector('svg').classList.contains('brand-mark')).toBe(true);
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npx vitest run src/TallyMark.test.jsx`
Expected: FAIL — `Cannot find module './TallyMark.jsx'`

- [ ] **Step 2.3: Implement `src/TallyMark.jsx`**

```jsx
// src/TallyMark.jsx
// The Tallio brand mark: a tally "gate of five" (four strokes + diagonal),
// drawn with the theme accent so every theme re-inks it. Decorative only.
import React from 'react';

export default function TallyMark({ size = 24, className = '' }) {
  return (
    <svg
      viewBox="0 0 28 24"
      width={size}
      height={Math.round(size * (24 / 28))}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="var(--accent, #d4a853)" strokeWidth="2.4" strokeLinecap="round">
        <line x1="4" y1="3" x2="4" y2="21" />
        <line x1="10" y1="3" x2="10" y2="21" />
        <line x1="16" y1="3" x2="16" y2="21" />
        <line x1="22" y1="3" x2="22" y2="21" />
        <line x1="1" y1="17" x2="26" y2="6" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npx vitest run src/TallyMark.test.jsx` → Expected: 3 passed.

- [ ] **Step 2.5: Commit**

```bash
git add src/TallyMark.jsx src/TallyMark.test.jsx
git commit -m "feat(redesign): TallyMark brand mark component"
```

---

## Task 3: `appearance.finish` plumbing in useAppearance

**Files:**
- Modify: `src/useAppearance.js`
- Modify: `src/useAppearance.test.jsx`

- [ ] **Step 3.1: Write the failing tests** (append a new describe block to `src/useAppearance.test.jsx`)

```jsx
describe('useAppearance — finish', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('style');
  });

  it('defaults finish to bullion', () => {
    const { result } = renderHook(() => useAppearance());
    expect(result.current.finish).toBe('bullion');
  });

  it('setFinish switches and persists', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.setFinish('instrument'));
    expect(result.current.finish).toBe('instrument');
    expect(JSON.parse(window.localStorage.getItem('tallio-appearance')).finish).toBe('instrument');
  });

  it('setFinish ignores unknown ids', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.setFinish('neon'));
    expect(result.current.finish).toBe('bullion');
  });

  it('back-fills finish for a saved config that predates it', () => {
    window.localStorage.setItem('tallio-appearance', JSON.stringify({ themeId: 'forest' }));
    const { result } = renderHook(() => useAppearance());
    expect(result.current.finish).toBe('bullion');
    expect(result.current.themeId).toBe('forest');
  });

  it('snapshot/restore round-trips finish', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.setFinish('instrument'));
    const snap = result.current.snapshot();
    act(() => result.current.setFinish('bullion'));
    act(() => result.current.restore(snap));
    expect(result.current.finish).toBe('instrument');
  });
});
```

- [ ] **Step 3.2: Run to verify failure**

Run: `npx vitest run src/useAppearance.test.jsx`
Expected: FAIL — `result.current.finish` is `undefined`.

- [ ] **Step 3.3: Implement in `src/useAppearance.js`**

Add near the top (below `STORAGE`):

```js
export const FINISHES = ['bullion', 'instrument'];
```

In `defaults()` add the field:

```js
function defaults() {
  return { themeId: 'nocturne', customTheme: null, background: { ...DEFAULT_BACKGROUND }, appIcons: {}, imageGroups: [], finish: 'bullion' };
}
```

In `loadInitial()` sanitize a possibly-invalid stored value — after building the merged object, return it through a guard:

```js
    const merged = {
      ...defaults(),
      ...parsed,
      background: { ...DEFAULT_BACKGROUND, ...(parsed.background || {}) },
    };
    if (!FINISHES.includes(merged.finish)) merged.finish = 'bullion';
    return merged;
```

Add the setter (next to `setTheme`):

```js
  const setFinish = useCallback((id) => {
    if (!FINISHES.includes(id)) return;
    setState(prev => persist({ ...prev, finish: id }));
  }, [persist]);
```

Include `finish` in `snapshot()` (add `finish: state.finish,` to the object) and in `restore()`:

```js
      finish: FINISHES.includes(snap.finish) ? snap.finish : 'bullion',
```

Export from the hook's return object: `finish: state.finish,` and `setFinish,`.

- [ ] **Step 3.4: Run to verify pass**

Run: `npx vitest run src/useAppearance.test.jsx` → Expected: all pass (existing + 5 new).

- [ ] **Step 3.5: Commit**

```bash
git add src/useAppearance.js src/useAppearance.test.jsx
git commit -m "feat(redesign): appearance.finish field (bullion default, persisted, snapshot/restore)"
```

---

## Task 4: `monthToDateDelta` in accountsModel

**Files:**
- Modify: `src/accountsModel.js` (add export below `householdTotals`)
- Modify: `src/accountsModel.test.js` (append describe block)

- [ ] **Step 4.1: Write the failing tests** (append to `src/accountsModel.test.js`; match the file's existing import style — it already imports from `./accountsModel.js`, extend that import with `monthToDateDelta` and `DEFAULT_ACCOUNT_TYPES_BY_ID` if not present)

```js
describe('monthToDateDelta', () => {
  const types = DEFAULT_ACCOUNT_TYPES_BY_ID;
  const accounts = [
    { id: 'a_chk', name: 'Checking', type: 'bank', openingBalance: 1000 },
    { id: 'a_sav', name: 'Savings',  type: 'bank', openingBalance: 0 },
    { id: 'a_cc',  name: 'Card',     type: 'credit_card', openingBalance: 0 },
    { id: 'a_mom', name: 'Mom',      type: 'person', openingBalance: 0 },
  ];
  const now = new Date('2026-06-15T12:00:00');

  it('sums current-month transactions across asset and liability accounts', () => {
    const txns = [
      { id: 't1', accountId: 'a_chk', date: '2026-06-06', amount: 3184.52 },
      { id: 't2', accountId: 'a_chk', date: '2026-06-10', amount: -142.87 },
      { id: 't3', accountId: 'a_cc',  date: '2026-06-09', amount: -89.40 },
    ];
    expect(monthToDateDelta(accounts, txns, types, now)).toBeCloseTo(2952.25, 2);
  });

  it('excludes transactions from other months and years', () => {
    const txns = [
      { id: 't1', accountId: 'a_chk', date: '2026-05-31', amount: 500 },
      { id: 't2', accountId: 'a_chk', date: '2025-06-15', amount: 500 },
      { id: 't3', accountId: 'a_chk', date: '2026-06-01', amount: 25 },
    ];
    expect(monthToDateDelta(accounts, txns, types, now)).toBeCloseTo(25, 2);
  });

  it('transfers between on-sheet accounts net to zero', () => {
    const txns = [
      { id: 'tf', accountId: 'a_chk', date: '2026-06-09', amount: -1500, transferId: 'x' },
      { id: 'tt', accountId: 'a_sav', date: '2026-06-09', amount:  1500, transferId: 'x' },
    ];
    expect(monthToDateDelta(accounts, txns, types, now)).toBe(0);
  });

  it('ignores off-balance-sheet accounts', () => {
    const txns = [{ id: 't1', accountId: 'a_mom', date: '2026-06-05', amount: 800 }];
    expect(monthToDateDelta(accounts, txns, types, now)).toBe(0);
  });

  it('returns 0 for empty inputs', () => {
    expect(monthToDateDelta([], [], types, now)).toBe(0);
    expect(monthToDateDelta(accounts, [], types, now)).toBe(0);
  });
});
```

- [ ] **Step 4.2: Run to verify failure**

Run: `npx vitest run src/accountsModel.test.js`
Expected: FAIL — `monthToDateDelta is not a function` (or import error).

- [ ] **Step 4.3: Implement** (in `src/accountsModel.js`, directly below `householdTotals`)

```js
// Net change to net worth from transactions dated in `now`'s calendar month,
// across on-balance-sheet accounts only. Transfers between two on-sheet
// accounts cancel; transfers to off-sheet accounts (e.g. paying a person)
// correctly count as a net-worth change.
export function monthToDateDelta(accounts, transactions, typesById, now = new Date()) {
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const onSheet = new Set(
    (accounts || []).filter(a => a && isOnBalanceSheet(a.type, typesById)).map(a => a.id)
  );
  let sum = 0;
  for (const t of transactions || []) {
    if (t && onSheet.has(t.accountId) && typeof t.date === 'string' && t.date.startsWith(ym) && Number.isFinite(t.amount)) {
      sum += t.amount;
    }
  }
  return sum;
}
```

- [ ] **Step 4.4: Run to verify pass**

Run: `npx vitest run src/accountsModel.test.js` → Expected: all pass.

- [ ] **Step 4.5: Commit**

```bash
git add src/accountsModel.js src/accountsModel.test.js
git commit -m "feat(redesign): monthToDateDelta - net-worth change for the current month"
```

---

## Task 5: finishes.css + `data-finish` wiring + undoable setFinish

**Files:**
- Create: `src/finishes.css`
- Modify: `src/App.jsx` (import, `data-finish` attribute, `appearanceForUI.setFinish`)

- [ ] **Step 5.1: Create `src/finishes.css`** (token sets only — structural overrides arrive with each component task; this file grows in Tasks 6–8 and 12)

```css
/* ============================================================
   FINISHES — the form axis. Theme = color, Finish = form.
   One DOM; these tokens + [data-finish] scoped rules re-dress it.
   Bullion: heirloom ledger (default). Instrument: precision terminal.
   Every color here derives from theme tokens — never literals.
   ============================================================ */

.app-root[data-finish="bullion"] {
  --font-mono: 'IBM Plex Mono', monospace;
  --debit-color: var(--text);
  --well-radius: 50%;
  --well-border: color-mix(in srgb, var(--accent) 22%, transparent);
  --topbar-h: 62px;
  --topbar-bg: transparent;
}

.app-root[data-finish="instrument"] {
  --font-mono: 'Geist Mono', monospace;
  --debit-color: var(--red);
  --well-radius: 6px;
  --well-border: var(--border);
  --topbar-h: 50px;
  --topbar-bg: var(--bg-raised);
}

/* Finish flips cross-fade; disabled for reduced motion. */
.app-root,
.app-root .topbar,
.app-root .icon-well,
.app-root .register {
  transition: background-color .25s ease, border-color .25s ease, border-radius .25s ease;
}
@media (prefers-reduced-motion: reduce) {
  .app-root, .app-root .topbar, .app-root .icon-well, .app-root .register { transition: none; }
}
```

- [ ] **Step 5.2: Wire up `src/App.jsx`**

Add import after `./App.css`:

```js
import './finishes.css';
```

Change the root div:

```jsx
    <div className="app-root" data-finish={appearance.finish}>
```

Add to `appearanceForUI` (next to `setTheme`):

```js
    setFinish: (id) => { pushHistory(); appearance.setFinish(id); },
```

- [ ] **Step 5.3: Verify suite + build**

Run: `npx vitest run` → Expected: all pass.
Run: `npm run build` → Expected: clean.

- [ ] **Step 5.4: Commit**

```bash
git add src/finishes.css src/App.jsx
git commit -m "feat(redesign): finish token sets + data-finish wiring, undoable setFinish"
```

---

## Task 6: Top bar — brand, nav, actions, avatar right; drawer slides right

**Files:**
- Modify: `src/App.jsx` (header JSX, lines ~620–642)
- Modify: `src/App.css` (new `.topbar` styles; keep `.header` — sub-screens still use it)
- Modify: `src/finishes.css` (topbar/nav finish dress)
- Modify: `src/AvatarDrawer.css` (right-side slide)

No test file changes: no existing test references the App header DOM; AvatarDrawer tests assert panel class/`no-anim` only.

- [ ] **Step 6.1: Restructure the header in `src/App.jsx`**

Add import: `import TallyMark from './TallyMark.jsx';`

Replace the current `<header className="header">…</header>` block (inside `.container`) and move it OUT of `.container`, directly above it:

```jsx
      <header className="topbar">
        <div className="brand">
          <TallyMark size={24} className="brand-mark" />
          <h1 className="brand-title">
            <span role="presentation" onClick={eggs.registerLogoClick}>Tallio</span>
          </h1>
        </div>
        <nav className="top-nav" aria-label="Primary">
          <button type="button" className="top-nav-link on" aria-current="page">Accounts</button>
          <button type="button" className="top-nav-link" onClick={() => setScreen('reports')}>Reports</button>
          <button type="button" className="top-nav-link" onClick={() => setScreen('manage-categories')}>Categories</button>
          <button type="button" className="top-nav-link" onClick={() => setScreen('account-types')}>Account types</button>
        </nav>
        <div className="header-actions">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,application/pdf" style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()} className="btn">↑ Upload</button>
          <button onClick={openPairing} className={`btn${desktopPeer.status === 'paired' ? ' btn-paired' : ''}`}>{desktopPeer.status === 'paired' ? '✓ Phone linked' : '⌘ Pair phone'}</button>
          <UndoButton count={history.length} onUndo={undo} />
          <button onClick={() => setShowCamera(true)} className="btn btn-primary">◉ Scan bill</button>
          <button type="button" className="avatar-trigger" aria-label="Account menu" title="Open menu" onClick={() => setDrawerOpen(true)}>
            <Icon value={appearance.appIcons.headerAvatar} fallback="✦" className="header-avatar" />
            <span className="avatar-trigger-caret" aria-hidden="true">▾</span>
          </button>
        </div>
      </header>
```

The `<div className="container">` now starts directly with `<div className="accounts-layout">`.

- [ ] **Step 6.2: Add topbar + icon-well styles to `src/App.css`** (append a new section; do NOT delete `.header`/`.brand-sub` styles yet — sub-screens use `.header`; dead-rule cleanup happens in Task 12)

```css
/* ---- Top bar (main screen) ---- */

.topbar {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  height: var(--topbar-h, 62px);
  padding: 0 26px;
  gap: 28px;
  border-bottom: 1px solid var(--border-strong);
  background: var(--topbar-bg, transparent);
}

.topbar .brand { display: flex; flex-direction: row; align-items: center; gap: 11px; }
.brand-mark { flex: 0 0 auto; }
.topbar .brand-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 500;
  font-style: normal;
  letter-spacing: 0;
  line-height: 1;
  margin: 0;
  cursor: pointer;
}

.top-nav { display: flex; align-items: center; height: 100%; }
.top-nav-link {
  background: none; border: none; cursor: pointer;
  color: var(--text-muted);
  font-family: var(--font-ui);
  display: flex; align-items: center; gap: 7px;
  height: 100%; padding: 0 13px;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.top-nav-link:hover { color: var(--text); }

.topbar .header-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; padding: 0; }

.avatar-trigger { margin-left: 2px; }

/* Generic icon wells — emoji/image icons presented as minted coins (Bullion)
   or square chips (Instrument). Wraps Icon.jsx output, never replaces it. */
.icon-well {
  width: 27px; height: 27px;
  border-radius: var(--well-radius, 50%);
  background: color-mix(in srgb, var(--text) 5%, transparent);
  border: 1px solid var(--well-border, var(--border));
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 13px; flex: 0 0 auto; overflow: hidden;
}
.icon-well .icon-img { width: 100%; height: 100%; border-radius: inherit; object-fit: cover; }
.icon-well-lg { width: 36px; height: 36px; font-size: 18px; }
.icon-well-sm { width: 19px; height: 19px; font-size: 9.5px; }
```

- [ ] **Step 6.3: Add finish dress for the topbar to `src/finishes.css`**

```css
/* ---- Top bar ---- */
.app-root[data-finish="instrument"] .topbar { padding: 0 18px; gap: 22px; }
.app-root[data-finish="instrument"] .topbar .brand-title { font-size: 20px; }
.app-root[data-finish="instrument"] .brand-mark { width: 21px; height: 18px; }

.app-root[data-finish="bullion"] .top-nav-link {
  font-size: 10.5px; letter-spacing: 0.2em; text-transform: uppercase;
}
.app-root[data-finish="bullion"] .top-nav-link.on { color: var(--text); }
.app-root[data-finish="bullion"] .top-nav-link.on::before {
  content: ''; width: 4px; height: 4px; border-radius: 50%; background: var(--accent);
}
.app-root[data-finish="instrument"] .top-nav-link {
  font-family: var(--font-mono); font-size: 11.5px; text-transform: lowercase;
}
.app-root[data-finish="instrument"] .top-nav-link.on {
  color: var(--text); border-bottom-color: var(--accent);
}
```

- [ ] **Step 6.4: Move the drawer to the right in `src/AvatarDrawer.css`**

Replace the `.avatar-drawer-panel` block and keyframes:

```css
.avatar-drawer-panel {
  position: absolute; top: 0; right: 0; height: 100%; width: 280px; max-width: 86vw;
  background: var(--bg-card, #161d2a); border-left: 1px solid var(--border, #2a3550);
  box-shadow: -12px 0 34px rgba(0, 0, 0, .5); padding: 16px;
  display: flex; flex-direction: column;
  animation: avatar-drawer-in .28s cubic-bezier(.2, .8, .2, 1);
}
@keyframes avatar-drawer-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
```

Also update the component's header comment in `src/AvatarDrawer.jsx` ("Left slide-in" → "Right slide-in, anchored to the header avatar").

- [ ] **Step 6.5: Verify suite + visual**

Run: `npx vitest run` → Expected: all pass.
Run: `npm run dev`, open http://localhost:5173 — confirm: tally mark + Fraunces wordmark; nav links; avatar far right opens right-side drawer; flip finish via devtools (`document.querySelector('.app-root').dataset.finish='instrument'`) and confirm bar compacts.

- [ ] **Step 6.6: Commit**

```bash
git add src/App.jsx src/App.css src/finishes.css src/AvatarDrawer.css src/AvatarDrawer.jsx
git commit -m "feat(redesign): top bar - TallyMark brand, primary nav, avatar+drawer on the right"
```

---

## Task 7: AccountList — net-worth block, month delta, group counts

**Files:**
- Modify: `src/AccountList.jsx`
- Modify: `src/AccountList.test.jsx`
- Modify: `src/App.css` (replace the old `.household-strip`/`.account-*` ad-hoc block)
- Modify: `src/finishes.css` (sidebar finish dress)

- [ ] **Step 7.1: Write the failing tests** (replace the first test's name/assertions and append new ones in `src/AccountList.test.jsx`)

Update the first test:

```jsx
  it('renders group headers, account names, and the net-worth block', () => {
    render(<AccountList accounts={accounts} transactions={transactions} selectedId="a_chk" onSelect={() => {}} onAddAccount={() => {}} />);
    expect(screen.getByText('Cash & Bank')).toBeTruthy();
    expect(screen.getByText('Credit cards & loans')).toBeTruthy();
    expect(screen.getByText('People & external')).toBeTruthy();
    expect(screen.getByText('Chase Checking')).toBeTruthy();
    expect(screen.getByText(/Net worth/i)).toBeTruthy();
    expect(screen.getByText(/Cash & investments/i)).toBeTruthy();
    expect(screen.getByText(/You owe/i)).toBeTruthy();
  });
```

Append:

```jsx
  it('shows the month delta for current-month activity', () => {
    render(<AccountList accounts={accounts} transactions={transactions} now={new Date('2026-05-15T12:00:00')} selectedId={null} onSelect={() => {}} onAddAccount={() => {}} />);
    // May activity: +200 (checking) − 150 (card) = +50
    expect(screen.getByText(/\+\$50\.00 this month/)).toBeTruthy();
  });

  it('shows a muted zero delta when the current month has no activity', () => {
    render(<AccountList accounts={accounts} transactions={transactions} now={new Date('2026-07-01T12:00:00')} selectedId={null} onSelect={() => {}} onAddAccount={() => {}} />);
    expect(screen.getByText(/\$0\.00 this month/)).toBeTruthy();
  });

  it('splits the net-worth figure into dollars and cents spans', () => {
    const { container } = render(<AccountList accounts={accounts} transactions={transactions} selectedId={null} onSelect={() => {}} onAddAccount={() => {}} />);
    expect(container.querySelector('.networth-cents')).toBeTruthy();
  });

  it('shows a per-group account count', () => {
    const { container } = render(<AccountList accounts={accounts} transactions={transactions} selectedId={null} onSelect={() => {}} onAddAccount={() => {}} />);
    const label = container.querySelector('.account-group-label');
    expect(label.textContent).toContain('Cash & Bank');
    expect(label.textContent).toContain('1');
  });
```

- [ ] **Step 7.2: Run to verify failure**

Run: `npx vitest run src/AccountList.test.jsx`
Expected: FAIL — no "Cash & investments", no delta text, no `.networth-cents`.

- [ ] **Step 7.3: Rewrite `src/AccountList.jsx`**

```jsx
// src/AccountList.jsx
import React, { useMemo } from 'react';
import { groupOrder, groupFor, accountClass, accountBalance, householdTotals, monthToDateDelta, DEFAULT_ACCOUNT_TYPES } from './accountsModel.js';
import Icon from './Icon.jsx';
import useCountUp from './useCountUp.js';
import useValueFlash from './useValueFlash.js';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function AccountList({ accounts, transactions, types = DEFAULT_ACCOUNT_TYPES, selectedId, onSelect, onAddAccount, now = new Date() }) {
  const typesById = useMemo(() => new Map(types.map(t => [t.id, t])), [types]);
  const order = useMemo(() => groupOrder(types), [types]);
  const totals = useMemo(() => householdTotals(accounts, transactions, typesById), [accounts, transactions, typesById]);
  const delta = useMemo(() => monthToDateDelta(accounts, transactions, typesById, now), [accounts, transactions, typesById, now]);
  const netWorthV = useCountUp(totals.netWorth);
  const netWorthFlash = useValueFlash(totals.netWorth);

  const grouped = useMemo(() => {
    const map = new Map(order.map(g => [g, []]));
    for (const a of accounts) {
      const g = groupFor(a.type, typesById);
      (map.get(g) || map.get('Unassigned')).push(a);
    }
    return map;
  }, [accounts, order, typesById]);

  // "$487,312.44" → ["$487,312", "44"] so Bullion can shrink the cents.
  const [nwDollars, nwCents] = fmt(netWorthV).split('.');
  const deltaClass = delta > 0 ? ' pos' : delta < 0 ? ' neg' : ' zero';
  const deltaText = `${delta > 0 ? '▲ +' : delta < 0 ? '▼ −' : ''}${fmt(Math.abs(delta))} this month`;

  return (
    <div className="account-list">
      <div className="networth">
        <div className="networth-label">Net worth</div>
        <div className={`networth-figure${totals.netWorth >= 0 ? '' : ' neg'}${netWorthFlash ? ' value-flash' : ''}`}>
          {nwDollars}<span className="networth-cents">.{nwCents}</span>
        </div>
        <div className="networth-rule" aria-hidden="true" />
        <div className={`networth-delta${deltaClass}`}>{deltaText}</div>
        <div className="networth-pair">
          <span>Cash &amp; investments</span><span className="networth-lead" aria-hidden="true" /><b>{fmt(totals.assets)}</b>
        </div>
        <div className="networth-pair">
          <span>You owe</span><span className="networth-lead" aria-hidden="true" /><b className="neg">{fmt(totals.owed)}</b>
        </div>
      </div>

      {order.map(group => {
        const list = grouped.get(group) || [];
        if (list.length === 0) return null;
        return (
          <div key={group} className="account-group">
            <div className="account-group-label"><span>{group}</span><b>{list.length}</b></div>
            {list.map(a => {
              const bal = accountBalance(a, transactions);
              const klass = accountClass(a.type, typesById);
              const display = klass === 'liability' ? -Math.abs(bal) : bal;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`account-row${a.id === selectedId ? ' account-row-selected' : ''}`}
                  onClick={() => onSelect(a.id)}
                >
                  <span className="icon-well account-row-well"><Icon value={a.icon} className="account-row-icon" /></span>
                  <span className="account-row-name">{a.name}</span>
                  <span className={`account-row-balance${display < 0 ? ' neg' : ''}`}>{fmt(display)}</span>
                </button>
              );
            })}
          </div>
        );
      })}

      <button type="button" className="account-add" onClick={onAddAccount} aria-label="Add account">+ Add account</button>
    </div>
  );
}
```

- [ ] **Step 7.4: Run to verify pass**

Run: `npx vitest run src/AccountList.test.jsx` → Expected: all pass.

- [ ] **Step 7.5: Replace the sidebar CSS**

In `src/App.css`, DELETE these old rules (the ad-hoc block near the end of the file): `.account-list`, `.household-strip`, `.household-stat`, `.household-label`, `.account-group-label`, `.account-row`, `.account-row:hover`, `.account-row-selected`, `.account-row-icon`, `.account-row-balance` (if present), `.account-add`. Replace with:

```css
/* ---- Accounts sidebar ---- */

.account-list { display: flex; flex-direction: column; }

.networth-label {
  font-size: 9.5px; letter-spacing: 0.26em; text-transform: uppercase;
  color: var(--text-muted);
}
.networth-figure {
  font-family: var(--font-display);
  font-size: 34px; font-weight: 500; letter-spacing: -0.01em;
  font-variant-numeric: lining-nums tabular-nums;
  margin-top: 6px; border-radius: 6px;
}
.networth-figure.neg { color: var(--red); }
.networth-cents { font-size: 19px; color: var(--text-muted); }
.networth-rule {
  border-bottom: 3px double color-mix(in srgb, var(--accent) 50%, transparent);
  margin: 10px 0; width: 200px;
}
.networth-delta { font-family: var(--font-mono); font-size: 10.5px; margin-bottom: 8px; display: inline-flex; align-items: center; gap: 5px; }
.networth-delta.pos { color: var(--green); }
.networth-delta.neg { color: var(--red); }
.networth-delta.zero { color: var(--text-dim); }
.networth-pair { display: flex; align-items: baseline; font-size: 11.5px; color: var(--text-muted); padding: 3px 0; }
.networth-lead { flex: 1; border-bottom: 1px dotted color-mix(in srgb, var(--text-muted) 45%, transparent); margin: 0 8px 3px; }
.networth-pair b { font-family: var(--font-mono); font-size: 12px; font-weight: 500; color: var(--text); }
.networth-pair b.neg { color: var(--red); }

.account-group { margin-top: 22px; }
.account-group-label {
  display: flex; justify-content: space-between;
  font-size: 9px; letter-spacing: 0.26em; text-transform: uppercase;
  color: var(--text-dim);
  padding-bottom: 7px; border-bottom: 1px solid var(--border); margin-bottom: 4px;
}
.account-group-label b { font-family: var(--font-mono); font-weight: 400; color: var(--text-muted); letter-spacing: 0; }

.account-row {
  display: flex; align-items: center; gap: 10px; width: 100%;
  background: transparent; border: none; border-radius: 8px;
  padding: 7px 9px; margin: 1px -9px; cursor: pointer;
  color: inherit; text-align: left; position: relative;
  font: inherit;
}
.account-row:hover { background: color-mix(in srgb, var(--text) 2.5%, transparent); }
.account-row-selected { background: var(--bg-card); box-shadow: inset 0 0 0 1px var(--border); }
.account-row-selected::before {
  content: ''; position: absolute; left: 0; top: 7px; bottom: 7px;
  width: 2px; border-radius: 2px; background: var(--accent);
}
.account-row-name { font-size: 13px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.account-row-balance { font-family: var(--font-mono); font-size: 11.5px; }
.account-row-balance.neg { color: var(--red); }

.account-add {
  width: calc(100% + 0px); margin-top: 18px;
  background: none; border: 1px dashed var(--border-strong); border-radius: 8px;
  color: var(--text-muted); font: inherit; font-size: 12px; padding: 9px; cursor: pointer;
}
.account-add:hover { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
```

Also update the layout rules (same area of App.css): replace `.accounts-layout` / `.accounts-sidebar` rules with:

```css
.accounts-layout { display: grid; grid-template-columns: 280px 1fr; gap: 30px; align-items: start; }
@media (max-width: 900px) { .accounts-layout { grid-template-columns: 1fr; } }
```

- [ ] **Step 7.6: Add sidebar finish dress to `src/finishes.css`**

```css
/* ---- Body / sidebar ---- */
.app-root[data-finish="bullion"] .container { max-width: 1280px; padding: 26px 30px 36px; }
.app-root[data-finish="instrument"] .container { max-width: none; padding: 0; }
.app-root[data-finish="instrument"] .accounts-layout { grid-template-columns: 264px 1fr; gap: 0; }
.app-root[data-finish="instrument"] .accounts-sidebar {
  background: color-mix(in srgb, var(--bg-raised) calc(var(--surface-alpha) * 55%), transparent);
  backdrop-filter: blur(var(--surface-blur));
  border-right: 1px solid var(--border);
  padding: 16px 14px;
  min-height: calc(100vh - var(--topbar-h));
}
.app-root[data-finish="instrument"] .networth-figure { font-family: var(--font-ui); font-size: 24px; font-weight: 600; }
.app-root[data-finish="instrument"] .networth-cents { font-size: 24px; color: inherit; }
.app-root[data-finish="instrument"] .networth-rule { border-bottom: 1px solid var(--border); width: 100%; }
.app-root[data-finish="instrument"] .networth-delta.pos {
  background: var(--green-dim); border: 1px solid var(--green-border); padding: 2px 7px; border-radius: 4px;
}
.app-root[data-finish="instrument"] .networth-delta.neg {
  background: var(--red-dim); border: 1px solid var(--red-border); padding: 2px 7px; border-radius: 4px;
}
.app-root[data-finish="instrument"] .networth-lead { border-bottom: none; }
.app-root[data-finish="instrument"] .account-group-label { font-family: var(--font-mono); letter-spacing: 0.16em; border-bottom: none; }
.app-root[data-finish="instrument"] .account-row { margin: 1px 0; border-left: 2px solid transparent; border-radius: 6px; }
.app-root[data-finish="instrument"] .account-row:hover { background: var(--bg-card-hover); }
.app-root[data-finish="instrument"] .account-row-selected { box-shadow: none; border-left-color: var(--accent); }
.app-root[data-finish="instrument"] .account-row-selected::before { display: none; }
.app-root[data-finish="instrument"] .icon-well { background: color-mix(in srgb, var(--text) 4.5%, transparent); }
```

- [ ] **Step 7.7: Full verify + visual**

Run: `npx vitest run` → Expected: all pass.
Visual: both finishes — Bullion serif figure + dotted leaders + coins; Instrument rail + chip delta + squares.

- [ ] **Step 7.8: Commit**

```bash
git add src/AccountList.jsx src/AccountList.test.jsx src/App.css src/finishes.css
git commit -m "feat(redesign): sidebar net-worth block with month delta, coin wells, group counts"
```

---

## Task 8: Register — sheet header, facts footer, edit-account button

**Files:**
- Modify: `src/Register.jsx`
- Modify: `src/Register.test.jsx`
- Modify: `src/App.jsx` (pass `onEditAccount`, remove the old `account-toolbar` block)
- Modify: `src/App.css` (register dress)
- Modify: `src/finishes.css` (sheet vs flat)

- [ ] **Step 8.1: Write the failing tests** (append to the main `describe('Register')` block)

```jsx
  it('shows an edit-account button that fires onEditAccount', async () => {
    const onEditAccount = vi.fn();
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} onEditAccount={onEditAccount} />);
    await userEvent.click(screen.getByRole('button', { name: /edit account/i }));
    expect(onEditAccount).toHaveBeenCalled();
  });

  it('shows the account type label in the header', () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    expect(screen.getByText('Credit card')).toBeTruthy();
  });

  it('footer reports entry count, period, and last entry date', () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    expect(screen.getByText(/2 entries · All activity/)).toBeTruthy();
    expect(screen.getByText(/Last entry May 5, 2026/)).toBeTruthy();
  });

  it('footer reflects the month filter with a singular count', async () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    fireEvent.change(screen.getByLabelText(/month filter/i), { target: { value: '2026-04' } });
    expect(screen.getByText(/1 entry · April 2026/)).toBeTruthy();
  });
```

Add `fireEvent` to the testing-library import in this file.

- [ ] **Step 8.2: Run to verify failure**

Run: `npx vitest run src/Register.test.jsx`
Expected: FAIL — no edit-account button, no "Credit card" text, no footer.

- [ ] **Step 8.3: Restructure `src/Register.jsx`**

Add to the accountsModel import: `DEFAULT_ACCOUNT_TYPES_BY_ID`.
New prop: `onEditAccount = null`.

Replace the `register-header` block:

```jsx
      <div className="register-header">
        <span className="icon-well icon-well-lg"><Icon value={account.icon} className="register-icon" /></span>
        <h2 className="register-title">{account.name}</h2>
        <span className="register-kind">{((typesById || DEFAULT_ACCOUNT_TYPES_BY_ID).get(account.type) || { label: 'Unassigned' }).label}</span>
        <div className="register-balance-block">
          <span className="register-balance-label">{klass === 'liability' ? 'Owed' : 'Balance'}</span>
          <span className="register-balance">{klass === 'liability' ? money(Math.abs(Math.min(0, balance))) : money(balance)}</span>
        </div>
        <div className="register-actions">
          <button type="button" className="btn btn-primary" onClick={() => onAddTransaction(account.id)} aria-label="Add transaction">+ New entry</button>
          <button type="button" className="btn" onClick={() => onTransfer(account.id)} aria-label="Transfer">⇄ Transfer</button>
          {onEditAccount && (
            <button type="button" className="btn btn-icon" onClick={onEditAccount} aria-label="Edit account" title="Edit account">✎</button>
          )}
        </div>
      </div>
```

Delete the old `balanceLabel` const (it's replaced by the block above).

Wrap the search input for the kbd hint (inside `register-filters`):

```jsx
        <span className="register-search">
          <input type="text" className="input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="kbd-hint" aria-hidden="true">/</span>
        </span>
```

After the `</table>` add the footer. Compute just above the return:

```jsx
  const lastEntryDate = rows.reduce((max, r) => (r.date && r.date > max ? r.date : max), '');
  const monthLabel = month
    ? new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'All activity';
  const lastEntryLabel = lastEntryDate
    ? `Last entry ${new Date(`${lastEntryDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : '';
```

```jsx
      <div className="register-foot">
        <span>{rows.length} {rows.length === 1 ? 'entry' : 'entries'} · {monthLabel}</span>
        <span>{lastEntryLabel}</span>
      </div>
```

- [ ] **Step 8.4: Pass the prop from `src/App.jsx`** — delete the `<div className="account-toolbar">…</div>` block and add to `<Register …>`:

```jsx
                  onEditAccount={() => setEditingAccount({ mode: 'edit', account: selectedAccount })}
```

- [ ] **Step 8.5: Run to verify pass**

Run: `npx vitest run src/Register.test.jsx` → Expected: all pass (new + existing — existing tests rely on aria-labels `Add transaction`/`Transfer` and text `/Owed/i`, all preserved).

- [ ] **Step 8.6: Register CSS** — in `src/App.css`, DELETE old rules `.register-header`, `.register-title`, `.register-balance`, `.register-filters`, `.register-table` area rules (`.register-table th`, etc. if present), `.register-empty`, `.account-toolbar`, and the `.txn-amt/.txn-bal` color rules in the ad-hoc block. Replace with:

```css
/* ---- Register ---- */

.register-header { display: flex; align-items: center; gap: 13px; }
.register-title { font-family: var(--font-display); font-size: 21px; font-weight: 500; margin: 0; }
.register-kind {
  font-family: var(--font-mono);
  font-size: 8.5px; letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--text-muted);
  border: 1px solid var(--border-strong); border-radius: 4px; padding: 2.5px 7px;
}
.register-balance-block { margin-left: auto; text-align: right; }
.register-balance-label { display: block; font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--text-muted); }
.register-balance { font-family: var(--font-mono); font-size: 16.5px; font-weight: 500; margin-top: 3px; display: inline-block; }
.register-actions { display: flex; gap: 8px; margin-left: 18px; }

.register-filters { display: flex; gap: 14px; align-items: center; margin: 17px 0 3px; flex-wrap: wrap; }
.register-search { position: relative; display: inline-flex; align-items: center; }
.kbd-hint {
  display: none;
  position: absolute; right: 8px;
  font-family: var(--font-mono); font-size: 9.5px; color: var(--text-dim);
  border: 1px solid var(--border-strong); border-radius: 3px; padding: 1px 5px;
  pointer-events: none;
}

.register-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
.register-table thead th {
  font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--text-muted); font-weight: 500; text-align: left;
  padding: 0 10px 7px 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
}
.register-table thead th.right, .register-table td.right { text-align: right; }
.register-table .th-sort { background: none; border: none; color: inherit; font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; padding: 0; }
.register-table .th-sort:hover, .register-table .th-sort-active { color: var(--text); }
.register-table tbody td { padding: 8.5px 10px 8px 4px; border-bottom: 1px solid var(--border); font-size: 13px; }
.register-empty { text-align: center; color: var(--text-muted); padding: 1.5rem; }

.txn-row { cursor: pointer; transition: background .12s; }
.txn-row:hover td { background: color-mix(in srgb, var(--text) 1.8%, transparent); }
.txn-date { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.08em; color: var(--text-muted); text-transform: uppercase; white-space: nowrap; width: 74px; }
.txn-amt, .txn-bal { text-align: right; font-family: var(--font-mono); font-size: 12.5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.txn-amt.neg { color: var(--debit-color); }
.txn-amt.pos { color: var(--green); }
.txn-bal { color: var(--text-muted); }
.txn-bal.neg { color: var(--red); }

.register-foot {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 13px;
  font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--text-dim);
}
```

- [ ] **Step 8.7: Sheet vs flat in `src/finishes.css`**

```css
/* ---- Register ---- */
.app-root[data-finish="bullion"] .register {
  background: color-mix(in srgb, var(--bg-raised) calc(var(--surface-alpha) * 100%), transparent);
  backdrop-filter: blur(var(--surface-blur));
  border: 1px solid var(--border); border-radius: 12px;
  padding: 20px 24px 16px;
}
.app-root[data-finish="instrument"] .register { padding: 16px 20px; }
.app-root[data-finish="instrument"] .register-title { font-size: 16px; font-weight: 600; }
.app-root[data-finish="bullion"] .register-balance {
  border-bottom: 3px double color-mix(in srgb, var(--accent) 50%, transparent); padding-bottom: 3px;
}
.app-root[data-finish="bullion"] .register-filters .input,
.app-root[data-finish="bullion"] .register-filters .select {
  background: none; border: none; border-bottom: 1px solid var(--border-strong); border-radius: 0;
}
.app-root[data-finish="instrument"] .kbd-hint { display: inline-block; }
.app-root[data-finish="instrument"] .register-table thead th { font-family: var(--font-mono); letter-spacing: 0.14em; color: var(--text-dim); border-bottom-color: var(--border-strong); }
.app-root[data-finish="instrument"] .txn-date { letter-spacing: 0; text-transform: none; font-size: 11px; }
.app-root[data-finish="instrument"] .register-foot { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.04em; text-transform: none; }
```

- [ ] **Step 8.8: Full verify + visual, commit**

Run: `npx vitest run` → all pass. `npm run build` → clean. Visual check both finishes (sheet vs flat, footer, header).

```bash
git add src/Register.jsx src/Register.test.jsx src/App.jsx src/App.css src/finishes.css
git commit -m "feat(redesign): register sheet header, facts footer, edit-account button"
```

---

## Task 9: `/` focuses the register search

**Files:**
- Modify: `src/Register.jsx`
- Modify: `src/Register.test.jsx`

- [ ] **Step 9.1: Write the failing tests** (append to `describe('Register')`)

```jsx
  it('"/" focuses the search box', async () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    await userEvent.keyboard('/');
    expect(document.activeElement).toBe(screen.getByPlaceholderText(/search/i));
  });

  it('"/" is ignored while typing in another field', async () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    const month = screen.getByLabelText(/month filter/i);
    month.focus();
    await userEvent.keyboard('/');
    expect(document.activeElement).toBe(month);
  });

  it('"/" is ignored while a dialog is open', async () => {
    render(<Register account={account} transactions={transactions} categories={[cat]} categoriesById={categoriesById} onEditTransaction={() => {}} onAddTransaction={() => {}} />);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    await userEvent.keyboard('/');
    expect(document.activeElement).not.toBe(screen.getByPlaceholderText(/search/i));
    dialog.remove();
  });
```

- [ ] **Step 9.2: Run to verify failure**

Run: `npx vitest run src/Register.test.jsx` → Expected: first new test FAILS (focus stays on body).

- [ ] **Step 9.3: Implement in `src/Register.jsx`**

Add `useRef`, `useEffect` to the React import. Inside the component:

```jsx
  const searchRef = useRef(null);
  // "/" jumps to search — unless the user is typing or an overlay is open.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target;
      const tag = el && el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el && el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"], .camera-overlay, .processing-overlay')) return;
      e.preventDefault();
      if (searchRef.current) searchRef.current.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
```

Add `ref={searchRef}` to the search `<input>`.

- [ ] **Step 9.4: Run to verify pass, full suite, commit**

Run: `npx vitest run src/Register.test.jsx` → all pass. `npx vitest run` → all pass.

```bash
git add src/Register.jsx src/Register.test.jsx
git commit -m "feat(redesign): / focuses register search (guarded for typing + dialogs)"
```

---

## Task 10: TransactionRow dress — category wells + chips

**Files:**
- Modify: `src/TransactionRow.jsx` (CategoryCell only)
- Modify: `src/TransactionRow.test.jsx` (one structural assertion)
- Modify: `src/App.css` (chip styles)
- Modify: `src/finishes.css` (chip finish dress)

Visible texts are preserved (`N split lines` is asserted in TransactionRow.test.jsx and TransactionEditor.test.jsx — re-dress only).

- [ ] **Step 10.1: Write the failing test** (append inside the main describe of `src/TransactionRow.test.jsx`; reuse the file's existing render helpers/fixtures style — wrap in `<table><tbody>` like its other tests)

```jsx
  it('wraps the category icon in an icon well', () => {
    const cats = new Map([['c1', { id: 'c1', name: 'Groceries', icon: '🛒' }]]);
    const row = { id: 't1', date: '2026-06-10', description: 'Costco', categoryId: 'c1', amount: -10, balance: 90 };
    const { container } = render(
      <table><tbody><TransactionRow layout="compact" row={row} categoriesById={cats} onEdit={() => {}} /></tbody></table>
    );
    expect(container.querySelector('.txn-cat .icon-well')).toBeTruthy();
  });
```

- [ ] **Step 10.2: Run to verify failure**

Run: `npx vitest run src/TransactionRow.test.jsx` → Expected: new test FAILS.

- [ ] **Step 10.3: Implement** — in `src/TransactionRow.jsx` replace `CategoryCell`:

```jsx
function CategoryCell({ categoriesById, categoryId }) {
  const cat = categoriesById && categoriesById.get(categoryId);
  if (!cat) return <span className="txn-cat txn-cat-none">—</span>;
  return (
    <span className="txn-cat">
      <span className="icon-well icon-well-sm"><Icon value={cat.icon} className="txn-cat-icon" /></span> {cat.name}
    </span>
  );
}
```

- [ ] **Step 10.4: Chip CSS** — in `src/App.css` (replacing old `.txn-cat`/`.txn-transfer` ad-hoc rules where they exist; keep `.txn-transfer--liability` etc. semantic tints):

```css
.txn-cat { display: inline-flex; align-items: center; gap: 7px; font-size: 11.5px; color: var(--text-muted); }
.txn-cat-none { color: var(--text-dim); }
.split-chevron {
  background: none; border: 1px solid var(--blue-border); border-radius: 4px;
  color: var(--blue); background: var(--blue-dim);
  font-family: var(--font-mono); font-size: 9.5px; padding: 1.5px 6px; cursor: pointer; margin-left: 7px;
}
.txn-transfer { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.05rem 0.45rem; border-radius: 4px; border: 1px solid transparent; color: var(--accent); }
```

And in `src/finishes.css`:

```css
/* ---- Category / transfer chips ---- */
.app-root[data-finish="instrument"] .txn-cat {
  background: color-mix(in srgb, var(--text) 4%, transparent);
  border: 1px solid var(--border); border-radius: 4px; padding: 2.5px 8px; font-size: 11px;
}
.app-root[data-finish="instrument"] .txn-cat .icon-well { width: auto; height: auto; border: none; background: none; border-radius: 0; font-size: 11px; }
.app-root[data-finish="instrument"] .txn-transfer {
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}
```

- [ ] **Step 10.5: Run full suite, visual check, commit**

Run: `npx vitest run` → Expected: all pass (incl. TransactionEditor split-lines texts untouched).

```bash
git add src/TransactionRow.jsx src/TransactionRow.test.jsx src/App.css src/finishes.css
git commit -m "feat(redesign): category icon wells + finish-dressed chips in the register"
```

---

## Task 11: Finish picker in Appearance → Theme tab

**Files:**
- Modify: `src/ThemeTab.jsx`
- Modify: `src/ThemeTab.test.jsx`
- Modify: `src/App.css` (picker cards)

- [ ] **Step 11.1: Update + write tests in `src/ThemeTab.test.jsx`**

Add `within` to the testing-library import. Extend `stub()`:

```jsx
function stub(overrides = {}) {
  return {
    themeId: 'nocturne', customTheme: null, finish: 'bullion',
    setTheme: vi.fn(), updateCustom: vi.fn(), resetCustomToPreset: vi.fn(), setFinish: vi.fn(),
    ...overrides,
  };
}
```

Scope the six-presets assertion (the finish picker adds 2 more radios to the page):

```jsx
  it('renders a swatch for each of the six presets', () => {
    render(<ThemeTab appearance={stub()} />);
    const group = screen.getByRole('radiogroup', { name: /preset themes/i });
    expect(within(group).getAllByRole('radio')).toHaveLength(6);
  });
```

Append:

```jsx
  it('renders a finish picker with bullion selected by default', () => {
    render(<ThemeTab appearance={stub()} />);
    const group = screen.getByRole('radiogroup', { name: /finish/i });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(within(group).getByRole('radio', { name: /bullion/i }).getAttribute('aria-checked')).toBe('true');
  });

  it('selecting a finish calls setFinish', () => {
    const a = stub();
    render(<ThemeTab appearance={a} />);
    fireEvent.click(screen.getByRole('radio', { name: /instrument/i }));
    expect(a.setFinish).toHaveBeenCalledWith('instrument');
  });

  it('reflects the active finish', () => {
    render(<ThemeTab appearance={stub({ finish: 'instrument' })} />);
    expect(screen.getByRole('radio', { name: /instrument/i }).getAttribute('aria-checked')).toBe('true');
  });
```

- [ ] **Step 11.2: Run to verify failure**

Run: `npx vitest run src/ThemeTab.test.jsx` → Expected: new tests FAIL (no finish radiogroup).

- [ ] **Step 11.3: Implement in `src/ThemeTab.jsx`**

Extend the destructure:

```jsx
  const { themeId, customTheme, setTheme, updateCustom, resetCustomToPreset, finish = 'bullion', setFinish = () => {} } = appearance;
```

Add above the "Preset themes" label:

```jsx
      <div className="appearance-label">Finish — the form of the interface</div>
      <div className="finish-cards" role="radiogroup" aria-label="Finish">
        {[
          { id: 'bullion', name: 'Bullion', desc: 'Heirloom ledger — serif, coins, double rules' },
          { id: 'instrument', name: 'Instrument', desc: 'Precision terminal — mono, flat, dense' },
        ].map(f => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={finish === f.id}
            aria-label={f.name}
            className={`finish-card${finish === f.id ? ' selected' : ''}`}
            onClick={() => setFinish(f.id)}
          >
            <span className={`finish-thumb finish-thumb-${f.id}`} aria-hidden="true" />
            <span className="finish-card-name">{f.name}</span>
            <span className="finish-card-desc">{f.desc}</span>
          </button>
        ))}
      </div>
```

- [ ] **Step 11.4: Picker CSS** (append to the Appearance section of `src/App.css`)

```css
/* ---- Finish picker ---- */
.finish-cards { display: grid; grid-template-columns: repeat(2, minmax(180px, 260px)); gap: 12px; margin-bottom: 22px; }
.finish-card {
  display: flex; flex-direction: column; gap: 6px; align-items: flex-start;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
  padding: 12px 14px; cursor: pointer; color: var(--text); font: inherit; text-align: left;
  transition: border-color var(--transition);
}
.finish-card:hover { border-color: var(--border-strong); }
.finish-card.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.finish-card-name { font-weight: 600; font-size: 13px; }
.finish-card-desc { font-size: 11px; color: var(--text-muted); }
.finish-thumb { width: 100%; height: 44px; border-radius: 6px; border: 1px solid var(--border); position: relative; overflow: hidden; }
/* mini wireframes: a serif sheet vs a flat rail */
.finish-thumb-bullion::before {
  content: ''; position: absolute; inset: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); border-radius: 5px;
}
.finish-thumb-bullion::after {
  content: ''; position: absolute; left: 18px; right: 18px; top: 50%;
  border-bottom: 3px double color-mix(in srgb, var(--accent) 50%, transparent);
}
.finish-thumb-instrument::before {
  content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 26%;
  background: color-mix(in srgb, var(--text) 5%, transparent);
  border-right: 1px solid var(--border-strong);
}
.finish-thumb-instrument::after {
  content: ''; position: absolute; left: 34%; right: 10px; top: 12px; height: 2px;
  background: var(--accent);
  box-shadow: 0 9px 0 0 var(--border-strong), 0 18px 0 0 var(--border-strong);
}
```

- [ ] **Step 11.5: Run to verify pass, full suite, commit**

Run: `npx vitest run src/ThemeTab.test.jsx` → all pass. `npx vitest run` → all pass.
Visual: Appearance → Theme — flip finishes live; confirm Undo reverts a flip.

```bash
git add src/ThemeTab.jsx src/ThemeTab.test.jsx src/App.css
git commit -m "feat(redesign): finish picker (Bullion/Instrument) in Appearance > Theme"
```

---

## Task 12: Global dress — buttons, primary stamp, empty state, glow, dead-CSS cleanup

**Files:**
- Modify: `src/App.css` (buttons, empty state, glow, deletions)
- Modify: `src/finishes.css` (primary button per finish)
- Modify: `src/App.jsx` (empty-state glyph)

- [ ] **Step 12.1: Restyle buttons in `src/App.css`** — replace the `.btn` and `.btn-primary` blocks (keep `.btn-undo`, `.btn-add`, `.btn-danger`, `.btn-delete` semantic variants as-is, they sit on the new base):

```css
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  font-family: var(--font-ui); font-size: 12px; font-weight: 500;
  height: 33px; padding: 0 13px;
  border-radius: 7px; border: 1px solid var(--border-strong);
  background: transparent; color: var(--text-muted);
  cursor: pointer; transition: all var(--transition);
  white-space: nowrap; letter-spacing: 0.01em; line-height: 1;
}
.btn:hover { color: var(--text); border-color: color-mix(in srgb, var(--text) 20%, transparent); background: color-mix(in srgb, var(--text) 3%, transparent); }
.btn:disabled { opacity: 0.32; cursor: not-allowed; }
.btn:disabled:hover { background: transparent; color: var(--text-muted); border-color: var(--border-strong); }
.btn-icon { padding: 0 10px; }

.btn-primary {
  background: var(--accent);
  border: none;
  color: #16110a;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.btn-primary:hover { filter: brightness(1.08); color: #16110a; border-color: transparent; }
.btn-paired { color: var(--green); border-color: var(--green-border); background: var(--green-dim); }
```

And the per-finish stamp in `src/finishes.css`:

```css
/* ---- Primary button ---- */
.app-root[data-finish="bullion"] .btn-primary {
  background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 86%, white) 0%, color-mix(in srgb, var(--accent) 86%, black) 100%);
  box-shadow: 0 1px 8px color-mix(in srgb, var(--accent) 25%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
.app-root[data-finish="instrument"] .btn-primary { border-radius: 6px; }
```

- [ ] **Step 12.2: Empty state + glow** — in `src/App.jsx` replace the `◈` glyph:

```jsx
                <div className="empty-glyph"><TallyMark size={40} /></div>
```

In `src/App.css` update `.app-bg-gradient` to derive from the accent and gate it per finish (in finishes.css):

```css
.app-bg-gradient {
  position: fixed; top: 0; left: 0; right: 0; height: 600px;
  background: radial-gradient(ellipse 60% 280px at 50% -40px, color-mix(in srgb, var(--accent) 7%, transparent) 0%, transparent 70%);
  pointer-events: none; z-index: 0;
}
```

```css
/* finishes.css */
.app-root[data-finish="instrument"] .app-bg-gradient { display: none; }
```

- [ ] **Step 12.3: Dead-CSS sweep in `src/App.css`** — delete now-unused rules: `.brand-sub`, `.brand-title-accent`, `.brand-row`, old `.header-actions` padding rule under `/* ---- Header ---- */` (keep `.header` itself — sub-screens use it), and any leftover rules from the replaced ad-hoc block (`.household-*`, `.account-toolbar`). Search first to confirm zero remaining JSX references:

Run: `npx vitest run` after deleting, and grep to confirm:
`rg "brand-sub|brand-title-accent|brand-row|household-|account-toolbar" src/ --type-add 'jsx:*.jsx' -t jsx` → Expected: no matches in `.jsx` files.

- [ ] **Step 12.4: Full verify + visual matrix, commit**

Run: `npx vitest run` → all pass. `npm run build` → clean.
Visual: buttons across home + editors (open a transaction editor: Save = accent primary), empty state (delete-all-accounts case or fresh profile in a private window — do not touch real data).

```bash
git add src/App.css src/finishes.css src/App.jsx
git commit -m "feat(redesign): accent primary buttons, TallyMark empty state, finish-gated glow, dead CSS sweep"
```

---

## Task 13: Final verification gate

- [ ] **Step 13.1: Full suite + build**

Run: `npx vitest run` → Expected: ~850+ tests, 0 failures.
Run: `npm run build` → Expected: clean.

- [ ] **Step 13.2: Visual matrix on `npm run dev`** (user checkpoint — invite review)

| Check | Bullion | Instrument |
|---|---|---|
| Nocturne theme | sheet, coins, serif figure, ink debits | rail, squares, chips, red debits |
| Parchment theme | paper statement (light) | paper terminal (light) |
| Background photo on | frost on sheet + readability | frost on rail |
| Theme accent change (custom red) | rules/coins re-ink | underline/chips re-ink |
| Undo | finish flip reverts | theme + finish both revert |
| `/`, sort, search, month filter, splits expand, transfer jump | works | works |
| Reduced motion (devtools emulation) | no cross-fade | no cross-fade |

- [ ] **Step 13.3: Update memory + offer branch finishing** (merge/PR via superpowers:finishing-a-development-branch)

---

## Self-review checklist (done at write time)

- **Spec coverage:** fonts §4.1→T1; brand §3→T2/T6; finish plumbing §5→T3/T5; delta §6.2→T4/T7; top bar+avatar+drawer §6.1→T6; sidebar §6.2→T7; register §6.3→T8; `/` §6.3→T9; chips/wells §6.3→T10; picker §6.4→T11; buttons §4.2 + glow + empty state→T12; tests §9→every task + T13.
- **Known test landmines addressed:** ThemeTab 6-radio count (scoped in T11), `split lines` texts (preserved, T10), AvatarDrawer class-only assertions (CSS-only move, T6), Register aria-labels `Add transaction`/`Transfer`/`Owed` (preserved, T8).
- **Type consistency:** `monthToDateDelta(accounts, transactions, typesById, now)` used identically in T4/T7; `setFinish(id)` in T3/T5/T11; `data-finish` attribute name everywhere; `--debit-color`/`--well-radius`/`--well-border` defined T1, set per finish T5, consumed T6–T10.
