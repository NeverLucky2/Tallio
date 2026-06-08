import { describe, it, expect, afterEach } from 'vitest';
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
