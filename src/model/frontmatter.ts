import { Document, parseDocument } from 'yaml';

export class FrontmatterError extends Error {
  override name = 'FrontmatterError';
}

export interface FrontmatterSplit {
  readonly hadFrontmatter: boolean;
  /** A `---` opener with no closing delimiter: the file cannot be safely parsed. */
  readonly unterminated: boolean;
  readonly bom: boolean;
  readonly newline: '\n' | '\r\n';
  readonly openDelimiter: string;
  /** Raw YAML source between the delimiters (delimiters excluded). */
  readonly frontmatterSource: string;
  /** Closing delimiter line, including its newline when present. */
  readonly closeDelimiter: string;
  /** Everything after the closing delimiter, byte-for-byte. */
  readonly body: string;
}

const OPEN = '---';
const CLOSERS = new Set(['---', '...']);

/**
 * Splits a Markdown file into frontmatter source and body without normalizing
 * anything. The body slice is what `ob` writes back untouched (ADR-04).
 */
export const splitFrontmatter = (source: string): FrontmatterSplit => {
  const bom = source.startsWith('\uFEFF');
  const text = bom ? source.slice(1) : source;
  const newline: '\n' | '\r\n' = text.includes('\r\n') ? '\r\n' : '\n';

  const firstEnd = text.indexOf(newline);
  const firstLine = firstEnd === -1 ? text : text.slice(0, firstEnd);

  if (firstLine.trim() !== OPEN) {
    return {
      hadFrontmatter: false,
      unterminated: false,
      bom,
      newline,
      openDelimiter: '',
      frontmatterSource: '',
      closeDelimiter: '',
      body: text,
    };
  }

  const afterOpen = firstEnd + newline.length;
  let cursor = afterOpen;

  while (cursor <= text.length) {
    const lineEnd = text.indexOf(newline, cursor);
    const line = lineEnd === -1 ? text.slice(cursor) : text.slice(cursor, lineEnd);
    if (CLOSERS.has(line.trim())) {
      const endOfDelimiter = lineEnd === -1 ? text.length : lineEnd + newline.length;
      return {
        hadFrontmatter: true,
        unterminated: false,
        bom,
        newline,
        openDelimiter: `${firstLine}${newline}`,
        frontmatterSource: text.slice(afterOpen, cursor),
        closeDelimiter: text.slice(cursor, endOfDelimiter),
        body: text.slice(endOfDelimiter),
      };
    }
    if (lineEnd === -1) break;
    cursor = lineEnd + newline.length;
  }

  return {
    hadFrontmatter: false,
    unterminated: true,
    bom,
    newline,
    openDelimiter: '',
    frontmatterSource: '',
    closeDelimiter: '',
    body: text,
  };
};

export interface ParsedFrontmatter {
  readonly split: FrontmatterSplit;
  readonly document: Document.Parsed;
  readonly data: Readonly<Record<string, unknown>>;
}

/** Parses the YAML block. Throws `FrontmatterError` for invalid or unterminated frontmatter. */
export const parseFrontmatter = (source: string): ParsedFrontmatter => {
  const split = splitFrontmatter(source);

  if (split.unterminated) {
    throw new FrontmatterError('Frontmatter has an opening "---" but no closing delimiter');
  }

  const document = parseDocument(split.frontmatterSource, { keepSourceTokens: true });

  if (document.errors.length > 0) {
    throw new FrontmatterError(document.errors.map((error) => error.message).join('; '));
  }

  const data = document.toJS() ?? {};
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new FrontmatterError('Frontmatter is not a mapping');
  }

  return { split, document, data: data as Record<string, unknown> };
};

/** Reads frontmatter + body without requiring the record to be valid. */
export const readFrontmatter = (
  source: string,
): { readonly frontmatter: Readonly<Record<string, unknown>>; readonly body: string } => {
  const parsed = parseFrontmatter(source);
  return { frontmatter: parsed.data, body: parsed.split.body };
};

/**
 * Applies a shallow patch to the frontmatter and re-serializes only that block.
 * `undefined` deletes a key. An empty patch returns the source unchanged, which
 * is what makes "read → write with no change" byte-identical.
 */
export const updateFrontmatter = (source: string, patch: Readonly<Record<string, unknown>>): string => {
  if (Object.keys(patch).length === 0) return source;

  const split = splitFrontmatter(source);
  if (split.unterminated) {
    throw new FrontmatterError('Frontmatter has an opening "---" but no closing delimiter');
  }

  const document = split.hadFrontmatter
    ? parseDocument(split.frontmatterSource, { keepSourceTokens: true })
    : new Document({});

  if (document.errors.length > 0) {
    throw new FrontmatterError(document.errors.map((error) => error.message).join('; '));
  }

  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      changed = document.delete(key) || changed;
    } else {
      document.set(key, value);
      changed = true;
    }
  }

  if (!changed) return source;

  const serialized = document
    .toString({ lineWidth: 0, flowCollectionPadding: false })
    .replace(/\r?\n/g, split.newline);
  const frontmatterSource = serialized.endsWith(split.newline)
    ? serialized.slice(0, -split.newline.length)
    : serialized;

  const bom = split.bom ? '\uFEFF' : '';
  const hasBody = split.body !== '';
  const open = split.hadFrontmatter ? split.openDelimiter : `---${split.newline}`;

  if (split.hadFrontmatter) {
    const close = split.closeDelimiter;
    const closingNewline = close.endsWith(split.newline) ? '' : hasBody ? split.newline : '';
    return `${bom}${open}${frontmatterSource}${split.newline}${close}${closingNewline}${split.body}`;
  }

  const close = `---${split.newline}`;
  return `${bom}${open}${frontmatterSource}${split.newline}${close}${split.body}`;
};
