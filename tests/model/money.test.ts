import { describe, expect, it } from 'vitest';
import {
  centsToInputValue,
  formatCents,
  lineTotalCents,
  parseMoney,
  roundHalfUp,
  sumLineTotals,
  taxCents,
  totalCents,
} from '../../src/model/money.js';

const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

describe('integer cents math', () => {
  it('rounds half up at the boundary', () => {
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(1.49)).toBe(1);
    expect(roundHalfUp(1.5)).toBe(2);
    expect(roundHalfUp(0)).toBe(0);
  });

  it('computes line totals, including fractional quantities', () => {
    expect(lineTotalCents(1, 250_000)).toBe(250_000);
    expect(lineTotalCents(2, 50_000)).toBe(100_000);
    expect(lineTotalCents(0.5, 100_000)).toBe(50_000);
    expect(lineTotalCents(1.5, 1_000)).toBe(1_500);
    expect(lineTotalCents(0.333, 100)).toBe(33);
  });

  it('computes tax from basis points', () => {
    expect(taxCents(250_000, 850)).toBe(21_250);
    expect(taxCents(100, 850)).toBe(9); // 8.5 cents rounds up
    expect(taxCents(0, 850)).toBe(0);
    expect(taxCents(250_000, 0)).toBe(0);
    expect(taxCents(250_000, 10_000)).toBe(250_000);
  });

  it('adds tax exactly once', () => {
    expect(totalCents(250_000, 850)).toBe(271_250);
    expect(totalCents(100, 850)).toBe(109);
  });

  it('sums line totals', () => {
    expect(sumLineTotals([{ total_cents: 150_000 }, { total_cents: 100_000 }])).toBe(250_000);
    expect(sumLineTotals([])).toBe(0);
  });

  it('keeps integer invariants over random inputs', () => {
    const random = seededRandom(42);
    for (let index = 0; index < 1_000; index += 1) {
      const subtotal = Math.floor(random() * 10_000_000);
      const bps = Math.floor(random() * 10_001);
      const tax = taxCents(subtotal, bps);

      expect(Number.isInteger(tax)).toBe(true);
      expect(tax).toBeGreaterThanOrEqual(0);
      expect(totalCents(subtotal, bps)).toBe(subtotal + tax);
      expect(tax).toBe(Math.floor((subtotal * bps) / 10_000 + 0.5));
    }
  });
});

describe('formatCents', () => {
  it('formats with the given currency', () => {
    expect(formatCents(271_250, 'USD', 'en-US')).toBe('$2,712.50');
    expect(formatCents(0, 'USD', 'en-US')).toBe('$0.00');
    expect(formatCents(123_456, 'EUR', 'de-DE')).toContain('1.234,56');
  });

  it('produces an editable value without a symbol', () => {
    expect(centsToInputValue(271_250)).toBe('2712.50');
    expect(centsToInputValue(0)).toBe('0.00');
  });
});

describe('parseMoney', () => {
  it.each([
    ['2500', 250_000],
    ['2500.5', 250_050],
    ['2500.50', 250_050],
    ['2 500.50', 250_050],
    ['$2,500.00', 250_000],
    ['€1,234.56', 123_456],
    ['0', 0],
    ['0.01', 1],
    ['-12.34', -1_234],
    ['1.005', 101],
  ])('parses %s as %i cents', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '12,34', '1.234,56', '$', '1,2,3', '1e5', 'NaN'])(
    'rejects ambiguous input %s',
    (input) => {
      expect(parseMoney(input)).toBeNull();
    },
  );
});
