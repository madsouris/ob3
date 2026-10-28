import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import {
  WorkspaceBusyError,
  acquireLock,
  isProcessAlive,
  readLock,
  releaseLock,
} from '../../src/workspace/lock.js';
import { makeTempDir, removeTempDir } from '../helpers/tmp.js';

let temp: string | null = null;

afterEach(async () => {
  if (temp !== null) await removeTempDir(temp);
  temp = null;
});

async function workspace(): Promise<string> {
  temp = await makeTempDir();
  return temp;
}

async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  await once(child, 'exit');
  return child.pid ?? 999_999;
}

describe('workspace lock', () => {
  it('acquires, reads and releases', async () => {
    const root = await workspace();
    const result = await acquireLock(root, { pid: 4321, port: 19_731 });
    expect(result.reclaimedPid).toBeNull();

    const lock = await readLock(root);
    expect(lock?.pid).toBe(4321);
    expect(lock?.port).toBe(19_731);

    await releaseLock(root);
    expect(await readLock(root)).toBeNull();
  });

  it('refuses to acquire while a live process holds the lock', async () => {
    const root = await workspace();
    await acquireLock(root, { pid: process.pid, port: 19_731 });

    await expect(acquireLock(root, { pid: 999 })).rejects.toBeInstanceOf(WorkspaceBusyError);
    await expect(acquireLock(root, { pid: 999 })).rejects.toThrow(/already in use/);
  });

  it('reclaims a stale lock left by a dead process', async () => {
    const root = await workspace();
    const pid = await deadPid();
    await acquireLock(root, { pid, port: 19_731 });

    const result = await acquireLock(root, { pid: process.pid, port: 19_732 });
    expect(result.reclaimedPid).toBe(pid);
    expect((await readLock(root))?.pid).toBe(process.pid);
  });

  it('treats a corrupt lock file as stale', async () => {
    const root = await workspace();
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    await mkdir(join(root, '.ob/state'), { recursive: true });
    await writeFile(join(root, '.ob/state/server.lock'), 'not json');

    const result = await acquireLock(root, { pid: process.pid });
    expect(result.reclaimedPid).toBeNull();
    expect((await readLock(root))?.pid).toBe(process.pid);
  });

  it('isProcessAlive reports the current process and rejects nonsense pids', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
    expect(isProcessAlive(Number.NaN)).toBe(false);
  });
});
