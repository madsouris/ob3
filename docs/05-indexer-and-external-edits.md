# 05 — Indexer & External Edits

Milestone: **M2** · Spec: `brief.md` §6 · Code: `src/index/`

## Purpose

Keep a typed, queryable projection of the workspace that is always rebuildable from files, and make the Web UI *incapable* of breaking when a human edits the same workspace in another tool.

## Model

```ts
type Index = {
  byId: Map<RecordId, IndexedRecord>        // authoritative key
  pathToId: Map<RelPath, RecordId>          // cycle detection + counts
  byType: Map<RecordType, Set<RecordId>>
  byFolder: Map<RelPath, Set<RecordId>>     // task columns
  issues: Map<IssueKey, Issue>
  generation: number                         // bumped on any change
}

type IndexedRecord = {
  id: RecordId
  type: RecordType
  path: RelPath            // cache; may change at any time
  hash: string             // sha256 of file bytes at last parse
  parsed: Ok | Degraded    // Degraded = projection with fallbacks + issue ref
  frontmatter: Document    // preserved for round-trip writes
  body: string
  mtimeMs: number
  size: number
}
```

The index is **never persisted**. Startup always does a full scan; a warm start is not a goal for a local app.

## Full scan

1. Walk the six managed directories (allowlist), depth-limited, skipping symlinks, hidden files, and anything > 2 MB.
2. Parse each `.md`. `parse-error` / `unreadable` / `too-large` files become issues and are excluded from `byId`.
3. Insert by `id`:
   * free → insert.
   * id already present → canonical-wins: the file whose path matches `{prefix}_{slug}` most closely (shortest path, then lexicographic) keeps the slot; the other becomes a `duplicate-id` issue, **still readable** via the issues view (`GET /api/issues/:key/preview`).
4. Task files not under `tasks/{todo,doing,done}/` → indexed as `orphan-task-path` issues (not in the board).
5. Resolve references → `dangling-ref` issues (warning severity).
6. Sort task columns by `order`, `created_at`, `id`.

Scan is single-pass and non-blocking for large workspaces: entries stream into the index; the API serves `generation`-consistent snapshots (`snapshot` = index state at the moment of the request) while the scan completes, then emits a `index.ready` event.

## Incremental update (from the watcher)

```
onChange(path):
  if suppressed(path) -> ignore              # our own write (doc 06)
  hash = sha256(bytes)
  if hash === existing.hash -> ignore        # touch without content change
  parse
    ok        -> upsert by id; if id maps to a different path, drop the old path mapping
                 and emit record.moved (UI URLs use ids, so no navigation occurs)
    id changed-> treat as delete(old) + upsert(new); emit record.delete + record.upsert
    invalid   -> quarantine path; issue.parse-error; emit issues.changed
  emit record.upsert / record.delete / issues.changed with generation
```

Idempotency rule: applying the same watcher event twice must produce the same index. Tests assert this by replaying the event log.

## The external-edit contract

This is the behavioural promise. Each row must have an integration test.

| External action | Index result | Web UI result | Never happens |
|---|---|---|---|
| Rename file, id intact | Identity kept, path updated, `record.moved` | No visible change; open editor unaffected; links keep working | Duplicate record; 404 |
| Move task between columns | Type-level status changes from folder | Card animates to the new column | Write-back to "correct" the file |
| Move task to `tasks/` root | `orphan-task-path` issue | Card leaves the board, appears in *Needs attention* | File deleted/moved by `ob` |
| Edit body | Body replaced verbatim | Detail view refreshes | Markdown reformatting |
| Reorder/remove frontmatter keys | Unknown keys preserved | No change | Any write |
| Delete a required key (`title`) | `Degraded` projection, `schema-invalid` issue | Row shows fallback (`Untitled task` + id chip) | Crash or row vanishing |
| Type mismatch (`order: "abc"`) | Fallback (`order = 0`), issue | Sorts by fallback, chip indicates issue | Silent coercion written to disk |
| Replace whole file | Normal upsert by id | Updates in place | Lost comments on next ob write (they're gone from disk, which is correct) |
| Invalid YAML / mid-save truncation | Retried ×2 over 500 ms, then `parse-error` | Last good projection retained with a stale badge | UI emptying out; file rewrite |
| Duplicate id | One primary, one issue | Primary works; other reachable via issue preview | Auto-merge or delete |
| Delete file | Removed; referrers get `dangling-ref` | Row disappears; referrers show raw id | Cascade delete |
| Add `foo.md` without id | `missing-id` issue | *Needs attention* with **Assign ID** action | Auto-generated id |
| Add `notes.txt` / `foo.json` | Ignored | — | — |
| Symlink to `~/.ssh/id_rsa` | Ignored (symlinks never followed) | — | Reads outside workspace |

## Concurrency with the UI

1. **Stable identity:** every route is `/contacts/:id` etc. Because ids survive renames, the URL never invalidates.
2. **Generation guard:** the UI stores the `generation` of the snapshot it rendered. SSE events carry the new `generation`; events ≤ the rendered generation are ignored, so out-of-order delivery cannot resurrect deleted rows.
3. **Tombstones:** a deleted id is remembered for 10 s in a small map so a late `record.upsert` from an in-flight event cannot re-add a deleted record.
4. **Stale-while-revalidate:** when a record fails to parse, the UI keeps the previous projection (marked stale, with an amber dot) instead of showing an error page. This is what makes "user saved a half-written file in VS Code" invisible to the CRM user.
5. **Open-editor guard:** the editor records `hash` at open. A watcher event for the same id with a different hash sets `conflict: true` on the editor. Saving then returns `409` (doc 04), never a silent overwrite.

## Issues

```ts
type Issue = {
  key: string          // stable: `{code}:{relPath}` (+ `:{id}` for duplicate-id)
  code: IssueCode
  severity: 'error' | 'warning'
  path: RelPath
  id?: RecordId
  message: string      // human sentence
  detail?: string      // raw parser/git message
  actions: IssueAction[]
}
type IssueCode =
  | 'parse-error' | 'unreadable' | 'too-large' | 'missing-id'
  | 'duplicate-id' | 'duplicate-number' | 'schema-invalid'
  | 'orphan-task-path' | 'dangling-ref' | 'conflict-marker'
```

`conflict-marker` = a file containing `<<<<<<<` in the body (unresolved Git conflict) — high visibility, zero automatic handling.

### Resolve actions (explicit, user-initiated only)

| Action | Applies to | Effect |
|---|---|---|
| `assign-id` | `missing-id` | Writes `id` + `created_at` via the round-trip writer (body untouched) |
| `adopt-path` | `orphan-task-path` | Moves the file into a chosen column folder |
| `preview` | all | Read-only file content |
| `ignore` | all | Stores the issue key in `.ob/state/ignored-issues.json` (gitignored, local-only) |
| `open-folder` | all | Reveals the file in the OS file manager |

There is deliberately **no** "delete duplicate" action in v1 — destructive resolution is left to the user's own tools, where undo/`git checkout` exists.

## Performance targets

| Workspace size | Full scan | Incremental event |
|---|---|---|
| 1k records | < 150 ms | < 10 ms |
| 10k records | < 1.5 s | < 15 ms |

Incremental work is O(1) per file. Search reindex is debounced (doc 10).

## Acceptance criteria

- [ ] Replaying the watcher event log twice yields an identical index (idempotency).
- [ ] Every row of the external-edit table passes as an integration test against `fixtures/workspaces/external-edits`.
- [ ] Deleting a file while its detail view is open shows a "record removed" state, not a crash or a blank screen.
- [ ] A parse error on one file does not prevent other records from rendering.
- [ ] `ob` never writes a file as a side effect of scanning.
