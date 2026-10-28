import { execFile } from 'node:child_process';

export type ExecResult = { code: number; stdout: string; stderr: string };
export type ExecOptions = { cwd?: string };
export type Exec = (
  command: string,
  args: readonly string[],
  options?: ExecOptions,
) => Promise<ExecResult>;

/**
 * Runs a command without a shell. Never throws for a non-zero exit; an
 * unresolvable binary is reported as code 127.
 */
export const execFileResult: Exec = (command, args, options) =>
  new Promise((resolve) => {
    execFile(
      command,
      [...args],
      {
        timeout: 10_000,
        windowsHide: true,
        ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ code: 0, stdout, stderr });
          return;
        }
        const code = typeof error.code === 'number' ? error.code : 127;
        resolve({ code, stdout, stderr: stderr === '' ? error.message : stderr });
      },
    );
  });
