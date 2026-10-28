import { accessSync, constants, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Exec } from './exec.js';
import { execFileResult } from './exec.js';
import { out } from './output.js';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export type CheckResult = {
  id: 'node' | 'workspace' | 'writable' | 'git' | 'identity' | 'gh';
  status: CheckStatus;
  message: string;
  hint?: string;
};

export type PreflightOptions = {
  workspace: string;
  /** When true, a missing git binary or identity is fatal instead of a warning. */
  requireGitIdentity: boolean;
  exec?: Exec;
  nodeVersion?: string;
};

export type PreflightReport = {
  results: CheckResult[];
  failed: boolean;
};

const MIN_NODE_MAJOR = 20;
const MIN_GIT = { major: 2, minor: 39 };

export async function runPreflight(options: PreflightOptions): Promise<PreflightReport> {
  const exec = options.exec ?? execFileResult;
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const results: CheckResult[] = [];

  const nodeMajor = Number.parseInt(nodeVersion.split('.')[0] ?? '0', 10);
  results.push(
    nodeMajor >= MIN_NODE_MAJOR
      ? { id: 'node', status: 'ok', message: `Node.js ${nodeVersion} verified` }
      : {
          id: 'node',
          status: 'fail',
          message: `Node.js ${nodeVersion} is too old (need >= ${MIN_NODE_MAJOR})`,
          hint: 'nvm install 20 && nvm use 20',
        },
  );

  const workspaceCheck = checkWorkspacePath(options.workspace);
  results.push(workspaceCheck);

  if (workspaceCheck.status !== 'fail') {
    results.push(checkWritable(options.workspace));
  }

  const gitVersion = await exec('git', ['--version']);
  const gitMissing = gitVersion.code !== 0;
  if (gitMissing) {
    results.push({
      id: 'git',
      status: options.requireGitIdentity ? 'fail' : 'warn',
      message: 'Git CLI not detected',
      hint: 'Install git: https://git-scm.com/downloads',
    });
  } else {
    const match = /git version (\d+)\.(\d+)/.exec(gitVersion.stdout);
    const major = match?.[1] === undefined ? 0 : Number(match[1]);
    const minor = match?.[2] === undefined ? 0 : Number(match[2]);
    const outdated = major < MIN_GIT.major || (major === MIN_GIT.major && minor < MIN_GIT.minor);
    results.push({
      id: 'git',
      status: outdated ? 'warn' : 'ok',
      message: outdated
        ? `Git ${major}.${minor} detected (2.39+ recommended)`
        : gitVersion.stdout.trim(),
      ...(outdated ? { hint: 'Older git works; sync output is just less structured.' } : {}),
    });
  }

  const identity = await readGitIdentity(exec);
  if (identity === null) {
    results.push({
      id: 'identity',
      status: options.requireGitIdentity ? 'fail' : 'warn',
      message: 'Git user identity is not configured',
      hint: 'git config --global user.name "Your Name" && git config --global user.email "you@example.com"',
    });
  } else {
    results.push({ id: 'identity', status: 'ok', message: `Git identity: ${identity}` });
  }

  const gh = await exec('gh', ['--version']);
  results.push(
    gh.code === 0
      ? { id: 'gh', status: 'ok', message: `gh CLI detected (${gh.stdout.split('\n')[0] ?? 'gh'})` }
      : {
          id: 'gh',
          status: 'warn',
          message: 'gh CLI not detected',
          hint: 'Optional: only needed to create a GitHub remote from the UI.',
        },
  );

  return { results, failed: results.some((result) => result.status === 'fail') };
}

export async function readGitIdentity(exec: Exec): Promise<string | null> {
  const [name, email] = await Promise.all([
    exec('git', ['config', '--get', 'user.name']),
    exec('git', ['config', '--get', 'user.email']),
  ]);
  const trimmedName = name.code === 0 ? name.stdout.trim() : '';
  const trimmedEmail = email.code === 0 ? email.stdout.trim() : '';
  if (trimmedName === '' || trimmedEmail === '') return null;
  return `${trimmedName} <${trimmedEmail}>`;
}

/** Prints a report as `[✓]/[!]/[✗]` lines with hints indented below. */
export function printReport(report: PreflightReport): void {
  for (const result of report.results) {
    const text =
      result.hint === undefined ? result.message : `${result.message}\n     ${result.hint}`;
    if (result.status === 'ok') out.ok(text);
    else if (result.status === 'warn') out.warn(text);
    else out.fail(text);
  }
}

function checkWorkspacePath(workspace: string): CheckResult {
  try {
    const stats = statSync(workspace);
    if (!stats.isDirectory()) {
      return {
        id: 'workspace',
        status: 'fail',
        message: `Workspace path is not a directory: ${workspace}`,
      };
    }
    return { id: 'workspace', status: 'ok', message: `Workspace path verified (${workspace})` };
  } catch {
    const parent = dirname(workspace);
    try {
      if (statSync(parent).isDirectory()) {
        return {
          id: 'workspace',
          status: 'ok',
          message: `Workspace will be created (${workspace})`,
        };
      }
    } catch {
      // fall through to failure
    }
    return {
      id: 'workspace',
      status: 'fail',
      message: `Workspace parent directory does not exist: ${parent}`,
      hint: `mkdir -p "${parent}"`,
    };
  }
}

function checkWritable(workspace: string): CheckResult {
  let target = workspace;
  try {
    if (!statSync(workspace).isDirectory()) target = dirname(workspace);
  } catch {
    // The workspace may not exist yet; probe its parent instead.
    target = dirname(workspace);
  }

  const probe = join(target, `.ob-probe-${randomUUID()}`);
  try {
    writeFileSync(probe, '');
    unlinkSync(probe);
    accessSync(target, constants.W_OK);
    return { id: 'writable', status: 'ok', message: 'Workspace is writable' };
  } catch {
    return {
      id: 'writable',
      status: 'fail',
      message: `Workspace is not writable: ${target}`,
      hint: 'Check permissions/ownership of the directory.',
    };
  }
}
