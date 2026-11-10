import { access, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pullBeforeStart } from '../../src/git/start-sync.js';
import {
  cloneRepo,
  commitAll,
  createBareOrigin,
  git,
  seedGitWorkspace,
  statusPorcelain,
} from '../helpers/git.js';
import { removeTempDir } from '../helpers/tmp.js';
import { makeFixtureWorkspace } from '../helpers/workspace.js';

const parents: string[] = [];

afterEach(async () => {
  for (const parent of parents) await removeTempDir(parent);
  parents.length = 0;
});

interface BehindSetup {
  readonly root: string;
  readonly peer: string;
}

/**
 * A workspace whose origin already moved ahead by one peer commit — the state
 * the user has when they start `filecrm .` on an outdated copy.
 */
async function workspaceBehindOrigin(): Promise<BehindSetup> {
  const workspace = await makeFixtureWorkspace('demo');
  parents.push(workspace.parent);
  const origin = await createBareOrigin(workspace.parent);
  await seedGitWorkspace(workspace.root, { origin });

  const peer = join(workspace.parent, 'peer');
  await cloneRepo(origin, peer);
  await writeFile(join(peer, 'peer-notes.md'), 'from the peer\n', 'utf8');
  await commitAll(peer, 'peer: add notes');
  await git(peer, ['push', '--quiet']);

  return { root: workspace.root, peer };
}

describe('pullBeforeStart', () => {
  it('fast-forwards a clean workspace that is only behind', async () => {
    const { root } = await workspaceBehindOrigin();

    const outcome = await pullBeforeStart({ root, allowParentRepo: false });

    expect(outcome).toMatchObject({ ran: true, ok: true, behind: 1 });
    await expect(access(join(root, 'peer-notes.md'))).resolves.toBeUndefined();
    expect(await statusPorcelain(root)).toBe('');
    // The pull is a fast-forward: no commit was created for it.
    expect(await git(root, ['rev-list', '--count', 'HEAD'])).toBe('2\n');
  });

  it('skips a dirty workspace and leaves it untouched', async () => {
    const { root } = await workspaceBehindOrigin();
    await writeFile(join(root, 'local-scratch.md'), 'unsaved work\n', 'utf8');

    const outcome = await pullBeforeStart({ root, allowParentRepo: false });

    expect(outcome).toEqual({ ran: false, reason: 'dirty' });
    await expect(access(join(root, 'peer-notes.md'))).rejects.toThrow();
    expect(await statusPorcelain(root)).toContain('?? local-scratch.md');
  });

  it('does nothing when the workspace is up to date', async () => {
    const workspace = await makeFixtureWorkspace('demo');
    parents.push(workspace.parent);
    const origin = await createBareOrigin(workspace.parent);
    await seedGitWorkspace(workspace.root, { origin });

    const outcome = await pullBeforeStart({ root: workspace.root, allowParentRepo: false });

    expect(outcome).toEqual({ ran: false, reason: 'up_to_date' });
  });

  it('refuses to rebase a diverged branch instead of creating a conflict', async () => {
    const { root } = await workspaceBehindOrigin();
    await writeFile(join(root, 'local.md'), 'local commit\n', 'utf8');
    await commitAll(root, 'local: keep me');
    const head = await git(root, ['rev-parse', 'HEAD']);

    const outcome = await pullBeforeStart({ root, allowParentRepo: false });

    expect(outcome).toEqual({ ran: false, reason: 'diverged' });
    expect(await git(root, ['rev-parse', 'HEAD'])).toBe(head);
    expect(await statusPorcelain(root)).toBe('');
  });

  it('skips a branch with no upstream without touching the network', async () => {
    const workspace = await makeFixtureWorkspace('demo');
    parents.push(workspace.parent);
    await seedGitWorkspace(workspace.root);

    const outcome = await pullBeforeStart({ root: workspace.root, allowParentRepo: false });

    expect(outcome).toEqual({ ran: false, reason: 'no_upstream' });
  });

  it('skips a workspace that is not a repository', async () => {
    const workspace = await makeFixtureWorkspace('demo');
    parents.push(workspace.parent);

    const outcome = await pullBeforeStart({ root: workspace.root, allowParentRepo: false });

    expect(outcome).toEqual({ ran: false, reason: 'not_a_repo' });
  });

  it('skips a workspace nested inside another repository', async () => {
    const workspace = await makeFixtureWorkspace('demo');
    parents.push(workspace.parent);
    await git(workspace.parent, ['init', '--quiet', '--initial-branch=main']);

    const outcome = await pullBeforeStart({ root: workspace.root, allowParentRepo: false });

    expect(outcome).toEqual({ ran: false, reason: 'outside_workspace' });
  });

  it('reports an unreachable remote instead of delaying the launch', async () => {
    const workspace = await makeFixtureWorkspace('demo');
    parents.push(workspace.parent);
    const origin = await createBareOrigin(workspace.parent);
    await seedGitWorkspace(workspace.root, { origin });
    await rm(origin, { recursive: true, force: true });

    const outcome = await pullBeforeStart({ root: workspace.root, allowParentRepo: false });

    expect(outcome).toEqual({ ran: false, reason: 'unreachable' });
  });
});
