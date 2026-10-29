import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

export interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export interface GitRunOptions {
  readonly cwd: string;
  /** Default 10 s (docs/09). */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
/** git output is parsed; a runaway status in a huge repo must not exhaust memory. */
const MAX_OUTPUT_CHARS = 256 * 1024;

const appendCapped = (current: string, chunk: string): string => {
  if (current.length >= MAX_OUTPUT_CHARS) return current;
  return (current + chunk).slice(0, MAX_OUTPUT_CHARS);
};

export const tailOutput = (text: string, limit = 4096): string =>
  text.length <= limit ? text.trim() : `…${text.slice(text.length - limit).trim()}`;

export const combinedOutput = (result: GitResult): string =>
  tailOutput(`${result.stdout}\n${result.stderr}`);

/**
 * Environment for every git invocation: never prompt for credentials, never
 * open an editor or pager, and keep output parseable (docs/09 §Subprocess rules).
 * A user-supplied `GIT_SSH_COMMAND` always wins.
 */
export const gitEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_EDITOR: 'true',
    GIT_PAGER: 'cat',
    LC_ALL: 'C',
  };
  if (env['GIT_SSH_COMMAND'] === undefined && process.platform !== 'win32') {
    env['GIT_SSH_COMMAND'] = 'ssh -o BatchMode=yes';
  }
  return env;
};

const killTree = (child: ChildProcess): void => {
  if (child.pid === undefined) return;
  try {
    if (process.platform === 'win32') child.kill('SIGKILL');
    else process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // Already gone.
    }
  }
};

/**
 * Runs git with an argv array — never a shell string, so a path or branch name
 * cannot be interpreted. Resolves for non-zero exits; only spawn failures and
 * timeouts are distinguishable through `code` and `timedOut`.
 */
export const runGit = (args: readonly string[], options: GitRunOptions): Promise<GitResult> =>
  new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const child = spawn('git', [...args], {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: gitEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    };

    timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    timer.unref?.();

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = appendCapped(stdout, chunk.toString('utf8'));
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = appendCapped(stderr, chunk.toString('utf8'));
    });
    child.once('error', (error) => {
      stderr = stderr === '' ? error.message : stderr;
      finish(127);
    });
    child.once('close', (code) => finish(code ?? 1));
  });
