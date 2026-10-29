import { describe, expect, it } from 'vitest';
import { DOCUMENT_KINDS } from '../../src/model/schemas.js';
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_KIND_OPTIONS,
  documentKindLabel,
} from '../../src/ui/lib/document-kinds.js';

describe('document kind labels', () => {
  it('covers exactly the kinds the model accepts, in picker order', () => {
    expect(DOCUMENT_KIND_OPTIONS).toEqual([...DOCUMENT_KINDS]);
    expect(Object.keys(DOCUMENT_KIND_LABELS)).toEqual([...DOCUMENT_KINDS]);
  });

  it('spells out initialisms without changing the stored token', () => {
    expect(documentKindLabel('sow')).toBe('Statement of work');
    expect(documentKindLabel('nda')).toBe('NDA');
    expect(documentKindLabel('contract')).toBe('Contract');
  });

  it('falls back for an empty or unknown stored value', () => {
    expect(documentKindLabel('')).toBe('Note');
    expect(documentKindLabel('retainer')).toBe('retainer');
  });
});
