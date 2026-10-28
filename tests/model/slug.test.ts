import { describe, expect, it } from 'vitest';
import { recordFileName, slugify } from '../../src/model/slug.js';

describe('slugify', () => {
  it.each([
    ['Jane Doe', 'jane-doe'],
    ['Café Déjà Vu!', 'cafe-deja-vu'],
    ['  Trim  me  ', 'trim-me'],
    ['ACME Corp. v2', 'acme-corp-v2'],
    ['a---b', 'a-b'],
    ['2026-001', '2026-001'],
  ])('turns %s into %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('falls back to untitled for empty or symbol-only input', () => {
    expect(slugify('')).toBe('untitled');
    expect(slugify('   ')).toBe('untitled');
    expect(slugify('!!!???')).toBe('untitled');
  });

  it('caps the length without leaving a trailing dash', () => {
    const slug = slugify('a'.repeat(40) + ' ' + 'b'.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('builds record filenames', () => {
    expect(recordFileName('cnt', 'Jane Doe')).toBe('cnt_jane-doe.md');
    expect(recordFileName('tsk', '!!!')).toBe('tsk_untitled.md');
  });
});
