// src/wallpapers.test.js
import { describe, it, expect } from 'vitest';
import { WALLPAPERS, getWallpaper } from './wallpapers.js';

describe('wallpapers', () => {
  it('exposes a non-empty curated set', () => {
    expect(WALLPAPERS.length).toBeGreaterThanOrEqual(3);
  });

  it('each wallpaper has id, name, css, and a palette', () => {
    for (const w of WALLPAPERS) {
      expect(typeof w.id).toBe('string');
      expect(typeof w.name).toBe('string');
      expect(w.css).toContain('gradient');
      expect(Array.isArray(w.palette)).toBe(true);
      expect(w.palette.length).toBeGreaterThan(0);
    }
  });

  it('getWallpaper finds by id and returns null for unknown', () => {
    expect(getWallpaper(WALLPAPERS[0].id).id).toBe(WALLPAPERS[0].id);
    expect(getWallpaper('nope')).toBeNull();
  });
});
