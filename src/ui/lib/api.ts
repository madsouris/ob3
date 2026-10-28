import type { Issue } from '../../model/issue.js';
import type { AnyRecord, RecordType } from '../../model/schemas.js';
import type { ObConfig } from '../../workspace/config.js';

export type { RecordType };

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

  if (!response.ok) {
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
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

export const api = {
  health: (): Promise<HealthResponse> => request('GET', '/api/health'),

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

  invoiceFromEstimate: (estimateId: string): Promise<RecordResponse> =>
    request('POST', `/api/invoices/from-estimate/${encodeURIComponent(estimateId)}`),

  config: {
    get: (): Promise<{ config: ObConfig }> => request('GET', '/api/config'),
    patch: (patch: Record<string, unknown>): Promise<{ config: ObConfig }> =>
      request('PATCH', '/api/config', patch),
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
