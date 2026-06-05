import { describe, it, expect } from 'vitest';
import { parseIconValue, iconGlyph } from './iconValue.js';

describe('parseIconValue', () => {
  it('classifies emoji, image tokens, and empty', () => {
    expect(parseIconValue('🛒')).toEqual({ kind: 'emoji', emoji: '🛒' });
    expect(parseIconValue('img:abc123')).toEqual({ kind: 'image', id: 'abc123' });
    expect(parseIconValue('')).toEqual({ kind: 'empty' });
    expect(parseIconValue(null)).toEqual({ kind: 'empty' });
    expect(parseIconValue(undefined)).toEqual({ kind: 'empty' });
  });
});

describe('iconGlyph', () => {
  it('returns the emoji for emoji, the fallback for images, empty string for empty', () => {
    expect(iconGlyph('🛒')).toBe('🛒');
    expect(iconGlyph('img:abc')).toBe('🖼️');
    expect(iconGlyph('img:abc', '🏷️')).toBe('🏷️');
    expect(iconGlyph('')).toBe('');
  });
});
