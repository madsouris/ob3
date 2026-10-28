import { afterEach, describe, expect, it } from 'vitest';
import {
  clearSelfWrites,
  consumeSelfWrite,
  isPendingSelfWrite,
  pendingSelfWriteCount,
  rememberSelfWrite,
} from '../../src/io/self-writes.js';

afterEach(() => {
  clearSelfWrites();
});

describe('self-write suppression', () => {
  it('suppresses exactly the hash that was written', () => {
    rememberSelfWrite('contacts/cnt_a.md', 'abc');
    expect(consumeSelfWrite('contacts/cnt_a.md', 'abc')).toBe(true);
    expect(consumeSelfWrite('contacts/cnt_a.md', 'abc')).toBe(false); // consumed once
  });

  it('does not suppress an external edit with different content', () => {
    rememberSelfWrite('contacts/cnt_a.md', 'ours');
    expect(consumeSelfWrite('contacts/cnt_a.md', 'theirs')).toBe(false);
    expect(isPendingSelfWrite('contacts/cnt_a.md')).toBe(true);
  });

  it('expires entries after the TTL', () => {
    rememberSelfWrite('contacts/cnt_a.md', 'abc', { ttlMs: 100, now: 1_000 });
    expect(isPendingSelfWrite('contacts/cnt_a.md', 1_050)).toBe(true);
    expect(isPendingSelfWrite('contacts/cnt_a.md', 1_101)).toBe(false);
    expect(pendingSelfWriteCount(1_101)).toBe(0);
  });

  it('keeps paths independent', () => {
    rememberSelfWrite('contacts/a.md', 'h1');
    rememberSelfWrite('contacts/b.md', 'h2');
    expect(consumeSelfWrite('contacts/a.md', 'h1')).toBe(true);
    expect(isPendingSelfWrite('contacts/b.md')).toBe(true);
  });

  it('clears all entries', () => {
    rememberSelfWrite('a.md', 'h');
    clearSelfWrites();
    expect(pendingSelfWriteCount()).toBe(0);
  });
});
