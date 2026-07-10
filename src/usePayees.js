// src/usePayees.js
import { useState, useCallback, useEffect, useMemo } from 'react';
import { nanoid } from 'nanoid';

const STORAGE_KEY = 'tallio-payees';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const norm = (name) => (name || '').trim().toLowerCase();

// Managed payee entities: { id, name, defaultCategoryId, defaultSubcategoryId }.
// Names are unique case-insensitively; addPayee returns the existing id on a match.
export default function usePayees() {
  const [payees, setPayees] = useState(load);
  const [storageError, setStorageError] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payees));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (storageError !== null) setStorageError(null);
    } catch (e) {
      console.error('Failed to save payees:', e);
      setStorageError({ message: "Couldn't save payee — storage full." });
    }
  }, [payees]); // eslint-disable-line react-hooks/exhaustive-deps

  const addPayee = useCallback((name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const existing = payees.find(p => norm(p.name) === norm(trimmed));
    if (existing) return existing.id;
    const id = nanoid(8);
    setPayees(prev => [...prev, { id, name: trimmed, defaultCategoryId: null, defaultSubcategoryId: null }]);
    return id;
  }, [payees]);

  const renamePayee = useCallback((id, name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return { ok: false, reason: 'empty' };
    const conflict = payees.find(p => p.id !== id && norm(p.name) === norm(trimmed));
    if (conflict) return { ok: false, reason: 'duplicate', conflictId: conflict.id };
    setPayees(prev => prev.map(p => (p.id === id ? { ...p, name: trimmed } : p)));
    return { ok: true };
  }, [payees]);

  const setDefaultCategory = useCallback((id, categoryId, subcategoryId = null) => {
    setPayees(prev => prev.map(p => (p.id === id
      ? { ...p, defaultCategoryId: categoryId || null, defaultSubcategoryId: categoryId ? (subcategoryId || null) : null }
      : p)));
  }, []);

  const deletePayee = useCallback((id) => {
    setPayees(prev => prev.filter(p => p.id !== id));
  }, []);

  // Merge = drop the source entity; the caller reassigns the source's
  // transactions (ledger.reassignPayee) so App can make both one undo step.
  // The target's defaults are deliberately left unchanged.
  const mergePayee = useCallback((sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setPayees(prev => prev.filter(p => p.id !== sourceId));
  }, []);

  const payeesById = useMemo(() => new Map(payees.map(p => [p.id, p])), [payees]);

  const snapshot = useCallback(() => payees, [payees]);
  const restore = useCallback((list) => setPayees(Array.isArray(list) ? list : []), []);
  const clearStorageError = useCallback(() => setStorageError(null), []);

  return {
    payees, payeesById,
    addPayee, renamePayee, setDefaultCategory, deletePayee, mergePayee,
    snapshot, restore, storageError, clearStorageError,
  };
}
