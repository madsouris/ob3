import { monthKeyLocal, monthKeyOf } from '../../model/dates.js';

export interface RevenueInvoice {
  readonly status: string;
  readonly issue_date: string;
  readonly paid_at: string;
  readonly total_cents: number;
}

/**
 * The month an invoice's revenue belongs to. `paid_at` is authoritative; files
 * without one (hand-edited, or paid before the field existed) fall back to
 * `issue_date`. Returns `''` when neither value parses.
 */
export const revenueMonthKey = (invoice: RevenueInvoice): string =>
  monthKeyOf(invoice.paid_at !== '' ? invoice.paid_at : invoice.issue_date);

export const isPaidInMonth = (
  invoice: RevenueInvoice,
  monthKey: string = monthKeyLocal(),
): boolean => invoice.status === 'paid' && revenueMonthKey(invoice) === monthKey;

/** Paid invoices whose payment date (or fallback issue date) is this month. */
export const monthRevenue = (
  invoices: readonly RevenueInvoice[],
  now: Date = new Date(),
): number => {
  const key = monthKeyLocal(now);
  return invoices
    .filter((invoice) => isPaidInMonth(invoice, key))
    .reduce((sum, invoice) => sum + invoice.total_cents, 0);
};

export const monthInvoiceCount = (
  invoices: readonly RevenueInvoice[],
  now: Date = new Date(),
): number => {
  const key = monthKeyLocal(now);
  return invoices.filter((invoice) => isPaidInMonth(invoice, key)).length;
};
