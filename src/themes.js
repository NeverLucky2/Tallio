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
