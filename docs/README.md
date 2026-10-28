# `ob` — Feature Documentation

One document per functional area. The PRD ([`../brief.md`](../brief.md)) is the contract; these documents describe *how* each area satisfies it and what "correct" means for it.

| Doc | Area | Milestone | Status |
|---|---|---|---|
| [00-decisions](./00-decisions.md) | Architecture decision record | — | `[x]` |
| [01-cli-and-preflight](./01-cli-and-preflight.md) | CLI entry, flags, dependency diagnostics | M1 | `[~]` |
| [02-workspace-init](./02-workspace-init.md) | Init wizard, scaffolding, demo data, lock, port | M1 | `[~]` |
| [03-data-model](./03-data-model.md) | Schemas, IDs, money/cents, references | M2/M5 | `[ ]` |
| [04-frontmatter-roundtrip](./04-frontmatter-roundtrip.md) | YAML Document API read/write | M2 | `[ ]` |
| [05-indexer-and-external-edits](./05-indexer-and-external-edits.md) | In-memory index, issues, external-edit behaviour | M2 | `[ ]` |
| [06-file-watcher-and-io](./06-file-watcher-and-io.md) | chokidar, atomic writes, echo suppression | M2 | `[ ]` |
| [07-server-api-and-security](./07-server-api-and-security.md) | Hono routes, error envelope, SSE, security | M3 | `[ ]` |
| [08-web-ui](./08-web-ui.md) | SPA shell, CRUD views, Kanban, print | M4/M5 | `[ ]` |
| [09-git-sync](./09-git-sync.md) | Commit-on-save, sync lifecycle, recovery | M6 | `[ ]` |
| [10-search](./10-search.md) | FlexSearch index, query semantics | M3/M4 | `[ ]` |
| [11-packaging](./11-packaging.md) | Single-file bundle, `bin`, npm publish | M0/M7 | `[~]` |
| [12-testing-and-verification](./12-testing-and-verification.md) | Test strategy, fixtures, manual QA | all | `[~]` |

## Status legend

* `[ ]` documented, not implemented
* `[~]` implemented, documentation or tests pending
* `[x]` implemented, tested, documentation current

## Conventions used in these docs

* **MUST / MUST NOT** — required for spec compliance; a deviation is a bug.
* "Record" means one Markdown file with YAML frontmatter.
* "Index" means the in-memory, rebuildable projection of the filesystem. It is never persisted.
* All paths are workspace-relative POSIX paths (`contacts/cnt_x.md`), normalized for Windows on the boundary.

## Editing these docs

When a decision changes, update the owning doc **and** `00-decisions.md`, then adjust `plan.md` if scope moves. Docs must describe shipped behaviour, never aspiration — planned work belongs in `plan.md`.
