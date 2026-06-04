// src/backgroundPhotos.test.js
import { describe, it, expect } from 'vitest';
import {
  resolvePhotoIds, clampFraming, togglePhotoSelection, pruneDeletedPhoto, focalFromPointer,
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

describe('focalFromPointer', () => {
  it('maps a pointer position within a rect to 0..100 percentages', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    expect(focalFromPointer(rect, 200, 100)).toEqual({ posX: 50, posY: 50 }); // center
    expect(focalFromPointer(rect, 100, 50)).toEqual({ posX: 0, posY: 0 });    // top-left
    expect(focalFromPointer(rect, 300, 150)).toEqual({ posX: 100, posY: 100 }); // bottom-right
  });
  it('clamps pointers outside the rect', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    expect(focalFromPointer(rect, -20, 200)).toEqual({ posX: 0, posY: 100 });
  });
});
