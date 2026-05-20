// src/useLedger.test.jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLedger from './useLedger.js';

beforeEach(() => localStorage.clear());

const seed = {
  accounts: [{ id: 'a1', name: 'Chase', type: 'bank', icon: '🏦', openingBalance: 100 }],
  transactions: [{ id: 't1', accountId: 'a1', date: '2026-05-01', amount: 50, categoryId: 'c', description: 'x', payee: null, checkNumber: null, transferId: null }],
};

describe('useLedger', () => {
  it('hydrates from the provided initial value', () => {
    const { result } = renderHook(() => useLedger(seed));
    expect(result.current.accounts).toHaveLength(1);
    expect(result.current.transactions).toHaveLength(1);
  });

  it('addAccount appends with a fresh id and returns it', () => {
    const { result } = renderHook(() => useLedger(seed));
    let id;
    act(() => { id = result.current.addAccount({ name: 'Mastercard', type: 'credit_card', icon: '💳' }); });
    const created = result.current.accounts.find(a => a.id === id);
    expect(created.name).toBe('Mastercard');
    expect(created.openingBalance).toBe(0);
  });

  it('updateAccount patches without changing id; deleteAccount removes account AND its transactions', () => {
    const { result } = renderHook(() => useLedger(seed));
    act(() => { result.current.updateAccount('a1', { type: 'credit_card', name: 'Chase Visa' }); });
    expect(result.current.accounts[0].type).toBe('credit_card');
    expect(result.current.accounts[0].id).toBe('a1');
    act(() => { result.current.deleteAccount('a1'); });
    expect(result.current.accounts).toHaveLength(0);
    expect(result.current.transactions).toHaveLength(0);
  });

  it('transaction CRUD works and persists to localStorage', () => {
    const { result } = renderHook(() => useLedger(seed));
    let tid;
    act(() => { tid = result.current.addTransaction({ accountId: 'a1', date: '2026-05-05', amount: -20, categoryId: 'c', description: 'Coffee' }); });
    expect(result.current.transactions).toHaveLength(2);
    act(() => { result.current.updateTransaction(tid, { amount: -25 }); });
    expect(result.current.transactions.find(t => t.id === tid).amount).toBe(-25);
    act(() => { result.current.deleteTransaction(tid); });
    expect(result.current.transactions).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem('billtracker-transactions'))).toHaveLength(1);
  });

  it('snapshot/restore round-trips for undo', () => {
    const { result } = renderHook(() => useLedger(seed));
    let snap;
    act(() => { snap = result.current.snapshot(); });
    act(() => { result.current.addTransaction({ accountId: 'a1', date: '2026-05-09', amount: -9, categoryId: 'c', description: 'Y' }); });
    expect(result.current.transactions).toHaveLength(2);
    act(() => { result.current.restore(snap); });
    expect(result.current.transactions).toHaveLength(1);
  });
});
