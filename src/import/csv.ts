import { IMPORT_DEFINITIONS, type ImportType } from './definitions.js';

export class CsvError extends Error {
  override name = 'CsvError';
}

export interface CsvRow {
  /** 1-based physical line where the record starts. */
  readonly line: number;
  readonly cells: readonly string[];
}

const BOM = '\uFEFF';

const endField = (cells: string[], value: string): string => {
  cells.push(value);
  return '';
};

/**
 * RFC 4180 parser: quoted fields, `""` escapes, embedded newlines, CRLF and a
 * leading UTF-8 BOM. Blank lines are skipped so a trailing newline is not a
 * row. The row `line` points at the first physical line, which is what a user
 * sees in their spreadsheet (docs/14-csv-import.md).
 */
export const parseCsv = (input: string): CsvRow[] => {
  const text = input.startsWith(BOM) ? input.slice(BOM.length) : input;
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let value = '';
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;
  let index = 0;

  const endRow = (): void => {
    value = endField(cells, value);
    if (!(cells.length === 1 && cells[0] === '')) rows.push({ line: rowLine, cells });
    cells = [];
  };

  while (index < text.length) {
    const char = text[index] as string;

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      if (char === '\r') {
        if (text[index + 1] === '\n') {
          // CRLF inside a quoted field: normalized when the LF is read.
          index += 1;
          continue;
        }
        value += '\n';
        index += 1;
        line += 1;
        continue;
      }
      if (char === '\n') {
        value += '\n';
        index += 1;
        line += 1;
        continue;
      }
      value += char;
      index += 1;
      continue;
    }

    if (char === '"' && value === '') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === ',') {
      value = endField(cells, value);
      index += 1;
      continue;
    }
    if (char === '\r') {
      endRow();
      index += text[index + 1] === '\n' ? 2 : 1;
      line += 1;
      rowLine = line;
      continue;
    }
    if (char === '\n') {
      endRow();
      index += 1;
      line += 1;
      rowLine = line;
      continue;
    }
    value += char;
    index += 1;
  }

  if (inQuotes) throw new CsvError(`Unclosed quote in the value starting on line ${rowLine}`);
  if (value !== '' || cells.length > 0) endRow();
  return rows;
};

const encodeCell = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.split('"').join('""')}"` : value;

/** Header row plus one example row, ready to download from Settings. */
export const skeletonCsv = (type: ImportType): string => {
  const { columns } = IMPORT_DEFINITIONS[type];
  const header = columns.map((column) => column.header).join(',');
  const example = columns.map((column) => encodeCell(column.example)).join(',');
  return `${header}\n${example}\n`;
};
