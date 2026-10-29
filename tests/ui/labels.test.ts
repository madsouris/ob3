import { describe, expect, it } from 'vitest';
import { valueLabel } from '../../src/ui/lib/labels.js';

describe('valueLabel', () => {
  it('sentence-cases status tokens', () => {
    expect(valueLabel('lead')).toBe('Lead');
    expect(valueLabel('inactive')).toBe('Inactive');
    expect(valueLabel('overdue')).toBe('Overdue');
  });

  it('uses the curated document-kind labels', () => {
    expect(valueLabel('sow')).toBe('Statement of work');
    expect(valueLabel('nda')).toBe('NDA');
    expect(valueLabel('contract')).toBe('Contract');
  });

  it('renders an em dash for an empty value', () => {
    expect(valueLabel('')).toBe('—');
  });
});
