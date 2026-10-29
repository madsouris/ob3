import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { splitFrontmatter } from '../../src/model/frontmatter.js';
import { createTestServer } from '../helpers/server.js';
import type { TestServer } from '../helpers/server.js';
import { removeTempDir } from '../helpers/tmp.js';

let servers: TestServer[] = [];

afterEach(async () => {
  for (const server of servers) await removeTempDir(server.parent);
  servers = [];
});

async function server(fixture?: string): Promise<TestServer> {
  const created = await createTestServer(fixture === undefined ? {} : { fixture });
  servers.push(created);
  return created;
}

describe('record CRUD', () => {
  it('creates, reads, patches and deletes a contact', async () => {
    const test = await server();

    const created = await test.mutate('POST', '/api/contacts', {
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      record: { id: string; status: string; path: string };
      hash: string;
    };
    const id = createdBody.record.id;
    expect(id).toMatch(/^cnt_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(createdBody.record.status).toBe('lead');
    expect(await readdir(join(test.root, 'contacts'))).toHaveLength(1);

    const fetched = await test.req(`/api/contacts/${id}`);
    expect(fetched.status).toBe(200);
    const fetchedBody = (await fetched.json()) as { hash: string; record: { first_name: string } };
    expect(fetchedBody.record.first_name).toBe('Ada');
    expect(fetchedBody.hash).toBe(createdBody.hash);

    const patched = await test.mutate('PATCH', `/api/contacts/${id}`, {
      status: 'active',
      baseHash: createdBody.hash,
    });
    expect(patched.status).toBe(200);
    const patchedBody = (await patched.json()) as {
      hash: string;
      record: { status: string; updated_at: string };
    };
    expect(patchedBody.record.status).toBe('active');
    expect(patchedBody.hash).not.toBe(createdBody.hash);

    const stale = await test.mutate('PATCH', `/api/contacts/${id}`, {
      status: 'inactive',
      baseHash: createdBody.hash,
    });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe('file_changed_on_disk');

    const deleted = await test.mutate('DELETE', `/api/contacts/${id}`);
    expect(deleted.status).toBe(204);
    expect((await test.req(`/api/contacts/${id}`)).status).toBe(404);
    expect(await readdir(join(test.root, 'contacts'))).toHaveLength(0);
  });

  it('rejects an invalid payload with per-field issues', async () => {
    const test = await server();
    const response = await test.mutate('POST', '/api/contacts', {});
    expect(response.status).toBe(422);
    const body = (await response.json()) as {
      error: { code: string; details: { issues: { path: string }[] } };
    };
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details.issues.some((issue) => issue.path === 'first_name')).toBe(true);
  });

  it('rejects an invalid id without touching the filesystem', async () => {
    const test = await server();
    const response = await test.req('/api/contacts/bad.id');
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('invalid_id');
  });

  it('filters by status and query', async () => {
    const test = await server('demo');
    const active = await test.req('/api/contacts?status=active');
    const activeBody = (await active.json()) as { records: { status: string }[] };
    expect(activeBody.records).toHaveLength(1);

    const searched = await test.req('/api/contacts?q=northwind');
    const searchedBody = (await searched.json()) as { records: { id: string }[] };
    expect(searchedBody.records).toHaveLength(1);
  });
});

describe('documents', () => {
  const clientId = 'cnt_01J8X7100BQ4M2N8V3R5T7W9Y0';

  it('accepts a new kind and rejects an unknown one', async () => {
    const test = await server('demo');

    const accepted = await test.mutate('POST', '/api/documents', {
      title: 'Signed statement of work',
      kind: 'sow',
    });
    expect(accepted.status).toBe(201);
    const acceptedBody = (await accepted.json()) as { record: { kind: string } };
    expect(acceptedBody.record.kind).toBe('sow');

    const rejected = await test.mutate('POST', '/api/documents', {
      title: 'Mystery',
      kind: 'invoice',
    });
    expect(rejected.status).toBe(422);
    const rejectedBody = (await rejected.json()) as { error: { code: string } };
    expect(rejectedBody.error.code).toBe('validation_failed');
  });

  it('stores a client-scoped document and defaults to global otherwise', async () => {
    const test = await server('demo');

    const scoped = await test.mutate('POST', '/api/documents', {
      title: 'Onboarding contract',
      kind: 'proposal',
      scope: 'client',
      client_id: clientId,
      body: '# Welcome',
    });
    expect(scoped.status).toBe(201);
    const scopedBody = (await scoped.json()) as {
      record: { id: string; scope: string; client_id: string; path: string };
    };
    expect(scopedBody.record.scope).toBe('client');
    expect(scopedBody.record.client_id).toBe(clientId);
    expect(scopedBody.record.path).toMatch(/^documents\//);

    const global = await test.mutate('POST', '/api/documents', { title: 'Terms' });
    expect(global.status).toBe(201);
    const globalBody = (await global.json()) as {
      record: { scope: string; client_id: string };
    };
    expect(globalBody.record.scope).toBe('global');
    expect(globalBody.record.client_id).toBe('');

    const fetched = await test.req(`/api/documents/${scopedBody.record.id}`);
    expect(fetched.status).toBe(200);
    const fetchedBody = (await fetched.json()) as { record: { scope: string; client_id: string } };
    expect(fetchedBody.record.scope).toBe('client');
    expect(fetchedBody.record.client_id).toBe(clientId);
  });
});

describe('money on write', () => {
  it('computes cents from line items and the configured tax rate', async () => {
    const test = await server('demo');
    const response = await test.mutate('POST', '/api/invoices', {
      invoice_number: 'INV-2026-900',
      line_items: [{ description: 'Work', quantity: 2, unit_price_cents: 50_000 }],
      document_ids: ['doc_01J8X7500AQ4M2N8V3R5T7W9Y0'],
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      record: {
        subtotal_cents: number;
        tax_rate_bps: number;
        tax_amount_cents: number;
        total_cents: number;
        currency: string;
        line_items: { total_cents: number }[];
        document_ids: string[];
      };
    };
    expect(body.record.subtotal_cents).toBe(100_000);
    expect(body.record.tax_rate_bps).toBe(850);
    expect(body.record.tax_amount_cents).toBe(8_500);
    expect(body.record.total_cents).toBe(108_500);
    expect(body.record.currency).toBe('USD');
    expect(body.record.line_items[0]?.total_cents).toBe(100_000);
    expect(body.record.document_ids).toEqual(['doc_01J8X7500AQ4M2N8V3R5T7W9Y0']);
  });

  it('flags an attachment id that points at a missing document', async () => {
    const test = await server('demo');
    const created = await test.mutate('POST', '/api/invoices', {
      invoice_number: 'INV-2026-777',
      document_ids: ['doc_01J8X7500ZQ4M2N8V3R5T7W9Y0'],
    });
    expect(created.status).toBe(201);

    const listing = (await (await test.req('/api/issues')).json()) as {
      issues: { code: string; message: string }[];
    };
    expect(
      listing.issues.some(
        (issue) => issue.code === 'dangling-ref' && issue.message.includes('document_ids'),
      ),
    ).toBe(true);
  });
});

describe('task moves', () => {
  it('moves a card between folders and keeps one file', async () => {
    const test = await server('demo');
    const task = test.context.index
      .boardTasks('todo')
      .find((entry) => entry.record.id === 'tsk_01J8X7300AQ4M2N8V3R5T7W9Y0');
    expect(task).toBeDefined();

    const response = await test.mutate('POST', '/api/tasks/tsk_01J8X7300AQ4M2N8V3R5T7W9Y0/move', {
      to: 'doing',
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { record: { status: string; path: string } };
    expect(body.record.status).toBe('doing');
    expect(body.record.path).toBe('tasks/doing/tsk_homepage-hero.md');
    expect(test.context.index.boardTasks('doing')).toHaveLength(2);
    expect(test.context.index.boardTasks('todo')).toHaveLength(1);
  });

  it('reorders within a column through afterId and beforeId', async () => {
    const test = await server('demo');
    const first = 'tsk_01J8X7300AQ4M2N8V3R5T7W9Y0';
    const second = 'tsk_01J8X7300BQ4M2N8V3R5T7W9Y0';
    const order = (): string[] =>
      test.context.index.boardTasks('todo').map((entry) => entry.record.id);
    expect(order()).toEqual([first, second]);

    const down = await test.mutate('POST', `/api/tasks/${first}/move`, {
      to: 'todo',
      afterId: second,
    });
    expect(down.status).toBe(200);
    const downBody = (await down.json()) as { record: { path: string } };
    expect(downBody.record.path).toBe('tasks/todo/tsk_homepage-hero.md');
    expect(order()).toEqual([second, first]);

    const up = await test.mutate('POST', `/api/tasks/${first}/move`, {
      to: 'todo',
      beforeId: second,
    });
    expect(up.status).toBe(200);
    expect(order()).toEqual([first, second]);
  });

  it('rejects a move for a non-task id', async () => {
    const test = await server('demo');
    const response = await test.mutate(
      'POST',
      '/api/tasks/cnt_01J8X7100AQ4M2N8V3R5T7W9Y0/move',
      { to: 'done' },
    );
    expect(response.status).toBe(404);
  });
});

describe('estimate conversion', () => {
  it('creates an invoice, links both directions, and refuses a second conversion', async () => {
    const test = await server('demo');
    const estimateId = 'est_01J8X7000AQ4M2N8V3R5T7W9Y0';
    const documentId = 'doc_01J8X7500AQ4M2N8V3R5T7W9Y0';

    const patched = await test.mutate('PATCH', `/api/estimates/${estimateId}`, {
      document_ids: [documentId],
    });
    expect(patched.status).toBe(200);

    const response = await test.mutate(
      'POST',
      `/api/invoices/from-estimate/${estimateId}`,
    );
    expect(response.status).toBe(201);

    const body = (await response.json()) as {
      record: {
        id: string;
        invoice_number: string;
        estimate_id: string;
        subtotal_cents: number;
        total_cents: number;
        status: string;
        document_ids: string[];
      };
    };
    expect(body.record.estimate_id).toBe(estimateId);
    expect(body.record.invoice_number).toMatch(/^INV-\d{4}-\d{3}$/);
    expect(body.record.subtotal_cents).toBe(250_000);
    expect(body.record.total_cents).toBe(271_250);
    expect(body.record.status).toBe('draft');
    expect(body.record.document_ids).toEqual([documentId]);

    const estimate = test.context.index.getById(estimateId)?.record;
    expect(estimate?.type).toBe('estimate');
    if (estimate?.type === 'estimate') {
      expect(estimate.converted_invoice_id).toBe(body.record.id);
    }

    const second = await test.mutate('POST', `/api/invoices/from-estimate/${estimateId}`);
    expect(second.status).toBe(409);
    expect((await second.json()).error.code).toBe('conflict');
  });
});

describe('duplicate', () => {
  const sourceEstimate = 'est_01J8X7000AQ4M2N8V3R5T7W9Y0';
  const sourceInvoice = 'inv_01J8X7400AQ4M2N8V3R5T7W9Y0';

  it('clones an estimate into a fresh draft and leaves the source byte-identical', async () => {
    const test = await server('demo');
    const year = new Date().toISOString().slice(0, 4);
    const documentId = 'doc_01J8X7500AQ4M2N8V3R5T7W9Y0';

    const patched = await test.mutate('PATCH', `/api/estimates/${sourceEstimate}`, {
      document_ids: [documentId],
    });
    expect(patched.status).toBe(200);

    const sourcePath = join(test.root, 'estimates/est_2026-001.md');
    const before = await readFile(sourcePath, 'utf8');

    const seeded = await test.mutate('POST', '/api/estimates', {
      estimate_number: `EST-${year}-007`,
      title: 'Numbering seed',
    });
    expect(seeded.status).toBe(201);

    const response = await test.mutate('POST', `/api/estimates/${sourceEstimate}/duplicate`);
    expect(response.status).toBe(201);

    const body = (await response.json()) as {
      record: {
        id: string;
        path: string;
        estimate_number: string;
        status: string;
        title: string;
        valid_until: string;
        converted_invoice_id: string;
        subtotal_cents: number;
        tax_amount_cents: number;
        total_cents: number;
        line_items: { description: string; total_cents: number }[];
        document_ids: string[];
        body: string;
      };
    };

    expect(body.record.id).toMatch(/^est_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(body.record.id).not.toBe(sourceEstimate);
    expect(body.record.estimate_number).toBe(`EST-${year}-008`);
    expect(body.record.status).toBe('draft');
    expect(body.record.title).toBe('Website Redesign — Proposal (copy)');
    expect(body.record.valid_until).not.toBe('');
    expect(body.record.converted_invoice_id).toBe('');
    expect(body.record.path).toMatch(/^estimates\//);
    expect(body.record.line_items).toHaveLength(2);
    expect(body.record.line_items[0]?.description).toBe('Discovery & UX research');
    expect(body.record.subtotal_cents).toBe(250_000);
    expect(body.record.tax_amount_cents).toBe(21_250);
    expect(body.record.total_cents).toBe(271_250);
    expect(body.record.document_ids).toEqual([documentId]);
    expect(body.record.body).toContain('Three-week engagement');

    expect(await readFile(sourcePath, 'utf8')).toBe(before);
  });

  it('clones an invoice with a new number and keeps the estimate backlink', async () => {
    const test = await server('demo');
    const year = new Date().toISOString().slice(0, 4);

    const seeded = await test.mutate('POST', '/api/invoices', {
      invoice_number: `INV-${year}-007`,
      title: 'Numbering seed',
    });
    expect(seeded.status).toBe(201);

    const response = await test.mutate('POST', `/api/invoices/${sourceInvoice}/duplicate`);
    expect(response.status).toBe(201);

    const body = (await response.json()) as {
      record: {
        id: string;
        invoice_number: string;
        estimate_id: string;
        status: string;
        title: string;
        due_date: string;
        total_cents: number;
        body: string;
      };
    };

    expect(body.record.invoice_number).toBe(`INV-${year}-008`);
    expect(body.record.estimate_id).toBe(sourceEstimate);
    expect(body.record.status).toBe('draft');
    expect(body.record.title).toBe('Initial Project Deposit (copy)');
    expect(body.record.due_date).not.toBe('');
    expect(body.record.total_cents).toBe(271_250);
    expect(body.record.body).toContain('Payment due within 15 days');
  });

  it('refuses to duplicate a non-billing record', async () => {
    const test = await server('demo');
    const response = await test.mutate(
      'POST',
      '/api/contacts/cnt_01J8X7100AQ4M2N8V3R5T7W9Y0/duplicate',
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('invalid_duplicate');
  });
});

describe('search API', () => {
  it('searches across types, filters by type, and honours the limit', async () => {
    const test = await server('demo');

    const all = await test.req('/api/search?q=northwind');
    expect(all.status).toBe(200);
    const allBody = (await all.json()) as {
      query: string;
      hits: { id: string; type: string; title: string; path: string }[];
      generation: number;
    };
    expect(allBody.query).toBe('northwind');
    expect(allBody.generation).toBe(test.context.index.generation);
    expect(allBody.hits.length).toBeGreaterThan(0);
    expect(allBody.hits.every((hit) => hit.type === 'contact')).toBe(true);
    expect(allBody.hits[0]?.title).toContain('Jane');
    expect(allBody.hits[0]?.path).toMatch(/^contacts\//);

    const typed = await test.req('/api/search?q=redesign&type=project');
    const typedBody = (await typed.json()) as { hits: { type: string; title: string }[] };
    expect(typedBody.hits).toHaveLength(1);
    expect(typedBody.hits[0]?.type).toBe('project');
    expect(typedBody.hits[0]?.title).toBe('Website Redesign');

    const limited = await test.req('/api/search?q=redesign&limit=1');
    const limitedBody = (await limited.json()) as { hits: unknown[] };
    expect(limitedBody.hits).toHaveLength(1);

    const empty = await test.req('/api/search?q=');
    const emptyBody = (await empty.json()) as { hits: unknown[] };
    expect(emptyBody.hits).toHaveLength(0);
  });

  it('rebuilds after a mutation and drops a deleted record', async () => {
    const test = await server('demo');

    const created = await test.mutate('POST', '/api/contacts', {
      first_name: 'Zephyrine',
      last_name: 'Quill',
      company: 'Quillworks',
    });
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { record: { id: string } }).record.id;

    const before = await test.req('/api/search?q=zephyrine');
    const beforeBody = (await before.json()) as { hits: { id: string }[] };
    expect(beforeBody.hits.map((hit) => hit.id)).toContain(id);

    const deleted = await test.mutate('DELETE', `/api/contacts/${id}`);
    expect(deleted.status).toBe(204);

    const after = await test.req('/api/search?q=zephyrine');
    const afterBody = (await after.json()) as { hits: { id: string }[] };
    expect(afterBody.hits).toHaveLength(0);
  });
});

describe('body updates', () => {
  it('replaces the markdown body without touching frontmatter', async () => {
    const test = await server('demo');
    const id = 'cnt_01J8X7100BQ4M2N8V3R5T7W9Y0';
    const before = await readFile(join(test.root, 'contacts/cnt_jane-doe.md'), 'utf8');

    const response = await test.mutate('PATCH', `/api/contacts/${id}`, {
      body: '## New notes\n\nHand-written body.\n',
    });
    expect(response.status).toBe(200);

    const after = await readFile(join(test.root, 'contacts/cnt_jane-doe.md'), 'utf8');
    expect(after).toContain('Hand-written body.');
    expect(after).toContain('first_name: Jane');

    const normalize = (text: string): string =>
      splitFrontmatter(text).frontmatterSource.replace(/^updated_at:.*$/m, 'updated_at: <now>');
    expect(normalize(after)).toBe(normalize(before));
    expect(splitFrontmatter(after).body).toBe('## New notes\n\nHand-written body.\n');
  });
});

describe('config API', () => {
  it('reads and patches the workspace config', async () => {
    const test = await server();
    const initial = (await (await test.req('/api/config')).json()) as {
      config: { business: { name: string; currency: string } };
    };
    expect(initial.config.business.currency).toBe('USD');

    const patched = await test.mutate('PATCH', '/api/config', {
      business: { name: 'Studio Nine' },
    });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { config: { business: { name: string } } }).config.business.name).toBe(
      'Studio Nine',
    );

    const reread = (await (await test.req('/api/config')).json()) as {
      config: { business: { name: string } };
    };
    expect(reread.config.business.name).toBe('Studio Nine');
  });

  it('rejects an invalid patch', async () => {
    const test = await server();
    const response = await test.mutate('PATCH', '/api/config', {
      business: { currency: 'dollars' },
    });
    expect(response.status).toBe(422);
  });
});

describe('SSE', () => {
  it('sends a snapshot on connect', async () => {
    const test = await server();
    const response = await test.req('/api/events');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const chunk = await reader?.read();
    const text = new TextDecoder().decode(chunk?.value);
    expect(text).toContain('event: snapshot');
    await reader?.cancel();
  });

  it('publishes record events on mutation', async () => {
    const test = await server();
    const events: string[] = [];
    test.context.bus.subscribe((event) => events.push(event.event));

    await test.mutate('POST', '/api/contacts', { first_name: 'Event' });
    expect(events).toContain('record.upsert');
  });
});
