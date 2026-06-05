import { describe, it, expect } from 'vitest';
import { cropRect } from './iconCrop.js';

describe('cropRect', () => {
  it('centers the largest square at default framing', () => {
    expect(cropRect(400, 300, { posX: 50, posY: 50, zoom: 1 }))
      .toEqual({ sx: 50, sy: 0, sw: 300, sh: 300 });
  });

  it('shrinks and re-centers the window as zoom increases', () => {
    expect(cropRect(400, 300, { posX: 50, posY: 50, zoom: 2 }))
      .toEqual({ sx: 125, sy: 75, sw: 150, sh: 150 });
  });

  it('moves the window to an edge by focal point', () => {
    expect(cropRect(400, 300, { posX: 0, posY: 100, zoom: 1 }))
      .toEqual({ sx: 0, sy: 0, sw: 300, sh: 300 });
    expect(cropRect(400, 300, { posX: 100, posY: 50, zoom: 1 }))
      .toEqual({ sx: 100, sy: 0, sw: 300, sh: 300 });
  });

  it('clamps junk framing to centered/no-zoom defaults', () => {
    expect(cropRect(200, 200, {})).toEqual({ sx: 0, sy: 0, sw: 200, sh: 200 });
    expect(cropRect(200, 200, { posX: 999, posY: -5, zoom: 99 }).sw).toBeLessThan(200);
  });
});
