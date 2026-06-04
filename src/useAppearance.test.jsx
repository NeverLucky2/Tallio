import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useAppearance from './useAppearance.js';

const read = (k) => document.documentElement.style.getPropertyValue(k);

describe('useAppearance', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('style');
  });

  it('defaults to nocturne and applies its accent to :root', () => {
    const { result } = renderHook(() => useAppearance());
    expect(result.current.themeId).toBe('nocturne');
    expect(read('--accent')).toBe('#d4a853');
  });

  it('setTheme switches preset, applies tokens, and persists', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.setTheme('parchment'));
    expect(result.current.themeId).toBe('parchment');
    expect(read('--bg')).toBe('#f4ecd8');
    expect(JSON.parse(window.localStorage.getItem('tallio-appearance')).themeId).toBe('parchment');
  });

  it('updateCustom switches to custom and applies the derived color live', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.updateCustom({ accent: '#ff0000' }));
    expect(result.current.themeId).toBe('custom');
    expect(read('--accent')).toBe('#ff0000');
    expect(read('--accent-dim')).toBe('rgba(255, 0, 0, 0.12)');
  });

  it('resetCustomToPreset clears the custom theme', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.updateCustom({ accent: '#ff0000' }));
    act(() => result.current.resetCustomToPreset('nocturne'));
    expect(result.current.themeId).toBe('nocturne');
    expect(result.current.customTheme).toBeNull();
    expect(read('--accent')).toBe('#d4a853');
  });
});
