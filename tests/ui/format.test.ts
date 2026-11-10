import { describe, expect, it } from 'vitest';
import { formatBytes, formatDate, formatDateTime, formatDuration } from '../../src/ui/lib/format.js';

describe('formatDate', () => {
  it('renders date-only values as dd/MM/yyyy', () => {
    expect(formatDate('2026-10-28')).toBe('28/10/2026');
    expect(formatDate('2026-01-05')).toBe('05/01/2026');
    expect(formatDate('1999-12-31')).toBe('31/12/1999');
  });

  it('renders timestamps in local time, without a day shift', () => {
    // Built from a local noon so the calendar day holds in every time zone.
    expect(formatDate(new Date(2026, 9, 28, 12, 0, 0).toISOString())).toBe('28/10/2026');
  });

  it('returns a dash for empty input and the raw value when unparseable', () => {
    expect(formatDate('')).toBe('—');
    expect(formatDate('soon')).toBe('soon');
  });
});

describe('formatDateTime', () => {
  it('adds local hours and minutes to timestamps', () => {
    const date = new Date(2026, 9, 28, 14, 5);
    expect(formatDateTime(date.toISOString())).toBe('28/10/2026 14:05');
  });

  it('handles date-only input and empties', () => {
    expect(formatDateTime('2026-10-28')).toBe('28/10/2026 00:00');
    expect(formatDateTime('')).toBe('—');
  });
});

describe('formatBytes', () => {
  it('uses whole bytes below 1 KB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('scales to binary units with one decimal below 100', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(23.5 * 1024 * 1024)).toBe('23.5 MB');
  });

  it('drops the decimal at 100 and above', () => {
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB');
    expect(formatBytes(2 * 1024 ** 4)).toBe('2.0 TB');
  });

  it('renders an em dash for unusable input', () => {
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('formats seconds, minutes, hours and days', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(59)).toBe('59s');
    expect(formatDuration(90)).toBe('1m');
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(3 * 3600 + 14 * 60)).toBe('3h 14m');
    expect(formatDuration(90_000)).toBe('1d 1h');
  });

  it('clamps negative input', () => {
    expect(formatDuration(-5)).toBe('0s');
  });
});
