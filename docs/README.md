# `ob` — Documentation

Two audiences, two indexes. End users start with the manual; contributors read the feature docs.

## For users

| Document | Contents |
|---|---|
| [`user-manual.md`](./user-manual.md) | Step-by-step guide: first run, daily flow, billing, printing, documents, CSV import, sync, troubleshooting |
| [`../brief.md`](../brief.md) | White paper: the problem, principles, architecture, data model, stack, distribution |
| [`../README.md`](../README.md) | Install, requirements, quickstart, development commands |

## For developers

One document per functional area. The white paper ([`../brief.md`](../brief.md)) states the
principles and the locked stack; these documents are the **normative behaviour contracts** — what
"correct" means for each area.

| Doc | Area | Milestone | Status |
|---|---|---|---|
| [00-decisions](./00-decisions.md) | Architecture decision record | — | `[x]` |
| [01-cli-and-preflight](./01-cli-and-preflight.md) | CLI entry, flags, dependency diagnostics | M1 | `[~]` |
| [02-workspace-init](./02-workspace-init.md) | Init wizard, scaffolding, demo data, lock, port | M1 | `[~]` |
| [03-data-model](./03-data-model.md) | Schemas, IDs, money/cents, references | M2/M5 | `[~]` |
| [04-frontmatter-roundtrip](./04-frontmatter-roundtrip.md) | YAML Document API read/write | M2 | `[x]` |
| [05-indexer-and-external-edits](./05-indexer-and-external-edits.md) | In-memory index, issues, external-edit behaviour | M2 | `[~]` |
| [06-file-watcher-and-io](./06-file-watcher-and-io.md) | chokidar, atomic writes, echo suppression | M2 | `[~]` |
| [07-server-api-and-security](./07-server-api-and-security.md) | Hono routes, error envelope, SSE, security | M3 | `[~]` |
| [08-web-ui](./08-web-ui.md) | SPA shell, CRUD views, Kanban, print | M4/M5 | `[~]` |
| [09-git-sync](./09-git-sync.md) | Commit-on-save, sync lifecycle, recovery | M6 | `[x]` |
| [10-search](./10-search.md) | FlexSearch index, query semantics | M5 | `[x]` |
| [11-packaging](./11-packaging.md) | Single-file bundle, `bin`, package publish | M0/M7 | `[~]` |
| [12-testing-and-verification](./12-testing-and-verification.md) | Test strategy, fixtures, manual QA | all | `[~]` |
| [13-documents](./13-documents.md) | Document scope, kinds, templates, A4 print | P3 | `[~]` |
| [14-csv-import](./14-csv-import.md) | CSV skeleton, import contract, row errors | P5 | `[x]` |
| [15-data-migration](./15-data-migration.md) | `ob_schema` policy, compatibility rules, future `ob migrate` | M7 | `[x]` |

## Status legend

* `[ ]` documented, not implemented
* `[~]` implemented, documentation or manual checks pending
* `[x]` implemented, tested, documentation current

## Conventions used in these docs

* **MUST / MUST NOT** — required for spec compliance; a deviation is a bug.
* "Record" means one Markdown file with YAML frontmatter.
* "Index" means the in-memory, rebuildable projection of the filesystem. It is never persisted.
* All paths are workspace-relative POSIX paths (`contacts/cnt_x.md`), normalized for Windows on the
  boundary.

## Editing these docs

When a decision changes, update the owning doc **and** `00-decisions.md`, then adjust `plan.md` if
scope moves. Docs must describe shipped behaviour, never aspiration — planned work belongs in
`plan.md`. The user manual is written for end users: no internals, no file paths beyond the workspace
tree, no ADR references.
