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
