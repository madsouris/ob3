import { RecordIndex } from '../index/indexer.js';
import { createWorkspaceWatcher } from '../io/watcher.js';
import type { WorkspaceWatcher } from '../io/watcher.js';
import type { EventBus } from './events.js';
import { createEventBus } from './events.js';
import { toApiRecord } from './services/records.js';

export interface WorkspaceRuntime {
  readonly index: RecordIndex;
  readonly bus: EventBus;
  readonly watcher: WorkspaceWatcher;
  close(): Promise<void>;
}

export interface RuntimeOptions {
  readonly root: string;
  readonly retryDelaysMs?: readonly number[];
}

/**
 * Owns the index + watcher for a running server. External edits are applied to
 * the index and fanned out over SSE; mutations made through the API publish
 * from their route handlers (the watcher echo is suppressed).
 */
export const createWorkspaceRuntime = async (
  options: RuntimeOptions,
): Promise<WorkspaceRuntime> => {
  const index = new RecordIndex({
    root: options.root,
    ...(options.retryDelaysMs === undefined ? {} : { retryDelaysMs: options.retryDelaysMs }),
  });
  await index.fullScan();

  const bus = createEventBus();
  let queue: Promise<void> = Promise.resolve();

  const watcher = createWorkspaceWatcher({
    root: options.root,
    onChange: (batch) => {
      queue = queue.then(async () => {
        const deletedIds = new Map<string, string>();
        for (const path of batch.deletes) {
          const entry = index.getByPath(path);
          if (entry !== null) deletedIds.set(path, entry.record.id);
        }

        const summary = await index.applyBatch(batch);
        if (summary.ignored) return;

        for (const path of summary.deleted) {
          const id = deletedIds.get(path);
          if (id !== undefined) {
            bus.publish('record.delete', { generation: summary.generation, id });
          }
        }
        for (const path of summary.upserted) {
          const entry = index.getByPath(path);
          if (entry !== null) {
            bus.publish('record.upsert', {
              generation: summary.generation,
              record: toApiRecord(entry),
            });
          }
        }
        bus.publish('issues.changed', {
          generation: summary.generation,
          issues: index.issues(),
        });
      });
      queue = queue.catch((error) => {
        console.error('ob: failed to apply workspace change', error);
      });
    },
  });

  await watcher.ready;

  let closed = false;

  return {
    index,
    bus,
    watcher,
    close: async () => {
      if (closed) return;
      closed = true;
      await watcher.close();
      await queue.catch(() => undefined);
    },
  };
};
