/** Date-only helpers. All values crossing the API are `YYYY-MM-DD`. */

const pad = (value: number): string => String(value).padStart(2, '0');

/** Parses an ISO date as a **local** midnight, so the day never shifts. */
export const isoToDate = (value: string): Date | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return undefined;
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
};

/** Formats a local Date as `YYYY-MM-DD` (never `toISOString`, which shifts days). */
export const dateToIso = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
