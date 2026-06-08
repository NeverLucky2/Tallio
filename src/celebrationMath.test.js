import { describe, it, expect } from 'vitest';
import {
  formatThreshold,
  networthThresholdsReached,
  detectNetWorth,
  detectPaidOff,
  detectBestMonth,
  streakThresholdsReached,
  detectStreak,
  detectAchieved,
  CELEBRATION_TYPES,
  diffCelebrations,
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

describe('streakThresholdsReached', () => {
  it('returns crossed thresholds 3/6/12 then every 12', () => {
    expect(streakThresholdsReached(2)).toEqual([]);
    expect(streakThresholdsReached(6)).toEqual([3, 6]);
    expect(streakThresholdsReached(13)).toEqual([3, 6, 12]);
    expect(streakThresholdsReached(24)).toEqual([3, 6, 12, 24]);
  });
});

describe('detectStreak', () => {
  it('counts the trailing run of net-positive completed months', () => {
    // Jan..May all net-positive; current month June excluded -> Jan..May = 5 -> [3]
    const txns = [];
    for (const mo of ['01', '02', '03', '04', '05']) {
      txns.push(income(`i${mo}`, `2026-${mo}-05`, 1000));
      txns.push(expense(`e${mo}`, `2026-${mo}-06`, 100));
    }
    const res = detectStreak(txns, cats, NOW());
    expect(res.map(r => r.key)).toEqual(['streak:3']);
    expect(res[0].title).toContain('3-month');
  });
  it('a non-positive month breaks the streak', () => {
    const txns = [
      income('i1', '2026-01-05', 1000),                              // +1000
      income('i2', '2026-02-05', 1000),                              // +1000
      expense('e3', '2026-03-06', 100),                              // -100 (breaks)
      income('i4', '2026-04-05', 1000),                              // +1000
      income('i5', '2026-05-05', 1000),                              // +1000
    ];
    // trailing run = Apr,May = 2 -> no threshold
    expect(detectStreak(txns, cats, NOW())).toEqual([]);
  });
});

describe('detectAchieved', () => {
  it('unions all detector outputs', () => {
    const accounts = [
      { id: 'b', name: 'Checking', type: 'bank', openingBalance: 60000 },
      { id: 'cc', name: 'Visa', type: 'credit_card', openingBalance: -500 },
    ];
    const transactions = [{ id: 't1', accountId: 'cc', date: '2026-01-10', amount: 500 }];
    const keys = detectAchieved({ accounts, transactions, typesById, categoriesById: cats, now: NOW() }).map(r => r.key);
    expect(keys).toContain('paidoff:cc');
    expect(keys).toContain('networth:25000'); // 60000 (bank) - 0 (cc now) = 60000 net worth
  });
  it('returns [] for an empty ledger and exposes the known type list', () => {
    expect(detectAchieved({ accounts: [], transactions: [], typesById, categoriesById: cats, now: NOW() })).toEqual([]);
    expect(CELEBRATION_TYPES).toEqual(['paidoff', 'networth', 'bestmonth', 'streak']);
  });
});

const ach = (key, type) => ({ key, type, title: key, detail: '' });

describe('diffCelebrations', () => {
  it('first encounter of a type baselines silently (no celebration)', () => {
    const { toCelebrate, nextState } = diffCelebrations(
      [ach('paidoff:a', 'paidoff')],
      { seen: {}, baselinedTypes: [] },
    );
    expect(toCelebrate).toEqual([]);
    expect(nextState.seen['paidoff:a']).toBeTruthy();
    expect(nextState.baselinedTypes).toEqual(expect.arrayContaining(['paidoff', 'networth', 'bestmonth', 'streak']));
  });
  it('fires once for a new key after the type is baselined', () => {
    const baseline = diffCelebrations([], { seen: {}, baselinedTypes: [] }).nextState;
    const { toCelebrate, nextState } = diffCelebrations([ach('paidoff:a', 'paidoff')], baseline);
    expect(toCelebrate.map(m => m.key)).toEqual(['paidoff:a']);
    // already seen -> never again
    const again = diffCelebrations([ach('paidoff:a', 'paidoff')], nextState);
    expect(again.toCelebrate).toEqual([]);
  });
  it('keeps a seen key even when no longer achieved (no re-fire on re-cross)', () => {
    const baseline = diffCelebrations([], { seen: {}, baselinedTypes: [] }).nextState;
    const fired = diffCelebrations([ach('networth:100000', 'networth')], baseline).nextState;
    // dips below then crosses again — still seen, no celebration
    const recross = diffCelebrations([ach('networth:100000', 'networth')], fired);
    expect(recross.toCelebrate).toEqual([]);
    expect(recross.nextState.seen['networth:100000']).toBeTruthy();
  });
  it('baselines a newly-introduced type silently while still firing known types', () => {
    const state = { seen: {}, baselinedTypes: ['paidoff', 'networth', 'bestmonth', 'streak'] };
    const { toCelebrate } = diffCelebrations(
      [ach('paidoff:a', 'paidoff'), ach('newkind:x', 'newkind')],
      state,
    );
    // paidoff:a is baselined+new -> fires; newkind:x first-seen type -> silent
    expect(toCelebrate.map(m => m.key)).toEqual(['paidoff:a']);
  });
  it('tolerates null/empty inputs', () => {
    const { toCelebrate, nextState } = diffCelebrations(null, undefined);
    expect(toCelebrate).toEqual([]);
    expect(nextState.seen).toEqual({});
  });
});
