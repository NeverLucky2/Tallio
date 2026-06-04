// src/imageColors.test.js
import { describe, it, expect } from 'vitest';
import { extractPalette, rgbToHex } from './imageColors.js';

// helper: build an RGBA Uint8ClampedArray from a list of [r,g,b,a] pixels
const px = (...pixels) => new Uint8ClampedArray(pixels.flat());

describe('rgbToHex', () => {
  it('formats and clamps channels to 2-digit hex', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    expect(rgbToHex(300, -5, 16)).toBe('#ff0010');
  });
});

describe('extractPalette', () => {
  it('returns the single dominant color for a solid image', () => {
    const pixels = px([255, 0, 0, 255], [255, 0, 0, 255], [255, 0, 0, 255], [255, 0, 0, 255]);
    expect(extractPalette(pixels)).toEqual(['#ff0000']);
  });

  it('orders colors by frequency (most common first)', () => {
    const pixels = px(
      [255, 0, 0, 255], [255, 0, 0, 255], [255, 0, 0, 255], // red x3
      [0, 0, 255, 255],                                     // blue x1
    );
    const out = extractPalette(pixels);
    expect(out[0]).toBe('#ff0000');
    expect(out[1]).toBe('#0000ff');
  });

  it('ignores near-transparent pixels', () => {
    const pixels = px([255, 0, 0, 255], [0, 0, 255, 10]);
    expect(extractPalette(pixels)).toEqual(['#ff0000']);
  });

  it('caps the result at the requested count', () => {
    const pixels = px(
      [10, 10, 10, 255], [80, 80, 80, 255], [140, 140, 140, 255],
      [200, 200, 200, 255], [250, 250, 250, 255], [40, 200, 40, 255],
    );
    expect(extractPalette(pixels, 3)).toHaveLength(3);
  });
});
