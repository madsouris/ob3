import { mkdir, readFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { initializeRepository } from '../git/repo.js';
import { exists, writeFileAtomic } from '../io/atomic.js';
import type { InitMode } from '../cli/args.js';
import { defaultConfig, writeConfig } from './config.js';
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
 * Demo content comes from `fixtures/workspaces/demo` — never from code
 * literals — so the shipped package, the preview and the tests cannot drift.
 */
export async function initWorkspace(options: InitOptions): Promise<InitResult> {
  const { root, mode } = options;
  const warnings: string[] = [];
  const configPath = workspacePath(root, CONFIG_FILE);

  await mkdir(root, { recursive: true });
  for (const dir of MANAGED_DIRS) {
    await mkdir(join(root, dir), { recursive: true });
  }
  await mkdir(join(root, STATE_DIR), { recursive: true });

  if (mode === 'empty' && !(await exists(configPath))) {
    await writeConfig(root, defaultConfig(), { exclusive: true });
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
    for (const file of await demoFiles()) {
      // The workspace config is user-owned once it exists: never suffix it.
      if (file.path === CONFIG_FILE && (await exists(configPath))) {
        filesSkipped += 1;
        continue;
      }
      const written = await writeUnique(workspacePath(root, file.path), file.content);
      if (written) filesWritten += 1;
      else filesSkipped += 1;
    }

    if (!(await exists(configPath))) {
      await writeConfig(root, defaultConfig(), { exclusive: true });
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
 * fixture copy is written alongside it with a `-2` suffix.
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
  try {
    await initializeRepository(root, identity === undefined ? {} : { identity });
  } catch (error) {
    throw new InitError(error instanceof Error ? error.message : String(error));
  }
}
