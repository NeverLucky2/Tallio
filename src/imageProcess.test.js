// src/imageProcess.test.js
import { describe, it, expect } from 'vitest';
import { fitWithin, isHeic } from './imageProcess.js';

describe('fitWithin', () => {
  it('leaves dimensions under the cap unchanged', () => {
    expect(fitWithin(800, 600, 2560)).toEqual({ w: 800, h: 600 });
  });

  it('scales a wide image by its width', () => {
    expect(fitWithin(5120, 2560, 2560)).toEqual({ w: 2560, h: 1280 });
  });

  it('scales a tall image by its height', () => {
    expect(fitWithin(2560, 5120, 2560)).toEqual({ w: 1280, h: 2560 });
  });

  it('handles a square image at the cap', () => {
    expect(fitWithin(4000, 4000, 2000)).toEqual({ w: 2000, h: 2000 });
  });
});

describe('isHeic', () => {
  it('detects by MIME type', () => {
    expect(isHeic({ type: 'image/heic', name: '' })).toBe(true);
    expect(isHeic({ type: 'image/heif', name: '' })).toBe(true);
  });
  it('detects by extension when type is missing (iOS Files/Messages)', () => {
    expect(isHeic({ type: '', name: 'IMG_1234.HEIC' })).toBe(true);
    expect(isHeic({ type: '', name: 'photo.heif' })).toBe(true);
  });
  it('is false for regular images', () => {
    expect(isHeic({ type: 'image/jpeg', name: 'a.jpg' })).toBe(false);
    expect(isHeic({ type: 'image/png', name: 'b.png' })).toBe(false);
  });
  it('is false for nullish input', () => {
    expect(isHeic(null)).toBe(false);
    expect(isHeic(undefined)).toBe(false);
  });
});
