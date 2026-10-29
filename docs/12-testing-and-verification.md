# 12 — Testing & Verification

Applies to all milestones · Code: `tests/`, `fixtures/`

## Strategy

Two things are genuinely hard here and deserve most of the test budget:

1. **File round-trip fidelity** — we must not damage user files.
2. **Behaviour under concurrent external edits** — the app must never break.

Everything else (CRUD, UI) gets standard coverage.

## Layers

| Layer | Tool | Scope | Speed target |
|---|---|---|---|
| Unit | vitest | cents math, slugify/ULID, frontmatter round-trip, path safety, ordering | < 2 s total |
| Integration (FS) | vitest + temp dirs | indexer, watcher, atomic write, issues, round-trip against real files | < 10 s |
| Integration (HTTP) | vitest + `app.request()` | routes, validation, token/host checks, 409 conflicts | < 10 s |
| Integration (Git) | vitest + bare repo fixture | commit-on-save, sync chain, conflict recovery | < 20 s |
| E2E-ish | Playwright (M4+) | one smoke flow: create contact → drag task → sync | < 60 s |
| Manual QA | checklist below | print rendering, OS file manager, Windows paths | per release |

## Fixtures (`fixtures/workspaces/`)

| Fixture | Purpose |
|---|---|
| `demo` | Same content the demo initializer writes (asserted equal) — canonical source at `fixtures/workspaces/demo/`, shipped as `dist/demo` |
| `external-edits` | Every row of the external-edit table: renamed file, moved task, body edit, reordered keys, duplicate id, missing id, invalid YAML, duplicate number, dangling ref, unresolved conflict markers, symlink, oversized file, CRLF file, file with BOM |

Empty and broken-config workspaces are created by test helpers (`tests/helpers/workspace.ts`); git repositories and bare origins are created per test by `tests/helpers/git.ts`. No git fixture is committed.

Fixtures are committed; the 10k one is generated (`pnpm fixture:large`). Nothing in `fixtures/` is user data — see [`fixtures/README.md`](../fixtures/README.md). `tests/repo/hygiene.test.ts` fails if a working workspace appears at the repo root.

## Non-negotiable test cases

**Round-trip (byte equality)**
- [ ] Read → write with no semantic change is byte-identical.
- [ ] Edit one key in a file with comments, unknown keys, quoted scalars, anchors, and CRLF → only that key's bytes change.
- [ ] Body containing `---`, code fences, and trailing whitespace is untouched.

**Cents math**
- [ ] `taxCents` / `totalCents` property tests (1000 random cases) with integer invariants.
- [ ] `parseMoney` handles `2500`, `2 500.5`, `$2,500.00`, `2500,00` (rejected, not guessed), empty, and `0`.
- [ ] Fractional quantity rounding is applied per line before summing.

**External edits**
- [ ] Every documented row has an assertion on: index state, emitted events, and "no file was written".
- [ ] Watcher event replay twice → identical index.
- [ ] `ob` writes are not echoed by the watcher.

**Security**
- [ ] Wrong `Host` → 403; wrong/missing token → 401; cross-origin preflight behaviour asserted.
- [ ] Path traversal through route params, JSON bodies, and `terms_document` → 400.
- [ ] Symlink inside `documents/` pointing outside → ignored.

**Concurrency**
- [ ] 10 parallel PATCHes to one record → consistent file, no lost fields, all `baseHash` conflicts handled.
- [ ] Save while the file is externally replaced → `409`, no data loss of the external edit.

**Git (M6)**
- [x] Commit-on-save creates exactly one commit for a burst of saves; an unrelated external edit stays unstaged.
- [x] A record created and deleted inside one debounce window commits nothing and leaves no error.
- [x] Full sync against a per-test bare origin reaches `clean + not unpushed`; the bare log holds the save and auto-sync commits.
- [x] Induced rebase conflict is surfaced with paths; `abort-sync` restores a clean tree.
- [x] No upstream → `no_upstream`; `set-upstream` pushes and clears `unpushed`.
- [x] A rejecting pre-commit hook keeps the file and reports `hook_rejected`; a later commit clears it.
- [x] Resolving a missing-id issue commits the rewritten file through the same scheduler.
- [x] Detached HEAD, a parent repository, and missing identity are refused before mutating.
- [x] `.ob/state/` never reaches the remote tree, even with a user `.gitignore` that omits it.
- [ ] Kill the process mid-`pull --rebase` and recover with documented commands (manual).

**CLI**
- [ ] Missing git identity → exit ≠ 0, actionable message, no lock left.
- [ ] Port collision → binds the next free port and prints it.
- [ ] `SIGINT` during init, during scan, and during an active sync all exit cleanly.
- [x] `ob sync --dry-run` prints the four commands without executing them.
- [x] `ob sync` against a local bare origin prints each step, exits 0, and releases the lock.

**Search (M5)**
- [x] `/api/search` finds a contact by company and honours `type` and `limit`.
- [x] Empty `q` returns no hits; a deleted record disappears from the next query (generation rebuild).
- [x] List `?q=` keeps hard filters and returns matches in search rank order.
- [ ] An external body edit makes a new word findable without manual refresh (watcher → generation → lazy rebuild).

## Test hygiene rules

* Every test that touches the FS uses `mkdtemp` and asserts on a cleaned-up directory.
* No test asserts on absolute paths, usernames, or timings that vary by machine (`>` thresholds only with generous margins).
* Deterministic ULIDs in fixtures; the ULID generator takes an injectable clock + randomness source.
* No network access in any test. Git tests use local bare repos only.
* A failing test must print the offending file diff (helper `expectFileBytes(path).toEqual(expected)`).

## Manual QA checklist (per release)

- [ ] macOS: Finder rename of an open record; Spaces; `fsevents` active.
- [ ] Windows: rename while the file is open in Notepad; blocked-write retry path.
- [ ] Linux: external `git checkout` of a different branch while the UI is open.
- [ ] NFS/SMB workspace with polling fallback.
- [ ] Invoice print output at A4 only (16 mm margins), printed from both light and dark mode; totals stay on page 1.
- [ ] Project board drag between the three columns, plus the "Move to…" keyboard path, each moves exactly one file.
- [ ] Git badge states (clean / uncommitted / N to push / syncing / error) against a real remote, and the `beforeunload` prompt appears only for dirty or unpushed work.
- [ ] `Shift+D` toggles the theme from the dashboard but types a capital D inside a text field; the date popover opens, selects, and clears in light and dark mode.
- [ ] Logo upload from a JPEG with EXIF: preview updates immediately, print shows the resized logo, `.ob/assets/logo.png` is committed, and no EXIF survives.
- [ ] Client-scoped document with `{{client.name}}` / `{{today}}`: detail and A4 print resolve them; an unknown `{{foo.bar}}` stays visible.
- [ ] Invoice with two attached documents prints both in order with client variables resolved, and a deleted attachment prints a missing-document note.
- [ ] Rebase conflict in the Git dialog: conflicted paths listed, Abort sync returns to `idle`.
- [ ] `npx` from five different cwds (no cwd assumptions).
- [ ] Kill -9 the server, restart, confirm index rebuild and no lock leak.

## Definition of done (per milestone)

1. All acceptance criteria in the milestone's doc are checked off.
2. New edge cases have tests, not just manual verification.
3. `pnpm typecheck && pnpm test && pnpm build` green.
4. The owning `docs/` file matches shipped behaviour.
5. `plan.md` checkboxes updated.
