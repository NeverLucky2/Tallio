import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useCategories from './useCategories.js';
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_NAME, TRANSFER_SEED_CATEGORIES, BACKFILL_CATEGORIES } from './categoriesDefaults.js';

const STORAGE_KEY = 'tallio-categories';

beforeEach(() => {
  localStorage.clear();
});

describe('useCategories', () => {
  it('seeds DEFAULT_CATEGORIES + transfer seeds when localStorage is empty', () => {
    const { result } = renderHook(() => useCategories());
    expect(result.current.categories).toHaveLength(DEFAULT_CATEGORIES.length + TRANSFER_SEED_CATEGORIES.length);
    for (const cat of result.current.categories) expect(typeof cat.id).toBe('string');
    const names = result.current.categories.map(c => c.name);
    for (const s of TRANSFER_SEED_CATEGORIES) expect(names).toContain(s.name);
  });

  it('hydrates from localStorage and appends any missing transfer seeds', () => {
    const seeded = [{ id: 'cz', name: 'Zoo', icon: '🦓', color: '#000000', keywords: [], templates: [], builtin: false }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    const { result } = renderHook(() => useCategories());
    expect(result.current.categories.find(c => c.id === 'cz')).toEqual({ ...seeded[0], subcategories: [] });
    expect(result.current.categories).toHaveLength(1 + TRANSFER_SEED_CATEGORIES.length + BACKFILL_CATEGORIES.length);
  });

  it('backfills the Taxes category for stored data that lacks it', () => {
    const seeded = [{ id: 'cz', name: 'Zoo', icon: '🦓', color: '#000000', keywords: [], templates: [], builtin: false }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    const { result } = renderHook(() => useCategories());
    expect(result.current.categories.find(c => c.name === 'Taxes')).toBeTruthy();
  });

  it('does not duplicate transfer seeds that are already stored (idempotent load)', () => {
    const stored = TRANSFER_SEED_CATEGORIES.map((s, i) => ({ ...s, id: `t${i}` }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const { result } = renderHook(() => useCategories());
    expect(result.current.categories).toHaveLength(TRANSFER_SEED_CATEGORIES.length + BACKFILL_CATEGORIES.length);
  });

  it('addCategory preserves a transfer flow (not coerced to expense)', () => {
    const { result } = renderHook(() => useCategories());
    let id;
    act(() => { id = result.current.addCategory({ name: 'Payoff', icon: '✅', color: '#ffffff', flow: 'transfer' }); });
    expect(result.current.getById(id).flow).toBe('transfer');
  });

  it('addCategory appends a new category with a fresh id', () => {
    const { result } = renderHook(() => useCategories());
    let newId;
    act(() => {
      newId = result.current.addCategory({ name: 'Hobbies', icon: '🎨', color: '#FF00FF' });
    });
    const created = result.current.categories.find(c => c.id === newId);
    expect(created).toBeTruthy();
    expect(created.name).toBe('Hobbies');
    expect(created.builtin).toBe(false);
    expect(created.keywords).toEqual([]);
    expect(created.templates).toEqual([]);
  });

  it('updateCategory modifies fields without touching id', () => {
    const { result } = renderHook(() => useCategories());
    const target = result.current.categories[0];
    act(() => {
      result.current.updateCategory(target.id, { name: 'Renamed', color: '#123456' });
    });
    const updated = result.current.getById(target.id);
    expect(updated.id).toBe(target.id);
    expect(updated.name).toBe('Renamed');
    expect(updated.color).toBe('#123456');
  });

  it('deleteCategory removes the category when no items reference it', () => {
    const { result } = renderHook(() => useCategories());
    const target = result.current.categories[0];
    let outcome;
    act(() => {
      outcome = result.current.deleteCategory(target.id, []);
    });
    expect(outcome.deleted).toBe(true);
    expect(result.current.getById(target.id)).toBeUndefined();
  });

  it('deleteCategory refuses with itemCount when items reference it', () => {
    const { result } = renderHook(() => useCategories());
    const target = result.current.categories[0];
    const bills = [{ id: 'b1', items: [
      { id: 'i1', categoryId: target.id, description: 'x', amount: 1 },
      { id: 'i2', categoryId: target.id, description: 'y', amount: 2 },
    ]}];
    let outcome;
    act(() => { outcome = result.current.deleteCategory(target.id, bills); });
    expect(outcome.deleted).toBe(false);
    expect(outcome.itemCount).toBe(2);
    expect(result.current.getById(target.id)).toBeTruthy();
  });

  it('addKeyword appends to category and uppercases', () => {
    const { result } = renderHook(() => useCategories());
    const util = result.current.categories.find(c => c.name === 'Utilities');
    act(() => {
      result.current.addKeyword(util.id, 'peoples gas', []);
    });
    expect(result.current.getById(util.id).keywords).toContain('PEOPLES GAS');
  });

  it('addKeyword dedupes case-insensitive within the category', () => {
    const { result } = renderHook(() => useCategories());
    const util = result.current.categories.find(c => c.name === 'Utilities');
    act(() => { result.current.addKeyword(util.id, 'COMED', []); });
    act(() => { result.current.addKeyword(util.id, 'comed', []); });
    const comedCount = result.current.getById(util.id).keywords.filter(k => k === 'COMED').length;
    expect(comedCount).toBe(1);
  });

  it('addKeyword returns matchingItems from findItemsMatchingKeyword', () => {
    const { result } = renderHook(() => useCategories());
    const util = result.current.categories.find(c => c.name === 'Utilities');
    const bills = [{ id: 'b1', items: [
      { id: 'i1', description: 'Random PEOPLES GAS thing', categoryId: 'wrong-id' },
    ]}];
    let returned;
    act(() => {
      returned = result.current.addKeyword(util.id, 'PEOPLES GAS', bills);
    });
    expect(returned.matchingItems).toHaveLength(1);
    expect(returned.matchingItems[0].item.id).toBe('i1');
  });

  it('autoCategorize uses categories state and falls back to Other', () => {
    const { result } = renderHook(() => useCategories());
    const otherId = result.current.categories.find(c => c.name === OTHER_CATEGORY_NAME).id;
    expect(result.current.autoCategorize('totally unrelated text').categoryId).toBe(otherId);
    expect(result.current.autoCategorize('I went to MCDONALD').categoryId).toBe(
      result.current.categories.find(c => c.name === 'Dining').id
    );
  });

  it('removeKeyword strips the keyword without re-categorizing items', () => {
    const { result } = renderHook(() => useCategories());
    const dining = result.current.categories.find(c => c.name === 'Dining');
    act(() => {
      result.current.removeKeyword(dining.id, 'MCDONALD');
    });
    expect(result.current.getById(dining.id).keywords).not.toContain('MCDONALD');
  });

  it('addTemplate / removeTemplate manage templates list with dedup', () => {
    const { result } = renderHook(() => useCategories());
    const util = result.current.categories.find(c => c.name === 'Utilities');
    act(() => {
      result.current.addTemplate(util.id, 'Gas');
      result.current.addTemplate(util.id, 'gas');     // dedupe (case-insensitive)
      result.current.addTemplate(util.id, 'Electric');
    });
    expect(result.current.getById(util.id).templates).toEqual(['Gas', 'Electric']);
    act(() => { result.current.removeTemplate(util.id, 'Gas'); });
    expect(result.current.getById(util.id).templates).toEqual(['Electric']);
  });

  it('persists changes to localStorage', async () => {
    const { result } = renderHook(() => useCategories());
    act(() => {
      result.current.addCategory({ name: 'Z', icon: '🧪', color: '#000000' });
    });
    // Allow debounced persistence to flush.
    await new Promise(resolve => setTimeout(resolve, 300));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.some(c => c.name === 'Z')).toBe(true);
  });

  it('persists synchronously so two quickly-added subs both survive a reload', () => {
    const h1 = renderHook(() => useCategories());
    const catId = h1.result.current.categories[0].id;
    act(() => { h1.result.current.addSub(catId, { name: 'Mike' }); });
    act(() => { h1.result.current.addSub(catId, { name: 'John' }); });
    // No timer advance: a fresh hook (simulated reload) must already see both.
    const h2 = renderHook(() => useCategories());
    const subs = h2.result.current.categories.find(c => c.id === catId).subcategories;
    expect(subs.map(s => s.name)).toEqual(['Mike', 'John']);
  });

  it('addKeyword returns added=false when category does not exist', () => {
    const { result } = renderHook(() => useCategories());
    let returned;
    act(() => { returned = result.current.addKeyword('nonexistent-id', 'X', []); });
    expect(returned.added).toBe(false);
    expect(returned.matchingItems).toEqual([]);
  });

  it('addKeyword returns added=false when keyword already exists in that category', () => {
    const { result } = renderHook(() => useCategories());
    const dining = result.current.categories.find(c => c.name === 'Dining');
    let returned;
    act(() => { returned = result.current.addKeyword(dining.id, 'MCDONALD', []); });
    expect(returned.added).toBe(false);
    expect(returned.matchingItems).toEqual([]);
  });

  it('exposes storageError as null when persistence works', async () => {
    const { result } = renderHook(() => useCategories());
    act(() => { result.current.addCategory({ name: 'Z', icon: '🧪', color: '#000000' }); });
    await new Promise(r => setTimeout(r, 300));
    expect(result.current.storageError).toBeNull();
  });

  it('exposes storageError when localStorage.setItem throws', async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key) {
      if (key === 'tallio-categories') {
        const err = new Error('Quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      }
      return original.apply(this, arguments);
    };
    try {
      const { result } = renderHook(() => useCategories());
      act(() => { result.current.addCategory({ name: 'Z', icon: '🧪', color: '#000000' }); });
      await new Promise(r => setTimeout(r, 300));
      expect(result.current.storageError).not.toBeNull();
      expect(result.current.storageError.message).toMatch(/storage full/i);
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it('findItemsInCategory returns refs for items with the given categoryId', () => {
    const { result } = renderHook(() => useCategories());
    const dining = result.current.categories.find(c => c.name === 'Dining');
    const bills = [
      { id: 'b1', items: [
        { id: 'i1', categoryId: dining.id, description: 'A' },
        { id: 'i2', categoryId: 'other-id', description: 'B' },
        { id: 'i3', categoryId: dining.id, description: 'C' },
      ]},
    ];
    const refs = result.current.findItemsInCategory(dining.id, bills);
    expect(refs.map(r => r.item.id)).toEqual(['i1', 'i3']);
    expect(refs[0].billId).toBe('b1');
  });

  it('addCategory accepts flow and round-trips through localStorage', async () => {
    const { result } = renderHook(() => useCategories());

    let newId;
    await act(async () => {
      newId = result.current.addCategory({
        name: 'Side Hustle',
        icon: '💼',
        color: '#6BD49A',
        flow: 'income',
      });
    });

    const cat = result.current.getById(newId);
    expect(cat.flow).toBe('income');
    expect(cat.name).toBe('Side Hustle');
  });

  it('addCategory defaults flow to "expense" when omitted (backwards compatible)', async () => {
    const { result } = renderHook(() => useCategories());
    let newId;
    await act(async () => {
      newId = result.current.addCategory({ name: 'Hobby', icon: '🎨', color: '#fff' });
    });
    const cat = result.current.getById(newId);
    expect(cat.flow).toBe('expense');
  });

  it('clearStorageError resets storageError to null', async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key) {
      if (key === 'tallio-categories') throw new Error('Quota');
      return original.apply(this, arguments);
    };
    try {
      const { result } = renderHook(() => useCategories());
      act(() => { result.current.addCategory({ name: 'Z', icon: '🧪', color: '#000000' }); });
      await new Promise(r => setTimeout(r, 300));
      expect(result.current.storageError).not.toBeNull();
      Storage.prototype.setItem = original; // restore so next call succeeds
      act(() => { result.current.clearStorageError(); });
      expect(result.current.storageError).toBeNull();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it('snapshot/restore round-trips for undo (a rename is revertible)', () => {
    const { result } = renderHook(() => useCategories());
    const target = result.current.categories[0];
    let snap;
    act(() => { snap = result.current.snapshot(); });
    act(() => { result.current.updateCategory(target.id, { name: 'Renamed!!' }); });
    expect(result.current.getById(target.id).name).toBe('Renamed!!');
    act(() => { result.current.restore(snap); });
    expect(result.current.getById(target.id).name).toBe(target.name);
  });

  it('normalizes every seeded category to have a subcategories array', () => {
    const { result } = renderHook(() => useCategories());
    for (const c of result.current.categories) {
      expect(Array.isArray(c.subcategories)).toBe(true);
    }
  });

  it('normalizes stored categories that predate sub-categories on load', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { id: 'cz', name: 'Zoo', icon: '🦓', color: '#000000', keywords: [], templates: [], builtin: false },
    ]));
    const { result } = renderHook(() => useCategories());
    const zoo = result.current.categories.find(c => c.id === 'cz');
    expect(zoo.subcategories).toEqual([]);
  });

  it('addSub appends a sub with a fresh id and empty keywords; returns the id', () => {
    const { result } = renderHook(() => useCategories());
    const taxes = result.current.categories.find(c => c.name === 'Taxes');
    let subId;
    act(() => { subId = result.current.addSub(taxes.id, { name: 'Federal Tax' }); });
    const sub = result.current.getById(taxes.id).subcategories.find(s => s.id === subId);
    expect(sub.name).toBe('Federal Tax');
    expect(sub.keywords).toEqual([]);
  });

  it('updateSub patches name without changing the sub id', () => {
    const { result } = renderHook(() => useCategories());
    const taxes = result.current.categories.find(c => c.name === 'Taxes');
    let subId;
    act(() => { subId = result.current.addSub(taxes.id, { name: 'Fed' }); });
    act(() => { result.current.updateSub(taxes.id, subId, { name: 'Federal Tax' }); });
    const sub = result.current.getById(taxes.id).subcategories.find(s => s.id === subId);
    expect(sub.name).toBe('Federal Tax');
    expect(sub.id).toBe(subId);
  });

  it('deleteSub removes the sub', () => {
    const { result } = renderHook(() => useCategories());
    const taxes = result.current.categories.find(c => c.name === 'Taxes');
    let subId;
    act(() => { subId = result.current.addSub(taxes.id, { name: 'Federal Tax' }); });
    act(() => { result.current.deleteSub(taxes.id, subId); });
    expect(result.current.getById(taxes.id).subcategories.find(s => s.id === subId)).toBeUndefined();
  });

  it('addSubKeyword uppercases and dedupes; removeSubKeyword strips', () => {
    const { result } = renderHook(() => useCategories());
    const taxes = result.current.categories.find(c => c.name === 'Taxes');
    let subId;
    act(() => { subId = result.current.addSub(taxes.id, { name: 'Federal Tax' }); });
    act(() => { result.current.addSubKeyword(taxes.id, subId, 'federal tax'); });
    act(() => { result.current.addSubKeyword(taxes.id, subId, 'FEDERAL TAX'); });
    let sub = result.current.getById(taxes.id).subcategories.find(s => s.id === subId);
    expect(sub.keywords).toEqual(['FEDERAL TAX']);
    // removeSubKeyword with mixed-case, padded input still removes the stored uppercase keyword
    act(() => { result.current.removeSubKeyword(taxes.id, subId, '  federal tax  '); });
    sub = result.current.getById(taxes.id).subcategories.find(s => s.id === subId);
    expect(sub.keywords).toEqual([]);
  });

  it('promoteKeywordToSub moves a parent keyword onto a new Title-Cased sub', () => {
    const { result } = renderHook(() => useCategories());
    const taxes = result.current.categories.find(c => c.name === 'Taxes');
    let subId;
    act(() => { subId = result.current.promoteKeywordToSub(taxes.id, 'FEDERAL TAX'); });
    const cat = result.current.getById(taxes.id);
    expect(cat.keywords).not.toContain('FEDERAL TAX');
    const sub = cat.subcategories.find(s => s.id === subId);
    expect(sub.name).toBe('Federal Tax');
    expect(sub.keywords).toEqual(['FEDERAL TAX']);
  });
});

describe('applyCategoryToItems subId handling', () => {
  it('applyCategoryToItems clears subId on moved items', () => {
    const { result } = renderHook(() => useCategories());
    const bills = [{ id: 'b1', items: [{ id: 'i1', categoryId: 'old', subId: 'oldsub', amount: -5 }] }];
    let next;
    act(() => { next = result.current.applyCategoryToItems(bills, [{ billId: 'b1', item: bills[0].items[0] }], 'newcat'); });
    const it = next[0].items[0];
    expect(it.categoryId).toBe('newcat');
    expect(it.subId).toBeUndefined();
  });
});
