import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Directories whose contents the index and watcher care about (docs/05, docs/06). */
export const MANAGED_DIRS = [
  'contacts',
  'projects',
  'tasks',
  'tasks/todo',
  'tasks/doing',
  'tasks/done',
  'estimates',
  'invoices',
  'documents',
] as const;

export const OB_DIR = '.ob';
export const CONFIG_FILE = '.ob/config.json';
export const STATE_DIR = '.ob/state';
export const ASSETS_DIR = '.ob/assets';
export const LOGO_FILE = '.ob/assets/logo.png';
export const LOCK_FILE = '.ob/state/server.lock';
export const SESSION_FILE = '.ob/state/session.json';
export const GITIGNORE_FILE = '.gitignore';

export const GITIGNORE_CONTENT = '.ob/state/\n.DS_Store\n';

export const DEFAULT_PORT = 19731;
export const PORT_PROBE_RANGE = 50;

/**
 * Canonicalizes a user-supplied workspace path. Missing paths are resolved
 * lexically (they may be created next); existing paths go through realpath so
 * symlinked workspaces behave consistently.
 */
export function resolveWorkspace(input: string): string {
  const absolute = resolve(input);
  try {
    return realpathSync.native(absolute);
  } catch {
    return absolute;
  }
}

export function workspacePath(root: string, relativePath: string): string {
  return join(root, relativePath);
}
