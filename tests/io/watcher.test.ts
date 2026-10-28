import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WatchBatch } from '../../src/io/watcher.js';
import { createWorkspaceWatcher } from '../../src/io/watcher.js';
import { removeTempDir } from '../helpers/tmp.js';
import { makeEmptyWorkspace, writeRecord } from '../helpers/workspace.js';

const cleanups: string[] = [];
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  for (const dir of cleanups.splice(0)) await removeTempDir(dir);
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('workspace watcher', () => {
  it(
    'emits coalesced upserts and deletes for markdown files',
    async () => {
    const workspace = await makeEmptyWorkspace();
    cleanups.push(workspace.parent);

    const batches: WatchBatch[] = [];
    const watcher = createWorkspaceWatcher({
      root: workspace.root,
      debounceMs: 60,
      onChange: (batch) => batches.push(batch),
    });
    closers.push(() => watcher.close());
    await watcher.ready;

    await writeRecord(workspace.root, 'contacts/cnt_a.md', '---\nid: cnt_a\n---\n');
    await vi.waitFor(
      () =>
        expect(batches.some((batch) => batch.upserts.includes('contacts/cnt_a.md'))).toBe(true),
      { timeout: 8000, interval: 50 },
    );

    batches.length = 0;
    await unlink(join(workspace.root, 'contacts/cnt_a.md'));
    await vi.waitFor(
      () =>
        expect(batches.some((batch) => batch.deletes.includes('contacts/cnt_a.md'))).toBe(true),
      { timeout: 8000, interval: 50 },
    );
    },
    20_000,
  );

  it(
    'coalesces multiple writes to one file into a single batch entry',
    async () => {
    const workspace = await makeEmptyWorkspace();
    cleanups.push(workspace.parent);

    const batches: WatchBatch[] = [];
    const watcher = createWorkspaceWatcher({
      root: workspace.root,
      debounceMs: 200,
      onChange: (batch) => batches.push(batch),
    });
    closers.push(() => watcher.close());
    await watcher.ready;

    const path = 'documents/doc_burst.md';
    for (let index = 0; index < 4; index += 1) {
      await writeRecord(workspace.root, path, `---\nid: doc_burst\nattempt: ${index}\n---\n`);
      await sleep(20);
    }

    await vi.waitFor(() => expect(batches.length).toBeGreaterThan(0), {
      timeout: 8000,
      interval: 50,
    });

    const upsertCount = batches.reduce(
      (total, batch) => total + batch.upserts.filter((entry) => entry === path).length,
      0,
    );
    expect(upsertCount).toBe(1);
    },
    20_000,
  );

  it(
    'ignores hidden, non-markdown and out-of-scope files',
    async () => {
    const workspace = await makeEmptyWorkspace();
    cleanups.push(workspace.parent);

    const batches: WatchBatch[] = [];
    const watcher = createWorkspaceWatcher({
      root: workspace.root,
      debounceMs: 60,
      onChange: (batch) => batches.push(batch),
    });
    closers.push(() => watcher.close());
    await watcher.ready;

    await writeRecord(workspace.root, 'contacts/.hidden.md', '---\nid: cnt_hidden\n---\n');
    await writeRecord(workspace.root, 'contacts/notes.txt', 'plain text');
    await sleep(600);

    expect(batches).toEqual([]);
    },
    20_000,
  );
});
