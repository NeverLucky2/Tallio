// src/storageWriter.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import useStorageWriter from './storageWriter.js';

const KEY = 'tallio-test-key';

describe('useStorageWriter', () => {
  let setItem;
  beforeEach(() => { localStorage.clear(); setItem = vi.spyOn(Storage.prototype, 'setItem'); });
  afterEach(() => setItem.mockRestore());

  const writesTo = (key) => setItem.mock.calls.filter(([k]) => k === key).length;

  it('skips a value identical to what was stored when the window loaded', () => {
    localStorage.setItem(KEY, JSON.stringify([1, 2]));
    setItem.mockClear();
    const { result } = renderHook(() => useStorageWriter(KEY));
    expect(result.current([1, 2])).toBe(false);
    expect(writesTo(KEY)).toBe(0);
  });

  it('writes a value that differs from what was stored at load (e.g. seeded defaults)', () => {
    const { result } = renderHook(() => useStorageWriter(KEY));
    expect(result.current(['seed'])).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('["seed"]');
  });

  it('writes a change once, then skips repeating it', () => {
    localStorage.setItem(KEY, '[1]');
    const { result } = renderHook(() => useStorageWriter(KEY));
    expect(result.current([1, 2])).toBe(true);
    expect(result.current([1, 2])).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('[1,2]');
  });

  it('writes again when a value returns to what was loaded (e.g. undo)', () => {
    localStorage.setItem(KEY, '[1]');
    const { result } = renderHook(() => useStorageWriter(KEY));
    result.current([1, 2]);
    expect(result.current([1])).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('[1]');
  });

  it('throws like setItem and retries the same value next time', () => {
    const { result } = renderHook(() => useStorageWriter(KEY));
    setItem.mockImplementationOnce(() => { throw new Error('QuotaExceededError'); });
    expect(() => result.current(['big'])).toThrow('QuotaExceededError');
    expect(result.current(['big'])).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('["big"]');
  });

  it('keeps what it loaded across re-renders', () => {
    localStorage.setItem(KEY, '[1]');
    const { result, rerender } = renderHook(() => useStorageWriter(KEY));
    localStorage.setItem(KEY, '[9]'); // another window's save, seen after load
    rerender();
    expect(result.current([1])).toBe(false);
  });
});
