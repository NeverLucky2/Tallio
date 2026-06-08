# Avatar Left Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the (enlarged) header avatar open a left slide-in drawer hosting Appearance / Settings / Export, remove those three buttons from the header, and move the logo click-streak easter egg to the wordmark.

**Architecture:** A new presentational `AvatarDrawer.jsx` (+ own `AvatarDrawer.css`) renders a scrim + left panel when `open`, with a one-shot CSS slide-in (skipped under reduced motion). `App.jsx` owns the open state and passes the three actions as items; the avatar becomes the trigger and the wordmark carries the egg.

**Tech Stack:** React (hooks), Vite, Vitest + @testing-library/react (jsdom), CSS animation.

**Conventions (must follow):**
- Component tests: `import { render, cleanup } from '@testing-library/react'` + `afterEach(() => cleanup())`. **No jest-dom** — use `.toBeTruthy()`, `.toBeNull()`/`.not.toBeNull()`, `getAttribute`, `container.querySelector`.
- Run one file: `npx vitest run src/<File>.test.jsx`. Full: `npx vitest run`. Lint: `npx eslint <files>` (zero NEW errors). Build: `npm run build`.
- **Never `git add -A`** — stage only named files (`src/App.css` has an unrelated uncommitted WIP that must stay untouched; that's why new CSS is in its own file).
- Click handlers on non-interactive elements use a `<span role="presentation" onClick=…>` wrapper (the existing lint-clean pattern).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch: `avatar-menu` (already created off master, spec committed). Push after each task.

**File structure:**
- Create `src/AvatarDrawer.jsx` + `src/AvatarDrawer.css` + `src/AvatarDrawer.test.jsx`.
- Modify `src/App.jsx` (avatar trigger + drawer state/render, move egg to wordmark, remove three header buttons).

---

## Task 1: `AvatarDrawer` component + styles

**Files:** Create `src/AvatarDrawer.jsx`, `src/AvatarDrawer.css`, `src/AvatarDrawer.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import AvatarDrawer from './AvatarDrawer.jsx';

const mkItems = (calls) => [
  { icon: '🎨', label: 'Appearance', onSelect: () => calls.push('appearance') },
  { icon: '⚙', label: 'Settings', onSelect: () => calls.push('settings') },
  { icon: '↗', label: 'Export', onSelect: () => calls.push('export') },
];
afterEach(() => cleanup());

describe('AvatarDrawer', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<AvatarDrawer open={false} onClose={() => {}} items={mkItems([])} />);
    expect(container.querySelector('.avatar-drawer-panel')).toBeNull();
  });

  it('renders items + dialog role when open', () => {
    const { container, getByText } = render(
      <AvatarDrawer open={true} onClose={() => {}} items={mkItems([])} version="v1.2.3" reducedMotion={false} />,
    );
    const panel = container.querySelector('.avatar-drawer-panel');
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe('Account menu');
    expect(getByText('Appearance')).toBeTruthy();
    expect(getByText('Settings')).toBeTruthy();
    expect(getByText('Export')).toBeTruthy();
    expect(getByText('Tallio v1.2.3')).toBeTruthy();
  });

  it('selecting an item calls its handler then onClose', () => {
    const calls = [];
    let closed = 0;
    const { getByText } = render(<AvatarDrawer open={true} onClose={() => { closed += 1; }} items={mkItems(calls)} reducedMotion={false} />);
    fireEvent.click(getByText('Settings'));
    expect(calls).toEqual(['settings']);
    expect(closed).toBe(1);
  });

  it('scrim click closes', () => {
    let closed = 0;
    const { container } = render(<AvatarDrawer open={true} onClose={() => { closed += 1; }} items={mkItems([])} reducedMotion={false} />);
    fireEvent.click(container.querySelector('.avatar-drawer-scrim'));
    expect(closed).toBe(1);
  });

  it('Escape closes', () => {
    let closed = 0;
    render(<AvatarDrawer open={true} onClose={() => { closed += 1; }} items={mkItems([])} reducedMotion={false} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closed).toBe(1);
  });

  it('adds no-anim under reduced motion', () => {
    const { container } = render(<AvatarDrawer open={true} onClose={() => {}} items={mkItems([])} reducedMotion={true} />);
    expect(container.querySelector('.avatar-drawer-panel').className).toContain('no-anim');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/AvatarDrawer.test.jsx`
Expected: FAIL — cannot resolve `./AvatarDrawer.jsx`.

- [ ] **Step 3: Write minimal implementation**

Create `src/AvatarDrawer.jsx`:

```jsx
// src/AvatarDrawer.jsx
// Left slide-in account drawer: scrim + panel, opened over the avatar. Closes on
// scrim click, ×, Escape, or item select. Reduced motion skips the slide.
import React, { useEffect } from 'react';
import './AvatarDrawer.css';

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function AvatarDrawer({ open, onClose, items = [], version = '', reducedMotion }) {
  const rm = reducedMotion ?? prefersReducedMotion();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && onClose) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const select = (it) => { it.onSelect(); if (onClose) onClose(); };

  return (
    <div className="avatar-drawer-root">
      <div className="avatar-drawer-scrim" onClick={() => onClose && onClose()} role="presentation" />
      <div className={`avatar-drawer-panel${rm ? ' no-anim' : ''}`} role="dialog" aria-modal="true" aria-label="Account menu">
        <div className="avatar-drawer-head">
          <span className="avatar-drawer-glyph" aria-hidden="true">✦</span>
          <div className="avatar-drawer-id">
            <div className="avatar-drawer-title">Your Tallio</div>
            <div className="avatar-drawer-sub">Account</div>
          </div>
          <button type="button" className="avatar-drawer-close" aria-label="Close menu" onClick={() => onClose && onClose()}>×</button>
        </div>
        <nav className="avatar-drawer-items">
          {items.map((it) => (
            <button key={it.label} type="button" className="avatar-drawer-item" onClick={() => select(it)}>
              <span className="avatar-drawer-item-icon" aria-hidden="true">{it.icon}</span>
              <span>{it.label}</span>
            </button>
          ))}
        </nav>
        {version && <div className="avatar-drawer-version">Tallio {version}</div>}
      </div>
    </div>
  );
}
```

Create `src/AvatarDrawer.css`:

```css
/* Left account drawer + enlarged avatar trigger. */
.avatar-drawer-root { position: fixed; inset: 0; z-index: 1100; }
.avatar-drawer-scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, .45); }
.avatar-drawer-panel {
  position: absolute; top: 0; left: 0; height: 100%; width: 280px; max-width: 86vw;
  background: var(--bg-card, #161d2a); border-right: 1px solid var(--border, #2a3550);
  box-shadow: 12px 0 34px rgba(0, 0, 0, .5); padding: 16px;
  display: flex; flex-direction: column;
  animation: avatar-drawer-in .28s cubic-bezier(.2, .8, .2, 1);
}
@keyframes avatar-drawer-in { from { transform: translateX(-100%); } to { transform: translateX(0); } }
.avatar-drawer-panel.no-anim { animation: none; }

.avatar-drawer-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.avatar-drawer-glyph {
  width: 44px; height: 44px; border-radius: 50%; background: var(--bg-raised, #222c3e);
  display: flex; align-items: center; justify-content: center; font-size: 22px;
}
.avatar-drawer-title { font-weight: 700; }
.avatar-drawer-sub { color: var(--text-dim, #7a8699); font-size: 12px; }
.avatar-drawer-close { margin-left: auto; background: none; border: none; color: inherit; font-size: 20px; line-height: 1; cursor: pointer; opacity: .7; }
.avatar-drawer-close:hover { opacity: 1; }

.avatar-drawer-items { display: flex; flex-direction: column; gap: 2px; }
.avatar-drawer-item {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
  background: none; border: none; color: var(--text, #e8edf5);
  padding: 11px 10px; border-radius: 8px; cursor: pointer; font: inherit;
}
.avatar-drawer-item:hover { background: var(--bg-card-hover, #1b2433); }
.avatar-drawer-item-icon { font-size: 16px; width: 20px; text-align: center; }
.avatar-drawer-version { margin-top: auto; color: var(--text-faint, #5a6478); font-size: 11px; padding-top: 12px; }

/* Enlarged avatar trigger in the header (overrides App.css .header-avatar 1.4em). */
.avatar-trigger { background: none; border: none; padding: 0; cursor: pointer; display: inline-flex; }
.avatar-trigger .header-avatar { width: 2.2em; height: 2.2em; }

@media (prefers-reduced-motion: reduce) { .avatar-drawer-panel { animation: none; } }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/AvatarDrawer.test.jsx`
Expected: PASS.

- [ ] **Step 5: Lint & commit**

```bash
npx eslint src/AvatarDrawer.jsx src/AvatarDrawer.test.jsx
git add src/AvatarDrawer.jsx src/AvatarDrawer.css src/AvatarDrawer.test.jsx
git commit -m "feat(avatar-drawer): AvatarDrawer component (left slide-in, scrim/Escape close)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Task 2: Wire into App — trigger, drawer, egg move, button removal (manual-verify)

**Files:** Modify `src/App.jsx`

- [ ] **Step 1: Import AvatarDrawer**

After `import useEasterEggs from './useEasterEggs.js';` (and `import { printConsoleArt } ...`), add:

```jsx
import AvatarDrawer from './AvatarDrawer.jsx';
```

- [ ] **Step 2: Add drawer open state**

Immediately after `const eggs = useEasterEggs();`, add:

```jsx
  const [drawerOpen, setDrawerOpen] = useState(false);
```

- [ ] **Step 3: Turn the avatar into the trigger + move the egg to the wordmark**

Replace this block:

```jsx
            <span className="header-avatar-wrap" onClick={eggs.registerLogoClick} role="presentation">
              <Icon value={appearance.appIcons.headerAvatar} fallback="✦" className="header-avatar" title="Your avatar" />
            </span>
            <h1 className="brand-title">Tall<span className="brand-title-accent">io</span></h1>
```

with:

```jsx
            <button type="button" className="avatar-trigger" aria-label="Account menu" onClick={() => setDrawerOpen(true)}>
              <Icon value={appearance.appIcons.headerAvatar} fallback="✦" className="header-avatar" title="Your avatar" />
            </button>
            <h1 className="brand-title">
              <span role="presentation" onClick={eggs.registerLogoClick}>Tall<span className="brand-title-accent">io</span></span>
            </h1>
```

- [ ] **Step 4: Remove the three header buttons**

In `.header-actions`, delete these three lines:

```jsx
            <button onClick={() => openSettings()} className="btn-icon" aria-label="Settings">⚙</button>
            <button type="button" onClick={() => setScreen('appearance')} className="btn-icon" aria-label="Appearance">🎨</button>
```

and (further down in the same `.header-actions`):

```jsx
            <button onClick={exportData} className="btn">↗ Export</button>
```

- [ ] **Step 5: Render the drawer**

Immediately after the easter-egg `<CelebrationLayer celebration={eggs.reveal} ... />` element, add:

```jsx
      <AvatarDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        version={pkg.version}
        items={[
          { icon: '🎨', label: 'Appearance', onSelect: () => setScreen('appearance') },
          { icon: '⚙', label: 'Settings', onSelect: () => openSettings() },
          { icon: '↗', label: 'Export', onSelect: () => exportData() },
        ]}
      />
```

- [ ] **Step 6: Verify suite + lint + build**

Run: `npx vitest run`
Expected: PASS (full suite).

Run: `npx eslint src/App.jsx`
Expected: zero NEW errors (pre-existing camera-stream warning excepted).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Manual verify** (`npm run dev -- --port 5174 --strictPort`)

Confirm with the user: the enlarged avatar opens a left drawer over itself; Appearance / Settings / Export each open the right surface and close the drawer; scrim click + × + Escape close it; reduced motion skips the slide; the header no longer shows the 🎨 / ⚙ / Export buttons; the Konami code + console art still work; and **7 quick clicks on the "Tallio" wordmark** now fire the streak egg (the avatar no longer does).

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat(avatar-drawer): avatar opens left drawer; move egg to wordmark; drop 3 header buttons

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

---

## Self-review (completed)

**Spec coverage:** Enlarged avatar trigger + left slide-in over avatar → Tasks 1 (CSS `.avatar-trigger`, animation) + 2 (trigger). Scrim/×/Escape/select close → Task 1 tests + impl. Reduced-motion skip → Task 1 (`no-anim`/media query). Items Appearance/Settings/Export wired to `setScreen`/`openSettings`/`exportData` → Task 2 Step 5. Remove three header buttons → Task 2 Step 4. Move egg to wordmark → Task 2 Step 3. Version footer → Task 1. Own CSS file (App.css WIP untouched) → Task 1. Deferred embedded-settings intentionally absent.

**Placeholder scan:** none — complete code + exact commands throughout.

**Type consistency:** `AvatarDrawer` props `{ open, onClose, items:[{icon,label,onSelect}], version, reducedMotion }` identical across Task 1 impl/tests and Task 2 usage; CSS classes (`.avatar-drawer-panel`, `.avatar-drawer-scrim`, `.avatar-trigger`, `no-anim`) consistent between the component and tests; `pkg.version` already imported in App.jsx.
