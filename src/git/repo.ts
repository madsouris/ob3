import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { exists, writeFileAtomic } from '../io/atomic.js';
import {
  ASSETS_DIR,
  CONFIG_FILE,
  GITIGNORE_CONTENT,
  GITIGNORE_FILE,
  workspacePath,
} from '../workspace/paths.js';
import { GitError } from './errors.js';
import { combinedOutput, runGit } from './exec.js';
import type { GitResult } from './exec.js';

export interface RepoInfo {
  readonly initialized: boolean;
  /** Absolute path returned by git; `null` when not in a work tree. */
  readonly repoRoot: string | null;
  readonly outsideWorkspace: boolean;
  readonly branch: string;
  readonly detached: boolean;
}

export interface GitignoreResult {
  readonly changed: boolean;
  /** Present when a user-authored .gitignore is missing the state directory. */
  readonly warning: string | null;
}

export interface GitIdentity {
  readonly name: string;
  readonly email: string;
}

/** Compares canonical paths; macOS reports `/private/var` for `/var` workspaces. */
export const isSamePath = async (left: string, right: string): Promise<boolean> => {
  const canonical = async (value: string): Promise<string> => {
    try {
      return await realpath(value);
    } catch {
      return resolve(value);
    }
  };
  return (await canonical(left)) === (await canonical(right));
};

/**
 * Detects the repository containing the workspace. Never creates one, never
 * walks above the workspace (docs/09 §Safety rails).
 */
export const inspectRepo = async (root: string): Promise<RepoInfo> => {
  const inside = await runGit(['rev-parse', '--is-inside-work-tree'], { cwd: root });
  if (inside.code !== 0 || inside.stdout.trim() !== 'true') {
    return {
      initialized: false,
      repoRoot: null,
      outsideWorkspace: false,
      branch: '',
      detached: false,
    };
  }

  const toplevel = await runGit(['rev-parse', '--show-toplevel'], { cwd: root });
  if (toplevel.code !== 0) {
    return {
      initialized: false,
      repoRoot: null,
      outsideWorkspace: false,
      branch: '',
      detached: false,
    };
  }
  const repoRoot = toplevel.stdout.trim();

  const symbolic = await runGit(['symbolic-ref', '--short', '-q', 'HEAD'], { cwd: root });
  const detached = symbolic.code !== 0;

  return {
    initialized: true,
    repoRoot,
    outsideWorkspace: !(await isSamePath(root, repoRoot)),
    branch: detached ? '' : symbolic.stdout.trim(),
    detached,
  };
};

export const gitPath = async (root: string, name: string): Promise<string | null> => {
  const result = await runGit(['rev-parse', '--git-path', name], { cwd: root });
  if (result.code !== 0) return null;
  const value = result.stdout.trim();
  if (value === '') return null;
  return value.startsWith('/') ? value : resolve(root, value);
};

/**
 * Ensures `.ob/state/` is ignored. Only writes when the file is missing; an
 * existing user file is never rewritten (docs/09 §Safety rails).
 */
export const ensureGitignore = async (root: string): Promise<GitignoreResult> => {
  const file = workspacePath(root, GITIGNORE_FILE);
  let current: string;
  try {
    current = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await writeFileAtomic(file, GITIGNORE_CONTENT, { exclusive: true });
    return { changed: true, warning: null };
  }

  const ignored = current
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === '.ob/state/' || line === '.ob/state' || line === '.ob/state/**');
  if (ignored) return { changed: false, warning: null };

  return {
    changed: false,
    warning:
      '.gitignore exists but does not ignore .ob/state/. Add ".ob/state/" so the session token and lock stay out of git.',
  };
};

export const hasStagedChanges = async (root: string): Promise<boolean> => {
  const result = await runGit(['diff', '--cached', '--quiet'], { cwd: root });
  return result.code === 1;
};

/**
 * Stages everything except the session/lock directory. `ob` must never commit
 * the server token. When `.ob/state/` is ignored (the normal case) a plain
 * `add -A` is safe and covers root-level user files too; otherwise only the
 * managed roots and the config are staged.
 */
export const stageAll = async (root: string): Promise<GitResult> => {
  const ignored = await runGit(['check-ignore', '--quiet', '.ob/state/server.lock'], { cwd: root });
  if (ignored.code === 0) {
    return runGit(['add', '-A', '--', '.'], { cwd: root });
  }

  const paths = [
    'contacts',
    'projects',
    'tasks',
    'estimates',
    'invoices',
    'documents',
    CONFIG_FILE,
    GITIGNORE_FILE,
  ];
  if (await exists(workspacePath(root, ASSETS_DIR))) paths.push(ASSETS_DIR);

  return runGit(['add', '-A', '--', ...paths], { cwd: root });
};

export const readIdentity = async (root: string): Promise<GitIdentity | null> => {
  const name = await runGit(['config', 'user.name'], { cwd: root });
  const email = await runGit(['config', 'user.email'], { cwd: root });
  const value = { name: name.stdout.trim(), email: email.stdout.trim() };
  if (name.code !== 0 || email.code !== 0 || value.name === '' || value.email === '') return null;
  return value;
};

export interface InitRepositoryOptions {
  readonly identity?: GitIdentity;
}

export interface InitRepositoryResult {
  readonly warning: string | null;
}

/**
 * Creates the repository, adds everything once and makes the initial commit.
 * Used by `ob init` and `POST /api/git/init` so both paths behave identically.
 */
export const initializeRepository = async (
  root: string,
  options: InitRepositoryOptions = {},
): Promise<InitRepositoryResult> => {
  const identity = options.identity ?? (await readIdentity(root));
  if (identity === null) {
    throw new GitError(
      'identity_missing',
      'Git identity is not configured. Run: git config --global user.name "Your Name" && git config --global user.email "you@example.com"',
    );
  }

  const init = await runGit(['init', '--quiet'], { cwd: root });
  if (init.code !== 0) {
    throw new GitError(
      'git_failed',
      `git init failed: ${combinedOutput(init)}`,
      combinedOutput(init),
    );
  }

  const ignore = await ensureGitignore(root);

  const add = await stageAll(root);
  if (add.code !== 0) {
    throw new GitError('git_failed', `git add failed: ${combinedOutput(add)}`, combinedOutput(add));
  }

  if (await hasStagedChanges(root)) {
    const commit = await runGit(
      [
        '-c',
        `user.name=${identity.name}`,
        '-c',
        `user.email=${identity.email}`,
        'commit',
        '--quiet',
        '--no-verify',
        '-m',
        'ob: initialize workspace',
      ],
      { cwd: root },
    );
    if (commit.code !== 0) {
      throw new GitError(
        'commit_failed',
        `Initial commit failed: ${combinedOutput(commit)}`,
        combinedOutput(commit),
      );
    }
  }

  return { warning: ignore.warning };
};

/** Adds `origin` or updates its URL. Does not push unless the caller asks. */
export const setRemoteUrl = async (root: string, url: string): Promise<void> => {
  const existing = await runGit(['remote', 'get-url', 'origin'], { cwd: root });
  const result =
    existing.code === 0
      ? await runGit(['remote', 'set-url', 'origin', url], { cwd: root })
      : await runGit(['remote', 'add', 'origin', url], { cwd: root });

  if (result.code !== 0) {
    throw new GitError(
      'git_failed',
      `Could not set the remote: ${combinedOutput(result)}`,
      combinedOutput(result),
    );
  }
};
