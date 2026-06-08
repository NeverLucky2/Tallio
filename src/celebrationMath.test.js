import { describe, it, expect } from 'vitest';
import {
  formatThreshold,
  networthThresholdsReached,
  detectNetWorth,
  detectPaidOff,
  detectBestMonth,
} from './celebrationMath.js';
import { DEFAULT_ACCOUNT_TYPES_BY_ID } from './accountsModel.js';

const typesById = DEFAULT_ACCOUNT_TYPES_BY_ID;

describe('formatThreshold', () => {
  it('formats thousands and millions', () => {
    expect(formatThreshold(25000)).toBe('$25k');
    expect(formatThreshold(100000)).toBe('$100k');
    expect(formatThreshold(750000)).toBe('$750k');
    expect(formatThreshold(1000000)).toBe('$1M');
    expect(formatThreshold(1500000)).toBe('$1.5M');
    expect(formatThreshold(2000000)).toBe('$2M');
  });
});

describe('networthThresholdsReached', () => {
  it('returns every ladder value at or below net worth', () => {
    expect(networthThresholdsReached(0)).toEqual([]);
    expect(networthThresholdsReached(60000)).toEqual([25000, 50000]);
    expect(networthThresholdsReached(300000)).toEqual([25000, 50000, 100000, 250000]);
  });
  it('extends past $1M in $500k steps', () => {
    expect(networthThresholdsReached(2000000)).toEqual([
      25000, 50000, 100000, 250000, 500000, 750000, 1000000, 1500000, 2000000,
    ]);
  });
});

describe('detectNetWorth', () => {
  it('emits a milestone per reached threshold from household net worth', () => {
    const accounts = [{ id: 'b', name: 'Checking', type: 'bank', openingBalance: 60000 }];
    const res = detectNetWorth(accounts, [], typesById);
    expect(res.map(r => r.key)).toEqual(['networth:25000', 'networth:50000']);
    expect(res[1]).toMatchObject({ type: 'networth', title: '$50k net worth!' });
  });
  it('returns nothing when net worth is below the first rung', () => {
    const accounts = [{ id: 'b', name: 'Checking', type: 'bank', openingBalance: 100 }];
    expect(detectNetWorth(accounts, [], typesById)).toEqual([]);
  });
});

describe('detectPaidOff', () => {
  it('fires when a liability that was ever negative is now >= 0', () => {
    const accounts = [{ id: 'cc', name: 'Visa', type: 'credit_card', openingBalance: -500 }];
    const transactions = [{ id: 't1', accountId: 'cc', date: '2026-01-10', amount: 500 }];
    const res = detectPaidOff(accounts, transactions, typesById);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ key: 'paidoff:cc', type: 'paidoff' });
    expect(res[0].title).toContain('Visa');
  });
  it('does not fire for a liability still in debt', () => {
    const accounts = [{ id: 'cc', name: 'Visa', type: 'credit_card', openingBalance: -500 }];
    const transactions = [{ id: 't1', accountId: 'cc', date: '2026-01-10', amount: 200 }];
    expect(detectPaidOff(accounts, transactions, typesById)).toEqual([]);
  });
  it('does not fire for a liability that was never negative (no activity)', () => {
    const accounts = [{ id: 'cc', name: 'New Card', type: 'credit_card', openingBalance: 0 }];
    expect(detectPaidOff(accounts, [], typesById)).toEqual([]);
  });
  it('ignores asset accounts at zero', () => {
    const accounts = [{ id: 'b', name: 'Checking', type: 'bank', openingBalance: -10 }];
    const transactions = [{ id: 't1', accountId: 'b', date: '2026-01-10', amount: 10 }];
    expect(detectPaidOff(accounts, transactions, typesById)).toEqual([]);
  });
});

const cats = new Map([
  ['inc', { id: 'inc', flow: 'income' }],
  ['exp', { id: 'exp', flow: 'expense' }],
]);
// Helpers to build a month's worth of income/expense rows on a bank account.
const income = (id, date, amt) => ({ id, accountId: 'b', date, amount: amt, categoryId: 'inc' });
const expense = (id, date, amt) => ({ id, accountId: 'b', date, amount: -amt, categoryId: 'exp' });
const NOW = () => new Date('2026-06-15T00:00:00');

describe('detectBestMonth', () => {
  it('returns nothing with fewer than 3 completed months', () => {
    const txns = [income('i1', '2026-01-05', 1000), income('i2', '2026-02-05', 2000)];
    expect(detectBestMonth(txns, cats, NOW())).toEqual([]);
  });
  it('flags the single completed month that beats all priors', () => {
    const txns = [
      income('i1', '2026-01-05', 1000), expense('e1', '2026-01-06', 200), // net 800
      income('i2', '2026-02-05', 1000), expense('e2', '2026-02-06', 100), // net 900
      income('i3', '2026-03-05', 3000), expense('e3', '2026-03-06', 100), // net 2900 (best)
      income('i4', '2026-04-05', 1000),                                   // net 1000
    ];
    const res = detectBestMonth(txns, cats, NOW());
    expect(res).toHaveLength(1);
    expect(res[0].key).toBe('bestmonth:2026-03');
    expect(res[0].detail).toContain('March 2026');
  });
  it('excludes the current (incomplete) month from records', () => {
    const txns = [
      income('i1', '2026-01-05', 1000), income('i2', '2026-02-05', 1000), income('i3', '2026-03-05', 1000),
      income('i4', '2026-06-05', 9999), // current month — must not be the record
    ];
    const res = detectBestMonth(txns, cats, NOW());
    expect(res[0].key).not.toBe('bestmonth:2026-06');
  });
  it('returns nothing when the best completed month is not positive', () => {
    const txns = [
      expense('e1', '2026-01-06', 200), expense('e2', '2026-02-06', 100), expense('e3', '2026-03-06', 100),
    ];
    expect(detectBestMonth(txns, cats, NOW())).toEqual([]);
  });
});
