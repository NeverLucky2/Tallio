# Appearance Phase 1 — Theming Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new Appearance screen with 6 selectable preset themes and a single custom theme (6 essential colors, live preview, readability guard), all applied at runtime via CSS variables.

**Architecture:** Themes are plain data (6 "essential" colors per preset). A pure `deriveTheme()` expands essentials into the full CSS-variable token set the app already consumes; presets may carry explicit `overrides` (Nocturne overrides every hand-tuned token so it stays pixel-identical). A `useAppearance` hook persists choice to `localStorage` and writes the resolved tokens onto `document.documentElement`, so the whole app re-themes instantly. A new `AppearanceScreen` (Theme tab live; Background/Image-Icons tabs are placeholders filled by Phases 2–3) is opened from a header palette button.

**Tech Stack:** React 19, Vite, Vitest + @testing-library/react (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-03-appearance-and-backgrounds-design.md` (Phase 1 section).

---

## File Structure

- **Create `src/themes.js`** — color math helpers, `deriveTheme()`, `PRESETS`, `essentialsForTheme()`. One responsibility: turn a theme choice into a CSS-variable token map. Pure, no React.
- **Create `src/themes.test.js`** — unit tests for the above.
- **Create `src/useAppearance.js`** — the persisted appearance store + `applyTheme` side effect. Mirrors `src/useSettings.js`.
- **Create `src/useAppearance.test.jsx`** — hook tests (renderHook).
- **Create `src/ThemeTab.jsx`** — the Theme tab UI (preset swatches, custom editor, reset, contrast warning). Pure presentational; takes the `useAppearance` return as a prop.
- **Create `src/ThemeTab.test.jsx`** — component tests.
- **Create `src/AppearanceScreen.jsx`** — tab shell hosting `ThemeTab` + placeholder Background/Image-Icons panes.
- **Create `src/AppearanceScreen.test.jsx`** — tab-switching tests.
- **Modify `src/App.jsx`** — import + call `useAppearance`, add header palette button, render the screen on `screen === 'appearance'`.
- **Modify `src/App.css`** — add `--surface-alpha`/`--surface-blur` defaults (consumed in Phase 2) and styles for the appearance screen, tabs, swatches, and color editor.

**Token vocabulary** (the full set `deriveTheme` must output, matching today's `:root` in `App.css`):
`--bg, --bg-raised, --bg-card, --bg-card-hover, --bg-input, --border, --border-strong, --border-focus, --text, --text-muted, --text-dim, --accent, --accent-dim, --accent-border, --green, --green-dim, --green-border, --red, --red-dim, --red-border, --blue, --blue-dim, --blue-border, --purple, --purple-dim, --purple-border`.
The 6 **essentials** map: `bg→--bg`, `surface→--bg-card`, `text→--text`, `accent→--accent`, `income→--green`, `expense→--red`. `--blue`/`--purple` (+ their `-dim`/`-border`) are fixed brand constants shared by all themes. Everything else is derived (or overridden).

---

## Task 1: Color math helpers

**Files:**
- Create: `src/themes.js`
- Test: `src/themes.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/themes.test.js
import { describe, it, expect } from 'vitest';
import { hexToRgb, mix, alpha, relativeLuminance, contrastRatio } from './themes.js';

describe('color helpers', () => {
  it('parses hex to rgb', () => {
    expect(hexToRgb('#ede9e0')).toEqual({ r: 237, g: 233, b: 224 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('mixes two hex colors and returns hex', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('produces an rgba() string with alpha', () => {
    expect(alpha('#d4a853', 0.12)).toBe('rgba(212, 168, 83, 0.12)');
  });

  it('computes WCAG contrast ratio', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 1);
  });

  it('orders luminance light > dark', () => {
    expect(relativeLuminance('#ffffff')).toBeGreaterThan(relativeLuminance('#000000'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/themes.test.js`
Expected: FAIL — `does not provide an export named 'hexToRgb'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/themes.js

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function toHex(n) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

export function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return `#${toHex(a.r + (b.r - a.r) * t)}${toHex(a.g + (b.g - a.g) * t)}${toHex(a.b + (b.b - a.b) * t)}`;
}

export function alpha(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(hexA, hexB) {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/themes.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/themes.js src/themes.test.js
git commit -m "feat(appearance): color math helpers for theming"
```

---

## Task 2: deriveTheme()

**Files:**
- Modify: `src/themes.js`
- Test: `src/themes.test.js`

- [ ] **Step 1: Write the failing test**

```js
// add to src/themes.test.js
import { deriveTheme } from './themes.js';

const ESSENTIALS = { bg: '#09090f', surface: '#13161f', text: '#ede9e0', accent: '#d4a853', income: '#3ddba0', expense: '#e06c6c' };

const REQUIRED_TOKENS = [
  '--bg','--bg-raised','--bg-card','--bg-card-hover','--bg-input',
  '--border','--border-strong','--border-focus',
  '--text','--text-muted','--text-dim',
  '--accent','--accent-dim','--accent-border',
  '--green','--green-dim','--green-border',
  '--red','--red-dim','--red-border',
  '--blue','--blue-dim','--blue-border',
  '--purple','--purple-dim','--purple-border',
];

describe('deriveTheme', () => {
  it('produces every required token', () => {
    const t = deriveTheme(ESSENTIALS);
    for (const key of REQUIRED_TOKENS) expect(t[key], key).toBeDefined();
  });

  it('maps the essentials directly', () => {
    const t = deriveTheme(ESSENTIALS);
    expect(t['--bg']).toBe('#09090f');
    expect(t['--bg-card']).toBe('#13161f');
    expect(t['--text']).toBe('#ede9e0');
    expect(t['--accent']).toBe('#d4a853');
    expect(t['--green']).toBe('#3ddba0');
    expect(t['--red']).toBe('#e06c6c');
  });

  it('derives alpha tints from essentials', () => {
    const t = deriveTheme(ESSENTIALS);
    expect(t['--accent-dim']).toBe('rgba(212, 168, 83, 0.12)');
    expect(t['--accent-border']).toBe('rgba(212, 168, 83, 0.28)');
  });

  it('keeps blue/purple as fixed brand constants', () => {
    const t = deriveTheme(ESSENTIALS);
    expect(t['--blue']).toBe('#5b8dff');
    expect(t['--purple']).toBe('#a47dea');
  });

  it('derives hover toward text (direction-correct for light AND dark)', () => {
    const dark = deriveTheme(ESSENTIALS);
    // dark theme: text is light, so hover surface is LIGHTER than surface
    expect(relativeLuminance(dark['--bg-card-hover'])).toBeGreaterThan(relativeLuminance(dark['--bg-card']));
    const light = deriveTheme({ bg: '#f4ecd8', surface: '#fffdf6', text: '#3a3225', accent: '#b8862b', income: '#2e8b57', expense: '#b23b3b' });
    // light theme: text is dark, so hover surface is DARKER than surface
    expect(relativeLuminance(light['--bg-card-hover'])).toBeLessThan(relativeLuminance(light['--bg-card']));
  });

  it('lets overrides win', () => {
    const t = deriveTheme(ESSENTIALS, { '--text-muted': '#6a7896' });
    expect(t['--text-muted']).toBe('#6a7896');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/themes.test.js`
Expected: FAIL — `does not provide an export named 'deriveTheme'`.

- [ ] **Step 3: Write minimal implementation**

```js
// add to src/themes.js

// Fixed brand secondary colors, shared by every theme unless overridden.
const BRAND = {
  '--blue': '#5b8dff',
  '--blue-dim': 'rgba(91, 141, 255, 0.13)',
  '--blue-border': 'rgba(91, 141, 255, 0.25)',
  '--purple': '#a47dea',
  '--purple-dim': 'rgba(164, 125, 234, 0.1)',
  '--purple-border': 'rgba(164, 125, 234, 0.22)',
};

export function deriveTheme(essentials, overrides = {}) {
  const { bg, surface, text, accent, income, expense } = essentials;
  const base = {
    '--bg': bg,
    '--bg-raised': mix(bg, surface, 0.5),
    '--bg-card': surface,
    '--bg-card-hover': mix(surface, text, 0.06),
    '--bg-input': mix(bg, surface, 0.3),
    '--border': alpha(text, 0.055),
    '--border-strong': alpha(text, 0.1),
    '--border-focus': alpha(accent, 0.45),
    '--text': text,
    '--text-muted': mix(text, bg, 0.45),
    '--text-dim': mix(text, bg, 0.72),
    '--accent': accent,
    '--accent-dim': alpha(accent, 0.12),
    '--accent-border': alpha(accent, 0.28),
    '--green': income,
    '--green-dim': alpha(income, 0.1),
    '--green-border': alpha(income, 0.22),
    '--red': expense,
    '--red-dim': alpha(expense, 0.1),
    '--red-border': alpha(expense, 0.25),
    ...BRAND,
  };
  return { ...base, ...overrides };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/themes.test.js`
Expected: PASS (all `deriveTheme` tests + Task 1 tests).

- [ ] **Step 5: Commit**

```bash
git add src/themes.js src/themes.test.js
git commit -m "feat(appearance): deriveTheme expands essentials to full token set"
```

---

## Task 3: PRESETS + Nocturne pixel-identity

**Files:**
- Modify: `src/themes.js`
- Test: `src/themes.test.js`

- [ ] **Step 1: Write the failing test**

```js
// add to src/themes.test.js
import { PRESETS, essentialsForTheme } from './themes.js';

describe('PRESETS', () => {
  it('ships exactly the six expected presets', () => {
    expect(PRESETS.map(p => p.id)).toEqual(['nocturne','parchment','slate','forest','twilight','graphite']);
  });

  it('every preset has 6 essentials and a name', () => {
    for (const p of PRESETS) {
      expect(p.name, p.id).toBeTruthy();
      expect(Object.keys(p.essentials).sort()).toEqual(['accent','bg','expense','income','surface','text']);
    }
  });

  it('Nocturne reproduces the current :root palette exactly', () => {
    const nocturne = PRESETS.find(p => p.id === 'nocturne');
    const t = deriveTheme(nocturne.essentials, nocturne.overrides);
    expect(t).toEqual({
      '--bg': '#09090f',
      '--bg-raised': '#0f1118',
      '--bg-card': '#13161f',
      '--bg-card-hover': '#161b28',
      '--bg-input': '#0b0e16',
      '--border': 'rgba(255, 255, 255, 0.055)',
      '--border-strong': 'rgba(255, 255, 255, 0.1)',
      '--border-focus': 'rgba(212, 168, 83, 0.45)',
      '--text': '#ede9e0',
      '--text-muted': '#6a7896',
      '--text-dim': '#35415a',
      '--accent': '#d4a853',
      '--accent-dim': 'rgba(212, 168, 83, 0.12)',
      '--accent-border': 'rgba(212, 168, 83, 0.28)',
      '--green': '#3ddba0',
      '--green-dim': 'rgba(61, 219, 160, 0.1)',
      '--green-border': 'rgba(61, 219, 160, 0.22)',
      '--red': '#e06c6c',
      '--red-dim': 'rgba(224, 108, 108, 0.1)',
      '--red-border': 'rgba(224, 108, 108, 0.25)',
      '--blue': '#5b8dff',
      '--blue-dim': 'rgba(91, 141, 255, 0.13)',
      '--blue-border': 'rgba(91, 141, 255, 0.25)',
      '--purple': '#a47dea',
      '--purple-dim': 'rgba(164, 125, 234, 0.1)',
      '--purple-border': 'rgba(164, 125, 234, 0.22)',
    });
  });

  it('essentialsForTheme returns custom essentials for the custom id', () => {
    const custom = { bg: '#101010', surface: '#1a1a1a', text: '#eeeeee', accent: '#ff8800', income: '#33cc88', expense: '#dd5555' };
    expect(essentialsForTheme('custom', custom)).toEqual(custom);
    expect(essentialsForTheme('nocturne', null)).toEqual(PRESETS[0].essentials);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/themes.test.js`
Expected: FAIL — `does not provide an export named 'PRESETS'`.

- [ ] **Step 3: Write minimal implementation**

```js
// add to src/themes.js

export const PRESETS = [
  {
    id: 'nocturne', name: 'Nocturne', isLight: false,
    essentials: { bg: '#09090f', surface: '#13161f', text: '#ede9e0', accent: '#d4a853', income: '#3ddba0', expense: '#e06c6c' },
    // Nocturne is hand-tuned; override every derived token so it stays pixel-identical.
    overrides: {
      '--bg-raised': '#0f1118',
      '--bg-card-hover': '#161b28',
      '--bg-input': '#0b0e16',
      '--border': 'rgba(255, 255, 255, 0.055)',
      '--border-strong': 'rgba(255, 255, 255, 0.1)',
      '--border-focus': 'rgba(212, 168, 83, 0.45)',
      '--text-muted': '#6a7896',
      '--text-dim': '#35415a',
    },
  },
  {
    id: 'parchment', name: 'Parchment', isLight: true,
    essentials: { bg: '#f4ecd8', surface: '#fffdf6', text: '#3a3225', accent: '#b8862b', income: '#2e8b57', expense: '#b23b3b' },
    overrides: { '--border': 'rgba(58, 50, 37, 0.12)', '--border-strong': 'rgba(58, 50, 37, 0.2)' },
  },
  {
    id: 'slate', name: 'Slate', isLight: false,
    essentials: { bg: '#0e151c', surface: '#16212c', text: '#e3edf4', accent: '#46c7c7', income: '#54d6a6', expense: '#e87f7f' },
  },
  {
    id: 'forest', name: 'Forest', isLight: false,
    essentials: { bg: '#0b1410', surface: '#13201a', text: '#e4efe4', accent: '#5fd08a', income: '#5fd08a', expense: '#e08a7a' },
  },
  {
    id: 'twilight', name: 'Twilight', isLight: false,
    essentials: { bg: '#120e1a', surface: '#1d1729', text: '#ece6f4', accent: '#b48ce8', income: '#6fd9b0', expense: '#e587a8' },
  },
  {
    id: 'graphite', name: 'Graphite', isLight: false,
    essentials: { bg: '#141414', surface: '#1f1f1f', text: '#ededed', accent: '#c9c9c9', income: '#8fcf9f', expense: '#d09090' },
  },
];

export function essentialsForTheme(themeId, customTheme) {
  if (themeId === 'custom' && customTheme) return customTheme;
  const preset = PRESETS.find(p => p.id === themeId) || PRESETS[0];
  return preset.essentials;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/themes.test.js`
Expected: PASS. If the Nocturne identity test fails, adjust the override values to match the expected object (do NOT change the expected object — it is the current `:root`).

- [ ] **Step 5: Commit**

```bash
git add src/themes.js src/themes.test.js
git commit -m "feat(appearance): six theme presets with Nocturne pixel-identity"
```

---

## Task 4: useAppearance hook

**Files:**
- Create: `src/useAppearance.js`
- Test: `src/useAppearance.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// src/useAppearance.test.jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useAppearance from './useAppearance.js';

const read = (k) => document.documentElement.style.getPropertyValue(k);

describe('useAppearance', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('style');
  });

  it('defaults to nocturne and applies its accent to :root', () => {
    const { result } = renderHook(() => useAppearance());
    expect(result.current.themeId).toBe('nocturne');
    expect(read('--accent')).toBe('#d4a853');
  });

  it('setTheme switches preset, applies tokens, and persists', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.setTheme('parchment'));
    expect(result.current.themeId).toBe('parchment');
    expect(read('--bg')).toBe('#f4ecd8');
    expect(JSON.parse(window.localStorage.getItem('tallio-appearance')).themeId).toBe('parchment');
  });

  it('updateCustom switches to custom and applies the derived color live', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.updateCustom({ accent: '#ff0000' }));
    expect(result.current.themeId).toBe('custom');
    expect(read('--accent')).toBe('#ff0000');
    expect(read('--accent-dim')).toBe('rgba(255, 0, 0, 0.12)');
  });

  it('resetCustomToPreset clears the custom theme', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.updateCustom({ accent: '#ff0000' }));
    act(() => result.current.resetCustomToPreset('nocturne'));
    expect(result.current.themeId).toBe('nocturne');
    expect(result.current.customTheme).toBeNull();
    expect(read('--accent')).toBe('#d4a853');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/useAppearance.test.jsx`
Expected: FAIL — cannot find module `./useAppearance.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/useAppearance.js
import { useState, useCallback, useEffect } from 'react';
import { PRESETS, deriveTheme, essentialsForTheme } from './themes.js';

const STORAGE = 'tallio-appearance';

const DEFAULT_BACKGROUND = {
  base: 'solid', presetId: null, photoIds: [], photoGroup: null,
  mode: 'single', intervalSec: 30, intensity: 25, effects: { aurora: false, pulse: false },
};

function defaults() {
  return { themeId: 'nocturne', customTheme: null, background: { ...DEFAULT_BACKGROUND }, appIcons: {} };
}

function loadInitial() {
  if (typeof window === 'undefined') return defaults();
  try {
    const raw = window.localStorage.getItem(STORAGE);
    if (!raw) return defaults();
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    return defaults();
  }
}

function resolveTokens(state) {
  if (state.themeId === 'custom' && state.customTheme) {
    return deriveTheme(state.customTheme);
  }
  const preset = PRESETS.find(p => p.id === state.themeId) || PRESETS[0];
  return deriveTheme(preset.essentials, preset.overrides);
}

export default function useAppearance() {
  const [state, setState] = useState(loadInitial);

  // Apply the active theme to :root whenever it changes (free live preview).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const tokens = resolveTokens(state);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(tokens)) root.style.setProperty(k, v);
  }, [state.themeId, state.customTheme]);

  const persist = useCallback((next) => {
    try { window.localStorage.setItem(STORAGE, JSON.stringify(next)); } catch { /* ignore quota */ }
    return next;
  }, []);

  const setTheme = useCallback((id) => {
    setState(prev => persist({ ...prev, themeId: id }));
  }, [persist]);

  const updateCustom = useCallback((partial) => {
    setState(prev => {
      const base = prev.customTheme || essentialsForTheme(prev.themeId, null);
      return persist({ ...prev, themeId: 'custom', customTheme: { ...base, ...partial } });
    });
  }, [persist]);

  const resetCustomToPreset = useCallback((id) => {
    setState(prev => persist({ ...prev, themeId: id, customTheme: null }));
  }, [persist]);

  return {
    themeId: state.themeId,
    customTheme: state.customTheme,
    background: state.background,
    appIcons: state.appIcons,
    setTheme,
    updateCustom,
    resetCustomToPreset,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/useAppearance.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/useAppearance.js src/useAppearance.test.jsx
git commit -m "feat(appearance): useAppearance hook persists + applies theme to :root"
```

---

## Task 5: ThemeTab component

**Files:**
- Create: `src/ThemeTab.jsx`
- Test: `src/ThemeTab.test.jsx`

The component takes `appearance` (the `useAppearance` return) as a prop so it is trivially testable with a stub.

- [ ] **Step 1: Write the failing test**

```jsx
// src/ThemeTab.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeTab from './ThemeTab.jsx';

function stub(overrides = {}) {
  return {
    themeId: 'nocturne', customTheme: null,
    setTheme: vi.fn(), updateCustom: vi.fn(), resetCustomToPreset: vi.fn(),
    ...overrides,
  };
}

describe('ThemeTab', () => {
  it('renders a swatch for each of the six presets', () => {
    render(<ThemeTab appearance={stub()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(6);
  });

  it('selecting a preset calls setTheme', () => {
    const a = stub();
    render(<ThemeTab appearance={a} />);
    fireEvent.click(screen.getByRole('radio', { name: /parchment/i }));
    expect(a.setTheme).toHaveBeenCalledWith('parchment');
  });

  it('editing a color calls updateCustom with that channel', () => {
    const a = stub();
    render(<ThemeTab appearance={a} />);
    fireEvent.input(screen.getByLabelText(/accent/i), { target: { value: '#ff0000' } });
    expect(a.updateCustom).toHaveBeenCalledWith({ accent: '#ff0000' });
  });

  it('reset calls resetCustomToPreset with the active preset', () => {
    const a = stub({ themeId: 'custom', customTheme: { bg: '#000000', surface: '#111111', text: '#ffffff', accent: '#d4a853', income: '#3ddba0', expense: '#e06c6c' } });
    render(<ThemeTab appearance={a} />);
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(a.resetCustomToPreset).toHaveBeenCalled();
  });

  it('warns when custom text/background contrast is too low', () => {
    const a = stub({ themeId: 'custom', customTheme: { bg: '#ffffff', surface: '#ffffff', text: '#f2f2f2', accent: '#d4a853', income: '#3ddba0', expense: '#e06c6c' } });
    render(<ThemeTab appearance={a} />);
    expect(screen.getByText(/hard to read/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ThemeTab.test.jsx`
Expected: FAIL — cannot find module `./ThemeTab.jsx`.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/ThemeTab.jsx
import React from 'react';
import { PRESETS, essentialsForTheme, contrastRatio } from './themes.js';

const CHANNELS = [
  { key: 'bg', label: 'Background' },
  { key: 'surface', label: 'Card surface' },
  { key: 'text', label: 'Text' },
  { key: 'accent', label: 'Accent' },
  { key: 'income', label: 'Income (green)' },
  { key: 'expense', label: 'Expense (red)' },
];

const MIN_CONTRAST = 4.5;

export default function ThemeTab({ appearance }) {
  const { themeId, customTheme, setTheme, updateCustom, resetCustomToPreset } = appearance;
  const essentials = essentialsForTheme(themeId, customTheme);
  const isCustom = themeId === 'custom';
  const sourcePreset = isCustom ? PRESETS[0].id : themeId;

  const lowText = contrastRatio(essentials.text, essentials.bg) < MIN_CONTRAST;
  const lowSurface = contrastRatio(essentials.text, essentials.surface) < MIN_CONTRAST;

  return (
    <div className="theme-tab">
      <div className="appearance-label">Preset themes</div>
      <div className="theme-swatches" role="radiogroup" aria-label="Preset themes">
        {PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={themeId === p.id}
            aria-label={p.name}
            className={`theme-swatch${themeId === p.id ? ' selected' : ''}`}
            style={{ background: p.essentials.bg, color: p.essentials.text }}
            onClick={() => setTheme(p.id)}
          >
            <span className="theme-swatch-dot" style={{ background: p.essentials.accent }} />
            {p.name}
          </button>
        ))}
      </div>

      <div className="appearance-label">My Theme — start from a preset, tweak</div>
      <div className="theme-editor">
        {CHANNELS.map(c => (
          <label key={c.key} className="theme-channel">
            <input
              type="color"
              aria-label={c.label}
              value={essentials[c.key]}
              onInput={(e) => updateCustom({ [c.key]: e.target.value })}
            />
            <span>{c.label}</span>
          </label>
        ))}
      </div>

      {(lowText || lowSurface) && (
        <p className="theme-warning" role="status">⚠ Hard to read here — text and background are low contrast.</p>
      )}

      <button type="button" className="btn" onClick={() => resetCustomToPreset(sourcePreset)}>
        Reset to preset
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ThemeTab.test.jsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ThemeTab.jsx src/ThemeTab.test.jsx
git commit -m "feat(appearance): ThemeTab — presets, custom editor, contrast guard"
```

---

## Task 6: AppearanceScreen shell

**Files:**
- Create: `src/AppearanceScreen.jsx`
- Test: `src/AppearanceScreen.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// src/AppearanceScreen.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppearanceScreen from './AppearanceScreen.jsx';

const appearance = {
  themeId: 'nocturne', customTheme: null,
  setTheme: vi.fn(), updateCustom: vi.fn(), resetCustomToPreset: vi.fn(),
};

describe('AppearanceScreen', () => {
  it('shows three tabs with Theme active by default', () => {
    render(<AppearanceScreen appearance={appearance} onClose={() => {}} />);
    expect(screen.getByRole('tab', { name: /theme/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('radiogroup', { name: /preset themes/i })).toBeInTheDocument();
  });

  it('switching to Background shows the phase-2 placeholder', () => {
    render(<AppearanceScreen appearance={appearance} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /background/i }));
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('Done calls onClose', () => {
    const onClose = vi.fn();
    render(<AppearanceScreen appearance={appearance} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/AppearanceScreen.test.jsx`
Expected: FAIL — cannot find module `./AppearanceScreen.jsx`.

- [ ] **Step 3: Write minimal implementation**

```jsx
// src/AppearanceScreen.jsx
import React, { useState } from 'react';
import ThemeTab from './ThemeTab.jsx';

const TABS = [
  { id: 'theme', label: 'Theme' },
  { id: 'bg', label: 'Background' },
  { id: 'icons', label: 'Image Icons' },
];

export default function AppearanceScreen({ appearance, onClose }) {
  const [tab, setTab] = useState('theme');
  return (
    <div className="container appearance-screen">
      <div className="header">
        <h1 className="title">✦ Appearance</h1>
        <div className="header-actions">
          <button type="button" className="btn" onClick={onClose}>Done</button>
        </div>
      </div>

      <div className="appearance-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`appearance-tab${tab === t.id ? ' on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="appearance-body">
        {tab === 'theme' && <ThemeTab appearance={appearance} />}
        {tab === 'bg' && <p className="appearance-placeholder">Backgrounds — coming soon (Phase 2).</p>}
        {tab === 'icons' && <p className="appearance-placeholder">Image icons — coming soon (Phase 3).</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/AppearanceScreen.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/AppearanceScreen.jsx src/AppearanceScreen.test.jsx
git commit -m "feat(appearance): AppearanceScreen tab shell with Theme tab"
```

---

## Task 7: Wire into App + styles

**Files:**
- Modify: `src/App.jsx` (imports near `:1-25`; `useSettings()` call site `:167`; screen render block near `:371`; header actions `:450-454`)
- Modify: `src/App.css` (`:root` block near `:54`; append new styles)

- [ ] **Step 1: Import the hook and screen in `src/App.jsx`**

Add after the existing `import SettingsPanel ...` line (`:6`):

```jsx
import useAppearance from './useAppearance.js';
import AppearanceScreen from './AppearanceScreen.jsx';
```

- [ ] **Step 2: Call the hook**

After `const settings = useSettings();` (`:167`), add:

```jsx
  const appearance = useAppearance();
```

- [ ] **Step 3: Render the screen**

Immediately before the `{showSettings && <SettingsPanel ... />}` line (`:392`), add:

```jsx
      {screen === 'appearance' && (
        <AppearanceScreen appearance={appearance} onClose={() => setScreen('main')} />
      )}
```

- [ ] **Step 4: Add the header palette button**

In the `header-actions` block (`:450`), add immediately after the Settings `⚙` button:

```jsx
            <button type="button" onClick={() => setScreen('appearance')} className="btn-icon" aria-label="Appearance">🎨</button>
```

- [ ] **Step 5: Add CSS variable defaults + appearance styles in `src/App.css`**

Inside the `:root { … }` block (after `--ui-scale: 1.1;` near `:55`), add:

```css
  /* Background readability knobs — driven by the Appearance intensity slider (Phase 2). */
  --surface-alpha: 1;
  --surface-blur: 0px;
```

Then append at the end of `src/App.css`:

```css
/* ---- Appearance screen ---- */
.appearance-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 22px; }
.appearance-tab { background: none; border: none; color: var(--text-muted); font-family: var(--font-ui);
  font-size: 13px; padding: 9px 15px; cursor: pointer; border-bottom: 2px solid transparent; }
.appearance-tab.on { color: var(--text); border-bottom-color: var(--accent); }
.appearance-label { font-size: 10px; text-transform: uppercase; letter-spacing: .08em;
  color: var(--text-muted); margin: 6px 0 11px; }
.theme-swatches { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 26px; }
.theme-swatch { position: relative; width: 116px; height: 60px; border-radius: var(--r-md);
  border: 2px solid var(--border); cursor: pointer; font-family: var(--font-ui); font-size: 12px;
  text-align: left; padding: 8px 10px; }
.theme-swatch.selected { border-color: var(--accent); }
.theme-swatch-dot { position: absolute; right: 9px; bottom: 9px; width: 13px; height: 13px; border-radius: 50%; }
.theme-editor { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
.theme-channel { display: flex; flex-direction: column; align-items: center; gap: 6px;
  font-size: 10px; color: var(--text-muted); }
.theme-channel input[type=color] { width: 42px; height: 42px; border: 1px solid var(--border-strong);
  border-radius: var(--r-md); background: none; cursor: pointer; padding: 0; }
.theme-warning { color: var(--red); font-size: 12px; margin: 4px 0 14px; }
.appearance-placeholder { color: var(--text-muted); font-style: italic; padding: 30px 0; }
```

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all existing suites plus the four new files. No regressions.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, open the app:
1. A 🎨 button sits beside the ⚙ gear in the header → click it → the Appearance screen opens with three tabs.
2. The **Theme** tab shows 6 swatches; clicking **Parchment** instantly re-themes the whole app to the light palette; clicking **Nocturne** restores the original look exactly.
3. Editing a color in **My Theme** updates the app live; the contrast warning appears for a low-contrast pick; **Reset to preset** restores it.
4. Reload the page → the last-chosen theme persists.
5. **Background** and **Image Icons** tabs show "coming soon" placeholders.
6. **Done** returns to the main screen.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat(appearance): wire Appearance screen + palette button into App"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage (Phase 1):** preset themes (Task 3), custom 6-essential editor + live preview (Tasks 4–5), readability guard (Task 5), Appearance screen + header entry (Tasks 6–7), localStorage persistence (Task 4), `--surface-alpha`/`--surface-blur` seeded for Phase 2 (Task 7). Background/Image-Icons tabs are intentionally placeholders here.
- **Out of scope for Phase 1:** IndexedDB image store, backgrounds, `<Icon>` renderer, image library — these are Phases 2 and 3 (separate plans).
- **Type consistency:** the appearance object shape (`themeId, customTheme, background, appIcons, setTheme, updateCustom, resetCustomToPreset`) is identical across `useAppearance`, `ThemeTab`, and `AppearanceScreen`. `essentials` always has keys `bg, surface, text, accent, income, expense`. Token map keys always start with `--`.
```
