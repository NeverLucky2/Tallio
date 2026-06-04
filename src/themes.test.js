import { describe, it, expect } from 'vitest';
import { hexToRgb, mix, alpha, relativeLuminance, contrastRatio, deriveTheme } from './themes.js';

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
