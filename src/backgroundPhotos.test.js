// src/backgroundPhotos.test.js
import { describe, it, expect } from 'vitest';
import { resolvePhotoIds } from './backgroundPhotos.js';

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
