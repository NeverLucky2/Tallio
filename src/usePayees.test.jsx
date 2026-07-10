// src/usePayees.test.jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import usePayees from './usePayees.js';

beforeEach(() => localStorage.clear());

const seedStorage = (list) => localStorage.setItem('tallio-payees', JSON.stringify(list));

describe('usePayees', () => {
  it('hydrates from tallio-payees and persists changes back', () => {
    seedStorage([{ id: 'p1', name: 'Costco', defaultCategoryId: null, defaultSubcategoryId: null }]);
    const { result } = renderHook(() => usePayees());
    expect(result.current.payees).toHaveLength(1);
    act(() => { result.current.addPayee('Shell'); });
    expect(JSON.parse(localStorage.getItem('tallio-payees'))).toHaveLength(2);
  });

  it('addPayee trims, rejects empty, and returns the existing id on a case-insensitive match', () => {
    const { result } = renderHook(() => usePayees());
    let id1, id2, id3;
    act(() => { id1 = result.current.addPayee('  Costco '); });
    act(() => { id2 = result.current.addPayee('costco'); });
    act(() => { id3 = result.current.addPayee('   '); });
    expect(result.current.payees).toHaveLength(1);
    expect(result.current.payees[0].name).toBe('Costco');
    expect(id2).toBe(id1);
    expect(id3).toBeNull();
  });

  it('renamePayee blocks case-insensitive conflicts with the other payee id', () => {
    seedStorage([
      { id: 'p1', name: 'Costco', defaultCategoryId: null, defaultSubcategoryId: null },
      { id: 'p2', name: 'Shell', defaultCategoryId: null, defaultSubcategoryId: null },
    ]);
    const { result } = renderHook(() => usePayees());
    let res;
    act(() => { res = result.current.renamePayee('p2', ' COSTCO '); });
    expect(res).toEqual({ ok: false, reason: 'duplicate', conflictId: 'p1' });
    act(() => { res = result.current.renamePayee('p2', 'Chevron'); });
    expect(res).toEqual({ ok: true });
    expect(result.current.payeesById.get('p2').name).toBe('Chevron');
  });

  it('setDefaultCategory sets and clears the pair (clearing category clears sub too)', () => {
    seedStorage([{ id: 'p1', name: 'Costco', defaultCategoryId: null, defaultSubcategoryId: null }]);
    const { result } = renderHook(() => usePayees());
    act(() => { result.current.setDefaultCategory('p1', 'cat1', 'sub1'); });
    expect(result.current.payeesById.get('p1').defaultCategoryId).toBe('cat1');
    expect(result.current.payeesById.get('p1').defaultSubcategoryId).toBe('sub1');
    act(() => { result.current.setDefaultCategory('p1', null); });
    expect(result.current.payeesById.get('p1').defaultCategoryId).toBeNull();
    expect(result.current.payeesById.get('p1').defaultSubcategoryId).toBeNull();
  });

  it('mergePayee removes the source; deletePayee removes; snapshot/restore round-trips', () => {
    seedStorage([
      { id: 'p1', name: 'Costco', defaultCategoryId: null, defaultSubcategoryId: null },
      { id: 'p2', name: 'costco warehouse', defaultCategoryId: null, defaultSubcategoryId: null },
    ]);
    const { result } = renderHook(() => usePayees());
    let snap;
    act(() => { snap = result.current.snapshot(); });
    act(() => { result.current.mergePayee('p2', 'p1'); });
    expect(result.current.payees.map(p => p.id)).toEqual(['p1']);
    act(() => { result.current.deletePayee('p1'); });
    expect(result.current.payees).toHaveLength(0);
    act(() => { result.current.restore(snap); });
    expect(result.current.payees).toHaveLength(2);
  });
});
