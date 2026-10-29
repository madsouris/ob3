import { describe, expect, it } from 'vitest';
import { dateToIso, isoToDate } from '../../src/ui/lib/dates.js';

describe('isoToDate', () => {
  it('parses a date at local midnight', () => {
    const date = isoToDate('2026-10-29');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(9);
    expect(date?.getDate()).toBe(29);
    expect(date?.getHours()).toBe(0);
  });

  it('round-trips through dateToIso without a day shift', () => {
    for (const iso of ['2026-01-01', '2026-03-31', '2026-12-31', '2000-02-29']) {
      const date = isoToDate(iso);
      expect(date).toBeDefined();
      if (date !== undefined) expect(dateToIso(date)).toBe(iso);
    }
  });

  it('rejects empty and malformed values', () => {
    expect(isoToDate('')).toBeUndefined();
    expect(isoToDate('2026-1-1')).toBeUndefined();
    expect(isoToDate('29/10/2026')).toBeUndefined();
    expect(isoToDate('2026-02-31')).toBeUndefined();
  });
});

describe('dateToIso', () => {
  it('zero-pads month and day', () => {
    expect(dateToIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
