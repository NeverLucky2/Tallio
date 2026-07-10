// src/useLedger.js
import { useState, useCallback, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { validateSplits } from './accountsModel.js';

const ACCOUNTS_KEY = 'tallio-accounts';
const TXN_KEY = 'tallio-transactions';

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
    setTransactions(prev => {
      const survivingByTransferId = new Map();
      for (const t of prev) {
        if (t.accountId === id) continue;
        if (t.transferId) {
          const list = survivingByTransferId.get(t.transferId) || [];
          list.push(t);
          survivingByTransferId.set(t.transferId, list);
        }
      }
      return prev
        .filter(t => t.accountId !== id)
        .map(t => {
          if (!Array.isArray(t.splits)) return t;
          const cleaned = t.splits.map(s => {
            if (!s.transferId) return s;
            const peers = survivingByTransferId.get(s.transferId) || [];
            const hasCounterpart = peers.some(p => p.id !== t.id);
            if (hasCounterpart) return s;
            // Strip the orphan transferId; surviving fields (amount, description) stay.
            const { transferId: _stripped, ...rest } = s;
            return rest;
          });
          return { ...t, splits: cleaned };
        });
    });
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
          ...(s.categoryId && s.subId ? { subId: s.subId } : {}),
          ...(s.transferId ? { transferId: s.transferId } : {}),
        }))
      : null;
    const parent = {
      id,
      accountId: txn.accountId,
      date: txn.date,
      amount: Number.isFinite(txn.amount) ? txn.amount : 0,
      categoryId: txn.categoryId,
      ...(txn.subId ? { subId: txn.subId } : {}),
      description: txn.description || '',
      payeeId: txn.payeeId ?? null,
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
          payeeId: parent.payeeId,
          checkNumber: null,
          transferId: s.transferId,
        });
      }
      return next;
    });
    return id;
  }, []);

  const updateTransaction = useCallback((id, patch, opts = {}) => {
    setTransactions(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx < 0) return prev;
      const before = prev[idx];
      const next = { ...before, ...patch, id: before.id };
      if (next.splits === undefined) next.splits = before.splits;
      if (next.splits === null) delete next.splits;
      if (next.subId === null || next.subId === undefined) delete next.subId;
      validateSplits(next);

      const prevLines = Array.isArray(before.splits) ? before.splits : [];
      const nextLines = Array.isArray(next.splits) ? next.splits : [];
      const prevTransferByLineId = new Map(prevLines.filter(s => s.transferId).map(s => [s.id, s]));
      const nextTransferByLineId = new Map(nextLines.filter(s => s.transferId).map(s => [s.id, s]));
      const targets = opts.splitTargets || new Map();

      let out = prev.map((t, i) => (i === idx ? next : t));

      // Removed (or flipped) transfer lines: delete their counterparts by transferId.
      for (const [lineId, prevLine] of prevTransferByLineId) {
        if (!nextTransferByLineId.has(lineId)
            || nextTransferByLineId.get(lineId).transferId !== prevLine.transferId) {
          out = out.filter(t => t.transferId !== prevLine.transferId);
        }
      }

      // Added (or flipped) transfer lines: create their counterparts.
      for (const [lineId, nextLine] of nextTransferByLineId) {
        const prevSame = prevTransferByLineId.get(lineId);
        const wasSameTransfer = prevSame && prevSame.transferId === nextLine.transferId;
        if (wasSameTransfer) continue;
        const targetAccountId = targets.get(lineId);
        if (!targetAccountId) continue;
        out = [...out, {
          id: nanoid(8),
          accountId: targetAccountId,
          date: next.date,
          amount: -1 * nextLine.amount,
          categoryId: null,
          description: nextLine.description || '',
          payeeId: next.payeeId ?? null,
          checkNumber: null,
          transferId: nextLine.transferId,
        }];
      }

      // Persistent transfer lines: patch the counterpart for amount/account/description/date.
      for (const [lineId, nextLine] of nextTransferByLineId) {
        const prevLine = prevTransferByLineId.get(lineId);
        if (!prevLine || prevLine.transferId !== nextLine.transferId) continue;
        const newTarget = targets.get(lineId);
        out = out.map(t => {
          if (t.transferId !== nextLine.transferId) return t;
          if (t.id === next.id) return t; // don't patch the parent itself
          return {
            ...t,
            accountId: newTarget || t.accountId,
            amount: -1 * nextLine.amount,
            description: nextLine.description || '',
            date: next.date,
            payeeId: next.payeeId ?? null,
          };
        });
      }
      return out;
    });
  }, []);

  const deleteTransaction = useCallback((id) => {
    setTransactions(prev => {
      const target = prev.find(t => t.id === id);
      if (!target) return prev;
      const transferIdsToCascade = new Set(
        Array.isArray(target.splits) ? target.splits.filter(s => s.transferId).map(s => s.transferId) : []
      );
      return prev.filter(t => {
        if (t.id === id) return false;
        if (t.transferId && transferIdsToCascade.has(t.transferId)) return false;
        return true;
      });
    });
  }, []);

  // A transfer is a PAIR of linked transactions sharing one transferId: a negative
  // leg on the source account and a positive leg on the destination. Each method is
  // a single setTransactions update so the operation is atomic and snapshot-friendly.
  const addTransfer = useCallback(({ fromId, toId, amount, date, description = '', categoryId = null, splits = null }) => {
    const transferId = nanoid(8);
    const mag = Math.abs(Number(amount)) || 0;
    const note = description || '';
    const base = { date, categoryId: categoryId ?? null, description: note, payeeId: null, checkNumber: null, transferId };
    const sourceSplits = Array.isArray(splits) && splits.length > 0
      ? splits.map(s => ({
          id: s.id || nanoid(8),
          amount: Number.isFinite(s.amount) ? s.amount : 0,
          description: s.description || '',
          ...(s.categoryId ? { categoryId: s.categoryId } : {}),
          ...(s.categoryId && s.subId ? { subId: s.subId } : {}),
          ...(s.transferId ? { transferId: s.transferId } : {}),
        }))
      : null;
    const sumCents = sourceSplits
      ? sourceSplits.reduce((acc, l) => acc + Math.round((Number.isFinite(l.amount) ? l.amount : 0) * 100), 0)
      : 0;
    const fromAmount = sourceSplits ? sumCents / 100 : -mag;
    const toAmount   = sourceSplits ? -sumCents / 100 : mag;
    const fromLeg = { id: nanoid(8), accountId: fromId, amount: fromAmount, ...base, ...(sourceSplits ? { splits: sourceSplits } : {}) };
    const toLeg   = { id: nanoid(8), accountId: toId,   amount: toAmount, ...base };
    validateSplits(fromLeg);
    setTransactions(prev => [...prev, fromLeg, toLeg]);
    return transferId;
  }, []);

  const updateTransfer = useCallback((transferId, { fromId, toId, amount, date, description = '', categoryId = null, splits = null }) => {
    if (!transferId) return;
    const mag = Math.abs(Number(amount)) || 0;
    const note = description || '';
    const cid = categoryId ?? null;
    const sourceSplits = Array.isArray(splits) && splits.length > 0
      ? splits.map(s => ({
          id: s.id || nanoid(8),
          amount: Number.isFinite(s.amount) ? s.amount : 0,
          description: s.description || '',
          ...(s.categoryId ? { categoryId: s.categoryId } : {}),
          ...(s.categoryId && s.subId ? { subId: s.subId } : {}),
          ...(s.transferId ? { transferId: s.transferId } : {}),
        }))
      : null;
    const sumCents = sourceSplits
      ? sourceSplits.reduce((acc, l) => acc + Math.round((Number.isFinite(l.amount) ? l.amount : 0) * 100), 0)
      : 0;
    const fromAmount = sourceSplits ? sumCents / 100 : -mag;
    const toAmount   = sourceSplits ? -sumCents / 100 : mag;
    validateSplits({ amount: fromAmount, splits: sourceSplits });

    setTransactions(prev => {
      const legs = prev.filter(t => t.transferId === transferId);
      if (legs.length === 0) return prev;
      const fromLegId = legs[0].id;
      const toLegId = legs[1] ? legs[1].id : null;
      return prev.map(t => {
        if (t.id === fromLegId) {
          const base = { ...t, accountId: fromId, amount: fromAmount, date, categoryId: cid, description: note, payeeId: null, checkNumber: null, transferId };
          if (sourceSplits) base.splits = sourceSplits;
          else delete base.splits;
          return base;
        }
        if (toLegId && t.id === toLegId) {
          return { ...t, accountId: toId, amount: toAmount, date, categoryId: cid, description: note, payeeId: null, checkNumber: null, transferId };
        }
        return t;
      });
    });
  }, []);

  const deleteTransfer = useCallback((transferId) => {
    if (!transferId) return;
    setTransactions(prev => prev.filter(t => t.transferId !== transferId));
  }, []);

  const clearSubcategory = useCallback((subId) => {
    if (!subId) return;
    setTransactions(prev => prev.map(t => {
      let changed = false;
      const next = { ...t };
      if (next.subId === subId) { delete next.subId; changed = true; }
      if (Array.isArray(next.splits)) {
        const lines = next.splits.map(s => {
          if (s.subId === subId) { const { subId: _drop, ...rest } = s; return rest; }
          return s;
        });
        if (lines.some((s, i) => s !== next.splits[i])) { next.splits = lines; changed = true; }
      }
      return changed ? next : t;
    }));
  }, []);

  // Null out one payee across the ledger (used by App when deleting a payee).
  const clearPayee = useCallback((payeeId) => {
    if (!payeeId) return;
    setTransactions(prev => prev.map(t => (t.payeeId === payeeId ? { ...t, payeeId: null } : t)));
  }, []);

  // Move every transaction from one payee to another (used by App when merging).
  const reassignPayee = useCallback((fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    setTransactions(prev => prev.map(t => (t.payeeId === fromId ? { ...t, payeeId: toId } : t)));
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
    clearSubcategory, clearPayee, reassignPayee,
    snapshot, restore,
    storageError, clearStorageError,
  };
}
