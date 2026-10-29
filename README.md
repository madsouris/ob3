# `ob` — local-first CRM

`ob` is a CRM that lives in your filesystem. Every contact, project, task, estimate, invoice and
document is a Markdown file with YAML frontmatter. Git is the sync layer. No database, no account,
no cloud.

```bash
npx filecrm .
```

The package is `filecrm`; it installs two identical commands, **`ob`** and **`filecrm`**.

## Requirements

| Requirement | Notes |
|---|---|
| **Node.js 20 or newer** | `node --version` |
| **Git** | Any recent Git; 2.39+ recommended. `git config --global user.name` and `user.email` must be set, otherwise init stops with the exact commands to run |
| **A modern browser** | The UI is served locally; no network access is needed |
| **macOS, Linux or Windows** | No native modules, no compiler, nothing to build |

Optional: the `gh` CLI is detected and reported by the pre-flight check, but nothing in v1 requires it. `ob` never calls the network on its own.

## Quickstart

```bash
mkdir ~/crm && cd ~/crm
npx filecrm .
```

On first run you pick **Demo workspace** (contacts, projects, tasks, estimates, invoices and
documents already linked) or **Empty workspace**. `ob` scaffolds the folders, writes
`.ob/config.json`, runs `git init` if needed, starts the server on
[`http://127.0.0.1:19731`](http://127.0.0.1:19731) (probing upward when busy) and opens the browser.

Skip the wizard and stay scriptable:

```bash
ob init  ~/crm --demo        # scaffold only, no server
ob init  ~/crm --empty
ob check ~/crm --json        # dependency and workspace diagnostics
ob sync  ~/crm --dry-run     # print the git commands without running them
ob --help
```

## What you get

- **Contacts** with an overview page: notes, projects, client documents, billing and a primary link.
- **Projects** with a board per project; tasks live in `tasks/todo|doing|done`, so moving a card
  moves a file. Drag, or use the keyboard ("Move to…", "Move up/down").
- **Estimates → invoices** with integer-cent line items, tax in basis points, duplicate and
  estimate-to-invoice conversion.
- **Billing documents** attached to estimates and invoices, rendered into the print output.
- **Documents** as global templates or client-scoped contracts, proposals and notes, with
  `{{variable}}` placeholders.
- **Strict A4 print** for estimates, invoices and documents; the browser's print dialog makes the
  PDF. Printing is light-mode in both themes.
- **CSV import** for contacts, projects and tasks, with a downloadable skeleton and per-row errors.
- **Git sync**: commit-on-save, a status badge, sync, and explicit conflict recovery.
- **Live updates**: edit the files in VS Code, Obsidian or a shell and the UI follows. Anything
  ambiguous shows up in "Needs attention"; nothing is silently repaired.

## Where your data lives

```text
~/crm/
├── .ob/config.json        business defaults, tax rate, currency, logo reference
├── .ob/assets/logo.png    optional business logo
├── .ob/state/             lock and session token (gitignored)
├── contacts/  projects/  estimates/  invoices/  documents/
└── tasks/{todo,doing,done}/
```

Records are plain Markdown; read, grep, script or version them however you like. The frontmatter
`id` is the identity — renaming a file is safe. Money is stored as integer cents and tax as integer
basis points, so nothing is ever silently rounded twice.

## Sync and backup

Saving from the UI stages only the file you changed and commits it (toggle in Settings). Pushing is
always explicit: open the Git dialog and press **Sync**, or run `ob sync`. Backups and multi-device
sync are ordinary Git:

```bash
git remote add origin git@github.com:you/my-crm.git
git push -u origin main
```

## Documentation

| Document | Contents |
|---|---|
| [`docs/user-manual.md`](./docs/user-manual.md) | Step-by-step guide: first run, daily flow, billing, documents, import, sync |
| [`brief.md`](./brief.md) | White paper: problem, principles, architecture, data model, stack |
| [`docs/README.md`](./docs/README.md) | One document per functional area (how each part behaves) |
| [`docs/00-decisions.md`](./docs/00-decisions.md) | Architecture decision record |
| [`docs/15-data-migration.md`](./docs/15-data-migration.md) | How the schema may evolve without breaking files |
| [`plan.md`](./plan.md) | Milestones, release checklist and post-v1 backlog |
| [`AGENTS.md`](./AGENTS.md) | Operating rules for contributors and agents |

## Development

Requires Node ≥ 20 and pnpm (pinned by `packageManager`; `corepack enable` is enough).

```bash
pnpm install
pnpm dev          # run the CLI from source via tsx
pnpm build        # server (tsc) + single-file UI (vite) + postbuild checks
pnpm typecheck
pnpm test
pnpm lint

# add a shadcn/ui primitive (never hand-write one)
pnpm dlx shadcn@latest add <component>
```

Notes:

- ESM only. Relative imports keep an explicit `.js` extension.
- Frontmatter uses the `yaml` Document API; `js-yaml` is banned and lint-enforced.
- Tailwind v4 with semantic tokens in `src/ui/styles.css`; `@/` maps to `src/ui`.
- `PRODUCT.md` and `DESIGN.md` record product truth and the visual contract.
- Never initialize a workspace inside this repo. `/contacts/`, `/projects/`, `/tasks/`,
  `/estimates/`, `/invoices/`, `/documents/`, `/.ob/` are gitignored and
  `tests/repo/hygiene.test.ts` fails if they appear at the root.

### Layout

```text
src/cli/         entry, flags, pre-flight, init wizard, lifecycle
src/workspace/   scaffolding, config, demo data, lock, port
src/model/       Zod schemas, ids, cents, frontmatter round-trip
src/io/          atomic writes, watcher, echo suppression, path safety
src/index/       in-memory index, issues, search
src/import/      CSV parser, import definitions, row importer
src/server/      Hono app, routes, security middleware, SSE
src/git/         git subprocess wrapper, commit-on-save, sync
src/ui/          React SPA (built into one index.html)
tests/           vitest unit/integration
fixtures/        demo and external-edit workspaces
```

## License

MIT
