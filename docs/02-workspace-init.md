# 02 — Workspace Initialization, Lock & Port

Milestone: **M1** · Spec: `brief.md` §3.2, §5 · Code: `src/workspace/`

## Purpose

Create or adopt a workspace, seed demo data when asked, and guarantee exactly one server owns the files.

## Detection

A workspace is initialized iff `.ob/config.json` exists and parses against the config schema.

* Directory missing → create it (interactive start only).
* `.ob/` exists but config is invalid → **do not overwrite**. Report the parse error and exit `1` with the file path. The user fixes or deletes it.
* Initialized but folders missing (e.g. user deleted `contacts/`) → recreate the missing directories on start, log a warning, seed nothing.

## Init wizard

```
 Welcome to OperationBegin (ob) — Local-First CRM

 Workspace path: /Users/dev/my-crm
 Git: detected (branch: main)
 No initialized workspace found. Select setup option:
   ❯ 1) Initialize with Demo Workspace (Recommended - populated sample data)
     2) Initialize Empty Workspace (Folders & default configuration only)
     3) Exit
```

* Implemented with raw `stdin` keypress handling — no heavy prompt dependency.
* Non-TTY → numbered input; no stdin → exit `1` (see doc 01).
* Choosing `3` exits `0` and creates nothing.

## What each option creates

| Path | Demo | Empty |
|---|---|---|
| `.ob/config.json` | ✓ | ✓ |
| `.ob/state/` | ✓ | ✓ |
| `.gitignore` | ✓ | ✓ |
| `contacts/`, `projects/`, `tasks/{todo,doing,done}/`, `estimates/`, `invoices/`, `documents/` | ✓ | ✓ (empty) |
| Demo records | 2 contacts, 2 projects, 5 tasks, 1 estimate, 3 invoices, 2 documents + `.ob/config.json` | — |
| `git init` (+ initial commit) | ✓ unless `--no-git` | ✓ unless `--no-git` |

Rules:

* Existing non-empty directories are never wiped. Files are only added; if the same path already holds *identical* content it is skipped, and if it holds different content the new file gets a `-2` suffix. Re-running init therefore never duplicates or overwrites a record.
* **Demo data is files, not code.** The canonical workspace lives at `fixtures/workspaces/demo/` (15 records + `.ob/config.json`), is copied to `dist/demo/` at build time, and is shipped inside the package. `ob init --demo` copies that tree verbatim, so the preview, the package and the tests cannot drift. `.ob/config.json` from the fixture is treated as user-owned once it exists — it is never suffixed or overwritten.
* Demo data uses **fixed** ULIDs and timestamps so integration tests are deterministic.
* Demo contacts/projects/estimates/invoices are cross-linked by real `id`s, and the invoice line items exercise `tax_rate_bps` (850) so the UI has a correct example on first launch. One invoice is `paid` and one is `sent` past its due date, so the dashboard's revenue and outstanding cards have real numbers on first launch.
* `git init` produces an initial commit `ob: initialize workspace` so the first save has a parent and `git status` starts clean.

## Generated files

`.gitignore` (only if absent; never clobbered):

```gitignore
.ob/state/
.DS_Store
```

`.ob/state/` contents:

| File | Contents | Mode |
|---|---|---|
| `session.json` | `{ "token": "<64 hex>", "port": 19731, "pid": 1234, "started_at": "…" }` | `0600` |
| `server.lock` | `{ "pid": 1234, "port": 19731, "started_at": "…" }` | `0600`, deleted on clean exit |

`session.json` is rewritten on every start; a stale file is harmless because the lock is authoritative.

## Lock

1. Read `server.lock`. If absent → write ours.
2. If present and `process.kill(pid, 0)` succeeds → exit `1` with "Workspace is already in use by PID N on :port".
3. If present and the PID is dead → log `Stale lock from PID N reclaimed` and take over.
4. Always delete the lock in the shutdown path *and* in the `uncaughtException` handler.

Windows note: `process.kill(pid, 0)` is unreliable for liveness; fall back to a `net.connect` probe on the recorded port, and if that fails, reclaim.

## Port binding

```
candidates = [preferred, preferred+1 … preferred+50]
bind 127.0.0.1:candidate → first success wins
```

* `preferred` = `--port` ?? `config.server.port` ?? `19731`.
* Exhausted range → exit `1` with the tried range.
* Effective port + token are written to `.ob/state/session.json` and printed:
  `→ http://127.0.0.1:19731`
* The UI never hardcodes a port; it reads `window.location.origin`.

## Acceptance criteria

- [x] Demo init produces a workspace whose records are complete and cross-linked (15 files, valid ULIDs, invoice totals in cents).
- [x] Empty init produces only folders, config, `.gitignore`.
- [x] `git status --porcelain` is clean immediately after init.
- [x] Running init twice with option 1 does not duplicate or overwrite records.
- [x] Two servers on one workspace: second exits with the PID message, first is unaffected.
- [x] Killing with `SIGKILL` leaves a stale lock; the next start reclaims it with a log line.
- [ ] Dashboard renders the seeded data *(M4 — M1 verifies file state only)*
