import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RecordIndex } from '../../src/index/indexer.js';
import { clearSelfWrites, rememberSelfWrite } from '../../src/io/self-writes.js';
import { removeTempDir } from '../helpers/tmp.js';
import { makeEmptyWorkspace, makeFixtureWorkspace, snapshotTree } from '../helpers/workspace.js';

let cleanups: string[] = [];

afterEach(async () => {
  for (const dir of cleanups) await removeTempDir(dir);
  cleanups = [];
  clearSelfWrites();
});

const track = (parent: string): void => {
  cleanups.push(parent);
};

const hashOf = async (path: string): Promise<string> =>
  createHash('sha256').update(await readFile(path)).digest('hex');

async function demoIndex(): Promise<{ root: string; index: RecordIndex }> {
  const workspace = await makeFixtureWorkspace('demo');
  track(workspace.parent);
  const index = new RecordIndex({ root: workspace.root, retryDelaysMs: [] });
  await index.fullScan();
  return { root: workspace.root, index };
}

describe('full scan', () => {
  it('indexes the demo workspace with no issues', async () => {
    const { index } = await demoIndex();

    expect(index.list()).toHaveLength(13);
    expect(index.list('contact')).toHaveLength(2);
    expect(index.list('project')).toHaveLength(2);
    expect(index.list('task')).toHaveLength(5);
    expect(index.list('estimate')).toHaveLength(1);
    expect(index.list('invoice')).toHaveLength(1);
    expect(index.list('document')).toHaveLength(2);
    expect(index.issues()).toEqual([]);
    expect(index.generation).toBe(1);
  });

  it('derives Kanban columns from folders, in order', async () => {
    const { index } = await demoIndex();

    const todo = index.boardTasks('todo').map((entry) => entry.record.id);
    expect(todo).toHaveLength(2);
    const orders = index.boardTasks('todo').map((entry) => {
      const record = entry.record;
      return record.type === 'task' ? record.order : -1;
    });
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(index.boardTasks('doing')).toHaveLength(1);
    expect(index.boardTasks('done')).toHaveLength(2);
  });

  it('is idempotent — scanning twice yields the same projection', async () => {
    const { index } = await demoIndex();
    const first = index.snapshot();

    await index.fullScan();
    const second = index.snapshot();

    expect(second.records.map((entry) => entry.record.id)).toEqual(
      first.records.map((entry) => entry.record.id),
    );
    expect(second.issues).toEqual([]);
  });
});

describe('external edits', () => {
  it('keeps identity when a file is renamed', async () => {
    const { root, index } = await demoIndex();
    const id = 'cnt_01J8X7100BQ4M2N8V3R5T7W9Y0';

    await rename(join(root, 'contacts/cnt_jane-doe.md'), join(root, 'contacts/cnt_renamed.md'));
    await index.applyBatch({
      deletes: ['contacts/cnt_jane-doe.md'],
      upserts: ['contacts/cnt_renamed.md'],
    });

    expect(index.getById(id)?.record.path).toBe('contacts/cnt_renamed.md');
    expect(index.list()).toHaveLength(13);
    expect(index.issues()).toEqual([]);
  });

  it('changes task status when the file moves between columns', async () => {
    const { root, index } = await demoIndex();
    const from = 'tasks/todo/tsk_copy-review.md';
    const to = 'tasks/doing/tsk_copy-review.md';

    await rename(join(root, from), join(root, to));
    await index.applyBatch({ deletes: [from], upserts: [to] });

    expect(index.boardTasks('todo')).toHaveLength(1);
    expect(index.boardTasks('doing')).toHaveLength(2);

    const record = index.getById('tsk_01J8X7300BQ4M2N8V3R5T7W9Y0')?.record;
    expect(record?.type).toBe('task');
    if (record?.type === 'task') expect(record.status).toBe('doing');
  });

  it('keeps a hand-edited body verbatim', async () => {
    const { root, index } = await demoIndex();
    const path = join(root, 'contacts/cnt_jane-doe.md');
    const original = await readFile(path, 'utf8');
    const edited = original.replace('Referred by Priya.', 'Rewritten by hand.');

    await writeFile(path, edited);
    await index.applyChange('contacts/cnt_jane-doe.md');

    expect(index.getById('cnt_01J8X7100BQ4M2N8V3R5T7W9Y0')?.record.body).toContain(
      'Rewritten by hand.',
    );
  });

  it('drops a record that was deleted and reports dangling references', async () => {
    const { root, index } = await demoIndex();
    await rename(join(root, 'contacts/cnt_acme-corp.md'), join(root, '.deleted-cnt.md'));

    await index.applyDelete('contacts/cnt_acme-corp.md');

    expect(index.getById('cnt_01J8X7100AQ4M2N8V3R5T7W9Y0')).toBeNull();
    expect(index.list()).toHaveLength(12);
    expect(index.issues().some((issue) => issue.code === 'dangling-ref')).toBe(true);
  });

  it('keeps an orphan task indexed but off the board', async () => {
    const { index } = await (async () => {
      const workspace = await makeFixtureWorkspace('external-edits');
      track(workspace.parent);
      const index = new RecordIndex({ root: workspace.root, retryDelaysMs: [] });
      await index.fullScan();
      return { index };
    })();

    const orphan = index.getById('tsk_01J8X8100FQ4M2N8V3R5T7W9Y0')?.record;
    expect(orphan?.type).toBe('task');
    if (orphan?.type === 'task') expect(orphan.status).toBeNull();
    expect(index.boardTasks('doing').some((entry) => entry.record.id === orphan?.id)).toBe(false);
    expect(index.issues().some((issue) => issue.code === 'orphan-task-path')).toBe(true);
  });
});

describe('duplicate ids', () => {
  async function duplicateIndex(): Promise<{ root: string; index: RecordIndex }> {
    const workspace = await makeFixtureWorkspace('external-edits');
    track(workspace.parent);
    const index = new RecordIndex({ root: workspace.root, retryDelaysMs: [] });
    await index.fullScan();
    return { root: workspace.root, index };
  }

  it('keeps the canonical file and reports the other one', async () => {
    const { index } = await duplicateIndex();
    const id = 'cnt_01J8X8100BQ4M2N8V3R5T7W9Y0';

    expect(index.getById(id)?.record.path).toBe('contacts/cnt_duplicate-a.md');
    const issue = index.issues().find((entry) => entry.code === 'duplicate-id');
    expect(issue?.path).toBe('contacts/cnt_duplicate-b.md');
  });

  it('promotes the survivor when the canonical file is deleted', async () => {
    const { root, index } = await duplicateIndex();
    const id = 'cnt_01J8X8100BQ4M2N8V3R5T7W9Y0';

    await rename(join(root, 'contacts/cnt_duplicate-a.md'), join(root, '.gone.md'));
    await index.applyDelete('contacts/cnt_duplicate-a.md');

    expect(index.getById(id)?.record.path).toBe('contacts/cnt_duplicate-b.md');
    expect(index.issues().some((issue) => issue.code === 'duplicate-id')).toBe(false);
  });
});

describe('read-only guarantee', () => {
  it('never writes to disk while scanning', async () => {
    const workspace = await makeFixtureWorkspace('external-edits');
    track(workspace.parent);

    const before = await snapshotTree(workspace.root);
    const index = new RecordIndex({ root: workspace.root, retryDelaysMs: [] });
    await index.fullScan();
    await index.applyChange('contacts/cnt_renamed-anywhere.md');
    await index.applyDelete('contacts/cnt_missing-id.md');

    expect(await snapshotTree(workspace.root)).toEqual(before);
  });
});

describe('parse failures and retries', () => {
  it('quarantines invalid YAML without touching the file', async () => {
    const workspace = await makeEmptyWorkspace();
    track(workspace.parent);
    const path = join(workspace.root, 'contacts/cnt_bad.md');
    await writeFile(path, '---\nid: [unclosed\n---\nbody\n');

    const index = new RecordIndex({ root: workspace.root, retryDelaysMs: [] });
    await index.applyChange('contacts/cnt_bad.md');

    expect(index.list()).toHaveLength(0);
    expect(index.issues().map((issue) => issue.code)).toEqual(['parse-error']);
    expect(await readFile(path, 'utf8')).toContain('[unclosed');
  });

  it('retries a file that is being written and succeeds once it is valid', async () => {
    const workspace = await makeEmptyWorkspace();
    track(workspace.parent);
    const path = join(workspace.root, 'contacts/cnt_late.md');
    await writeFile(path, '---\nid: cnt_late');

    const index = new RecordIndex({ root: workspace.root, retryDelaysMs: [120] });
    const timer = setTimeout(() => {
      void writeFile(
        path,
        '---\nid: cnt_late\ntype: contact\nfirst_name: Late\n---\n\nBody\n',
      );
    }, 30);

    const summary = await index.applyChange('contacts/cnt_late.md');
    clearTimeout(timer);

    expect(summary.upserted).toEqual(['contacts/cnt_late.md']);
    expect(index.getById('cnt_late')).not.toBeNull();
    expect(index.issues()).toEqual([]);
  });
});

describe('self-write suppression', () => {
  it('ignores the echo of a write ob just made', async () => {
    const { root, index } = await demoIndex();
    const relative = 'contacts/cnt_jane-doe.md';
    const path = join(root, relative);
    const rewritten = (await readFile(path, 'utf8')).replace('Jane', 'Janet');

    await writeFile(path, rewritten);
    rememberSelfWrite(relative, await hashOf(path));
    const generation = index.generation;

    const summary = await index.applyChange(relative);

    expect(summary.ignored).toBe(true);
    expect(index.generation).toBe(generation);
    const record = index.getById('cnt_01J8X7100BQ4M2N8V3R5T7W9Y0')?.record;
    expect(record?.type).toBe('contact');
    if (record?.type === 'contact') expect(record.first_name).toBe('Jane');
  });

  it('still processes a real external edit that lands right after a write', async () => {
    const { root, index } = await demoIndex();
    const relative = 'contacts/cnt_jane-doe.md';
    const path = join(root, relative);

    rememberSelfWrite(relative, await hashOf(path));
    await writeFile(path, (await readFile(path, 'utf8')).replace('Jane', 'Janet'));

    const summary = await index.applyChange(relative);

    expect(summary.ignored).toBe(false);
    const record = index.getById('cnt_01J8X7100BQ4M2N8V3R5T7W9Y0')?.record;
    expect(record?.type).toBe('contact');
    if (record?.type === 'contact') expect(record.first_name).toBe('Janet');
  });
});
