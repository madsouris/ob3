import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  AnyRecord,
  ContactRecord,
  ProjectRecord,
  TaskRecord,
} from '../../src/model/schemas.js';
import { commitSubjects, seedGitWorkspace, statusPorcelain } from '../helpers/git.js';
import { createTestServer } from '../helpers/server.js';
import type { TestServer } from '../helpers/server.js';
import { removeTempDir } from '../helpers/tmp.js';

let servers: TestServer[] = [];

afterEach(async () => {
  for (const server of servers) await removeTempDir(server.parent);
  servers = [];
});

const server = async (): Promise<TestServer> => {
  const created = await createTestServer({ gitDebounceMs: 60_000 });
  servers.push(created);
  return created;
};

interface ImportBody {
  readonly type: string;
  readonly rows: number;
  readonly created: number;
  readonly failed: readonly { readonly line: number; readonly message: string }[];
  readonly generation: number;
}

const runImport = async (
  test: TestServer,
  type: string,
  csv: string,
): Promise<{ status: number; body: ImportBody }> => {
  const response = await test.mutate('POST', '/api/import', { type, csv });
  return { status: response.status, body: (await response.json()) as ImportBody };
};

const createRecord = async <T extends AnyRecord>(
  test: TestServer,
  plural: string,
  fields: Record<string, unknown>,
): Promise<T> => {
  const response = await test.mutate('POST', `/api/${plural}`, fields);
  expect(response.status).toBe(201);
  return ((await response.json()) as { record: T }).record;
};

const listRecords = async <T extends AnyRecord>(test: TestServer, plural: string): Promise<T[]> => {
  const response = await test.req(`/api/${plural}`);
  return ((await response.json()) as { records: T[] }).records;
};

describe('import skeleton', () => {
  it('serves a CSV skeleton with the definition header', async () => {
    const test = await server();
    const response = await test.req('/api/import/skeleton?type=task');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toContain('tasks-skeleton.csv');
    expect((await response.text()).split('\n')[0]).toBe('title,project,column,due_date,notes');
  });

  it('needs no mutation token', async () => {
    const test = await server();
    expect((await test.req('/api/import/skeleton?type=contact')).status).toBe(200);
  });

  it('rejects an unknown type', async () => {
    const test = await server();
    const response = await test.req('/api/import/skeleton?type=invoice');

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'unknown_type',
    );
  });
});

describe('import contacts', () => {
  it('creates one record per valid row with fields and markdown body', async () => {
    const test = await server();
    const csv = [
      'first_name,last_name,email,company,notes',
      'Ada,Lovelace,ada@example.com,Analytical Engines,"First, programmer."',
      'Grace,Hopper,grace@example.com,,',
    ].join('\n');

    const { status, body } = await runImport(test, 'contact', csv);
    expect(status).toBe(200);
    expect(body).toMatchObject({ type: 'contact', rows: 2, created: 2, failed: [] });

    const contacts = await listRecords<ContactRecord>(test, 'contacts');
    expect(contacts).toHaveLength(2);

    const ada = contacts.find((contact) => contact.email === 'ada@example.com');
    expect(ada?.first_name).toBe('Ada');
    expect(ada?.company).toBe('Analytical Engines');
    expect(ada?.status).toBe('lead');

    const file = await readFile(join(test.root, ada?.path ?? ''), 'utf8');
    expect(file).toContain('First, programmer.');
  });

  it('accepts headers regardless of case and spacing', async () => {
    const test = await server();
    const { body } = await runImport(test, 'contact', 'First Name,Email\nAda,ada@example.com\n');

    expect(body.created).toBe(1);
    expect((await listRecords<ContactRecord>(test, 'contacts'))[0]?.first_name).toBe('Ada');
  });

  it('rejects a file without the required column and writes nothing', async () => {
    const test = await server();
    const response = await test.mutate('POST', '/api/import', {
      type: 'contact',
      csv: 'last_name,email\nLovelace,ada@example.com\n',
    });

    expect(response.status).toBe(422);
    const error = (await response.json()) as { error: { code: string; message: string } };
    expect(error.error.code).toBe('validation_failed');
    expect(error.error.message).toContain('first_name');
    expect(await readdir(join(test.root, 'contacts'))).toHaveLength(0);
  });

  it('skips invalid rows, keeps valid ones, and reports the spreadsheet line', async () => {
    const test = await server();
    const { body } = await runImport(
      test,
      'contact',
      ['first_name,status', 'Ada,lead', ',lead', 'Grace,not-a-status'].join('\n'),
    );

    expect(body.rows).toBe(3);
    expect(body.created).toBe(1);
    expect(body.failed).toEqual([
      { line: 3, message: 'first_name is required' },
      { line: 4, message: 'status must be one of lead, active, inactive, archived' },
    ]);
    expect(await listRecords<ContactRecord>(test, 'contacts')).toHaveLength(1);
  });

  it('requires the mutation token', async () => {
    const test = await server();
    const response = await test.req('/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'contact', csv: 'first_name\nAda\n' }),
    });

    expect(response.status).toBe(401);
  });
});

describe('import projects and tasks', () => {
  it('resolves a client by email or full name', async () => {
    const test = await server();
    const jane = await createRecord<ContactRecord>(test, 'contacts', {
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@acme.com',
    });

    const { body } = await runImport(
      test,
      'project',
      [
        'project_name,client,status',
        'Alpha,jane@acme.com,active',
        'Beta,Jane Doe,completed',
        'Gamma,nobody@example.com,active',
      ].join('\n'),
    );

    expect(body.created).toBe(2);
    expect(body.failed).toEqual([{ line: 4, message: 'Unknown contact "nobody@example.com"' }]);

    const projects = await listRecords<ProjectRecord>(test, 'projects');
    expect(projects.every((project) => project.client_id === jane.id)).toBe(true);
    expect(projects.find((project) => project.project_name === 'Beta')?.status).toBe('completed');
  });

  it('routes tasks to the column folder and normalizes the due date', async () => {
    const test = await server();
    await createRecord<ProjectRecord>(test, 'projects', { project_name: 'Website Redesign' });

    const { body } = await runImport(
      test,
      'task',
      [
        'title,project,column,due_date',
        'Hero,Website Redesign,done,2026-11-05',
        'Board,,doing,',
        'Notes,Website Redesign,,2026-02-30',
      ].join('\n'),
    );

    expect(body.created).toBe(2);
    expect(body.failed).toEqual([{ line: 4, message: 'due_date must be YYYY-MM-DD' }]);

    const tasks = await listRecords<TaskRecord>(test, 'tasks');
    const hero = tasks.find((task) => task.title === 'Hero');
    const board = tasks.find((task) => task.title === 'Board');

    expect(hero?.path.startsWith('tasks/done/')).toBe(true);
    expect(hero?.due_date).toBe('2026-11-05T00:00:00Z');
    expect(hero?.project_id).not.toBe('');
    expect(board?.path.startsWith('tasks/doing/')).toBe(true);
    expect(board?.project_id).toBe('');
  });

  it('defaults a task without a column to todo', async () => {
    const test = await server();
    const { body } = await runImport(test, 'task', 'title\nFirst task\n');

    expect(body.created).toBe(1);
    const task = (await listRecords<TaskRecord>(test, 'tasks'))[0];
    expect(task?.path.startsWith('tasks/todo/')).toBe(true);
  });
});

describe('import and git', () => {
  it('commits the whole import as one commit-on-save burst', async () => {
    const test = await server();
    await seedGitWorkspace(test.root);

    await runImport(
      test,
      'contact',
      ['first_name,email', 'Ada,ada@example.com', 'Grace,grace@example.com'].join('\n'),
    );
    await test.git.flush();

    expect(await statusPorcelain(test.root)).toBe('');
    expect((await commitSubjects(test.root))[0]).toBe('ob: save 2 files');
  });
});
