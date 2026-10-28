export type DemoFile = { path: string; content: string };

/**
 * Deterministic demo workspace (brief.md §3.2). Fixed ULIDs and timestamps so
 * integration tests can assert on exact content.
 */
export function demoFiles(): DemoFile[] {
  return [
    {
      path: 'contacts/cnt_acme-corp.md',
      content: `---
ob_schema: 1
id: cnt_01J8X7100AQ4M2N8V3R5T7W9Y0
type: contact
first_name: Priya
last_name: Raman
email: priya@acme.com
company: Acme Corp
job_role: VP of Product
phone_number: "+15550142"
website: "https://acme.com"
primary_link: "https://linkedin.com/in/priyaraman"
status: active
created_at: 2026-10-28T09:00:00Z
updated_at: 2026-10-28T09:00:00Z
---

# General notes

Met at the Tech Expo. Wants a full frontend overhaul before Q1.
`,
    },
    {
      path: 'contacts/cnt_jane-doe.md',
      content: `---
ob_schema: 1
id: cnt_01J8X7100BQ4M2N8V3R5T7W9Y0
type: contact
first_name: Jane
last_name: Doe
email: jane@northwind.io
company: Northwind Traders
job_role: Marketing Director
phone_number: "+15550199"
website: "https://northwind.io"
primary_link: "https://linkedin.com/in/janedoe"
status: lead
created_at: 2026-10-28T09:10:00Z
updated_at: 2026-10-28T09:10:00Z
---

# General notes

Referred by Priya. Asked about a landing page refresh and email templates.
`,
    },
    {
      path: 'projects/proj_website-redesign.md',
      content: `---
ob_schema: 1
id: proj_01J8X7200AQ4M2N8V3R5T7W9Y0
type: project
project_name: Website Redesign
client_id: cnt_01J8X7100AQ4M2N8V3R5T7W9Y0
status: active
created_at: 2026-10-28T10:00:00Z
updated_at: 2026-10-28T10:00:00Z
---

## Project description

Redesign the corporate landing page and move the blog to a static site generator.
Three-week engagement, two revision rounds.
`,
    },
    {
      path: 'projects/proj_mobile-app.md',
      content: `---
ob_schema: 1
id: proj_01J8X7200BQ4M2N8V3R5T7W9Y0
type: project
project_name: Mobile App Discovery
client_id: cnt_01J8X7100BQ4M2N8V3R5T7W9Y0
status: active
created_at: 2026-10-28T10:05:00Z
updated_at: 2026-10-28T10:05:00Z
---

## Project description

Discovery sprint for a customer portal app. Scope confirmed, estimate pending.
`,
    },
    {
      path: 'tasks/todo/tsk_homepage-hero.md',
      content: `---
ob_schema: 1
id: tsk_01J8X7300AQ4M2N8V3R5T7W9Y0
type: task
title: Build homepage hero component
project_id: proj_01J8X7200AQ4M2N8V3R5T7W9Y0
order: 1
due_date: 2026-11-05T00:00:00Z
created_at: 2026-10-28T10:30:00Z
updated_at: 2026-10-28T10:30:00Z
---

- [ ] Responsive breakpoints
- [ ] Reduced-motion fallback
`,
    },
    {
      path: 'tasks/todo/tsk_copy-review.md',
      content: `---
ob_schema: 1
id: tsk_01J8X7300BQ4M2N8V3R5T7W9Y0
type: task
title: Review landing page copy
project_id: proj_01J8X7200AQ4M2N8V3R5T7W9Y0
order: 2
due_date: 2026-11-07T00:00:00Z
created_at: 2026-10-28T10:35:00Z
updated_at: 2026-10-28T10:35:00Z
---

Close-read the copy deck and flag claims that need substantiation.
`,
    },
    {
      path: 'tasks/doing/tsk_api-integration.md',
      content: `---
ob_schema: 1
id: tsk_01J8X7300CQ4M2N8V3R5T7W9Y0
type: task
title: Integrate contact form API
project_id: proj_01J8X7200AQ4M2N8V3R5T7W9Y0
order: 1
due_date: 2026-11-03T00:00:00Z
created_at: 2026-10-28T10:40:00Z
updated_at: 2026-10-28T11:00:00Z
---

Form posts to the CRM webhook; needs spam protection and a thank-you state.
`,
    },
    {
      path: 'tasks/done/tsk_wireframes.md',
      content: `---
ob_schema: 1
id: tsk_01J8X7300DQ4M2N8V3R5T7W9Y0
type: task
title: Homepage wireframes
project_id: proj_01J8X7200AQ4M2N8V3R5T7W9Y0
order: 1
due_date: 2026-10-30T00:00:00Z
created_at: 2026-10-28T10:45:00Z
updated_at: 2026-10-28T15:00:00Z
---

Approved by Priya on 2026-10-28.
`,
    },
    {
      path: 'tasks/done/tsk_discovery.md',
      content: `---
ob_schema: 1
id: tsk_01J8X7300EQ4M2N8V3R5T7W9Y0
type: task
title: Client discovery call
project_id: proj_01J8X7200AQ4M2N8V3R5T7W9Y0
order: 2
due_date: 2026-10-27T00:00:00Z
created_at: 2026-10-28T10:50:00Z
updated_at: 2026-10-28T15:05:00Z
---

Goals, constraints and the existing brand kit are documented in the project body.
`,
    },
    {
      path: 'estimates/est_2026-001.md',
      content: `---
ob_schema: 1
id: est_01J8X7000AQ4M2N8V3R5T7W9Y0
type: estimate
estimate_number: EST-2026-001
client_id: cnt_01J8X7100AQ4M2N8V3R5T7W9Y0
project_id: proj_01J8X7200AQ4M2N8V3R5T7W9Y0
title: Website Redesign — Proposal
status: sent
issue_date: 2026-10-28
valid_until: 2026-11-27
currency: USD
terms_document: "documents/doc_default-terms.md"
subtotal_cents: 250000
tax_rate_bps: 850
tax_amount_cents: 21250
total_cents: 271250
line_items:
  - description: "Discovery & UX research"
    quantity: 1
    unit_price_cents: 150000
    total_cents: 150000
  - description: "Hi-fi design system"
    quantity: 2
    unit_price_cents: 50000
    total_cents: 100000
converted_invoice_id: null
created_at: 2026-10-28T10:45:00Z
updated_at: 2026-10-28T10:45:00Z
---

## Scope

Three-week engagement, two revision rounds.
`,
    },
    {
      path: 'invoices/inv_2026-001.md',
      content: `---
ob_schema: 1
id: inv_01J8X7400AQ4M2N8V3R5T7W9Y0
type: invoice
invoice_number: INV-2026-001
client_id: cnt_01J8X7100AQ4M2N8V3R5T7W9Y0
project_id: proj_01J8X7200AQ4M2N8V3R5T7W9Y0
estimate_id: est_01J8X7000AQ4M2N8V3R5T7W9Y0
title: Initial Project Deposit
status: draft
issue_date: 2026-10-28
due_date: 2026-11-15
currency: USD
terms_document: "documents/doc_default-terms.md"
subtotal_cents: 250000
tax_rate_bps: 850
tax_amount_cents: 21250
total_cents: 271250
line_items:
  - description: "50% upfront deposit for Website Redesign"
    quantity: 1
    unit_price_cents: 250000
    total_cents: 250000
created_at: 2026-10-28T11:00:00Z
updated_at: 2026-10-28T11:00:00Z
---

## Notes

Payment due within 15 days of issue date.
`,
    },
    {
      path: 'documents/doc_default-terms.md',
      content: `---
ob_schema: 1
id: doc_01J8X7500AQ4M2N8V3R5T7W9Y0
type: document
title: Default Service Terms
kind: terms
created_at: 2026-10-28T09:00:00Z
updated_at: 2026-10-28T09:00:00Z
---

Payment is due within 15 days of invoice issuance.

Work begins after the deposit clears. Two revision rounds are included per phase;
additional rounds are billed at the agreed hourly rate.
`,
    },
    {
      path: 'documents/doc_proposal-template.md',
      content: `---
ob_schema: 1
id: doc_01J8X7500BQ4M2N8V3R5T7W9Y0
type: document
title: Proposal Template
kind: proposal
created_at: 2026-10-28T09:05:00Z
updated_at: 2026-10-28T09:05:00Z
---

## Scope

## Deliverables

## Timeline

## Investment
`,
    },
  ];
}
