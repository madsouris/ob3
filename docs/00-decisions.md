# 00 — Architecture Decision Record

Short, numbered decisions resolved during spec review (v1.0.0 → v1.1.0). Each entry records the decision and the reason it beat the alternative.

---

### AD-01 — Sync order is commit-first

`git add` → `git commit` → `git pull --rebase` → `git push`.

**Why:** `git pull --rebase` refuses to run on a dirty tree. v1.0.0's order could not work in the common case. Commit-first also makes every pushed state recoverable.

---

### AD-02 — Commit-on-save, path-scoped

Each UI save writes the file, then commits **only the touched paths** (debounced ~1200 ms, coalesced per record).

**Why:** keeps the working tree clean so the `beforeunload` guard can be narrow and honest. Path scoping (instead of `git add -A`) prevents `ob` from sweeping a user's unrelated external edits into an auto-generated commit.

**Cost:** commit noise. Mitigated by coalescing; users who dislike it can set `"git": { "commit_on_save": false }` in `.ob/config.json`.

---

### AD-03 — Task status lives in the folder only

No `status` key in task frontmatter.

**Why:** two sources of truth inevitably disagree (drag the card vs. edit the YAML). Folder is observable in any file manager and survives every tool. Moving the file *is* the state change.

**Cost:** `tasks/` root-level files are ambiguous → reported as `orphan-task-path` issues, never guessed.

---

### AD-04 — `yaml` Document API for all frontmatter writes

Read into a `Document`, mutate only known keys, re-serialize.

**Why:** `js-yaml`-style `parse`+`dump` destroys comments, key order, and unknown keys — unacceptable for files that users also edit by hand. Preserving unknown keys also gives forward compatibility with future `ob` versions.

---

### AD-05 — Identity is the frontmatter `id`; paths are a cache

**Why:** users rename files constantly (`git mv`, Obsidian auto-rename, shell scripts). Path-keyed identity breaks links and duplicates records. ID-keyed identity makes renames a no-op from the UI's perspective.

**Consequence:** the index must be keyed by id, path collisions must be detected, and `id` must never be regenerated for an existing record.

---

### AD-06 — IDs are `{prefix}_{26-char ULID}`

Prefixes: `cnt_`, `proj_`, `tsk_`, `est_`, `inv_`, `doc_`.

**Why:** v1.0.0's `cnt_01J8X71000` is 11 characters — not a ULID. A real ULID gives monotonic, collision-resistant, sortable ids. Prefix makes raw ids self-describing in logs and issue reports.

---

### AD-07 — Money is integer cents; tax in basis points

Fields: `*_cents` (integer), `tax_rate_bps` (integer, 100 = 1%).

**Why:** YAML floats are binary and round-trip badly (`0.1 + 0.2`). Integer arithmetic is exact and testable. Rounding happens exactly once, at the tax step, using round-half-up. `bps` avoids `8.5` being stored as an inexact decimal.

---

### AD-08 — Local server is untrusted-surface hardened

Bind `127.0.0.1`; validate `Host`; no CORS; per-run token in `.ob/state/session.json` inlined into `index.html`; `X-OB-Token` required for mutations; workspace-confined path resolution.

**Why:** any website the user visits can `fetch('http://127.0.0.1:19731/...')`. Without a token and Host checks, a drive-by page could rewrite the CRM. Token-in-HTML is safe because it is same-origin only and never exposed cross-origin.

---

### AD-09 — Atomic writes, echo suppression, single-server lock

Write temp file in the target directory → `rename`. Track self-writes to ignore the resulting watcher events. `.ob/state/server.lock` with PID + stale reclaim.

**Why:** partial writes from non-atomic editors and self-triggered watcher loops cause the classic "UI keeps firing invalid YAML" bug. A lock prevents two servers from fighting over the same files.

---

### AD-10 — Watcher degrades gracefully without native `fsevents`

`chokidar` with `awaitWriteFinish`, plus a documented polling fallback (`CHOKIDAR_USEPOLLING=1`).

**Why:** `fsevents` is an optional native dependency on macOS; it must never be a hard requirement for `npx`.

---

### AD-11 — Default port `19731`, probe upward

Preferred port from `.ob/config.json` (`server.port`, default `19731`); if taken, probe `+1 … +50`; write the effective port to `.ob/state/session.json` and print/open the real URL.

**Why:** `19731` sits below the ephemeral range (49152+) and is not a registered service, so collisions are rare. A single documented default beats a truly random port because users bookmark it.

---

### AD-12 — TypeScript, strict, ESM, Node 20+

**Why:** AGENTS.md mandates type-safe code; the data layer is exactly where shape mistakes are expensive. ESM + Node 20 matches Hono's and chokidar's current distributions.

---

### AD-13 — `beforeunload` only when `dirty || unpushed`

**Why:** auto-commit makes the tree clean after every save, so a dirty-tree warning would fire only for genuine unsynced work. Warning on every keystroke (v1.0.0) trains users to dismiss the dialog, destroying its value.

---

### AD-14 — Issues over repairs

`ob` never mutates a file to resolve an ambiguity. It reports a typed issue and exposes explicit resolve actions.

**Why:** silent "fixes" are indistinguishable from data corruption. This is the single rule that keeps external editing safe.

---

### AD-15 — Browser print, not server-side PDF

Invoice/estimate PDF is produced by the browser's print dialog from a dedicated route (`/invoices/:id/print`, `/estimates/:id/print`), styled with a strict A4 `@page` and literal light paper/ink values instead of theme tokens.

**Why:** a PDF engine (headless Chromium, wkhtmltopdf, a font bundle) would add tens of megabytes and a native/runtime dependency to an `npx`-first tool, and would render differently from what the user sees. Browser print is offline, zero-dependency, and gives the user the system PDF writer (including font embedding and accessibility). The light-only sheet keeps output identical when printed from dark mode.

The tradeoff is explicit: no unattended server-side PDF for batch/email workflows. That stays a v2 concern (`plan.md` §Known deferrals).

---

### AD-16 — Duplicates are billing-only, and never reuse the source

`POST /api/{estimates,invoices}/:id/duplicate` clones an estimate or invoice into a **new file with a new id and the next number for the current year**; `status` resets to `draft`, dates reset to today (+15 days due / +30 days valid), line items and body are copied. Source files are read, never rewritten. Other record types reject the call with `invalid_duplicate`.

**Why:** duplicating a contact or project has no expected semantics (which children move? which names collide?), so a generic copy would create data the user did not ask for. For billing, a fresh draft with a new number is the behaviour users expect, and `(copy)` in the title makes the origin obvious. Keeping `converted_invoice_id` off the copy prevents a second forward link to one invoice.

---

### AD-17 — The board belongs to a project

`/projects` lists projects; `/projects/:id` is that project's Kanban board. `/tasks` remains a cross-project board labelled "All tasks".

**Why:** the user's mental model is engagement-first ("open the project, see its work"), and a single global board loses project context once there is more than one client. The cross-project board still earns its place for triage. Both derive columns from the same folders, so the file model is unchanged.
