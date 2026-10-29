import { describe, expect, it } from 'vitest';
import { fitDimensions } from '../../src/ui/lib/logo.js';

describe('fitDimensions', () => {
  it('fits a wide image inside the square', () => {
    expect(fitDimensions(2048, 1024, 768)).toEqual({ width: 768, height: 384 });
  });

  it('fits a tall image inside the square', () => {
    expect(fitDimensions(1024, 2048, 768)).toEqual({ width: 384, height: 768 });
  });

  it('never upscales', () => {
    expect(fitDimensions(200, 100, 768)).toEqual({ width: 200, height: 100 });
  });

  it('guards degenerate input', () => {
    expect(fitDimensions(0, 0, 768)).toEqual({ width: 1, height: 1 });
    expect(fitDimensions(Number.NaN, 10, 768)).toEqual({ width: 1, height: 1 });
  });
});
