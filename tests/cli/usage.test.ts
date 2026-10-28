import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMetaArgs, readPackageVersion, USAGE } from '../../src/cli/usage.js';

describe('parseMetaArgs', () => {
  it('returns none for an empty argv', () => {
    expect(parseMetaArgs([])).toEqual({ kind: 'none' });
  });

  it.each(['-h', '--help', 'help'])('treats %s as help', (flag) => {
    expect(parseMetaArgs([flag])).toEqual({ kind: 'help' });
  });

  it.each(['-v', '--version', 'version'])('treats %s as version', (flag) => {
    expect(parseMetaArgs([flag])).toEqual({ kind: 'version' });
  });

  it('ignores a workspace path before the flag', () => {
    expect(parseMetaArgs(['.', '--help'])).toEqual({ kind: 'none' });
  });

  it('does not resolve unknown flags', () => {
    expect(parseMetaArgs(['--nope'])).toEqual({ kind: 'none' });
  });
});

describe('USAGE', () => {
  it.each([
    'ob [path]',
    'ob init [path]',
    'ob sync [path]',
    'ob check [path]',
    '--port <n>',
    '--demo',
    '--empty',
    '--no-git',
    '--no-open',
    '--verbose',
    '--version',
  ])('documents %s', (token) => {
    expect(USAGE).toContain(token);
  });

  it('documents the sync order that requires a commit before pull', () => {
    const add = USAGE.indexOf('git add');
    const commit = USAGE.indexOf('commit');
    const pull = USAGE.indexOf('pull --rebase');
    const push = USAGE.indexOf('push');
    expect(add).toBeGreaterThan(-1);
    expect(commit).toBeGreaterThan(add);
    expect(pull).toBeGreaterThan(commit);
    expect(push).toBeGreaterThan(pull);
  });
});

describe('readPackageVersion', () => {
  it('reads the version from package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(readPackageVersion()).toBe(pkg.version);
  });

  it('returns a semver string', () => {
    expect(readPackageVersion()).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });
});
