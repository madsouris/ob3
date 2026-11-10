import { describe, expect, it } from 'vitest';
import type { RevenueInvoice } from '../../src/ui/lib/revenue.js';
import { monthInvoiceCount, monthRevenue, revenueMonthKey } from '../../src/ui/lib/revenue.js';

const invoice = (overrides: Partial<RevenueInvoice> = {}): RevenueInvoice => ({
  status: 'paid',
  issue_date: '2026-10-01',
  paid_at: '2026-10-20T10:00:00.000Z',
  total_cents: 100_000,
  ...overrides,
});

// Local dates on purpose: revenue is bucketed by the user's calendar month.
// Timestamps stay mid-month so the assertions hold in any time zone.
const NOVEMBER = new Date(2026, 10, 15, 12, 0, 0);

describe('revenueMonthKey', () => {
  it('prefers the payment date', () => {
    expect(revenueMonthKey(invoice())).toBe('2026-10');
    expect(revenueMonthKey(invoice({ paid_at: '2026-11-12T12:00:00.000Z' }))).toBe('2026-11');
  });

  it('falls back to the issue date when no payment date exists', () => {
    expect(revenueMonthKey(invoice({ paid_at: '', issue_date: '2026-09-30' }))).toBe('2026-09');
  });

  it('returns an empty key for unparseable values', () => {
    expect(revenueMonthKey(invoice({ paid_at: '', issue_date: 'soon' }))).toBe('');
  });
});

describe('monthRevenue', () => {
  it('counts a paid invoice paid in the selected month even when issued earlier', () => {
    const rows = [invoice({ issue_date: '2026-09-02', paid_at: '2026-11-12T08:00:00.000Z' })];
    expect(monthRevenue(rows, NOVEMBER)).toBe(100_000);
    expect(monthInvoiceCount(rows, NOVEMBER)).toBe(1);
  });

  it('ignores a paid invoice whose payment was last month', () => {
    const rows = [invoice({ issue_date: '2026-11-12', paid_at: '2026-10-15T12:00:00.000Z' })];
    expect(monthRevenue(rows, NOVEMBER)).toBe(0);
  });

  it('ignores an invoice that is not paid, whatever its dates', () => {
    const rows = [
      invoice({ status: 'sent', paid_at: '', issue_date: '2026-11-12' }),
      invoice({ status: 'draft', paid_at: '2026-11-12T12:00:00.000Z' }),
    ];
    expect(monthRevenue(rows, NOVEMBER)).toBe(0);
    expect(monthInvoiceCount(rows, NOVEMBER)).toBe(0);
  });

  it('uses the issue date for a paid file without a payment date', () => {
    const rows = [invoice({ paid_at: '', issue_date: '2026-11-09' })];
    expect(monthRevenue(rows, NOVEMBER)).toBe(100_000);
  });

  it('sums several invoices in the month', () => {
    const rows = [
      invoice({ paid_at: '2026-11-05T12:00:00.000Z' }),
      invoice({ paid_at: '2026-11-25T12:00:00.000Z', total_cents: 23_450 }),
      invoice({ paid_at: '2026-10-15T12:00:00.000Z' }),
    ];
    expect(monthRevenue(rows, NOVEMBER)).toBe(123_450);
    expect(monthInvoiceCount(rows, NOVEMBER)).toBe(2);
  });
});
