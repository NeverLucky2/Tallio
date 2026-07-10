import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useTemplates from './useTemplates.js';

beforeEach(() => localStorage.clear());
const draft = { kind: 'transaction', payload: { description: 'Paycheck', amount: 2500 } };

describe('useTemplates', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useTemplates());
    expect(result.current.templates).toEqual([]);
  });
  it('addTemplate stores a named item and persists across reload', () => {
    const h1 = renderHook(() => useTemplates());
    act(() => h1.result.current.addTemplate('Paycheck', draft));
    expect(h1.result.current.templates).toHaveLength(1);
    expect(h1.result.current.templates[0]).toMatchObject({ name: 'Paycheck', kind: 'transaction' });
    const h2 = renderHook(() => useTemplates());
    expect(h2.result.current.templates[0].name).toBe('Paycheck');
  });
  it('deleteTemplate removes by id', () => {
    const { result } = renderHook(() => useTemplates());
    let id;
    act(() => { id = result.current.addTemplate('Paycheck', draft); });
    act(() => result.current.deleteTemplate(id));
    expect(result.current.templates).toEqual([]);
  });
  it('exportSnapshot/restore round-trip', () => {
    const { result } = renderHook(() => useTemplates());
    act(() => result.current.addTemplate('Paycheck', draft));
    const snap = result.current.exportSnapshot();
    act(() => result.current.restore([]));
    expect(result.current.templates).toEqual([]);
    act(() => result.current.restore(snap));
    expect(result.current.templates[0].name).toBe('Paycheck');
  });
});
