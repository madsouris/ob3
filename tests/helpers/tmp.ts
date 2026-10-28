import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function makeTempDir(prefix = 'ob-test-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1))
    .sort();
}
