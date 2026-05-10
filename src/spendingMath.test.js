import { describe, it, expect } from 'vitest';
import { migrateBills, getItemDate } from './spendingMath.js';

describe('migrateBills', () => {
  it('converts bill.date YYYY-MM-DD to bill.month YYYY-MM', () => {
    const input = [{ id: '1', vendor: 'Chase', date: '2026-05-09', items: [] }];
    const result = migrateBills(input);
    expect(result[0].month).toBe('2026-05');
    expect(result[0].date).toBeUndefined();
  });

  it('leaves bills that already have month untouched', () => {
    const input = [{ id: '1', vendor: 'Chase', month: '2026-05', items: [] }];
    const result = migrateBills(input);
    expect(result[0].month).toBe('2026-05');
    expect(result[0].date).toBeUndefined();
  });

  it('falls back to current month when date is invalid', () => {
    const input = [{ id: '1', vendor: 'Chase', date: 'not-a-date', items: [] }];
    const result = migrateBills(input);
    expect(result[0].month).toMatch(/^\d{4}-\d{2}$/);
  });

  it('falls back to current month when neither date nor month is present', () => {
    const input = [{ id: '1', vendor: 'Chase', items: [] }];
    const result = migrateBills(input);
    expect(result[0].month).toMatch(/^\d{4}-\d{2}$/);
  });

  it('preserves vendor, items, and id', () => {
    const input = [{
      id: '1', vendor: 'Chase', date: '2026-05-09',
      items: [{ id: 'a', description: 'Coffee', amount: 4.5, category: 'Dining' }],
    }];
    const result = migrateBills(input);
    expect(result[0].id).toBe('1');
    expect(result[0].vendor).toBe('Chase');
    expect(result[0].items).toHaveLength(1);
  });

  it('does not mutate input', () => {
    const input = [{ id: '1', vendor: 'Chase', date: '2026-05-09', items: [] }];
    const snapshot = JSON.parse(JSON.stringify(input));
    migrateBills(input);
    expect(input).toEqual(snapshot);
  });
});

describe('getItemDate', () => {
  it('returns item.date when it is a valid YYYY-MM-DD', () => {
    const bill = { month: '2026-05' };
    const item = { date: '2026-05-15' };
    expect(getItemDate(bill, item)).toBe('2026-05-15');
  });

  it('falls back to bill.month + "-01" when item.date is missing', () => {
    const bill = { month: '2026-05' };
    const item = { description: 'Coffee', amount: 4.5 };
    expect(getItemDate(bill, item)).toBe('2026-05-01');
  });

  it('falls back when item.date is null', () => {
    const bill = { month: '2026-05' };
    const item = { date: null };
    expect(getItemDate(bill, item)).toBe('2026-05-01');
  });

  it('falls back when item.date is malformed', () => {
    const bill = { month: '2026-05' };
    const item = { date: 'May 9' };
    expect(getItemDate(bill, item)).toBe('2026-05-01');
  });

  it('honors item dates outside bill month (cycles can span months)', () => {
    const bill = { month: '2026-05' };
    const item = { date: '2026-04-28' };
    expect(getItemDate(bill, item)).toBe('2026-04-28');
  });
});
