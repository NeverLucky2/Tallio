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

  it('updateBackground merges into the background object and persists', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.updateBackground({ effects: { aurora: true, pulse: false } }));
    expect(result.current.background.effects).toEqual({ aurora: true, pulse: false });
    // unrelated fields preserved
    expect(result.current.background.intensity).toBe(25);
    const saved = JSON.parse(window.localStorage.getItem('tallio-appearance'));
    expect(saved.background.effects.aurora).toBe(true);
  });

  it('updateBackground can set intensity without dropping effects', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.updateBackground({ effects: { aurora: true, pulse: false } }));
    act(() => result.current.updateBackground({ intensity: 80 }));
    expect(result.current.background.intensity).toBe(80);
    expect(result.current.background.effects.aurora).toBe(true);
  });

  it('defaults the background to empty framing and effectStrength 50', () => {
    const { result } = renderHook(() => useAppearance());
    expect(result.current.background.framing).toEqual({});
    expect(result.current.background.effectStrength).toBe(50);
  });

  it('back-fills new background fields for a saved config that predates them', () => {
    window.localStorage.setItem('tallio-appearance', JSON.stringify({
      themeId: 'nocturne',
      background: { base: 'photos', photoIds: ['x'], intensity: 40 },
    }));
    const { result } = renderHook(() => useAppearance());
    expect(result.current.background.framing).toEqual({});
    expect(result.current.background.effectStrength).toBe(50);
    expect(result.current.background.photoIds).toEqual(['x']); // saved value preserved
    expect(result.current.background.intensity).toBe(40);
  });
});

describe('useAppearance — undo support', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('style');
  });

  it('snapshot + restore round-trips theme + background + appIcons', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.setTheme('forest'));
    act(() => result.current.setAppIcon('headerAvatar', 'img:abc'));
    const snap = result.current.snapshot();
    act(() => result.current.setTheme('parchment'));
    act(() => result.current.setAppIcon('headerAvatar', ''));
    expect(result.current.themeId).toBe('parchment');
    expect(result.current.appIcons.headerAvatar).toBeUndefined();
    act(() => result.current.restore(snap));
    expect(result.current.themeId).toBe('forest');
    expect(result.current.appIcons.headerAvatar).toBe('img:abc');
  });

  it('setAppIcon sets a slot and clears it on empty value', () => {
    const { result } = renderHook(() => useAppearance());
    act(() => result.current.setAppIcon('headerAvatar', 'img:zzz'));
    expect(result.current.appIcons.headerAvatar).toBe('img:zzz');
    act(() => result.current.setAppIcon('headerAvatar', ''));
    expect(result.current.appIcons.headerAvatar).toBeUndefined();
  });
});
