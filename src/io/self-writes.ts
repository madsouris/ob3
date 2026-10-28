/**
 * Remembers hashes of files `ob` just wrote so the watcher can drop the echo
 * (docs/06). Hash-based, not purely time-based: a user edit that lands inside
 * the TTL window is still processed.
 */
export interface PendingSelfWrite {
  readonly hash: string;
  readonly expiresAt: number;
}

const DEFAULT_TTL_MS = 1500;
const pending = new Map<string, PendingSelfWrite>();

const prune = (now: number): void => {
  for (const [path, entry] of pending) {
    if (entry.expiresAt <= now) pending.delete(path);
  }
};

export const rememberSelfWrite = (
  path: string,
  hash: string,
  options: { ttlMs?: number; now?: number } = {},
): void => {
  const now = options.now ?? Date.now();
  prune(now);
  pending.set(path, { hash, expiresAt: now + (options.ttlMs ?? DEFAULT_TTL_MS) });
};

/**
 * Returns true (and clears the entry) when the observed hash is exactly what
 * `ob` wrote. A different hash means a real external edit — never suppressed.
 */
export const consumeSelfWrite = (path: string, hash: string, now = Date.now()): boolean => {
  prune(now);
  const entry = pending.get(path);
  if (entry === undefined) return false;
  if (entry.hash !== hash) return false;
  pending.delete(path);
  return true;
};

export const isPendingSelfWrite = (path: string, now = Date.now()): boolean => {
  prune(now);
  return pending.has(path);
};

export const pendingSelfWriteCount = (now = Date.now()): number => {
  prune(now);
  return pending.size;
};

export const clearSelfWrites = (): void => {
  pending.clear();
};
