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
