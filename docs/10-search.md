# 10 — Search

Milestone: **M3** (API) / **M4** (UI) · Spec: `brief.md` §4.1 · Code: `src/index/search.ts`

> **Status:** M3 ships a temporary case-insensitive substring matcher for `?q=`. FlexSearch is scheduled with the M5 search work; this document describes the target behaviour.

## Purpose

Fast, offline, typo-tolerant-enough search across all records, with zero native bindings and zero persisted state.

## Engine

* **FlexSearch** (`flexsearch` package, pure JS) — one index per record type plus one combined index.
* Indexed fields by type:

| Type | Fields |
|---|---|
| contact | `first_name`, `last_name`, `full name`, `email`, `company`, `job_role` |
| project | `project_name`, body (first 2 KB) |
| task | `title`, body (first 2 KB) |
| estimate / invoice | `number`, `title`, client name, line descriptions |
| document | `title`, body (first 8 KB) |

* Body text is stripped of markdown syntax (headings markers, link URLs, code fences) before indexing; the raw text remains searchable in the viewer.
* Tokenizer: forward + `encode: 'icase'`, `resolution: 9`, `cache: 100`.

## Lifecycle

```
full scan -> buildAll()            (startup)
watch event -> markDirty(id)
debounce 500ms -> reindex changed ids -> swap
```

* Reindex is **incremental by id**: `remove(id)` + `add(id)` in each affected index. No full rebuild after startup except on `index.ready` recovery.
* Search never blocks the HTTP handler: queries run against the current snapshot; a rebuild swaps the reference atomically.

## Query semantics

`GET /api/:type?q=...` and `GET /api/search?q=...`

* Whitespace-split terms are ANDed; each term may match any indexed field.
* Ranking: exact prefix > word-start > fuzzy (edit distance ≤ 1 for terms ≥ 4 chars) > substring. Type weight: contact/project slightly above task body.
* Hard filters applied after scoring (not in the index): `status`, `project_id`, `client_id`, `type`.
* Empty `q` returns the full list ordered by the type's natural sort (doc 03), never the raw index order.
* Result shape: `{ id, type, title, snippet, score }`; snippet is a ~120-char window around the first match in the body, with the match highlighted client-side (never HTML-injected from the server).

## Scale & limits

| Workspace | Index build | Query p95 |
|---|---|---|
| 1k records | < 80 ms | < 10 ms |
| 10k records | < 900 ms | < 25 ms |

* Body indexing capped (2 KB / 8 KB above) so a giant note cannot degrade startup.
* Query string capped at 256 chars; term count capped at 8.
* Query timeout 250 ms; on timeout return prefix-only results with `degraded: true`.

## Degradation

* If FlexSearch fails to load or blows the memory budget (> 128 MB), fall back to a linear `Map` scan with `String.includes` on lowercased fields. Correctness is preserved, only ranking degrades. The UI shows no banner; `--verbose` logs it.
* Search index is memory-only; nothing is written to disk, so there is no cache-invalidation problem after `git checkout`.

## Acceptance criteria

- [ ] Search finds a contact by company, by partial email, and with a one-character typo.
- [ ] Editing a body in an external editor makes the new word findable within ~600 ms.
- [ ] Deleting a record removes it from results immediately (no stale hits after `record.delete`).
- [ ] 10k-record synthetic fixture builds in < 1 s and query p95 < 25 ms.
- [ ] No index file appears on disk after a session.
