// src/useAccountTypes.js
import { useState, useCallback, useEffect, useMemo } from 'react';
import { nanoid } from 'nanoid';
import { DEFAULT_ACCOUNT_TYPES } from './accountsModel.js';

const TYPES_KEY = 'tallio-account-types';

// Owns the account-type registry: load/seed/persist + CRUD. Mirrors useCategories.
export default function useAccountTypes() {
  const [types, setTypes] = useState(() => {
    try {
      const saved = localStorage.getItem(TYPES_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* fall through to seed */ }
    return DEFAULT_ACCOUNT_TYPES.map(t => ({ ...t }));
  });
  const [storageError, setStorageError] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(TYPES_KEY, JSON.stringify(types));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (storageError) setStorageError(null);
    } catch (e) {
      console.error('Failed to save account types:', e);
      setStorageError({ message: "Couldn't save account types — storage full." });
    }
  }, [types]); // eslint-disable-line react-hooks/exhaustive-deps

  const typesById = useMemo(() => new Map(types.map(t => [t.id, t])), [types]);

  const addType = useCallback(({ label, klass = 'offsheet', layout = 'compact', group = 'Unassigned', icon = '🏷️' }) => {
    const id = nanoid(8);
    setTypes(prev => [...prev, {
      id,
      label: (label || '').trim() || 'Untitled',
      klass: ['asset', 'liability', 'offsheet'].includes(klass) ? klass : 'offsheet',
      layout: layout === 'bank' ? 'bank' : 'compact',
      group: (group || '').trim() || 'Unassigned',
      icon: icon || '🏷️',
      builtin: false,
    }]);
    return id;
  }, []);

  const updateType = useCallback((id, patch) => {
    setTypes(prev => prev.map(t => t.id === id ? { ...t, ...patch, id: t.id } : t));
  }, []);

  const deleteType = useCallback((id) => {
    setTypes(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearStorageError = useCallback(() => setStorageError(null), []);

  const snapshot = useCallback(() => types, [types]);
  const restore = useCallback((snap) => {
    setTypes(Array.isArray(snap) ? snap : []);
  }, []);

  return { types, typesById, addType, updateType, deleteType, snapshot, restore, storageError, clearStorageError };
}
