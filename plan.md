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
| Source code | `[~]` — M0–M6 landed (tooling, CLI/workspace, data layer, API, web UI, board/money/search, git sync); M7 next |

**Next action:** milestone M7 (packaging, tarball smoke test, docs pass, release dry run).

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

- [x] Zod schemas (`src/model/schemas.ts`): strict write schemas + permissive read projector with fallbacks and `schema-invalid` issues
- [x] Money helpers (`src/model/money.ts`): `roundHalfUp`, `lineTotalCents`, `taxCents`, `totalCents`, `sumLineTotals`, `formatCents`, `parseMoney` — property-tested over 1,000 random inputs
- [x] ULID + slug generators (`src/model/ids.ts`, `src/model/slug.ts`) with injectable clock/randomness; `RECORD_ID_PATTERN` rejects the v1.0.0 sample ids
- [x] Frontmatter round-trip (`src/model/frontmatter.ts`): `yaml` Document API, byte-identical body, comments/order/unknown keys preserved, CRLF + BOM preserved, `flowCollectionPadding: false` to avoid reformatting untouched flow arrays
- [x] Atomic write (`src/io/atomic.ts`) + hash-based self-write suppression (`src/io/self-writes.ts`)
- [x] Indexer (`src/index/indexer.ts`): full scan, id-keyed map, path cache, canonical-wins duplicate handling with survivor promotion, soft-ref resolution, task column derivation
- [x] Watcher (`src/io/watcher.ts`): chokidar on the six managed dirs, `awaitWriteFinish`, 150 ms coalescing, hidden/non-`.md`/symlink filtering
- [x] Issue model + registry (`src/model/issue.ts`): `parse-error`, `unreadable`, `too-large`, `missing-id`, `duplicate-id`, `duplicate-number`, `schema-invalid`, `orphan-task-path`, `dangling-ref`, `conflict-marker`, each with default actions
- [x] Task folder ↔ status helpers (`src/model/task-status.ts`), including orphan detection
- [x] Path safety (`src/io/path-safety.ts`): `normalizeRelativePath`, `resolveInWorkspace`, `resolveRecordPath`, symlink-escape detection
- [x] Fixtures: `demo` (canonical seed) and `external-edits` (9 indexed records + 7 distinct issues); CRLF/BOM/oversized/symlink cases generated in tests

**Exit criteria:** met. 237 tests pass, including a byte-equality frontmatter suite, the full external-edit contract (rename, move, body edit, reordered/unknown keys, duplicate id + promotion, missing id, invalid YAML, dangling refs, conflict markers, duplicate numbers), parse retry, self-write suppression, path-escape rejection, and a snapshot test proving scans never write to disk.

Docs: [`docs/03-data-model.md`](./docs/03-data-model.md), [`docs/04-frontmatter-roundtrip.md`](./docs/04-frontmatter-roundtrip.md), [`docs/05-indexer-and-external-edits.md`](./docs/05-indexer-and-external-edits.md), [`docs/06-file-watcher-and-io.md`](./docs/06-file-watcher-and-io.md)

---

## Milestone M3 — HTTP API & Security

Goal: a complete, safe, self-describing API for the SPA.

- [x] Middleware (`src/server/security.ts`): `Host` allowlist, `Origin` + `Sec-Fetch-Site` checks, constant-time `X-OB-Token` comparison, 1 MB body limit, workspace-confined path resolution
- [x] `GET /api/health` (generation, record count, uptime), `GET /api/config`, `PATCH /api/config` (deep merge, Zod-validated, unknown keys preserved)
- [x] Generic record routes for all six types: list (with `q`/`status`/`project_id`/`client_id` filters), get (returns `hash`), create, patch (`baseHash` → 409), delete (`?baseHash`)
- [x] `POST /api/tasks/:id/move` — folder rename + sparse `order` with rebalancing on collision
- [x] `POST /api/invoices/from-estimate/:estimateId` — server-computed money, back-link, 409 on double conversion
- [x] `GET /api/issues`, `GET /api/issues/:key{.+}/preview`, `POST /api/issues/:key{.+}/resolve` (`assign-id`, `adopt-path`, `ignore` persisted in `.ob/state/ignored-issues.json`)
- [x] `GET /api/events` SSE: `snapshot`, `record.upsert`, `record.delete`, `record.moved`, `issues.changed`, `config.changed`, 20 s heartbeat
- [x] Error envelope `{ error: { code, message, details? } }` with stable codes (`invalid_token`, `host_not_allowed`, `cross_origin`, `validation_failed`, `file_changed_on_disk`, `path_escape`, …); `onError` maps `ApiError`, `HTTPException`, `PathEscapeError`, `ConfigError`
- [x] `@hono/zod-validator` at the boundary plus service-level Zod (defence in depth; `body`/`baseHash` are server-only fields)
- [x] Runtime (`src/server/runtime.ts`): index + watcher + bus wired into the server; writes through the API publish their own events and the watcher echo is suppressed
- [x] Token generated per run and injected into the served HTML (`__OB_TOKEN__`) without touching `dist/`

**Git routes are deferred to M6** (`/api/git/*`), where the sync engine lives; the contract in `brief.md` §7 is unchanged.

**Exit criteria:** met. 276 tests pass (39 new for the API): every mutation is reachable, a foreign `Origin`/`Host` or missing token is rejected, oversized bodies 413, stale `baseHash` 409, issue actions mutate the file only on explicit request, SSE emits a snapshot and mutation events. Verified end-to-end against a real server: create → patch → stale-hash 409 → task move → estimate conversion → graceful shutdown with the lock released.

Docs: [`docs/07-server-api-and-security.md`](./docs/07-server-api-and-security.md), [`docs/10-search.md`](./docs/10-search.md)

Docs: [`docs/07-server-api-and-security.md`](./docs/07-server-api-and-security.md), [`docs/10-search.md`](./docs/10-search.md)

---

## Milestone M4 — UI Shell & CRUD

Goal: a usable CRM for contacts, projects, and documents.

- [x] Tailwind v4 + shadcn/ui baseline: `components.json`, `src/ui/styles.css` design tokens, `@/` alias in Vite + TS (`moduleResolution: Bundler`), 21 registry components; single-file build still self-contained (579 KB / 166 KB gzip)
- [x] Design context captured: `PRODUCT.md` (product truth) and `DESIGN.md` (Operate mode, ledger world, semantic tokens, type/motion contract)
- [x] App shell: sidebar with counts, mobile nav sheet, header with workspace name, search and theme toggle; `⌘K` command palette with record search and navigation
- [x] Data client: token from the inlined `<meta>`, typed wrapper, `Promise.all` bootstrap, SSE with generation guard + refresh on reconnect
- [x] Contacts: table, detail sheet, full editor, create, delete, markdown body, 409 conflict banner with reload
- [x] Projects: table, client + status controls, body editor, delete
- [x] Documents: table, title/kind/body editor, delete
- [x] Tasks: folder-derived board with per-card "Move to…", detail editor, create/delete, overdue chips
- [x] Estimates & invoices: read-only tables + detail dialog with line items and cents math; estimate → invoice conversion from the dialog
- [x] Issues: list with severity, preview dialog, explicit `assign-id` / `adopt-path` / `ignore` actions
- [x] Settings: business profile, currency, tax rate (percent ↔ bps), workspace facts; empty states, skeletons, sonner toasts, dark mode
- [x] Runtime guard: a record whose file disappears closes its editor instead of writing to a missing path

**Deviations (deliberate):** no list filters beyond palette search yet; no markdown preview pane; saves are pessimistic (retry via toast) rather than optimistic-with-rollback; search is still the server's temporary substring matcher; drag-and-drop, invoice/estimate editing and print are M5.

**Exit criteria:** met for the M4 surface. `pnpm typecheck`, `pnpm lint`, `pnpm test` (276) and `pnpm build` pass; the shipped HTML is one 579 KB file with the token injected, no external assets, CSP applied. Impeccable's mechanical detector reports no findings for `src/ui`.

Docs: [`docs/08-web-ui.md`](./docs/08-web-ui.md), [`docs/10-search.md`](./docs/10-search.md), [`DESIGN.md`](./DESIGN.md)

---

## Milestone M5 — Kanban & Money

Goal: tasks as a filesystem board; estimates and invoices that are arithmetically correct.

- [x] Project → board flow: `/projects` is a list; `/projects/:id` opens that project's board with only its tasks. The cross-project board stays at `/tasks` as "All tasks".
- [x] Kanban board: 3 columns derived from folders, drag-and-drop → single `move` API call, `order` re-normalization (sparse integers, rebalanced on collision)
- [x] Keyboard-accessible card moves ("Move to…" menu; drag is never the only path)
- [ ] Task detail: title, project link, due date, checklist rendered from body — the sheet edits the raw Markdown body; no checklist renderer yet
- [x] Estimate/invoice editor: line items, live cents math, validation (`subtotal == Σ line totals`), currency from config, `tax_rate_bps` default
- [x] Number generation: `INV-YYYY-NNN` / `EST-YYYY-NNN` derived from existing files, gap-tolerant
- [x] Estimate → invoice conversion (new id, `estimate_id` backlink, `converted_invoice_id` forward link)
- [x] Duplicate estimate/invoice (`POST /api/{estimates,invoices}/:id/duplicate`): next number for the current year, `status: draft`, today + 15/30 days, copies line items and body, writes no new `converted_invoice_id` (an invoice copy keeps `estimate_id` as provenance)
- [x] Print/PDF-ready view for invoices and estimates (`/invoices/:id/print`, `/estimates/:id/print`): strict A4 `@page`, light-only paper, browser print produces the PDF — no server-side PDF dependency
- [x] Overdue derivation from `due_date` + `status` (display-only; never rewrites the file)
- [x] FlexSearch search replacing the temporary substring matcher: `/api/search` (ranked, type-filterable) and ranked `?q=` on list routes

**Deviations (deliberate):** print is A4-only (the brief allows A4/Letter; A4 is the request). The print view renders notes and the linked terms document, but has no signature block. Search uses FlexSearch's prefix tokenizer without typo tolerance, and rebuilds its whole in-memory index when the record index generation changes (no incremental reindex yet).

**Exit criteria:** dragging a card moves exactly one file (commit-on-save follows in M6); a 3-line invoice with 8.5% tax renders `21250` tax and `271250` total (unit + API tests); the print sheet is A4 with 16 mm page margins. One-page fit is confirmed manually per document length, not guaranteed by CSS.

Docs: [`docs/03-data-model.md`](./docs/03-data-model.md) §Money, §Numbering, [`docs/08-web-ui.md`](./docs/08-web-ui.md) §Kanban, §Money rendering, [`docs/10-search.md`](./docs/10-search.md)

---

## Milestone M6 — Git Sync & Issue Triage

Goal: sync that never loses work and never lies about state.

- [x] `git` subprocess wrapper: argv arrays, no shell, 10 s timeout with process-group kill, captured stdout/stderr, `GIT_TERMINAL_PROMPT=0`, `GIT_SSH_COMMAND` BatchMode when unset
- [x] Commit-on-save: path-scoped `add -A -- <paths>` + `commit`, 1200 ms debounce, coalesced per record, serialized with syncs, flushed on shutdown, failure-isolated
- [x] `ob sync` / Sync button: `add -A` → `commit` → `pull --rebase` → `push`, step-by-step reporting over stdout and SSE
- [x] Failure states with recovery actions: not a repo, parent repo, detached HEAD, no upstream, rebase conflict, non-fast-forward, auth/network, hook rejection, timeout
- [x] Sync badge: `clean | dirty | unpushed | syncing | error` from real git output, with a dialog for status, steps, errors and recovery
- [x] `beforeunload` guard when `dirty || unpushed`; disabled while syncing
- [x] "Needs attention" view: issue list, file peek (read-only), resolve actions — shipped in M3/M4; unchanged here
- [x] `POST /api/git/init` and remote configuration flow (`POST /api/git/remote`, optional `push`); `gh repo create` deferred
- [x] `POST /api/git/recover` with `abort-sync` and `set-upstream` only

**Deviations (deliberate):** `gh repo create` is deferred to M7 (network, auth and prompts do not belong in the local server). `POST /api/git/sync` awaits the chain and returns the step report while streaming `git.step` events; there is no job id/polling. The server refuses a parent repository; only `ob sync --allow-parent-repo` (or `OB_ALLOW_PARENT_REPO=1`) overrides. Issue triage needed no work because it shipped earlier. `.ob/state/` is never staged, even when `.gitignore` omits it.

**Exit criteria:** met except the process-kill case. Integration tests against a local bare repo prove commit-on-save, clean sync, no-upstream recovery, non-conflicting pull, conflict surfacing + abort, hook rejection, detached HEAD, parent-repo refusal and `.ob/state` exclusion. A mid-rebase kill is a manual check; the code never aborts or resets, so recovery stays with the user.

Docs: [`docs/09-git-sync.md`](./docs/09-git-sync.md), [`docs/07-server-api-and-security.md`](./docs/07-server-api-and-security.md), [`docs/08-web-ui.md`](./docs/08-web-ui.md) §Git

---

## Pre-M7 Polish Track (`POLISH.md`)

Goal: close the UI/UX gaps in [`POLISH.md`](./POLISH.md) before packaging. Ordered by dependency, not by the file's numbering.

- [x] **P0 — Shell polish:** sheet body gutters; `Shift+D` theme toggle (ignores editable targets); shadcn `Calendar` + `Popover` date fields replacing native `type="date"`
- [x] **P1 — Markdown & contact detail:** `react-markdown` + `remark-gfm` renderer, Write/Preview editor tabs, markdown in project/contact/task/document/billing/print; `/contacts/:id` read-only detail with Edit
- [x] **P2 — Business logo:** client-side normalize to PNG (≤768 px, strips EXIF), validate magic bytes server-side (≤512 KB, no SVG), store at `.ob/assets/logo.png` (committed, synced), `business.logo` in config, monogram fallback out of the box, logo on Settings/invoice/estimate print
- [x] **P3 — Documents model:** `scope: global|client` + `client_id`, document detail (`/documents/:id`) and A4 print (`/documents/:id/print`), `{{variable}}` renderer (`business.*`, `client.*`, `project.*`, `invoice.number`, `estimate.number`, `today`; unknown stays literal)
- [x] **P4 — Attachments:** `document_ids: string[]` on estimates/invoices, multi-select tags in the billing editor, all attached documents rendered on view/print with the billing context, legacy `terms_document` as fallback, copied by duplicate/convert
- [x] **P5 — CSV import:** contacts/projects/tasks only (billing needs a different shape), RFC4180 parser, skeleton download, partial import with per-row errors, Settings card (`docs/14-csv-import.md`)
- [ ] **P6 — Insight:** paid revenue total + current month (by `issue_date`) + outstanding on the dashboard; `GET /api/system` (uptime, RSS/heap, CPU cores/load, memory, workspace disk) in Settings
- [ ] **P7 — Final pass:** impeccable detect/critique, A4 print in light + dark, keyboard traversal, docs consistency, full verification

**Decisions:** logo lives in the user's repo under `.ob/assets/` (only `.ob/state/` is ignored); uploads are normalized client-side to PNG and re-validated server-side. Attachments use document **ids**; old `terms_document` paths remain readable. Document templates are rendered at view/print time and never rewritten into files. CSV billing import is out of scope. Import always creates new records (no merge, no dedupe), resolves `client`/`project` only against existing records, and creates tasks directly in the chosen column folder. Revenue has no `paid_at` field yet, so the month is by `issue_date`. No persistent server log viewer; the Git step log is the activity log.

Docs: [`docs/08-web-ui.md`](./docs/08-web-ui.md), [`docs/03-data-model.md`](./docs/03-data-model.md), new `docs/13-documents.md` and `docs/14-csv-import.md`

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
