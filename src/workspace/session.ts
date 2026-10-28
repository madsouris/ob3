import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { writePrivateFileAtomic } from '../io/atomic.js';
import { SESSION_FILE, workspacePath } from './paths.js';

export type SessionInfo = {
  token: string;
  port: number;
  pid: number;
  startedAt: string;
};

/** Per-run bearer token for mutating API calls (ADR-08). Never persisted elsewhere. */
export function createToken(): string {
  return randomBytes(32).toString('hex');
}

export async function writeSession(root: string, session: SessionInfo): Promise<void> {
  await writePrivateFileAtomic(
    workspacePath(root, SESSION_FILE),
    `${JSON.stringify(session, null, 2)}\n`,
  );
}

export async function readSession(root: string): Promise<SessionInfo | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(workspacePath(root, SESSION_FILE), 'utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'token' in parsed &&
      'port' in parsed &&
      'pid' in parsed
    ) {
      const record = parsed as Record<string, unknown>;
      if (
        typeof record['token'] === 'string' &&
        typeof record['port'] === 'number' &&
        typeof record['pid'] === 'number'
      ) {
        return {
          token: record['token'],
          port: record['port'],
          pid: record['pid'],
          startedAt: typeof record['startedAt'] === 'string' ? record['startedAt'] : '',
        };
      }
    }
  } catch {
    // Missing or corrupt session file is not fatal: it is rewritten on start.
  }
  return null;
}
