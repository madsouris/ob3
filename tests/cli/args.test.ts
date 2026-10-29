import { describe, expect, it } from 'vitest';
import { UsageError, parseArgs } from '../../src/cli/args.js';

describe('parseArgs', () => {
  it('defaults to start in the current directory', () => {
    expect(parseArgs([])).toEqual({
      kind: 'start',
      workspace: undefined,
      mode: undefined,
      port: undefined,
      git: true,
      open: true,
      verbose: false,
    });
  });

  it('takes a workspace path positional', () => {
    expect(parseArgs(['./my-crm'])).toMatchObject({ kind: 'start', workspace: './my-crm' });
  });

  it('takes a subcommand and a path', () => {
    expect(parseArgs(['init', './my-crm'])).toMatchObject({ kind: 'init', workspace: './my-crm' });
    expect(parseArgs(['sync'])).toMatchObject({ kind: 'sync' });
    expect(parseArgs(['check', '.'])).toMatchObject({ kind: 'check', workspace: '.' });
  });

  it('resolves help and version words and flags', () => {
    for (const argv of [['-h'], ['--help'], ['help']]) {
      expect(parseArgs(argv)).toEqual({ kind: 'help' });
    }
    for (const argv of [['-v'], ['--version'], ['version']]) {
      expect(parseArgs(argv)).toEqual({ kind: 'version' });
    }
  });

  it('parses init mode and boolean flags', () => {
    expect(parseArgs(['--demo'])).toMatchObject({ kind: 'start', mode: 'demo' });
    expect(parseArgs(['init', '--empty'])).toMatchObject({ kind: 'init', mode: 'empty' });
    expect(parseArgs(['--no-git', '--no-open', '--verbose'])).toMatchObject({
      git: false,
      open: false,
      verbose: true,
    });
  });

  it('parses --port', () => {
    expect(parseArgs(['--port', '20000'])).toMatchObject({ port: 20000 });
  });

  it('rejects an invalid or missing --port', () => {
    expect(() => parseArgs(['--port'])).toThrow(UsageError);
    expect(() => parseArgs(['--port', 'abc'])).toThrow(UsageError);
    expect(() => parseArgs(['--port', '0'])).toThrow(UsageError);
    expect(() => parseArgs(['--port', '70000'])).toThrow(UsageError);
    expect(() => parseArgs(['--port', '80.5'])).toThrow(UsageError);
  });

  it('rejects conflicting init modes', () => {
    expect(() => parseArgs(['--demo', '--empty'])).toThrow(/cannot be combined/);
  });

  it('rejects unknown flags, extra arguments and misplaced flags', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['a', 'b', 'c'])).toThrow(/Too many arguments/);
    expect(() => parseArgs(['a', 'b'])).toThrow(/Unexpected argument/);
    expect(() => parseArgs(['check', '--demo'])).toThrow(/do not apply/);
    expect(() => parseArgs(['sync', '--port', '20000'])).toThrow(/do not apply/);
  });

  it('only accepts --json for check', () => {
    const parsed = parseArgs(['check', '--json']);
    expect(parsed).toMatchObject({ kind: 'check', json: true });
    expect(() => parseArgs(['--json'])).toThrow(/only applies to "ob check"/);
    expect(() => parseArgs(['sync', '--json'])).toThrow(/only applies to "ob check"/);
  });

  it('accepts the sync-only flags and rejects them elsewhere', () => {
    expect(parseArgs(['sync'])).toEqual({
      kind: 'sync',
      workspace: undefined,
      verbose: false,
      dryRun: false,
      allowParentRepo: false,
    });
    expect(parseArgs(['sync', '--dry-run'])).toMatchObject({ kind: 'sync', dryRun: true });
    expect(parseArgs(['sync', '--allow-parent-repo', './ws'])).toMatchObject({
      kind: 'sync',
      workspace: './ws',
      allowParentRepo: true,
    });
    expect(() => parseArgs(['--dry-run'])).toThrow(/only applies to "ob sync"/);
    expect(() => parseArgs(['init', '--allow-parent-repo'])).toThrow(/only applies to "ob sync"/);
    expect(() => parseArgs(['check', '--dry-run'])).toThrow(/only applies to "ob sync"/);
  });
});
