import { describe, it, expect } from 'vitest';
import { countIconUsage } from './iconUsage.js';

const data = {
  categories: [
    { id: 'c1', icon: 'img:photo1' },
    { id: 'c2', icon: '🛒', subcategories: [{ id: 's1', icon: 'img:photo1' }] },
  ],
  accounts: [{ id: 'a1', icon: 'img:photo1' }, { id: 'a2', icon: '🏦' }],
  accountTypes: [{ id: 't1', icon: '🏷️' }],
  appIcons: { headerAvatar: 'img:photo1' },
};

describe('countIconUsage', () => {
  it('counts every category, sub, account, type, and app-icon reference', () => {
    expect(countIconUsage('photo1', data)).toBe(4);
  });
  it('returns 0 for an unused image', () => {
    expect(countIconUsage('nope', data)).toBe(0);
  });
  it('tolerates missing collections', () => {
    expect(countIconUsage('photo1', {})).toBe(0);
  });
});
