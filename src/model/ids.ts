import { randomBytes } from 'node:crypto';

/** Prefixes that make a raw id self-describing (ADR-06). */
export const RECORD_PREFIXES = ['cnt', 'proj', 'tsk', 'est', 'inv', 'doc'] as const;
export type RecordPrefix = (typeof RECORD_PREFIXES)[number];

/** `{prefix}_{26-char Crockford Base32 ULID}`. */
export const RECORD_ID_PATTERN = /^(?:cnt|proj|tsk|est|inv|doc)_[0-9A-HJKMNP-TV-Z]{26}$/;

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_CHARS = 10;
const RANDOM_CHARS = 16;

export interface IdGeneratorOptions {
  readonly now?: () => number;
  readonly random?: (size: number) => Uint8Array;
}

const encode = (value: bigint, length: number): string => {
  let remaining = value;
  let result = '';
  for (let index = 0; index < length; index += 1) {
    const digit = Number(remaining % 32n);
    result = `${ENCODING[digit] ?? '0'}${result}`;
    remaining /= 32n;
  }
  return result;
};

/** Generates a ULID-based record id. Injectable clock/randomness keep tests deterministic. */
export const createId = (prefix: RecordPrefix, options: IdGeneratorOptions = {}): string => {
  const now = options.now ?? Date.now;
  const random = options.random ?? randomBytes;

  const timePart = encode(BigInt(now()), TIME_CHARS);
  let randomValue = 0n;
  for (const byte of random(10)) randomValue = (randomValue << 8n) | BigInt(byte);
  const randomPart = encode(randomValue, RANDOM_CHARS);

  return `${prefix}_${timePart}${randomPart}`;
};

export const isRecordId = (value: unknown): value is string =>
  typeof value === 'string' && RECORD_ID_PATTERN.test(value);

export const recordPrefixOf = (value: string): RecordPrefix | null => {
  const separator = value.indexOf('_');
  if (separator <= 0) return null;
  const prefix = value.slice(0, separator);
  return (RECORD_PREFIXES as readonly string[]).includes(prefix) ? (prefix as RecordPrefix) : null;
};

const TYPE_PREFIXES: Readonly<Record<string, RecordPrefix>> = {
  contact: 'cnt',
  project: 'proj',
  task: 'tsk',
  estimate: 'est',
  invoice: 'inv',
  document: 'doc',
};

/** True when the id's prefix matches the record type it is stored under. */
export const prefixMatchesType = (prefix: RecordPrefix, type: string): boolean =>
  TYPE_PREFIXES[type] === prefix;
