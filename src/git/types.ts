/** Shared git types. Deliberately free of Node imports so both layers can use them. */

export type GitSyncState = 'idle' | 'running' | 'error';

export type GitFailureCode =
  | 'not_a_repo'
  | 'repo_outside_workspace'
  | 'identity_missing'
  | 'no_upstream'
  | 'rebase_conflict'
  | 'non_fast_forward'
  | 'detached_head'
  | 'auth_failed'
  | 'hook_rejected'
  | 'commit_failed'
  | 'timeout'
  | 'git_failed';

export type GitRecoveryAction = 'abort-sync' | 'set-upstream';

export interface GitErrorInfo {
  readonly code: GitFailureCode;
  readonly message: string;
  /** Last 4 KB of combined stdout/stderr. Never credentials — git redacts them. */
  readonly output?: string;
}

export interface GitStatus {
  readonly initialized: boolean;
  /** The workspace lives inside a different repository (docs/09 §Safety rails). */
  readonly repoOutsideWorkspace: boolean;
  readonly branch: string;
  readonly detached: boolean;
  readonly dirty: boolean;
  readonly changedFiles: number;
  readonly ahead: number;
  readonly behind: number;
  readonly unpushed: boolean;
  readonly hasUpstream: boolean;
  readonly remote: string;
  readonly lastCommit: string;
  readonly conflict: boolean;
  readonly conflictPaths: readonly string[];
  readonly syncState: GitSyncState;
  readonly error: GitErrorInfo | null;
}

export type GitStepName = 'add' | 'commit' | 'pull' | 'push';

export interface GitStepResult {
  readonly name: GitStepName;
  readonly ok: boolean;
  readonly skipped?: boolean;
  readonly output: string;
}

export interface GitSyncReport {
  readonly ok: boolean;
  readonly steps: readonly GitStepResult[];
  readonly status: GitStatus;
  readonly error: GitErrorInfo | null;
}

export interface GitRecoveryReport {
  readonly ok: boolean;
  readonly action: GitRecoveryAction;
  readonly output: string;
  readonly status: GitStatus;
  readonly error: GitErrorInfo | null;
}

export interface GitInitReport {
  readonly ok: boolean;
  readonly initialized: boolean;
  readonly warning: string | null;
  readonly status: GitStatus;
  readonly error: GitErrorInfo | null;
}

export interface GitRemoteReport {
  readonly ok: boolean;
  readonly status: GitStatus;
  readonly error: GitErrorInfo | null;
}

export interface CommitTarget {
  /** Workspace-relative POSIX path. */
  readonly path: string;
  /** Human label used in the commit message, e.g. `contact cnt_…`. */
  readonly label: string;
}

/** Minimal publisher so `src/git/` does not import the server layer. */
export interface GitEventPublisher {
  publish(event: string, data: unknown): void;
}

export interface GitService {
  status(options?: { readonly force?: boolean }): Promise<GitStatus>;
  scheduleCommit(target: CommitTarget): void;
  /** Commits anything still inside the debounce window and waits for the queue. */
  flush(): Promise<void>;
  sync(): Promise<GitSyncReport>;
  recover(action: GitRecoveryAction): Promise<GitRecoveryReport>;
  init(): Promise<GitInitReport>;
  setRemote(input: { readonly url: string; readonly push: boolean }): Promise<GitRemoteReport>;
  close(): Promise<void>;
}
