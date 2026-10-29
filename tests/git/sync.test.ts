import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestServer } from '../helpers/server.js';
import type { TestServer } from '../helpers/server.js';
import {
  cloneRepo,
  commitAll,
  commitSubjects,
  createBareOrigin,
  git,
  seedGitWorkspace,
  statusPorcelain,
} from '../helpers/git.js';
import { removeTempDir } from '../helpers/tmp.js';

let servers: TestServer[] = [];

afterEach(async () => {
  for (const server of servers) await removeTempDir(server.parent);
  servers = [];
});

interface RepoSetup {
  readonly server: TestServer;
  readonly origin: string | null;
}

async function repoServer(withOrigin: boolean): Promise<RepoSetup> {
  const server = await createTestServer({ fixture: 'demo', gitDebounceMs: 60_000 });
  const origin = withOrigin ? await createBareOrigin(server.parent) : null;
  await seedGitWorkspace(server.root, origin === null ? {} : { origin });
  servers.push(server);
  return { server, origin };
}

const JANE = 'contacts/cnt_jane-doe.md';

describe('sync', () => {
  it('commits pending work, pulls, pushes, and ends clean', async () => {
    const { server, origin } = await repoServer(true);
    if (origin === null) throw new Error('origin missing');

    const created = await server.mutate('POST', '/api/contacts', {
      first_name: 'Katherine',
      last_name: 'Johnson',
    });
    expect(created.status).toBe(201);
    await server.git.flush();

    await writeFile(join(server.root, 'notes.md'), 'external note\n', 'utf8');

    const report = await server.git.sync();
    expect(report.ok).toBe(true);
    expect(report.error).toBeNull();
    expect(report.steps.map((step) => step.name)).toEqual(['add', 'commit', 'pull', 'push']);
    expect(report.steps.find((step) => step.name === 'commit')?.skipped).toBeUndefined();
    expect(report.status.dirty).toBe(false);
    expect(report.status.unpushed).toBe(false);
    expect(report.status.ahead).toBe(0);
    expect(await statusPorcelain(server.root)).toBe('');

    const subjects = await commitSubjects(origin);
    expect(subjects.some((subject) => subject.startsWith('ob auto-sync: '))).toBe(true);
    expect(subjects.some((subject) => subject.startsWith('ob: save contact '))).toBe(true);
    expect(subjects).toContain('seed');
  });

  it('merges a peer commit without conflicts', async () => {
    const { server, origin } = await repoServer(true);
    if (origin === null) throw new Error('origin missing');

    const peer = join(server.parent, 'peer');
    await cloneRepo(origin, peer);
    await writeFile(join(peer, 'peer-notes.md'), 'from the peer\n', 'utf8');
    await commitAll(peer, 'peer: add notes');
    await git(peer, ['push', '--quiet']);

    const created = await server.mutate('POST', '/api/contacts', {
      first_name: 'Mary',
      last_name: 'Jackson',
    });
    expect(created.status).toBe(201);
    await server.git.flush();

    const report = await server.git.sync();
    expect(report.ok).toBe(true);
    expect(report.status.dirty).toBe(false);
    expect(report.status.behind).toBe(0);
    expect(report.status.unpushed).toBe(false);

    const subjects = await commitSubjects(origin);
    expect(subjects).toContain('peer: add notes');
  });

  it('surfaces a missing upstream and recovers with set-upstream', async () => {
    const { server } = await repoServer(false);
    const origin = await createBareOrigin(server.parent);

    await server.mutate('POST', '/api/contacts', {
      first_name: 'Annie',
      last_name: 'Easley',
    });
    await server.git.flush();

    const report = await server.git.sync();
    expect(report.ok).toBe(false);
    expect(report.error?.code).toBe('no_upstream');

    const remote = await server.git.setRemote({ url: origin, push: false });
    expect(remote.ok).toBe(true);
    expect(remote.status.remote).toBe(origin);

    const recovery = await server.git.recover('set-upstream');
    expect(recovery.ok).toBe(true);
    expect(recovery.status.unpushed).toBe(false);
    expect(recovery.status.hasUpstream).toBe(true);

    const subjects = await commitSubjects(origin);
    expect(subjects.some((subject) => subject.startsWith('ob: save contact '))).toBe(true);
  });

  it('stops on a rebase conflict and recovers with abort-sync', async () => {
    const { server, origin } = await repoServer(true);
    if (origin === null) throw new Error('origin missing');

    const peer = join(server.parent, 'peer');
    await cloneRepo(origin, peer);

    const patched = await server.mutate('PATCH', '/api/contacts/cnt_01J8X7100BQ4M2N8V3R5T7W9Y0', {
      company: 'Workspace Co',
    });
    expect(patched.status).toBe(200);
    await server.git.flush();

    const peerFile = join(peer, JANE);
    const original = await readFile(peerFile, 'utf8');
    await writeFile(
      peerFile,
      original.replace('company: Northwind Traders', 'company: Peer Co'),
      'utf8',
    );
    await commitAll(peer, 'peer: rename company');
    await git(peer, ['push', '--quiet']);

    const report = await server.git.sync();
    expect(report.ok).toBe(false);
    expect(report.error?.code).toBe('rebase_conflict');
    expect(report.status.conflict).toBe(true);
    expect(report.status.conflictPaths).toContain(JANE);

    const recovery = await server.git.recover('abort-sync');
    expect(recovery.ok).toBe(true);
    expect(recovery.status.conflict).toBe(false);
    expect(await statusPorcelain(server.root)).toBe('');
  });

  it('refuses a detached HEAD before mutating anything', async () => {
    const { server } = await repoServer(false);
    await git(server.root, ['checkout', '--quiet', '--detach']);

    const report = await server.git.sync();
    expect(report.ok).toBe(false);
    expect(report.error?.code).toBe('detached_head');
    expect(await server.git.status({ force: true })).toMatchObject({
      detached: true,
      syncState: 'error',
    });
  });

  it('refuses a workspace nested in a parent repository', async () => {
    const server = await createTestServer({ fixture: 'demo', gitDebounceMs: 60_000 });
    servers.push(server);
    await git(server.parent, ['init', '--quiet', '--initial-branch=main']);

    const status = await server.git.status({ force: true });
    expect(status.initialized).toBe(true);
    expect(status.repoOutsideWorkspace).toBe(true);

    const report = await server.git.sync();
    expect(report.ok).toBe(false);
    expect(report.error?.code).toBe('repo_outside_workspace');

    const init = await server.git.init();
    expect(init.ok).toBe(false);
    expect(init.error?.code).toBe('repo_outside_workspace');
  });

  it('reports a missing git identity instead of committing anonymously', async () => {
    const server = await createTestServer({ fixture: 'demo', gitDebounceMs: 60_000 });
    servers.push(server);

    const previousGlobal = process.env['GIT_CONFIG_GLOBAL'];
    const previousSystem = process.env['GIT_CONFIG_SYSTEM'];
    process.env['GIT_CONFIG_GLOBAL'] = '/dev/null';
    process.env['GIT_CONFIG_SYSTEM'] = '/dev/null';

    try {
      const init = await server.git.init();
      expect(init.ok).toBe(false);
      expect(init.error?.code).toBe('identity_missing');
      expect(init.status.initialized).toBe(false);
    } finally {
      if (previousGlobal === undefined) delete process.env['GIT_CONFIG_GLOBAL'];
      else process.env['GIT_CONFIG_GLOBAL'] = previousGlobal;
      if (previousSystem === undefined) delete process.env['GIT_CONFIG_SYSTEM'];
      else process.env['GIT_CONFIG_SYSTEM'] = previousSystem;
    }
  });
});
