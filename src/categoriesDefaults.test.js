import { describe, it, expect } from 'vitest';
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_NAME } from './categoriesDefaults.js';

describe('DEFAULT_CATEGORIES', () => {
  it('exports 14 seed categories', () => {
    expect(DEFAULT_CATEGORIES).toHaveLength(14);
  });

  it('every category has the required shape', () => {
    for (const cat of DEFAULT_CATEGORIES) {
      expect(typeof cat.name).toBe('string');
      expect(cat.name.length).toBeGreaterThan(0);
      expect(typeof cat.icon).toBe('string');
      expect(typeof cat.color).toBe('string');
      expect(cat.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(Array.isArray(cat.keywords)).toBe(true);
      expect(Array.isArray(cat.templates)).toBe(true);
      expect(cat.builtin).toBe(true);
    }
  });

  it('"Other" exists and matches OTHER_CATEGORY_NAME', () => {
    expect(OTHER_CATEGORY_NAME).toBe('Other');
    expect(DEFAULT_CATEGORIES.some(c => c.name === 'Other')).toBe(true);
  });

  it('Dining seeds keywords inverted from autoCategorizeTx', () => {
    const dining = DEFAULT_CATEGORIES.find(c => c.name === 'Dining');
    expect(dining.keywords).toEqual(expect.arrayContaining([
      'MCDONALD', 'KFC', 'POPEYES', 'KRISPY', 'RESTAURANT', 'CHINESE',
      "SHARK'S FISH", "HOY'S",
    ]));
  });

  it('Donations seeds the full church/charity keyword set', () => {
    const donations = DEFAULT_CATEGORIES.find(c => c.name === 'Donations');
    expect(donations.keywords).toEqual(expect.arrayContaining([
      'CHURCH', 'CHRISTIAN', 'CHAPEL', 'MINISTRY', 'MINISTRIES', 'MISSION',
      'SALVATION ARMY', 'GOODWILL', 'HABITAT', 'RED CROSS', 'DONATION',
      'TITHE', 'PARISH', 'DIOCESE', 'SYNAGOGUE', 'MOSQUE', 'TEMPLE',
      'CHARITY', 'FOUNDATION', 'NONPROFIT', 'NON-PROFIT',
    ]));
  });

  it('templates start empty for every category', () => {
    for (const cat of DEFAULT_CATEGORIES) {
      expect(cat.templates).toEqual([]);
    }
  });

  it('keywords are uppercase', () => {
    for (const cat of DEFAULT_CATEGORIES) {
      for (const kw of cat.keywords) {
        expect(kw).toBe(kw.toUpperCase());
      }
    }
  });
});
