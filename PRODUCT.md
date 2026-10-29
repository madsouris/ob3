# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TypeScript (strict, ESM), Hono on Node 20+, React 19 + Tailwind + shadcn/ui, bundled by Vite into one `index.html` that the local server serves. Chosen in `brief.md`; not delegated.

## Users

Technical freelancers, solo developers, and lean agencies who run client work out of local files. They are comfortable with a terminal and a text editor, keep their work in Git, dislike being forced into a hosted SaaS, and often work on a client machine or offline.

> Inferred from `brief.md` (problem and users); not separately confirmed with a human.

## Product Purpose

`ob` is a local-first CRM whose database is a folder of Markdown files. Contacts, projects, tasks, estimates, invoices and documents are individual `.md` files with YAML frontmatter; Git is the sync layer. Success means a user can stop using it whenever they want and keep every record.

## Positioning

The data model *is* the file tree. Any text editor, `grep`, `git log`, or a different app can read and write the same records; the UI is a viewer/editor over the filesystem, never a second source of truth. No database, no account, no cloud.

## Operating Context

* The workspace is a directory (often its own Git repository) opened in VS Code, Obsidian, NeoVim or a shell **at the same time** as `ob`.
* Tasks are organised as a filesystem Kanban: `tasks/todo`, `tasks/doing`, `tasks/done`. Moving a card moves a file.
* Estimates become invoices; invoices are printed to PDF from the browser.
* Sync is an explicit action over `git add / commit / pull --rebase / push`.
* The app runs on `127.0.0.1` only, opened from the terminal by `npx filecrm .`.

## Capabilities and Constraints

* Six record types, all stored as Markdown + YAML frontmatter; ids are `prefix_ULID` and survive renames.
* Money is integer cents; tax is integer basis points; rounding happens once.
* Frontmatter writes preserve comments, key order and unknown keys byte-for-byte outside the touched fields.
* External edits never crash the UI or trigger silent repairs; ambiguity becomes a typed issue the user resolves explicitly.
* Offline-first: no network calls at runtime, no external fonts, no telemetry.
* Accessibility is a requirement, not a nicety: keyboard-first, visible focus, no drag-only interactions.
* Explicitly undecided: visual identity beyond the direction in `DESIGN.md`; branding assets.

## Brand Commitments

Name is `ob` (OperationBegin). Voice is plain, technical, unhyped — it explains a mechanic rather than selling an outcome. No taglines or marketing superlatives inside the app.

> Voice inferred from `brief.md`; the name is fixed by the white paper.

## Evidence on Hand

* `brief.md` — white paper: problem, principles, stack, data model.
* `docs/` — behavioural contracts per feature area.
* `fixtures/workspaces/demo/` — real records that double as the demo workspace and the UI's reference content.
