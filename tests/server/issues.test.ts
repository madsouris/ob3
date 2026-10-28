import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestServer } from '../helpers/server.js';
import type { TestServer } from '../helpers/server.js';
import { removeTempDir } from '../helpers/tmp.js';

let servers: TestServer[] = [];

afterEach(async () => {
  for (const server of servers) await removeTempDir(server.parent);
  servers = [];
});

async function server(fixture: string): Promise<TestServer> {
  const created = await createTestServer({ fixture });
  servers.push(created);
  return created;
}

interface IssuePayload {
  key: string;
  code: string;
  path: string;
  severity: string;
}

async function issuesOf(test: TestServer): Promise<IssuePayload[]> {
  const response = await test.req('/api/issues');
  const body = (await response.json()) as { issues: IssuePayload[] };
  return body.issues;
}

const issueWith = (issues: IssuePayload[], code: string): IssuePayload => {
  const found = issues.find((issue) => issue.code === code);
  if (found === undefined) throw new Error(`No ${code} issue`);
  return found;
};

describe('issue listing', () => {
  it('returns every issue from the fixture', async () => {
    const test = await server('external-edits');
    const issues = await issuesOf(test);
    expect(issues).toHaveLength(7);
    expect(new Set(issues.map((issue) => issue.code))).toEqual(
      new Set([
        'conflict-marker',
        'dangling-ref',
        'duplicate-id',
        'duplicate-number',
        'missing-id',
        'orphan-task-path',
        'parse-error',
      ]),
    );
  });

  it('404s for an unknown key', async () => {
    const test = await server('external-edits');
    const response = await test.req(`/api/issues/${encodeURIComponent('nope:missing.md')}/preview`);
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('unknown_issue');
  });
});

describe('issue preview', () => {
  it('returns the raw file for a parse error', async () => {
    const test = await server('external-edits');
    const target = issueWith(await issuesOf(test), 'parse-error');
    const response = await test.req(`/api/issues/${encodeURIComponent(target.key)}/preview`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { raw: string; frontmatter: unknown; reason?: string };
    expect(body.raw).toContain('[unclosed');
    expect(body.frontmatter).toBeNull();
    expect(body.reason).toBe('parse-error');
  });
});

describe('assign-id', () => {
  it('writes an id, keeps the body, and clears the issue', async () => {
    const test = await server('external-edits');
    const target = issueWith(await issuesOf(test), 'missing-id');

    const response = await test.mutate(
      'POST',
      `/api/issues/${encodeURIComponent(target.key)}/resolve`,
      { action: 'assign-id' },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string };
    expect(body.id).toMatch(/^cnt_[0-9A-HJKMNP-TV-Z]{26}$/);

    const updated = await readFile(join(test.root, target.path), 'utf8');
    expect(updated).toContain(`id: ${body.id}`);
    expect(updated).toContain('No id in frontmatter');

    const after = await issuesOf(test);
    expect(after.some((issue) => issue.code === 'missing-id')).toBe(false);
    expect(test.context.index.getById(body.id)).not.toBeNull();
  });

  it('refuses assign-id on an unrelated issue', async () => {
    const test = await server('external-edits');
    const target = issueWith(await issuesOf(test), 'dangling-ref');
    const response = await test.mutate(
      'POST',
      `/api/issues/${encodeURIComponent(target.key)}/resolve`,
      { action: 'assign-id' },
    );
    expect(response.status).toBe(409);
  });
});

describe('adopt-path', () => {
  it('moves an orphan task into a column', async () => {
    const test = await server('external-edits');
    const target = issueWith(await issuesOf(test), 'orphan-task-path');

    const response = await test.mutate(
      'POST',
      `/api/issues/${encodeURIComponent(target.key)}/resolve`,
      { action: 'adopt-path', to: 'doing' },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { path: string };
    expect(body.path).toBe('tasks/doing/tsk_orphan.md');

    const record = test.context.index.getById('tsk_01J8X8100FQ4M2N8V3R5T7W9Y0')?.record;
    expect(record?.type).toBe('task');
    if (record?.type === 'task') expect(record.status).toBe('doing');
    expect((await issuesOf(test)).some((issue) => issue.code === 'orphan-task-path')).toBe(false);
  });
});

describe('ignore', () => {
  it('persists an ignored key in .ob/state and hides the issue', async () => {
    const test = await server('external-edits');
    const target = issueWith(await issuesOf(test), 'dangling-ref');

    const response = await test.mutate(
      'POST',
      `/api/issues/${encodeURIComponent(target.key)}/resolve`,
      { action: 'ignore' },
    );
    expect(response.status).toBe(200);

    const after = await issuesOf(test);
    expect(after.some((issue) => issue.key === target.key)).toBe(false);

    const stored = await readFile(join(test.root, '.ob/state/ignored-issues.json'), 'utf8');
    expect(JSON.parse(stored)).toContain(target.key);
  });
});

describe('validation', () => {
  it('rejects an unknown action', async () => {
    const test = await server('external-edits');
    const target = issueWith(await issuesOf(test), 'dangling-ref');
    const response = await test.mutate(
      'POST',
      `/api/issues/${encodeURIComponent(target.key)}/resolve`,
      { action: 'delete-file' },
    );
    expect(response.status).toBe(422);
  });
});
