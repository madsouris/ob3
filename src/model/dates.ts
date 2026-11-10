import { addDays, format, isValid, parseISO } from 'date-fns';

/**
 * Dates on disk are calendar dates (`yyyy-MM-dd`) and timestamps are instants
 * (ISO 8601, UTC). Display and "today" are the user's local calendar: a record
 * created at 00:30 in UTC+7 belongs to that local day, not the UTC one.
 */
export const parseLocalDate = (value: string): Date | null => {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  // date-only values are local midnight; timestamps are instants in local time.
  const date = trimmed.length <= 10 ? parseISO(trimmed) : new Date(trimmed);
  return isValid(date) ? date : null;
};

/** Local calendar date, `yyyy-MM-dd`. */
export const todayLocal = (now: Date = new Date()): string => format(now, 'yyyy-MM-dd');

export const localYear = (now: Date = new Date()): number => now.getFullYear();

/** Adds whole days to a `yyyy-MM-dd` calendar date without shifting the day. */
export const addDaysIso = (isoDate: string, days: number): string => {
  const date = parseLocalDate(isoDate);
  return date === null ? isoDate : format(addDays(date, days), 'yyyy-MM-dd');
};

/** Local month key (`yyyy-MM`) for a date-only value or a timestamp. */
export const monthKeyOf = (value: string): string => {
  const date = parseLocalDate(value);
  return date === null ? '' : format(date, 'yyyy-MM');
};

export const monthKeyLocal = (now: Date = new Date()): string => format(now, 'yyyy-MM');
