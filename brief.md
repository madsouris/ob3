# Product Requirements Document (PRD): `ob` Local-First CRM

**Project Name:** `ob` (OperationBegin Local-First CRM)
**Package Alias Candidate:** `@operationbegin/crm` or `filecrm`
**License:** MIT (Open Source)
**Version:** 1.1.0 (Implementation-Ready Spec — supersedes 1.0.0)
**Author:** OperationBegin Engineering

---

## 0. Changes from v1.0.0

| # | Area | v1.0.0 | v1.1.0 (locked) |
|---|------|--------|-----------------|
| 1 | Sync order | `pull` → `add` → `commit` → `push` | `add` → `commit` → `pull --rebase` → `push` |
| 2 | Saving | Manual sync only | **Commit-on-save** (path-scoped, debounced) + manual Sync |
| 3 | Task status | Folder **and** frontmatter `status` | **Folder only**; `status` removed from task frontmatter |
| 4 | Frontmatter rewrite | Not specified | `yaml` Document API — unknown keys/comments preserved |
| 5 | IDs | "ULID" but samples are 11 chars | `{prefix}_{26-char Crockford ULID}` |
| 6 | Money | Floats (`2500.00`) | Integer **cents** + `tax_rate_bps` |
| 7 | Server security | Not specified | Loopback bind, per-session token, Host/Origin checks |
| 8 | File IO | Not specified | Atomic write + self-write echo suppression + workspace lock |
| 9 | Port | "ephemeral, e.g. 4321" | Default **19731**, probe fallback, actual URL printed |
| 10 | Language | "pure JS indexer" | **TypeScript** end-to-end |
| 11 | External edits | Not specified | Identity = frontmatter `id`; path is a cache; issues surface instead of crashes |
| 12 | `beforeunload` | Warn whenever tree is dirty | Warn only when **dirty or unpushed** (i.e. real unsaved/unpushed work) |

Per-feature documentation lives in [`docs/`](./docs/README.md). Delivery tracking lives in [`plan.md`](./plan.md).

---

## 1. Executive Summary & Vision

`ob` is an offline-first, file-and-folder-based Customer Relationship Management (CRM) platform designed for developers, technical freelancers, and lean agencies. It combines the speed, privacy, and durability of local plain-text Markdown files (`.md` with YAML frontmatter) with an intuitive, web-based UI served directly from a lightweight local server.

`ob` eliminates cloud lock-in, proprietary database engines, and subscription overhead by making your local file system and Git repository the single source of truth.

---

## 2. Core Pillars & Design Principles

1. **Zero Lock-In & Total Data Ownership:** All data exists on disk as standard Markdown files. You can read, write, script, or edit your data using VS Code, Obsidian, Neovim, or standard shell tools.
2. **Files Are The Only Truth:** There is no sidecar database. The in-memory index is a rebuildable cache. Killing the process, editing a file externally, or `git checkout`-ing a branch never corrupts data.
3. **Instant & Lightweight (`npx` First):** No heavy native installations. The app executes instantly via `npx` with zero setup hassle.
4. **Sub-100ms Startup & Instant Shutdown:** Hono on Node.js starts instantly, uses minimal memory, and releases the workspace lock cleanly on `SIGINT` / `SIGTERM`.
5. **Git Native Sync:** Version control, backups, and multi-device sync use standard `git` (and optionally `gh`) workflows, triggered from the Web UI.
6. **Pre-flight Diagnostics:** Automatic checks verify required binaries (`git`, `gh`) and config (`git config user.name`, `user.email`) before launching.
7. **Never Surprise The User:** `ob` never silently deletes, merges, reforms, or "repairs" a file. Anything ambiguous is surfaced as an issue with an explicit user action.

---

## 3. Onboarding & CLI Pre-flight Workflow

### 3.1 Dependency Diagnostics

When executing `npx @operationbegin/crm .` or `ob .`, the engine runs pre-flight checks before anything else:

```text
[✓] Node.js runtime environment verified (v20.11.0)
[✓] Git CLI detected (v2.39+)
[✓] Git user identity configured (John Doe <john@example.com>)
[!] gh CLI not detected (Optional: required for automatic GitHub repo creation)
```

Missing `node` or `git`, or an unset `git config user.name` / `user.email`, **halts** with copy-pasteable fix commands and a non-zero exit code. `gh` is optional and only downgrades the "create GitHub repo" affordance.

### 3.2 Interactive Workspace Initialization Prompt

If the target folder lacks an `.ob/` configuration directory, `ob` starts an interactive wizard:

```text
 Welcome to OperationBegin (ob) — Local-First CRM

 Workspace path: /Users/dev/my-crm

 No initialized workspace found. Select setup option:
   ❯ 1) Initialize with Demo Workspace (Recommended - populated sample data)
     2) Initialize Empty Workspace (Folders & default configuration only)
     3) Exit
```

Non-interactive equivalents: `ob init --demo`, `ob init --empty`.

#### Initialization Actions

* **Option 1 (Demo):** Creates the folder structure and seeds realistic sample records (contacts, projects, tasks, estimates, invoices, documents) and initializes a Git repository (`git init`) if absent.
* **Option 2 (Empty):** Creates folders, `.ob/config.json`, `.gitignore`, and (unless `--no-git`) `git init`.
* **Auto-Launch:** Starts the Hono server on port `19731` (probing upward if occupied) and opens the default browser at the bound URL.

```text
 ✓ Workspace initialized
 ✓ Server listening on http://127.0.0.1:19731
 → Opening browser… (press Ctrl+C to stop)
```

---

## 4. System & Tech Stack Architecture

```text
┌────────────────────────────────────────────────────────┐
│                      LOCAL SYSTEM                      │
│                                                        │
│  ┌──────────────────────┐    HTTP / SSE   ┌──────────┐ │
│  │ Embedded Single-File │ ◄─────────────► │ Hono     │ │
│  │ React + Tailwind UI  │                 │ Backend  │ │
│  └──────────────────────┘                 └────┬─────┘ │
│                                               │        │
│                                        chokidar / fs   │
│                                               │        │
│  ┌────────────────────────────────────────────▼──────┐ │
│  │             File System Workspace (.md)           │ │
│  │  contacts/ projects/ tasks/ invoices/ .ob/        │ │
│  └───────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### 4.1 Tech Stack Lock-In

* **Language:** TypeScript (strict), ESM, Node.js **20+**.
* **Frontend:** React 19, Tailwind CSS, shadcn/ui components, Lucide Icons.
* **Frontend Bundler:** Vite + `vite-plugin-singlefile` — the entire SPA is inlined into one `dist/index.html` shipped inside the npm package.
* **Backend Runtime:** Hono on Node.js (`@hono/node-server`), sub-100ms cold start.
* **File Watcher:** `chokidar` (note: `fsevents` is an *optional* native dependency on macOS; the pure-JS polling/`fs.watch` fallback is always available, so `npx` never requires a compiler).
* **Index / Search:** Pure TypeScript in-memory `Map` + FlexSearch. Zero mandatory native bindings.
* **Frontmatter:** `yaml` package, **Document API** (preserves comments, key order, and unknown keys).
* **Validation:** Zod schemas per record `type`.
* **IDs:** `{prefix}_{26-char Crockford Base32 ULID}` (e.g. `cnt_01J8X71000Q4M2N8V3R5T7W9Y0Z`).
* **Dev/Test:** `tsx` for local runs, `vitest` for unit/integration, Playwright for the E2E smoke flow.

---

## 5. Directory & Schema Mappings

The workspace translates relational models into human-readable directories and YAML frontmatter.

```text
my-crm/
├── .ob/
│   ├── config.json            # Business defaults (tax rates, currency, user details) — COMMITTED
│   └── state/                 # Runtime state — GITIGNORED
│       ├── session.json       # Per-run auth token + bound port (0600)
│       └── server.lock        # PID lock: one server per workspace
├── documents/
│   ├── doc_default-terms.md
│   └── doc_proposal-template.md
├── contacts/
│   ├── cnt_acme-corp.md
│   └── cnt_jane-doe.md
├── projects/
│   └── proj_website-redesign.md
├── tasks/
│   ├── todo/
│   │   └── tsk_homepage-hero.md
│   ├── doing/
│   │   └── tsk_api-integration.md
│   └── done/
│       └── tsk_wireframes.md
├── estimates/
│   └── est_2026-001.md
├── invoices/
│   └── inv_2026-001.md
└── .gitignore
```

**`.gitignore` (generated):**

```gitignore
.ob/state/
.DS_Store
```

`.ob/config.json` and all record files are intentionally **committed** — they are the product data.

### 5.1 Business Configuration (`.ob/config.json`)

```json
{
  "version": "1.1.0",
  "business": {
    "name": "Acme Digital Studio",
    "email": "hello@acmedigital.com",
    "address": "123 Tech Lane, San Francisco, CA",
    "phone": "+1 555-0199",
    "tax_rate_bps": 850,
    "currency": "USD",
    "payment_link_url": "https://stripe.com/pay/acme"
  },
  "default_terms_document": "documents/doc_default-terms.md",
  "server": { "port": 19731 },
  "git": { "commit_on_save": true }
}
```

`tax_rate_bps` is in **basis points** (850 = 8.50%). `server.port` is a *preference*; the effective port is written to `.ob/state/session.json`. `git.commit_on_save` opts out of the default auto-commit-on-save behaviour (see §8.1).

---

### 5.2 Record Schemas (YAML Frontmatter + Markdown Body)

**Global frontmatter rules**

* `id` — `{prefix}_{26-char ULID}`. **Immutable.** Identity of the record; the filename is only a hint.
* `type` — `contact | project | task | estimate | invoice | document`.
* `ob_schema` — integer schema generation, currently `1`. Absent is treated as `1`.
* `created_at` / `updated_at` — ISO-8601 UTC with `Z`. `created_at` is written once and never changed by `ob`.
* Unknown keys are **preserved verbatim** on write (see `docs/04-frontmatter-roundtrip.md`).
* Filenames are slugs derived at creation (`{prefix}_{slug}.md`); manual renames are legal and handled by the indexer.

#### Money & Tax (normative)

* All monetary amounts are stored as **integer cents** in fields suffixed `_cents` (e.g. `total_cents: 271250` = `$2,712.50`).
* No floats are ever stored for money. No currency symbols in data.
* `tax_rate_bps` is an integer in basis points (1% = 100 bps).
* Computation, with round-half-up applied **once** at the tax step:

```text
tax_amount_cents = round_half_up(subtotal_cents * tax_rate_bps / 10000)
total_cents      = subtotal_cents + tax_amount_cents
```

* `quantity` is a number (allows `0.5` day or `2.5` hours). Line totals:

```text
line.total_cents = round_half_up(line.quantity * line.unit_price_cents)
```

* Line total is authoritative when present; `subtotal_cents` must equal the sum of line totals, and the UI recomputes it. If a hand-edited file disagrees, the UI shows the file value plus a non-blocking "recalculate" action — it never rewrites silently.

#### Contact (`contacts/cnt_jane-doe.md`)

```markdown
---
ob_schema: 1
id: cnt_01J8X71000Q4M2N8V3R5T7W9Y0Z
type: contact
first_name: Jane
last_name: Doe
email: jane@acme.com
company: Acme Corp
job_role: VP of Product
phone_number: "+15550199"
website: "https://acme.com"
primary_link: "https://linkedin.com/in/janedoe"
status: lead  # lead | active | inactive | archived
created_at: 2026-10-28T09:00:00Z
updated_at: 2026-10-28T09:00:00Z
---

# General Notes
Met at the Tech Expo. Interested in a complete frontend overhaul.
```

#### Project (`projects/proj_website-redesign.md`)

```markdown
---
ob_schema: 1
id: proj_01J8X72000Q4M2N8V3R5T7W9Y0Z
type: project
project_name: Website Redesign
client_id: cnt_01J8X71000Q4M2N8V3R5T7W9Y0Z
status: active  # active | completed | archived
created_at: 2026-10-28T10:00:00Z
updated_at: 2026-10-28T10:00:00Z
---

## Project Description
Redesign corporate landing page and integrate blog with Next.js.
```

#### Task (`tasks/todo/tsk_homepage-hero.md`)

Tasks are a **filesystem Kanban**: `tasks/todo/`, `tasks/doing/`, `tasks/done/`. The `status` field is **removed** from frontmatter — the containing folder *is* the status. Moving a card moves the file. A hand-moved file instantly re-renders in the new column.

```markdown
---
ob_schema: 1
id: tsk_01J8X73000Q4M2N8V3R5T7W9Y0Z
type: task
title: Build Homepage Hero Component
project_id: proj_01J8X72000Q4M2N8V3R5T7W9Y0Z
order: 1
due_date: 2026-11-05T00:00:00Z
created_at: 2026-10-28T10:30:00Z
updated_at: 2026-10-28T10:30:00Z
---

Task specifics and sub-item checklists go here.

- [ ] Responsive breakpoints
- [ ] Reduced-motion fallback
```

* `order` is a per-column integer used for manual sorting; ties break on `order`, then `created_at`.
* A task file found outside `tasks/{todo,doing,done}/` (e.g. `tasks/tsk_x.md`) is **not deleted**: it is indexed as an issue with reason `orphan-task-path` and shown in a "Needs attention" tray.

#### Estimate (`estimates/est_2026-001.md`)

```markdown
---
ob_schema: 1
id: est_01J8X70000Q4M2N8V3R5T7W9Y0Z
type: estimate
estimate_number: EST-2026-001
client_id: cnt_01J8X71000Q4M2N8V3R5T7W9Y0Z
project_id: proj_01J8X72000Q4M2N8V3R5T7W9Y0Z
title: Website Redesign — Proposal
status: draft  # draft | sent | accepted | declined | expired
issue_date: 2026-10-28
valid_until: 2026-11-27
currency: USD
terms_document: "documents/doc_default-terms.md"
subtotal_cents: 250000
tax_rate_bps: 850
tax_amount_cents: 21250
total_cents: 271250
line_items:
  - description: "Discovery & UX research"
    quantity: 1
    unit_price_cents: 150000
    total_cents: 150000
  - description: "Hi-fi design system"
    quantity: 2
    unit_price_cents: 50000
    total_cents: 100000
converted_invoice_id: null
created_at: 2026-10-28T10:45:00Z
updated_at: 2026-10-28T10:45:00Z
---

## Scope
Three-week engagement, two revision rounds.
```

#### Invoice (`invoices/inv_2026-001.md`)

Line items are embedded in frontmatter for self-contained portability; `terms_document` optionally links a reusable document.

```markdown
---
ob_schema: 1
id: inv_01J8X74000Q4M2N8V3R5T7W9Y0Z
type: invoice
invoice_number: INV-2026-001
client_id: cnt_01J8X71000Q4M2N8V3R5T7W9Y0Z
project_id: proj_01J8X72000Q4M2N8V3R5T7W9Y0Z
estimate_id: est_01J8X70000Q4M2N8V3R5T7W9Y0Z
title: Initial Project Deposit
status: draft  # draft | sent | paid | overdue | cancelled
issue_date: 2026-10-28
due_date: 2026-11-15
currency: USD
terms_document: "documents/doc_default-terms.md"
subtotal_cents: 250000
tax_rate_bps: 850
tax_amount_cents: 21250
total_cents: 271250
line_items:
  - description: "50% upfront deposit for Website Redesign"
    quantity: 1
    unit_price_cents: 250000
    total_cents: 250000
created_at: 2026-10-28T11:00:00Z
updated_at: 2026-10-28T11:00:00Z
---

## Notes
Payment due within 15 days of issue date.
```

#### Document (`documents/doc_default-terms.md`)

```markdown
---
ob_schema: 1
id: doc_01J8X75000Q4M2N8V3R5T7W9Y0Z
type: document
title: Default Service Terms
kind: terms  # terms | proposal | note
created_at: 2026-10-28T09:00:00Z
updated_at: 2026-10-28T09:00:00Z
---

Payment is due within 15 days of invoice issuance…
```

#### Referential integrity

`client_id`, `project_id`, `estimate_id`, `terms_document`, and `converted_invoice_id` are **soft** references. A dangling reference never breaks rendering: the UI shows `Unknown <type>` plus the raw id, and the record is reported via `/api/issues` as `dangling-ref`. Cascading deletes never happen.

---

## 6. Data Integrity Under External Edits

Normative detail: [`docs/05-indexer-and-external-edits.md`](./docs/05-indexer-and-external-edits.md).

**Core invariant:** identity is the frontmatter `id`; the file path is a rebuildable cache.

`ob` must stay correct and non-crashing when a user simultaneously has the workspace open in VS Code, Obsidian, or a shell:

| External action | `ob` behaviour |
|---|---|
| Rename a file (id intact) | Slight delay, then the record keeps its identity; URL stays stable; no duplicate |
| Move a task between `todo/doing/done` | Status changes; card appears in the new column; ordering re-normalized |
| Edit the Markdown body | Reflected verbatim; body never reformatted |
| Reorder/rename/remove frontmatter keys | Unknown keys preserved; missing required key → issue, record still indexed with fallbacks |
| Replace the whole file | Re-parsed as a normal upsert by `id` |
| Introduce invalid YAML | File is retried twice over ~500ms (mid-save truncation), then quarantined as `parse-error`; excluded from the index; shown in "Needs attention"; the file is never modified |
| Duplicate `id` in two files | First by canonical path wins the index slot; the second is reported as `duplicate-id`; neither is deleted |
| Delete a file | Removed from index; referencing records show `dangling-ref`; no cascade |
| Add an unknown `.md` | Has `id` + known `type` → indexed. Missing `id` → `missing-id` issue with an explicit "Assign ID" action. Unknown `type` → ignored |
| Non-`.md`, oversized (>2 MB), or symlinked files | Ignored |

**Writing rules**

* Only the frontmatter block is ever rewritten; the body is copied byte-for-byte.
* Writes are atomic: temp file in the same directory + `rename`, preserving the file's existing newline style and trailing newline.
* `ob`-initiated writes are recorded in an echo-suppression set so the watcher does not double-trigger.
* `ob` never "fixes" a file on its own initiative. Issue resolution requires an explicit user click.

---

## 7. Local Server Security Model

Normative detail: [`docs/07-server-api-and-security.md`](./docs/07-server-api-and-security.md).

A local HTTP server is reachable by any web page the user visits, so it is treated as hostile-surface:

* Bind **`127.0.0.1` only** (never `0.0.0.0`).
* Reject requests whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>`.
* Validate `Origin`/`Sec-Fetch-Site` for mutating requests; no CORS headers are emitted (so cross-origin preflights fail).
* A per-run random token (32 bytes hex) is written to `.ob/state/session.json` (mode `0600`, gitignored) and inlined into the served `index.html`. Every mutating request must send `X-OB-Token`.
* Path resolution is confined to the workspace root: reject `..`, absolute paths, and symlink escapes; operate on a canonicalized root.
* Request body limit 1 MB; `documents/` bodies capped separately at 2 MB on read.
* One server per workspace via `.ob/state/server.lock`; stale locks (dead PID) are reclaimed with a warning.

---

## 8. Git Synchronization

Normative detail: [`docs/09-git-sync.md`](./docs/09-git-sync.md).

### 8.1 Commit-on-save (default)

Every successful UI save writes the file, then commits **only the touched paths**:

```text
git add -- <path> [...]
git commit -m "ob: save <type> <id>"
```

* Debounced (≈1200 ms) and coalesced per record, so rapid edits produce one commit.
* External edits are **not** auto-committed — they remain visible as dirty until the next sync, and `git status` in the terminal stays honest.
* If the workspace is not a Git repository, saving still works; `ob` just reports `git: not initialized`.

### 8.2 Manual Sync (UI button / `ob sync`)

Strictly this order:

```text
1. git add -A
2. git commit -m "ob auto-sync: YYYY-MM-DD HH:mm:ss"   (skipped if nothing staged)
3. git pull --rebase
4. git push
```

Every step's stdout/stderr is captured. Failures are surfaced with the raw git message and a recovery action — never auto-resolved:

| Failure | UI |
|---|---|
| No upstream configured | Offer `git push -u origin HEAD` |
| Rebase conflict | Stop; show conflicted paths; offer "abort sync" (`git rebase --abort`); keep index consistent |
| Non-fast-forward push | Offer "pull then push" retry |
| Detached HEAD | Offer `git switch -c <branch>` |
| Auth failure | Show the raw message (no credentials ever stored by `ob`) |

### 8.3 Sync state

* `dirty` = `git status --porcelain` non-empty.
* `unpushed` = commits ahead of upstream (`git rev-list --count @{u}..HEAD`).
* Header badge reflects `dirty` / `unpushed` / `syncing` / `error`.

### 8.4 Tab protection (`beforeunload`)

The native guard fires **only** when `dirty || unpushed`, i.e. when closing the tab could actually lose work (uncommitted external edits, or commits that were never pushed). Because saves are committed immediately, the guard does not nag during normal editing. The guard is disabled while a sync is in flight and re-armed after it settles.

---

## 9. Web UI Behaviour

Normative detail: [`docs/08-web-ui.md`](./docs/08-web-ui.md).

* Single-file SPA served by Hono at `/`; no build step at runtime.
* Views: Dashboard, Contacts, Projects, Tasks (Kanban), Estimates, Invoices, Documents, Settings, "Needs attention".
* Live updates over **SSE** (`/api/events`), with reconnect + exponential backoff. The UI is optimistic locally but always reconciles from the file-derived index.
* An externally-changed record currently open in the editor triggers a non-destructive "This file changed on disk" banner with *Reload* / *Keep mine (overwrite)*.
* Optimistic writes roll back visibly if the server rejects them (validation error or issue).
* Empty states, keyboard navigation, and focus management are first-class; no modal-only workflows.

---

## 10. Package Distribution & Execution

* **Primary npm package:** `@operationbegin/crm` (alias package: `filecrm`).
* **Zero-install:** `npx @operationbegin/crm .` / `npx filecrm .`
* **Global alias:** `npm install -g @operationbegin/crm` registers both `ob` and `filecrm`.
* `bin` entries point at `dist/cli.js` with a `#!/usr/bin/env node` shebang; the SPA ships pre-built so end users never run Vite.
* Published artifacts: `dist/` (compiled server + bundled `index.html`), `docs/`, `README.md`, `LICENSE`. No `src/`, no dev deps.

---

## 11. Roadmap

Milestones are tracked, with exit criteria and checkboxes, in [`plan.md`](./plan.md).

1. **M0 — Repo & Tooling:** TypeScript project, build pipeline, test harness, lint/format.
2. **M1 — CLI & Workspace:** pre-flight diagnostics, init wizard, folder/config scaffolding, lock file, port binding.
3. **M2 — Data Layer:** Zod schemas, frontmatter round-trip, in-memory index, chokidar watcher, atomic writes, issue reporting.
4. **M3 — HTTP API:** Hono routes for all record types, validation, security middleware, SSE stream.
5. **M4 — UI Shell & CRUD:** single-file SPA, navigation, contacts/projects/documents CRUD, live updates.
6. **M5 — Kanban & Money:** task board with file moves, estimates/invoices with cents math and print view.
7. **M6 — Git Sync & Issues:** commit-on-save, sync lifecycle, failure recovery UI, "Needs attention" tray, `beforeunload` guard.
8. **M7 — Packaging & Release:** `npx` smoke test on macOS/Linux/Windows, docs pass, npm publish dry run.
