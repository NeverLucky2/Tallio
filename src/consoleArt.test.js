import { describe, it, expect, vi } from 'vitest';
import { consoleArt, printConsoleArt } from './consoleArt.js';

describe('consoleArt', () => {
  it('returns a banner string and a css style string', () => {
    const { text, style } = consoleArt();
    expect(typeof text).toBe('string');
    expect(text).toContain('Tallio');
    expect(text).toContain('%c');
    expect(typeof style).toBe('string');
    expect(style.length).toBeGreaterThan(0);
  });
  it('printConsoleArt logs once', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printConsoleArt();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
