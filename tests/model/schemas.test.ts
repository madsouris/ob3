import { describe, expect, it } from 'vitest';
import { projectRecord, recordTitle, writeSchemas } from '../../src/model/schemas.js';

const base = { createdAt: '2026-10-28T09:00:00Z' };

describe('projectRecord — valid records', () => {
  it('projects a contact and collects unknown keys', () => {
    const { record, issues } = projectRecord({
      type: 'contact',
      id: 'cnt_01J8X7100AQ4M2N8V3R5T7W9Y0',
      path: 'contacts/cnt_jane.md',
      body: '# Notes\n',
      taskStatus: null,
      frontmatter: {
        ob_schema: 1,
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
        status: 'active',
        created_at: base.createdAt,
        updated_at: base.createdAt,
        custom: { theme: 'dark' },
      },
    });

    expect(issues).toEqual([]);
    expect(record.type).toBe('contact');
    if (record.type !== 'contact') throw new Error('wrong type');
    expect(record.first_name).toBe('Jane');
    expect(record.status).toBe('active');
    expect(record.extra).toEqual({ custom: { theme: 'dark' } });
    expect(record.body).toBe('# Notes\n');
  });

  it('projects an invoice with line items in cents', () => {
    const { record, issues } = projectRecord({
      type: 'invoice',
      id: 'inv_01J8X7100AQ4M2N8V3R5T7W9Y0',
      path: 'invoices/inv_2026-001.md',
      body: '',
      taskStatus: null,
      frontmatter: {
        invoice_number: 'INV-2026-001',
        status: 'sent',
        subtotal_cents: 250_000,
        tax_rate_bps: 850,
        tax_amount_cents: 21_250,
        total_cents: 271_250,
        line_items: [
          { description: 'Deposit', quantity: 1, unit_price_cents: 250_000, total_cents: 250_000 },
        ],
      },
    });

    expect(issues).toEqual([]);
    if (record.type !== 'invoice') throw new Error('wrong type');
    expect(record.total_cents).toBe(271_250);
    expect(record.document_ids).toEqual([]);
    expect(record.line_items).toHaveLength(1);
    expect(record.line_items[0]?.description).toBe('Deposit');
  });

  it('derives task status from the folder, not frontmatter', () => {
    const { record, issues } = projectRecord({
      type: 'task',
      id: 'tsk_01J8X7100AQ4M2N8V3R5T7W9Y0',
      path: 'tasks/doing/tsk_a.md',
      body: '',
      taskStatus: 'doing',
      frontmatter: { title: 'A', order: 2 },
    });

    expect(issues).toEqual([]);
    if (record.type !== 'task') throw new Error('wrong type');
    expect(record.status).toBe('doing');
    expect(record.order).toBe(2);
  });

  it('defaults ob_schema and missing optional strings', () => {
    const { record } = projectRecord({
      type: 'document',
      id: 'doc_01J8X7100AQ4M2N8V3R5T7W9Y0',
      path: 'documents/doc_a.md',
      body: '',
      taskStatus: null,
      frontmatter: { title: 'Terms' },
    });

    expect(record.ob_schema).toBe(1);
    if (record.type !== 'document') throw new Error('wrong type');
    expect(record.kind).toBe('note');
    expect(record.scope).toBe('global');
    expect(record.client_id).toBe('');
    expect(record.created_at).toBe('');
  });

  it('projects a client-scoped document and flags an unknown scope', () => {
    const clientScoped = projectRecord({
      type: 'document',
      id: 'doc_01J8X7100CQ4M2N8V3R5T7W9Y0',
      path: 'documents/doc_b.md',
      body: '',
      taskStatus: null,
      frontmatter: {
        title: 'Contract',
        kind: 'proposal',
        scope: 'client',
        client_id: 'cnt_01J8X7100AQ4M2N8V3R5T7W9Y0',
      },
    });
    if (clientScoped.record.type !== 'document') throw new Error('wrong type');
    expect(clientScoped.record.scope).toBe('client');
    expect(clientScoped.record.client_id).toBe('cnt_01J8X7100AQ4M2N8V3R5T7W9Y0');

    const invalid = projectRecord({
      type: 'document',
      id: 'doc_01J8X7100DQ4M2N8V3R5T7W9Y0',
      path: 'documents/doc_c.md',
      body: '',
      taskStatus: null,
      frontmatter: { title: 'Odd', scope: 'team' },
    });
    expect(invalid.issues.some((issue) => issue.message.includes('scope'))).toBe(true);
  });
});

describe('projectRecord — degraded records', () => {
  it('reports a missing required field but still projects', () => {
    const { record, issues } = projectRecord({
      type: 'contact',
      id: 'cnt_01J8X7100AQ4M2N8V3R5T7W9Y0',
      path: 'contacts/cnt_x.md',
      body: '',
      taskStatus: null,
      frontmatter: {},
    });

    expect(issues.map((issue) => issue.code)).toContain('schema-invalid');
    expect(issues.some((issue) => issue.message.includes('first_name'))).toBe(true);
    expect(recordTitle(record)).toBe('cnt_01J8X7100AQ4M2N8V3R5T7W9Y0');
  });

  it('keeps an unexpected enum value and reports it', () => {
    const { record, issues } = projectRecord({
      type: 'contact',
      id: 'cnt_01J8X7100AQ4M2N8V3R5T7W9Y0',
      path: 'contacts/cnt_x.md',
      body: '',
      taskStatus: null,
      frontmatter: { first_name: 'X', status: 'vip' },
    });

    if (record.type !== 'contact') throw new Error('wrong type');
    expect(record.status).toBe('vip');
    expect(issues.some((issue) => issue.message.includes('status'))).toBe(true);
  });

  it('reports a status field on a task', () => {
    const { issues } = projectRecord({
      type: 'task',
      id: 'tsk_01J8X7100AQ4M2N8V3R5T7W9Y0',
      path: 'tasks/todo/tsk_a.md',
      body: '',
      taskStatus: 'todo',
      frontmatter: { title: 'A', status: 'doing' },
    });

    expect(issues.some((issue) => issue.message.includes('belongs in the folder'))).toBe(true);
  });

  it('handles malformed line items', () => {
    const { record, issues } = projectRecord({
      type: 'invoice',
      id: 'inv_01J8X7100AQ4M2N8V3R5T7W9Y0',
      path: 'invoices/inv_a.md',
      body: '',
      taskStatus: null,
      frontmatter: { invoice_number: 'INV-1', line_items: 'not a list' },
    });

    if (record.type !== 'invoice') throw new Error('wrong type');
    expect(record.line_items).toEqual([]);
    expect(issues.some((issue) => issue.message.includes('line_items'))).toBe(true);
  });

  it('coerces numeric strings only for textual fields', () => {
    const { record } = projectRecord({
      type: 'contact',
      id: 'cnt_01J8X7100AQ4M2N8V3R5T7W9Y0',
      path: 'contacts/cnt_x.md',
      body: '',
      taskStatus: null,
      frontmatter: { first_name: 42 },
    });

    if (record.type !== 'contact') throw new Error('wrong type');
    expect(record.first_name).toBe('42');
  });
});

describe('recordTitle', () => {
  it('uses the display field and falls back to the id', () => {
    const project = projectRecord({
      type: 'project',
      id: 'proj_01J8X7100AQ4M2N8V3R5T7W9Y0',
      path: 'projects/proj_a.md',
      body: '',
      taskStatus: null,
      frontmatter: { project_name: 'Website' },
    }).record;

    expect(recordTitle(project)).toBe('Website');
  });
});

describe('writeSchemas', () => {
  it('accepts a valid contact payload and applies enum rules', () => {
    const result = writeSchemas.contact.safeParse({ first_name: 'Jane', status: 'lead' });
    expect(result.success).toBe(true);
    expect(writeSchemas.contact.safeParse({ first_name: 'Jane', status: 'vip' }).success).toBe(false);
    expect(writeSchemas.contact.safeParse({}).success).toBe(false);
  });

  it('rejects negative or fractional cents', () => {
    expect(
      writeSchemas.invoice.safeParse({ invoice_number: 'INV-1', total_cents: -1 }).success,
    ).toBe(false);
    expect(
      writeSchemas.invoice.safeParse({ invoice_number: 'INV-1', total_cents: 10.5 }).success,
    ).toBe(false);
    expect(
      writeSchemas.invoice.safeParse({ invoice_number: 'INV-1', total_cents: 1000 }).success,
    ).toBe(true);
  });

  it('rejects tax rates outside 0–10000 bps', () => {
    expect(
      writeSchemas.estimate.safeParse({ estimate_number: 'EST-1', tax_rate_bps: 10_001 }).success,
    ).toBe(false);
    expect(
      writeSchemas.estimate.safeParse({ estimate_number: 'EST-1', tax_rate_bps: 850 }).success,
    ).toBe(true);
  });

  it('validates line items strictly', () => {
    const valid = writeSchemas.invoice.safeParse({
      invoice_number: 'INV-1',
      line_items: [
        { description: 'Work', quantity: 1.5, unit_price_cents: 10_000, total_cents: 15_000 },
      ],
    });
    expect(valid.success).toBe(true);

    const invalid = writeSchemas.invoice.safeParse({
      invoice_number: 'INV-1',
      line_items: [{ description: '', quantity: 1, unit_price_cents: 1, total_cents: 1 }],
    });
    expect(invalid.success).toBe(false);
  });
});
