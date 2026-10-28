import { mkdir, readFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { execFileResult } from '../cli/exec.js';
import { exists, writeFileAtomic } from '../io/atomic.js';
import type { InitMode } from '../cli/args.js';
import { defaultConfig, demoConfig, writeConfig } from './config.js';
import { demoFiles } from './demo.js';
import {
  CONFIG_FILE,
  GITIGNORE_CONTENT,
  GITIGNORE_FILE,
  MANAGED_DIRS,
  STATE_DIR,
  workspacePath,
} from './paths.js';

export type GitIdentity = { name: string; email: string };

export type InitOptions = {
  root: string;
  mode: InitMode;
  git: boolean;
  gitIdentity?: GitIdentity;
};

export type InitResult = {
  filesWritten: number;
  filesSkipped: number;
  gitInitialized: boolean;
  warnings: string[];
};

export class InitError extends Error {
  override name = 'InitError';
}

/**
 * Creates the workspace skeleton, config and (for demo mode) seed records.
 * Never overwrites an existing file: collisions get a `-2` suffix instead.
 */
export async function initWorkspace(options: InitOptions): Promise<InitResult> {
  const { root, mode } = options;
  const warnings: string[] = [];

  await mkdir(root, { recursive: true });
  for (const dir of MANAGED_DIRS) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await mkdir(join(root, STATE_DIR), { recursive: true });

  const configPath = workspacePath(root, CONFIG_FILE);
  if (!(await exists(configPath))) {
    await writeConfig(root, mode === 'demo' ? demoConfig() : defaultConfig(), { exclusive: true });
  }

  const gitignorePath = workspacePath(root, GITIGNORE_FILE);
  if (!(await exists(gitignorePath))) {
    await writeFileAtomic(gitignorePath, GITIGNORE_CONTENT, { exclusive: true });
  } else {
    const current = await readFile(gitignorePath, 'utf8');
    if (!current.includes('.ob/state')) {
      warnings.push(
        `${GITIGNORE_FILE} does not ignore .ob/state — add it so the session token is not committed.`,
      );
    }
  }

  let filesWritten = 0;
  let filesSkipped = 0;
  if (mode === 'demo') {
    for (const file of demoFiles()) {
      const written = await writeUnique(workspacePath(root, file.path), file.content);
      if (written) filesWritten += 1;
      else filesSkipped += 1;
    }
  }

  let gitInitialized = false;
  if (options.git && !(await exists(join(root, '.git')))) {
    await gitInit(root, options.gitIdentity);
    gitInitialized = true;
  }

  return { filesWritten, filesSkipped, gitInitialized, warnings };
}

/**
 * Idempotent seeding: an identical file is skipped (re-running init must not
 * duplicate records); a different file at the same path is preserved and the
 * demo record is written alongside it with a `-2` suffix.
 */
async function writeUnique(absolutePath: string, content: string): Promise<boolean> {
  let candidate = absolutePath;
  if (await exists(candidate)) {
    const existing = await readFile(candidate, 'utf8');
    if (existing === content) return false;

    const extension = extname(absolutePath);
    const base = basename(absolutePath, extension);
    const dir = dirname(absolutePath);
    let suffix = 2;
    candidate = join(dir, `${base}-${suffix}${extension}`);
    while (await exists(candidate)) {
      suffix += 1;
      candidate = join(dir, `${base}-${suffix}${extension}`);
    }
  }
  await writeFileAtomic(candidate, content);
  return true;
}

async function gitInit(root: string, identity: GitIdentity | undefined): Promise<void> {
  const identityArgs =
    identity === undefined ? [] : ['-c', `user.name=${identity.name}`, '-c', `user.email=${identity.email}`];

  const steps: Array<{ args: string[]; label: string }> = [
    { args: ['init', '--quiet'], label: 'git init' },
    { args: ['add', '-A'], label: 'git add' },
    { args: [...identityArgs, 'commit', '--quiet', '--no-verify', '-m', 'ob: initialize workspace'], label: 'git commit' },
  ];

  for (const step of steps) {
    const result = await execFileResult('git', step.args, { cwd: root });
    if (result.code !== 0) {
      throw new InitError(`${step.label} failed in ${root}: ${result.stderr.trim()}`);
    }
  }
}
