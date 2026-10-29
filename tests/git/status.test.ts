import { describe, expect, it } from 'vitest';
import type { GitResult } from '../../src/git/exec.js';
import { classifyFailure, parseAheadBehind, parsePorcelain } from '../../src/git/status.js';

const result = (overrides: Partial<GitResult> = {}): GitResult => ({
  code: 1,
  stdout: '',
  stderr: '',
  timedOut: false,
  ...overrides,
});

describe('parsePorcelain', () => {
  it('reports dirty state and paths', () => {
    const summary = parsePorcelain(' M contacts/cnt_a.md\n?? notes.txt\n');
    expect(summary.dirty).toBe(true);
    expect(summary.entries).toHaveLength(2);
    expect(summary.entries[0]).toEqual({ status: ' M', path: 'contacts/cnt_a.md' });
    expect(summary.conflictPaths).toEqual([]);
  });

  it('extracts conflict paths and resolves renames', () => {
    const summary = parsePorcelain('UU contacts/cnt_a.md\nR  old.md -> tasks/doing/new.md\n');
    expect(summary.conflictPaths).toEqual(['contacts/cnt_a.md']);
    expect(summary.entries[1]?.path).toBe('tasks/doing/new.md');
  });

  it('treats an empty status as clean', () => {
    expect(parsePorcelain('')).toEqual({ entries: [], conflictPaths: [], dirty: false });
  });
});

describe('parseAheadBehind', () => {
  it('reads behind first and ahead second', () => {
    expect(parseAheadBehind('2\t3\n')).toEqual({ ahead: 3, behind: 2 });
    expect(parseAheadBehind('0 0')).toEqual({ ahead: 0, behind: 0 });
  });

  it('rejects malformed output', () => {
    expect(parseAheadBehind('')).toBeNull();
    expect(parseAheadBehind('a b')).toBeNull();
    expect(parseAheadBehind('1')).toBeNull();
  });
});

describe('classifyFailure', () => {
  it('returns null for a successful step', () => {
    expect(classifyFailure('pull', result({ code: 0 }))).toBeNull();
  });

  it('marks timeouts', () => {
    expect(classifyFailure('push', result({ timedOut: true }))?.code).toBe('timeout');
  });

  it('classifies authentication and network failures', () => {
    expect(
      classifyFailure(
        'pull',
        result({ stderr: "fatal: Authentication failed for 'https://github.com/a/b.git/'" }),
      )?.code,
    ).toBe('auth_failed');
    expect(
      classifyFailure('push', result({ stderr: 'fatal: could not read Username for https://x' }))
        ?.code,
    ).toBe('auth_failed');
    expect(
      classifyFailure('pull', result({ stderr: 'ssh: Could not resolve host: github.com' }))?.code,
    ).toBe('auth_failed');
  });

  it('classifies conflicts from output or porcelain', () => {
    expect(classifyFailure('pull', result(), ['contacts/cnt_a.md'])?.code).toBe('rebase_conflict');
    expect(
      classifyFailure(
        'pull',
        result({ stdout: 'CONFLICT (content): Merge conflict in contacts/a.md' }),
      )?.code,
    ).toBe('rebase_conflict');
  });

  it('classifies upstream and non-fast-forward failures', () => {
    expect(
      classifyFailure(
        'pull',
        result({ stderr: 'There is no tracking information for the current branch.' }),
      )?.code,
    ).toBe('no_upstream');
    expect(
      classifyFailure('push', result({ stderr: ' ! [rejected] main -> main (non-fast-forward)' }))
        ?.code,
    ).toBe('non_fast_forward');
  });

  it('separates hook rejections from plain commit failures', () => {
    expect(
      classifyFailure('commit', result({ stderr: 'husky - pre-commit hook exited with code 1' }))
        ?.code,
    ).toBe('hook_rejected');
    expect(
      classifyFailure('commit', result({ stderr: 'fatal: unable to auto-detect email address' }))
        ?.code,
    ).toBe('commit_failed');
  });

  it('falls back to git_failed and keeps the output tail', () => {
    const info = classifyFailure('pull', result({ stderr: 'fatal: something odd' }));
    expect(info?.code).toBe('git_failed');
    expect(info?.output).toContain('something odd');
  });
});
