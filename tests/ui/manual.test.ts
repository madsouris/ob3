import { describe, expect, it } from 'vitest';
import manualSource from '../../docs/user-manual.md?raw';
import { demoteDocLinks, parseManual, slugify } from '../../src/ui/lib/manual.js';

const FIXTURE = `# ob — user manual

Intro with a [brief](../brief.md) link.

---

## 1. Before you start

Body one.

---

## 2. Terms and more

See [the index](./README.md) and [an anchor](../docs/03.md#ids).

## 2. Terms and more

Same title, second anchor.
`;

describe('slugify', () => {
  it('makes url-safe ids from headings', () => {
    expect(slugify('Before you start')).toBe('before-you-start');
    expect(slugify('Editing files outside `ob`')).toBe('editing-files-outside-ob');
    expect(slugify('Café & co.')).toBe('cafe-co');
    expect(slugify('   ')).toBe('');
  });
});

describe('demoteDocLinks', () => {
  it('replaces repo-only markdown links with their label', () => {
    expect(demoteDocLinks('read [the brief](../brief.md) first')).toBe('read the brief first');
    expect(demoteDocLinks('[anchored](./03-data-model.md#ids)')).toBe('anchored');
  });

  it('leaves external links alone', () => {
    const link = '[npm](https://www.npmjs.com/package/filecrm)';
    expect(demoteDocLinks(link)).toBe(link);
  });
});

describe('parseManual', () => {
  const manual = parseManual(FIXTURE);

  it('extracts the title and drops it from the body', () => {
    expect(manual.title).toBe('ob — user manual');
    expect(manual.intro).not.toContain('user manual');
    expect(manual.intro).toContain('Intro with a brief link.');
  });

  it('splits sections on level-2 headings and strips the separators', () => {
    expect(manual.sections).toHaveLength(3);
    expect(manual.sections[0]).toMatchObject({
      id: 'before-you-start',
      number: '1',
      title: 'Before you start',
      body: 'Body one.',
    });
    expect(manual.sections[1]?.body).not.toContain('---');
  });

  it('demotes doc links in every section', () => {
    expect(manual.sections[1]?.body).toContain('See the index and an anchor.');
    expect(manual.sections[1]?.body).not.toContain('.md');
  });

  it('suffixes duplicate slugs', () => {
    expect(manual.sections[2]?.id).toBe('terms-and-more-2');
    expect(new Set(manual.sections.map((section) => section.id)).size).toBe(3);
  });

  it('copes with CRLF and a missing H1', () => {
    const parsed = parseManual('## 1. Only section\r\n\r\nBody.\r\n');
    expect(parsed.title).toBe('');
    expect(parsed.sections[0]?.id).toBe('only-section');
    expect(parsed.sections[0]?.body).toBe('Body.');
  });

  it('ignores headings inside fenced code blocks', () => {
    const parsed = parseManual(
      '# Manual\n\n## 1. One\n\n```markdown\n## Not a section\n```\n\nAfter.\n',
    );
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0]?.body).toContain('## Not a section');
    expect(parsed.sections[0]?.body).toContain('After.');
  });
});

describe('shipped manual', () => {
  const manual = parseManual(manualSource);

  it('parses every section with a unique, non-empty body', () => {
    expect(manual.sections.length).toBeGreaterThan(10);
    expect(new Set(manual.sections.map((section) => section.id)).size).toBe(manual.sections.length);
    for (const section of manual.sections) {
      expect(section.body.length).toBeGreaterThan(0);
      expect(section.title.length).toBeGreaterThan(0);
    }
  });

  it('starts at the setup section so #/manual/before-you-start resolves', () => {
    expect(manual.sections[0]).toMatchObject({ id: 'before-you-start', number: '1' });
  });

  it('keeps the section numbering contiguous', () => {
    const numbers = manual.sections.map((section) => section.number);
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, index) => String(index + 1)));
  });

  it('uses plain-text section titles', () => {
    for (const section of manual.sections) expect(section.title).not.toContain('`');
  });

  it('has no unresolved repo links left for the reader', () => {
    expect(manual.intro).not.toMatch(/\]\([^)]*\.md/);
    for (const section of manual.sections) expect(section.body).not.toMatch(/\]\([^)]*\.md/);
  });
});
