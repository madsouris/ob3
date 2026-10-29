import { combinedOutput, runGit } from './exec.js';
import { hasStagedChanges, inspectRepo, stageAll } from './repo.js';
import { classifyFailure, parsePorcelain } from './status.js';
import type { GitErrorInfo, GitStepResult } from './types.js';

export interface SyncOptions {
  readonly root: string;
  /** Server runs refuse a parent repo; the CLI can opt in (docs/09). */
  readonly allowParentRepo: boolean;
  readonly commitMessage?: string;
  readonly onStep?: (step: GitStepResult) => void;
}

export interface SyncOutcome {
  readonly ok: boolean;
  readonly steps: readonly GitStepResult[];
  readonly error: GitErrorInfo | null;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** `ob auto-sync: YYYY-MM-DD HH:mm:ss` in the user's local time (docs/09). */
export const syncCommitMessage = (date: Date = new Date()): string =>
  `ob auto-sync: ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

/**
 * The only path that pushes (docs/09 §Manual sync). Order is normative:
 * `add -A` → `commit` → `pull --rebase` → `push`. Nothing here retries,
 * force-pushes, or aborts a rebase — recovery is a user action.
 */
export const runSync = async (options: SyncOptions): Promise<SyncOutcome> => {
  const { root } = options;
  const steps: GitStepResult[] = [];
  const emit = (step: GitStepResult): void => {
    steps.push(step);
    options.onStep?.(step);
  };

  const repo = await inspectRepo(root);
  if (!repo.initialized) {
    return {
      ok: false,
      steps,
      error: {
        code: 'not_a_repo',
        message: 'This workspace is not a git repository. Initialize git first.',
      },
    };
  }
  if (repo.outsideWorkspace && !options.allowParentRepo) {
    return {
      ok: false,
      steps,
      error: {
        code: 'repo_outside_workspace',
        message:
          'The workspace lives inside a different repository. Give it its own repo, or run `ob sync --allow-parent-repo`.',
      },
    };
  }
  if (repo.detached) {
    return {
      ok: false,
      steps,
      error: {
        code: 'detached_head',
        message: 'HEAD is detached. Check out a branch before syncing.',
      },
    };
  }

  const add = await stageAll(root);
  emit({ name: 'add', ok: add.code === 0, output: combinedOutput(add) });
  if (add.code !== 0) {
    return { ok: false, steps, error: classifyFailure('add', add, []) };
  }

  if (await hasStagedChanges(root)) {
    const commit = await runGit(['commit', '-m', options.commitMessage ?? syncCommitMessage()], {
      cwd: root,
    });
    emit({ name: 'commit', ok: commit.code === 0, output: combinedOutput(commit) });
    if (commit.code !== 0) {
      return { ok: false, steps, error: classifyFailure('commit', commit, []) };
    }
  } else {
    emit({ name: 'commit', ok: true, skipped: true, output: 'Nothing to commit.' });
  }

  const pull = await runGit(['pull', '--rebase'], { cwd: root });
  if (pull.code !== 0) {
    const status = await runGit(['status', '--porcelain'], { cwd: root });
    const summary = parsePorcelain(status.stdout);
    emit({ name: 'pull', ok: false, output: combinedOutput(pull) });
    return { ok: false, steps, error: classifyFailure('pull', pull, summary.conflictPaths) };
  }
  emit({ name: 'pull', ok: true, output: combinedOutput(pull) });

  const push = await runGit(['push'], { cwd: root });
  emit({ name: 'push', ok: push.code === 0, output: combinedOutput(push) });
  if (push.code !== 0) {
    return { ok: false, steps, error: classifyFailure('push', push, []) };
  }

  return { ok: true, steps, error: null };
};
