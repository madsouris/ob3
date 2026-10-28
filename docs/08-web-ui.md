# 08 — Web UI

Milestone: **M4** (shell/CRUD) · **M5** (boards/money/print) · Spec: `brief.md` §9 · Code: `src/ui/`

## Purpose

A single-file SPA that is a *view* of the filesystem, never a second source of truth. Every capability in the UI maps to a file operation the user could have done by hand.

## Build

* Vite + React 19 + TypeScript, Tailwind, shadcn/ui, Lucide icons.
* `vite-plugin-singlefile` inlines JS and CSS into `dist/client/index.html`; the server injects `__OB_TOKEN__` at request time.
* No router package: a ~40-line hash router (`#/projects/:id`, `#/invoices/:id/print`) is enough for the flat route set, keeps deep links working on a hard reload, and keeps route → id mapping explicit (ids are stable across renames).
* All formatting is client-side; the server never returns HTML fragments.

## Shell

```
┌───────────────────────────────────────────────────────────────┐
│ ob · Acme Digital Studio      [Needs attention ●2]  [Unsynced] │
├──────────┬────────────────────────────────────────────────────┤
│ Dashboard│                                                    │
│ Contacts │                                                    │
│ Projects │                    view                            │
│ All tasks│                                                    │
│ Estimates│                                                    │
│ Invoices │                                                    │
│ Documents│                                                    │
│ ⚙ Settings│                                                   │
└──────────┴────────────────────────────────────────────────────┘
```

* Header: workspace name and record count, `⌘K` palette, theme toggle. The sync badge arrives with M6.
* Sidebar collapses under 900 px into a sheet; below 768 px the board's three columns stack vertically instead of scrolling sideways.
* `⌘K` palette: navigate and ranked search. "Create" and "run sync" actions are planned; today creation lives on each view.

## Views

| View | Contents | Key interactions |
|---|---|---|
| Dashboard | Counts, open tasks by column, unpaid invoices total, recent activity, issue banner | Click-through to filtered lists |
| Contacts | Table + side detail; search, status filter | Inline edit, create, archive |
| Projects | Table; linked client; task count | Pick a project → its board; create; edit |
| Project workspace (`/projects/:id`) | Header, client, status, task counts, project body, that project's board | Add/edit task, drag or "Move to…", edit project |
| All tasks (`/tasks`) | Cross-project board with the project name on each card | Drag or "Move to…", open task |
| Estimates | Table; status; total | Edit line items, duplicate, convert to invoice, print |
| Invoices | Table; derived `overdue` badge | Edit, duplicate, print, mark sent/paid |
| Print (`/invoices/:id/print`, `/estimates/:id/print`) | A4 sheet: business header, billing details, lines, totals, notes, terms | Browser print / Save as PDF |
| Documents | List of terms/proposals/notes | Markdown editor + preview |
| Settings | Business profile, currency, `tax_rate_bps`, default terms, `commit_on_save` | Save → PATCH `/api/config` |
| Needs attention | Issue list with file preview and resolve actions | Explicit resolve only |

## Data layer

```ts
useWorkspace() -> { records, issues, config, generation, loading, error, refresh, upsert, remove }
```

* `WorkspaceProvider` loads `GET /api/{type}` for each type in parallel, plus `/api/issues` and `/api/config`, and subscribes to `/api/events`.
* SSE events at or below the rendered `generation` are dropped (doc 05 §Concurrency); events above it are applied through `upsert`/`remove`.
* Every mutation sends `baseHash`; a `409` keeps the typed values. Contacts render an inline "This file changed on disk" banner with *Reload from disk*; other sheets report the conflict in a toast.
* Writes are pessimistic: the sheet keeps the form until the server confirms, then `upsert` replaces the row. A failure keeps the typed text and shows the server's message in a toast.

## Editors

* **Forms** (contacts, projects, tasks, billing, settings): a sheet with explicit Save/Cancel; `Esc` or Cancel discards, and a failed save keeps the typed values with the server's message in a toast.
* **Markdown** (document body, task notes, invoice notes): plain textarea — no rich-text editor and no preview pane. The file on disk is the artifact.
* **Line items** (estimate/invoice): rows with description/qty/unit price; totals recompute live using the same cents helpers as the server (shared module, single implementation).
* **Conflict banner (contacts):** "This file changed on disk" → *Reload from disk* (discard local edits) or save again to overwrite. Never auto-merges.
* **Degraded records** are not given a separate read-only view yet; they surface in *Needs attention*, where the raw file can be previewed before an explicit resolve.

## Kanban

* Board scope: `/projects/:id` renders only that project's tasks; `/tasks` renders every task with the project name on each card. Both use the same `TaskBoard`.
* Column source: `tasks/todo`, `tasks/doing`, `tasks/done` — the folder, not a field.
* Drag and drop: dropping on a card inserts the dragged card before it (`beforeId`), dropping on a column appends. Either way it is one `POST /api/tasks/:id/move`; no optimistic file writes.
* Keyboard path: every card has a "Move to…" menu, so drag is never the only way to change a column. Free reordering inside a column is drag-only today.
* The board re-renders when `record.upsert` replaces the task: the move response does it for local drags, and the watcher does it for external file moves (`record.moved` is published for other clients but the provider applies the accompanying upsert).

## Money rendering

* `Intl.NumberFormat(currency, { minimumFractionDigits: 2 })`; input fields accept `2 500`, `2500.50`, `$2500` and convert to cents on blur via `parseMoney`.
* Rounding in the display layer only; the file always holds integers. `computeTotals` in `src/ui/components/line-items.tsx` mirrors the server: line totals round individually, tax rounds once.
* Numbering and duplication follow doc 03 §Numbering; the editor's "Duplicate" button calls `POST /api/:type/:id/duplicate` and navigates to the copy.
* "Create invoice" on an estimate calls `POST /api/invoices/from-estimate/:id` and navigates to the invoice; the estimate then shows a link back.

## Print view

* Routes `/invoices/:id/print` and `/estimates/:id/print` render outside the app shell (`PrintDocument`), so there is no sidebar or header to hide.
* `@page { size: A4; margin: 16mm }`; the screen shows a paper sheet with a toolbar marked `.no-print` that the print media query removes.
* **Light-only:** the sheet uses literal paper/ink values (`.print-sheet`, `.print-ink` …), never theme tokens, so printing from dark mode is identical. `print-color-adjust: exact` keeps the hairlines.
* Contents: business block from `.ob/config.json`, document number/dates, billed-to and project, line table, subtotal/tax/total, notes body, and the linked `terms_document` body. No signature block and no server-side PDF — the browser's print dialog produces the PDF (AD-15).
* `break-inside: avoid` on table rows, parties and totals keeps a short document on one page; a long line-item list flows onto page 2 by design.

## Tab protection (M6)

Not shipped yet: `beforeunload` is gated on real `git` state, which arrives with commit-on-save in M6.

```ts
if (dirty || unpushed) e.preventDefault(); e.returnValue = ''
```

* Registered only while `dirty || unpushed`, removed while `syncing`, re-registered after.
* Because saves are committed (doc 09), this fires for a real reason: uncommitted external edits, or commits not yet pushed.
* A short toast on first load explains the rule: "Saves are committed locally. The badge turns amber when you have unpushed changes."

## Accessibility & polish bar

* Every interactive element reachable by keyboard; visible focus ring; no drag-only actions.
* Labels bound to inputs; error text linked via `aria-describedby`.
* `prefers-reduced-motion` disables board/dialog animations.
* Color is never the only signal (status = icon + text + color).
* Empty states explain the *next action*, not just "no data".

## Acceptance criteria

- [x] Editing a contact in the UI appears in VS Code within ~300 ms, and vice versa (watcher → index → SSE → refetch; runtime tests cover the pipeline).
- [x] Dragging a card between columns moves exactly one file (drag calls the same `move` route as the menu; API tests assert one file, both folder states and `order`).
- [x] A `409` conflict never loses the user's typed text (the banner keeps the form and offers Reload).
- [x] Deleting the record behind an open detail view closes the editor instead of writing to a missing file.
- [ ] Print preview of a 3-line invoice fits one page at A4 — the sheet is A4 with 16 mm margins and totals/rows are unbreakable; final one-page fit depends on content length and needs a manual print check per document.
- [ ] Full keyboard traversal of contacts CRUD with no mouse. *(pending an a11y audit)*
