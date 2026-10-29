import { describe, expect, it } from 'vitest';
import { CsvError, parseCsv, skeletonCsv } from '../../src/import/csv.js';
import { IMPORT_DEFINITIONS, IMPORT_TYPES } from '../../src/import/definitions.js';

describe('parseCsv', () => {
  it('parses simple rows with 1-based line numbers', () => {
    const rows = parseCsv('first_name,last_name\nAda,Lovelace\nGrace,Hopper\n');

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ line: 1, cells: ['first_name', 'last_name'] });
    expect(rows[1]).toEqual({ line: 2, cells: ['Ada', 'Lovelace'] });
    expect(rows[2]).toEqual({ line: 3, cells: ['Grace', 'Hopper'] });
  });

  it('keeps the last row when the file has no trailing newline', () => {
    expect(parseCsv('a,b')).toEqual([{ line: 1, cells: ['a', 'b'] }]);
  });

  it('handles quoted commas and escaped quotes', () => {
    const rows = parseCsv('name,note\n"Lovelace, Ada","say ""hi"""\n');

    expect(rows[1]?.cells).toEqual(['Lovelace, Ada', 'say "hi"']);
  });

  it('strips a UTF-8 BOM and accepts CRLF line endings', () => {
    const rows = parseCsv('\uFEFFfirst_name,last_name\r\nAda,Lovelace\r\n');

    expect(rows).toHaveLength(2);
    expect(rows[0]?.cells).toEqual(['first_name', 'last_name']);
    expect(rows[1]).toEqual({ line: 2, cells: ['Ada', 'Lovelace'] });
  });

  it('normalizes CRLF inside a quoted value', () => {
    const rows = parseCsv('note\n"line one\r\nline two"\n');
    expect(rows[1]?.cells).toEqual(['line one\nline two']);
  });

  it('keeps newlines inside quotes and reports later rows by physical line', () => {
    const rows = parseCsv('first_name,notes\nAda,"line one\nline two"\nGrace,ok\n');

    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual({ line: 2, cells: ['Ada', 'line one\nline two'] });
    expect(rows[2]).toEqual({ line: 4, cells: ['Grace', 'ok'] });
  });

  it('skips blank rows', () => {
    const rows = parseCsv('a,b\n\n1,2\n\n');
    expect(rows).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 3, cells: ['1', '2'] },
    ]);
  });

  it('keeps rows whose cells are all empty', () => {
    const rows = parseCsv('a,b\n,\n');
    expect(rows[1]?.cells).toEqual(['', '']);
  });

  it('rejects an unclosed quote', () => {
    expect(() => parseCsv('first_name,notes\nAda,"oops')).toThrow(CsvError);
    expect(() => parseCsv('first_name,notes\nAda,"oops')).toThrow(/line 2/);
  });

  it('returns nothing for an empty file', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\n\n')).toEqual([]);
  });
});

describe('skeletonCsv', () => {
  it('emits the definition header plus one example row for every type', () => {
    for (const type of IMPORT_TYPES) {
      const definition = IMPORT_DEFINITIONS[type];
      const rows = parseCsv(skeletonCsv(type));

      expect(rows).toHaveLength(2);
      expect(rows[0]?.cells).toEqual(definition.columns.map((column) => column.header));
      expect(rows[1]?.cells).toHaveLength(definition.columns.length);
      expect(rows[1]?.cells.every((cell) => cell !== '')).toBe(true);
    }
  });

  it('round-trips an example value containing punctuation', () => {
    const rows = parseCsv(skeletonCsv('contact'));
    expect(rows[1]?.cells[0]).toBe('Jane');
    expect(rows[1]?.cells[9]).toBe('Met at the Tech Expo.');
  });
});
