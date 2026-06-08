import { describe, it, expect } from 'vitest';
import { filterCategoriesByQuery } from './categoriesSearch.js';

const cats = [
  { id: 'c1', name: 'Taxes', subcategories: [{ id: 's1', name: 'Federal Tax', keywords: [] }] },
  { id: 'c2', name: 'Groceries', subcategories: [] },
];

describe('filterCategoriesByQuery', () => {
  it('returns all categories for an empty query', () => {
    expect(filterCategoriesByQuery(cats, '')).toHaveLength(2);
  });

  it('matches on category name (case-insensitive)', () => {
    expect(filterCategoriesByQuery(cats, 'groc').map(c => c.id)).toEqual(['c2']);
  });

  it('matches a category when one of its sub names matches', () => {
    expect(filterCategoriesByQuery(cats, 'federal').map(c => c.id)).toEqual(['c1']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterCategoriesByQuery(cats, 'zzz')).toEqual([]);
  });
});

import { flattenForPicker, filterOptions } from './categoriesSearch.js';

const pickerCats = [
  { id: 'inc', name: 'Paycheck', icon: '💼', flow: 'income', subcategories: [] },
  { id: 'tax', name: 'Taxes', icon: '🏛️', flow: 'expense', subcategories: [
    { id: 'state', name: 'State Tax', keywords: [] },
    { id: 'fed',   name: 'Federal Tax', keywords: [] },
  ] },
];

describe('flattenForPicker', () => {
  it('orders by flow then category A→Z, each category followed by its subs A→Z', () => {
    const opts = flattenForPicker(pickerCats);
    expect(opts.map(o => o.path)).toEqual([
      'Paycheck', 'Taxes', 'Taxes › Federal Tax', 'Taxes › State Tax',
    ]);
    const fed = opts.find(o => o.subId === 'fed');
    expect(fed).toMatchObject({ kind: 'sub', categoryId: 'tax', subId: 'fed', flow: 'expense', icon: '🏛️' });
    expect(opts.find(o => o.categoryId === 'tax' && o.kind === 'category').subId).toBe(null);
  });
});

describe('filterOptions', () => {
  it('empty query returns all options', () => {
    const opts = flattenForPicker(pickerCats);
    expect(filterOptions(opts, '')).toHaveLength(opts.length);
  });
  it('matching a sub keeps its parent for context plus the matching sub', () => {
    const opts = flattenForPicker(pickerCats);
    const r = filterOptions(opts, 'federal');
    expect(r.map(o => o.path)).toEqual(['Taxes', 'Taxes › Federal Tax']);
  });
  it('matching a parent includes all its subs', () => {
    const opts = flattenForPicker(pickerCats);
    const r = filterOptions(opts, 'taxes');
    expect(r.map(o => o.path)).toEqual(['Taxes', 'Taxes › Federal Tax', 'Taxes › State Tax']);
  });
});
