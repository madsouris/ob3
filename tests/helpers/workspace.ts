import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANAGED_DIRS } from '../../src/workspace/paths.js';
import { makeTempDir } from './tmp.js';

export const FIXTURES_DIR = fileURLToPath(new URL('../../fixtures/workspaces', import.meta.url));

export interface TempWorkspace {
  readonly root: string;
  /** Directory to remove in cleanup (the workspace's parent). */
  readonly parent: string;
}

/** Copies a committed fixture into a throwaway directory. */
export async function makeFixtureWorkspace(name: string): Promise<TempWorkspace> {
  const parent = await makeTempDir(`ob-fx-${name}-`);
  const root = join(parent, 'ws');
  await cp(join(FIXTURES_DIR, name), root, { recursive: true });
  return { root, parent };
}

/** Creates an empty workspace skeleton (managed folders only). */
export async function makeEmptyWorkspace(): Promise<TempWorkspace> {
  const parent = await makeTempDir('ob-ws-');
  const root = join(parent, 'ws');
  for (const dir of MANAGED_DIRS) {
    await mkdir(join(root, dir), { recursive: true });
  }
  return { root, parent };
}

export async function writeRecord(root: string, relativePath: string, content: string): Promise<void> {
  const absolute = join(root, relativePath);
  await mkdir(join(absolute, '..'), { recursive: true });
  await writeFile(absolute, content);
}

/** Content hash of every file under `root`, keyed by workspace-relative path. */
export async function snapshotTree(root: string): Promise<Record<string, string>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const snapshot: Record<string, string> = {};

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const absolute = join(entry.parentPath, entry.name);
    const bytes = await readFile(absolute);
    snapshot[relative(root, absolute).split(sep).join('/')] = createHash('sha256')
      .update(bytes)
      .digest('hex');
  }

  return snapshot;
}
