import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { Issue } from '../../model/issue.js';
import type { RecordType } from '../../model/schemas.js';
import type { ObConfig } from '../../workspace/config.js';
import type { ApiRecord, ApiRecordOf } from './api.js';
import { api, listAs } from './api.js';

export type RecordsByType = {
  readonly [K in RecordType]: readonly ApiRecordOf<K>[];
};

const EMPTY: RecordsByType = {
  contact: [],
  project: [],
  task: [],
  estimate: [],
  invoice: [],
  document: [],
};

interface WorkspaceValue {
  readonly records: RecordsByType;
  readonly issues: readonly Issue[];
  readonly config: ObConfig | null;
  readonly generation: number;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly upsert: (record: ApiRecord) => void;
  readonly remove: (id: string) => void;
  readonly setConfig: (config: ObConfig) => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

const byPath = (left: { readonly path: string }, right: { readonly path: string }): number =>
  left.path.localeCompare(right.path);

const mergeInto = <T extends { readonly id: string; readonly path: string }>(
  list: readonly T[],
  record: T,
): readonly T[] => [...list.filter((item) => item.id !== record.id), record].sort(byPath);

const withRecord = (records: RecordsByType, record: ApiRecord): RecordsByType => {
  switch (record.type) {
    case 'contact':
      return { ...records, contact: mergeInto(records.contact, record) };
    case 'project':
      return { ...records, project: mergeInto(records.project, record) };
    case 'task':
      return { ...records, task: mergeInto(records.task, record) };
    case 'estimate':
      return { ...records, estimate: mergeInto(records.estimate, record) };
    case 'invoice':
      return { ...records, invoice: mergeInto(records.invoice, record) };
    case 'document':
      return { ...records, document: mergeInto(records.document, record) };
  }
};

const withoutRecord = (records: RecordsByType, id: string): RecordsByType => ({
  contact: records.contact.filter((item) => item.id !== id),
  project: records.project.filter((item) => item.id !== id),
  task: records.task.filter((item) => item.id !== id),
  estimate: records.estimate.filter((item) => item.id !== id),
  invoice: records.invoice.filter((item) => item.id !== id),
  document: records.document.filter((item) => item.id !== id),
});

export const WorkspaceProvider = ({ children }: { readonly children: ReactNode }) => {
  const [records, setRecords] = useState<RecordsByType>(EMPTY);
  const [issues, setIssues] = useState<readonly Issue[]>([]);
  const [config, setConfigState] = useState<ObConfig | null>(null);
  const [generation, setGeneration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const hadSocketError = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [configResponse, issuesResponse, contact, project, task, estimate, invoice, document] =
        await Promise.all([
          api.config.get(),
          api.issues(),
          listAs('contact'),
          listAs('project'),
          listAs('task'),
          listAs('estimate'),
          listAs('invoice'),
          listAs('document'),
        ]);

      const newest = Math.max(
        issuesResponse.generation,
        contact.generation,
        project.generation,
        task.generation,
        estimate.generation,
        invoice.generation,
        document.generation,
      );

      generationRef.current = Math.max(generationRef.current, newest);
      setRecords({
        contact: [...contact.records].sort(byPath),
        project: [...project.records].sort(byPath),
        task: [...task.records].sort(byPath),
        estimate: [...estimate.records].sort(byPath),
        invoice: [...invoice.records].sort(byPath),
        document: [...document.records].sort(byPath),
      });
      setIssues(issuesResponse.issues);
      setConfigState(configResponse.config);
      setGeneration(generationRef.current);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upsert = useCallback((record: ApiRecord) => {
    setRecords((current) => withRecord(current, record));
  }, []);

  const remove = useCallback((id: string) => {
    setRecords((current) => withoutRecord(current, id));
  }, []);

  const setConfig = useCallback((next: ObConfig) => {
    setConfigState(next);
  }, []);

  useEffect(() => {
    const source = new EventSource('/api/events');

    const accept = (data: unknown): number | null => {
      if (typeof data !== 'object' || data === null) return null;
      const value = (data as { generation?: unknown }).generation;
      if (typeof value !== 'number') return null;
      return value;
    };

    const onSnapshot = (event: MessageEvent<string>): void => {
      const parsed: unknown = JSON.parse(event.data);
      const next = accept(parsed);
      if (next !== null) {
        generationRef.current = Math.max(generationRef.current, next);
        setGeneration(generationRef.current);
      }
    };

    const onUpsert = (event: MessageEvent<string>): void => {
      const parsed = JSON.parse(event.data) as { generation?: number; record?: ApiRecord };
      if (parsed.generation !== undefined && parsed.generation < generationRef.current) return;
      if (parsed.record !== undefined) upsert(parsed.record);
    };

    const onDelete = (event: MessageEvent<string>): void => {
      const parsed = JSON.parse(event.data) as { generation?: number; id?: string };
      if (parsed.generation !== undefined && parsed.generation < generationRef.current) return;
      if (parsed.id !== undefined) remove(parsed.id);
    };

    const onIssues = (event: MessageEvent<string>): void => {
      const parsed = JSON.parse(event.data) as { generation?: number; issues?: Issue[] };
      if (parsed.generation !== undefined && parsed.generation < generationRef.current) return;
      if (parsed.issues !== undefined) setIssues(parsed.issues);
    };

    const onConfig = (event: MessageEvent<string>): void => {
      const parsed = JSON.parse(event.data) as { config?: ObConfig };
      if (parsed.config !== undefined) setConfigState(parsed.config);
    };

    source.addEventListener('snapshot', onSnapshot as EventListener);
    source.addEventListener('record.upsert', onUpsert as EventListener);
    source.addEventListener('record.delete', onDelete as EventListener);
    source.addEventListener('issues.changed', onIssues as EventListener);
    source.addEventListener('config.changed', onConfig as EventListener);

    source.onopen = () => {
      if (hadSocketError.current) {
        hadSocketError.current = false;
        void refresh();
      }
    };
    source.onerror = () => {
      hadSocketError.current = true;
    };

    return () => {
      source.close();
    };
  }, [refresh, upsert, remove]);

  const value = useMemo<WorkspaceValue>(
    () => ({
      records,
      issues,
      config,
      generation,
      loading,
      error,
      refresh,
      upsert,
      remove,
      setConfig,
    }),
    [records, issues, config, generation, loading, error, refresh, upsert, remove, setConfig],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = (): WorkspaceValue => {
  const value = useContext(WorkspaceContext);
  if (value === null) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
};

export const recordTitle = (record: ApiRecord): string => {
  switch (record.type) {
    case 'contact': {
      const full = `${record.first_name} ${record.last_name}`.trim();
      return full === '' ? record.id : full;
    }
    case 'project':
      return record.project_name === '' ? record.id : record.project_name;
    case 'task':
      return record.title === '' ? record.id : record.title;
    case 'estimate':
      return record.estimate_number === '' ? record.id : record.estimate_number;
    case 'invoice':
      return record.invoice_number === '' ? record.id : record.invoice_number;
    case 'document':
      return record.title === '' ? record.id : record.title;
  }
};
