import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceRuntime } from '../../src/server/runtime.js';
import type { WorkspaceRuntime } from '../../src/server/runtime.js';
import { defaultConfig, writeConfig } from '../../src/workspace/config.js';
import { removeTempDir } from '../helpers/tmp.js';
import { makeEmptyWorkspace, writeRecord } from '../helpers/workspace.js';

let runtimes: WorkspaceRuntime[] = [];
let cleanups: string[] = [];

afterEach(async () => {
  for (const runtime of runtimes) await runtime.close();
  runtimes = [];
  for (const dir of cleanups) await removeTempDir(dir);
  cleanups = [];
});

async function runtime(): Promise<{ runtime: WorkspaceRuntime; root: string }> {
  const workspace = await makeEmptyWorkspace();
  cleanups.push(workspace.parent);
  await writeConfig(workspace.root, defaultConfig());
  const created = await createWorkspaceRuntime({ root: workspace.root, retryDelaysMs: [] });
  runtimes.push(created);
  return { runtime: created, root: workspace.root };
}

const record = (id: string, firstName: string): string =>
  `---\nid: ${id}\ntype: contact\nfirst_name: ${firstName}\n---\n\nBody\n`;

describe('workspace runtime', () => {
  it('indexes the workspace on start', async () => {
    const { runtime: created, root } = await runtime();
    await writeRecord(root, 'contacts/cnt_seed.md', record('cnt_seed', 'Seed'));
    await created.index.fullScan();
    expect(created.index.getById('cnt_seed')).not.toBeNull();
  });

  it(
    'publishes record events for external edits',
    async () => {
      const { runtime: created, root } = await runtime();
      const events: string[] = [];
      created.bus.subscribe((event) => events.push(event.event));

      await writeRecord(root, 'contacts/cnt_live.md', record('cnt_live', 'Live'));

      await vi.waitFor(() => expect(events).toContain('record.upsert'), {
        timeout: 8000,
        interval: 50,
      });
      expect(created.index.getById('cnt_live')).not.toBeNull();
    },
    20_000,
  );

  it(
    'publishes a delete event for external removals',
    async () => {
      const { runtime: created, root } = await runtime();
      const target = join(root, 'contacts/cnt_gone.md');

      const events: string[] = [];
      created.bus.subscribe((event) => events.push(event.event));

      await writeRecord(root, 'contacts/cnt_gone.md', record('cnt_gone', 'Gone'));
      await vi.waitFor(() => expect(events).toContain('record.upsert'), {
        timeout: 8000,
        interval: 50,
      });
      expect(created.index.getById('cnt_gone')).not.toBeNull();

      await rm(target);
      await vi.waitFor(() => expect(events).toContain('record.delete'), {
        timeout: 8000,
        interval: 50,
      });
      expect(created.index.getById('cnt_gone')).toBeNull();
    },
    20_000,
  );

  it('closes cleanly', async () => {
    const { runtime: created, root } = await runtime();
    await created.close();
    // Writing after close must not throw or emit.
    await writeFile(join(root, 'contacts/cnt_after.md'), record('cnt_after', 'After'));
    expect(created.index.getById('cnt_after')).toBeNull();
  });
});
