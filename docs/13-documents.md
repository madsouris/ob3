# 13 — Documents & Templates

Milestone: **Pre-M7 polish (P3)** · Spec: `brief.md` §5.2, §9 · Code: `src/model/schemas.ts`, `src/ui/views/document-*`, `src/ui/components/document-editor.tsx`, `src/ui/lib/template.ts`

## Purpose

Documents hold reusable terms, proposals and contracts. Two scopes cover the real use cases without a second storage location:

* **Global** — reusable terms or a proposal skeleton, attached to any invoice/estimate.
* **Client** — a contract or proposal for one contact, discovered from that client.

Both are ordinary Markdown files in `documents/`; scope is frontmatter, not a folder.

## Model

| Field | Type | Default | Notes |
|---|---|---|---|
| `title` | string (required) | — | |
| `kind` | `terms \| proposal \| note` | `note` | |
| `scope` | `global \| client` | `global` | Invalid values are reported as a `schema-invalid` issue but the record still projects |
| `client_id` | string | `''` | Soft reference to a contact; a missing target is a `dangling-ref` warning |
| body | Markdown | `''` | Stored byte-for-byte; never rewritten by rendering |

Creating through the API writes `scope` and `client_id` explicitly. Old files without the keys read as global with no client.

## Templates

Content is stored raw. Placeholders use `{{key}}` (whitespace inside the braces is fine) and are resolved only when a document is **viewed or printed**:

| Placeholder | Source |
|---|---|
| `{{business.name}}`, `{{business.email}}`, `{{business.phone}}`, `{{business.address}}` | `.ob/config.json` |
| `{{client.name}}`, `{{client.company}}`, `{{client.email}}`, `{{client.phone}}`, `{{client.website}}` | linked contact |
| `{{project.name}}` | project context (invoice/estimate attachments) |
| `{{invoice.number}}`, `{{invoice.title}}` | invoice context |
| `{{estimate.number}}`, `{{estimate.title}}` | estimate context |
| `{{today}}` | ISO date at render time |

Rules:

* A **known** placeholder is replaced, even when the value is empty (`{{client.company}}` → nothing).
* An **unknown** key, or a context that is not present (a global document with no client), stays visible exactly as written. This makes a missing link obvious instead of silently producing a blank line.
* Rendering never edits the file. The template remains editable in any text editor.
* The preview in the editor shows the raw template; the detail and print views show the rendered result.

## Attachments on estimates and invoices

Estimates and invoices carry `document_ids: string[]` (document ids, ordered).

* The billing editor selects documents with a searchable multi-select and shows removable tags; unknown ids render as a destructive “Unknown …” tag and can be removed.
* Printing renders each attached document after the invoice/estimate notes, in list order, with its title, resolved templates, and the billing context (`client`, `project`, `invoice`/`estimate`, `business`, `today`).
* A missing id prints an honest “Missing document …” line instead of failing.
* `terms_document` is the legacy single **path** field. It is used only when `document_ids` is empty, so old files still print correctly. Saving from the editor migrates the selection to `document_ids` and clears `terms_document`; the print view pre-selects the legacy document when one is linked.
* Duplicate and estimate → invoice copy `document_ids` unchanged.

## UI

* **List** — All / Global / Client tabs with counts; title, kind, scope/client, updated.
* **Detail** (`/documents/:id`) — rendered content, kind/scope/client badges, metadata, Edit and Print buttons.
* **Editor** — title, kind, scope, client (required for client scope), Markdown with Write/Preview.
* **Print** (`/documents/:id/print`) — A4 sheet with the business logo block, document title/date, client block when present, rendered Markdown, and the file path footer. No server-side PDF; the browser print dialog produces it.

## API

Documents use the generic `/api/documents` routes. The server:

* validates `scope`/`client_id` on write,
* stores exactly what the client sent (including placeholders),
* never renders templates and never rewrites the body,
* derives the client reference for issue reporting.

## Acceptance criteria

- [x] A document without `scope` projects as `global`; an invalid scope is a `schema-invalid` issue (`tests/model/schemas.test.ts`).
- [x] Creating a client-scoped document persists `scope` and `client_id` and returns them (`tests/server/api.test.ts`).
- [x] Template rendering handles known, empty, unknown and missing-context placeholders (`tests/ui/template.test.ts`).
- [x] `/documents/:id` and `/documents/:id/print` build with the existing A4 stylesheet.
- [x] Attachments persist as ids, copy through duplicate and conversion, and print in order with the billing context (`tests/server/api.test.ts`).
- [x] An unknown attachment id is reported as `dangling-ref` and rendered as a missing attachment, never silently dropped.
- [ ] A4 print check in light and dark mode (manual, same constraints as invoices).
