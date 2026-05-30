import { describe, it, expect } from 'vitest';
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_NAME, V3_SEED_CATEGORIES, TRANSFER_SEED_CATEGORIES, withTransferSeeds, BACKFILL_CATEGORIES, withBackfillCategories } from './categoriesDefaults.js';

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

describe('transfer seed categories', () => {
  it('every seed is flow:transfer with empty keywords', () => {
    for (const s of TRANSFER_SEED_CATEGORIES) {
      expect(s.flow).toBe('transfer');
      expect(s.keywords).toEqual([]);
    }
  });

  it('seed names do not collide with default or v3 category names', () => {
    const existing = new Set([...DEFAULT_CATEGORIES, ...V3_SEED_CATEGORIES].map(c => c.name));
    for (const s of TRANSFER_SEED_CATEGORIES) expect(existing.has(s.name)).toBe(false);
  });

  it('withTransferSeeds appends all seeds (with string ids) to an empty list', () => {
    const out = withTransferSeeds([]);
    expect(out).toHaveLength(TRANSFER_SEED_CATEGORIES.length);
    for (const c of out) expect(typeof c.id).toBe('string');
    expect(out.map(c => c.name).sort()).toEqual(TRANSFER_SEED_CATEGORIES.map(s => s.name).sort());
  });

  it('is idempotent — second pass adds nothing and returns the same reference', () => {
    const once = withTransferSeeds([]);
    const twice = withTransferSeeds(once);
    expect(twice).toBe(once);
  });

  it('appends only missing seeds, preserving existing categories without duplicating', () => {
    const existing = [
      { id: 'x', name: 'Credit Card Payment', flow: 'transfer' },
      { id: 'y', name: 'Groceries', flow: 'expense' },
    ];
    const out = withTransferSeeds(existing);
    const names = out.map(c => c.name);
    expect(names).toContain('Groceries');
    expect(names.filter(n => n === 'Credit Card Payment')).toHaveLength(1);
    expect(names).toContain('Internal Transfer');
  });
});

describe('builtin backfill categories', () => {
  it('BACKFILL_CATEGORIES contains the Taxes builtin', () => {
    expect(BACKFILL_CATEGORIES.map(c => c.name)).toContain('Taxes');
  });

  it('withBackfillCategories appends Taxes when missing, with a string id', () => {
    const out = withBackfillCategories([{ id: 'x', name: 'Groceries', flow: 'expense' }]);
    const taxes = out.find(c => c.name === 'Taxes');
    expect(taxes).toBeTruthy();
    expect(typeof taxes.id).toBe('string');
  });

  it('does not duplicate Taxes when already present and returns the same reference', () => {
    const existing = [{ id: 't', name: 'Taxes', flow: 'expense' }];
    const out = withBackfillCategories(existing);
    expect(out).toBe(existing);
    expect(out.filter(c => c.name === 'Taxes')).toHaveLength(1);
  });
});
