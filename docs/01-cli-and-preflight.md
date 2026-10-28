# 01 — CLI, Flags & Pre-flight

Milestone: **M1** · Spec: `brief.md` §3.1, §10 · Code: `src/cli/`

## Purpose

Take the user from a terminal command to a running local server, refusing to start when the environment cannot support a safe run.

## Entry points

| Bin | Invocation | Behaviour |
|---|---|---|
| `ob` | `ob [path]` | Start (or initialize then start) a workspace |
| `ob` | `ob init [path]` | Initialize only, no server |
| `ob` | `ob sync [path]` | Run the sync chain headlessly, print git output |
| `ob` | `ob check [path]` | Pre-flight + workspace diagnostics, exit code only |
| `filecrm` | alias of `ob` | Same binary, different name |

`path` defaults to `process.cwd()`. Relative paths resolve against cwd; the result is canonicalized (`fs.realpath`) before anything else happens.

## Flags

| Flag | Applies to | Default | Meaning |
|---|---|---|---|
| `--port <n>` | start | `19731` | Preferred port; probes upward if busy |
| `--demo` | init / start | — | Seed demo workspace, skip wizard |
| `--empty` | init / start | — | Empty workspace, skip wizard |
| `--no-git` | init | off | Do not `git init` |
| `--no-open` | start | off | Do not open a browser (CI, remote) |
| `--verbose` | all | off | Log watcher decisions, git argv, timings |
| `--version`, `--help` | all | — | Print and exit 0 |

Unknown flags exit `2` with usage. Flags that conflict (`--demo --empty`) exit `2`.

## Pre-flight checks

Run in order; stop at the first hard failure.

| # | Check | Hard? | Failure output |
|---|---|---|---|
| 1 | Node major ≥ 20 | yes | Detected version + upgrade hint (`nvm install 20`) |
| 2 | Workspace path exists and is a directory | yes | Suggest the intended path |
| 3 | Path is writable (create/delete a probe file) | yes | `chmod` / ownership hint |
| 4 | `git --version` ≥ 2.39 | **warn** | Feature note (older git still works for basic sync) |
| 5 | `git config user.name` and `user.email` | yes | Exact `git config --global` commands |
| 6 | `gh --version` | no | `[!] gh not detected (optional)` |
| 7 | Existing `.ob/state/server.lock` PID alive | yes | "Already running at http://127.0.0.1:N — stop it or use a different workspace" |

Output is a single aligned block of `[✓] / [!] / [✗]` lines. Machine-readable form: `ob check --json`.

## Non-interactive / CI behaviour

* Not a TTY (`!process.stdin.isTTY`) and no `--demo`/`--empty` → exit `1` with "interactive setup required; pass --demo or --empty".
* `NO_COLOR` or `TERM=dumb` disables color; all Unicode markers degrade to ASCII (`[ok]`, `[!]`, `[x]`).
* `--no-open` never spawns a browser process.

## Process lifecycle

1. Parse args → 2. pre-flight → 3. canonicalize workspace → 4. acquire lock → 5. init if needed → 6. build index (full scan) → 7. start watcher → 8. bind server → 9. write `session.json` → 10. print URL → 11. optionally open browser.

Shutdown order on `SIGINT`/`SIGTERM` (and on uncaught error):

```
SSE clients notified (server.closing) → server.close() → watcher.close() → flush pending debounced commits (max 3s) → release lock → exit 0
```

Second `Ctrl+C` during shutdown exits immediately (`130`). A `SIGINT` before the server binds must still release the lock (register the handler *before* acquiring it).

## Logging

Stdout carries human status lines only. Diagnostics, git argv, and watcher chatter go to stderr under `--verbose`. Nothing is written to the workspace except `.ob/state/`.

## Acceptance criteria

- [ ] Fresh clone → `node dist/cli/index.js --help` exits 0 and lists all flags.
- [ ] Missing `git config user.email` prints one copy-pasteable command and exits non-zero; no server starts, no lock file remains.
- [ ] `--port 19731` with 19731 occupied prints the actual bound port and opens that URL.
- [ ] `Ctrl+C` at any phase leaves no `.ob/state/server.lock` and no listening socket.
- [ ] `ob check --json` is stable enough to assert in tests (versioned fields).
