import { describe, it, expect } from 'vitest';
import { intensityToLayers } from './backgroundMath.js';

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
