# 15 — Data Migration & Schema Evolution

Status: `[x]` — policy and pre-plan. No migration is needed for v1.0; `ob_schema` is `1` everywhere.

## Why this exists

Users own their files. A future release may need to change frontmatter, and that change must never
strand a workspace, silently rewrite a user's edits, or make an old copy of `ob` destructive.
This document is the contract every future schema change follows.

## The version marker

Every record carries `ob_schema: 1` in frontmatter. A missing key is read as `1`.

- The marker describes the **record shape**, not the app version.
- `ob --version` prints both the package version and the supported schema generation.
- Readers must keep accepting every generation they have ever written unless a documented major
  release says otherwise (see "Removing support" below).

## When the marker may change

| Change | `ob_schema` | Reader behaviour | Notes |
|---|---|---|---|
| Add an **optional** field | unchanged | old readers ignore it, new readers default it | The default is derived, never written back |
| Add a **required** field | bump | old readers report a `schema-invalid` issue, still project with a fallback | Ship with a derivation rule (see below) |
| Widen an enum (e.g. a new document kind) | unchanged | old readers report `schema-invalid` for the new value, never rewrite it | Additive and safe; the value survives a round-trip |
| Rename or remove a field | bump | new readers still accept the old key for at least one major version | Migration rewrites only after explicit confirmation |
| Change a field's type or units | bump | required | Money stays integer cents; no unit change is allowed without a migration |
| Change folder semantics (task columns) | bump | required | Status is the folder, so a move is a real migration |

**Forbidden without a migration:** writing a new required field into existing files as a side
effect of editing, changing money units, renumbering billing documents, deleting unknown keys.

## Reading old files

The read path is permissive by design and must stay that way:

- Missing optional fields get documented defaults in the projection only — nothing is written.
- Invalid values become typed issues (`schema-invalid`, `missing-id`, `dangling-ref`, `parse-error`)
  and the record is still projected when possible.
- Unknown keys are preserved verbatim and shown read-only.
- A file that cannot be parsed is quarantined and never modified.

This is why widening the schema is safe: an older `ob` can still open, list, edit and save records
that contain fields or enum values it does not understand.

## Writing in a newer schema

A newer `ob` may write new fields on records it edits, while leaving untouched records alone.
Frontmatter writes change only the keys being set; the body is copied byte-for-byte, comments and key
order are preserved, and writes are atomic. A workspace can therefore be mixed-generation
indefinitely.

## The future `ob migrate` command (design, not yet implemented)

If a bump becomes necessary, the shape is already decided:

```bash
ob migrate ~/crm              # dry run: report what would change, touch nothing
ob migrate ~/crm --write      # apply, after the report is reviewed
```

Requirements for the implementation:

1. **Dry run by default.** The report lists each file, the fields it would change and the new
   `ob_schema`. Nothing is written without `--write`.
2. **Refuse a dirty tree** unless `--allow-dirty` is passed. Offer to commit first, and never run
   `git add -A` on the user's behalf without confirmation.
3. **One atomic write per file**, through the IO layer, preserving body bytes, comments, key order
   and newline style. Never merge two files and never delete a record.
4. **Idempotent and resumable.** Running it twice changes nothing; an interrupted run can be re-run.
5. **Bump last.** `ob_schema` is written in the same operation as the field change, so a file is
   never half-migrated.
6. **Never destructive.** No automatic repairs, no reference rewrites, no renumbering. Ambiguity is
   reported as an issue and left for the user.
7. **Per-generation steps.** Migration code is a list of `N → N+1` functions applied in order, each
   with its own tests and its own report line.

## Release checklist when the schema changes

- [ ] Decide the bump from the table above, and record it in `docs/00-decisions.md`.
- [ ] Update the projection defaults (read) and the write schema, in that order.
- [ ] Keep reading the previous generation; add a fixture that contains it.
- [ ] Add round-trip tests: old file → edit one field → body, comments and unknown keys unchanged.
- [ ] If a migration is needed: implement the `N → N+1` step, the dry-run report and its tests.
- [ ] Update `docs/03-data-model.md`, this document, and `plan.md`.
- [ ] Ship the migration in a minor release; a major release is only for removing support.

## Removing support

Dropping a generation requires a major version and a release note telling users to run `ob migrate`
with the previous release first. There is no silent floor: an `ob` that meets a newer `ob_schema`
must refuse to write the file (report it) rather than downgrade it.

## Out of scope for v1

No migrations ship in 1.0. The workspace layout, money rules and record shapes are frozen at
`ob_schema: 1`. This document exists so the first change after 1.0 has a path that respects the
filesystem-is-the-database invariant.
