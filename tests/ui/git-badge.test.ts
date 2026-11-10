import { describe, expect, it } from 'vitest';
import type { GitStatus } from '../../src/ui/lib/api.js';
import { badgeLabelOf, badgeStateOf, badgeVariantOf } from '../../src/ui/lib/git-badge.js';

const status = (overrides: Partial<GitStatus> = {}): GitStatus => ({
  initialized: true,
  repoOutsideWorkspace: false,
  branch: 'main',
  detached: false,
  dirty: false,
  changedFiles: 0,
  ahead: 0,
  behind: 0,
  unpushed: false,
  hasUpstream: true,
  remote: 'https://example.com/crm.git',
  lastCommit: '',
  conflict: false,
  conflictPaths: [],
  syncState: 'idle',
  error: null,
  ...overrides,
});

describe('badgeStateOf', () => {
  it('starts in loading until the first status arrives', () => {
    expect(badgeStateOf(null)).toBe('loading');
  });

  it('treats a missing or parent repository as no-repo, before any sync state', () => {
    expect(badgeStateOf(status({ initialized: false }))).toBe('no-repo');
    expect(badgeStateOf(status({ repoOutsideWorkspace: true }))).toBe('no-repo');
    expect(badgeStateOf(status({ initialized: false, syncState: 'running' }))).toBe('no-repo');
  });

  it('orders running, errors, dirty, unpushed and clean', () => {
    expect(badgeStateOf(status({ syncState: 'running' }))).toBe('syncing');
    expect(badgeStateOf(status({ error: { code: 'git_failed', message: 'boom' } }))).toBe('error');
    expect(badgeStateOf(status({ conflict: true }))).toBe('error');
    expect(badgeStateOf(status({ dirty: true }))).toBe('dirty');
    expect(badgeStateOf(status({ ahead: 2, unpushed: true }))).toBe('unpushed');
    expect(badgeStateOf(status())).toBe('clean');
  });

  it('reports uncommitted work over unpushed commits', () => {
    expect(badgeStateOf(status({ dirty: true, ahead: 3, unpushed: true }))).toBe('dirty');
  });
});

describe('badgeVariantOf', () => {
  it('is destructive for uncommitted work and git errors', () => {
    expect(badgeVariantOf('dirty')).toBe('destructive');
    expect(badgeVariantOf('error')).toBe('destructive');
  });

  it('is the yellow warning variant when there is no repository', () => {
    expect(badgeVariantOf('no-repo')).toBe('warning');
  });

  it('stays outlined for every healthy state', () => {
    expect(badgeVariantOf('loading')).toBe('outline');
    expect(badgeVariantOf('syncing')).toBe('outline');
    expect(badgeVariantOf('unpushed')).toBe('outline');
    expect(badgeVariantOf('clean')).toBe('outline');
  });
});

describe('badgeLabelOf', () => {
  it('names each state', () => {
    expect(badgeLabelOf('loading', null)).toBe('Git');
    expect(badgeLabelOf('no-repo', status({ initialized: false }))).toBe('No git');
    expect(badgeLabelOf('syncing', status())).toBe('Syncing…');
    expect(badgeLabelOf('error', status())).toBe('Git error');
    expect(badgeLabelOf('dirty', status())).toBe('Uncommitted');
  });

  it('counts commits waiting to push', () => {
    expect(badgeLabelOf('unpushed', status({ ahead: 3 }))).toBe('3 to push');
  });

  it('shows the branch name when clean, falling back to Clean', () => {
    expect(badgeLabelOf('clean', status({ branch: 'dev/v1.3' }))).toBe('dev/v1.3');
    expect(badgeLabelOf('clean', status({ branch: '' }))).toBe('Clean');
  });
});
