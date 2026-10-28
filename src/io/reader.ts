import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

/** Files above this size are reported as issues instead of parsed (doc 05). */
export const MAX_RECORD_BYTES = 2 * 1024 * 1024;

export interface ReadFileValue {
  readonly text: string;
  readonly hash: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly bom: boolean;
}

export type ReadFailureCode = 'missing' | 'too-large' | 'unreadable';

export type ReadFileResult =
  | { readonly ok: true; readonly value: ReadFileValue }
  | { readonly ok: false; readonly code: ReadFailureCode; readonly detail?: string };

const decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Reads a record file once and hashes the raw bytes. The hash is what makes
 * self-write suppression and optimistic-concurrency checks reliable.
 */
export const readRecordFile = async (absolutePath: string): Promise<ReadFileResult> => {
  let size: number;
  let mtimeMs: number;
  try {
    const stats = await stat(absolutePath);
    if (!stats.isFile()) return { ok: false, code: 'missing' };
    size = stats.size;
    mtimeMs = stats.mtimeMs;
  } catch {
    return { ok: false, code: 'missing' };
  }

  if (size > MAX_RECORD_BYTES) {
    return { ok: false, code: 'too-large', detail: `${size} bytes (limit ${MAX_RECORD_BYTES})` };
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(absolutePath);
  } catch {
    return { ok: false, code: 'missing' };
  }

  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    return { ok: false, code: 'unreadable' };
  }

  return {
    ok: true,
    value: {
      text,
      hash: createHash('sha256').update(bytes).digest('hex'),
      size,
      mtimeMs,
      bom: text.startsWith('\uFEFF'),
    },
  };
};
