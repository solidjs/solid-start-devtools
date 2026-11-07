import { describe, expect, it } from 'vitest';
import { formatAge, formatClock, wallTime } from './time.js';

describe('formatAge', () => {
  it('rounds down to the largest unit', () => {
    expect(formatAge(1000)).toBe('now');
    expect(formatAge(12_000)).toBe('12s');
    expect(formatAge(3 * 60_000 + 20_000)).toBe('3m');
    expect(formatAge(2 * 3_600_000)).toBe('2h');
    expect(formatAge(3 * 86_400_000)).toBe('3d');
  });

  it('treats a time in the future as now', () => {
    expect(formatAge(-500)).toBe('now');
  });
});

describe('wallTime', () => {
  it('moves a performance.now() time onto the wall clock', () => {
    expect(wallTime(900, 10_000, 1000)).toBe(9900);
  });
});

describe('formatClock', () => {
  it('pads each part to two digits', () => {
    expect(formatClock(new Date(2026, 0, 1, 4, 5, 9).getTime())).toBe('04:05:09');
  });
});
