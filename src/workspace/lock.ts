import { readFile, unlink } from 'node:fs/promises';
import { writePrivateFileAtomic } from '../io/atomic.js';
import { LOCK_FILE, workspacePath } from './paths.js';

export type LockInfo = {
  pid: number;
  port: number | null;
  startedAt: string;
};

export class WorkspaceBusyError extends Error {
  override name = 'WorkspaceBusyError';
  constructor(
    readonly pid: number,
    readonly port: number | null,
  ) {
    super(
      port === null
        ? `Workspace is already in use by PID ${pid}.`
        : `Workspace is already in use by PID ${pid} on http://127.0.0.1:${port}.`,
    );
  }
}

/**
 * Claims `.ob/state/server.lock`. A lock whose PID is dead is reclaimed (a
 * crashed run must not brick the workspace), a live one is a hard error.
 */
export async function acquireLock(
  root: string,
  info: { pid: number; port?: number | null },
): Promise<{ reclaimedPid: number | null }> {
  const previous = await readLock(root);
  let reclaimedPid: number | null = null;

  if (previous !== null) {
    if (isProcessAlive(previous.pid)) {
      throw new WorkspaceBusyError(previous.pid, previous.port);
    }
    reclaimedPid = previous.pid;
  }

  const payload: LockInfo = {
    pid: info.pid,
    port: info.port ?? null,
    startedAt: new Date().toISOString(),
  };
  await writePrivateFileAtomic(workspacePath(root, LOCK_FILE), `${JSON.stringify(payload, null, 2)}\n`);

  return { reclaimedPid };
}

export async function releaseLock(root: string): Promise<void> {
  try {
    await unlink(workspacePath(root, LOCK_FILE));
  } catch {
    // Already gone, or never created — nothing to release.
  }
}

export async function readLock(root: string): Promise<LockInfo | null> {
  let raw: string;
  try {
    raw = await readFile(workspacePath(root, LOCK_FILE), 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'pid' in parsed &&
      typeof (parsed as { pid: unknown }).pid === 'number'
    ) {
      const record = parsed as { pid: number; port?: unknown; startedAt?: unknown };
      return {
        pid: record.pid,
        port: typeof record.port === 'number' ? record.port : null,
        startedAt: typeof record.startedAt === 'string' ? record.startedAt : new Date(0).toISOString(),
      };
    }
  } catch {
    // Corrupt lock file: treat as stale.
  }
  return null;
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
