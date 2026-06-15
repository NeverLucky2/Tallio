// src/useTemplates.js
import { useState, useCallback, useEffect } from 'react';
import { nanoid } from 'nanoid';

const STORAGE_KEY = 'tallio-templates';

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

// Named, persisted library of entry drafts (transactions and transfers).
export default function useTemplates() {
  const [templates, setTemplates] = useState(load);
  const [storageError, setStorageError] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (storageError !== null) setStorageError(null);
    } catch (e) {
      console.error('Failed to save templates:', e);
      setStorageError({ message: "Couldn't save template — storage full." });
    }
  }, [templates]); // eslint-disable-line react-hooks/exhaustive-deps

  const addTemplate = useCallback((name, draft) => {
    const item = { id: nanoid(8), name: (name || 'Untitled').trim(), kind: draft.kind, payload: draft.payload, createdAt: new Date().toISOString() };
    setTemplates(prev => [...prev, item]);
    return item.id;
  }, []);
  const deleteTemplate = useCallback((id) => setTemplates(prev => prev.filter(t => t.id !== id)), []);
  const exportSnapshot = useCallback(() => templates, [templates]);
  const restore = useCallback((list) => setTemplates(Array.isArray(list) ? list : []), []);
  const clearStorageError = useCallback(() => setStorageError(null), []);

  return { templates, addTemplate, deleteTemplate, exportSnapshot, restore, storageError, clearStorageError };
}
