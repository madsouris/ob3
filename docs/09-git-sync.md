# 09 — Git Sync

Milestone: **M6** · Spec: `brief.md` §8 · Code: `src/git/`

## Purpose

Give the user durability and multi-device sync without ever losing an edit, without lying about state, and without auto-resolving a conflict it cannot understand.

## Subprocess rules

```ts
runGit(args: string[], opts?: { timeoutMs?: number }): Promise<GitResult>
```

* `spawn('git', args, { cwd: workspaceRoot, shell: false })` — argv arrays only, no interpolation, no shell.
* `GIT_TERMINAL_PROMPT=0` (never block on credentials), `GIT_EDITOR=true`, `GIT_PAGER=cat`, `LC_ALL=C` (parseable output).
* Default timeout 10 s; on timeout kill the process group and return `timedOut: true` with captured output.
* Never store or log credentials; never pass `-c credential.*` overrides.

## Commit-on-save

Enabled by default (`config.git.commit_on_save`, default `true`).

```
save(record):
  write file (doc 06)
  scheduleCommit(paths)      // debounce 1200 ms, coalesced per record id
```

```
commit(paths):
  if !repo -> skip (report 'git_not_initialized' in status, do not error the save)
  git add -- <paths...>
  if nothing staged -> done
  git commit -m "ob: save <type> <id>"
```

Properties:

* **Path-scoped.** Only paths `ob` just wrote are added. A user's unrelated edits to `README.md` stay unstaged and visible in `git status`.
* **Coalesced.** 10 rapid edits to one record → 1 commit.
* **Sequenced.** Commits are serialized through one queue so two saves cannot race the index lock.
* **Failure-isolated.** A failed auto-commit (e.g. pre-commit hook rejection) marks the status `error` with the hook output; the file is still saved. User can fix and hit Sync.
* **Opt-out.** `commit_on_save: false` restores pure manual sync; the badge then reports `dirty` after every save.

## Manual sync (the only push path)

```
POST /api/git/sync   (or `ob sync`)
 1. git add -A
 2. git commit -m "ob auto-sync: YYYY-MM-DD HH:mm:ss"     (skipped if nothing staged)
 3. git pull --rebase
 4. git push
```

* Order is normative: a rebase requires a clean tree, so commit must precede pull.
* Version probe: `git --version` < 2.39 → step 4 runs `git push` without `--porcelain` optimizations and logs a warning (functionality unaffected).
* No upstream: step 3 fails with "There is no tracking information" → surfaced with a one-click fix that runs `git push -u origin HEAD`, then re-runs steps 3–4.
* Every step's combined stdout+stderr is kept (last 4 KB) for the UI.

### Failure matrix

| Failure | Detection | UI affordance |
|---|---|---|
| Not a repo | `rev-parse --is-inside-work-tree` | "Initialize Git" → `POST /api/git/init` |
| No upstream | exit ≠ 0 + `no tracking information` | "Set upstream & push" |
| Rebase conflict | exit ≠ 0 + `CONFLICT` / `.git/rebase-merge` exists | List conflict paths, "Abort sync" (`git rebase --abort`), "Open folder" |
| Non-fast-forward | `rejected` + `non-fast-forward` | "Pull then push" retry |
| Detached HEAD | `symbolic-ref -q HEAD` fails | "Create branch `<name>`" (user supplies) |
| Auth/network | `Authentication failed` / `Could not resolve host` | Raw message, no retry storm |
| Hook rejected | `commit` exit ≠ 0, no conflict | Show hook output verbatim |
| Timeout | 10 s elapsed | "Network too slow — retry" (no partial state: kill before commit step completes) |

`ob` **never** runs `rebase --abort`, `reset`, `checkout --theirs`, or `push --force` on its own. Every mutating recovery is a user click.

## Status derivation

```ts
status = {
  initialized, branch, detached,
  dirty:    porcelain.length > 0,
  ahead, behind: rev-list --left-right --count @{u}...HEAD,
  unpushed: ahead > 0,
  remote:   git remote get-url origin (best effort),
  lastCommit: git log -1 --format=%h%x09%ar%x09%s,
  syncState: 'idle' | 'running' | 'error',
}
```

Polled every 15 s while the tab is focused, plus invalidated on every commit/sync and on watcher events that touch `.git`-visible paths (cheaply approximated by re-polling 1 s after any file write).

Badge semantics: `clean` (nothing) · `dirty` (amber) · `unpushed` (blue, with count) · `syncing` (spinner) · `error` (red, click for detail).

## `beforeunload`

Fires only when `dirty || unpushed`. Disabled during `syncing` (a sync in flight is intentional) and re-armed after settlement. This is the correct narrow guard given commit-on-save (ADR-02, ADR-13).

## Safety rails

* Refuse to sync when the workspace is not the repo root (`git rev-parse --show-toplevel` ≠ workspace) — prevents accidentally pushing a parent monorepo. Override with `--allow-parent-repo`.
* Warn (do not block) when the repo has > 200 changed files: a user may have pointed `ob` at a huge folder.
* Never `git add -A` outside the workspace root.
* `.ob/state/` must appear in `.gitignore`; if it does not, `ob` appends it (only when the file is absent or `ob` created it; otherwise it warns).

## CLI parity

`ob sync` prints the same step list to stdout and exits non-zero on failure, so it can run in cron/CI. `ob sync --dry-run` prints the commands without executing.

## Acceptance criteria

- [ ] Integration test with a local bare repo as `origin`: create → auto-commit → sync → `git log` on the bare repo shows both commits in order.
- [ ] `git status --porcelain` is empty after a save, but non-empty after an external edit to an unrelated file.
- [ ] Conflicting pull produces a recoverable state: after "Abort sync", `git status` is clean and the UI returns to `idle`.
- [ ] Killing the process mid-`pull --rebase` leaves a repo the user can recover with documented commands (printed in *Needs attention*).
- [ ] `commit_on_save: false` produces no commit on save and shows `dirty`.
