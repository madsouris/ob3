# 03 — Data Model: IDs, Schemas, Money

Milestone: **M2** (schemas) / **M5** (money UI) · Spec: `brief.md` §5.2 · Code: `src/model/`

## Purpose

Define exactly what a record is, what is authoritative, and how numbers are stored so that arithmetic is never approximate and files never drift.

## Identity

| Property | Rule |
|---|---|
| Format | `{prefix}_{26-char Crockford Base32 ULID}` |
| Prefixes | `cnt_` contact, `proj_` project, `tsk_` task, `est_` estimate, `inv_` invoice, `doc_` document |
| Example | `tsk_01J8X73000Q4M2N8V3R5T7W9Y0Z` |
| Immutable | Yes. `ob` never changes an existing id. |
| Authoritative over | filename, mtime, index slot |
| Missing | Record is indexed as `missing-id` (see doc 05); id is assigned only by explicit user action |

### Filename

`{prefix}_{slugify(title-ish field)}.md`, truncated to 60 chars of slug, de-duplicated with `-2`, `-3`.

* `slugify`: NFKD → strip diacritics → lowercase → non-alphanumerics to `-` → collapse → trim.
* Manual renames are fully supported; the filename is a convenience for humans and for `git diff` readability.

### Checklist: create

1. Validate payload with Zod.
2. Generate id.
3. Derive filename; if it exists, suffix.
4. Serialize frontmatter (canonical key order below) + body.
5. Atomic write; register self-write.
6. Update index; emit `record.upsert`; commit-on-save.

## Canonical field order on write

`ob_schema`, `id`, `type`, then type-specific semantic fields, then money fields, then `created_at`, `updated_at`, then any **unknown** keys (preserved in their original relative order).

Timestamps: `created_at` set once at creation; `updated_at` bumped on every `ob`-initiated write. Never rewritten when `ob` only reads. `updated_at` is *not* bumped by external edits (the filesystem is not the database — if the user edits `updated_at` by hand, that value is preserved and respected).

## Validation policy

* Zod schemas are **permissive on read, strict on write**.
  * Read: unknown keys allowed and preserved; missing optional fields defaulted in the projection; type mismatches produce an issue + a best-effort projection so the UI still renders something.
  * Write: payload must satisfy the schema; unknown keys in a PATCH are rejected with `422 unknown_field` (except `extra` passthrough for keys that already exist in the file).
* Enum violations on read (`status: bogus`) → `schema-invalid` issue, value kept as-is, UI shows it in a "custom value" chip rather than silently coercing.

## Field reference

### contact
`first_name` (req), `last_name`, `email`, `company`, `job_role`, `phone_number`, `website`, `primary_link`, `status` ∈ `lead|active|inactive|archived` (default `lead`).

### project
`project_name` (req), `client_id`, `status` ∈ `active|completed|archived` (default `active`).

### task
`title` (req), `project_id`, `order` (int ≥ 0), `due_date` (ISO datetime). **No `status` field** — the containing folder is the status (`todo` / `doing` / `done`).

Sorting within a column: `order` asc → `created_at` asc → `id` asc.

### estimate
`estimate_number` (req), `client_id`, `project_id`, `title`, `status` ∈ `draft|sent|accepted|declined|expired`, `issue_date`, `valid_until` (date `YYYY-MM-DD`), `currency`, `terms_document`, money block, `line_items`, `converted_invoice_id`.

### invoice
`invoice_number` (req), `client_id`, `project_id`, `estimate_id`, `title`, `status` ∈ `draft|sent|paid|overdue|cancelled`, `issue_date`, `due_date`, `currency`, `terms_document`, money block, `line_items`.

### document
`title` (req), `kind` ∈ `terms|proposal|note`, `scope` ∈ `global|client` (default `global`), `client_id` (soft reference, required by the UI for client scope). Body is the content. Templates use `{{variable}}` placeholders rendered at view/print time (see `docs/13-documents.md`).

## Money (normative)

```ts
// all values are integers
type Cents = number;      // 271250 === $2,712.50
type Bps   = number;      // 850    === 8.50%

roundHalfUp(x)            = Math.floor(x + 0.5)          // x >= 0
lineTotalCents(qty, unit) = roundHalfUp(qty * unit)
taxCents(subtotal, bps)   = roundHalfUp(subtotal * bps / 10000)
totalCents(subtotal, bps) = subtotal + taxCents(subtotal, bps)
```

Rules:

1. Money is **never** stored as a float, never as a formatted string, never with a currency symbol.
2. `subtotal_cents` is the sum of `line_items[].total_cents`. If a file's stored subtotal disagrees, the file value is displayed and an inline "Recalculate" action is offered — never an automatic rewrite.
3. Rounding is applied **once**, at the tax step. Line totals round individually before summing, so a printed invoice always adds up in what the client sees.
4. `quantity` may be fractional (e.g. `0.5` days). Sub-cent line totals are possible pre-rounding; the stored `total_cents` is the rounded value.
5. `overdue` is **derived** (display-only): `status === 'sent' && due_date < today`. `ob` never writes `overdue` into the file, avoiding time-dependent file churn.
6. Formatting (symbol placement, grouping) is presentation-only, driven by `currency` + `Intl.NumberFormat`. Missing/unknown currency → fall back to `USD` formatting with a warning badge.

### Why bps

`8.5` cannot be represented exactly in binary floating point; multiplying it by a large subtotal then rounding gives platform-dependent results at the boundary. Integer bps makes `taxCents` a pure integer function that can be property-tested for exactness.

## References

| Field | Points at | On missing target |
|---|---|---|
| `client_id` | contact | UI shows `Unknown contact` + raw id; `dangling-ref` issue |
| `project_id` | project | same |
| `estimate_id` | estimate | same |
| `terms_document` | workspace-relative path to a document record | UI shows the path, links only if a document record matches |
| `converted_invoice_id` | invoice | same |

No cascading deletes, no automatic nulling, no referential enforcement on write (a user may legitimately create an invoice before the contact exists in a fresh branch).

## Numbering

`INV-YYYY-NNN` / `EST-YYYY-NNN`:

* `YYYY` from `issue_date` (fallback: today).
* `NNN` = highest existing numeric suffix for that year **+ 1**, zero-padded to 3, across all files of that type (gap-tolerant: deleting `-003` does not cause reuse collision because the max is recomputed each time).
* Numbers are editable after creation; duplicates are reported as `duplicate-number` issues (warning severity), not blocked — the file is still valid.
* **Duplicating** an estimate or invoice allocates the next number for the *current* year, resets `status` to `draft`, sets `issue_date` to today (and `due_date` +15 / `valid_until` +30), copies line items and body, and appends ` (copy)` to a non-empty title. The source file is never rewritten. An estimate copy has an empty `converted_invoice_id`; an invoice copy keeps `estimate_id` as provenance.

## Acceptance criteria

- [x] `taxCents(250000, 850) === 21250` and `totalCents(250000, 850) === 271250`.
- [x] Property test: for random cents and bps, `total === subtotal + tax` and `tax === round(subtotal*bps/10000)`.
- [ ] Creating a contact twice with the same name produces two ids and two files, no overwrite. *(M3 API)*
- [ ] Creating a task in `todo` writes no `status` key. *(M3 API)*
- [x] Renaming a file on disk does not change any id and does not create a duplicate in the index.
- [x] Duplicating an estimate produces a new file and id, the next `EST-YYYY-NNN`, `status: draft`, and leaves the source byte-identical.
