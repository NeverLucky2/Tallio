// src/backgroundPhotos.test.js
import { describe, it, expect } from 'vitest';
import {
  resolvePhotoIds, clampFraming, togglePhotoSelection, pruneDeletedPhoto, panFraming,
} from './backgroundPhotos.js';

const metas = [
  { id: 'a', group: 'Family',  createdAt: 30 },
  { id: 'b', group: 'Scenery', createdAt: 10 },
  { id: 'c', group: 'Family',  createdAt: 20 },
];

describe('resolvePhotoIds', () => {
  it('returns the explicit photoIds, filtered to existing images, in order', () => {
    const bg = { photoIds: ['c', 'gone', 'a'], photoGroup: null };
    expect(resolvePhotoIds(bg, metas)).toEqual(['c', 'a']);
  });

  it('when photoGroup is set, returns that group sorted by createdAt (overrides photoIds)', () => {
    const bg = { photoIds: ['a'], photoGroup: 'Family' };
    expect(resolvePhotoIds(bg, metas)).toEqual(['c', 'a']); // 20 before 30
  });

  it('returns [] for an empty group', () => {
    expect(resolvePhotoIds({ photoGroup: 'Pets' }, metas)).toEqual([]);
  });

  it('is safe with missing fields', () => {
    expect(resolvePhotoIds(null, null)).toEqual([]);
    expect(resolvePhotoIds({}, metas)).toEqual([]);
  });
});

describe('clampFraming', () => {
  it('fills defaults when empty/missing', () => {
    expect(clampFraming()).toEqual({ posX: 50, posY: 50, zoom: 1 });
    expect(clampFraming({})).toEqual({ posX: 50, posY: 50, zoom: 1 });
  });
  it('clamps position to 0..100 and zoom to 1..3', () => {
    expect(clampFraming({ posX: -10, posY: 140, zoom: 5 })).toEqual({ posX: 0, posY: 100, zoom: 3 });
    expect(clampFraming({ posX: 30, posY: 70, zoom: 0.2 })).toEqual({ posX: 30, posY: 70, zoom: 1 });
  });
});

describe('togglePhotoSelection', () => {
  it('single mode replaces the selection with the clicked id', () => {
    expect(togglePhotoSelection(['a', 'b'], 'c', 'single')).toEqual(['c']);
    expect(togglePhotoSelection([], 'a', 'single')).toEqual(['a']);
  });
  it('slideshow mode toggles membership, preserving order', () => {
    expect(togglePhotoSelection(['a'], 'b', 'slideshow')).toEqual(['a', 'b']);
    expect(togglePhotoSelection(['a', 'b'], 'a', 'slideshow')).toEqual(['b']);
  });
});

describe('pruneDeletedPhoto', () => {
  it('removes the id from photoIds and framing', () => {
    const bg = { photoIds: ['a', 'b'], framing: { a: { posX: 1 }, b: { posX: 2 } } };
    expect(pruneDeletedPhoto(bg, 'a')).toEqual({ photoIds: ['b'], framing: { b: { posX: 2 } } });
  });
  it('is safe when fields are missing', () => {
    expect(pruneDeletedPhoto({}, 'a')).toEqual({ photoIds: [], framing: {} });
  });
});

describe('panFraming', () => {
  it('drags the image with the cursor: dragging right reveals the left (posX decreases)', () => {
    expect(panFraming({ posX: 50, posY: 50, zoom: 1 }, 50, 0, 100, 100)).toEqual({ posX: 0, posY: 50 });
    expect(panFraming({ posX: 50, posY: 50, zoom: 1 }, -50, 0, 100, 100)).toEqual({ posX: 100, posY: 50 });
  });
  it('drags vertically (dragging down reveals the top, posY decreases)', () => {
    expect(panFraming({ posX: 50, posY: 50 }, 0, 25, 100, 100)).toEqual({ posX: 50, posY: 25 });
  });
  it('clamps the result to 0..100', () => {
    expect(panFraming({ posX: 50, posY: 50 }, 200, 200, 100, 100)).toEqual({ posX: 0, posY: 0 });
    expect(panFraming({ posX: 50, posY: 50 }, -200, -200, 100, 100)).toEqual({ posX: 100, posY: 100 });
  });
  it('returns the start position when the rect size is 0 (safe)', () => {
    expect(panFraming({ posX: 30, posY: 40 }, 10, 10, 0, 0)).toEqual({ posX: 30, posY: 40 });
  });
});
