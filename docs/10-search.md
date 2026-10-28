# 10 — Search

Milestone: **M5** · Spec: `brief.md` §4.1 · Code: `src/index/search.ts`, `src/server/routes/search.ts`

> **Status:** shipped. FlexSearch replaced the M3 substring matcher in M5. The remaining gaps (typo tolerance, incremental reindex, 10k-record benchmarks) are listed in §Limits, not silently implied.

## Purpose

Fast, offline, ranked search across every record type, with zero native bindings and zero persisted state. The filesystem stays the only source of truth: the search index is rebuilt from records already in memory and thrown away when the process exits.

## Engine

* **FlexSearch** (`flexsearch@0.7.43`, pure JS) — one `Index` per record type.
* Options: `tokenize: 'forward'` (prefix matching), `resolution: 9`, `cache: 100`.
* Import note: the package ships a CJS bundle whose only real ESM export is `default`, even though its types declare named exports. `src/index/search.ts` narrows the default export once (`const { Index } = FlexSearch as unknown as …`) because `import { Index } from 'flexsearch'` throws under Node ESM.
* One in-memory `Map<id, record>` per type supplies hit metadata (title, path) without touching the filesystem on query.

## Indexed fields

The indexed string is `id`, the record's title, and its body (first 2 KB; 8 KB for documents), plus type-specific fields:

| Type | Fields |
|---|---|
| contact | `first_name`, `last_name`, `email`, `company`, `job_role` |
| project | `project_name` |
| task | `title` |
| estimate / invoice | `title`, all `line_items[].description` |
| document | `title`, body (8 KB) |

Bodies are indexed as written (Markdown included); no HTML or highlighting is generated server-side.

## Lifecycle

```
first query after startup        -> build all type indexes
index generation changes         -> rebuild all type indexes on next query
```

* `RecordIndex.generation` increments on every scan/write; the search service compares its `builtGeneration` and rebuilds lazily. Rebuild work therefore happens on the request that follows a change, not in the watcher.
* A rebuild is **not** incremental: each type's engine is recreated from `index.list(type)`. This is simple and cannot drift; it is the first thing to optimize if a workspace grows past a few thousand records.
* Nothing is written to disk; there is no cache to invalidate after `git checkout` or a branch switch, only the next rebuild.

## Query semantics

`GET /api/search?q=&type=&limit=` → `{ query, hits: [{ id, type, title, path }], generation }`

* Empty or whitespace-only `q` returns `hits: []`.
* Matching is FlexSearch prefix matching on the indexed text (`ref` finds `redesign`).
* `limit` defaults to 20 and is clamped to 1–50.
* `type` filters to one record type; an unknown value is ignored.
* Types are searched in a fixed order — contact, project, task, estimate, invoice, document — so ties resolve predictably toward people and projects.
* Results are deliberately thin: id, type, title, path. Snippets, scores and per-field breakdowns are not returned.
* If FlexSearch fails to build or throws during a query, the service falls back to a case-insensitive substring scan over the same indexed text. Ordering degrades to index order; correctness does not.

`GET /api/:type?q=` uses the same service:

* hard filters (`status`, `project_id`, `client_id`) run first on the record list;
* the search service returns matching ids for that type (limit 200);
* the list is filtered to those ids and sorted by search rank.

The list route therefore cannot return a record the type filter would not, and `?status=` and `?q=` compose.

The command palette (`⌘K`) makes one `GET /api/search?q=&limit=12` call instead of one request per type.

## Limits (v1)

* No typo tolerance, stemming or synonyms: forward tokenization only.
* No AND-of-terms semantics — the query string goes to FlexSearch as one tokenized query.
* No snippet window and no match highlighting.
* No query-length or term-count cap; payload size is bounded by the URL alone.
* No published latency budget. The practical target is under 10 ms at 1k records (local, in-memory); a 10k-record benchmark is not part of the suite yet.

## Acceptance criteria

- [x] Search finds a contact by company (`q=northwind` → Jane Doe) and respects `type`.
- [x] `limit` caps the hit count and an empty `q` returns no hits (API tests).
- [x] `GET /api/:type?q=` keeps hard filters and returns ranked matches (API test).
- [x] Deleting a record removes it from results on the next query: the index generation changes and the service rebuilds.
- [x] No index file appears on disk after a session (in-memory only).
- [ ] A one-character typo still finds the record (needs a fuzzy backend).
- [ ] Editing a body externally makes a new word findable without a manual refresh (expected via watcher → generation → lazy rebuild; not yet covered by a test).
