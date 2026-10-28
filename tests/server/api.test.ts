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

describe('money on write', () => {
  it('computes cents from line items and the configured tax rate', async () => {
    const test = await server('demo');
    const response = await test.mutate('POST', '/api/invoices', {
      invoice_number: 'INV-2026-900',
      line_items: [{ description: 'Work', quantity: 2, unit_price_cents: 50_000 }],
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
      };
    };
    expect(body.record.subtotal_cents).toBe(100_000);
    expect(body.record.tax_rate_bps).toBe(850);
    expect(body.record.tax_amount_cents).toBe(8_500);
    expect(body.record.total_cents).toBe(108_500);
    expect(body.record.currency).toBe('USD');
    expect(body.record.line_items[0]?.total_cents).toBe(100_000);
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
      };
    };
    expect(body.record.estimate_id).toBe(estimateId);
    expect(body.record.invoice_number).toMatch(/^INV-\d{4}-\d{3}$/);
    expect(body.record.subtotal_cents).toBe(250_000);
    expect(body.record.total_cents).toBe(271_250);
    expect(body.record.status).toBe('draft');

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
