import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSyncCommand } from '../../src/cli/sync.js';
import { commitSubjects, createBareOrigin, seedGitWorkspace } from '../helpers/git.js';
import { makeFixtureWorkspace } from '../helpers/workspace.js';
import { removeTempDir } from '../helpers/tmp.js';

const parents: string[] = [];

afterEach(async () => {
  for (const parent of parents) await removeTempDir(parent);
  parents.length = 0;
});

const captureOutput = (): { text: () => string; restore: () => void } => {
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  return {
    text: () =>
      [...stdout.mock.calls, ...stderr.mock.calls].map((call) => String(call[0])).join(''),
    restore: () => {
      stdout.mockRestore();
      stderr.mockRestore();
    },
  };
};

describe('ob sync', () => {
  it('prints the commands in dry-run mode without touching the workspace', async () => {
    const captured = captureOutput();
    try {
      const code = await runSyncCommand({
        workspace: '/tmp/ob-dry-run-workspace',
        verbose: false,
        dryRun: true,
        allowParentRepo: false,
      });
      expect(code).toBe(0);
      const text = captured.text();
      expect(text).toContain('git add -A');
      expect(text).toContain('git commit -m "ob auto-sync: ');
      expect(text).toContain('git pull --rebase');
      expect(text).toContain('git push');
      expect(text).toContain('Dry run');
    } finally {
      captured.restore();
    }
  });

  it('runs the four steps against a real workspace and exits zero', async () => {
    const workspace = await makeFixtureWorkspace('demo');
    parents.push(workspace.parent);
    const origin = await createBareOrigin(workspace.parent);
    await seedGitWorkspace(workspace.root, { origin });

    const globalConfig = join(workspace.parent, 'gitconfig');
    await writeFile(
      globalConfig,
      '[user]\n\tname = ob test\n\temail = ob-test@example.com\n',
      'utf8',
    );
    const previous = process.env['GIT_CONFIG_GLOBAL'];
    process.env['GIT_CONFIG_GLOBAL'] = globalConfig;

    const captured = captureOutput();
    try {
      const code = await runSyncCommand({
        workspace: workspace.root,
        verbose: false,
        dryRun: false,
        allowParentRepo: false,
      });
      expect(code, captured.text()).toBe(0);
      const text = captured.text();
      expect(text).toContain('git add -A');
      expect(text).toContain('nothing to commit');
      expect(text).toContain('git pull --rebase');
      expect(text).toContain('git push');
      expect(text).toContain('Sync complete');
      expect(await commitSubjects(origin)).toContain('seed');
    } finally {
      captured.restore();
      if (previous === undefined) delete process.env['GIT_CONFIG_GLOBAL'];
      else process.env['GIT_CONFIG_GLOBAL'] = previous;
    }
  });
});
