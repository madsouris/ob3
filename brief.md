# ob — local-first CRM

**White paper · v1.0 · MIT**

`ob` is a CRM that lives in a folder of Markdown files. You run one command in a directory, a
local web app opens, and every contact, project, task, estimate, invoice and document is a `.md`
file with YAML frontmatter. Git is the sync layer. There is no database, no account and no cloud.

## The problem

Small studios and freelancers run client work out of spreadsheets, notes and email, then pay for a
CRM that keeps the data in a service they cannot read, script, version or take with them. Hosted
CRMs assume a team and a database; the actual work is one person, a handful of clients, and a
folder on disk.

## The product

**What it is**

- A workspace folder plus a local server and browser UI over that folder.
- Markdown with YAML frontmatter as the only storage format.
- Git as backup, history and multi-device sync.
- A strict A4 print path for estimates, invoices and documents; the browser produces the PDF.

**What it is not**

- Not a hosted service, not multi-tenant, not real-time collaboration.
- Not a rich-text editor: the body is Markdown, edited as text.
- Not a database with an export button: the files *are* the database.

## Principles

1. **Files are the database.** The in-memory index is a cache rebuilt from disk; the UI is a
   reader/editor over the filesystem, never a second source of truth.
2. **Identity is `id`.** `{prefix}_{26-char ULID}` in frontmatter. The path is a hint; renames never
   duplicate or orphan a record.
3. **Never rewrite what `ob` did not change.** Only touched frontmatter fields change; the body is
   copied byte-for-byte; unknown keys, comments and key order survive.
4. **Ambiguity becomes an issue, never a repair.** Duplicate ids, dangling references, invalid YAML
   and missing fields surface in "Needs attention" with an explicit user action.
5. **Local only.** Loopback server, no telemetry, no network access at runtime.

## How it works

```text
browser (single-file SPA)  ⇄  Hono on 127.0.0.1  ⇄  workspace files
                                      │
                          chokidar watcher + in-memory index
```

- Hono on Node 20+, bound to `127.0.0.1`, default port `19731` probing upward.
- The index is rebuilt from disk on start and never persisted; search is in-memory.
- Writes are atomic (temp file + `rename`) and echo-suppressed so the watcher does not double-fire.
- Live updates reach the UI over Server-Sent Events.
- Mutations require a per-run token inlined into the served shell; `Host` and `Origin` are checked.
- External edits are first-class: rename, move, hand-edit or replace a file and the UI follows.

## Data model

```text
workspace/
├── .ob/config.json        business defaults (committed)
├── .ob/assets/logo.png    optional logo (committed)
├── .ob/state/             lock + session token (gitignored)
├── contacts/  projects/  estimates/  invoices/  documents/
└── tasks/{todo,doing,done}/     ← the Kanban is the folder tree
```

- Every record is YAML frontmatter plus a Markdown body, with `ob_schema`, `type`, an immutable
  `id`, and `created_at` / `updated_at`.
- Task status is the containing folder; task frontmatter has no `status` field.
- Money is integer cents; tax is integer basis points; round-half-up happens exactly once.
- References (`client_id`, `project_id`, `estimate_id`, …) are soft ids: a missing target shows a
  `dangling-ref` issue and never triggers a cascade.
- Unknown frontmatter keys are preserved on write; hand-edited values are shown, not silently fixed.

Normative schemas: [`docs/03-data-model.md`](./docs/03-data-model.md) and
[`docs/04-frontmatter-roundtrip.md`](./docs/04-frontmatter-roundtrip.md). Schema evolution:
[`docs/15-data-migration.md`](./docs/15-data-migration.md).

## Stack (locked)

| Area | Choice |
|---|---|
| Language / runtime | TypeScript strict, ESM, Node ≥ 20 |
| Backend | Hono + `@hono/node-server`, loopback only |
| Frontend | React 19, Tailwind v4, shadcn/ui, Lucide; Vite + `vite-plugin-singlefile` |
| Live updates | Server-Sent Events |
| Watcher | `chokidar` with a polling fallback; `fsevents` stays optional |
| Search | FlexSearch, in-memory, rebuilt from files, never persisted |
| Frontmatter | `yaml` Document API (`js-yaml` is banned) |
| Validation | Zod, permissive on read, strict on write |
| Sync | Git CLI subprocesses |
| Package | `filecrm` on npm, commands `ob` and `filecrm` |
| Dev tooling | pnpm, vitest, Playwright for the release smoke flow |

## Security model

A local HTTP server is reachable by any page the user visits, so it is treated as hostile surface:
bind `127.0.0.1` only, validate `Host` and `Origin`, emit no CORS headers, gate every mutation with
`X-OB-Token`, confine paths to the workspace root, and cap request bodies at 1 MB. Errors return a
stable `{ error: { code, message } }` envelope, never stack traces or paths outside the workspace.

## Sync

- **Commit-on-save (default):** one path-scoped commit per burst of edits, staging only the files
  `ob` just wrote. Pushing is always explicit.
- **Manual sync:** `git add` → `commit` → `pull --rebase` → `push`, run from the Git dialog or
  `ob sync`.
- **Conflicts are data:** they are listed with their paths, and recovery is always a user click;
  `ob` never runs `reset`, `push --force`, or `rebase --abort` on its own.
- **Tab protection:** `beforeunload` fires only for dirty or unpushed work.

## Distribution

`npx filecrm .` for zero-install, `npm i -g filecrm` for the global `ob` and `filecrm` commands. The
SPA ships prebuilt inside the package: no native modules, no postinstall step, no compiler.

## Out of scope for v1

Multi-workspace switching in one process, server-side PDF rendering, email sending, payment
processing, encryption at rest, `gh`-based repository bootstrap, mobile clients, and real-time
multi-user presence. Deferred UI work is listed in [`plan.md`](./plan.md).

## Status

M0–M6 are shipped — CLI, workspace init, data layer, HTTP API, web UI, boards/billing/print/search,
and Git sync. M7 (packaging and the first publish) is in progress. The pre-release polish wave is
complete and folded into the docs.

## Read next

- **Users:** [`docs/user-manual.md`](./docs/user-manual.md)
- **Contributors:** [`AGENTS.md`](./AGENTS.md), [`docs/README.md`](./docs/README.md),
  [`docs/00-decisions.md`](./docs/00-decisions.md)
- **Plan and status:** [`plan.md`](./plan.md)
