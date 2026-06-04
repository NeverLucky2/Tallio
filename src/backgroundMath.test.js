import { describe, it, expect } from 'vitest';
import { intensityToLayers, effectOpacity } from './backgroundMath.js';

describe('intensityToLayers', () => {
  it('at 0 (readable): heavy scrim, opaque solid surfaces', () => {
    expect(intensityToLayers(0)).toEqual({ scrimAlpha: 0.8, surfaceAlpha: 1, surfaceBlur: 0 });
  });

  it('at 100 (immersive): light scrim, transparent blurred surfaces', () => {
    expect(intensityToLayers(100)).toEqual({ scrimAlpha: 0.12, surfaceAlpha: 0, surfaceBlur: 10 });
  });

  it('clamps out-of-range input', () => {
    expect(intensityToLayers(150)).toEqual(intensityToLayers(100));
    expect(intensityToLayers(-20)).toEqual(intensityToLayers(0));
  });

  it('scrim decreases monotonically as intensity rises', () => {
    expect(intensityToLayers(25).scrimAlpha).toBeLessThan(intensityToLayers(0).scrimAlpha);
    expect(intensityToLayers(50).scrimAlpha).toBeLessThan(intensityToLayers(25).scrimAlpha);
  });
});

describe('effectOpacity', () => {
  it('maps 0..100 strength to a 0.15..1 opacity multiplier', () => {
    expect(effectOpacity(0)).toBe(0.15);
    expect(effectOpacity(100)).toBe(1);
    expect(effectOpacity(50)).toBe(0.575);
  });
  it('clamps out-of-range input', () => {
    expect(effectOpacity(-20)).toBe(0.15);
    expect(effectOpacity(200)).toBe(1);
    expect(effectOpacity(undefined)).toBe(0.575); // default 50
  });
});
