import { describe, it, expect } from 'vitest';
import {
  formatThreshold,
  networthThresholdsReached,
  detectNetWorth,
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
