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
* `hono/secure-headers` is applied globally from M1: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cross-Origin-Opener-Policy: same-origin`, and no `Strict-Transport-Security` (loopback HTTP only).
* CSP for the SPA: `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'`. `vite-plugin-singlefile` inlines both the CSS **and** the JS, so `'unsafe-inline'` is required for scripts — the external-script assumption in earlier drafts was wrong. The risk is bounded by the loopback bind, `Host` validation, and the per-run token. Wired up in M3 with the token middleware.

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
| GET | `/api/logo` | PNG bytes for the configured logo; `404` when none is set |
| POST | `/api/config/logo` | raw PNG body (≤ 512 KB) → `{ config }`; signature-validated, stored at `.ob/assets/logo.png` |
| DELETE | `/api/config/logo` | removes the logo file and clears `business.logo` |
| GET | `/api/issues` | array of `Issue` |
| GET | `/api/issues/:key/preview` | `{ path, frontmatter?, body, raw }`, capped 2 MB |
| POST | `/api/issues/:key/resolve` | `{ action: 'assign-id' \| 'adopt-path' \| 'ignore', ... }` |
| GET | `/api/events` | SSE |

### Records (generic, per type)

`type` ∈ `contacts|projects|tasks|estimates|invoices|documents`

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/:type` | — | `{ records: [...], generation }`; supports `?status=&project_id=&client_id=` and ranked `?q=` (docs/10) |
| GET | `/api/:type/:id` | — | `{ record, hash, generation }`; `404 unknown_id` |
| POST | `/api/:type` | full payload | `201 { record }` |
| PATCH | `/api/:type/:id` | partial + `baseHash` | `{ record }`; `409 file_changed_on_disk` on hash mismatch |
| DELETE | `/api/:type/:id` | `?baseHash=` | `204`; `409` on stale hash |
| POST | `/api/:type/:id/duplicate` | — | `201 { record }`; estimates/invoices only, else `400 invalid_duplicate` |

Task-specific:

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/tasks/:id/move` | `{ to: 'todo'\|'doing'\|'done', beforeId?, afterId? }` | Atomic single `rename`; recomputes `order` sparsely |

Domain actions:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/search` | `?q=&type=&limit=` → `{ query, hits: [{ id, type, title, path }], generation }`; `limit` defaults 20, capped 50 |
| POST | `/api/invoices/from-estimate/:estimateId` | Creates an invoice from an estimate; sets `converted_invoice_id` on the estimate (one extra write, same commit); `409 conflict` on a second conversion |

### Git

| Method | Path | Notes |
|---|---|---|
| GET | `/api/git/status` | `{ status }`; `?force=1` bypasses the 500 ms cache |
| POST | `/api/git/init` | `{ ok, initialized, warning, status, error }`; creates the repo, `.gitignore` (only when absent) and the initial commit |
| POST | `/api/git/sync` | `{ ok, steps, status, error }`; awaits `add → commit → pull --rebase → push`; steps also stream over SSE |
| POST | `/api/git/remote` | `{ url, push?: boolean }` → `{ ok, status, error }`; adds or updates `origin`, optionally pushes `-u` |
| POST | `/api/git/recover` | `{ action: 'abort-sync' \| 'set-upstream' }` → `{ ok, action, output, status, error }` |

Git operations report failure **inside the response** (`ok: false`, `error.code`) with HTTP 200. A rebase conflict is an expected state the UI must render, not a transport error (AD-18). Only malformed payloads use the error envelope (422).

Long-running git work: `POST /api/git/sync` returns when the chain settles; `git.step` events arrive during the request so the dialog can show progress. Each subprocess has a 10 s timeout; the server does not retry.

## Implementation notes (M3)

* **Git routes** are mounted from the same app and share one service with commit-on-save; a failed sync is `{ ok: false, error }` with HTTP 200 (docs/09).
* **Validation** runs twice on purpose: `@hono/zod-validator` produces the 422 envelope at the boundary, and the service re-validates with the same schema before touching disk (cheap payloads, single source of truth).
* **Server-only fields:** `body` (Markdown after the frontmatter) and `baseHash` (optimistic concurrency) are accepted on create/patch but are never written into frontmatter.
* **Issue keys contain `:` and `/`**, so preview/resolve use the `:key{.+}` param and clients must `encodeURIComponent` the key.
* **Money is server-computed** on create/patch: `line_items[].total_cents`, `subtotal_cents`, `tax_amount_cents` and `total_cents` are derived and ignore client-supplied values.
* **Additional error codes** beyond the table below: `invalid_id`, `invalid_json`, `unknown_issue`, `not_a_task`, `invalid_move`, `invalid_duplicate`, `config_invalid`.
* **SSE events emitted today:** `snapshot`, `record.upsert`, `record.delete`, `record.moved`, `issues.changed`, `config.changed`, `git.changed`, `git.step`, `git.settled`, `ping`.
* **List `q`** is ranked by the search service (`src/index/search.ts`): the route resolves matching ids, then keeps the type's search order among matches (docs/10).
* **Duplicates** are handled by the service, not the route: the clone is written with a new id and the next `EST/INV-YYYY-NNN` number, so numbering stays consistent under concurrent creates.
* **Attachments** (`document_ids` on estimates/invoices) are soft references: missing ids are reported as `dangling-ref` and printed as a missing-attachment note; the server never drops unknown ids.
* **Git failures are data.** `POST /api/git/*` returns 200 with `{ ok: false, error: { code, message, output? } }`; codes are listed in docs/09, not in the envelope table below.
* **Logo uploads** accept only `image/png` bytes with a valid PNG signature; SVG and HTML are rejected. The server always reads `.ob/assets/logo.png`, so a hand-edited `business.logo` cannot point the API at another file. Uploads over 512 KB return 413.

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
| `file_changed_on_disk` | 409 | `baseHash` mismatch |
| `invalid_duplicate` | 400 | Duplicate requested for a non-billing type |
| `conflict` | 409 | Domain conflict (second conversion, filename exhaustion, invalid frontmatter) |
| `unknown_id` | 404 | No record with that id |
| `write_locked` | 423 | FS lock (Windows) after retries |
| `internal` | 500 | Logged with an id; message is generic |

Never return stack traces, absolute paths outside the workspace, or file contents of unmanaged files.

## SSE contract

```
event: snapshot      data: { generation, counts, issues }
event: record.upsert data: { generation, record }
event: record.delete data: { generation, id, type }
event: record.moved  data: { generation, id, from, to }
event: issues.changed data: { generation, issues }
event: config.changed data: { config }
event: git.changed   data: { status }
event: git.step      data: { name, ok, skipped?, output }
event: git.settled   data: { ok, error, status }
event: server.closing data: {}
```

* `retry: 3000`; client reconnects with exponential backoff and re-fetches `snapshot` (full reconciliation) on every reconnect.
* Heartbeat comment (`: ping`) every 20 s so proxies and sleeping laptops detect dead connections.
* Backpressure: if a client's buffer exceeds 1 MB, the server drops the connection; the client's reconnect path performs a full resync, so no data is lost.

## Acceptance criteria

- [x] `curl` with a wrong `Host` header → 403.
- [x] `fetch` from a page on another origin cannot perform a PATCH (foreign `Origin`/`Sec-Fetch-Site` → 403; no CORS headers are ever emitted).
- [x] Missing/invalid `X-OB-Token` → 401 on every mutating route.
- [x] `GET /api/:type/:id` with `..%2f` → 400: ids are map keys and never reach the filesystem; anything outside `[A-Za-z0-9_-]` is rejected.
- [x] Two PATCHes with the same `baseHash`: second returns 409.
- [x] SSE survives a server restart: `EventSource` reconnects with backoff, and `onopen` after a socket error triggers a full refresh/reconciliation.
- [x] No route can write outside `contacts|projects|tasks|estimates|invoices|documents|.ob/config.json`.
