import { describe, it, expect } from 'vitest';
import { seasonForDate, holidayForDate } from './seasonalMath.js';

const d = (s) => new Date(s + 'T12:00:00');

describe('seasonForDate', () => {
  it('maps months to N-hemisphere seasons', () => {
    expect(seasonForDate(d('2026-01-15'))).toBe('winter');
    expect(seasonForDate(d('2026-02-15'))).toBe('winter');
    expect(seasonForDate(d('2026-04-15'))).toBe('spring');
    expect(seasonForDate(d('2026-07-15'))).toBe('summer');
    expect(seasonForDate(d('2026-10-15'))).toBe('autumn');
    expect(seasonForDate(d('2026-12-15'))).toBe('winter');
  });
});

describe('holidayForDate', () => {
  it('flags fixed-date holidays, else null', () => {
    expect(holidayForDate(d('2026-01-01'))).toBe('newyear');
    expect(holidayForDate(d('2026-12-31'))).toBe('newyear');
    expect(holidayForDate(d('2026-10-31'))).toBe('halloween');
    expect(holidayForDate(d('2026-07-04'))).toBe(null);
  });
});
