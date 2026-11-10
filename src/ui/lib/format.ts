import { format } from 'date-fns';
import { parseLocalDate, todayLocal } from '../../model/dates.js';

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

/** `YYYY-MM-DD` or an ISO timestamp → local `dd/MM/yyyy`. */
export const formatDate = (value: string): string => {
  if (value === '') return '—';
  const date = parseLocalDate(value);
  return date === null ? value : format(date, 'dd/MM/yyyy');
};

/** Timestamps in local time: `dd/MM/yyyy HH:mm`. */
export const formatDateTime = (value: string): string => {
  if (value === '') return '—';
  const date = parseLocalDate(value);
  return date === null ? value : format(date, 'dd/MM/yyyy HH:mm');
};

/** Local month heading, e.g. `November 2026`. */
export const formatMonthYear = (value: Date = new Date()): string => format(value, 'MMMM yyyy');

export const formatToday = (): string => todayLocal();

export const locationPath = (path: string): string => path;

export const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;

/** Binary units; whole numbers from 100 up, one decimal below that. */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const digits = index === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[index] ?? 'B'}`;
};

/** Compact uptime: `3d 4h`, `2h 5m`, `9m`, `12s`. */
export const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${total}s`;
};
