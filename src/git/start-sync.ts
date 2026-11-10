import { combinedOutput, runGit } from './exec.js';
import { inspectRepo } from './repo.js';
import { classifyFailure, parseAheadBehind, parsePorcelain } from './status.js';
import type { GitErrorInfo } from './types.js';

/** Why the pre-start pull did not run; `up_to_date` is the common, silent case. */
export type StartSyncSkip =
  | 'not_a_repo'
  | 'outside_workspace'
  | 'detached'
  | 'dirty'
  | 'no_upstream'
  | 'up_to_date'
  | 'diverged'
  | 'unreachable';

export type StartSyncOutcome =
  | { readonly ran: false; readonly reason: StartSyncSkip }
  | { readonly ran: true; readonly ok: true; readonly behind: number; readonly output: string }
  | {
      readonly ran: true;
      readonly ok: false;
      readonly behind: number;
      readonly output: string;
      readonly error: GitErrorInfo | null;
    };

export interface StartSyncOptions {
  readonly root: string;
  /** Mirrors `OB_ALLOW_PARENT_REPO`; the server refuses a parent repo by default. */
  readonly allowParentRepo: boolean;
}

/** The pre-start check must not turn a slow network into a slow launch. */
const FETCH_TIMEOUT_MS = 5000;

/**
 * Fast-forwards to the remote before the index is built (docs/09 §Pull before
 * start). Only a clean, strictly-behind branch is pulled, so the rebase cannot
 * conflict; a diverged branch is left for the user's Sync. Nothing here stages,
 * commits, pushes, or aborts — startup never mutates local work.
 */
export const pullBeforeStart = async (options: StartSyncOptions): Promise<StartSyncOutcome> => {
  const { root } = options;

  const repo = await inspectRepo(root);
  if (!repo.initialized) return { ran: false, reason: 'not_a_repo' };
  if (repo.outsideWorkspace && !options.allowParentRepo) {
    return { ran: false, reason: 'outside_workspace' };
  }
  if (repo.detached) return { ran: false, reason: 'detached' };

  const status = await runGit(['status', '--porcelain'], { cwd: root });
  if (status.code !== 0) return { ran: false, reason: 'not_a_repo' };
  // Untracked files count as dirty on purpose: the incoming commits may add
  // the same paths, and git would refuse the checkout mid-pull.
  if (parsePorcelain(status.stdout).dirty) return { ran: false, reason: 'dirty' };

  const upstream = await runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], {
    cwd: root,
  });
  if (upstream.code !== 0 || upstream.stdout.trim() === '') {
    return { ran: false, reason: 'no_upstream' };
  }

  const fetch = await runGit(['fetch', '--quiet'], { cwd: root, timeoutMs: FETCH_TIMEOUT_MS });
  if (fetch.code !== 0) return { ran: false, reason: 'unreachable' };

  const counts = await runGit(['rev-list', '--left-right', '--count', '@{u}...HEAD'], {
    cwd: root,
  });
  const aheadBehind = counts.code === 0 ? parseAheadBehind(counts.stdout) : null;
  if (aheadBehind === null) return { ran: false, reason: 'unreachable' };
  if (aheadBehind.behind === 0) return { ran: false, reason: 'up_to_date' };
  if (aheadBehind.ahead > 0) return { ran: false, reason: 'diverged' };

  const pull = await runGit(['pull', '--rebase'], { cwd: root });
  const output = combinedOutput(pull);
  if (pull.code === 0) {
    return { ran: true, ok: true, behind: aheadBehind.behind, output };
  }

  const after = await runGit(['status', '--porcelain'], { cwd: root });
  return {
    ran: true,
    ok: false,
    behind: aheadBehind.behind,
    output,
    error: classifyFailure('pull', pull, parsePorcelain(after.stdout).conflictPaths),
  };
};
