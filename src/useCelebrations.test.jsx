import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useCelebrations from './useCelebrations.js';
import { DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';

const typesById = DEFAULT_ACCOUNT_TYPES_BY_ID;
const cats = new Map([['inc', { id: 'inc', flow: 'income' }]]);
const now = () => new Date('2026-06-15T00:00:00');
const STORAGE = 'tallio-celebrations';

const paidOffAccounts = [{ id: 'cc', name: 'Visa', type: 'credit_card', openingBalance: -100 }];
const paidOffTxns = [{ id: 't1', accountId: 'cc', date: '2026-02-10', amount: 100, categoryId: 'inc' }];

const tick = () => act(() => { vi.advanceTimersByTime(1); });

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useCelebrations', () => {
  it('baselines pre-existing milestones silently on first load', () => {
    const { result } = renderHook(() => useCelebrations({
      accounts: paidOffAccounts, transactions: paidOffTxns, typesById, categoriesById: cats, now, debounceMs: 0,
    }));
    tick();
    expect(result.current.current).toBeNull();
    const saved = JSON.parse(localStorage.getItem(STORAGE));
    expect(saved.seen['paidoff:cc']).toBeTruthy();
    expect(saved.baselinedTypes).toContain('paidoff');
  });

  it('fires exactly once for a milestone achieved after baseline, then dismiss clears it', () => {
    const { result, rerender } = renderHook(
      (props) => useCelebrations({ ...props, typesById, categoriesById: cats, now, debounceMs: 0 }),
      { initialProps: { accounts: [], transactions: [] } },
    );
    tick(); // baseline with empty ledger
    expect(result.current.current).toBeNull();

    rerender({ accounts: paidOffAccounts, transactions: paidOffTxns });
    tick();
    expect(result.current.current).toBeTruthy();
    expect(result.current.current.key).toBe('paidoff:cc');
    expect(result.current.current.title).toContain('Visa');

    act(() => result.current.dismiss());
    expect(result.current.current).toBeNull();

    // re-running detection on the same state does not re-fire
    rerender({ accounts: paidOffAccounts, transactions: [...paidOffTxns] });
    tick();
    expect(result.current.current).toBeNull();
  });

  it('style "off" suppresses the toast but still records the milestone as seen', () => {
    const { result, rerender } = renderHook(
      (props) => useCelebrations({ ...props, typesById, categoriesById: cats, now, debounceMs: 0 }),
      { initialProps: { accounts: [], transactions: [] } },
    );
    tick();
    act(() => result.current.setStyle('off'));
    expect(result.current.style).toBe('off');
    expect(JSON.parse(localStorage.getItem(STORAGE)).settings.style).toBe('off');

    rerender({ accounts: paidOffAccounts, transactions: paidOffTxns });
    tick();
    expect(result.current.current).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE)).seen['paidoff:cc']).toBeTruthy();
  });

  it('hydrates style from storage and tolerates corrupt storage', () => {
    localStorage.setItem(STORAGE, JSON.stringify({
      seen: {}, baselinedTypes: ['paidoff', 'networth', 'bestmonth', 'streak'], settings: { style: 'quiet' },
    }));
    const a = renderHook(() => useCelebrations({ accounts: [], transactions: [], typesById, categoriesById: cats, now, debounceMs: 0 }));
    expect(a.result.current.style).toBe('quiet');

    localStorage.setItem(STORAGE, '{bad json');
    const b = renderHook(() => useCelebrations({ accounts: [], transactions: [], typesById, categoriesById: cats, now, debounceMs: 0 }));
    expect(b.result.current.style).toBe('festive');
  });
});
