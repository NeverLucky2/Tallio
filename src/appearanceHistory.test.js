import { describe, it, expect, vi } from 'vitest';
import { coalesceHistory } from './appearanceHistory.js';

describe('coalesceHistory', () => {
  it('pushes a tagged entry and trims to cap', () => {
    let prev = [];
    for (let i = 0; i < 25; i++) prev = coalesceHistory(prev, () => ({ v: i }), null, 20);
    expect(prev.length).toBe(20);
    expect(prev[prev.length - 1].v).toBe(24);
    expect(prev[prev.length - 1].opKey).toBeNull();
  });

  it('coalesces consecutive entries with the same opKey', () => {
    let prev = coalesceHistory([], () => ({ v: 'a' }), 'bg:intensity', 20);
    const make = vi.fn(() => ({ v: 'b' }));
    prev = coalesceHistory(prev, make, 'bg:intensity', 20);
    expect(prev.length).toBe(1);
    expect(prev[0].v).toBe('a');        // pre-drag snapshot kept
    expect(make).not.toHaveBeenCalled(); // snapshot not even computed
  });

  it('pushes a new entry when opKey differs or is null', () => {
    let prev = coalesceHistory([], () => ({ v: 'a' }), 'bg:intensity', 20);
    prev = coalesceHistory(prev, () => ({ v: 'b' }), 'bg:effectStrength', 20);
    prev = coalesceHistory(prev, () => ({ v: 'c' }), null, 20);
    expect(prev.length).toBe(3);
  });
});
