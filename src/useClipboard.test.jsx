import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useClipboard from './useClipboard.js';

beforeEach(() => localStorage.clear());
const draft = { kind: 'transaction', payload: { description: 'Zelle', amount: 50 } };

describe('useClipboard', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useClipboard());
    expect(result.current.clipboard).toBeNull();
  });
  it('copy stores draft + label and persists across reload', () => {
    const h1 = renderHook(() => useClipboard());
    act(() => h1.result.current.copy(draft, 'Zelle'));
    expect(h1.result.current.clipboard).toEqual({ draft, label: 'Zelle' });
    const h2 = renderHook(() => useClipboard());
    expect(h2.result.current.clipboard).toEqual({ draft, label: 'Zelle' });
  });
  it('clear empties the slot', () => {
    const { result } = renderHook(() => useClipboard());
    act(() => result.current.copy(draft, 'Zelle'));
    act(() => result.current.clear());
    expect(result.current.clipboard).toBeNull();
  });
});
