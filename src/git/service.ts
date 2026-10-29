import { readConfig } from '../workspace/config.js';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { GitError } from './errors.js';
import { combinedOutput, runGit } from './exec.js';
import { hasStagedChanges, initializeRepository, inspectRepo, setRemoteUrl } from './repo.js';
import { classifyFailure, readGitStatus } from './status.js';
import { runSync } from './sync.js';
import type {
  CommitTarget,
  GitErrorInfo,
  GitEventPublisher,
  GitInitReport,
  GitRecoveryAction,
  GitRecoveryReport,
  GitRemoteReport,
  GitService,
  GitStatus,
  GitSyncReport,
  GitSyncState,
} from './types.js';

export interface GitServiceOptions {
  readonly root: string;
  readonly publisher?: GitEventPublisher;
  /** Default 1200 ms (docs/09). Tests inject a deterministic window. */
  readonly debounceMs?: number;
  readonly allowParentRepo?: boolean;
  readonly statusCacheMs?: number;
}

const toErrorInfo = (error: unknown): GitErrorInfo =>
  error instanceof GitError
    ? {
        code: error.code,
        message: error.message,
        ...(error.output === undefined ? {} : { output: error.output }),
      }
    : {
        code: 'git_failed',
        message: error instanceof Error ? error.message : String(error),
      };

/**
 * Owns every git operation for one workspace. Commits and syncs share one
 * promise queue, so a save during a slow push waits instead of racing it; the
 * scheduler never throws into the save path (docs/09 §Commit-on-save).
 */
export const createGitService = (options: GitServiceOptions): GitService => {
  const { root } = options;
  const debounceMs = options.debounceMs ?? 1200;
  const statusCacheMs = options.statusCacheMs ?? 500;
  const allowParentRepo = options.allowParentRepo ?? false;

  let queue: Promise<unknown> = Promise.resolve();
  let pending = new Map<string, string>();
  let timer: NodeJS.Timeout | null = null;
  let syncState: GitSyncState = 'idle';
  let lastError: GitErrorInfo | null = null;
  let cache: { readonly at: number; readonly value: GitStatus } | null = null;
  let closed = false;

  const publish = (event: string, data: unknown): void => {
    options.publisher?.publish(event, data);
  };

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const status = async (statusOptions: { readonly force?: boolean } = {}): Promise<GitStatus> => {
    const fresh = statusOptions.force === true;
    if (!fresh && cache !== null && Date.now() - cache.at < statusCacheMs) return cache.value;

    const value = await readGitStatus(root, { syncState, error: lastError });
    cache = { at: Date.now(), value };
    return value;
  };

  const publishStatus = async (): Promise<GitStatus> => {
    const value = await status({ force: true });
    publish('git.changed', { status: value });
    return value;
  };

  const commitPending = async (): Promise<void> => {
    if (pending.size === 0) return;

    const targets = pending;
    pending = new Map();
    const paths = [...targets.keys()];

    let commitOnSave = true;
    try {
      commitOnSave = (await readConfig(root)).git.commit_on_save;
    } catch {
      // A broken config must not lose the save; fall back to the default.
      commitOnSave = true;
    }

    if (!commitOnSave) {
      // Manual mode: the badge must turn amber, nothing is committed.
      await publishStatus();
      return;
    }

    const repo = await inspectRepo(root);
    if (!repo.initialized || repo.outsideWorkspace) {
      // docs/09: a missing repo never fails a save.
      await publishStatus();
      return;
    }

    // A record created and deleted inside one debounce window has no path left
    // to stage; `git add -- <missing untracked path>` would error.
    const tracked = await runGit(['ls-files', '--', ...paths], { cwd: root });
    const trackedPaths =
      tracked.code === 0
        ? new Set(tracked.stdout.split('\n').filter((line) => line !== ''))
        : new Set<string>();

    const stageable: string[] = [];
    for (const path of paths) {
      if (trackedPaths.has(path)) {
        stageable.push(path);
        continue;
      }
      try {
        await access(join(root, path));
        stageable.push(path);
      } catch {
        // Never existed on disk (or gone) and not tracked: nothing to stage.
      }
    }

    if (stageable.length === 0) {
      await publishStatus();
      return;
    }

    const add = await runGit(['add', '-A', '--', ...stageable], { cwd: root });
    if (add.code !== 0) {
      lastError = classifyFailure('add', add, []);
      await publishStatus();
      return;
    }

    if (!(await hasStagedChanges(root))) {
      await publishStatus();
      return;
    }

    const stageableLabels = [...new Set(stageable.map((path) => targets.get(path) ?? 'record'))];
    const message =
      stageableLabels.length === 1
        ? `ob: save ${stageableLabels[0] ?? ''}`.trim()
        : `ob: save ${stageable.length} files`;
    const commit = await runGit(['commit', '-m', message], { cwd: root });
    lastError = commit.code === 0 ? null : classifyFailure('commit', commit, []);
    await publishStatus();
  };

  const scheduleCommit = (target: CommitTarget): void => {
    if (closed) return;

    pending.set(target.path, target.label);

    if (debounceMs <= 0) {
      void enqueue(commitPending).catch(() => undefined);
      return;
    }

    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void enqueue(commitPending).catch(() => undefined);
    }, debounceMs);
    timer.unref?.();
  };

  const flush = async (): Promise<void> => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending.size > 0) {
      await enqueue(commitPending).catch(() => undefined);
    }
    await queue;
  };

  const sync = async (): Promise<GitSyncReport> => {
    const outcome = await enqueue(async () => {
      syncState = 'running';
      lastError = null;
      await publishStatus();

      try {
        const result = await runSync({
          root,
          allowParentRepo,
          onStep: (step) => publish('git.step', step),
        });
        syncState = result.ok ? 'idle' : 'error';
        lastError = result.error;
        const finalStatus = await status({ force: true });
        publish('git.settled', { ok: result.ok, error: result.error, status: finalStatus });
        publish('git.changed', { status: finalStatus });
        return {
          ok: result.ok,
          steps: result.steps,
          status: finalStatus,
          error: result.error,
        };
      } catch (error) {
        syncState = 'error';
        lastError = toErrorInfo(error);
        const finalStatus = await status({ force: true });
        publish('git.settled', { ok: false, error: lastError, status: finalStatus });
        publish('git.changed', { status: finalStatus });
        return { ok: false, steps: [], status: finalStatus, error: lastError };
      }
    });

    return outcome;
  };

  const recover = async (action: GitRecoveryAction): Promise<GitRecoveryReport> =>
    enqueue(async () => {
      const result =
        action === 'abort-sync'
          ? await runGit(['rebase', '--abort'], { cwd: root })
          : await runGit(['push', '-u', 'origin', 'HEAD'], { cwd: root });

      const error: GitErrorInfo | null =
        result.code === 0
          ? null
          : action === 'abort-sync'
            ? {
                code: 'git_failed',
                message:
                  'Could not abort the rebase. Check `git status`; you may need to resolve it in a terminal.',
                output: combinedOutput(result),
              }
            : classifyFailure('push', result, []);

      lastError = error;
      syncState = error === null ? 'idle' : 'error';
      const finalStatus = await publishStatus();
      return {
        ok: error === null,
        action,
        output: combinedOutput(result),
        status: finalStatus,
        error,
      };
    });

  const init = async (): Promise<GitInitReport> =>
    enqueue(async () => {
      const repo = await inspectRepo(root);

      if (repo.initialized && !repo.outsideWorkspace) {
        const head = await runGit(['rev-parse', '--verify', 'HEAD'], { cwd: root });
        if (head.code === 0) {
          const current = await publishStatus();
          return { ok: true, initialized: true, warning: null, status: current, error: null };
        }
        // A previous init created the repo but failed before the initial commit.
      }

      if (repo.initialized && repo.outsideWorkspace) {
        const error: GitErrorInfo = {
          code: 'repo_outside_workspace',
          message:
            'This workspace is inside a different repository. Move it out before initializing a nested repo.',
        };
        lastError = error;
        syncState = 'error';
        return {
          ok: false,
          initialized: false,
          warning: null,
          status: await publishStatus(),
          error,
        };
      }

      try {
        const result = await initializeRepository(root);
        lastError = null;
        syncState = 'idle';
        return {
          ok: true,
          initialized: true,
          warning: result.warning,
          status: await publishStatus(),
          error: null,
        };
      } catch (error) {
        const info = toErrorInfo(error);
        lastError = info;
        syncState = 'error';
        return {
          ok: false,
          initialized: false,
          warning: null,
          status: await publishStatus(),
          error: info,
        };
      }
    });

  const setRemote = async (input: {
    readonly url: string;
    readonly push: boolean;
  }): Promise<GitRemoteReport> =>
    enqueue(async () => {
      const url = input.url.trim();
      if (url === '' || /\s/.test(url)) {
        return {
          ok: false,
          status: await publishStatus(),
          error: {
            code: 'git_failed',
            message: 'Enter a git remote URL without spaces, e.g. git@github.com:you/crm.git',
          },
        };
      }

      try {
        await setRemoteUrl(root, url);
      } catch (error) {
        const info = toErrorInfo(error);
        lastError = info;
        syncState = 'error';
        return { ok: false, status: await publishStatus(), error: info };
      }

      if (input.push) {
        const result = await runGit(['push', '-u', 'origin', 'HEAD'], { cwd: root });
        if (result.code !== 0) {
          const reusable = /src refspec HEAD does not match any|needed a single revision/i.test(
            `${result.stdout}\n${result.stderr}`,
          );
          const error: GitErrorInfo = reusable
            ? {
                code: 'git_failed',
                message: 'The repository has no commits yet. Initialize git, then sync again.',
                output: combinedOutput(result),
              }
            : (classifyFailure('push', result, []) ?? {
                code: 'git_failed',
                message: 'Push failed.',
                output: combinedOutput(result),
              });
          lastError = error;
          syncState = 'error';
          return { ok: false, status: await publishStatus(), error };
        }
      }

      lastError = null;
      syncState = 'idle';
      return { ok: true, status: await publishStatus(), error: null };
    });

  const close = async (): Promise<void> => {
    closed = true;
    await flush();
  };

  return { status, scheduleCommit, flush, sync, recover, init, setRemote, close };
};
