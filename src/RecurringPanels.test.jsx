import { describe, it, expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { findAutoRecurringChains, findRecurringCharges } from './spendingMath.js';

afterEach(() => cleanup());

describe('Recurring panel — auto + inferred shape', () => {
  const cats = [
    { id: 'c_auto', name: 'Auto', icon: '🚗', color: '#fff', flow: 'expense', keywords: [], templates: [], builtin: true },
  ];
  const catsById = new Map(cats.map(c => [c.id, c]));

  it('vendor-match suppression: auto chain hides inferred entry with same vendor', () => {
    const bills = [
      { id: 'b1', vendor: 'Honda Finance', month: '2026-03',
        recurring: true,  recurringChainId: 'rec_h',
        items: [{ id: 'i1', description: 'Auto loan', amount: 452, categoryId: 'c_auto', date: '2026-03-15' }] },
      { id: 'b2', vendor: 'Honda Finance', month: '2026-04',
        recurring: true,  recurringChainId: 'rec_h',
        items: [{ id: 'i2', description: 'Auto loan', amount: 452, categoryId: 'c_auto', date: '2026-04-15' }] },
    ];
    const auto = findAutoRecurringChains(bills, catsById);
    const inferred = findRecurringCharges(bills, '2026-04', catsById);
    expect(auto).toHaveLength(1);
    expect(auto[0].vendor).toBe('Honda Finance');
    const filtered = inferred.filter(i =>
      !auto.some(a => a.vendor.toLowerCase() === i.vendor.toLowerCase())
    );
    expect(filtered).toHaveLength(0);
  });
});
