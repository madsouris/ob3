import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export type DemoFile = { path: string; content: string };

export class DemoSourceError extends Error {
  override name = 'DemoSourceError';
}

/**
 * Locates the canonical demo workspace, which lives as real files in the repo
 * (`fixtures/workspaces/demo`) and is copied to `dist/demo` at build time so it
 * ships inside the package. Same trick as the UI bundle: no cwd assumptions.
 *
 *   src/workspace/demo.ts  -> <repo>/fixtures/workspaces/demo
 *   dist/workspace/demo.js -> <package>/dist/demo
 */
export function resolveDemoDir(moduleUrl: string = import.meta.url): string | null {
  const candidates = [
    fileURLToPath(new URL('../../fixtures/workspaces/demo', moduleUrl)),
    fileURLToPath(new URL('../demo', moduleUrl)),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/**
 * Reads the demo workspace into memory. Paths are workspace-relative POSIX
 * paths and the result is sorted, so seeding is deterministic.
 */
export async function demoFiles(directory?: string): Promise<DemoFile[]> {
  const dir = directory ?? resolveDemoDir();
  if (dir === null) {
    throw new DemoSourceError(
      'Demo workspace source not found. Run `npm run build` (fixtures are copied to dist/demo) or check fixtures/workspaces/demo.',
    );
  }
  if (!existsSync(dir)) {
    throw new DemoSourceError(`Demo workspace source not found at ${dir}`);
  }

  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files: DemoFile[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const absolute = join(entry.parentPath, entry.name);
    files.push({
      path: relative(dir, absolute).split(sep).join('/'),
      content: await readFile(absolute, 'utf8'),
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  if (!files.some((file) => file.path === '.ob/config.json')) {
    throw new DemoSourceError(`Demo workspace at ${dir} is missing .ob/config.json`);
  }

  return files;
}
