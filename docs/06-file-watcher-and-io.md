# 06 — File Watcher & Atomic IO

Milestone: **M2** · Spec: `brief.md` §6 · Code: `src/io/`

## Purpose

One IO choke point: every read/write in the app goes through here. Guarantees are byte-preserving writes, no partial files, no watcher feedback loops.

## Watcher

```ts
chokidar.watch(MANAGED_DIRS, {
  ignoreInitial: false,          // initial add events are treated as a scan seed
  persistent: true,
  followSymlinks: false,
  depth: 3,
  ignored: [/\.ob\/state/, /(^|[/\\])\./, /node_modules/],
  awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 30 },
})
```

* Events consumed: `add`, `change`, `unlink`. `addDir`/`unlinkDir` are used only to recreate missing managed folders lazily.
* Debounce: per-path 150 ms coalescing, then hash-compare, then index update (doc 05). Editors that write 4× per save collapse into one parse.
* `MANAGED_DIRS` = `contacts`, `projects`, `tasks`, `estimates`, `invoices`, `documents`. Everything else is invisible to `ob` (a user's `src/` folder or `node_modules` never touches the index).
* Fallback: `CHOKIDAR_USEPOLLING=1` forces polling; auto-enabled after 3 consecutive "no events during a known write" detections (network drives, WSL `/mnt/c`).
* Watcher errors (EMFILE, EPERM) are logged and downgraded to a polling retry after 5 s; the server keeps serving the last index. The UI shows a `watcher: degraded` banner because it means staleness is now possible.

## Atomic write

```ts
async function writeAtomic(absPath, data) {
  const dir = dirname(absPath)
  const tmp = join(dir, `.ob-tmp-${randomUUID()}`)
  const fh = await open(tmp, 'wx', 0o600)
  try { await fh.writeFile(data); await fh.sync() } finally { await fh.close() }
  await rename(tmp, absPath)     // same filesystem => atomic on POSIX & NTFS
}
```

* Temporary files are created **in the destination directory** (cross-device `rename` fails across volumes).
* Mode is preserved from the original file when it exists; new files get `0o600` on POSIX (inherits umask on Windows).
* On Windows, `rename` over an existing file can throw `EPERM` when an editor holds a lock: retry ×5 with 40 ms backoff, then surface a `write-locked` error to the UI rather than corrupting anything.
* `.ob-tmp-*` files are excluded from the watcher and swept on startup (older than 1 min).

## Echo suppression

`ob` must not react to its own writes.

1. Before writing, record `{ absPath, expectedHash, expiresAt: now + 1500 ms }` in a `SelfWrites` map.
2. On a watcher event for that path, if the current hash matches `expectedHash`, drop the event and remove the entry.
3. Entries expire so a genuinely external edit immediately after an `ob` write is still processed.

Suppression is hash-based, not time-based only, so a user edit that happens to coincide with an `ob` write is never swallowed.

## Read

* `readFile` returns bytes + `mtimeMs`; the caller hashes.
* Size cap 2 MB; above that → `too-large` issue, no parse.
* UTF-8 validation: invalid sequences → `unreadable`.
* BOM detected and preserved across the round-trip.

## Delete

`unlink` only for `ob`-initiated record deletion, and only after the index confirms the id exists. Never recursive, never a directory, never outside the managed dirs.

## Path safety

```ts
function resolveInWorkspace(relPath): string {
  const root = realpath(workspaceRoot)
  const abs = path.resolve(root, relPath)
  const real = realpathSync.missing(abs)           // resolve existing prefix
  if (!real.startsWith(root + path.sep)) throw new PathEscape()
  if (!isManaged(real)) throw new PathEscape()
  return real
}
```

Applies to API inputs *and* to values read from frontmatter (`terms_document`).

## Ordering guarantee

All writes for a single record are serialized through a per-path promise chain (`Map<path, Promise>`). Two rapid PATCHes cannot interleave a read-modify-write and lose an update.

## Acceptance criteria

- [ ] Writing a file while `ls -la` polls never shows a partially written file. *(atomic writer exists; no fault-injection test yet)*
- [x] `ob` saving a record produces no second index update and no SSE echo loop (self-write suppression by content hash).
- [x] An external edit 200 ms after an `ob` save is processed normally (not suppressed).
- [ ] Deleting a directory externally and recreating it makes `ob` resume watching without a restart.
- [x] `..`, absolute paths, and `terms_document: ../../etc/passwd` are all rejected at the path layer (`resolveInWorkspace`); wiring into the HTTP layer lands in M3.
- [ ] 10 concurrent PATCHes to one record produce a consistent final file and no lost fields. *(M3)*
