import { access } from 'node:fs/promises';
import { combinedOutput, runGit } from './exec.js';
import { gitPath, inspectRepo } from './repo.js';
import type { GitErrorInfo, GitStatus, GitStepName, GitSyncState } from './types.js';
import type { GitResult } from './exec.js';

export interface PorcelainEntry {
  readonly status: string;
  readonly path: string;
}

export interface PorcelainSummary {
  readonly entries: readonly PorcelainEntry[];
  readonly conflictPaths: readonly string[];
  readonly dirty: boolean;
}

/** Conflict states from `git status --porcelain` (docs/09 §Failure matrix). */
const CONFLICT_STATUSES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

export const parsePorcelain = (text: string): PorcelainSummary => {
  const entries: PorcelainEntry[] = [];

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const status = line.slice(0, 2);
    let path = line.slice(3).trim();
    const rename = path.indexOf(' -> ');
    if (rename !== -1) path = path.slice(rename + 4);
    if (path === '') continue;
    entries.push({ status, path });
  }

  const conflictPaths = [
    ...new Set(
      entries.filter((entry) => CONFLICT_STATUSES.has(entry.status)).map((entry) => entry.path),
    ),
  ];

  return { entries, conflictPaths, dirty: entries.length > 0 };
};

export interface AheadBehind {
  readonly ahead: number;
  readonly behind: number;
}

/** `rev-list --left-right --count @{u}...HEAD` prints `<behind>\t<ahead>`. */
export const parseAheadBehind = (text: string): AheadBehind | null => {
  const [behindText, aheadText] = text.trim().split(/\s+/);
  if (behindText === undefined || aheadText === undefined) return null;
  const behind = Number(behindText);
  const ahead = Number(aheadText);
  if (!Number.isInteger(behind) || !Number.isInteger(ahead)) return null;
  return { ahead, behind };
};

const rebaseInProgress = async (root: string): Promise<boolean> => {
  for (const name of ['rebase-merge', 'rebase-apply']) {
    const path = await gitPath(root, name);
    if (path === null) continue;
    try {
      await access(path);
      return true;
    } catch {
      // Try the next marker.
    }
  }
  return false;
};

/**
 * Classifies a failed git step into the failure matrix in docs/09. Pure except
 * for the inputs, so the matrix is unit-tested without spawning git.
 */
export const classifyFailure = (
  step: GitStepName,
  result: GitResult,
  conflictPaths: readonly string[] = [],
): GitErrorInfo | null => {
  if (result.code === 0) return null;

  const output = combinedOutput(result);
  if (result.timedOut) {
    return {
      code: 'timeout',
      message: 'Git did not finish within 10 seconds. Check the network, then retry.',
      output,
    };
  }

  const text = `${result.stdout}\n${result.stderr}`;

  if (
    /authentication failed|could not read username|could not read password|terminal prompts disabled|could not resolve host|permission denied \(publickey\)|repository not found|access denied|support for password authentication/i.test(
      text,
    )
  ) {
    return {
      code: 'auth_failed',
      message:
        'Git could not authenticate with the remote. Check the URL and your credentials; ob never stores them.',
      output,
    };
  }

  if (conflictPaths.length > 0 || /CONFLICT \(|rebase in progress|could not apply/i.test(text)) {
    return {
      code: 'rebase_conflict',
      message:
        'The pull produced conflicts. Resolve the listed files and run Sync again, or abort the sync.',
      output,
    };
  }

  if (
    /no tracking information|no upstream configured|has no upstream branch|set-upstream/i.test(text)
  ) {
    return {
      code: 'no_upstream',
      message: 'This branch has no upstream. Set one, then retry the sync.',
      output,
    };
  }

  if (/non-fast-forward|\[rejected\]|fetch first/i.test(text)) {
    return {
      code: 'non_fast_forward',
      message: 'The remote has commits this branch does not. Pull first, then push again.',
      output,
    };
  }

  if (step === 'commit') {
    if (/unable to auto-detect email address|empty ident|please tell me who you are/i.test(text)) {
      return {
        code: 'commit_failed',
        message: 'Git could not create the commit: the identity is missing.',
        output,
      };
    }
    // A hook that exits non-zero may print nothing; a failed commit is the signal.
    return {
      code: 'hook_rejected',
      message: 'A git hook rejected the commit. Fix the reported issue, then sync again.',
      output,
    };
  }

  return { code: 'git_failed', message: `git ${step} failed.`, output };
};

export interface StatusOptions {
  readonly syncState: GitSyncState;
  readonly error: GitErrorInfo | null;
}

const emptyStatus = (options: StatusOptions): GitStatus => ({
  initialized: false,
  repoOutsideWorkspace: false,
  branch: '',
  detached: false,
  dirty: false,
  changedFiles: 0,
  ahead: 0,
  behind: 0,
  unpushed: false,
  hasUpstream: false,
  remote: '',
  lastCommit: '',
  conflict: false,
  conflictPaths: [],
  syncState: options.syncState,
  error: options.error,
});

/** Read-only status; no command mutates the repository (docs/09 §Status derivation). */
export const readGitStatus = async (root: string, options: StatusOptions): Promise<GitStatus> => {
  const repo = await inspectRepo(root);
  if (!repo.initialized) return emptyStatus(options);

  if (repo.outsideWorkspace) {
    return {
      ...emptyStatus(options),
      initialized: true,
      repoOutsideWorkspace: true,
      branch: repo.branch,
      detached: repo.detached,
    };
  }

  const [porcelain, upstream, remote, log, rebasing] = await Promise.all([
    runGit(['status', '--porcelain'], { cwd: root }),
    runGit(['rev-list', '--left-right', '--count', '@{u}...HEAD'], { cwd: root }),
    runGit(['remote', 'get-url', 'origin'], { cwd: root }),
    runGit(['log', '-1', '--format=%h%x09%ar%x09%s'], { cwd: root }),
    rebaseInProgress(root),
  ]);

  const summary = parsePorcelain(porcelain.stdout);
  const counts = upstream.code === 0 ? parseAheadBehind(upstream.stdout) : null;
  const ahead = counts?.ahead ?? 0;
  const behind = counts?.behind ?? 0;

  return {
    initialized: true,
    repoOutsideWorkspace: false,
    branch: repo.branch,
    detached: repo.detached,
    dirty: summary.dirty,
    changedFiles: summary.entries.length,
    ahead,
    behind,
    unpushed: ahead > 0,
    hasUpstream: counts !== null,
    remote: remote.code === 0 ? remote.stdout.trim() : '',
    lastCommit: log.code === 0 ? log.stdout.trim() : '',
    conflict: rebasing || summary.conflictPaths.length > 0,
    conflictPaths: summary.conflictPaths,
    syncState: options.syncState,
    error: options.error,
  };
};
