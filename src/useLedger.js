// src/useLedger.js
import { useState, useCallback, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { validateSplits } from './accountsModel.js';

const ACCOUNTS_KEY = 'billtracker-accounts';
const TXN_KEY = 'billtracker-transactions';

// Owns the two flat arrays so undo can snapshot/restore them together.
// `initial` comes from initializeFromStorage: { accounts, transactions }.
export default function useLedger(initial = { accounts: [], transactions: [] }) {
  const [accounts, setAccounts] = useState(initial.accounts || []);
  const [transactions, setTransactions] = useState(initial.transactions || []);
  const [storageError, setStorageError] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
      localStorage.setItem(TXN_KEY, JSON.stringify(transactions));
      // Clear a prior quota error once a save succeeds. No-op when already null.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (storageError) setStorageError(null);
    } catch (e) {
      console.error('Failed to save ledger:', e);
      setStorageError({ message: "Couldn't save — storage full." });
    }
  }, [accounts, transactions]); // eslint-disable-line react-hooks/exhaustive-deps

  const addAccount = useCallback(({ name, type = 'untyped', icon = '🏦', openingBalance = 0 }) => {
    const id = nanoid(8);
    setAccounts(prev => [...prev, { id, name: (name || '').trim(), type, icon, openingBalance: Number(openingBalance) || 0 }]);
    return id;
  }, []);

  const updateAccount = useCallback((id, patch) => {
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, ...patch, id: a.id } : a));
  }, []);

  const deleteAccount = useCallback((id) => {
    setAccounts(prev => prev.filter(a => a.id !== id));
    setTransactions(prev => prev.filter(t => t.accountId !== id));
  }, []);

  const addTransaction = useCallback((txn, opts = {}) => {
    // opts.splitTargets: Map<lineId, targetAccountId> for transfer split lines.
    const id = nanoid(8);
    const splits = Array.isArray(txn.splits) && txn.splits.length > 0
      ? txn.splits.map(s => ({
          id: s.id || nanoid(8),
          amount: Number.isFinite(s.amount) ? s.amount : 0,
          description: s.description || '',
          ...(s.categoryId ? { categoryId: s.categoryId } : {}),
          ...(s.transferId ? { transferId: s.transferId } : {}),
        }))
      : null;
    const parent = {
      id,
      accountId: txn.accountId,
      date: txn.date,
      amount: Number.isFinite(txn.amount) ? txn.amount : 0,
      categoryId: txn.categoryId,
      description: txn.description || '',
      payee: txn.payee ?? null,
      checkNumber: txn.checkNumber ?? null,
      transferId: txn.transferId ?? null,
      ...(splits ? { splits } : {}),
    };
    validateSplits(parent); // throws on invariant violation before any state change

    setTransactions(prev => {
      const next = [...prev, parent];
      if (!splits) return next;
      const targets = opts.splitTargets || new Map();
      for (const s of splits) {
        if (!s.transferId) continue;
        const targetAccountId = targets.get(s.id);
        if (!targetAccountId) continue;
        next.push({
          id: nanoid(8),
          accountId: targetAccountId,
          date: parent.date,
          amount: -1 * s.amount,
          categoryId: null,
          description: s.description || '',
          payee: parent.payee,
          checkNumber: null,
          transferId: s.transferId,
        });
      }
      return next;
    });
    return id;
  }, []);

  const updateTransaction = useCallback((id, patch) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...patch, id: t.id } : t));
  }, []);

  const deleteTransaction = useCallback((id) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  }, []);

  // A transfer is a PAIR of linked transactions sharing one transferId: a negative
  // leg on the source account and a positive leg on the destination. Each method is
  // a single setTransactions update so the operation is atomic and snapshot-friendly.
  const addTransfer = useCallback(({ fromId, toId, amount, date, description = '', categoryId = null }) => {
    const transferId = nanoid(8);
    const mag = Math.abs(Number(amount)) || 0;
    const note = description || '';
    const base = { date, categoryId: categoryId ?? null, description: note, payee: null, checkNumber: null, transferId };
    const fromLeg = { id: nanoid(8), accountId: fromId, amount: -mag, ...base };
    const toLeg   = { id: nanoid(8), accountId: toId,   amount:  mag, ...base };
    setTransactions(prev => [...prev, fromLeg, toLeg]);
    return transferId;
  }, []);

  const updateTransfer = useCallback((transferId, { fromId, toId, amount, date, description = '', categoryId = null }) => {
    if (!transferId) return;
    const mag = Math.abs(Number(amount)) || 0;
    const note = description || '';
    const cid = categoryId ?? null;
    setTransactions(prev => {
      const legs = prev.filter(t => t.transferId === transferId);
      if (legs.length === 0) return prev;
      const fromLegId = legs[0].id;             // deterministic: first leg = From
      const toLegId = legs[1] ? legs[1].id : null;
      return prev.map(t => {
        if (t.id === fromLegId) return { ...t, accountId: fromId, amount: -mag, date, categoryId: cid, description: note, payee: null, checkNumber: null, transferId };
        if (toLegId && t.id === toLegId) return { ...t, accountId: toId, amount: mag, date, categoryId: cid, description: note, payee: null, checkNumber: null, transferId };
        return t;
      });
    });
  }, []);

  const deleteTransfer = useCallback((transferId) => {
    if (!transferId) return;
    setTransactions(prev => prev.filter(t => t.transferId !== transferId));
  }, []);

  const snapshot = useCallback(() => ({ accounts, transactions }), [accounts, transactions]);
  const restore = useCallback((snap) => {
    if (!snap) return;
    setAccounts(snap.accounts || []);
    setTransactions(snap.transactions || []);
  }, []);

  const clearStorageError = useCallback(() => setStorageError(null), []);

  return {
    accounts, transactions,
    addAccount, updateAccount, deleteAccount,
    addTransaction, updateTransaction, deleteTransaction,
    addTransfer, updateTransfer, deleteTransfer,
    snapshot, restore,
    storageError, clearStorageError,
  };
}
