// src/useLedger.js
import { useState, useCallback, useEffect } from 'react';
import { nanoid } from 'nanoid';

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

  const addTransaction = useCallback((txn) => {
    const id = nanoid(8);
    setTransactions(prev => [...prev, {
      id,
      accountId: txn.accountId,
      date: txn.date,
      amount: Number.isFinite(txn.amount) ? txn.amount : 0,
      categoryId: txn.categoryId,
      description: txn.description || '',
      payee: txn.payee ?? null,
      checkNumber: txn.checkNumber ?? null,
      transferId: txn.transferId ?? null,
    }]);
    return id;
  }, []);

  const updateTransaction = useCallback((id, patch) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...patch, id: t.id } : t));
  }, []);

  const deleteTransaction = useCallback((id) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
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
    snapshot, restore,
    storageError, clearStorageError,
  };
}
