/**
 * Money is integer cents everywhere (ADR-07). Tax rates are integer basis
 * points (100 = 1%). Rounding happens exactly once, at the tax step.
 */

export const roundHalfUp = (value: number): number => Math.floor(value + 0.5);

export const lineTotalCents = (quantity: number, unitPriceCents: number): number =>
  roundHalfUp(quantity * unitPriceCents);

export const taxCents = (subtotalCents: number, rateBps: number): number =>
  roundHalfUp((subtotalCents * rateBps) / 10_000);

export const totalCents = (subtotalCents: number, rateBps: number): number =>
  subtotalCents + taxCents(subtotalCents, rateBps);

export const sumLineTotals = (lines: readonly { readonly total_cents: number }[]): number =>
  lines.reduce((sum, line) => sum + line.total_cents, 0);

export const formatCents = (cents: number, currency = 'USD', locale = 'en-US'): string =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

const THOUSANDS_WITH_DOT_DECIMAL = /^[+-]?\d{1,3}(,\d{3})*(\.\d+)?$/;
const PLAIN_DECIMAL = /^[+-]?\d+(\.\d+)?$/;

/**
 * Parses user input into integer cents. Ambiguous formats are rejected rather
 * than guessed (e.g. `2500,00` — is that 2500 or 250000?).
 */
export const parseMoney = (input: string): number | null => {
  const withoutSymbols = input.replace(/[\s\u00A0]/g, '').replace(/[$€£¥]/g, '');
  if (withoutSymbols === '') return null;

  let normalized: string;
  if (THOUSANDS_WITH_DOT_DECIMAL.test(withoutSymbols)) {
    normalized = withoutSymbols.replace(/,/g, '');
  } else if (PLAIN_DECIMAL.test(withoutSymbols)) {
    normalized = withoutSymbols;
  } else {
    return null;
  }

  const negative = normalized.startsWith('-');
  const digits = normalized.replace(/^[+-]/, '');
  const [integerPart = '0', fractionPart = ''] = digits.split('.');

  if (!/^\d+$/.test(integerPart)) return null;
  const whole = Number(integerPart);
  if (!Number.isSafeInteger(whole)) return null;

  const fraction = `${fractionPart}000`;
  const centsFromFraction = Number(fraction.slice(0, 2)) + (Number(fraction[2]) >= 5 ? 1 : 0);

  const cents = whole * 100 + centsFromFraction;
  return negative ? -cents : cents;
};

/** Formats cents for display inside an input field (no currency symbol). */
export const centsToInputValue = (cents: number): string => (cents / 100).toFixed(2);
