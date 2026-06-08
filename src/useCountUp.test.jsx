import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import useCountUp from './useCountUp.js';

describe('useCountUp', () => {
  afterEach(() => { delete window.matchMedia; });

  it('returns the exact target immediately when not animating (jsdom: no matchMedia)', () => {
    const { result } = renderHook(() => useCountUp(1280));
    expect(result.current).toBe(1280);
  });

  it('returns the target immediately when disabled', () => {
    window.matchMedia = () => ({ matches: false }); // motion allowed...
    const { result } = renderHook(() => useCountUp(500, { enabled: false })); // ...but disabled
    expect(result.current).toBe(500);
  });

  it('snaps to a new target on change (no re-animation)', () => {
    const { result, rerender } = renderHook(({ t }) => useCountUp(t), { initialProps: { t: 100 } });
    expect(result.current).toBe(100);
    rerender({ t: 250 });
    expect(result.current).toBe(250);
  });
});
