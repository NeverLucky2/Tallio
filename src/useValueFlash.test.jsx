import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useValueFlash from './useValueFlash.js';

describe('useValueFlash', () => {
  beforeEach(() => { vi.useFakeTimers(); window.matchMedia = () => ({ matches: false }); });
  afterEach(() => { vi.useRealTimers(); delete window.matchMedia; });

  it('does not flash on mount', () => {
    const { result } = renderHook(() => useValueFlash(100));
    expect(result.current).toBe(false);
  });

  it('flashes on change then clears after the duration', () => {
    const { result, rerender } = renderHook(({ v }) => useValueFlash(v, { durationMs: 1000 }), { initialProps: { v: 100 } });
    rerender({ v: 200 });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(false);
  });

  it('never flashes under reduced motion', () => {
    window.matchMedia = () => ({ matches: true });
    const { result, rerender } = renderHook(({ v }) => useValueFlash(v), { initialProps: { v: 1 } });
    rerender({ v: 2 });
    expect(result.current).toBe(false);
  });
});
