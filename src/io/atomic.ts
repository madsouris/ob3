import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Writes a file atomically: content goes to a temp file in the same directory,
 * then a rename replaces the target (docs/06-file-watcher-and-io.md). Rename is
 * only atomic within a volume, hence the same-directory placement.
 */
export async function writeFileAtomic(
  absolutePath: string,
  data: string,
  options: { exclusive?: boolean; mode?: number } = {},
): Promise<void> {
  await mkdir(dirname(absolutePath), { recursive: true });

  if (options.exclusive === true && (await exists(absolutePath))) {
    throw Object.assign(new Error(`EEXIST: file already exists, open '${absolutePath}'`), {
      code: 'EEXIST',
    });
  }

  const tempPath = `${dirname(absolutePath)}/.ob-tmp-${randomUUID()}`;
  const handle = await open(tempPath, 'wx', options.mode ?? 0o644);
  try {
    await handle.writeFile(data, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await rename(tempPath, absolutePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

/** Writes with mode 0600 — used for `.ob/state` files that hold the session token. */
export async function writePrivateFileAtomic(absolutePath: string, data: string): Promise<void> {
  await writeFileAtomic(absolutePath, data, { mode: 0o600 });
  await chmod(absolutePath, 0o600).catch(() => undefined);
}

export async function exists(absolutePath: string): Promise<boolean> {
  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(absolutePath: string): Promise<boolean> {
  try {
    return (await stat(absolutePath)).isDirectory();
  } catch {
    return false;
  }
}
