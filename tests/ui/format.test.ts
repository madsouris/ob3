import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration } from '../../src/ui/lib/format.js';

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
