import { describe, it, expect } from 'vitest';
import { autoCategorize } from './categoryRules.js';

const cats = [
  { id: 'c_other', name: 'Other', keywords: [] },
  { id: 'c_util',  name: 'Utilities', keywords: ['PEOPLES GAS', 'COMED'] },
  { id: 'c_trans', name: 'Transportation', keywords: ['GAS', 'SHELL'] },
  { id: 'c_dine',  name: 'Dining', keywords: ['MCDONALD'] },
];

describe('autoCategorize', () => {
  it('returns fallback id when description is empty', () => {
    expect(autoCategorize('', cats, 'c_other')).toBe('c_other');
    expect(autoCategorize(null, cats, 'c_other')).toBe('c_other');
  });

  it('returns fallback id when no keyword matches', () => {
    expect(autoCategorize('SOMETHING UNRELATED', cats, 'c_other')).toBe('c_other');
  });

  it('matches case-insensitively', () => {
    expect(autoCategorize('mcdonald', cats, 'c_other')).toBe('c_dine');
  });

  it('returns the longest-matching keyword winner', () => {
    // "PEOPLES GAS" (11) beats "GAS" (3)
    expect(autoCategorize('PEOPLES GAS BILL MAY', cats, 'c_other')).toBe('c_util');
  });

  it('returns the shorter match when longer one is not present', () => {
    expect(autoCategorize('SHELL STATION 123', cats, 'c_other')).toBe('c_trans');
  });

  it('breaks ties by category display order (first wins)', () => {
    const tieCats = [
      { id: 'c_other', name: 'Other', keywords: [] },
      { id: 'c_a', name: 'A', keywords: ['XYZ'] },
      { id: 'c_b', name: 'B', keywords: ['XYZ'] },
    ];
    expect(autoCategorize('XYZ FOO', tieCats, 'c_other')).toBe('c_a');
  });

  it('ignores empty keywords', () => {
    const evilCats = [
      { id: 'c_other', name: 'Other', keywords: [] },
      { id: 'c_evil',  name: 'Evil', keywords: [''] },
    ];
    expect(autoCategorize('LITERALLY ANYTHING', evilCats, 'c_other')).toBe('c_other');
  });

  it('returns fallback id when categories array is empty', () => {
    expect(autoCategorize('ANYTHING', [], 'c_other')).toBe('c_other');
  });
});

import { findItemsMatchingKeyword } from './categoryRules.js';

describe('findItemsMatchingKeyword', () => {
  const cats = [
    { id: 'c_other', name: 'Other', keywords: [] },
    { id: 'c_util',  name: 'Utilities', keywords: ['PEOPLES GAS', 'COMED'] },
    { id: 'c_trans', name: 'Transportation', keywords: ['GAS', 'SHELL'] },
  ];
  const bills = [
    { id: 'b1', items: [
      { id: 'i1', description: 'Shell pump 5', categoryId: 'c_trans' },     // matched on SHELL (5)
      { id: 'i2', description: 'Peoples Gas May', categoryId: 'c_util' },   // matched on PEOPLES GAS (11)
      { id: 'i3', description: 'Random GAS thing', categoryId: 'c_trans' }, // matched on GAS (3)
      { id: 'i4', description: 'Unrelated', categoryId: 'c_other' },
    ]},
  ];

  it('returns items where new keyword length > current match length', () => {
    // Adding "RANDOM GAS" (10) to Utilities should beat the current GAS (3) match on i3.
    const matches = findItemsMatchingKeyword('RANDOM GAS', 'c_util', bills, cats);
    const ids = matches.map(m => m.item.id);
    expect(ids).toEqual(['i3']);
    // Each match carries the bill so the caller can locate the item.
    expect(matches[0].billId).toBe('b1');
  });

  it('does NOT return items already in the target category', () => {
    // Adding "GAS" to Utilities — i3 currently matches GAS (3). New GAS in Utilities
    // would tie at 3, not win. i2 already matches PEOPLES GAS (11) — GAS would lose.
    // i1 description does not contain GAS as a substring of "Shell pump 5"? It does not.
    const matches = findItemsMatchingKeyword('GAS', 'c_util', bills, cats);
    expect(matches).toEqual([]);
  });

  it('matches case-insensitively', () => {
    const matches = findItemsMatchingKeyword('shell pump', 'c_util', bills, cats);
    expect(matches.map(m => m.item.id)).toEqual(['i1']); // 'SHELL PUMP'(10) > 'SHELL'(5)
  });

  it('returns empty for empty keyword', () => {
    expect(findItemsMatchingKeyword('', 'c_util', bills, cats)).toEqual([]);
    expect(findItemsMatchingKeyword(null, 'c_util', bills, cats)).toEqual([]);
  });

  it('returns empty when no items contain the keyword', () => {
    expect(findItemsMatchingKeyword('NEVERMATCHES', 'c_util', bills, cats)).toEqual([]);
  });
});
