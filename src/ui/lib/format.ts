export const formatMoney = (cents: number, currency = 'USD'): string => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency === '' ? 'USD' : currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
};

/** Accepts `2026-11-05` and `2026-11-05T00:00:00Z`; renders UTC to avoid off-by-one days. */
export const formatDate = (value: string): string => {
  if (value === '') return '—';
  const iso = value.length <= 10 ? `${value}T00:00:00Z` : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
};

export const formatToday = (): string => new Date().toISOString().slice(0, 10);

export const locationPath = (path: string): string => path;

export const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;
