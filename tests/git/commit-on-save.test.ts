import { chmod, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestServer } from '../helpers/server.js';
import type { TestServer } from '../helpers/server.js';
import { commitSubjects, git, seedGitWorkspace, statusPorcelain } from '../helpers/git.js';
import { removeTempDir } from '../helpers/tmp.js';

let servers: TestServer[] = [];

afterEach(async () => {
  for (const server of servers) await removeTempDir(server.parent);
  servers = [];
});

/** A long debounce keeps tests deterministic: every assertion flushes explicitly. */
async function repoServer(): Promise<TestServer> {
  const server = await createTestServer({ fixture: 'demo', gitDebounceMs: 60_000 });
  await seedGitWorkspace(server.root);
  servers.push(server);
  return server;
}

interface CreatedContact {
  readonly id: string;
  readonly path: string;
}

async function createContact(server: TestServer, first: string): Promise<CreatedContact> {
  const response = await server.mutate('POST', '/api/contacts', {
    first_name: first,
    last_name: 'Tester',
    email: `${first.toLowerCase()}@example.com`,
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { record: { id: string; path: string } };
  return { id: body.record.id, path: body.record.path };
}

describe('commit-on-save', () => {
  it('commits only the saved record and leaves the tree clean', async () => {
    const server = await repoServer();
    const created = await createContact(server, 'Grace');

    await server.git.flush();

    expect(await statusPorcelain(server.root)).toBe('');
    const subjects = await commitSubjects(server.root);
    expect(subjects[0]).toBe(`ob: save contact ${created.id}`);
  });

  it('never sweeps an unrelated external edit into the commit', async () => {
    const server = await repoServer();
    await writeFile(join(server.root, 'README.md'), '# my notes\n', 'utf8');
    const created = await createContact(server, 'Ada');

    await server.git.flush();

    const porcelain = await statusPorcelain(server.root);
    expect(porcelain).toContain('?? README.md');
    expect(porcelain).not.toContain(created.path);
    await expect(commitSubjects(server.root)).resolves.toContain(`ob: save contact ${created.id}`);
  });

  it('coalesces a burst of writes into one commit', async () => {
    const server = await repoServer();
    const before = (await commitSubjects(server.root)).length;

    await createContact(server, 'Barbara');
    await createContact(server, 'Katherine');
    await server.git.flush();

    const subjects = await commitSubjects(server.root);
    expect(subjects.length).toBe(before + 1);
    expect(subjects[0]).toBe('ob: save 2 files');
    expect(await statusPorcelain(server.root)).toBe('');
  });

  it('commits deletes and task moves', async () => {
    const server = await repoServer();
    const created = await createContact(server, 'Margaret');
    await server.git.flush();

    const deleted = await server.mutate('DELETE', `/api/contacts/${created.id}`);
    expect(deleted.status).toBe(204);
    await server.git.flush();
    expect(await statusPorcelain(server.root)).toBe('');
    expect((await commitSubjects(server.root))[0]).toBe(`ob: save contact ${created.id}`);

    const taskId = 'tsk_01J8X7300AQ4M2N8V3R5T7W9Y0';
    const moved = await server.mutate('POST', `/api/tasks/${taskId}/move`, { to: 'doing' });
    expect(moved.status).toBe(200);
    await server.git.flush();
    expect(await statusPorcelain(server.root)).toBe('');
    expect((await commitSubjects(server.root))[0]).toBe(`ob: save task ${taskId}`);
  });

  it('ignores a record created and deleted inside one debounce window', async () => {
    const server = await repoServer();
    const before = (await commitSubjects(server.root)).length;

    const created = await createContact(server, 'Edith');
    const deleted = await server.mutate('DELETE', `/api/contacts/${created.id}`);
    expect(deleted.status).toBe(204);

    await server.git.flush();

    expect(await commitSubjects(server.root)).toHaveLength(before);
    expect(await statusPorcelain(server.root)).toBe('');
    expect((await server.git.status({ force: true })).error).toBeNull();
  });

  it('commits a resolved issue', async () => {
    const server = await createTestServer({ fixture: 'external-edits', gitDebounceMs: 60_000 });
    await seedGitWorkspace(server.root);
    servers.push(server);

    const listing = (await (await server.req('/api/issues')).json()) as {
      issues: { key: string; code: string }[];
    };
    const missing = listing.issues.find((issue) => issue.code === 'missing-id');
    expect(missing).toBeDefined();
    if (missing === undefined) return;

    const resolved = await server.mutate(
      'POST',
      `/api/issues/${encodeURIComponent(missing.key)}/resolve`,
      { action: 'assign-id' },
    );
    expect(resolved.status).toBe(200);
    const body = (await resolved.json()) as { id: string };

    await server.git.flush();

    expect(await statusPorcelain(server.root)).toBe('');
    expect((await commitSubjects(server.root))[0]).toMatch(
      new RegExp(`^ob: save contact ${body.id}$`),
    );
  });

  it('honours commit_on_save: false and reports dirty', async () => {
    const server = await repoServer();
    const patched = await server.mutate('PATCH', '/api/config', {
      git: { commit_on_save: false },
    });
    expect(patched.status).toBe(200);
    await server.git.flush();

    const head = (await git(server.root, ['rev-parse', 'HEAD'])).trim();
    const created = await createContact(server, 'Dorothy');
    await server.git.flush();

    const status = await server.git.status({ force: true });
    expect(status.dirty).toBe(true);
    expect(status.error).toBeNull();
    expect(await statusPorcelain(server.root)).toContain(created.path);
    expect((await commitSubjects(server.root))[0]).not.toBe(`ob: save contact ${created.id}`);
    expect((await git(server.root, ['rev-parse', 'HEAD'])).trim()).toBe(head);
  });

  it('keeps the file when a hook rejects the commit and recovers afterwards', async () => {
    const server = await repoServer();
    const hook = join(server.root, '.git/hooks/pre-commit');
    await writeFile(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    await chmod(hook, 0o755);

    const created = await createContact(server, 'Hedy');
    await server.git.flush();

    const failed = await server.git.status({ force: true });
    expect(failed.error?.code).toBe('hook_rejected');
    expect(failed.dirty).toBe(true);
    expect(await statusPorcelain(server.root)).toContain(created.path);

    await rm(hook);

    const patched = await server.mutate('PATCH', `/api/contacts/${created.id}`, {
      status: 'active',
    });
    expect(patched.status).toBe(200);
    await server.git.flush();

    const recovered = await server.git.status({ force: true });
    expect(recovered.error).toBeNull();
    expect(recovered.dirty).toBe(false);
  });
});
