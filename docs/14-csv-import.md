# CSV Import

Status: `[x]` — implemented in P5, tested in `tests/import/csv.test.ts` and `tests/server/import.test.ts`.

## Purpose

Let a user move an existing spreadsheet into `ob` without hand-writing Markdown. The import is a
**creation** tool: every valid row becomes a normal record file, indistinguishable from one created
in the UI.

Out of scope: estimates and invoices. Billing records carry line items, cents math, tax and document
attachments, so a flat CSV cannot express them without inventing a second money path. They stay
UI-only (and are callable through `POST /api/estimates` etc. for scripting).

## Scope

| Import type | Folder            | Required header |
| ----------- | ----------------- | --------------- |
| `contact`   | `contacts/`       | `first_name`    |
| `project`   | `projects/`       | `project_name`  |
| `task`      | `tasks/<column>/` | `title`         |

## File rules

- UTF-8. A leading BOM is stripped.
- RFC 4180: quoted fields, `""` escapes, commas and newlines inside quotes, CRLF or LF line endings.
  CRLF inside a quoted value is normalized to LF.
- The first row is the header. Header names are matched case-insensitively and tolerate spaces or
  hyphens (`First Name` → `first_name`).
- Columns that are not in the definition are ignored; column order does not matter.
- Blank lines are skipped. A row of empty cells is a row that fails validation, not a blank line.
- Limits: **1000 data rows** and **1 MB** per file (the global API body limit). Larger files are
  rejected before anything is written.
- An unclosed quote is a whole-file error: nothing is imported.

## Columns

### `contact`

| Header         | Field          | Notes                                                    |
| -------------- | -------------- | -------------------------------------------------------- |
| `first_name`   | `first_name`   | Required                                                 |
| `last_name`    | `last_name`    |                                                          |
| `email`        | `email`        | Used to resolve this contact from later imports          |
| `company`      | `company`      |                                                          |
| `job_role`     | `job_role`     |                                                          |
| `phone_number` | `phone_number` |                                                          |
| `website`      | `website`      |                                                          |
| `primary_link` | `primary_link` |                                                          |
| `status`       | `status`       | `lead` (default) \| `active` \| `inactive` \| `archived` |
| `notes`        | Markdown body  | Free text; may contain newlines when quoted              |

### `project`

| Header         | Field          | Notes                                                  |
| -------------- | -------------- | ------------------------------------------------------ |
| `project_name` | `project_name` | Required; also how later imports refer to this project |
| `client`       | `client_id`    | Contact **email or full name**; must already exist     |
| `status`       | `status`       | `active` (default) \| `completed` \| `archived`        |
| `notes`        | Markdown body  |                                                        |

### `task`

| Header     | Field             | Notes                                          |
| ---------- | ----------------- | ---------------------------------------------- |
| `title`    | `title`           | Required                                       |
| `project`  | `project_id`      | Project **name**; must already exist           |
| `column`   | containing folder | `todo` (default) \| `doing` \| `done`          |
| `due_date` | `due_date`        | `YYYY-MM-DD`, stored as `YYYY-MM-DDT00:00:00Z` |
| `notes`    | Markdown body     |                                                |

Task status is the containing folder (AD-06), so the importer creates the file directly in
`tasks/todo|doing|done` and computes `order` from that column.

## References

- `client` resolves against existing contacts by email (case-insensitive), then by
  `first_name last_name`.
- `project` resolves against existing projects by `project_name` (case-insensitive).
- An unknown or ambiguous reference fails that row. The importer **never** creates a missing
  contact or project implicitly, and never guesses between two matches — ambiguity is reported, not
  resolved (AD-09).

Import order therefore matters: contacts first, then projects, then tasks.

## Row outcomes

- A valid row goes through `createRecord`, the same service the UI uses: `ob_schema`, id from
  `createId`, defaults, `created_at`/`updated_at`, filename from the slug, index update, SSE
  `record.upsert`, and the commit-on-save hook. There is no second write path.
- An invalid row writes nothing. It is reported as `{ line, message }` where `line` is the physical
  spreadsheet line (1-based, header = line 1), so the user can fix the file and re-import.
- Valid rows in a file with invalid rows are still imported (partial import). The report says how
  many rows were read, created and skipped.
- The import never merges, deduplicates or updates. Importing the same file twice creates two sets
  of records. If that is not what you want, delete the first import or edit the CSV first.
- An import is one debounce burst, so commit-on-save produces a single commit for the batch when it
  finishes inside the debounce window.

## API

### `GET /api/import/skeleton?type=contact|project|task`

Returns `text/csv; charset=utf-8` with `Content-Disposition: attachment;
filename="<plural>-skeleton.csv"`. The body is the header row plus one example row. No token is
required (it is a read). `400 unknown_type` for anything else.

### `POST /api/import`

```json
{ "type": "contact", "csv": "first_name,email\nAda,ada@example.com\n" }
```

```json
{
  "type": "contact",
  "rows": 1,
  "created": 1,
  "failed": [],
  "generation": 42
}
```

- `type` ∈ `contact | project | task`; `csv` is the raw file text, ≤ 1 MB.
- Whole-file problems (empty file, missing required header, unclosed quote, too many rows) return
  `422 validation_failed` with `details.reason = "import"` and a message naming the problem.
- Row problems never fail the request; they appear in `failed`.
- Requires `X-OB-Token` like every mutation (docs/07).

## UI

Settings → **Import** (`src/ui/components/import-card.tsx`):

- Record type picker (Contacts / Projects / Tasks).
- **Download skeleton** — a plain link to the skeleton route, so the browser downloads the file.
- **Import CSV** — opens a file picker, reads the file in the browser, posts the text, then
  refreshes the workspace (the SSE upserts also arrive).
- The card lists the accepted headers for the selected type and, after an import, the created count
  plus an `Alert` with each skipped row and its line number.
- A successful import toasts the created count; a fully failed import toasts an error and keeps the
  row list visible.

## Errors and limits

| Situation                               | Result                                                 |
| --------------------------------------- | ------------------------------------------------------ |
| Empty file                              | `422` "The file is empty"                              |
| Missing required header                 | `422` "Missing required column: first_name"            |
| Unclosed quote                          | `422` "Unclosed quote in the value starting on line N" |
| More than 1000 rows                     | `422` "Import is limited to 1000 rows per file"        |
| Missing required value in a row         | row error, nothing written                             |
| Unknown enum value (`status`, `column`) | row error, nothing written                             |
| Unknown/ambiguous `client` or `project` | row error, nothing written                             |
| Bad `due_date`                          | row error, nothing written                             |
| File over 1 MB                          | `413 payload_too_large` (global body limit)            |

## Acceptance criteria

- [x] The skeleton download matches the accepted headers for every import type.
- [x] Quoted commas, escaped quotes, CRLF, BOM and multiline notes parse correctly.
- [x] A header is required and missing columns are rejected before anything is written.
- [x] Invalid rows are skipped with their spreadsheet line; valid rows in the same file are created.
- [x] Contacts, projects and tasks are created through the normal create path (ids, defaults,
      filenames, index, SSE).
- [x] Task `column` places the file in `tasks/todo|doing|done` and sets `order` for that column.
- [x] `client` resolves by email or full name and fails loudly when unknown.
- [x] One import becomes one path-scoped commit under commit-on-save.
- [x] Importing a file never overwrites or merges an existing record.
