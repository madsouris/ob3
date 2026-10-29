import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Canonical temp directory. macOS reports `TMPDIR` as `/var/...`, which is a
 * symlink to `/private/var/...`; `resolveInWorkspace` canonicalises the root,
 * so tests must start from the same form or path comparisons fail per machine.
 */
export async function makeTempDir(prefix = 'ob-test-'): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), prefix)));
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
