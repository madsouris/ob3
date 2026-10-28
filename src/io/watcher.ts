import { join, relative, sep } from 'node:path';
import { watch } from 'chokidar';
import { MANAGED_ROOTS } from './path-safety.js';

export interface WatchBatch {
  /** Workspace-relative POSIX paths of files that were added or changed. */
  readonly upserts: readonly string[];
  /** Workspace-relative POSIX paths of files that were removed. */
  readonly deletes: readonly string[];
}

export interface WorkspaceWatcher {
  readonly ready: Promise<void>;
  close(): Promise<void>;
}

export interface WatcherOptions {
  readonly root: string;
  readonly onChange: (batch: WatchBatch) => void;
  readonly onError?: (error: Error) => void;
  /** Per-path coalescing window; editors write several times per save. */
  readonly debounceMs?: number;
}

const toRelative = (root: string, absolute: string): string =>
  relative(root, absolute).split(sep).join('/');

const isHiddenRelative = (root: string, absolute: string): boolean => {
  const rel = relative(root, absolute);
  if (rel === '') return false;
  return rel.split(/[/\\]/).some((part) => part.startsWith('.'));
};

/**
 * Watches the six managed directories and emits coalesced batches. Parse
 * retries and self-write suppression live in the indexer, which sees hashes.
 */
export const createWorkspaceWatcher = (options: WatcherOptions): WorkspaceWatcher => {
  const debounceMs = options.debounceMs ?? 150;
  const upserts = new Set<string>();
  const deletes = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const flush = (): void => {
    timer = null;
    if (closed || (upserts.size === 0 && deletes.size === 0)) return;
    const batch: WatchBatch = {
      upserts: [...upserts].sort(),
      deletes: [...deletes].sort(),
    };
    upserts.clear();
    deletes.clear();
    options.onChange(batch);
  };

  const enqueue = (kind: 'upsert' | 'delete', absolute: string): void => {
    if (closed || !absolute.endsWith('.md')) return;
    const rel = toRelative(options.root, absolute);
    if (rel === '' || rel.startsWith('..')) return;

    if (kind === 'upsert') {
      deletes.delete(rel);
      upserts.add(rel);
    } else {
      upserts.delete(rel);
      deletes.add(rel);
    }

    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
    timer.unref?.();
  };

  const watcher = watch(
    MANAGED_ROOTS.map((dir) => join(options.root, dir)),
    {
      ignoreInitial: true,
      followSymlinks: false,
      depth: 3,
      ignored: (path) => isHiddenRelative(options.root, path),
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 30 },
    },
  );

  watcher.on('add', (path) => enqueue('upsert', path));
  watcher.on('change', (path) => enqueue('upsert', path));
  watcher.on('unlink', (path) => enqueue('delete', path));
  watcher.on('error', (error) => {
    options.onError?.(error instanceof Error ? error : new Error(String(error)));
  });

  const ready = new Promise<void>((resolve) => {
    watcher.once('ready', () => resolve());
  });

  return {
    ready,
    close: async () => {
      closed = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      await watcher.close();
    },
  };
};
