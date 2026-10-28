import type { RecordIndex } from '../index/indexer.js';
import type { ObConfig } from '../workspace/config.js';
import { readConfig } from '../workspace/config.js';
import type { RecordServiceContext } from './services/records.js';
import type { EventBus } from './events.js';

export interface AppContext {
  readonly workspace: string;
  readonly index: RecordIndex;
  readonly bus: EventBus;
  readonly token: string;
  readonly version: string;
  readonly startedAt: number;
  readonly port: number;
}

export const recordServiceContext = (context: AppContext): RecordServiceContext => ({
  workspace: context.workspace,
  index: context.index,
  config: (): Promise<ObConfig> => readConfig(context.workspace),
});

export const countsByType = (index: RecordIndex): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const type of ['contact', 'project', 'task', 'estimate', 'invoice', 'document']) {
    counts[type] = index.list(type as never).length;
  }
  return counts;
};
