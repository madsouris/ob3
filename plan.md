# `ob` — Implementation Plan

Tracking document. Source of truth for *what* is being built is [`brief.md`](./brief.md); per-feature detail is in [`docs/`](./docs/README.md). This file tracks *order, scope, and status*.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Current state

| Item | Status |
|---|---|
| Spec (brief v1.1.0) | `[x]` |
| Architecture decisions | `[x]` — [`docs/00-decisions.md`](./docs/00-decisions.md) |
| Feature documentation | `[x]` — [`docs/`](./docs/README.md) |
| Source code | `[~]` — M0 scaffolding + M1 CLI/workspace landed; M2 next |

**Next action:** milestone M2 (data layer: schemas, frontmatter round-trip, index, watcher).

---

## Milestone M0 — Repo & Tooling

Goal: a TypeScript project that builds, tests, and lints from a clean clone.

- [x] `package.json` — ESM (`"type": "module"`), `engines.node >= 20`, `bin: { ob, filecrm } → dist/cli/index.js`, `files: [dist, docs, README.md, LICENSE]`
- [x] `tsconfig.json` — `strict`, `module: NodeNext`, `target: ES2022`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`
- [x] Build pipeline: `tsc` for server/CLI (`rootDir: src`, `outDir: dist`) + Vite build (`vite-plugin-singlefile`) for the SPA, then `scripts/postbuild.mjs` adds the shebang, `chmod 755`, and fails on a non-self-contained bundle or a `js-yaml` import
- [x] Tooling: `tsx` (dev), `vitest` (`vitest.config.ts` at root, tests in `tests/`), ESLint (flat config + `js-yaml` ban) + Prettier, pnpm 12 pinned via `packageManager`, `pnpm typecheck / build / test / lint`
- [x] CI workflow (`.github/workflows/ci.yml`): typecheck + lint + test + build on `ubuntu-latest`, `macos-latest`, `windows-latest` × Node 20/22, plus a CLI smoke test
- [x] `.gitignore`, `README.md` skeleton, `LICENSE` already present

**Exit criteria:** `pnpm build && pnpm typecheck && pnpm test` pass on a clean clone; `node dist/cli/index.js --help` prints usage. — **met** (23 tests at the time, 225 KB single-file UI, tarball = 22 files / 103 kB).

Docs: [`docs/11-packaging.md`](./docs/11-packaging.md), [`docs/12-testing-and-verification.md`](./docs/12-testing-and-verification.md)

---

## Milestone M1 — CLI, Pre-flight & Workspace Init

Goal: `ob .` takes an empty folder to a running server.

- [x] Arg parsing: `ob [path]`, `init|sync|check` subcommands, `--port`, `--demo`, `--empty`, `--no-git`, `--no-open`, `--verbose`, `--json`, `--version`, `--help` (`src/cli/args.ts`)
- [x] Pre-flight: node ≥ 20, workspace path + writability, `git --version` (2.39 warns only), `git config user.name/email`, optional `gh`, `--json` output (`src/cli/preflight.ts`)
- [x] Init wizard: arrow-key selector on a TTY, numbered prompt when stdout is redirected, `1/2/3` and `demo/empty/exit` both accepted (`src/cli/wizard.ts`)
- [x] Scaffolding: managed folders, `.ob/config.json` (Zod-validated), `.gitignore`, optional `git init` + initial commit with cwd pinned to the workspace (`src/workspace/init.ts`)
- [x] Demo seed data: sourced from `fixtures/workspaces/demo/` (13 records + config), copied to `dist/demo` at build; idempotent (identical files skipped, differing files preserved and suffixed)
- [x] Workspace lock: `.ob/state/server.lock`, live-PID refusal, stale reclaim, corrupt-file tolerance (`src/workspace/lock.ts`)
- [x] Port binding: `19731` preference, probe +50, explicit EPERM/EACCES message, effective port in `.ob/state/session.json` (`src/workspace/port.ts`)
- [x] Atomic writes for config/state/seeds (`src/io/atomic.ts`) — reused by M2
- [x] Minimal server: `/api/health`, single-file UI at `/`, SPA fallback, JSON 404 for `/api/*` (`src/server/app.ts`)
- [x] Browser open (per-platform) + `--no-open`
- [x] Lifecycle: pre-flight → lock → init → config → port → server → session; `SIGINT`/`SIGTERM` close the server, release the lock and exit 0

**Exit criteria (met, with one scope caveat):** `ob init --demo` on an empty folder produces the full workspace and a clean `git status`; a second run changes nothing; `ob check --json` is machine-readable; the server serves the UI shell at the printed URL. The populated *dashboard* is M4 — M1 verifies file state and the HTTP shell. Port/browser paths are unit-tested and auto-skip in sandboxes that forbid `listen(2)`.

**Tests:** 74 passing (args, wizard, pre-flight, config, lock, init, server); 4 port tests skip when binding is forbidden.

Docs: [`docs/01-cli-and-preflight.md`](./docs/01-cli-and-preflight.md), [`docs/02-workspace-init.md`](./docs/02-workspace-init.md)

---

## Milestone M2 — Data Layer

Goal: files ↔ typed records, correct under concurrent external editing.

- [ ] Zod schemas for `contact`, `project`, `task`, `estimate`, `invoice`, `document` + `config.json`
- [ ] Money helpers: `cents` integer math, `round_half_up`, `formatCents`, `parseMoney` — unit-tested against edge cases
- [ ] ULID + slug generator; `ensureId` (explicit "Assign ID" action only)
- [ ] Frontmatter round-trip service using `yaml` Document API: preserve comments/order/unknown keys, body byte-identical, newline-style preserving
- [ ] Atomic write: temp-in-same-dir + `rename`; echo-suppression registry
- [ ] Indexer: full scan, id-keyed map, path cache, soft-ref resolution, orphan/duplicate/unidentified detection
- [ ] Watcher: chokidar on `contacts|projects|tasks|estimates|invoices|documents`, `awaitWriteFinish`, ~150 ms coalescing, parse retry ×2 over 500 ms, own-write suppression
- [ ] Issue model + registry (`parse-error`, `duplicate-id`, `missing-id`, `orphan-task-path`, `dangling-ref`, `schema-invalid`, `unreadable`)
- [ ] Task folder ↔ status mapping helper (`tasks/<status>/`)
- [ ] Test fixtures: `fixtures/workspaces/{demo,empty,broken,external-edits}`

**Exit criteria:** opening the workspace in an external editor and renaming/reordering/moving files never crashes the process, never silently rewrites a file, and always converges the index; `vitest` covers every row of the external-edit table in `brief.md` §6.

Docs: [`docs/03-data-model.md`](./docs/03-data-model.md), [`docs/04-frontmatter-roundtrip.md`](./docs/04-frontmatter-roundtrip.md), [`docs/05-indexer-and-external-edits.md`](./docs/05-indexer-and-external-edits.md), [`docs/06-file-watcher-and-io.md`](./docs/06-file-watcher-and-io.md)

---

## Milestone M3 — HTTP API & Security

Goal: a complete, safe, self-describing API for the SPA.

- [ ] Middleware: loopback bind, `Host` allowlist, `Origin`/`Sec-Fetch-Site` validation, `X-OB-Token`, body limit, workspace-confined path resolution
- [ ] `GET /api/health`, `GET /api/config`, `PATCH /api/config`
- [ ] Generic record routes per type: list, get, create, patch, delete, `POST /api/tasks/:id/move`, `POST /api/invoices/:id/from-estimate/:estimateId`
- [ ] `GET /api/issues`, `POST /api/issues/:key/resolve` (explicit actions: assign-id, adopt-path, ignore)
- [ ] `GET /api/events` SSE: `snapshot`, `record.upsert`, `record.delete`, `issues.changed`, `git.changed`
- [ ] `GET /api/git/status`, `POST /api/git/sync`, `POST /api/git/init`, `POST /api/git/remote`
- [ ] Error envelope: `{ error: { code, message, details? } }` with stable codes; never leak stack traces to the client
- [ ] Consistent validation → 422 with per-field issues

**Exit criteria:** every mutation is reachable from the UI without a second round-trip; a request from a non-allowed `Origin` or with a wrong/missing token is rejected; path traversal attempts (`../`, absolute, symlink) return 400; SSE reconnects cleanly.

Docs: [`docs/07-server-api-and-security.md`](./docs/07-server-api-and-security.md), [`docs/10-search.md`](./docs/10-search.md)

---

## Milestone M4 — UI Shell & CRUD

Goal: a usable CRM for contacts, projects, and documents.

- [ ] Vite + React + Tailwind + shadcn/ui baseline, single-file build verified (`dist/index.html` self-contained)
- [ ] App shell: sidebar nav, header (workspace name, sync badge, port), command palette (`⌘K`)
- [ ] Data client: typed fetch wrapper, token injection, SSE subscription with backoff, index reconciliation
- [ ] Contacts: list + filter + search, detail/edit form, notes editor (markdown)
- [ ] Projects: list, detail with linked client and tasks, status controls
- [ ] Documents: list, markdown editor with preview
- [ ] Settings: business profile, currency, `tax_rate_bps`, default terms document
- [ ] "File changed on disk" banner + reload/overwrite chooser
- [ ] Empty states, loading skeletons, optimistic-with-rollback saves, a11y pass (focus rings, labels, keyboard)

**Exit criteria:** create/edit/delete a contact end-to-end; changes appear from a terminal edit within ~300 ms; no console errors; Lighthouse a11y ≥ 95 on main views.

Docs: [`docs/08-web-ui.md`](./docs/08-web-ui.md)

---

## Milestone M5 — Kanban & Money

Goal: tasks as a filesystem board; estimates and invoices that are arithmetically correct.

- [ ] Kanban board: 3 columns derived from folders, drag-and-drop → single `move` API call, `order` re-normalization (sparse integers, rebalanced on collision)
- [ ] Keyboard-accessible card moves (no drag required)
- [ ] Task detail: title, project link, due date, checklist rendered from body
- [ ] Estimate/invoice editor: line items, live cents math, validation (`subtotal == Σ line totals`), currency from config, `tax_rate_bps` default
- [ ] Number generation: `INV-YYYY-NNN` / `EST-YYYY-NNN` derived from existing files, gap-tolerant
- [ ] Estimate → invoice conversion (new id, `estimate_id` backlink, `converted_invoice_id` forward link)
- [ ] Print/PDF-ready stylesheet for invoices and estimates (no server-side PDF dependency; browser print)
- [ ] Overdue derivation from `due_date` + `status` (display-only; never rewrites the file)

**Exit criteria:** dragging a card moves exactly one file and produces one commit; a 3-line invoice with 8.5% tax renders `21250` tax and `271250` total; print view fits one page at A4/Letter.

Docs: [`docs/03-data-model.md`](./docs/03-data-model.md) §Money, [`docs/08-web-ui.md`](./docs/08-web-ui.md) §Kanban

---

## Milestone M6 — Git Sync & Issue Triage

Goal: sync that never loses work and never lies about state.

- [ ] `git` subprocess wrapper: no shell interpolation, argv arrays, 10 s timeout, captured stdout/stderr, `GIT_TERMINAL_PROMPT=0`
- [ ] Commit-on-save: path-scoped `add -- <paths>` + `commit`, 1200 ms debounce, coalesced per record
- [ ] `ob sync` / Sync button: `add -A` → `commit` → `pull --rebase` → `push`, step-by-step progress
- [ ] Failure states with recovery actions: no upstream, rebase conflict (+ abort), non-fast-forward, detached HEAD, auth failure
- [ ] Sync badge: `clean | dirty | unpushed | syncing | error` from real git output
- [ ] `beforeunload` guard when `dirty || unpushed`; disabled while syncing
- [ ] "Needs attention" view: issue list, file peek (read-only), resolve actions
- [ ] `POST /api/git/init` and remote configuration flow (optional `gh repo create` when `gh` exists)

**Exit criteria:** integration test against a local bare repo proves commit-on-save, clean sync, and conflict surfacing; killing the process mid-sync leaves a recoverable repo (verified by `git status`).

Docs: [`docs/09-git-sync.md`](./docs/09-git-sync.md)

---

## Milestone M7 — Packaging & Release

- [ ] `npx` smoke test from a packed tarball (`pnpm pack` → install in a temp dir) on macOS/Linux/Windows
- [ ] Verify zero native compilation (force `chokidar` fallback via `CHOKIDAR_USEPOLLING=1` test)
- [ ] README: install, quickstart, screenshots, data-format reference
- [ ] `docs/` consistency pass against shipped behaviour
- [ ] `v1.0.0` publish dry run (`pnpm publish --dry-run`), files list verified
- [ ] Optional: `gh`-based repo bootstrap demo

**Exit criteria:** a machine with only Node 20 + Git installed can run the app from the tarball and complete M4/M5/M6 exit criteria.

Docs: [`docs/11-packaging.md`](./docs/11-packaging.md)

---

## Cross-cutting rules (apply to every milestone)

* No milestone is "done" without tests for its edge cases and a docs update.
* No new dependency without: pure-JS (or optional-native), maintained, and justified in the PR description.
* Every filesystem mutation goes through the IO layer — no ad-hoc `fs.writeFile` scattered in route handlers.
* Every UI state that can be derived from files must be derived from files; no client-side source of truth.

## Deferred / out of scope for v1

* Multi-workspace switching in one server process
* CSV importer (was Phase 4 in v1.0.0 — moved post-1.0)
* Mobile/native clients, real-time multi-user presence
* Server-side PDF rendering, email sending, payment processing
* Encryption at rest (Git remote choice is the user's threat model)
