import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, fireEvent } from '@testing-library/react';
import useEasterEggs from './useEasterEggs.js';
import { KONAMI_SEQUENCE } from './konami.js';

const press = (key, target = window) => fireEvent.keyDown(target, { key });

describe('useEasterEggs', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reveals on the full Konami sequence', () => {
    const { result } = renderHook(() => useEasterEggs());
    act(() => { KONAMI_SEQUENCE.forEach((k) => press(k)); });
    expect(result.current.reveal).toBeTruthy();
    act(() => result.current.dismiss());
    expect(result.current.reveal).toBeNull();
  });

  it('a wrong key resets progress (no reveal)', () => {
    const { result } = renderHook(() => useEasterEggs());
    act(() => { KONAMI_SEQUENCE.slice(0, 5).forEach((k) => press(k)); press('x'); KONAMI_SEQUENCE.slice(0, 4).forEach((k) => press(k)); });
    expect(result.current.reveal).toBeNull();
  });

  it('ignores keystrokes while typing in an input', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const { result } = renderHook(() => useEasterEggs());
    act(() => { KONAMI_SEQUENCE.forEach((k) => press(k, input)); });
    expect(result.current.reveal).toBeNull();
    document.body.removeChild(input);
  });

  it('reveals on 7 logo clicks within 3s, but not if too slow', () => {
    const { result } = renderHook(() => useEasterEggs());
    act(() => { for (let i = 0; i < 7; i++) result.current.registerLogoClick(); });
    expect(result.current.reveal).toBeTruthy();
    act(() => result.current.dismiss());
    // too slow: clicks spaced beyond the window
    act(() => { for (let i = 0; i < 6; i++) { result.current.registerLogoClick(); vi.advanceTimersByTime(1000); } });
    expect(result.current.reveal).toBeNull();
  });
});
