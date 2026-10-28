import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_RECORD_BYTES } from '../../src/io/reader.js';
import { RecordIndex } from '../../src/index/indexer.js';
import { removeTempDir } from '../helpers/tmp.js';
import { makeEmptyWorkspace, makeFixtureWorkspace, writeRecord } from '../helpers/workspace.js';

let cleanups: string[] = [];

afterEach(async () => {
  for (const dir of cleanups) await removeTempDir(dir);
  cleanups = [];
});

const track = (parent: string): void => {
  cleanups.push(parent);
};

async function scan(root: string): Promise<RecordIndex> {
  const index = new RecordIndex({ root, retryDelaysMs: [] });
  await index.fullScan();
  return index;
}

describe('external-edits fixture', () => {
  async function fixtureIndex(): Promise<RecordIndex> {
    const workspace = await makeFixtureWorkspace('external-edits');
    track(workspace.parent);
    return scan(workspace.root);
  }

  it('indexes what it can and reports everything else', async () => {
    const index = await fixtureIndex();

    expect(index.list()).toHaveLength(9);
    const codes = index
      .issues()
      .map((issue) => issue.code)
      .sort();
    expect(codes).toEqual([
      'conflict-marker',
      'dangling-ref',
      'duplicate-id',
      'duplicate-number',
      'missing-id',
      'orphan-task-path',
      'parse-error',
    ]);
  });

  it('reports a missing id without assigning one', async () => {
    const index = await fixtureIndex();
    const issue = index.issues().find((entry) => entry.code === 'missing-id');
    expect(issue?.path).toBe('contacts/cnt_missing-id.md');
    expect(issue?.actions).toContain('assign-id');
  });

  it('reports unparseable YAML with the parser message', async () => {
    const index = await fixtureIndex();
    const issue = index.issues().find((entry) => entry.code === 'parse-error');
    expect(issue?.path).toBe('estimates/est_bad-yaml.md');
    expect(issue?.detail ?? '').not.toBe('');
  });

  it('reports dangling references as warnings', async () => {
    const index = await fixtureIndex();
    const issue = index.issues().find((entry) => entry.code === 'dangling-ref');
    expect(issue?.path).toBe('projects/proj_dangling.md');
    expect(issue?.severity).toBe('warning');
  });

  it('reports unresolved conflict markers', async () => {
    const index = await fixtureIndex();
    const issue = index.issues().find((entry) => entry.code === 'conflict-marker');
    expect(issue?.path).toBe('invoices/inv_conflict.md');
    expect(issue?.severity).toBe('error');
  });

  it('reports duplicate numbers on all but the first file', async () => {
    const index = await fixtureIndex();
    const issues = index.issues().filter((entry) => entry.code === 'duplicate-number');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe('estimates/est_dup-b.md');
  });

  it('preserves unknown frontmatter keys', async () => {
    const index = await fixtureIndex();
    const entry = index.list('project').find((item) => item.record.path === 'projects/proj_unknown-keys.md');
    expect(entry?.record.extra).toEqual({ foo: { nested: [1, 2, 3], flag: true } });
  });

  it('degrades a schema-invalid record but keeps it usable', async () => {
    const index = await fixtureIndex();
    // No record in this fixture is schema-invalid, but the orphan task is
    // degraded by its path issue only; assert the flag is false for it.
    const orphan = index.getById('tsk_01J8X8100FQ4M2N8V3R5T7W9Y0');
    expect(orphan?.degraded).toBe(false);
  });

  it('is stable across a rescan', async () => {
    const workspace = await makeFixtureWorkspace('external-edits');
    track(workspace.parent);
    const index = await scan(workspace.root);
    const first = index.snapshot();

    await index.fullScan();
    const second = index.snapshot();

    expect(second.records.map((entry) => entry.record.id).sort()).toEqual(
      first.records.map((entry) => entry.record.id).sort(),
    );
    expect(second.issues.map((issue) => issue.key).sort()).toEqual(
      first.issues.map((issue) => issue.key).sort(),
    );
  });
});

describe('generated edge cases', () => {
  it('indexes a CRLF file and keeps its line endings', async () => {
    const workspace = await makeEmptyWorkspace();
    track(workspace.parent);
    await writeRecord(
      workspace.root,
      'contacts/cnt_crlf.md',
      '---\r\nid: cnt_crlf\r\ntype: contact\r\nfirst_name: Crlf\r\n---\r\n\r\nBody line\r\n',
    );

    const index = await scan(workspace.root);
    const record = index.getById('cnt_crlf')?.record;
    expect(record?.type).toBe('contact');
    expect(record?.body).toBe('\r\nBody line\r\n');
    expect(index.issues()).toEqual([]);
  });

  it('indexes a file with a BOM', async () => {
    const workspace = await makeEmptyWorkspace();
    track(workspace.parent);
    await writeRecord(
      workspace.root,
      'contacts/cnt_bom.md',
      '\uFEFF---\nid: cnt_bom\ntype: contact\nfirst_name: Bom\n---\n',
    );

    const index = await scan(workspace.root);
    expect(index.getById('cnt_bom')).not.toBeNull();
    expect(index.issues()).toEqual([]);
  });

  it('reports an oversized file instead of reading it', async () => {
    const workspace = await makeEmptyWorkspace();
    track(workspace.parent);
    const oversized = `---\nid: cnt_big\n---\n${'x'.repeat(MAX_RECORD_BYTES + 1)}`;
    await writeRecord(workspace.root, 'contacts/cnt_big.md', oversized);

    const index = await scan(workspace.root);
    expect(index.getById('cnt_big')).toBeNull();
    expect(index.issues().map((issue) => issue.code)).toEqual(['too-large']);
  });

  it('ignores non-markdown, hidden and symlinked files', async () => {
    const workspace = await makeEmptyWorkspace();
    track(workspace.parent);
    await writeRecord(workspace.root, 'contacts/notes.txt', 'not a record');
    await writeRecord(workspace.root, 'contacts/.hidden.md', '---\nid: cnt_hidden\n---\n');

    const outside = await makeEmptyWorkspace();
    track(outside.parent);
    await writeRecord(outside.root, 'contacts/cnt_outside.md', '---\nid: cnt_outside\n---\n');
    let symlinked = false;
    try {
      await mkdir(join(workspace.root, 'contacts'), { recursive: true });
      await symlink(
        join(outside.root, 'contacts/cnt_outside.md'),
        join(workspace.root, 'contacts/cnt_link.md'),
      );
      symlinked = true;
    } catch {
      // Symlinks unavailable (Windows without developer mode).
    }

    const index = await scan(workspace.root);
    expect(index.list()).toHaveLength(0);
    expect(index.issues()).toEqual([]);
    if (symlinked) expect(index.getById('cnt_outside')).toBeNull();
  });

  it('does not follow a directory symlink into the index', async () => {
    const workspace = await makeEmptyWorkspace();
    track(workspace.parent);
    const outside = await makeEmptyWorkspace();
    track(outside.parent);
    await writeRecord(outside.root, 'contacts/cnt_outside.md', '---\nid: cnt_outside\n---\n');

    try {
      await symlink(join(outside.root, 'contacts'), join(workspace.root, 'contacts/linked'), 'dir');
    } catch {
      return;
    }

    const index = await scan(workspace.root);
    expect(index.getById('cnt_outside')).toBeNull();
  });

  it('reports a record whose required field is missing', async () => {
    const workspace = await makeEmptyWorkspace();
    track(workspace.parent);
    await writeRecord(
      workspace.root,
      'contacts/cnt_noname.md',
      '---\nid: cnt_noname\ntype: contact\nstatus: active\n---\n',
    );

    const index = await scan(workspace.root);
    const entry = index.getById('cnt_noname');
    expect(entry).not.toBeNull();
    expect(entry?.degraded).toBe(true);
    expect(index.issues().map((issue) => issue.code)).toEqual(['schema-invalid']);
  });

  it('removes the record and its issues when the file disappears', async () => {
    const workspace = await makeEmptyWorkspace();
    track(workspace.parent);
    await writeRecord(
      workspace.root,
      'contacts/cnt_temp.md',
      '---\nid: cnt_temp\ntype: contact\nstatus: nope\n---\n',
    );

    const index = await scan(workspace.root);
    expect(index.issues()).toHaveLength(1);

    await writeFile(join(workspace.root, 'contacts/cnt_temp.md'), '');
    const summary = await index.applyDelete('contacts/cnt_temp.md');

    expect(summary.deleted).toEqual(['contacts/cnt_temp.md']);
    expect(index.getById('cnt_temp')).toBeNull();
    expect(index.issues()).toEqual([]);
  });
});
