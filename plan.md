# `ob` — Plan

Release plan and scope tracker. The white paper ([`brief.md`](./brief.md)) states principles and
the locked stack; [`docs/`](./docs/README.md) holds the normative behaviour contracts. This file
tracks order, scope and what is left.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Status

| Area | State |
|---|---|
| White paper, decisions, feature docs | `[x]` |
| M0–M6 implementation | `[x]` |
| Pre-M7 polish (P0–P7) | `[x]` |
| M7 packaging & release | `[~]` — docs and metadata done, publish pending |
| Post-v1 backlog | recorded below, not started |

---

## Shipped scope

### M0 — Repo & tooling `[x]`

TypeScript strict/ESM, `tsc` server build + Vite single-file UI + `scripts/postbuild.mjs` checks,
vitest/eslint/prettier, pnpm pinned via `packageManager`, CI matrix (Ubuntu/macOS/Windows × Node
20/22). Detail: [`docs/11-packaging.md`](./docs/11-packaging.md).

### M1 — CLI & workspace `[x]`

`ob [path]`, `init`, `sync`, `check`; pre-flight (Node, git, identity, optional `gh`); interactive
wizard with `--demo` / `--empty`; scaffolding + `.ob/config.json` + `.gitignore`; demo seed copied
from `fixtures/workspaces/demo/`; workspace lock; port `19731` probing upward; clean signal exit.
Detail: [`docs/01`](./docs/01-cli-and-preflight.md), [`docs/02`](./docs/02-workspace-init.md).

### M2 — Data layer `[x]`

Zod write schemas + permissive projection, ids (`{prefix}_{26-char ULID}`), integer-cent money and
basis-point tax, `yaml` Document round-trip (body byte-identical, comments/order/unknown keys kept),
atomic writes with echo suppression, in-memory index, chokidar watcher, typed issues, path safety.
Detail: [`docs/03`](./docs/03-data-model.md)–[`docs/06`](./docs/06-file-watcher-and-io.md).

### M3 — HTTP API & security `[x]`

Hono app on `127.0.0.1`; Host/Origin checks, token-gated mutations, 1 MB body cap; generic record
routes with `baseHash` conflicts; task move; estimate → invoice; issues preview/resolve; SSE events;
stable error envelope. Detail: [`docs/07`](./docs/07-server-api-and-security.md).

### M4 — UI shell & CRUD `[x]`

Single-file SPA, sidebar + mobile sheet, `⌘K` palette, dark mode, contacts/projects/tasks/documents
CRUD, issues view, live updates with a generation guard, skeletons/empty states/toasts.
Detail: [`docs/08`](./docs/08-web-ui.md).

### M5 — Boards, money, print, search `[x]`

Project → board (folder-derived columns, drag + keyboard moves, sparse order); billing editor with
live cents math; number generation; duplicate; estimate → invoice; A4 browser print (light, 16 mm);
overdue derivation; FlexSearch `/api/search`. Detail: [`docs/08`](./docs/08-web-ui.md),
[`docs/10`](./docs/10-search.md).

### M6 — Git sync `[x]`

Subprocess wrapper (argv only, 10 s timeout), path-scoped commit-on-save with 1200 ms debounce,
manual sync (`add → commit → pull --rebase → push`), failure states with explicit recovery, header
badge + Git dialog, `ob sync`, `beforeunload` guard. Detail:
[`docs/09`](./docs/09-git-sync.md).

---

## Pre-M7 polish `[x]` (P0–P7)

The ten gaps from the retired `POLISH.md` were delivered as seven waves; the file has been removed
and the behaviour now lives in the docs.

| Wave | Delivered | Doc |
|---|---|---|
| P0 | Sheet gutters, `Shift+D`, shadcn date fields | 08 |
| P1 | Markdown rendering + Write/Preview, contact page | 08 |
| P2 | Business logo (PNG ≤768 px, monogram fallback, on prints) | 08 |
| P3 | Document scope + kinds, templates, document print | 13 |
| P4 | Document attachments on estimates/invoices | 13 |
| P5 | CSV import for contacts/projects/tasks | 14 |
| P6 | Revenue/outstanding cards, `GET /api/system` in Settings | 07, 08 |
| P7 | Impeccable audit, print light/dark, keyboard reorder, docs pass | 08, 12 |

---

## M7 — Packaging & release `[~]`

Metadata and documentation (done):

- [x] Publish as **`filecrm`** (bins `ob` and `filecrm`); repo stays `ob3`
- [x] `README.md`: requirements, install, quickstart, data layout, development
- [x] `docs/user-manual.md`: end-user, step-by-step
- [x] `brief.md` rewritten as a short white paper
- [x] `docs/15-data-migration.md`: schema policy and future `ob migrate`
- [x] `POLISH.md` retired; plan condensed; docs index split user/developer

Release steps (remaining):

- [ ] Bump `version` to `1.0.0`
- [ ] Tarball smoke test: `pnpm pack` → temp dir install → `init --demo` → `GET /api/health` → stop
- [ ] Zero-native check: run with `CHOKIDAR_USEPOLLING=1` and complete a CRUD + sync cycle
- [ ] `pnpm publish --dry-run`: file list is only `dist`, `docs`, `README.md`, `LICENSE`,
      `package.json`, and contains no `.ob/state` or `src/`
- [ ] Publish `filecrm@1.0.0` (npm 2FA; prefer trusted publishing from the public repo)
- [ ] CI: trigger on `master` (currently `main`) and add a tag-triggered publish job
- [ ] Post-publish: `npx filecrm@1.0.0` from a clean directory on macOS/Linux/Windows

**Exit criteria:** a machine with only Node ≥ 20 + Git runs the package from npm, completes the
CRUD → board → billing → print → sync flow, and never compiles anything. Detail:
[`docs/11-packaging.md`](./docs/11-packaging.md).

---

## Decisions worth remembering

Logo lives in the user's repo under `.ob/assets/` (only `.ob/state/` is ignored); uploads are
normalised client-side to PNG and re-validated server-side. Attachments are document **ids**; the
legacy `terms_document` path stays readable. Document templates render at view/print time and are
never written back. CSV import always creates, never merges, and resolves references only against
existing records. Revenue is paid invoices by `issue_date` (UTC); outstanding is `sent` + derived
`overdue`. System facts are read on demand, never polled. Document kinds are a fixed set with
`other` as the catch-all. The package is `filecrm`; the repo is `ob3`. Schema changes follow
[`docs/15`](./docs/15-data-migration.md).

## Cross-cutting rules

- No change is done without tests for its edges and a docs update.
- No new dependency without: pure-JS (or optional-native), maintained, and justified.
- Every filesystem mutation goes through `src/io/` — no ad-hoc `fs.writeFile` in routes or UI.
- Every UI state derivable from files must be derived from files; no client-side source of truth.
- `typecheck`, `test`, `lint`, `build`, and `impeccable detect` must be green before a release.

## Post-v1 backlog

**Product**

- Multi-workspace switching in one server process
- Server-side PDF rendering and e-mail sending
- Payment links / payment-status reconciliation
- Encryption at rest (today the threat model is the Git remote)
- `gh repo create` bootstrap from the CLI
- Mobile/native clients, real-time multi-user presence
- Billing CSV import (line items need a different shape than the flat import)

**UX (from the P7 critique)**

- Dirty-guard before closing a sheet discards typed values
- "Live updates paused" indicator when the SSE stream drops
- List sorting/filtering beyond the palette (invoices by date, contacts by name)
- Inline field errors (`aria-invalid` + `aria-describedby`) instead of toast-only validation
- Recovery hints after an aborted rebase (the exact next `git` command)

**Data**

- `ob migrate` per [`docs/15`](./docs/15-data-migration.md) when the first `ob_schema` bump lands
- `paid_at` on invoices so revenue can be bucketed by payment date, not issue date
