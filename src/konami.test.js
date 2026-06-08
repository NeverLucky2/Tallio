import { describe, it, expect } from 'vitest';
import { KONAMI_SEQUENCE, endsWithSequence } from './konami.js';

describe('endsWithSequence', () => {
  it('matches when the buffer ends with the full sequence', () => {
    expect(endsWithSequence(KONAMI_SEQUENCE, KONAMI_SEQUENCE)).toBe(true);
    expect(endsWithSequence(['x', 'y', ...KONAMI_SEQUENCE], KONAMI_SEQUENCE)).toBe(true);
  });
  it('does not match a partial or wrong tail', () => {
    expect(endsWithSequence(KONAMI_SEQUENCE.slice(0, -1), KONAMI_SEQUENCE)).toBe(false);
    expect(endsWithSequence(['a', 'b'], KONAMI_SEQUENCE)).toBe(false);
  });
  it('has the classic 10-key sequence', () => {
    expect(KONAMI_SEQUENCE).toEqual(['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']);
  });
});
