import { describe, it, expect, vi } from 'vitest';
import { diffIconUrls } from './iconUrlCache.js';

const thumbA = new Blob(['a']); const thumbB = new Blob(['b']);

describe('diffIconUrls', () => {
  it('creates urls for new images, skips images without a thumb', () => {
    const make = vi.fn((b) => `blob:${b === thumbA ? 'A' : 'B'}`);
    const next = diffIconUrls(new Map(), [
      { id: '1', thumb: thumbA }, { id: '2' }, // #2 has no thumb
    ], make, () => {});
    expect(next.get('1').url).toBe('blob:A');
    expect(next.has('2')).toBe(false);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('reuses the url for an unchanged thumb, revokes for removed', () => {
    const prev = new Map([['1', { url: 'blob:A', thumb: thumbA }], ['9', { url: 'blob:Z', thumb: thumbB }]]);
    const make = vi.fn(() => 'blob:NEW');
    const revoke = vi.fn();
    const next = diffIconUrls(prev, [{ id: '1', thumb: thumbA }], make, revoke);
    expect(next.get('1').url).toBe('blob:A'); // reused
    expect(make).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:Z'); // #9 removed
  });

  it('revokes + recreates when the thumb blob changes (re-crop)', () => {
    const prev = new Map([['1', { url: 'blob:OLD', thumb: thumbA }]]);
    const make = vi.fn(() => 'blob:NEW'); const revoke = vi.fn();
    const next = diffIconUrls(prev, [{ id: '1', thumb: thumbB }], make, revoke);
    expect(revoke).toHaveBeenCalledWith('blob:OLD');
    expect(next.get('1').url).toBe('blob:NEW');
  });
});
