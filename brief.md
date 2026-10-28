# Product Requirements Document (PRD): `ob` Local-First CRM

**Project Name:** `ob` (OperationBegin Local-First CRM)  
**Package Alias Candidate:** `@operationbegin/crm` or `filecrm`  
**License:** MIT (Open Source)  
**Version:** 1.0.0 (Final Architecture & Functional Spec)  
**Author:** OperationBegin Engineering  

---

## 1. Executive Summary & Vision

`ob` is an offline-first, file-and-folder-based Customer Relationship Management (CRM) platform designed for developers, technical freelancers, and lean agencies. It combines the speed, privacy, and durability of local plain-text Markdown files (`.md` with YAML frontmatter) with an intuitive, web-based UI served directly from a lightweight local server.

`ob` eliminates cloud lock-in, proprietary database engines, and subscription overhead by making your local file system and Git repository the single source of truth.

---

## 2. Core Pillars & Design Principles

1. **Zero Lock-In & Total Data Ownership:** All data exists on disk as standard Markdown files. You can read, write, script, or edit your data using VS Code, Obsidian, Neovim, or standard shell tools.
2. **Instant & Lightweight (`npx` First):** No heavy native installations required. The app executes instantly in any terminal via `npx` with zero setup hassle.
3. **Sub-100ms Startup & Instant Shutdown:** Powered by Hono on Node.js, the local backend process starts instantly, consumes minimal memory, and cleans up cleanly on `SIGINT` / `SIGTERM`.
4. **Git Native Sync:** Version control, backups, and multi-device synchronization are handled via standard `git` and `gh` workflows, triggered with a single click in the Web UI.
5. **Pre-flight Diagnostics:** Automatic checks verify that required system binaries (`git`, `gh`) and configurations (`git config user.name`, `user.email`) are present before launching.

---

## 3. Onboarding & CLI Pre-flight Workflow

### 3.1 Pre-flight Dependency Diagnostics
When executing `npx @operationbegin/crm .` or `ob .`, the engine immediately runs pre-flight diagnostic checks:

```text
[✓] Node.js runtime environment verified
[✓] Git CLI detected (v2.39+)
[✓] Git user identity configured (John Doe <john@example.com>)
[!] gh CLI not detected (Optional: required for automatic GitHub repo creation)
```

If critical dependencies (like `git`) are missing or unconfigured (`git config user.name`), `ob` halts with actionable setup commands.

### 3.2 Interactive Workspace Initialization Prompt
If the target folder lacks an `.ob/` configuration directory, `ob` initiates an interactive terminal wizard:

```text
 Welcome to OperationBegin (ob) — Local-First CRM

 Workspace path: /Users/dev/my-crm

 No initialized workspace found. Select setup option:
   ❯ 1) Initialize with Demo Workspace (Recommended - populated sample data)
     2) Initialize Empty Workspace (Folders & default configuration only)
     3) Exit
```

#### Initialization Actions:
* **Option 1 (Demo Workspace):** Creates standard folder structures and seeds realistic sample Markdown files (contacts, projects, tasks, estimates, invoices, documents). Initializes a Git repository (`git init`) if one does not exist.
* **Option 2 (Empty Workspace):** Sets up standard folders, default `.ob/config.json`, and root `.gitignore`.
* **Auto-Launch:** Automatically starts the Hono server on an ephemeral port (e.g., `http://localhost:4321`) and opens the default web browser.

---

## 4. System & Tech Stack Architecture

```text
┌────────────────────────────────────────────────────────┐
│                      LOCAL SYSTEM                      │
│                                                        │
│  ┌──────────────────────┐    HTTP / WS   ┌──────────┐  │
│  │ Embedded Single-File │ ◄────────────► │ Hono     │  │
│  │ React + Tailwind UI  │                │ Backend  │  │
│  └──────────────────────┘                └────┬─────┘  │
│                                               │        │
│                                        chokidar / fs   │
│                                               │        │
│  ┌────────────────────────────────────────────▼──────┐ │
│  │             File System Workspace (.md)           │ │
│  │  contacts/  projects/  tasks/  invoices/  .ob/    │ │
│  └───────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### 4.1 Tech Stack Lock-In
* **Frontend:** React, Tailwind CSS, shadcn/ui components, Lucide Icons.
* **Frontend Bundler:** Vite with `vite-plugin-singlefile` (compiles entire SPA into a single embedded `index.html` file shipped inside the npm package).
* **Backend Runtime:** Node.js (v18+) with **Hono** framework for sub-100ms cold starts and minimal overhead.
* **File Watcher:** `chokidar` for real-time file-system event detection and UI reactivity over Server-Sent Events (SSE) or WebSockets.
* **In-Memory Search & Index Engine:** Pure JavaScript in-memory indexer (e.g., FlexSearch / JS Map cache). Guarantees **zero native C++ compilation steps** during `npx` execution across macOS, Linux, and Windows.

---

## 5. Directory & Schema Mappings

The workspace translates relational database models into human-readable directory structures and YAML frontmatter.

```text
my-crm/
├── .ob/
│   └── config.json            # Business defaults (tax rates, currency, user details)
├── documents/
│   ├── default-terms.md        # Master service agreements and terms templates
│   └── proposal-template.md
├── contacts/
│   ├── cnt_acme-corp.md
│   └── cnt_jane-doe.md
├── projects/
│   └── proj_website-redesign.md
├── tasks/
│   ├── todo/
│   │   └── task_homepage-hero.md
│   ├── doing/
│   │   └── task_api-integration.md
│   └── done/
│       └── task_wireframes.md
├── estimates/
│   └── est_2026-001.md
├── invoices/
│   └── inv_2026-001.md
└── .gitignore
```

### 5.1 Business Configuration (`.ob/config.json`)
Stores global workspace defaults (previously stored in database user profiles):

```json
{
  "version": "1.0.0",
  "business": {
    "name": "Acme Digital Studio",
    "email": "hello@acmedigital.com",
    "address": "123 Tech Lane, San Francisco, CA",
    "phone": "+1 555-0199",
    "tax_rate": 8.5,
    "currency": "USD",
    "payment_link_url": "https://stripe.com/pay/acme"
  },
  "default_terms_document": "documents/default-terms.md"
}
```

---

### 5.2 Record Schemas (YAML Frontmatter + Markdown Body)

Every record uses a unique, immutable `id` (ULID) in frontmatter to guarantee reference stability even when files are renamed manually in text editors.

#### Contact Record (`contacts/cnt_jane-doe.md`)
```markdown
---
id: cnt_01J8X71000
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

#### Project Record (`projects/proj_website-redesign.md`)
```markdown
---
id: proj_01J8X72000
type: project
project_name: Website Redesign
client_id: cnt_01J8X71000
status: active  # active | completed | archived
created_at: 2026-10-28T10:00:00Z
updated_at: 2026-10-28T10:00:00Z
---

## Project Description
Redesign corporate landing page and integrate blog with Next.js.
```

#### Task Record (`tasks/todo/task_homepage-hero.md`)
Tasks are organized in file-system Kanban sub-folders: `tasks/todo/`, `tasks/doing/`, `tasks/done/`. Moving a card on the Web UI Kanban board moves the file between folders.

```markdown
---
id: tsk_01J8X73000
type: task
title: Build Homepage Hero Component
project_id: proj_01J8X72000
status: todo  # todo | doing | done
order: 1
due_date: 2026-11-05T00:00:00Z
created_at: 2026-10-28T10:30:00Z
updated_at: 2026-10-28T10:30:00Z
---

Task specifics and sub-item checklists go here.
```

#### Invoice Record (`invoices/inv_2026-001.md`)
Line items are embedded directly inside the YAML frontmatter array for self-contained portability. Optional reference links point to reusable terms documents.

```markdown
---
id: inv_01J8X74000
type: invoice
invoice_number: INV-2026-001
client_id: cnt_01J8X71000
project_id: proj_01J8X72000
estimate_id: est_01J8X70000
title: Initial Project Deposit
status: draft  # draft | sent | paid | overdue | cancelled
issue_date: 2026-10-28
due_date: 2026-11-15
currency: USD
terms_document: "documents/default-terms.md"
subtotal_amount: 2500.00
tax_rate: 8.5
tax_amount: 212.50
total_amount: 2712.50
line_items:
  - description: "50% upfront deposit for Website Redesign"
    quantity: 1
    unit_price: 2500.00
    total: 2500.00
created_at: 2026-10-28T11:00:00Z
updated_at: 2026-10-28T11:00:00Z
---

## Notes
Payment due within 15 days of issue date.
```

---

## 6. Git Synchronization & Unsynced State Protection

### 6.1 Manual Sync Lifecycle
1. Editing records in the Web UI writes changes directly to disk files. It does **not** create individual Git commits automatically.
2. The UI header displays an **Unsynced Changes** badge driven by `git status --porcelain` execution on the Hono backend.
3. Clicking the **Sync** button in the Web UI triggers a sequential subprocess chain:
   * `git pull --rebase`
   * `git add .`
   * `git commit -m "ob auto-sync: YYYY-MM-DD HH:mm:ss"`
   * `git push`

### 6.2 Browser Tab Protection (`beforeunload`)
To prevent accidental data loss:
* If the user attempts to close the browser tab or navigate away while `git status --porcelain` detects uncommitted or unsynced local file changes, the Web UI triggers a native browser alert modal (*"You have unsynced CRM changes. Are you sure you want to leave?"*).

---

## 7. Package Distribution & Execution

### 7.1 Package Naming Strategy
* **Primary npm Package:** `@operationbegin/crm` or `filecrm`
* **Zero-Installation Command:** `npx @operationbegin/crm .` or `npx filecrm .`
* **Global Alias Install:** `npm install -g @operationbegin/crm` (registers the local `ob` command alias in the system PATH).

---

## 8. Development Roadmap

1. **Phase 1:** Hono server setup, file watcher integration, and CLI initialization prompt (`ob init --demo`).
2. **Phase 2:** Pure-JS in-memory graph indexer, Zod schema validation, and CRUD file system API endpoints.
3. **Phase 3:** Embedded React + Tailwind Web UI, Kanban task boards, and Invoice generator.
4. **Phase 4:** Git sub-process sync engine, `beforeunload` unsynced state protection, and CSV importer.