import { useState, useCallback, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import { autoCategorize as ruleAutoCategorize, findItemsMatchingKeyword } from './categoryRules.js';
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_NAME } from './categoriesDefaults.js';

const STORAGE_KEY = 'billtracker-categories';
const PERSIST_DEBOUNCE_MS = 250;

function seed() {
  return DEFAULT_CATEGORIES.map(c => ({ ...c, id: nanoid(8) }));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return seed();
    return parsed;
  } catch {
    return seed();
  }
}

export default function useCategories() {
  const [categories, setCategories] = useState(load);
  const [storageError, setStorageError] = useState(null);
  const persistTimer = useRef(null);

  // Debounced persistence.
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
        if (storageError !== null) setStorageError(null);
      } catch (e) {
        console.error('Failed to save categories:', e);
        setStorageError({ message: "Couldn't save categories — storage full." });
      }
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [categories]);

  const getById = useCallback(
    (id) => categories.find(c => c.id === id),
    [categories]
  );

  const otherId = useCallback(() => {
    const o = categories.find(c => c.name === OTHER_CATEGORY_NAME);
    return o ? o.id : (categories[0] && categories[0].id);
  }, [categories]);

  const addCategory = useCallback(({ name, icon, color }) => {
    const id = nanoid(8);
    setCategories(prev => [...prev, {
      id,
      name: (name || '').trim(),
      icon: icon || '📋',
      color: color || '#6B7280',
      keywords: [],
      templates: [],
      builtin: false,
    }]);
    return id;
  }, []);

  const updateCategory = useCallback((id, patch) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...patch, id: c.id } : c));
  }, []);

  const deleteCategory = useCallback((id, bills) => {
    let itemCount = 0;
    for (const b of bills || []) {
      for (const i of (b.items || [])) {
        if (i && i.categoryId === id) itemCount += 1;
      }
    }
    if (itemCount > 0) return { deleted: false, itemCount };
    setCategories(prev => prev.filter(c => c.id !== id));
    return { deleted: true, itemCount: 0 };
  }, []);

  const addKeyword = useCallback((catId, raw, bills) => {
    const kw = (raw || '').trim().toUpperCase();
    if (!kw) return { added: false, matchingItems: [] };
    const cat = categories.find(c => c.id === catId);
    if (!cat) return { added: false, matchingItems: [] };
    if (cat.keywords.includes(kw)) return { added: false, matchingItems: [] };

    setCategories(prev => prev.map(c =>
      c.id !== catId ? c : { ...c, keywords: [...c.keywords, kw] }
    ));
    const matchingItems = findItemsMatchingKeyword(kw, catId, bills, categories);
    return { added: true, matchingItems };
  }, [categories]);

  const removeKeyword = useCallback((catId, keyword) => {
    const kw = (keyword || '').toUpperCase();
    setCategories(prev => prev.map(c =>
      c.id === catId ? { ...c, keywords: c.keywords.filter(k => k !== kw) } : c
    ));
  }, []);

  const addTemplate = useCallback((catId, raw) => {
    const t = (raw || '').trim();
    if (!t) return;
    setCategories(prev => prev.map(c => {
      if (c.id !== catId) return c;
      const existing = c.templates.find(x => x.toLowerCase() === t.toLowerCase());
      if (existing) return c;
      return { ...c, templates: [...c.templates, t] };
    }));
  }, []);

  const removeTemplate = useCallback((catId, template) => {
    setCategories(prev => prev.map(c =>
      c.id === catId ? { ...c, templates: c.templates.filter(t => t !== template) } : c
    ));
  }, []);

  const clearStorageError = useCallback(() => setStorageError(null), []);

  const autoCategorize = useCallback(
    (description) => ruleAutoCategorize(description, categories, otherId()),
    [categories, otherId]
  );

  // Bulk-update items' categoryId — used by the confirm-and-apply flow. Returns
  // the new bills array; caller is responsible for setBills + pushHistory.
  const applyCategoryToItems = useCallback((bills, itemRefs, categoryId) => {
    const itemIds = new Set(itemRefs.map(r => r.item.id));
    return bills.map(b => ({
      ...b,
      items: (b.items || []).map(i =>
        itemIds.has(i.id) ? { ...i, categoryId } : i
      ),
    }));
  }, []);

  return {
    categories,
    getById,
    otherId,
    addCategory,
    updateCategory,
    deleteCategory,
    addKeyword,
    removeKeyword,
    addTemplate,
    removeTemplate,
    autoCategorize,
    applyCategoryToItems,
    storageError,
    clearStorageError,
  };
}
