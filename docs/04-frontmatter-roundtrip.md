# 04 — Frontmatter Round-trip

Milestone: **M2** · Spec: `brief.md` §6 · Code: `src/model/frontmatter.ts`

## Purpose

Read and write YAML frontmatter without destroying anything a human put there. This is the guarantee that lets a user keep VS Code or Obsidian open next to `ob`.

## Library

`yaml` (eemeli/yaml), **Document API only**.

```ts
parseDocument(text, { keepSourceTokens: true })
doc.get('key') / doc.set('key', value) / doc.delete('key')
doc.toString({ lineWidth: 0 })
```

`js-yaml` `load`/`dump` is **forbidden** anywhere in the codebase (add an ESLint `no-restricted-imports` rule). Parsing to a plain object and re-dumping loses comments, key order, quoting style, and unknown keys.

## Read

```
splitFrontmatter(text) -> { frontmatterSource, bodySource, hadFrontmatter, newline, trailingNewline }
```

* Frontmatter is delimited by a leading `---` line and the next `---` line (or `...`).
* BOM is stripped and re-added on write if it was present.
* No leading `---` → `hadFrontmatter: false`, `bodySource` = entire text. The record is indexed as `missing-id` (doc 05), not as a parse error.
* Unterminated frontmatter (`---` with no closer) → `parse-error` issue; the file is not indexed.
* CRLF and lone-CR newlines are detected and preserved on write.
* Body is kept as a **string slice of the original text**, never re-serialized. This is what makes body bytes identical.

## Write

1. Take the existing `Document` (or a fresh one).
2. Set/delete only the keys `ob` owns for that operation. Never rebuild the document from a typed object.
3. Preserve key order: updated keys stay in place; new keys are appended in the canonical order relative to existing keys (doc 03).
4. `toString()` the document; splice it between the original delimiters along with the untouched body slice.
5. Restore original newline style and trailing-newline presence.
6. Atomic write (doc 06).

### What is preserved

* Comments (inline and block), including ANSI/`#` notes about statuses.
* Key order and original indentation width.
* Quote style of untouched scalars (`"+15550199"` stays quoted).
* Unknown keys, including nested maps and arrays.
* Anchors/aliases and multi-line block scalars, as long as they are untouched.
* YAML directives, if any.

### What may change (documented, acceptable)

* The touched key's own formatting (e.g. `due_date: 2026-11-05` may become `2026-11-05T00:00:00.000Z` only if the user edits that field).
* Blank line placement *immediately around* an inserted key.

## Conflict handling

`ob` writes from a snapshot taken at edit-open time. If the file changed on disk since then:

1. Re-read and compare a content hash taken at open.
2. If different → **reject** the write with `409 file_changed_on_disk`, return the current content, and let the UI show *Reload* / *Keep mine (overwrite)*.
3. `Keep mine` performs a three-way merge on the YAML document: `ob`'s field-level changes applied onto the current document, so untouched external edits (body, comments, other keys) survive even in an overwrite.

Never last-write-wins silently.

## Creating a record that has no frontmatter

* Insert `---\n<canonical keys>\n---\n` at position 0, keeping the body verbatim.
* If the body starts with a blank line, keep exactly one separator newline after the closing `---`.

## Failure modes

| Situation | Behaviour |
|---|---|
| Invalid YAML | `parse-error`; never repaired; never overwritten |
| Frontmatter is not a map (`---\n- a\n- b\n---`) | `parse-error` |
| Duplicate keys | `parse-error` with the duplicated key name (the `yaml` parser reports it) |
| Non-UTF-8 bytes | `unreadable`; skipped by the indexer |
| > 2 MB | skipped with `too-large`, not parsed |

## Acceptance criteria

Fixture-based tests must assert **byte equality**, not semantic equality:

- [x] `read → write with no field change` produces a byte-identical file (modulo nothing).
- [x] Editing `status` in a file with inline comments preserves every other byte.
- [x] A file with unknown keys `foo: { a: [1,2] }` keeps them after an `ob` edit, with order intact.
- [x] CRLF file stays CRLF after edit.
- [x] Body containing `---` and code fences is untouched.
- [x] `js-yaml` import fails lint (ESLint `no-restricted-imports`, ADR-04).
