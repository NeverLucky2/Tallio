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

describe('transfers', () => {
  const tseed = {
    accounts: [
      { id: 'a1', name: 'Checking', type: 'bank', icon: '🏦', openingBalance: 1000 },
      { id: 'a2', name: 'Savings',  type: 'bank', icon: '🏦', openingBalance: 0 },
    ],
    transactions: [],
  };

  it('addTransfer creates two linked, oppositely-signed legs and returns the transferId', () => {
    const { result } = renderHook(() => useLedger(tseed));
    let tid;
    act(() => { tid = result.current.addTransfer({ fromId: 'a1', toId: 'a2', amount: 500, date: '2026-05-20', description: 'Move' }); });
    const legs = result.current.transactions.filter(t => t.transferId === tid);
    expect(legs).toHaveLength(2);
    const from = legs.find(l => l.accountId === 'a1');
    const to   = legs.find(l => l.accountId === 'a2');
    expect(from.amount).toBe(-500);
    expect(to.amount).toBe(500);
    expect(from.categoryId).toBeNull();
    expect(to.categoryId).toBeNull();
    expect(from.transferId).toBe(tid);
    expect(to.transferId).toBe(tid);
  });

  it('updateTransfer rewrites both legs in place (ids stable) and repoints endpoints', () => {
    const { result } = renderHook(() => useLedger(tseed));
    let tid;
    act(() => { tid = result.current.addTransfer({ fromId: 'a1', toId: 'a2', amount: 500, date: '2026-05-20', description: 'Move' }); });
    const idsBefore = result.current.transactions.filter(t => t.transferId === tid).map(t => t.id).sort();
    act(() => { result.current.updateTransfer(tid, { fromId: 'a2', toId: 'a1', amount: 250, date: '2026-05-21', description: 'Back' }); });
    const legs = result.current.transactions.filter(t => t.transferId === tid);
    expect(legs).toHaveLength(2);
    expect(legs.map(t => t.id).sort()).toEqual(idsBefore); // ids preserved
    const from = legs.find(l => l.amount < 0);
    const to   = legs.find(l => l.amount > 0);
    expect(from.accountId).toBe('a2'); // repointed
    expect(to.accountId).toBe('a1');
    expect(Math.abs(from.amount)).toBe(250);
    expect(from.date).toBe('2026-05-21');
    expect(from.description).toBe('Back');
  });

  it('deleteTransfer removes both legs', () => {
    const { result } = renderHook(() => useLedger(tseed));
    let tid;
    act(() => { tid = result.current.addTransfer({ fromId: 'a1', toId: 'a2', amount: 500, date: '2026-05-20', description: 'Move' }); });
    expect(result.current.transactions).toHaveLength(2);
    act(() => { result.current.deleteTransfer(tid); });
    expect(result.current.transactions).toHaveLength(0);
  });

  it('deleteAccount keeps the counterpart leg on the surviving account', () => {
    const { result } = renderHook(() => useLedger(tseed));
    act(() => { result.current.addTransfer({ fromId: 'a1', toId: 'a2', amount: 500, date: '2026-05-20', description: 'Move' }); });
    act(() => { result.current.deleteAccount('a1'); });
    const surviving = result.current.transactions;
    expect(surviving).toHaveLength(1);
    expect(surviving[0].accountId).toBe('a2');
    expect(surviving[0].amount).toBe(500);
  });

  it('addTransfer stores categoryId on both legs (null when omitted)', () => {
    const { result } = renderHook(() => useLedger(tseed));
    let tid;
    act(() => { tid = result.current.addTransfer({ fromId: 'a1', toId: 'a2', amount: 100, date: '2026-05-20', categoryId: 'cat_x' }); });
    const legs = result.current.transactions.filter(t => t.transferId === tid);
    expect(legs).toHaveLength(2);
    for (const leg of legs) expect(leg.categoryId).toBe('cat_x');

    let tid2;
    act(() => { tid2 = result.current.addTransfer({ fromId: 'a1', toId: 'a2', amount: 50, date: '2026-05-20' }); });
    for (const leg of result.current.transactions.filter(t => t.transferId === tid2)) expect(leg.categoryId).toBeNull();
  });

  it('updateTransfer updates categoryId on both legs', () => {
    const { result } = renderHook(() => useLedger(tseed));
    let tid;
    act(() => { tid = result.current.addTransfer({ fromId: 'a1', toId: 'a2', amount: 100, date: '2026-05-20', categoryId: 'cat_x' }); });
    act(() => { result.current.updateTransfer(tid, { fromId: 'a1', toId: 'a2', amount: 100, date: '2026-05-20', categoryId: 'cat_y' }); });
    for (const leg of result.current.transactions.filter(t => t.transferId === tid)) expect(leg.categoryId).toBe('cat_y');
  });
});

describe('addTransaction with splits', () => {
  const seed = {
    accounts: [
      { id: 'a_chase', name: 'Chase', type: 'bank', icon: '🏦', openingBalance: 1000 },
      { id: 'a_cash',  name: 'Cash',  type: 'bank', icon: '💵', openingBalance: 0 },
    ],
    transactions: [],
  };

  it('persists the parent with splits intact', () => {
    const { result } = renderHook(() => useLedger(seed));
    let id;
    act(() => {
      id = result.current.addTransaction({
        accountId: 'a_chase', date: '2026-05-20', amount: -180, payee: 'Costco', description: 'Costco',
        splits: [
          { id: 's1', amount: -100, categoryId: 'c_grocery', description: 'Groceries' },
          { id: 's2', amount:  -80, categoryId: 'c_household', description: 'Soap' },
        ],
      });
    });
    const parent = result.current.transactions.find(t => t.id === id);
    expect(parent.splits).toHaveLength(2);
    expect(parent.amount).toBe(-180);
  });

  it('creates one counterpart transaction per transfer split line on the target account', () => {
    const { result } = renderHook(() => useLedger(seed));
    act(() => {
      result.current.addTransaction({
        accountId: 'a_chase', date: '2026-05-20', amount: -180, payee: 'Costco',
        splits: [
          { id: 's1', amount: -100, categoryId: 'c_grocery', description: 'Groceries' },
          { id: 's2', amount:  -30, categoryId: 'c_household', description: 'Soap' },
          { id: 's3', amount:  -50, transferId: 'tr_cash',    description: 'ATM cash back' },
        ],
      }, { splitTargets: new Map([['s3', 'a_cash']]) });
    });
    const counterparts = result.current.transactions.filter(t => t.transferId === 'tr_cash');
    expect(counterparts).toHaveLength(1);
    const cp = counterparts[0];
    expect(cp.accountId).toBe('a_cash');
    expect(cp.amount).toBe(50);
    expect(cp.description).toBe('ATM cash back');
    expect(cp.date).toBe('2026-05-20');
  });

  it('addTransaction throws and persists nothing when validateSplits fails', () => {
    const { result } = renderHook(() => useLedger(seed));
    expect(() => act(() => {
      result.current.addTransaction({
        accountId: 'a_chase', date: '2026-05-20', amount: -180,
        splits: [
          { id: 's1', amount: -10, categoryId: 'c1', description: '' },
          { id: 's2', amount: -10, categoryId: 'c1', description: '' },
        ],
      });
    })).toThrow(/does not match/i);
    expect(result.current.transactions).toHaveLength(0);
  });
});

