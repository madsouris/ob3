import { realpathSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';

/** Directories whose `.md` files belong to the CRM. */
export const MANAGED_ROOTS = [
  'contacts',
  'projects',
  'tasks',
  'estimates',
  'invoices',
  'documents',
] as const;

export type ManagedRoot = (typeof MANAGED_ROOTS)[number];

export class PathEscapeError extends Error {
  override name = 'PathEscapeError';
}

export const normalizeRelativePath = (input: string): string => {
  const normalized = input.replace(/\\/g, '/');

  if (normalized.includes('\0')) throw new PathEscapeError('Path contains a null byte');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new PathEscapeError('Absolute paths are not allowed');
  }

  const segments = normalized.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.some((segment) => segment === '..')) {
    throw new PathEscapeError('Path escapes the workspace');
  }
  if (segments.length === 0) throw new PathEscapeError('Empty path');

  return segments.join('/');
};

export const isManagedRelativePath = (relativePath: string): boolean => {
  const [root] = relativePath.split('/');
  return (MANAGED_ROOTS as readonly string[]).includes(root ?? '');
};

/**
 * Realpath of the longest existing prefix, with the non-existent tail
 * re-appended. This is what lets a not-yet-created file be validated while
 * still catching a symlinked parent that points outside the workspace.
 */
const realpathWithMissingTail = (target: string): string => {
  const tail: string[] = [];
  let current = target;

  for (;;) {
    try {
      const real = realpathSync.native(current);
      return tail.length === 0 ? real : resolve(real, ...tail);
    } catch {
      const parent = dirname(current);
      if (parent === current) return target;
      tail.unshift(basename(current));
      current = parent;
    }
  }
};

/** Resolves a workspace-relative path, rejecting escapes and symlink tricks (doc 06). */
export const resolveInWorkspace = (root: string, relativePath: string): string => {
  const relative = normalizeRelativePath(relativePath);
  const realRoot = realpathSync.native(root);
  const target = resolve(realRoot, ...relative.split('/'));
  const realTarget = realpathWithMissingTail(target);
  const prefix = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;

  if (realTarget !== realRoot && !realTarget.startsWith(prefix)) {
    throw new PathEscapeError('Path resolves outside the workspace');
  }
  return target;
};

/** Same as `resolveInWorkspace`, but only managed record directories are allowed. */
export const resolveRecordPath = (root: string, relativePath: string): string => {
  const relative = normalizeRelativePath(relativePath);
  if (!isManagedRelativePath(relative)) {
    throw new PathEscapeError(`Path is outside the managed directories: ${relative}`);
  }
  return resolveInWorkspace(root, relative);
};
