import { describe, expect, it } from 'vitest';
import {
  FrontmatterError,
  parseFrontmatter,
  readFrontmatter,
  splitFrontmatter,
  updateFrontmatter,
} from '../../src/model/frontmatter.js';

const lines = (value: readonly string[]): string => value.join('\n');

const SOURCE = lines([
  '---',
  'id: cnt_01J8X7100AQ4M2N8V3R5T7W9Y0',
  'status: lead  # switched to active later',
  'foo:',
  '  nested: [1, 2, 3]',
  'created_at: 2026-10-28T09:00:00Z',
  'updated_at: 2026-10-28T09:00:00Z',
  '---',
  '',
  '# Notes',
  '',
  'Body with a fence:',
  '',
  '```yaml',
  '---',
  'status: done',
  '```',
  '',
  'Trailing text.',
  '',
]);

describe('splitFrontmatter', () => {
  it('separates frontmatter and body', () => {
    const split = splitFrontmatter(SOURCE);
    expect(split.hadFrontmatter).toBe(true);
    expect(split.unterminated).toBe(false);
    expect(split.newline).toBe('\n');
    expect(split.frontmatterSource).toContain('status: lead');
    expect(split.body.startsWith('\n# Notes')).toBe(true);
    expect(split.body).toContain('```yaml');
  });

  it('reports files without frontmatter as body-only', () => {
    const split = splitFrontmatter('# Hello\n');
    expect(split.hadFrontmatter).toBe(false);
    expect(split.body).toBe('# Hello\n');
  });

  it('flags an unterminated block', () => {
    const split = splitFrontmatter('---\nid: x\n');
    expect(split.unterminated).toBe(true);
  });

  it('detects CRLF and BOM', () => {
    const split = splitFrontmatter('\uFEFF---\r\nid: x\r\n---\r\nbody\r\n');
    expect(split.bom).toBe(true);
    expect(split.newline).toBe('\r\n');
    expect(split.hadFrontmatter).toBe(true);
    expect(split.body).toBe('body\r\n');
  });
});

describe('parseFrontmatter', () => {
  it('parses values', () => {
    const { data } = parseFrontmatter(SOURCE);
    expect(data['id']).toBe('cnt_01J8X7100AQ4M2N8V3R5T7W9Y0');
    expect(data['status']).toBe('lead');
    expect(data['foo']).toEqual({ nested: [1, 2, 3] });
  });

  it('exposes body alongside data', () => {
    const { frontmatter, body } = readFrontmatter(SOURCE);
    expect(frontmatter['id']).toBeDefined();
    expect(body).toContain('Trailing text.');
  });

  it('throws on invalid YAML', () => {
    expect(() => parseFrontmatter('---\nestimate_number: [unclosed\n---\n')).toThrow(
      FrontmatterError,
    );
  });

  it('throws on an unterminated block', () => {
    expect(() => parseFrontmatter('---\nid: x\n')).toThrow(/no closing delimiter/);
  });

  it('throws when frontmatter is not a mapping', () => {
    expect(() => parseFrontmatter('---\n- a\n- b\n---\n')).toThrow(/not a mapping/);
  });
});

describe('updateFrontmatter', () => {
  it('returns the source untouched for an empty patch', () => {
    expect(updateFrontmatter(SOURCE, {})).toBe(SOURCE);
  });

  it('changes only the touched key and preserves everything else', () => {
    const original = splitFrontmatter(SOURCE);
    const updated = updateFrontmatter(SOURCE, { status: 'active' });
    const after = splitFrontmatter(updated);

    expect(after.frontmatterSource).toContain('status: active');
    expect(after.frontmatterSource).toContain('# switched to active later'); // comment kept
    expect(after.frontmatterSource).toContain('foo:');
    expect(after.frontmatterSource).toContain('nested: [1, 2, 3]');
    expect(after.body).toBe(original.body); // byte-identical body
    expect(updated.indexOf('foo:')).toBeLessThan(updated.indexOf('created_at:'));
  });

  it('deletes a key when the value is undefined', () => {
    const updated = updateFrontmatter(SOURCE, { status: undefined });
    expect(updated).not.toContain('status: lead');
    expect(updated).toContain('id: cnt_01J8X7100AQ4M2N8V3R5T7W9Y0');
    expect(splitFrontmatter(updated).body).toBe(splitFrontmatter(SOURCE).body);
  });

  it('preserves CRLF files', () => {
    const crlf = '---\r\nid: x\r\nstatus: lead\r\n---\r\n\r\nBody\r\n';
    const updated = updateFrontmatter(crlf, { status: 'active' });
    expect(updated).not.toMatch(/[^\r]\n/);
    expect(splitFrontmatter(updated).newline).toBe('\r\n');
    expect(splitFrontmatter(updated).body).toBe('\r\nBody\r\n');
  });

  it('handles a file that mixes newline styles between header and body', () => {
    // LF header, CRLF body: what duplicating a Windows-checked-out record writes.
    const lfHeader = '---\nid: x\nstatus: lead\n---\n\r\nBody\r\n';
    const split = splitFrontmatter(lfHeader);
    expect(split.hadFrontmatter).toBe(true);
    expect(split.unterminated).toBe(false);
    expect(split.newline).toBe('\n');
    expect(split.body).toBe('\r\nBody\r\n');
    expect(readFrontmatter(lfHeader).frontmatter['id']).toBe('x');

    const updated = updateFrontmatter(lfHeader, { status: 'active' });
    expect(splitFrontmatter(updated).body).toBe('\r\nBody\r\n');
    expect(splitFrontmatter(updated).frontmatterSource).toContain('status: active');

    // CRLF header, LF body: the reverse mix must parse too.
    const crlfHeader = '---\r\nid: y\r\n---\r\n\nBody\n';
    expect(readFrontmatter(crlfHeader).frontmatter['id']).toBe('y');
    expect(splitFrontmatter(crlfHeader).body).toBe('\nBody\n');
  });

  it('preserves a BOM exactly once', () => {
    const withBom = `\uFEFF${SOURCE}`;
    const updated = updateFrontmatter(withBom, { status: 'active' });
    expect(updated.startsWith('\uFEFF')).toBe(true);
    expect(updated.split('\uFEFF')).toHaveLength(2);
  });

  it('adds a block to a file that has none', () => {
    const updated = updateFrontmatter('# Hello\n\nBody\n', { id: 'cnt_x', type: 'contact' });
    expect(updated.startsWith('---\n')).toBe(true);
    expect(updated).toContain('id: cnt_x');
    expect(updated).toContain('type: contact');
    expect(updated.endsWith('# Hello\n\nBody\n')).toBe(true);
  });

  it('keeps a closing delimiter that lacks a trailing newline', () => {
    const source = '---\nid: x\n---';
    const updated = updateFrontmatter(source, { id: 'y' });
    expect(updated.endsWith('---')).toBe(true);
  });

  it('refuses to touch invalid frontmatter', () => {
    expect(() => updateFrontmatter('---\n[a: b\n---\n', { id: 'x' })).toThrow(FrontmatterError);
    expect(() => updateFrontmatter('---\nid: x\n', { id: 'y' })).toThrow(/no closing delimiter/);
  });
});
