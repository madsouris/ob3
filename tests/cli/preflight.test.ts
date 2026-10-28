import { afterEach, describe, expect, it } from 'vitest';
import type { Exec, ExecResult } from '../../src/cli/exec.js';
import { runPreflight } from '../../src/cli/preflight.js';
import { makeTempDir, removeTempDir } from '../helpers/tmp.js';

const OK: ExecResult = { code: 0, stdout: '', stderr: '' };

function stubExec(responses: Record<string, Partial<ExecResult>>): Exec {
  return (command, args) => {
    const key = [command, ...args].join(' ');
    const response = responses[key];
    if (response === undefined) return Promise.resolve({ code: 127, stdout: '', stderr: 'not found' });
    return Promise.resolve({ ...OK, ...response });
  };
}

const HEALTHY = stubExec({
  'git --version': { stdout: 'git version 2.43.0\n' },
  'git config --get user.name': { stdout: 'Jane Doe\n' },
  'git config --get user.email': { stdout: 'jane@example.com\n' },
  'gh --version': { stdout: 'gh version 2.40.0 (2024-01-01)\n' },
});

let temp: string | null = null;

afterEach(async () => {
  if (temp !== null) await removeTempDir(temp);
  temp = null;
});

async function workspace(): Promise<string> {
  temp = await makeTempDir();
  return temp;
}

describe('runPreflight', () => {
  it('passes on a healthy environment', async () => {
    const report = await runPreflight({
      workspace: await workspace(),
      requireGitIdentity: true,
      exec: HEALTHY,
      nodeVersion: '20.11.0',
    });
    expect(report.failed).toBe(false);
    expect(report.results.map((r) => r.id)).toEqual([
      'node',
      'workspace',
      'writable',
      'git',
      'identity',
      'gh',
    ]);
    expect(report.results.find((r) => r.id === 'identity')?.message).toContain(
      'Jane Doe <jane@example.com>',
    );
    expect(report.results.every((r) => r.status === 'ok')).toBe(true);
  });

  it('fails on an old Node.js', async () => {
    const report = await runPreflight({
      workspace: await workspace(),
      requireGitIdentity: true,
      exec: HEALTHY,
      nodeVersion: '18.19.0',
    });
    expect(report.failed).toBe(true);
    expect(report.results.find((r) => r.id === 'node')).toMatchObject({
      status: 'fail',
      hint: 'nvm install 20 && nvm use 20',
    });
  });

  it('fails when git is missing and identity is required', async () => {
    const report = await runPreflight({
      workspace: await workspace(),
      requireGitIdentity: true,
      exec: stubExec({}),
      nodeVersion: '20.11.0',
    });
    expect(report.failed).toBe(true);
    expect(report.results.find((r) => r.id === 'git')?.status).toBe('fail');
    expect(report.results.find((r) => r.id === 'identity')?.status).toBe('fail');
  });

  it('only warns when git is missing and --no-git was passed', async () => {
    const report = await runPreflight({
      workspace: await workspace(),
      requireGitIdentity: false,
      exec: stubExec({}),
      nodeVersion: '20.11.0',
    });
    expect(report.failed).toBe(false);
    expect(report.results.find((r) => r.id === 'git')?.status).toBe('warn');
    expect(report.results.find((r) => r.id === 'identity')?.status).toBe('warn');
  });

  it('warns on an old git but does not fail', async () => {
    const report = await runPreflight({
      workspace: await workspace(),
      requireGitIdentity: true,
      exec: stubExec({
        'git --version': { stdout: 'git version 2.30.0\n' },
        'git config --get user.name': { stdout: 'Jane\n' },
        'git config --get user.email': { stdout: 'jane@example.com\n' },
        'gh --version': { stdout: 'gh version 2.40.0\n' },
      }),
      nodeVersion: '20.11.0',
    });
    expect(report.failed).toBe(false);
    expect(report.results.find((r) => r.id === 'git')).toMatchObject({ status: 'warn' });
  });

  it('warns (not fails) when gh is missing', async () => {
    const report = await runPreflight({
      workspace: await workspace(),
      requireGitIdentity: true,
      exec: stubExec({
        'git --version': { stdout: 'git version 2.43.0\n' },
        'git config --get user.name': { stdout: 'Jane\n' },
        'git config --get user.email': { stdout: 'jane@example.com\n' },
      }),
      nodeVersion: '20.11.0',
    });
    expect(report.failed).toBe(false);
    expect(report.results.find((r) => r.id === 'gh')?.status).toBe('warn');
  });

  it('reports a workspace that does not exist yet but has a valid parent', async () => {
    const root = await workspace();
    const report = await runPreflight({
      workspace: `${root}/new-workspace`,
      requireGitIdentity: true,
      exec: HEALTHY,
      nodeVersion: '20.11.0',
    });
    expect(report.results.find((r) => r.id === 'workspace')?.status).toBe('ok');
  });
});
