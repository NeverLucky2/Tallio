// src/useBackgroundPhotos.test.jsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import useBackgroundPhotos from './useBackgroundPhotos.js';

let counter;
beforeEach(() => {
  counter = 0;
  vi.stubGlobal('URL', {
    createObjectURL: () => `blob:${++counter}`,
    revokeObjectURL: () => {},
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const makeStore = (records) => ({
  list: async () => records,
  get: async (id) => records.find(r => r.id === id),
});

describe('useBackgroundPhotos', () => {
  it('returns [] for a non-photo base', async () => {
    const store = makeStore([]);
    const { result } = renderHook(() => useBackgroundPhotos({ base: 'solid' }, store));
    expect(result.current.photos).toEqual([]);
  });

  it('loads object URLs + palettes for the resolved photo ids', async () => {
    const records = [
      { id: 'a', blob: new Blob(['a']), palette: ['#111111'], createdAt: 1 },
      { id: 'b', blob: new Blob(['b']), palette: ['#222222'], createdAt: 2 },
    ];
    const bg = { base: 'photos', photoIds: ['a', 'b'], photoGroup: null, mode: 'single' };
    const { result } = renderHook(() => useBackgroundPhotos(bg, makeStore(records)));
    await waitFor(() => expect(result.current.photos.length).toBe(2));
    expect(result.current.photos[0].url).toContain('blob:');
    expect(result.current.photos[0].palette).toEqual(['#111111']);
  });

  it('advances activeIndex on the slideshow interval', async () => {
    const records = [
      { id: 'a', blob: new Blob(['a']), palette: [], createdAt: 1 },
      { id: 'b', blob: new Blob(['b']), palette: [], createdAt: 2 },
    ];
    const bg = { base: 'photos', photoIds: ['a', 'b'], photoGroup: null, mode: 'slideshow', intervalSec: 5 };

    // Fake timers must be installed BEFORE the slideshow interval is created.
    // The async load is promise-based (microtasks, not faked), so flush it first.
    vi.useFakeTimers();
    const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

    const { result } = renderHook(() => useBackgroundPhotos(bg, makeStore(records)));
    await act(async () => { await flush(); });
    expect(result.current.photos.length).toBe(2);

    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.activeIndex).toBe(1);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.activeIndex).toBe(0);
  });
});
