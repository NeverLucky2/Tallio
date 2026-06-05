import { describe, it, expect } from 'vitest';
import { parsePairHash, buildPairUrl } from './pairLink.js';

describe('parsePairHash', () => {
  it('parses a scan link (no mode) → mode scan', () => {
    expect(parsePairHash('#s=abc-123')).toEqual({ sessionId: 'abc-123', mode: 'scan' });
  });
  it('parses a library link with m=lib', () => {
    expect(parsePairHash('#s=abc-123&m=lib')).toEqual({ sessionId: 'abc-123', mode: 'library' });
  });
  it('tolerates reversed param order', () => {
    expect(parsePairHash('#m=lib&s=xyz')).toEqual({ sessionId: 'xyz', mode: 'library' });
  });
  it('returns empty sessionId for an empty hash', () => {
    expect(parsePairHash('')).toEqual({ sessionId: '', mode: 'scan' });
  });
});

describe('buildPairUrl', () => {
  it('builds a scan url with no mode param', () => {
    expect(buildPairUrl('https://x.app', 'abc')).toBe('https://x.app/pair#s=abc');
  });
  it('builds a library url with m=lib', () => {
    expect(buildPairUrl('https://x.app', 'abc', 'library')).toBe('https://x.app/pair#s=abc&m=lib');
  });
});
