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
import type {
  ApiRecord,
  ApiRecordOf,
  GitInitReport,
  GitRecoveryAction,
  GitRecoveryReport,
  GitRemoteReport,
  GitStatus,
  GitStep,
  GitSyncReport,
} from './api.js';
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
  readonly git: GitStatus | null;
  readonly gitSteps: readonly GitStep[];
  readonly refreshGit: (force?: boolean) => Promise<void>;
  readonly syncNow: () => Promise<GitSyncReport>;
  readonly initGit: () => Promise<GitInitReport>;
  readonly recoverGit: (action: GitRecoveryAction) => Promise<GitRecoveryReport>;
  readonly setGitRemote: (url: string, push: boolean) => Promise<GitRemoteReport>;
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
  const [git, setGit] = useState<GitStatus | null>(null);
  const [gitSteps, setGitSteps] = useState<readonly GitStep[]>([]);
  const generationRef = useRef(0);
  const hadSocketError = useRef(false);
  const gitRefreshTimer = useRef<number | null>(null);

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

  const applyGitStatus = useCallback((next: GitStatus) => {
    setGit((current) =>
      current !== null && JSON.stringify(current) === JSON.stringify(next) ? current : next,
    );
  }, []);

  const refreshGit = useCallback(
    async (force = false) => {
      try {
        const response = await api.git.status(force);
        applyGitStatus(response.status);
      } catch {
        // The status badge is best-effort; a failed poll must not break the UI.
      }
    },
    [applyGitStatus],
  );

  /** External edits do not touch the git service; re-read status shortly after. */
  const scheduleGitRefresh = useCallback(() => {
    if (gitRefreshTimer.current !== null) return;
    gitRefreshTimer.current = window.setTimeout(() => {
      gitRefreshTimer.current = null;
      void refreshGit();
    }, 1000);
  }, [refreshGit]);

  const syncNow = useCallback(async (): Promise<GitSyncReport> => {
    setGitSteps([]);
    const report = await api.git.sync();
    applyGitStatus(report.status);
    setGitSteps(report.steps);
    return report;
  }, [applyGitStatus]);

  const initGit = useCallback(async (): Promise<GitInitReport> => {
    const report = await api.git.init();
    applyGitStatus(report.status);
    return report;
  }, [applyGitStatus]);

  const recoverGit = useCallback(
    async (action: GitRecoveryAction): Promise<GitRecoveryReport> => {
      const report = await api.git.recover(action);
      applyGitStatus(report.status);
      return report;
    },
    [applyGitStatus],
  );

  const setGitRemote = useCallback(
    async (url: string, push: boolean): Promise<GitRemoteReport> => {
      const report = await api.git.setRemote(url, push);
      applyGitStatus(report.status);
      return report;
    },
    [applyGitStatus],
  );

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
      if (parsed.record !== undefined) {
        upsert(parsed.record);
        scheduleGitRefresh();
      }
    };

    const onDelete = (event: MessageEvent<string>): void => {
      const parsed = JSON.parse(event.data) as { generation?: number; id?: string };
      if (parsed.generation !== undefined && parsed.generation < generationRef.current) return;
      if (parsed.id !== undefined) {
        remove(parsed.id);
        scheduleGitRefresh();
      }
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

    const onGitChanged = (event: MessageEvent<string>): void => {
      const parsed = JSON.parse(event.data) as { status?: GitStatus };
      if (parsed.status !== undefined) applyGitStatus(parsed.status);
    };

    const onGitStep = (event: MessageEvent<string>): void => {
      const step = JSON.parse(event.data) as GitStep;
      setGitSteps((current) => [...current.slice(-19), step]);
    };

    source.addEventListener('snapshot', onSnapshot as EventListener);
    source.addEventListener('record.upsert', onUpsert as EventListener);
    source.addEventListener('record.delete', onDelete as EventListener);
    source.addEventListener('issues.changed', onIssues as EventListener);
    source.addEventListener('config.changed', onConfig as EventListener);
    source.addEventListener('git.changed', onGitChanged as EventListener);
    source.addEventListener('git.step', onGitStep as EventListener);

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
  }, [applyGitStatus, refresh, upsert, remove, scheduleGitRefresh]);

  useEffect(() => {
    const tick = (): void => {
      if (document.visibilityState === 'visible') void refreshGit();
    };
    tick();

    const interval = window.setInterval(tick, 15_000);
    const onFocus = (): void => {
      void refreshGit();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
      if (gitRefreshTimer.current !== null) {
        window.clearTimeout(gitRefreshTimer.current);
        gitRefreshTimer.current = null;
      }
    };
  }, [refreshGit]);

  const gitGuard = git !== null && (git.dirty || git.unpushed) && git.syncState !== 'running';

  useEffect(() => {
    if (!gitGuard) return;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [gitGuard]);

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
      git,
      gitSteps,
      refreshGit,
      syncNow,
      initGit,
      recoverGit,
      setGitRemote,
    }),
    [
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
      git,
      gitSteps,
      refreshGit,
      syncNow,
      initGit,
      recoverGit,
      setGitRemote,
    ],
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
