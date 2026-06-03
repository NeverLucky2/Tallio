// src/useSettings.test.jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useSettings, { clampUiScale, UI_SCALE_MIN, UI_SCALE_MAX } from './useSettings.js';

beforeEach(() => localStorage.clear());

describe('clampUiScale', () => {
  it('rounds to the nearest 5% then clamps to range', () => {
    expect(clampUiScale(1.13)).toBe(1.15);
    expect(clampUiScale(1.12)).toBe(1.1);
    expect(clampUiScale(0.7)).toBe(UI_SCALE_MIN); // 0.9
    expect(clampUiScale(2)).toBe(UI_SCALE_MAX);   // 1.5
  });
  it('falls back to default 1.1 for non-finite input', () => {
    expect(clampUiScale(NaN)).toBe(1.1);
    expect(clampUiScale(undefined)).toBe(1.1);
    expect(clampUiScale('big')).toBe(1.1);
  });
});

describe('useSettings uiScale', () => {
  it('defaults to 1.1 when storage is empty', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.uiScale).toBe(1.1);
  });
  it('save persists uiScale and updates state', () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.save({ uiScale: 1.2 }));
    expect(result.current.uiScale).toBe(1.2);
    expect(localStorage.getItem('tallio-ui-scale')).toBe('1.2');
  });
  it('hydrates and clamps an out-of-range stored value', () => {
    localStorage.setItem('tallio-ui-scale', '9');
    const { result } = renderHook(() => useSettings());
    expect(result.current.uiScale).toBe(UI_SCALE_MAX); // 1.5
  });
});
