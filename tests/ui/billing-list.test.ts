import { describe, expect, it } from 'vitest';
import type { BillRow } from '../../src/ui/lib/billing-list.js';
import { filterBills, sortBills } from '../../src/ui/lib/billing-list.js';

const row = (overrides: Partial<BillRow> = {}): BillRow => ({
  id: 'inv_1',
  type: 'invoice',
  number: 'INV-2026-001',
  title: 'Website redesign',
  clientName: 'Priya Raman',
  issued: '2026-10-01',
  total: 100_000,
  currency: 'USD',
  status: 'draft',
  ...overrides,
});

describe('filterBills', () => {
  const rows = [
    row(),
    row({ id: 'inv_2', number: 'INV-2026-002', title: 'Retainer', clientName: 'Jane Doe' }),
    row({ id: 'inv_3', number: 'INV-2026-003', clientName: 'Priya Raman', status: 'paid' }),
  ];

  it('returns everything for an empty or whitespace query', () => {
    expect(filterBills(rows, '')).toBe(rows);
    expect(filterBills(rows, '   ')).toBe(rows);
  });

  it('matches the number, client or title, case-insensitively', () => {
    expect(filterBills(rows, 'inv-2026-002').map((item) => item.id)).toEqual(['inv_2']);
    expect(filterBills(rows, 'priya').map((item) => item.id)).toEqual(['inv_1', 'inv_3']);
    expect(filterBills(rows, 'RETAINER').map((item) => item.id)).toEqual(['inv_2']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterBills(rows, 'zzz')).toEqual([]);
  });
});

describe('sortBills', () => {
  const rows = [
    row({
      id: 'a',
      number: 'INV-2026-002',
      issued: '2026-10-01',
      total: 50_000,
      clientName: 'Zoe',
      status: 'sent',
    }),
    row({
      id: 'b',
      number: 'INV-2026-010',
      issued: '2026-10-20',
      total: 300_000,
      clientName: 'adam',
      status: 'paid',
    }),
    row({
      id: 'c',
      number: 'INV-2026-003',
      issued: '2026-09-15',
      total: 120_000,
      clientName: 'Mia',
      status: 'draft',
    }),
  ];

  it('sorts by issued date in both directions', () => {
    expect(sortBills(rows, 'issued', 'asc').map((item) => item.id)).toEqual(['c', 'a', 'b']);
    expect(sortBills(rows, 'issued', 'desc').map((item) => item.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by client name, ignoring case', () => {
    expect(sortBills(rows, 'client', 'asc').map((item) => item.clientName)).toEqual([
      'adam',
      'Mia',
      'Zoe',
    ]);
  });

  it('sorts totals numerically', () => {
    expect(sortBills(rows, 'total', 'desc').map((item) => item.total)).toEqual([
      300_000, 120_000, 50_000,
    ]);
  });

  it('sorts status by lifecycle order, not alphabetically', () => {
    expect(sortBills(rows, 'status', 'asc').map((item) => item.status)).toEqual([
      'draft',
      'sent',
      'paid',
    ]);
  });

  it('ranks unknown statuses last and estimates by their own order', () => {
    const mixed = [
      row({ id: 'x', type: 'invoice', status: 'unknown' }),
      row({ id: 'y', type: 'invoice', status: 'cancelled' }),
      row({ id: 'z', type: 'estimate', status: 'accepted' }),
      row({ id: 'w', type: 'estimate', status: 'draft' }),
    ];
    expect(sortBills(mixed, 'status', 'asc').map((item) => item.id)).toEqual(['w', 'z', 'y', 'x']);
  });

  it('breaks ties by number, numerically', () => {
    const same = [
      row({ id: 'late', number: 'INV-2026-010' }),
      row({ id: 'early', number: 'INV-2026-002' }),
    ];
    expect(sortBills(same, 'issued', 'asc').map((item) => item.id)).toEqual(['early', 'late']);
  });

  it('does not mutate the input', () => {
    const original = [...rows];
    sortBills(rows, 'total', 'desc');
    expect(rows).toEqual(original);
  });
});
