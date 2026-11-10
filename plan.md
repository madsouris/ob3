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
| M7 packaging & release | `[x]` — `filecrm@1.1.1` published through the tag workflow |
| Post-v1: payment info on prints | `[x]` — link or QR, one active mode |
| Post-v1: in-app user manual | `[x]` — `#/manual`, per-section deep links |
| Post-v1: local dates + paid revenue | `[x]` — `dd/MM/yyyy` local, month by `paid_at` |
| Post-v1: bill preview + document composer | `[x]` — preview-first bills, Notion-style editor |
| Post-v1: local Playwright smoke test | `[x]` — `pnpm test:e2e`, pre-push hook, CI unchanged |
| Post-v1: billing list search/sort | `[x]` — in-browser filter, lifecycle sort, status last |
| Post-v1: manual workflow diagram | `[x]` — Mermaid source, rendered by Pele |

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

- [x] Bump `version` to `1.0.0`
- [x] Tarball smoke test: `pnpm pack` → temp install → `init --demo` → `GET /api/health` → CRUD → stop
- [x] Zero-native check: ran the installed CLI with `CHOKIDAR_USEPOLLING=1` through a full CRUD cycle
- [x] `pnpm publish --dry-run`; `npm pack --dry-run` lists only `dist`, `docs`, `README.md`, `LICENSE`, `package.json` (97 files, 382 KB)
- [x] CI: trigger on `master`
- [x] Commit the release, then publish `filecrm@1.0.0` (needs the maintainer's npm login + 2FA)
- [x] Tag-triggered publish workflow (`.github/workflows/release.yml`, npm trusted publishing)
- [ ] Configure the trusted publisher on npmjs.com (owner `madsouris`, repo `ob3`, workflow `release.yml`)
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
existing records. Revenue is paid invoices, bucketed by the server-owned `paid_at` (issue date as the
fallback) in the **local** month; outstanding is `sent` + derived `overdue`. Dates display as
`dd/MM/yyyy` local, timestamps add `HH:mm` in details. Bills open as a preview and print from the same
`DocumentSheet`; documents are written in a full-page composer. A local Playwright smoke test runs from
the pre-push hook, never from CI. Every list filters and sorts through one shared toolbar
(`useTableControls` + `TableControls`), in the browser over indexed records; boards search title and
body and disable dragging while filtering because insertion is computed against visible neighbours.
Manual diagrams are Mermaid source rendered with Pele's flowchart grammar (Pele adds
~165 KB; Mermaid.js would add ~1.6 MB to an offline bundle); diagrams render only in the manual.
Starting on an outdated clone fast-forwards before the index is built, but only when the tree is
clean and strictly behind its upstream — never a rebase that could conflict. The git badge is
destructive for uncommitted work and a yellow `warning` outline when there is no repository.
System facts are read on demand, never polled. Document kinds are a
fixed set with `other` as the catch-all. Payment info is one active mode (`link`, `qr` or off) and the
QR is a single fixed JPEG that every upload overwrites. The user manual ships inside the bundle from
`docs/user-manual.md`, parsed into deep-linkable `#/manual/<slug>` sections. The package is `filecrm`;
the repo is `ob3`. Schema changes follow [`docs/15`](./docs/15-data-migration.md).

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
- Payment-status reconciliation against an external processor
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
- `paid_at` on invoices so revenue can be bucketed by payment date, not issue date — **done** in 1.2.0 (`paid_at`, server-owned)
