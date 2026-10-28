# `ob` — local-first CRM

`ob` is a CRM that lives in your filesystem. Every contact, project, task, estimate and invoice is a Markdown file with YAML frontmatter. Git is the sync layer. There is no database, no account, and no cloud.

```bash
npx @operationbegin/crm .
```

> **Status:** pre-release. M0 (tooling) and M1 (CLI + workspace init) are complete; the data layer, API and UI land in M2–M7. See [`plan.md`](./plan.md).

## Why

- **You own the data.** `git clone`, `grep`, `vim` — it all just works.
- **No lock-in.** Plain `.md` files you can read in ten years.
- **No native build.** `npx` never compiles anything.
- **Local only.** The server binds `127.0.0.1`; nothing leaves your machine unless you run a sync.

## Preview

```bash
npm install
npm run build

# always use a directory OUTSIDE this repo
node dist/cli/index.js ~/ob-demo --demo
```

That seeds a demo workspace, starts the server at `http://127.0.0.1:19731` and opens it. Until M4 the page is only a shell — the real output today is the Markdown in `~/ob-demo`, which you can open in any editor.

```bash
node dist/cli/index.js check ~/ob-demo --json   # diagnostics
node dist/cli/index.js init  ~/ob-demo --empty  # workspace without records
```

The seeded content is the canonical fixture at [`fixtures/workspaces/demo/`](./fixtures/workspaces/demo) (shipped inside the package as `dist/demo`). **Never initialize a workspace inside this repo**: `/contacts/`, `/projects/`, `/tasks/`, `/estimates/`, `/invoices/`, `/documents/`, `/.ob/` are gitignored, and `tests/repo/hygiene.test.ts` fails if they appear at the root.

## Documentation

| Document | Contents |
|---|---|
| [`brief.md`](./brief.md) | Product spec, schemas, invariants |
| [`plan.md`](./plan.md) | Milestones and exit criteria |
| [`docs/README.md`](./docs/README.md) | Index of per-feature docs |
| [`docs/00-decisions.md`](./docs/00-decisions.md) | Architecture decision record |
| [`AGENTS.md`](./AGENTS.md) | Operating rules for contributors and agents |

## Development

Requires Node ≥ 20.

```bash
npm install
npm run dev        # run the CLI from source via tsx
npm run build      # build server (tsc) + single-file UI (vite) + postbuild checks
npm run typecheck  # tsc --noEmit
npm run test       # vitest
npm run lint       # eslint
```

Notes:

- ESM only. Relative imports need an explicit `.js` extension (NodeNext resolution), even from `.ts` sources.
- Frontmatter is read and written with the `yaml` Document API. `js-yaml` is banned (ADR-04) and lint-enforced.
- Money is stored as integer cents; tax rates are integer basis points (ADR-07).

## Layout

```
src/cli/         CLI entry, flags, pre-flight, init wizard
src/workspace/   scaffolding, config, demo data, lock, port
src/model/       Zod schemas, ids, cents, frontmatter round-trip
src/io/          atomic writes, watcher, echo suppression, path safety
src/index/       in-memory index, issues, search
src/server/      Hono app, routes, security middleware, SSE
src/git/         git subprocess wrapper, commit-on-save, sync
src/ui/          React SPA (built into one index.html)
src/shared/      cents helpers and types shared by server + client
tests/           vitest unit/integration
```

## License

MIT
