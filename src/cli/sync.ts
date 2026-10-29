import { out } from './output.js';
import { printReport, runPreflight } from './preflight.js';
import { runSync, syncCommitMessage } from '../git/sync.js';
import type { GitStepName } from '../git/types.js';
import { isInitialized } from '../workspace/config.js';
import { WorkspaceBusyError, acquireLock, releaseLock } from '../workspace/lock.js';
import { resolveWorkspace } from '../workspace/paths.js';

export interface SyncCommandOptions {
  readonly workspace: string | undefined;
  readonly verbose: boolean;
  readonly dryRun: boolean;
  readonly allowParentRepo: boolean;
}

const STEP_LABEL: Readonly<Record<GitStepName, string>> = {
  add: 'git add -A',
  commit: 'git commit',
  pull: 'git pull --rebase',
  push: 'git push',
};

/**
 * `ob sync` — the headless twin of the Sync button (docs/09 §CLI parity).
 * Prints the same steps, exits non-zero on failure, and acquires the workspace
 * lock so it cannot race a running server.
 */
export async function runSyncCommand(options: SyncCommandOptions): Promise<number> {
  const root = resolveWorkspace(options.workspace ?? process.cwd());

  if (options.dryRun) {
    out.line();
    out.dim(root);
    out.line();
    out.info('git add -A');
    out.info(`git commit -m "${syncCommitMessage()}"`);
    out.info('git pull --rebase');
    out.info('git push');
    out.line();
    out.dim('Dry run — nothing was executed.');
    return 0;
  }

  const report = await runPreflight({ workspace: root, requireGitIdentity: true });
  printReport(report);
  if (report.failed) return 1;

  if (!(await isInitialized(root))) {
    out.error('No workspace found (.ob/config.json missing). Run `ob init` first.');
    return 1;
  }

  try {
    const lock = await acquireLock(root, { pid: process.pid });
    if (lock.reclaimedPid !== null) {
      out.warn(`Reclaimed a stale lock from PID ${lock.reclaimedPid}.`);
    }

    try {
      out.line();
      const result = await runSync({
        root,
        allowParentRepo: options.allowParentRepo,
        onStep: (step) => {
          const line = STEP_LABEL[step.name];
          if (step.skipped === true) {
            out.dim(`${line} — nothing to commit`);
            return;
          }
          if (step.ok) {
            out.ok(line);
            if (options.verbose && step.output !== '') out.dim(step.output);
            return;
          }
          out.fail(line);
          if (step.output !== '') out.dim(step.output);
        },
      });

      out.line();
      if (result.ok) {
        out.ok('Sync complete');
        return 0;
      }

      if (result.error !== null) {
        out.error(`${result.error.code}: ${result.error.message}`);
        if (options.verbose && result.error.output !== undefined) out.dim(result.error.output);
      }
      return 1;
    } finally {
      await releaseLock(root);
    }
  } catch (error) {
    if (error instanceof WorkspaceBusyError) {
      out.error(error.message);
      out.dim('Stop the running instance, or sync from the app.');
      return 1;
    }
    out.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
