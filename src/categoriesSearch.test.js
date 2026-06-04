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
