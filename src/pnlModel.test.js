// src/pnlModel.test.js
import { describe, it, expect } from 'vitest';
import { bucketsInRange, bucketKeyForMonth } from './pnlModel.js';

const txns = [
  { id: 't1', date: '2026-01-15', amount: -10, categoryId: 'c1' },
  { id: 't2', date: '2026-04-15', amount: -10, categoryId: 'c1' },
];

describe('bucketKeyForMonth', () => {
  it('maps a month to month/quarter/year keys', () => {
    expect(bucketKeyForMonth('2026-01', 'month')).toBe('2026-01');
    expect(bucketKeyForMonth('2026-01', 'quarter')).toBe('2026-Q1');
    expect(bucketKeyForMonth('2026-04', 'quarter')).toBe('2026-Q2');
    expect(bucketKeyForMonth('2026-12', 'quarter')).toBe('2026-Q4');
    expect(bucketKeyForMonth('2026-07', 'year')).toBe('2026');
    expect(bucketKeyForMonth('', 'month')).toBeNull();
  });
});

describe('bucketsInRange', () => {
  it('monthly buckets within a single year drop the year suffix', () => {
    const b = bucketsInRange('2026-01-01', '2026-03-31', [], 'month');
    expect(b).toEqual([
      { key: '2026-01', label: 'Jan' },
      { key: '2026-02', label: 'Feb' },
      { key: '2026-03', label: 'Mar' },
    ]);
  });

  it('monthly labels gain a year suffix when the range spans years', () => {
    const b = bucketsInRange('2025-12-01', '2026-01-31', [], 'month');
    expect(b).toEqual([
      { key: '2025-12', label: "Dec '25" },
      { key: '2026-01', label: "Jan '26" },
    ]);
  });

  it('quarterly buckets dedupe months into quarters', () => {
    const b = bucketsInRange('2026-01-01', '2026-06-30', [], 'quarter');
    expect(b).toEqual([
      { key: '2026-Q1', label: "Q1 '26" },
      { key: '2026-Q2', label: "Q2 '26" },
    ]);
  });

  it('yearly buckets dedupe months into years', () => {
    const b = bucketsInRange('2025-06-01', '2026-06-30', [], 'year');
    expect(b).toEqual([
      { key: '2025', label: '2025' },
      { key: '2026', label: '2026' },
    ]);
  });

  it('derives open-ended (all-time) bounds from transactions', () => {
    const b = bucketsInRange(null, null, txns, 'quarter');
    expect(b).toEqual([
      { key: '2026-Q1', label: "Q1 '26" },
      { key: '2026-Q2', label: "Q2 '26" },
    ]);
  });
});
