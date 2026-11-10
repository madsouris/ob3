import { describe, expect, it } from 'vitest';
import { matchesQuery, otherDirection, sortRows } from '../../src/ui/lib/table.js';

describe('matchesQuery', () => {
  it('matches everything for an empty or whitespace query', () => {
    expect(matchesQuery('', ['Acme'])).toBe(true);
    expect(matchesQuery('   ', ['Acme'])).toBe(true);
  });

  it('is case-insensitive, trimmed and substring based', () => {
    expect(matchesQuery('  ACME ', ['Acme Corp'])).toBe(true);
    expect(matchesQuery('corp', ['Acme Corp'])).toBe(true);
    expect(matchesQuery('acme', ['Northwind'])).toBe(false);
  });

  it('checks every field and tolerates missing values', () => {
    expect(matchesQuery('hello@acme.test', ['Priya', '', 'hello@acme.test'])).toBe(true);
    expect(matchesQuery('x', [undefined, ''])).toBe(false);
  });
});

describe('sortRows', () => {
  const rows = [
    { name: 'b', n: 2 },
    { name: 'a', n: 3 },
    { name: 'c', n: 1 },
  ];

  it('sorts ascending and descending by the comparator', () => {
    expect(sortRows(rows, (l, r) => l.n - r.n, 'asc').map((row) => row.name)).toEqual([
      'c',
      'b',
      'a',
    ]);
    expect(sortRows(rows, (l, r) => l.n - r.n, 'desc').map((row) => row.name)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('does not mutate the input', () => {
    const original = [...rows];
    sortRows(rows, (l, r) => l.n - r.n, 'desc');
    expect(rows).toEqual(original);
  });

  it('is stable for equal comparators', () => {
    const same = [
      { id: 'first', n: 1 },
      { id: 'second', n: 1 },
    ];
    expect(sortRows(same, (l, r) => l.n - r.n, 'asc').map((row) => row.id)).toEqual([
      'first',
      'second',
    ]);
  });
});

describe('otherDirection', () => {
  it('flips the direction', () => {
    expect(otherDirection('asc')).toBe('desc');
    expect(otherDirection('desc')).toBe('asc');
  });
});
