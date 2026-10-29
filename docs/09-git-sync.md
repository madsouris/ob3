# 09 — Git Sync

Milestone: **M6** · Spec: `brief.md` §8 · Code: `src/git/`

> **Status:** shipped. Commit-on-save, manual sync, status derivation, recovery, the header badge and `ob sync` are implemented and covered by integration tests against a local bare repository. `gh repo create` remains deferred (M7).

## Purpose

Give the user durability and multi-device sync without ever losing an edit, without lying about state, and without auto-resolving a conflict it cannot understand.

## Modules

| File | Responsibility |
|---|---|
| `src/git/exec.ts` | `runGit(args, { cwd, timeoutMs })`; environment, output caps, timeout kill |
| `src/git/repo.ts` | repo detection, path comparison, `.gitignore`, staging, init, remote URL |
| `src/git/status.ts` | porcelain/ahead-behind parsers, failure classifier, `readGitStatus` |
| `src/git/sync.ts` | the four-step chain; never retries or forces |
| `src/git/service.ts` | queue, debounce scheduler, status cache, sync/recover/init/remote reports |

The service is created once per server (`src/cli/start.ts`) and passed to `createApp`. Tests inject their own with a deterministic debounce and call `flush()` explicitly.

## Subprocess rules

```ts
runGit(args: readonly string[], { cwd, timeoutMs = 10_000 }): Promise<GitResult>
```

* `spawn('git', argv, { shell: false })` — argv arrays only; a path or branch name cannot be interpreted as shell syntax.
* Environment: `GIT_TERMINAL_PROMPT=0`, `GIT_EDITOR=true`, `GIT_PAGER=cat`, `LC_ALL=C`. On non-Windows, `GIT_SSH_COMMAND='ssh -o BatchMode=yes'` is set **only** when the user has not configured their own; a prompt cannot block a save or a sync.
* 10 s timeout; the child runs in its own process group and the group is killed on timeout (`timedOut: true`).
* Output is capped at 256 KB; the UI receives the last 4 KB (`tailOutput`).
* Spawn failures resolve with `code: 127` — callers always get a result, never an unhandled rejection.

## Commit-on-save

Enabled by `git.commit_on_save` in `.ob/config.json` (default `true`).

```
save(record):
  write file (doc 06)
  scheduleCommit({ path, label })
```

* **Debounced 1200 ms**, coalesced by path. Ten edits to one record produce one commit; two records saved in the same window produce one commit.
* **Path-scoped.** Only paths `ob` wrote are passed to `git add -A -- <paths>`. A user's unrelated `README.md` edit stays unstaged and visible.
* **Missing paths are dropped.** A record created and deleted inside one window has no file and no index entry; it is skipped rather than failing `git add`.
* **Messages:** one target → `ob: save <type> <id>` (e.g. `ob: save contact cnt_…`); several → `ob: save N files`.
* **Deletes and moves** schedule the old and new paths, so one commit captures the rename/removal.
* **Config changes** schedule `.ob/config.json` under the same flag.
* **Issue resolutions** schedule the affected paths too: `assign-id` commits the rewritten file; `adopt-path` commits the rename (both paths). `ignore` only writes `.ob/state/` and commits nothing.
* **Failure-isolated.** A pre-commit hook (or a missing identity) marks the status `error` with the hook output; the file stays saved. The next successful commit clears the error.
* **Skipped, never an error:** no repository, or the workspace sits inside a parent repository. Saves always succeed.
* **Manual mode:** with `commit_on_save: false` nothing is committed; the badge reports `dirty` after every save.
* **Flush on shutdown:** `SIGINT`/`SIGTERM` commits anything still inside the debounce window before the server closes. The wait is capped at 3 s so a slow sync cannot hold shutdown hostage.

### Staging safety

`.ob/state/` (session token, lock) is never committed.

* If `.ob/state/server.lock` is ignored (the normal case), staging is `git add -A -- .`, which also covers root-level user files.
* If the user's `.gitignore` omits it, `git check-ignore` fails and staging is restricted to the managed roots plus `.ob/config.json` and `.gitignore`. `ensureGitignore` returns a warning instead of rewriting a user-authored file.

## Manual sync (the only push path)

```
POST /api/git/sync   (or `ob sync`)
 1. git add -A                       (staging safety above)
 2. git commit -m "ob auto-sync: YYYY-MM-DD HH:mm:ss"   (skipped if nothing staged)
 3. git pull --rebase
 4. git push
```

* Order is normative: a rebase requires a clean tree, so commit precedes pull (AD-01).
* Commits and syncs share one promise queue. A save during a slow push waits; two syncs cannot interleave.
* `POST /api/git/sync` awaits the chain and returns `{ ok, steps, status, error }`. Each step is also published as `git.step` over SSE, so the dialog updates live. A failed sync is still HTTP 200 — the failure is data (AD-18).
* Each step's combined output is kept (tail) for the UI.
* `ob` never runs `reset`, `push --force`, `checkout --theirs`, or `rebase --abort` on its own. Abort and set-upstream are explicit user actions.

### Failure matrix

| Code | Detection | UI affordance |
|---|---|---|
| `not_a_repo` | `rev-parse --is-inside-work-tree` fails | "Initialize git" |
| `repo_outside_workspace` | `--show-toplevel` ≠ workspace (canonical paths) | Explains the parent repo; CLI override |
| `detached_head` | `symbolic-ref -q HEAD` fails | Tells the user to check out a branch |
| `no_upstream` | `no tracking information` / `set-upstream` | "Set upstream & push" |
| `rebase_conflict` | `CONFLICT`, `could not apply`, or porcelain `UU`/`AA`/… | Conflicted paths + "Abort sync" |
| `non_fast_forward` | `[rejected]` / `non-fast-forward` | "Pull, then push" retry |
| `auth_failed` | `Authentication failed`, `could not read Username`, `publickey`, host resolution | Raw message; no retry storm |
| `hook_rejected` | `commit` exit ≠ 0 without an identity error | Hook output verbatim |
| `commit_failed` | identity missing / empty ident | Actionable identity message |
| `identity_missing` | init without `user.name` / `user.email` | Prints the two config commands |
| `timeout` | 10 s elapsed | "Check the network, then retry" |
| `git_failed` | anything else | Raw output |

## Recovery

`POST /api/git/recover` accepts exactly two actions:

| Action | Command | Use |
|---|---|---|
| `abort-sync` | `git rebase --abort` | Leave the conflicted pull and return to a clean tree |
| `set-upstream` | `git push -u origin HEAD` | First push for a branch with no upstream |

Anything else is a validation error. `ob` still has no force-push/reset path.

## Status derivation

```ts
git status -> {
  initialized, repoOutsideWorkspace, branch, detached,
  dirty, changedFiles, ahead, behind, unpushed, hasUpstream,
  remote, lastCommit, conflict, conflictPaths,
  syncState: 'idle' | 'running' | 'error',
  error: { code, message, output? } | null
}
```

* `dirty` = `git status --porcelain` is non-empty; `conflictPaths` comes from conflict status codes.
* `ahead`/`behind` = `rev-list --left-right --count @{u}...HEAD`; no upstream ⇒ `hasUpstream: false`, counts 0.
* `lastCommit` = `%h · %ar · %s`; `remote` = `origin` URL (best effort, never logged).
* `conflict` is also true when `.git/rebase-merge` or `.git/rebase-apply` exists, so a page reload during a conflict still shows recovery.
* Status is cached for 500 ms server-side. The UI polls every 15 s while the tab is visible, refreshes on focus, applies `git.changed` immediately, and re-polls 1 s after any record event (external edits do not touch the git service).
* `repoOutsideWorkspace` is reported instead of the absolute repo path — the API never leaks paths outside the workspace.

Badge semantics (header): `clean` (branch name) · `dirty` (accent, "Uncommitted") · `unpushed` ("N to push") · `syncing` (spinner) · `error` (red dot). Clicking opens the Git dialog: status rows, step log, error output, conflict paths, remote form, Sync/Initialize/Abort/Set-upstream.

## `beforeunload`

Registered only when `dirty || unpushed` and `syncState !== 'running'`. With commit-on-save the tree is normally clean, so the prompt means something real: uncommitted external edits, a failed commit, or commits not yet pushed.

## Safety rails

* Refuse to sync when `git rev-parse --show-toplevel` is not the workspace (canonical-path comparison, so macOS `/var` ↔ `/private/var` is handled). `POST /api/git/init` refuses to create a nested repo in that state.
* CLI override: `ob sync --allow-parent-repo`. Server override: `OB_ALLOW_PARENT_REPO=1`.
* `git add -A` never runs outside the workspace root.
* `.ob/state/` is never staged (see §Staging safety).
* A user-authored `.gitignore` is never rewritten; `POST /api/git/init` returns the warning instead.
* No credentials are stored, logged, or passed via `-c`.

## CLI parity

```
ob sync [path] [--dry-run] [--allow-parent-repo] [--verbose]
```

* Pre-flight (node, workspace, git, identity) runs first; `--dry-run` skips it.
* Acquires the workspace lock, so it cannot race a running server.
* Prints `git add -A`, `git commit`, `git pull --rebase`, `git push` as they happen, with output on failure.
* Exit codes: `0` success, `1` failure (including a busy workspace).

## Acceptance criteria

- [x] Integration test with a local bare repo as `origin`: save → sync → the bare log shows the save commit and the sync commit; status ends clean and not unpushed.
- [x] `git status --porcelain` is empty after a save, and an external edit to an unrelated file stays unstaged.
- [x] A conflicting pull produces a recoverable state: `abort-sync` restores a clean tree; the conflict is surfaced with paths.
- [x] `commit_on_save: false` produces no commit on save and reports `dirty`.
- [x] A rejecting pre-commit hook keeps the file, reports `hook_rejected`, and clears after a successful commit.
- [x] `.ob/state/` never reaches the remote, even when `.gitignore` omits it.
- [ ] Killing the process mid-`pull --rebase` is verified manually; the code never aborts or resets, so recovery remains the user's `git` commands.
