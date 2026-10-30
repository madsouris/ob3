# 08 — Web UI

Milestone: **M4** (shell/CRUD) · **M5** (boards/money/print) · Spec: `brief.md` (data model) · Code: `src/ui/`

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
│ ob · Acme Digital Studio   [Needs attention ●2]  [main ↑3]  [⌘K] │
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

* Header: workspace name and record count, Git badge, `⌘K` palette, theme toggle (`Shift+D`, ignored while typing in a form control). The badge is a button that opens the Git dialog.
* Sidebar: the business logo (or its monogram fallback) and workspace name sit at the top; the record count, "Files are the database", and the `ob` mark sit at the bottom.
* Sidebar collapses under 900 px into a sheet; below 768 px the board's three columns stack vertically instead of scrolling sideways.
* `⌘K` palette: navigate and ranked search. "Create" and "run sync" actions are planned; today creation lives on each view and sync lives in the Git dialog.

## Views

| View | Contents | Key interactions |
|---|---|---|
| Dashboard | Counts, open tasks by column, outstanding total, paid revenue (total + this month), recent activity, issue banner | Click-through to filtered lists |
| Contacts | Table; click a row → contact page | Create; edit from the contact page |
| Contact page (`/contacts/:id`) | Avatar, name, role/company, status, project/document/billing badges, rendered notes, projects, client documents, billing, primary-link button and contact facts | Edit (sheet), jump to project/document/invoice/estimate |
| Projects | Table; linked client; task count | Pick a project → its board; create; edit |
| Project workspace (`/projects/:id`) | Header, client, status, task counts, project body, that project's board | Add/edit task, drag or "Move to…", edit project |
| All tasks (`/tasks`) | Cross-project board with the project name on each card | Drag or "Move to…", open task |
| Estimates | Table; status; total | Edit line items, duplicate, convert to invoice, print |
| Invoices | Table; derived `overdue` badge | Edit, duplicate, print, mark sent/paid |
| Print (`/invoices/:id/print`, `/estimates/:id/print`) | A4 sheet: business header, billing details, lines, totals, notes, terms | Browser print / Save as PDF |
| Documents | Table with All / Global / Client filters | Create; open the document page |
| Document page (`/documents/:id`) | Rendered template content, kind/scope/client, metadata | Edit (sheet), print |
| Document print (`/documents/:id/print`) | A4 sheet with logo, client block and rendered Markdown | Browser print / Save as PDF |
| Settings | Business profile, logo, payment (link, QR or off), currency, `tax_rate_bps`, `commit_on_save`, CSV import, workspace/system facts | Save → PATCH `/api/config`; logo upload → POST `/api/config/logo`; QR upload → POST `/api/config/qr`; import → POST `/api/import`; facts from GET `/api/health` + `/api/system` |
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

* **Forms** (contacts, projects, tasks, billing, settings): a sheet with explicit Save/Cancel; `Esc` or Cancel discards, and a failed save keeps the typed values with the server's message in a toast. Date fields use the shadcn `Calendar` popover (`DateField`), never the native browser picker.
* **Markdown** (contact/project/task notes, document body, invoice notes): a Write / Preview field. Preview renders GFM Markdown (tables, task lists, strikethrough) with `react-markdown`; raw HTML is never rendered. The textarea remains the source of truth — no rich-text editor, no preview pane state stored anywhere. The document editor adds a collapsed **Variable references** accordion listing every supported placeholder (company and client first), generated from `template.ts` so it cannot drift.
* **Line items** (estimate/invoice): rows with description/qty/unit price; totals recompute live using the same cents helpers as the server (shared module, single implementation).
* **Selects** render labels, never raw tokens: `valueLabel` (`src/ui/lib/labels.ts`) sentence-cases statuses and consults the document-kind map. Radix copies the selected item's text into the closed trigger, so a CSS `capitalize` on the item would show `lead` while the trigger is shut — the label must be the item's children.
* **Conflict banner (contacts):** "This file changed on disk" → *Reload from disk* (discard local edits) or save again to overwrite. Never auto-merges.
* **Degraded records** are not given a separate read-only view yet; they surface in *Needs attention*, where the raw file can be previewed before an explicit resolve.

## Kanban

* Board scope: `/projects/:id` renders only that project's tasks; `/tasks` renders every task with the project name on each card. Both use the same `TaskBoard`.
* Column source: `tasks/todo`, `tasks/doing`, `tasks/done` — the folder, not a field.
* Drag and drop: dropping on a card inserts the dragged card before it (`beforeId`), dropping on a column appends. Either way it is one `POST /api/tasks/:id/move`; no optimistic file writes.
* Keyboard path: every card has a "Move to…" menu covering both column changes and in-column order ("Move up" / "Move down" use `beforeId` / `afterId`), so drag is never the only way to move or reorder a task.
* The board re-renders when `record.upsert` replaces the task: the move response does it for local drags, and the watcher does it for external file moves (`record.moved` is published for other clients but the provider applies the accompanying upsert).

## Money rendering

* `Intl.NumberFormat(currency, { minimumFractionDigits: 2 })`; input fields accept `2 500`, `2500.50`, `$2500` and convert to cents on blur via `parseMoney`.
* Rounding in the display layer only; the file always holds integers. `computeTotals` in `src/ui/components/line-items.tsx` mirrors the server: line totals round individually, tax rounds once.
* Numbering and duplication follow doc 03 §Numbering; the editor's "Duplicate" button calls `POST /api/:type/:id/duplicate` and navigates to the copy.
* Attachments are document **ids** (`document_ids`): a searchable multi-select in the editor, rendered in order after the notes on the A4 sheet with the billing context. Legacy `terms_document` paths are used only when the id list is empty.
* "Create invoice" on an estimate calls `POST /api/invoices/from-estimate/:id` and navigates to the invoice; the estimate then shows a link back.

## Print view

* Routes `/invoices/:id/print` and `/estimates/:id/print` render outside the app shell (`PrintDocument`), so there is no sidebar or header to hide.
* Documents print at `/documents/:id/print` with the same shell: logo, title/date, client block and rendered Markdown (templates resolved first).
* `@page { size: A4; margin: 16mm }`; the screen shows a paper sheet with a toolbar marked `.no-print` that the print media query removes.
* **Light-only:** the sheet uses literal paper/ink values (`.print-sheet`, `.print-ink` …), never theme tokens, so printing from dark mode is identical. `print-color-adjust: exact` keeps the hairlines, and `@media print { html { color-scheme: light } }` stops a dark browser UI from painting a dark canvas behind the sheet.
* The business block uses the uploaded logo when `business.logo` is set, otherwise a typographic monogram (initials, or `ob` for an unnamed business). Logo height is 12 mm; it is committed with the workspace.
* **Payment block:** `business.payment` picks what prints below the attachments — `link` prints `business.payment_link_url`, `qr` prints `.ob/assets/qr.jpg` at 26 mm with “Scan with your banking app to pay.” (plus the link underneath when both are saved), and `""` prints nothing. A QR the browser cannot load falls back to the link instead of a broken image. Invoices, estimates and documents all render it.
* Contents: business block from `.ob/config.json`, document number/dates, billed-to and project, line table, subtotal/tax/total, notes body, and the linked `terms_document` body. No signature block and no server-side PDF — the browser's print dialog produces the PDF (AD-15).
* `break-inside: avoid` on table rows, parties and totals keeps a short document on one page; a long line-item list flows onto page 2 by design, and `.print-table thead { display: table-header-group }` repeats the column header there.

## Payment settings (P8)

* Settings → **Payment** switches the mode with a `ToggleGroup`: **No payment info** / **Payment link** / **QR code**. `business.payment` is `""`, `"link"` or `"qr"`; both values stay on file so switching modes never loses the other.
* The link saves with **Save changes** and must start with `http://` or `https://`. The QR uploads immediately: the browser re-encodes the picked image as JPEG on a white matte (≤ 1024 px, ≤ 512 KB, EXIF stripped) and posts it to `POST /api/config/qr`, which overwrites the single `.ob/assets/qr.jpg` and flips the mode to `qr`.
* Saving `link` with an empty URL, or `qr` with no uploaded image, is rejected with a toast rather than writing a mode that cannot print. Removing the QR also turns the printed block off.
* The form has a dirty-guard: once a field is edited, `config.changed` broadcasts (including the ones an upload triggers) no longer overwrite it, so uploading a QR does not discard unsaved business details.

## Import (P5)

* Settings → **Import** picks a record type, downloads a CSV skeleton from `GET /api/import/skeleton`, and posts the chosen file as text to `POST /api/import`.
* The file is read in the browser (`File.text()`); the card lists the accepted headers for the selected type and enforces nothing else — the server is the validator.
* After a run the card shows "Imported N of M rows" and an `Alert` with `Line N: message` for every skipped row. The workspace is refreshed; SSE `record.upsert` events also arrive per created record.
* The skeleton link is a plain anchor with `download`, so it needs no token and never touches React state.
* Contacts → projects → tasks is the useful order: `client` and `project` references must already exist (docs/14).

## Dashboard money (P6)

* **Revenue** is `status: paid` invoices summed by `total_cents`, bucketed by `issue_date` (UTC month). There is no `paid_at` field, so the month is the issue month — documented, not guessed.
* **Outstanding** is issued but unpaid: `sent`, plus the derived `overdue` state (`sent` past `due_date`). Drafts and cancelled invoices are excluded because neither is owed yet.
* The stats row shows Outstanding as a money card with the open-invoice count in its hint; the Revenue card shows total and current month. Amounts are formatted with `business.currency` using integer cents.
* Settings → Workspace adds server uptime, process memory (RSS + heap), system memory, CPU cores/load and workspace disk from `GET /api/system`. Disk renders "Unavailable" when `statfs` cannot answer; Windows load averages are always 0 and are shown as reported.
* Values are read once when Settings opens; there is no polling and no metric history (no persistent server log viewer, by decision).

## Git (M6)

* Header badge states: `clean` (branch name, muted dot), `dirty` (accent dot, "Uncommitted"), `unpushed` ("N to push"), `syncing` (spinner), `error` (destructive dot).
* Clicking opens the Git dialog: branch/remote/upstream/changed-files/last-commit rows, the last step log, failure output and conflicted paths, plus Sync, Initialize, Abort sync, Set upstream & push, and the remote URL form.
* Status comes from `GET /api/git/status`: polled every 15 s while the tab is visible, on focus, immediately on `git.changed`, and 1 s after any record event (external edits do not touch the git service).
* The dialog never auto-recovers. Abort and set-upstream are separate buttons; a failed sync is shown as data, not as a thrown error.
* Settings → Git holds the `commit_on_save` switch (default on). Remote configuration lives in the dialog.

## Tab protection (M6)

```ts
if (dirty || unpushed) e.preventDefault(); e.returnValue = ''
```

* Registered only while `dirty || unpushed` and not `syncing`, re-armed after settlement.
* Because saves are committed (doc 09), this fires for a real reason: uncommitted external edits, a failed commit, or commits not yet pushed.

## Accessibility & polish bar

* Every interactive element reachable by keyboard; visible focus ring; no drag-only actions (the board's menu covers column changes and in-column order).
* Labels are bound to inputs. Validation failures are announced through the sonner region and keep the typed values; inline field-level errors (`aria-invalid` + `aria-describedby`) are **not** implemented — tracked as post-v1 in `plan.md`.
* Every dialog, sheet and drawer has a title; icon-only buttons carry an `aria-label`; the logo and Markdown images have alt text.
* `prefers-reduced-motion` disables board/dialog animations.
* Color is never the only signal (status = icon + text + color).
* Empty states explain the *next action*, not just "no data".

## Acceptance criteria

- [x] Editing a contact in the UI appears in VS Code within ~300 ms, and vice versa (watcher → index → SSE → refetch; runtime tests cover the pipeline).
- [x] Dragging a card between columns moves exactly one file (drag calls the same `move` route as the menu; API tests assert one file, both folder states and `order`).
- [x] A `409` conflict never loses the user's typed text (the banner keeps the form and offers Reload).
- [x] Deleting the record behind an open detail view closes the editor instead of writing to a missing file.
- [x] A save produces one path-scoped commit after the debounce; an unrelated external edit stays unstaged (integration tests in `tests/git/commit-on-save.test.ts`).
- [x] Contact rows open a read-only contact page with Markdown notes and an Edit sheet; creating a contact stays on the list.
- [x] The contact page counts projects, client-scoped documents and billing separately, lists that client's documents under Projects, and opens the primary link from a button at the top of Details.
- [x] Notes/descriptions/terms render as Markdown on screen and in the A4 print sheet (GFM tables and task lists included).
- [x] Uploading a logo in Settings previews it immediately, stores `.ob/assets/logo.png`, and prints it on invoices/estimates; with no logo, a monogram is used.
- [x] Settings → Payment switches between a link, an uploaded QR (stored once at `.ob/assets/qr.jpg` and overwritten on replace) and off; the selected mode is what prints on invoices, estimates and documents, and an unreadable QR falls back to the saved link.
- [x] Documents list filters All/Global/Client, open a rendered detail page, and print to A4; templates resolve `{{business.*}}`, `{{client.*}}` and `{{today}}` with unknown keys left literal.
- [x] Settings → Import creates contacts, projects and tasks from a CSV skeleton, reports skipped rows with their spreadsheet line, and leaves the UI lists updated without a reload.
- [x] The dashboard shows paid revenue (total and current month by `issue_date`) and outstanding (sent/overdue) as integer-cent sums, and Settings → Workspace shows uptime, memory, CPU and disk from `GET /api/system`.
- [x] Moving a task within its column works from the keyboard ("Move up" / "Move down" in the card menu) and produces one `move` call, not a drag-only path.
- [x] Printing from dark mode produces the same light A4 sheet: literal ink/paper values, `color-scheme: light` in the print media query, and a repeated table header across pages.
- [x] Sync reports its four steps, surfaces a rebase conflict with paths, and recovers through an explicit Abort action (`tests/git/sync.test.ts`).
- [x] The badge reflects real `git status`; `beforeunload` is registered only for `dirty || unpushed` (manual check — no browser automation in the suite).
- [ ] Print preview of a 3-line invoice fits one page at A4 — the sheet is A4 with 16 mm margins and totals/rows are unbreakable; final one-page fit depends on content length and needs a manual print check per document.
- [ ] Full keyboard traversal of contacts CRUD with no mouse. *(pending an a11y audit)*
