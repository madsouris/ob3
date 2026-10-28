import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/** Directories `ob` writes when it treats a path as a workspace. */
const WORKSPACE_MARKERS = [
  'contacts',
  'projects',
  'tasks',
  'estimates',
  'invoices',
  'documents',
  '.ob',
];

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe('repo hygiene', () => {
  it('never contains a working workspace at the repo root', async () => {
    for (const marker of WORKSPACE_MARKERS) {
      expect(await exists(join(repoRoot, marker)), `${marker}/ must not exist at the repo root`).toBe(
        false,
      );
    }
  });

  it('gitignores every workspace marker at the repo root', async () => {
    const gitignore = await readFile(join(repoRoot, '.gitignore'), 'utf8');
    for (const marker of WORKSPACE_MARKERS) {
      expect(gitignore, `.gitignore should ignore /${marker}/`).toContain(`/${marker}/`);
    }
    expect(gitignore).toContain('/.scratch/');
  });

  it('keeps the demo fixture as the only committed workspace data', async () => {
    expect(await exists(join(repoRoot, 'fixtures/workspaces/demo/.ob/config.json'))).toBe(true);
  });
});
