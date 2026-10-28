# Agent Instructions & Operating Rules

Project: `ob` / `filecrm` — Local-First Offline CRM
Stack: TypeScript (strict, ESM) · Node 20+ · Hono · React 19 + Tailwind + shadcn/ui · Vite (`vite-plugin-singlefile`) · chokidar · FlexSearch · `yaml` Document API
Spec version: **1.1.0** (implementation-ready)

---

## 1. Core Operating Principles

1. **Plan First, Code Second:** Never modify or write application code without presenting a clear plan and receiving explicit approval ("LGTM", "Go ahead", "Approved"). Doc-only tasks that the user explicitly requested may proceed directly.
2. **Utilize Skills:** Load the matching skill *before* designing or editing:

   | Work | Skill |
   |---|---|
   | Hono routes, middleware, server-side TypeScript | `hono-typescript` |
   | React components, data fetching, UI performance | `vercel-react-best-practices` |
   | shadcn/ui primitives and component composition | `shadcn` |
   | Visual design, UX review, polish | `impeccable` |
3. **Respect the Brief:** `brief.md` is the contract for stack, schemas, and file structures. `plan.md` is the contract for scope and order. `docs/` is the contract for behaviour. If a request conflicts with any of them, say so before writing code.
4. **Docs Are Part of the Change:** Any behavioural change updates the owning `docs/` file, `plan.md` checkboxes, and `docs/00-decisions.md` if a decision changed. A change without doc updates is incomplete.
5. **Be Straight to the Point:** Concise, technical, accurate. No fluff, no restating the request.

---

## 2. Repository Map

```
brief.md                 PRD / spec — locked stack, schemas, invariants
plan.md                  Milestones M0–M7, checkboxes, exit criteria
PRODUCT.md               durable product truth (impeccable `init`)
DESIGN.md                design contract — Operate mode, tokens, type, motion
components.json          shadcn/ui config (aliases resolve to src/ui)
docs/README.md           Index + doc status legend
docs/00-decisions.md     ADRs (AD-01…AD-14) — why each decision won
docs/01…12-*.md          One document per functional area
AGENTS.md                This file
```

Source layout (created progressively as each milestone lands — M0 scaffolded `src/cli/`, `src/ui/`, `tests/`, `scripts/`; M1 added `src/workspace/`, `src/io/`, `src/server/`; M2 added `src/model/`, `src/index/`; M3 expanded `src/server/`; M4 filled `src/ui/`):

```
src/cli/         arg parsing, pre-flight, init wizard, lifecycle (M1)
src/workspace/   scaffolding, config, demo data, lock, port (M1)
src/model/       Zod schemas, ids, cents, frontmatter round-trip (M2)
src/io/          atomic writes, watcher, echo suppression, path safety (M2)
src/index/       in-memory index, issues (M2), search (M5)
src/server/      app, routes/, services/, security, SSE, runtime (M3)
src/git/         subprocess wrapper, commit-on-save, sync chain (M6)
src/ui/          React SPA (M4/M5)
  app.tsx        shell, routing, command palette, nav
  views/         one file per surface (dashboard, contacts, …)
  components/    composed components; components/ui/ is registry-generated
  lib/           api client, SSE store, router, theme, formatting
  styles.css     Tailwind v4 entry + semantic design tokens
tests/           vitest unit/integration
fixtures/        workspaces: demo (canonical seed, shipped as dist/demo), external-edits
```

---

## 3. Standard Task Workflow

For every task, bug fix, or feature, follow this loop:

### Step 1: Context & Investigation
* Identify the governing milestone in `plan.md` and read the owning `docs/` file(s).
* Read the relevant code and the matching schema/ADR. Do **NOT** edit code in this phase.

### Step 2: Plan & Wait for Approval
Present, concisely:
1. **Files to create/modify/delete**
2. **Summary of changes**
3. **Which docs/ADR/plan entries must be updated**
4. **Edge cases, migrations, or breaking changes**

Then **STOP** and wait for approval.

### Step 3: Execution & Verification
* Write type-safe, minimal code that matches existing conventions.
* Verify: `pnpm typecheck && pnpm test`; run `pnpm build` when touching UI or packaging.
* Update `plan.md` checkboxes and the owning doc's acceptance criteria.
* Summarize what changed, what was verified, and the logical next step.

### Definition of Done (per milestone)
1. All acceptance criteria in the milestone's doc are satisfied.
2. Edge cases have tests, not manual-only verification.
3. `typecheck`, `test`, `build` are green.
4. `docs/` matches shipped behaviour (aspiration belongs in `plan.md`, never in `docs/`).
5. `docs/README.md` status row updated.

---

## 4. Tech Stack Quick Reference (locked)

| Area | Choice |
|---|---|
| Language / runtime | TypeScript strict, ESM, Node ≥ 20 |
| Backend | Hono + `@hono/node-server`, bound to `127.0.0.1` only |
| Frontend | React 19, Tailwind, shadcn/ui, Lucide; built by Vite + `vite-plugin-singlefile` into one `index.html` |
| Live updates | Server-Sent Events at `/api/events` |
| Watcher | `chokidar` (+ polling fallback; `fsevents` must stay optional) |
| Search | FlexSearch, in-memory, rebuilt from files, never persisted |
| Frontmatter | `yaml` package **Document API** — `js-yaml` is banned |
| Validation | Zod, permissive on read / strict on write |
| IDs | `{prefix}_{26-char ULID}`; prefix ∈ `cnt_ proj_ tsk_ est_ inv_ doc_` |
| Money | integer cents (`*_cents`), tax in basis points (`tax_rate_bps`), round-half-up once |
| Storage | Markdown + YAML frontmatter; `.ob/config.json` committed, `.ob/state/` gitignored |
| Sync | `git add` → `git commit` → `git pull --rebase` → `git push` (commit **before** pull) |
| Default port | `19731`, probing upward, real URL printed |
| Package manager (dev) | **pnpm 12** — `packageManager` field pins it, `pnpm-lock.yaml` is committed |
| Tests | `vitest`; Playwright for the E2E smoke flow |

### 4.1 Code conventions (from the skills)

**TypeScript**
* kebab-case file names; PascalCase types/interfaces; camelCase functions; UPPERCASE env vars.
* `interface` for object shapes; union types + `as const` maps instead of `enum`; `import type` for type-only imports.
* Arrow functions for handlers and middleware; small single-purpose functions; RO-RO (receive an object, return an object).
* Zod at every boundary (HTTP input, `.ob/config.json`, frontmatter) and infer types from the schema — no hand-written duplicates.
* No `any`. If the shape is unknown, model it (`unknown` + a narrowing function).

**Hono**
* Chain route definitions; group with `app.route()`; handlers return `c.json()` / `c.html()`.
* Fail with `HTTPException`; `app.onError` maps to the `{ error: { code, message } }` envelope (docs/07).
* `hono/secure-headers` globally; `@hono/zod-validator` for bodies/queries from M3 on.

**React (M4+)**
* No request waterfalls — `Promise.all` for independent fetches; start fetches early, await late.
* No barrel imports; import from the concrete module.
* No components defined inside components; functional `setState`; derive state during render instead of syncing via effects.
* `useTransition`/deferred values for non-urgent updates; memoize only measured-expensive work.

---

## 5. Non-Negotiable Invariants

Violating any of these is a bug, not a style preference.

**Data**
1. The filesystem is the only source of truth; the index is a rebuildable cache and is never persisted.
2. Frontmatter `id` is identity; the file path is a cache. Renames must never duplicate or orphan a record.
3. Task status is the containing folder (`tasks/todo|doing|done`). Task frontmatter has **no** `status` field.
4. `ob` never silently repairs, merges, reformats, or deletes a user's file. Ambiguity becomes a typed issue with an explicit user action.
5. Only the frontmatter block is rewritten; the body is copied byte-for-byte. Unknown keys, comments, and key order are preserved.
6. Money is integer cents everywhere in storage and computation; rounding happens once, at the tax step.

**IO**
7. Every read/write goes through `src/io/` — no ad-hoc `fs.writeFile` in route handlers or UI code.
8. Writes are atomic (temp file in the same directory + `rename`) and self-write-suppressed in the watcher.
9. All paths from API input or frontmatter are resolved with `resolveInWorkspace`; `..`, absolute paths, and symlink escapes are rejected.

**Server**
10. Bind `127.0.0.1`; validate `Host`; emit no CORS headers; mutating routes require `X-OB-Token`.
11. Errors return `{ error: { code, message, details? } }` with stable codes — never stack traces or paths outside the workspace.

**Git**
12. Commit-on-save stages only the paths `ob` just wrote; `git add -A` belongs to explicit sync only.
13. `ob` never runs destructive git commands on its own (`reset`, `push --force`, `rebase --abort`, `checkout --theirs`). Recovery is always a user click.

**Repo**
14. This repo never holds a working workspace. Only `fixtures/workspaces/*` may contain workspace files; demo data is real files at `fixtures/workspaces/demo/` (copied to `dist/demo` at build), never string literals in `src/`. `tests/repo/hygiene.test.ts` enforces the root-level ban.

---

## 6. Documentation Map

| Change touches | Update |
|---|---|
| CLI flags, pre-flight, lifecycle | `docs/01-cli-and-preflight.md` |
| Init, scaffolding, demo data, lock, port | `docs/02-workspace-init.md` |
| Schemas, ids, money, references | `docs/03-data-model.md` (+ `brief.md` §5.2) |
| Frontmatter read/write | `docs/04-frontmatter-roundtrip.md` |
| Index, issues, external-edit behaviour | `docs/05-indexer-and-external-edits.md` |
| Watcher, atomic IO, path safety | `docs/06-file-watcher-and-io.md` |
| API routes, auth, SSE, error codes | `docs/07-server-api-and-security.md` |
| Views, editors, Kanban, print | `docs/08-web-ui.md` |
| Commit-on-save, sync, recovery | `docs/09-git-sync.md` |
| Search behaviour | `docs/10-search.md` |
| Build, `bin`, publish | `docs/11-packaging.md` |
| Test strategy, fixtures, QA | `docs/12-testing-and-verification.md` |
| A decision reverses | `docs/00-decisions.md` + the owning doc |
| Scope/order changes | `plan.md` + `brief.md` §11 |

---

## 7. Public API Contract (do not rename without an ADR)

`/api/health` · `/api/config` · `/api/issues` · `/api/events` · `/api/:type` · `/api/:type/:id` · `/api/tasks/:id/move` · `/api/invoices/from-estimate/:estimateId` · `/api/git/status|sync|init|remote` · `/api/search`

`type` ∈ `contacts | projects | tasks | estimates | invoices | documents`.

---

## 8. Working Notes

* **Repo state:** M0–M4 landed — CLI, workspace init, data layer (schemas/index/watcher), HTTP API with security, and the React SPA (shell, contacts/projects/documents CRUD, board, billing read views, settings, issue triage). `/api/git/*` and `ob sync` intentionally remain unimplemented until M6. Tooling is pnpm (`pnpm install`, `pnpm <script>`); scripts: `dev`, `build`, `build:client`, `build:server`, `typecheck`, `test`, `test:watch`, `lint`, `format`, `prepublishOnly`. Do not invent scripts that do not exist; if a command is missing, say so.
* **UI stack:** Tailwind v4 (`src/ui/styles.css` with `@theme inline`), shadcn/ui in `src/ui/components/ui` generated from the registry — add with `pnpm dlx shadcn@latest add <component>`, never hand-write a primitive. `@/` maps to `src/ui` in both Vite and TypeScript (`moduleResolution: Bundler`). Tokens are semantic only; no raw colours in components.
* **Demo data:** never add records as code. Edit `fixtures/workspaces/demo/`, then `pnpm build` (postbuild copies it to `dist/demo`). Tests assert the fixture matches what `init --demo` writes.
* **Dependencies:** no new dependency without justification — must be pure-JS (or optional-native), maintained, and consistent with §4. `js-yaml`, `moment`, `express`, `better-sqlite3` are off-limits.
* **Known deferrals (v1):** CSV importer, multi-workspace switching, server-side PDF, email sending, payments, encryption at rest.
* **Ambiguity rule:** if the spec and the request disagree, surface the conflict and propose the fix in one sentence, then wait for approval.
