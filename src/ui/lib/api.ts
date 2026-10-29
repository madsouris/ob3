import type { Issue } from '../../model/issue.js';
import type { AnyRecord, RecordType } from '../../model/schemas.js';
import type { SystemStats } from '../../server/routes/system.js';
import type { ObConfig } from '../../workspace/config.js';

export type { RecordType, SystemStats };

export type ApiRecord = AnyRecord & { readonly degraded: boolean };
export type ApiRecordOf<T extends RecordType> = Extract<AnyRecord, { type: T }> & {
  readonly degraded: boolean;
};

export interface RecordListResponse {
  readonly records: ApiRecord[];
  readonly generation: number;
}

export interface RecordResponse {
  readonly record: ApiRecord;
  readonly hash: string;
  readonly generation: number;
}

export interface IssuePreview {
  readonly path: string;
  readonly raw: string | null;
  readonly frontmatter: Readonly<Record<string, unknown>> | null;
  readonly body: string | null;
  readonly reason?: string;
}

export interface HealthResponse {
  readonly ok: boolean;
  readonly version: string;
  readonly workspace: string;
  readonly records: number;
  readonly generation: number;
  readonly uptimeSeconds: number;
}

export interface SearchHit {
  readonly id: string;
  readonly type: RecordType;
  readonly title: string;
  readonly path: string;
}

export interface SearchResponse {
  readonly query: string;
  readonly hits: readonly SearchHit[];
  readonly generation: number;
}

export interface ImportRowError {
  readonly line: number;
  readonly message: string;
}

export interface ImportReport {
  readonly type: string;
  /** Data rows read, including the ones that failed. */
  readonly rows: number;
  readonly created: number;
  readonly failed: readonly ImportRowError[];
  readonly generation: number;
}

export type GitSyncState = 'idle' | 'running' | 'error';

export interface GitErrorInfo {
  readonly code: string;
  readonly message: string;
  readonly output?: string;
}

export interface GitStatus {
  readonly initialized: boolean;
  readonly repoOutsideWorkspace: boolean;
  readonly branch: string;
  readonly detached: boolean;
  readonly dirty: boolean;
  readonly changedFiles: number;
  readonly ahead: number;
  readonly behind: number;
  readonly unpushed: boolean;
  readonly hasUpstream: boolean;
  readonly remote: string;
  readonly lastCommit: string;
  readonly conflict: boolean;
  readonly conflictPaths: readonly string[];
  readonly syncState: GitSyncState;
  readonly error: GitErrorInfo | null;
}

export interface GitStep {
  readonly name: 'add' | 'commit' | 'pull' | 'push';
  readonly ok: boolean;
  readonly skipped?: boolean;
  readonly output: string;
}

export interface GitSyncReport {
  readonly ok: boolean;
  readonly steps: readonly GitStep[];
  readonly status: GitStatus;
  readonly error: GitErrorInfo | null;
}

export interface GitInitReport {
  readonly ok: boolean;
  readonly initialized: boolean;
  readonly warning: string | null;
  readonly status: GitStatus;
  readonly error: GitErrorInfo | null;
}

export type GitRecoveryAction = 'abort-sync' | 'set-upstream';

export interface GitRecoveryReport {
  readonly ok: boolean;
  readonly action: GitRecoveryAction;
  readonly output: string;
  readonly status: GitStatus;
  readonly error: GitErrorInfo | null;
}

export interface GitRemoteReport {
  readonly ok: boolean;
  readonly status: GitStatus;
  readonly error: GitErrorInfo | null;
}

export class ApiRequestError extends Error {
  override name = 'ApiRequestError';

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const TOKEN =
  document.querySelector<HTMLMetaElement>('meta[name="ob-token"]')?.content ?? '';

const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const headers: Record<string, string> = { 'x-ob-token': TOKEN };
  if (body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!response.ok) return throwApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

const requestBlob = async <T>(
  method: string,
  path: string,
  body: Blob,
  contentType: string,
): Promise<T> => {
  const response = await fetch(path, {
    method,
    headers: { 'x-ob-token': TOKEN, 'content-type': contentType },
    body,
  });

  if (!response.ok) return throwApiError(response);
  return (await response.json()) as T;
};

const throwApiError = async (response: Response): Promise<never> => {
  let code = 'internal';
  let message = response.statusText;
  let details: unknown;
  try {
    const payload = (await response.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    code = payload.error?.code ?? code;
    message = payload.error?.message ?? message;
    details = payload.error?.details;
  } catch {
    // Non-JSON error body (proxy, crash): keep the status text.
  }
  throw new ApiRequestError(response.status, code, message, details);
};

export const api = {
  health: (): Promise<HealthResponse> => request('GET', '/api/health'),

  system: (): Promise<{ system: SystemStats }> => request('GET', '/api/system'),

  list: (plural: string, query?: string): Promise<RecordListResponse> =>
    request('GET', `/api/${plural}${query === undefined || query === '' ? '' : `?${query}`}`),

  get: (plural: string, id: string): Promise<RecordResponse> =>
    request('GET', `/api/${plural}/${encodeURIComponent(id)}`),

  create: (plural: string, payload: Record<string, unknown>): Promise<RecordResponse> =>
    request('POST', `/api/${plural}`, payload),

  update: (
    plural: string,
    id: string,
    payload: Record<string, unknown>,
  ): Promise<RecordResponse> =>
    request('PATCH', `/api/${plural}/${encodeURIComponent(id)}`, payload),

  remove: (plural: string, id: string, baseHash?: string): Promise<void> =>
    request(
      'DELETE',
      `/api/${plural}/${encodeURIComponent(id)}${
        baseHash === undefined ? '' : `?baseHash=${encodeURIComponent(baseHash)}`
      }`,
    ),

  moveTask: (
    id: string,
    payload: { to: 'todo' | 'doing' | 'done'; beforeId?: string; afterId?: string },
  ): Promise<RecordResponse> =>
    request('POST', `/api/tasks/${encodeURIComponent(id)}/move`, payload),

  duplicate: (plural: string, id: string): Promise<RecordResponse> =>
    request('POST', `/api/${plural}/${encodeURIComponent(id)}/duplicate`),

  search: (query: string, options: { type?: string; limit?: number } = {}): Promise<SearchResponse> => {
    const params = new URLSearchParams({ q: query });
    if (options.type !== undefined) params.set('type', options.type);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    return request('GET', `/api/search?${params.toString()}`);
  },

  invoiceFromEstimate: (estimateId: string): Promise<RecordResponse> =>
    request('POST', `/api/invoices/from-estimate/${encodeURIComponent(estimateId)}`),

  git: {
    status: (force = false): Promise<{ status: GitStatus }> =>
      request('GET', `/api/git/status${force ? '?force=1' : ''}`),
    init: (): Promise<GitInitReport> => request('POST', '/api/git/init'),
    sync: (): Promise<GitSyncReport> => request('POST', '/api/git/sync'),
    recover: (action: GitRecoveryAction): Promise<GitRecoveryReport> =>
      request('POST', '/api/git/recover', { action }),
    setRemote: (url: string, push: boolean): Promise<GitRemoteReport> =>
      request('POST', '/api/git/remote', { url, push }),
  },

  config: {
    get: (): Promise<{ config: ObConfig }> => request('GET', '/api/config'),
    patch: (patch: Record<string, unknown>): Promise<{ config: ObConfig }> =>
      request('PATCH', '/api/config', patch),
    uploadLogo: (blob: Blob): Promise<{ config: ObConfig }> =>
      requestBlob('POST', '/api/config/logo', blob, 'image/png'),
    removeLogo: (): Promise<{ config: ObConfig }> => request('DELETE', '/api/config/logo'),
  },

  import: {
    skeletonUrl: (type: string): string => `/api/import/skeleton?type=${encodeURIComponent(type)}`,
    run: (type: string, csv: string): Promise<ImportReport> =>
      request('POST', '/api/import', { type, csv }),
  },

  issues: (): Promise<{ issues: Issue[]; generation: number }> =>
    request('GET', '/api/issues'),

  previewIssue: (key: string): Promise<IssuePreview> =>
    request('GET', `/api/issues/${encodeURIComponent(key)}/preview`),

  resolveIssue: (
    key: string,
    payload: { action: 'assign-id' | 'adopt-path' | 'ignore'; to?: 'todo' | 'doing' | 'done' },
  ): Promise<{ action: string; id?: string; path?: string; generation: number }> =>
    request('POST', `/api/issues/${encodeURIComponent(key)}/resolve`, payload),
};

export const PLURAL: Readonly<Record<RecordType, string>> = {
  contact: 'contacts',
  project: 'projects',
  task: 'tasks',
  estimate: 'estimates',
  invoice: 'invoices',
  document: 'documents',
};

/**
 * The server filters by URL, so a `/api/contacts` response only contains
 * contacts; this cast records that guarantee once for the whole client.
 */
export const listAs = async <K extends RecordType>(
  type: K,
): Promise<{ records: ApiRecordOf<K>[]; generation: number }> =>
  (await api.list(PLURAL[type])) as unknown as { records: ApiRecordOf<K>[]; generation: number };
