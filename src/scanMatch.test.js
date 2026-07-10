// src/scanMatch.test.js
import { describe, it, expect } from 'vitest';
import { matchAccountByVendor } from './scanMatch.js';

const accounts = [
  { id: 'a1', name: 'Chase Sapphire' },
  { id: 'a2', name: 'Amex Gold' },
  { id: 'a3', name: 'Checking' },
];

describe('matchAccountByVendor', () => {
  it('returns null for empty/nullish vendor', () => {
    expect(matchAccountByVendor('', accounts)).toBeNull();
    expect(matchAccountByVendor(null, accounts)).toBeNull();
    expect(matchAccountByVendor('Chase', [])).toBeNull();
  });
  it('matches case- and punctuation-insensitively when equal', () => {
    expect(matchAccountByVendor('chase sapphire', accounts).id).toBe('a1');
    expect(matchAccountByVendor('AMEX  GOLD!', accounts).id).toBe('a2');
  });
  it('matches when the vendor contains the account name or vice versa', () => {
    expect(matchAccountByVendor('Chase Sapphire Preferred', accounts).id).toBe('a1');
    expect(matchAccountByVendor('Amex', accounts).id).toBe('a2');
  });
  it('matches on a shared significant token (len >= 3)', () => {
    expect(matchAccountByVendor('SAPPHIRE card statement', accounts).id).toBe('a1');
  });
  it('returns null when nothing meaningful matches', () => {
    expect(matchAccountByVendor('Costco Wholesale', accounts)).toBeNull();
  });
  it('does not match on short/common tokens', () => {
    // "of" / two-letter tokens must not connect unrelated names
    expect(matchAccountByVendor('Bank of Nowhere', [{ id: 'x', name: 'Bank of America' }])).not.toBeNull();
    expect(matchAccountByVendor('XY', [{ id: 'x', name: 'AB' }])).toBeNull();
  });
});
