import FlexSearch from 'flexsearch';
import type { Index as FlexIndex, IndexOptions } from 'flexsearch';
import type { AnyRecord, RecordType } from '../model/schemas.js';
import { recordTitle } from '../model/schemas.js';
import type { RecordIndex } from './indexer.js';

/**
 * `flexsearch` ships a CJS bundle whose only ESM export is `default`, even
 * though its type declarations expose named ones. Node's interop therefore
 * fails on `import { Index }`; narrow the default export once, here.
 */
const { Index: FlexSearchIndex } = FlexSearch as unknown as {
  readonly Index: new (options?: IndexOptions<string>) => FlexIndex;
};

export interface SearchHit {
  readonly id: string;
  readonly type: RecordType;
  readonly title: string;
  readonly path: string;
}

export interface SearchOptions {
  readonly type?: RecordType;
  readonly limit?: number;
}

export interface SearchService {
  search(query: string, options?: SearchOptions): SearchHit[];
}

const TYPES: readonly RecordType[] = [
  'contact',
  'project',
  'task',
  'estimate',
  'invoice',
  'document',
];

const BODY_LIMIT = 2048;
const DOCUMENT_BODY_LIMIT = 8192;

/** Fields worth indexing per type (docs/10-search.md). */
const searchableText = (record: AnyRecord): string => {
  const parts: string[] = [record.id, recordTitle(record), record.body.slice(0, BODY_LIMIT)];

  switch (record.type) {
    case 'contact':
      parts.push(
        record.first_name,
        record.last_name,
        record.email,
        record.company,
        record.job_role,
      );
      break;
    case 'project':
      parts.push(record.project_name);
      break;
    case 'task':
      parts.push(record.title);
      break;
    case 'estimate':
    case 'invoice':
      parts.push(record.title, ...record.line_items.map((line) => line.description));
      break;
    case 'document':
      parts.push(record.title, record.body.slice(0, DOCUMENT_BODY_LIMIT));
      break;
  }

  return parts.filter((part) => part !== '').join('\n');
};

const toHit = (record: AnyRecord): SearchHit => ({
  id: record.id,
  type: record.type,
  title: recordTitle(record),
  path: record.path,
});

/**
 * In-memory FlexSearch over the record index, rebuilt when the index
 * generation changes and never persisted. Falls back to a substring scan if
 * the engine is unavailable (docs/10).
 */
export const createSearchService = (index: RecordIndex): SearchService => {
  const engines = new Map<RecordType, FlexIndex>();
  const byType = new Map<RecordType, Map<string, AnyRecord>>();
  let builtGeneration = -1;

  const build = (): void => {
    engines.clear();
    byType.clear();

    for (const type of TYPES) {
      const engine = new FlexSearchIndex({ tokenize: 'forward', resolution: 9, cache: 100 });
      const records = new Map<string, AnyRecord>();
      for (const entry of index.list(type)) {
        engine.add(entry.record.id, searchableText(entry.record));
        records.set(entry.record.id, entry.record);
      }
      engines.set(type, engine);
      byType.set(type, records);
    }

    builtGeneration = index.generation;
  };

  const fallback = (needle: string, type: RecordType | undefined, limit: number): SearchHit[] => {
    const hits: SearchHit[] = [];
    const lower = needle.toLowerCase();
    const types = type === undefined ? TYPES : [type];

    for (const candidate of types) {
      for (const entry of index.list(candidate)) {
        if (searchableText(entry.record).toLowerCase().includes(lower)) {
          hits.push(toHit(entry.record));
          if (hits.length >= limit) return hits;
        }
      }
    }
    return hits;
  };

  return {
    search(query, options = {}) {
      const needle = query.trim();
      if (needle === '') return [];

      const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
      const types = options.type === undefined ? TYPES : [options.type];

      try {
        if (builtGeneration !== index.generation) build();
      } catch {
        return fallback(needle, options.type, limit);
      }

      const hits: SearchHit[] = [];
      for (const type of types) {
        const engine = engines.get(type);
        const records = byType.get(type);
        if (engine === undefined || records === undefined) continue;

        let ids: readonly (string | number)[];
        try {
          ids = engine.search(needle, { limit });
        } catch {
          return fallback(needle, options.type, limit);
        }

        for (const id of ids) {
          const record = records.get(String(id));
          if (record !== undefined) hits.push(toHit(record));
          if (hits.length >= limit) return hits;
        }
      }

      return hits.length > 0 ? hits : fallback(needle, options.type, limit);
    },
  };
};
