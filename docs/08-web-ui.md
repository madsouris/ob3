# 08 — Web UI

Milestone: **M4** (shell/CRUD) · **M5** (Kanban/money) · Spec: `brief.md` §9 · Code: `src/ui/`

## Purpose

A single-file SPA that is a *view* of the filesystem, never a second source of truth. Every capability in the UI maps to a file operation the user could have done by hand.

## Build

* Vite + React 19 + TypeScript, Tailwind, shadcn/ui, Lucide icons.
* `vite-plugin-singlefile` inlines JS and CSS into `dist/client/index.html`; the server injects `__OB_TOKEN__` at request time.
* No router package: a ~60-line hash-less history router is enough for the flat route set, and it keeps route → id mapping explicit (`/tasks/:id`, ids are stable across renames).
* All formatting is client-side; the server never returns HTML fragments.

## Shell

```
┌───────────────────────────────────────────────────────────────┐
│ ob · Acme Digital Studio      [Needs attention ●2]  [Unsynced] │
├──────────┬────────────────────────────────────────────────────┤
│ Dashboard│                                                    │
│ Contacts │                                                    │
│ Projects │                    view                            │
│ Tasks    │                                                    │
│ Estimates│                                                    │
│ Invoices │                                                    │
│ Documents│                                                    │
│ ⚙ Settings│                                                   │
└──────────┴────────────────────────────────────────────────────┘
```

* Header: workspace name (from config), issue count, sync badge (`clean | dirty | unpushed | syncing | error`), `⌘K` palette.
* Sidebar collapses under 900 px into a sheet; below 640 px the board becomes a horizontally-scrolling column stack.
* `⌘K` palette: navigate, create, search, run sync.

## Views

| View | Contents | Key interactions |
|---|---|---|
| Dashboard | Counts, open tasks by column, unpaid invoices total, recent activity, issue banner | Click-through to filtered lists |
| Contacts | Table + side detail; search, status filter | Inline edit, create, archive |
| Projects | Table; linked client; progress (done/total tasks) | Change status, jump to filtered tasks |
| Tasks | Kanban, 3 columns derived from folders | Drag & drop, keyboard move, reorder, due-date chips |
| Estimates | Table; status; total | Edit line items, convert to invoice |
| Invoices | Table; derived `overdue` badge | Edit, mark sent/paid, print |
| Documents | List of terms/proposals/notes | Markdown editor + preview |
| Settings | Business profile, currency, `tax_rate_bps`, default terms, `commit_on_save` | Save → PATCH `/api/config` |
| Needs attention | Issue list with file preview and resolve actions | Explicit resolve only |

## Data layer

```ts
useResource(type) -> { records, loading, error, generation, refetch }
```

* Initial `GET /api/:type` + `GET /api/events` subscription.
* SSE events at or below the rendered `generation` are dropped (doc 05 §Concurrency).
* Every mutation sends `baseHash`; a `409` opens the conflict banner instead of retrying.
* Optimistic updates render immediately with a pending style; on failure the row reverts and a toast carries the server's message.

## Editors

* **Forms** (contacts, projects, settings): dirty-state tracking, `⌘↵` to save, `Esc` to discard, unsaved-changes prompt on navigate-away.
* **Markdown** (document body, task notes): plain textarea + rendered preview toggle. No rich-text editor — the file on disk is the artifact.
* **Line items** (estimate/invoice): rows with description/qty/unit price; totals recompute live using the same cents helpers as the server (shared module, single implementation).
* **Conflict banner:** "This file changed on disk." → *Reload* (discard local edits) / *Keep mine* (three-way field merge, doc 04). Never auto-merge.
* **Stale banner:** record failed to parse but a previous projection exists → read-only view with an amber badge and a link to the raw file in *Needs attention*.

## Kanban

* Column source: `tasks/todo`, `tasks/doing`, `tasks/done` — the folder, not a field.
* Drop computes `beforeId`/`afterId` from the rendered order; one `POST /api/tasks/:id/move`. No optimistic file writes.
* Keyboard: focus a card, `⌘←/⌘→` moves a column, `⌘↑/⌘↓` reorders. Drag is never the only path.
* Sorting indicator listens for `record.moved` and re-renders without a full refetch.

## Money rendering

* `Intl.NumberFormat(currency, { minimumFractionDigits: 2 })`; input fields accept `2 500`, `2500.50`, `$2500` and convert to cents on blur via `parseMoney`.
* Rounding in the display layer only; the file always holds integers.
* Print view (`/invoices/:id/print`, `/estimates/:id/print`): A4/Letter `@page` margins, business header from config, line table, tax breakdown, terms document rendered below the signature block. No PDF dependency — the browser's print dialog produces the PDF.

## Tab protection

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

- [ ] Editing a contact in the UI appears in VS Code within ~300 ms, and vice versa.
- [ ] Dragging a card between columns moves exactly one file.
- [ ] A `409` conflict never loses the user's typed text.
- [ ] Deleting the record behind an open detail view shows a removed state with a working back button.
- [ ] Print preview of a 3-line invoice fits one page at A4.
- [ ] Full keyboard traversal of contacts CRUD with no mouse.
