// src/useAccountTypes.test.jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useAccountTypes from './useAccountTypes.js';

beforeEach(() => localStorage.clear());

describe('useAccountTypes', () => {
  it('seeds the 7 built-ins when storage is empty', () => {
    const { result } = renderHook(() => useAccountTypes());
    expect(result.current.types).toHaveLength(7);
    expect(result.current.typesById.get('bank').label).toBe('Bank / Cash');
  });

  it('hydrates from storage when present', () => {
    localStorage.setItem('billtracker-account-types', JSON.stringify([
      { id: 'hsa', label: 'HSA', klass: 'asset', layout: 'compact', group: 'Health', icon: '🏥', builtin: false },
    ]));
    const { result } = renderHook(() => useAccountTypes());
    expect(result.current.types).toHaveLength(1);
    expect(result.current.types[0].label).toBe('HSA');
  });

  it('addType appends a non-builtin type and returns its id; updateType patches; deleteType removes', () => {
    const { result } = renderHook(() => useAccountTypes());
    let id;
    act(() => { id = result.current.addType({ label: 'HSA', klass: 'asset', layout: 'compact', group: 'Health', icon: '🏥' }); });
    expect(result.current.types).toHaveLength(8);
    const created = result.current.typesById.get(id);
    expect(created.label).toBe('HSA');
    expect(created.builtin).toBe(false);
    act(() => { result.current.updateType(id, { label: 'HSA (Fidelity)' }); });
    expect(result.current.typesById.get(id).label).toBe('HSA (Fidelity)');
    expect(result.current.typesById.get(id).id).toBe(id);
    act(() => { result.current.deleteType(id); });
    expect(result.current.types).toHaveLength(7);
  });

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useAccountTypes());
    act(() => { result.current.addType({ label: 'HSA', klass: 'asset', layout: 'compact', group: 'Health' }); });
    expect(JSON.parse(localStorage.getItem('billtracker-account-types'))).toHaveLength(8);
  });
});
