# `ob` — user manual

A practical guide to running your CRM from a folder. For the design and internals, read
[`../brief.md`](../brief.md); for per-feature behaviour, see the rest of [`docs/`](./README.md).

---

## 1. Before you start

You need:

- **Node.js 20 or newer** — `node --version`.
- **Git** installed, with your name and email set:
  `git config --global user.name "You"` and `git config --global user.email "you@example.com"`.
- **A browser.** macOS, Linux and Windows all work.

Nothing is installed globally and nothing touches the network unless you sync.

---

## 2. Start a workspace

```bash
mkdir ~/crm
cd ~/crm
npx filecrm .
```

First run asks you to pick a setup:

1. **Demo workspace** — realistic contacts, projects, tasks, estimates, invoices and documents, all
   linked. Best for a first look.
2. **Empty workspace** — folders and defaults only.

Either way `ob` creates the folder tree, writes `.ob/config.json`, runs `git init` when the folder
is not already a repository, starts the server and opens your browser. The terminal prints the exact
URL: `http://127.0.0.1:19731` unless that port is busy, in which case it probes upward.

Useful variants:

```bash
ob init  ~/crm --empty     # scaffold without starting the server
ob check ~/crm --json      # environment and workspace diagnostics
ob --help
```

**Stop the server** with `Ctrl+C`. Your files stay exactly as they are; the next start reads them
back from disk.

---

## 3. A five-minute tour

- The sidebar is the whole app: Dashboard, Contacts, Projects, All tasks, Estimates, Invoices,
  Documents, Needs attention, Settings.
- `⌘K` / `Ctrl+K` opens the command palette for navigation and search.
- `Shift+D` toggles light and dark mode (it is ignored while you type in a field).
- The git badge in the header shows the branch, uncommitted work, or commits waiting to push.
- Every list row opens a detail view or editor; every sheet closes with `Esc` or **Cancel**.

The dashboard shows counts, open tasks by column, paid revenue (total and this month) and
outstanding invoices. Click any figure to jump to its list.

---

## 4. Set up your business

**Settings → Business**

1. Fill in name, email, phone, address, currency and tax rate. The tax rate is entered as a
   percentage (8.5) and stored as basis points (850).
2. Upload a logo if you have one — any image is resized in the browser and stored as
   `.ob/assets/logo.png`. Without a logo, initials are used everywhere, including prints.
3. **Payment** (the card below Business) chooses how clients pay: **No payment info**, **Payment
   link** (paste a URL), or **QR code** (upload your bank QR — it is re-encoded as JPEG and stored at
   `.ob/assets/qr.jpg`, replacing any previous QR). Only the selected mode prints; if you keep a link
   as well as a QR, the link prints underneath the QR as a fallback.
4. **Save changes.**

This information appears on estimates, invoices and documents. It lives in `.ob/config.json`, so it
is committed and synced with the rest of the workspace.

**Settings → Git** holds *Commit on save* (on by default). Leave it on unless you prefer to commit
manually.

---

## 5. Contacts

1. **Contacts → New contact.** Only a first name is required.
2. Click a row to open the contact page: notes, projects, client documents, billing, and the
   primary link as a button at the top of Details.
3. **Edit** opens the sheet. **Save** writes the file; **Cancel** discards.
4. The badges count this client's projects, client-scoped documents and billing records separately.

Contact status is `lead`, `active`, `inactive` or `archived`, shown as a badge and used by the dashboard's active-contact count.

---

## 6. Projects and tasks

1. **Projects → New project**, pick the client, choose a status.
2. Pick a project to open its board. The three columns are the folders
   `tasks/todo`, `tasks/doing`, `tasks/done`.
3. **New task** adds a card to the project. Tasks opened from **All tasks** show their project name
   on the card.
4. Move work:
   - drag a card onto another card to insert it, or onto a column to append;
   - or use the card's **Move to…** menu: column changes plus **Move up** / **Move down**.

A move is one file operation — the file changes folder, nothing is duplicated. Due dates show a
red badge once they pass on an open task.

---

## 7. Estimates and invoices

**Estimates → New estimate**

1. Choose client and project, set the status and dates.
2. Add line items: description, quantity (fractions allowed), unit price. Totals, tax and the grand
   total recompute as you type, in integer cents.
3. Attach documents if your terms or proposal should print with the bill (see §10).
4. Write notes in Markdown if you need them.

When the client accepts: open the estimate and press **Create invoice**. The invoice is created with
the same client, project, lines and attachments, and the estimate is linked back to it. This happens
once per estimate.

**Invoices**

- Statuses are `draft`, `sent`, `paid`, `overdue`, `cancelled`. *Overdue* is derived automatically
  from the due date; it is never written to the file.
- **Duplicate** copies an estimate or invoice as a new draft with the next number.
- Numbers look like `INV-2026-003` and `EST-2026-003`; you can edit them if you need to keep an
  external sequence.

---

## 8. Print or save a PDF

1. Open an estimate or invoice and press **Print / PDF** (documents have the same action).
2. The print view is a strict A4 sheet with 16 mm margins, your logo, both parties, the line table,
   totals, notes and every attached document. It is always light, even in dark mode. The payment
   block from **Settings → Payment** prints at the bottom: the link, or the QR with its fallback link.
3. Press **Print / Save as PDF** and choose *Save as PDF* in the browser dialog.

A short bill fits on one page. A long line-item list flows to a second page and repeats the table
header; totals stay together.

---

## 9. Documents

**Documents → New document.** A document is either:

- **Global template** — reusable terms or a proposal skeleton, attachable to any bill.
- **Client document** — a contract, statement of work, NDA, brief, proposal or note for one client.
  Client documents appear on that client's page.

Kinds are fixed: terms, proposal, contract, statement of work, NDA, brief, note, other. The editor's
**Variable references** panel (collapsed by default) lists every placeholder you can use.

```markdown
## Prepared for {{client.name}}

{{business.name}} proposes the following scope for {{client.company}}.
```

Placeholders are filled when the document is **viewed or printed** — the file keeps the raw
template. Company and client values are always available; project, invoice and estimate values are
filled when the document is attached to a bill. Unknown placeholders stay visible, so a typo is
obvious instead of silently blank.

---

## 10. Attaching documents to a bill

In the estimate or invoice editor, use the document picker to attach one or more documents. They
print in the order shown, after the notes, with the billing context resolved (`{{invoice.number}}`
and friends). A deleted attachment prints an honest "Missing document" line instead of failing.

---

## 11. Import from a spreadsheet

**Settings → Import**

1. Pick Contacts, Projects or Tasks.
2. **Download skeleton** — a CSV with the exact headers and one example row.
3. Fill it in, keep it as CSV, then **Import CSV**.
4. Rows that fail are listed with their spreadsheet line number; valid rows are still imported.

Import order matters: contacts first, then projects (which reference a client by email or name),
then tasks (which reference a project by name). References must already exist. An import always
*creates* records — it never merges or overwrites — so check the file before importing it twice.
The limit is 1,000 rows per file.

---

## 12. Saving, committing and syncing

- **Saving in the UI writes the file immediately.** With *Commit on save* on, `ob` also commits just
  that file after a short pause, so your working tree stays clean.
- **Pushing is manual.** Click the git badge, then **Sync**: `add` → `commit` → `pull --rebase` →
  `push`. The dialog lists each step and its output.
- **First remote:** click the badge, enter the repository URL, and use **Initialize** if the folder
  is not a repository yet, or **Set upstream & push** when a branch has no upstream.
- **Conflicts** are shown with their file paths. Nothing is resolved behind your back: use
  **Abort sync** to return to the previous state, resolve in a terminal, then sync again.
- Closing the tab while work is uncommitted or unpushed triggers the browser's leave warning.

`ob sync ~/crm` runs the same chain from a terminal. `ob sync --dry-run` prints it without running.

---

## 13. Editing files outside `ob`

Keep VS Code, Obsidian or a terminal open next to the app. Save a file and the UI updates within a
moment. Renames and folder moves keep the record's identity.

If a change cannot be understood, `ob` does not guess:

- invalid YAML, a duplicate id, a missing id, or a reference to a deleted record appears under
  **Needs attention** with a preview of the raw file;
- actions are explicit — **Assign id**, **Adopt path** for a stray task file, or **Ignore**;
- the file is never reformatted or repaired silently.

---

## 14. Back up or move to another machine

Your workspace is a Git repository with plain files.

```bash
# on the old machine
ob sync ~/crm

# on the new machine
git clone <remote> ~/crm
cd ~/crm && npx filecrm .
```

`ob` reads the files and rebuilds its index — there is no database to migrate. Commit
`.ob/config.json` and `.ob/assets/` along with the records; `.ob/state/` is machine-local and
gitignored.

---

## 15. Keyboard shortcuts

| Keys | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette: navigate or search |
| `Shift+D` | Toggle light / dark theme |
| `Esc` | Close the open sheet, dialog or palette |
| `↑` / `↓` / `Enter` | Move and select in the palette and menus |

Every action that can be dragged can also be done from a menu.

---

## 16. Troubleshooting

| Symptom | What to do |
|---|---|
| `git` or identity missing | Run the exact commands the CLI prints, then start again |
| Port already in use | `ob` probes upward and prints the real URL; or pass `--port 19800` |
| "This file changed on disk" | The file was edited elsewhere. Contacts offer *Reload from disk* (discard local edits) or saving again to overwrite; other editors report the conflict in a toast — reopen the sheet to pick up the file |
| Record says "Unknown client" | The contact file was deleted or renamed. Recreate it or re-pick the client in the editor |
| A file is not listed | Check **Needs attention**: it may be missing an `id`, have invalid YAML, or live outside a managed folder |
| Sync fails | Open the Git dialog; the failing step, its output and any conflict paths are shown. Abort, fix, sync again |
| Browser does not open | Open the URL printed in the terminal; `--no-open` suppresses the browser entirely |

---

## 17. Where to go next

- [`../brief.md`](../brief.md) — what `ob` is and why it is built this way.
- [`README.md`](./README.md) — index of per-feature behaviour docs.
- [`15-data-migration.md`](./15-data-migration.md) — how files will be kept readable as the schema
  evolves.
- [`../plan.md`](../plan.md) — shipped scope and post-v1 backlog.
