import { describe, expect, it } from 'vitest';
import { createId, isRecordId, prefixMatchesType, recordPrefixOf } from '../../src/model/ids.js';

const zeros = (size: number): Uint8Array => new Uint8Array(size);

describe('createId', () => {
  it('produces prefix + 26 Crockford chars', () => {
    const id = createId('cnt', { now: () => 0, random: zeros });
    expect(id).toBe(`cnt_${'0'.repeat(26)}`);
    expect(id).toHaveLength(30);
    expect(isRecordId(id)).toBe(true);
  });

  it('is deterministic with an injected clock and randomness', () => {
    const first = createId('tsk', { now: () => 1_700_000_000_000, random: zeros });
    const second = createId('tsk', { now: () => 1_700_000_000_000, random: zeros });
    expect(first).toBe(second);
  });

  it('advances with the clock, so ids sort by creation time', () => {
    const early = createId('inv', { now: () => 1_000, random: zeros });
    const late = createId('inv', { now: () => 2_000, random: zeros });
    expect(early < late).toBe(true);
  });

  it('produces unique ids with real randomness', () => {
    const ids = new Set(Array.from({ length: 500 }, () => createId('proj')));
    expect(ids.size).toBe(500);
  });

  it('supports every prefix', () => {
    for (const prefix of ['cnt', 'proj', 'tsk', 'est', 'inv', 'doc'] as const) {
      expect(isRecordId(createId(prefix))).toBe(true);
    }
  });
});

describe('isRecordId', () => {
  it.each([
    'cnt_01J8X71000Q4M2N8V3R5T7W9Y0',
    'proj_00000000000000000000000000',
    'doc_7ZZZZZZZZZZZZZZZZZZZZZZZZZ',
  ])('accepts %s', (value) => {
    expect(isRecordId(value)).toBe(true);
  });

  it.each([
    'cnt_01J8X7100', // the v1.0.0 sample: not a ULID
    'cnt_01J8X71000Q4M2N8V3R5T7W9Y', // 25 chars
    'cnt_01J8X71000Q4M2N8V3R5T7W9Y00', // 27 chars
    'xxx_01J8X71000Q4M2N8V3R5T7W9Y0', // unknown prefix
    'cnt01J8X71000Q4M2N8V3R5T7W9Y0', // missing separator
    'cnt_01J8X71000Q4M2N8V3R5T7W9YL', // L is not Crockford
    '',
  ])('rejects %s', (value) => {
    expect(isRecordId(value)).toBe(false);
  });
});

describe('prefix helpers', () => {
  it('extracts the prefix', () => {
    expect(recordPrefixOf('tsk_01J8X71000Q4M2N8V3R5T7W9Y0')).toBe('tsk');
    expect(recordPrefixOf('nope_01J8X71000Q4M2N8V3R5T7W9Y0')).toBeNull();
    expect(recordPrefixOf('no-separator')).toBeNull();
  });

  it('matches prefixes to record types', () => {
    expect(prefixMatchesType('cnt', 'contact')).toBe(true);
    expect(prefixMatchesType('proj', 'project')).toBe(true);
    expect(prefixMatchesType('tsk', 'task')).toBe(true);
    expect(prefixMatchesType('est', 'estimate')).toBe(true);
    expect(prefixMatchesType('inv', 'invoice')).toBe(true);
    expect(prefixMatchesType('doc', 'document')).toBe(true);
    expect(prefixMatchesType('cnt', 'invoice')).toBe(false);
  });
});
