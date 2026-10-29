import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { promisify } from 'node:util';
import { GITIGNORE_CONTENT } from '../../src/workspace/paths.js';

const execFileAsync = promisify(execFile);

export interface GitCommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const gitEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_EDITOR: 'true',
  GIT_PAGER: 'cat',
  LC_ALL: 'C',
});

export const gitResult = async (
  cwd: string,
  args: readonly string[],
): Promise<GitCommandResult> => {
  try {
    const { stdout, stderr } = await execFileAsync('git', [...args], {
      cwd,
      env: gitEnv(),
      windowsHide: true,
    });
    return { code: 0, stdout: String(stdout), stderr: String(stderr) };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      code: typeof failure.code === 'number' ? failure.code : 1,
      stdout: failure.stdout === undefined ? '' : String(failure.stdout),
      stderr: failure.stderr === undefined ? (failure.message ?? '') : String(failure.stderr),
    };
  }
};

export const git = async (cwd: string, args: readonly string[]): Promise<string> => {
  const result = await gitResult(cwd, args);
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
};

export const configureIdentity = async (root: string): Promise<void> => {
  await git(root, ['config', 'user.name', 'ob test']);
  await git(root, ['config', 'user.email', 'ob-test@example.com']);
  await git(root, ['config', 'commit.gpgsign', 'false']);
};

export const createBareOrigin = async (parent: string): Promise<string> => {
  const origin = join(parent, 'origin.git');
  await git(parent, ['init', '--bare', '--quiet', '--initial-branch=main', origin]);
  return origin;
};

export interface SeedOptions {
  readonly origin?: string;
  /** Defaults to true; mirrors what `ob init` writes. */
  readonly gitignore?: boolean;
}

/** Turns an existing workspace directory into a repository with one seed commit. */
export const seedGitWorkspace = async (root: string, options: SeedOptions = {}): Promise<void> => {
  await git(root, ['init', '--quiet', '--initial-branch=main']);
  await configureIdentity(root);

  if (options.gitignore !== false) {
    try {
      await writeFile(join(root, '.gitignore'), GITIGNORE_CONTENT, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }

  await git(root, ['add', '-A']);
  await git(root, ['commit', '--quiet', '--no-verify', '-m', 'seed']);

  if (options.origin !== undefined) {
    await git(root, ['remote', 'add', 'origin', options.origin]);
    await git(root, ['push', '--quiet', '-u', 'origin', 'main']);
  }
};

export const cloneRepo = async (origin: string, destination: string): Promise<void> => {
  await git(dirname(origin), ['clone', '--quiet', origin, destination]);
  await configureIdentity(destination);
};

export const commitAll = async (root: string, message: string): Promise<void> => {
  await git(root, ['add', '-A']);
  await git(root, ['commit', '--quiet', '--no-verify', '-m', message]);
};

export const commitSubjects = async (cwd: string): Promise<string[]> => {
  const result = await gitResult(cwd, ['log', '--format=%s']);
  if (result.code !== 0) return [];
  return result.stdout
    .trim()
    .split('\n')
    .filter((line) => line !== '');
};

export const statusPorcelain = async (cwd: string): Promise<string> => {
  const result = await gitResult(cwd, ['status', '--porcelain']);
  return result.code === 0 ? result.stdout : '';
};

export const branchOf = async (cwd: string): Promise<string> => {
  const result = await gitResult(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return result.code === 0 ? result.stdout.trim() : '';
};
