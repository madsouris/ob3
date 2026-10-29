import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GITIGNORE_CONTENT } from '../../src/workspace/paths.js';
import { commitSubjects, createBareOrigin, git, seedGitWorkspace } from '../helpers/git.js';
import { createTestServer } from '../helpers/server.js';
import type { TestServer } from '../helpers/server.js';
import { removeTempDir } from '../helpers/tmp.js';

let servers: TestServer[] = [];

afterEach(async () => {
  for (const server of servers) await removeTempDir(server.parent);
  servers = [];
});

async function server(fixture?: string): Promise<TestServer> {
  const created = await createTestServer({
    ...(fixture === undefined ? {} : { fixture }),
    gitDebounceMs: 60_000,
  });
  servers.push(created);
  return created;
}

describe('git API', () => {
  it('reports an uninitialized repository', async () => {
    const test = await server('demo');
    const response = await test.req('/api/git/status');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: { initialized: boolean; syncState: string; dirty: boolean };
    };
    expect(body.status.initialized).toBe(false);
    expect(body.status.syncState).toBe('idle');
    expect(body.status.dirty).toBe(false);
  });

  it('requires the mutation token', async () => {
    const test = await server('demo');
    const response = await test.req('/api/git/init', { method: 'POST' });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('invalid_token');
  });

  it('initializes a repository with a gitignore and an initial commit', async () => {
    const test = await server('demo');
    const response = await test.mutate('POST', '/api/git/init');
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      ok: boolean;
      initialized: boolean;
      warning: string | null;
      status: { initialized: boolean; dirty: boolean; branch: string };
    };
    expect(body.ok).toBe(true);
    expect(body.initialized).toBe(true);
    expect(body.warning).toBeNull();
    expect(body.status.initialized).toBe(true);
    expect(body.status.dirty).toBe(false);
    expect(body.status.branch).toBe('main');

    expect(await readFile(join(test.root, '.gitignore'), 'utf8')).toBe(GITIGNORE_CONTENT);
    expect((await commitSubjects(test.root))[0]).toBe('ob: initialize workspace');
  });

  it('never rewrites a user gitignore and warns instead', async () => {
    const test = await server('demo');
    const userFile = '# mine\nnode_modules/\n';
    await writeFile(join(test.root, '.gitignore'), userFile, 'utf8');

    const response = await test.mutate('POST', '/api/git/init');
    const body = (await response.json()) as { ok: boolean; warning: string | null };
    expect(body.ok).toBe(true);
    expect(body.warning).toContain('.ob/state/');
    expect(await readFile(join(test.root, '.gitignore'), 'utf8')).toBe(userFile);
  });

  it('configures a remote, pushes, and syncs a saved record', async () => {
    const test = await server('demo');
    await seedGitWorkspace(test.root);
    const origin = await createBareOrigin(test.parent);

    const remote = await test.mutate('POST', '/api/git/remote', { url: origin, push: true });
    expect(remote.status).toBe(200);
    const remoteBody = (await remote.json()) as {
      ok: boolean;
      status: { remote: string; unpushed: boolean };
    };
    expect(remoteBody.ok).toBe(true);
    expect(remoteBody.status.remote).toBe(origin);
    expect(remoteBody.status.unpushed).toBe(false);

    const created = await test.mutate('POST', '/api/contacts', {
      first_name: 'Frances',
      last_name: 'Allen',
    });
    expect(created.status).toBe(201);
    await test.git.flush();

    const sync = await test.mutate('POST', '/api/git/sync');
    expect(sync.status).toBe(200);
    const syncBody = (await sync.json()) as {
      ok: boolean;
      error: { code: string } | null;
      steps: { name: string }[];
      status: { dirty: boolean; unpushed: boolean };
    };
    expect(syncBody.ok).toBe(true);
    expect(syncBody.error).toBeNull();
    expect(syncBody.steps.map((step) => step.name)).toEqual(['add', 'commit', 'pull', 'push']);
    expect(syncBody.status.dirty).toBe(false);
    expect(syncBody.status.unpushed).toBe(false);

    const subjects = await commitSubjects(origin);
    expect(subjects.some((subject) => subject.startsWith('ob: save contact '))).toBe(true);
  });

  it('validates recovery and remote payloads', async () => {
    const test = await server('demo');

    const badAction = await test.mutate('POST', '/api/git/recover', { action: 'reset-hard' });
    expect(badAction.status).toBe(422);
    expect((await badAction.json()).error.code).toBe('validation_failed');

    const badRemote = await test.mutate('POST', '/api/git/remote', { url: 'not a url' });
    expect(badRemote.status).toBe(200);
    const body = (await badRemote.json()) as { ok: boolean; error: { code: string } | null };
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe('git_failed');
  });

  it('never stages the session token when .gitignore omits .ob/state', async () => {
    const test = await server('demo');
    await writeFile(join(test.root, '.gitignore'), 'node_modules/\n', 'utf8');
    await mkdir(join(test.root, '.ob/state'), { recursive: true });
    await writeFile(join(test.root, '.ob/state/session.json'), '{"token":"secret"}\n', 'utf8');

    const init = await test.mutate('POST', '/api/git/init');
    const body = (await init.json()) as { ok: boolean; warning: string | null };
    expect(body.ok).toBe(true);
    expect(body.warning).toContain('.ob/state/');

    await test.git.sync();

    const tracked = await git(test.root, ['ls-files']);
    expect(tracked).not.toContain('.ob/state');
    expect(tracked).toContain('.ob/config.json');
    expect(await readFile(join(test.root, '.gitignore'), 'utf8')).toBe('node_modules/\n');
  });

  it('reports a parent repository without creating a nested one', async () => {
    const test = await server('demo');
    await git(test.parent, ['init', '--quiet', '--initial-branch=main']);

    const init = await test.mutate('POST', '/api/git/init');
    const body = (await init.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('repo_outside_workspace');
    await expect(git(test.root, ['rev-parse', '--show-toplevel'])).resolves.toContain(
      test.parent.split('/').pop() ?? '',
    );
  });
});
