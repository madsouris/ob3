# 07 — HTTP API & Security

Milestone: **M3** · Spec: `brief.md` §7 · Code: `src/server/`

## Purpose

A complete, typed, same-origin-only API for the SPA, safe by default on a machine where the browser is also visiting arbitrary websites.

## Server

```ts
serve({ fetch: app.fetch, hostname: '127.0.0.1', port })
```

* Bind **`127.0.0.1`** — never `0.0.0.0`, never IPv6 wildcard.
* No CORS middleware. Absence of `Access-Control-Allow-Origin` is the primary defence against cross-origin reads and custom-header writes.
* `Content-Type: application/json` on all API responses; `Cache-Control: no-store`.
* `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`.
* CSP for the SPA: `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'` (inline styles are required by the single-file bundle's inlined CSS; the script is an external `src` in the built file).

## Security middleware (in order)

| Order | Check | Failure |
|---|---|---|
| 1 | `Host` ∈ {`127.0.0.1:<port>`, `localhost:<port>`} | `403 host_not_allowed` |
| 2 | `Sec-Fetch-Site` absent or `same-origin`/`none` (skip when the header is absent, e.g. curl/CLI) | `403 cross_origin` |
| 3 | `Origin`, when present, must equal the server origin | `403 cross_origin` |
| 4 | Mutating method (POST/PATCH/DELETE/PUT) requires `X-OB-Token` === session token (constant-time compare) | `401 invalid_token` |
| 5 | Body ≤ 1 MB | `413 payload_too_large` |
| 6 | Path params/body paths resolved by `resolveInWorkspace` | `400 path_escape` |

`GET /` and `GET /assets/*` are exempt from the token (they must load before the SPA can read it). The token is injected into the served HTML by replacing a `__OB_TOKEN__` placeholder at request time, so it is available to the app but never cached to disk in `dist/`.

CLI callers (`ob sync`) bypass HTTP entirely and call the service layer directly — no token needed.

## Routes

### Meta

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{ ok, version, uptime, workspace }` |
| GET | `/api/config` | parsed + validated `.ob/config.json` |
| PATCH | `/api/config` | partial merge; unknown keys preserved, key order kept |
| GET | `/api/issues` | array of `Issue` |
| GET | `/api/issues/:key/preview` | `{ path, frontmatter?, body, raw }`, capped 2 MB |
| POST | `/api/issues/:key/resolve` | `{ action: 'assign-id' \| 'adopt-path' \| 'ignore', ... }` |
| GET | `/api/events` | SSE |

### Records (generic, per type)

`type` ∈ `contacts|projects|tasks|estimates|invoices|documents`

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/:type` | — | `{ records: [...], generation }`, supports `?q=&status=&project_id=` |
| GET | `/api/:type/:id` | — | `{ record, generation }`; `404 unknown_id` |
| POST | `/api/:type` | full payload | `201 { record }` |
| PATCH | `/api/:type/:id` | partial + `baseHash` | `{ record }`; `409 file_changed_on_disk` on hash mismatch |
| DELETE | `/api/:type/:id` | `?baseHash=` | `204`; `409` on stale hash |

Task-specific:

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/tasks/:id/move` | `{ to: 'todo'\|'doing'\|'done', beforeId?, afterId? }` | Atomic single `rename`; recomputes `order` sparsely |

Domain actions:

| Method | Path | Notes |
|---|---|---|
| POST | `/api/invoices/from-estimate/:estimateId` | Creates an invoice from an accepted estimate; sets `converted_invoice_id` on the estimate (one extra write, same commit) |
| POST | `/api/estimates/:id/convert` | Alias with explicit target type |

### Git

| Method | Path | Notes |
|---|---|---|
| GET | `/api/git/status` | `{ initialized, branch, dirty, unpushed, ahead, behind, lastCommit, remote }` |
| POST | `/api/git/sync` | Runs the chain; returns `{ steps: [{name, ok, output}] }` |
| POST | `/api/git/init` | `git init` + `.gitignore` + initial commit if needed |
| POST | `/api/git/remote` | `{ url }` → `git remote add origin` + `push -u` (ask before pushing) |

Long-running git work is streamed, not awaited blindly: `POST /api/git/sync` returns step events over SSE (`git.step`) and a final `git.settled`. A 10 s timeout per subprocess applies; on timeout the step is marked failed with partial output.

## Error envelope

```json
{ "error": { "code": "file_changed_on_disk", "message": "Record changed on disk while you were editing.", "details": { "currentHash": "…" } } }
```

| Code | Status | Meaning |
|---|---|---|
| `invalid_token` | 401 | Missing/wrong `X-OB-Token` |
| `host_not_allowed` / `cross_origin` | 403 | Origin hardening |
| `path_escape` | 400 | Path outside workspace |
| `payload_too_large` | 413 | Body cap |
| `validation_failed` | 422 | Zod issues, per-field |
| `unknown_id` | 404 | No record with that id |
| `file_changed_on_disk` | 409 | `baseHash` mismatch |
| `write_locked` | 423 | FS lock (Windows) after retries |
| `git_not_initialized` | 409 | Sync requested without a repo |
| `internal` | 500 | Logged with an id; message is generic |

Never return stack traces, absolute paths outside the workspace, or file contents of unmanaged files.

## SSE contract

```
event: snapshot      data: { generation, counts }
event: record.upsert data: { generation, record }
event: record.delete data: { generation, id, type }
event: record.moved  data: { generation, id, from, to }
event: issues.changed data: { generation, issues }
event: git.changed   data: { status }
event: server.closing data: {}
```

* `retry: 3000`; client reconnects with exponential backoff and re-fetches `snapshot` (full reconciliation) on every reconnect.
* Heartbeat comment (`: ping`) every 20 s so proxies and sleeping laptops detect dead connections.
* Backpressure: if a client's buffer exceeds 1 MB, the server drops the connection; the client's reconnect path performs a full resync, so no data is lost.

## Acceptance criteria

- [ ] `curl` with a wrong `Host` header → 403.
- [ ] `fetch` from a page on another origin cannot perform a PATCH (preflight fails; no CORS headers).
- [ ] Missing/invalid `X-OB-Token` → 401 on every mutating route.
- [ ] `GET /api/:type/:id` with `..%2f` → 400, never a file outside the workspace.
- [ ] Two PATCHes with the same `baseHash`: second returns 409.
- [ ] SSE survives a server restart (client reconnects within 6 s and reconciles).
- [ ] No route can write outside `contacts|projects|tasks|estimates|invoices|documents|.ob/config.json`.
