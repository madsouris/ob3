import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { createIssue, type Issue } from '../model/issue.js';
import { parseFrontmatter } from '../model/frontmatter.js';
import type { AnyRecord, RecordType } from '../model/schemas.js';
import { projectRecord } from '../model/schemas.js';
import { isOrphanTaskPath, taskStatusFromPath, type TaskStatus } from '../model/task-status.js';
import { MANAGED_ROOTS, PathEscapeError, normalizeRelativePath, resolveRecordPath } from '../io/path-safety.js';
import { readRecordFile, type ReadFailureCode } from '../io/reader.js';
import { consumeSelfWrite } from '../io/self-writes.js';
import type { WatchBatch } from '../io/watcher.js';

export interface IndexedRecord {
  readonly record: AnyRecord;
  readonly hash: string;
  readonly mtimeMs: number;
  readonly size: number;
  /** True when the record was indexed with fallbacks because a field was invalid. */
  readonly degraded: boolean;
}

export interface IndexSnapshot {
  readonly generation: number;
  readonly records: readonly IndexedRecord[];
  readonly issues: readonly Issue[];
}

export interface ApplySummary {
  readonly generation: number;
  readonly upserted: readonly string[];
  readonly deleted: readonly string[];
  readonly ignored: boolean;
}

export interface ApplyOptions {
  /**
   * Programmatic writes already know what changed; they must not be dropped by
   * self-write suppression. The pending marker stays so the watcher echo is
   * still ignored.
   */
  readonly skipSelfWriteCheck?: boolean;
}

export interface IndexOptions {
  readonly root: string;
  /** Delays between parse retries; `[]` disables retrying (tests). */
  readonly retryDelaysMs?: readonly number[];
}

const TYPE_BY_ROOT: Readonly<Record<string, RecordType>> = {
  contacts: 'contact',
  projects: 'project',
  tasks: 'task',
  estimates: 'estimate',
  invoices: 'invoice',
  documents: 'document',
};

type ChangeOutcome = 'indexed' | 'rejected' | 'failed' | 'missing' | 'ignored';

type ParseOutcome =
  | { readonly kind: 'self-write' }
  | {
      readonly kind: 'failure';
      readonly code: ReadFailureCode | 'parse-error';
      readonly detail?: string;
    }
  | {
      readonly kind: 'parsed';
      readonly frontmatter: Readonly<Record<string, unknown>>;
      readonly body: string;
      readonly hash: string;
      readonly mtimeMs: number;
      readonly size: number;
    };

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Canonical-wins ordering for duplicate ids: shortest path, then lexicographic. */
const isPreferredPath = (candidate: string, current: string): boolean =>
  candidate.length === current.length ? candidate < current : candidate.length < current.length;

const compareTasks = (left: AnyRecord, right: AnyRecord): number => {
  if (left.type !== 'task' || right.type !== 'task') return 0;
  if (left.order !== right.order) return left.order - right.order;
  if (left.created_at !== right.created_at) return left.created_at < right.created_at ? -1 : 1;
  return left.id === right.id ? 0 : left.id < right.id ? -1 : 1;
};

const REF_TYPES: Readonly<Record<string, RecordType>> = {
  client_id: 'contact',
  project_id: 'project',
  estimate_id: 'estimate',
  converted_invoice_id: 'invoice',
};

const RECORD_REFS: Readonly<Record<RecordType, readonly string[]>> = {
  contact: [],
  project: ['client_id'],
  task: ['project_id'],
  estimate: ['client_id', 'project_id', 'terms_document', 'converted_invoice_id'],
  invoice: ['client_id', 'project_id', 'estimate_id', 'terms_document'],
  document: ['client_id'],
};

/**
 * In-memory projection of the workspace. Never persisted; a full scan rebuilds
 * it from files (ADR-05). Mutations are idempotent and never write to disk.
 */
export class RecordIndex {
  readonly root: string;
  private readonly retryDelaysMs: readonly number[];
  private readonly byId = new Map<string, IndexedRecord>();
  private readonly pathToId = new Map<string, string>();
  private readonly issuesByKey = new Map<string, Issue>();
  private currentGeneration = 0;

  constructor(options: IndexOptions) {
    this.root = options.root;
    this.retryDelaysMs = options.retryDelaysMs ?? [250, 250];
  }

  get generation(): number {
    return this.currentGeneration;
  }

  list(type?: RecordType): readonly IndexedRecord[] {
    const entries = [...this.byId.values()];
    return type === undefined ? entries : entries.filter((entry) => entry.record.type === type);
  }

  getById(id: string): IndexedRecord | null {
    return this.byId.get(id) ?? null;
  }

  getByPath(relativePath: string): IndexedRecord | null {
    const id = this.pathToId.get(relativePath);
    return id === undefined ? null : (this.byId.get(id) ?? null);
  }

  /** Boards only contain tasks that live inside a column folder. */
  boardTasks(status: TaskStatus): readonly IndexedRecord[] {
    return this.list('task')
      .filter((entry) => entry.record.type === 'task' && entry.record.status === status)
      .sort((left, right) => compareTasks(left.record, right.record));
  }

  issues(): readonly Issue[] {
    return [...this.issuesByKey.values()];
  }

  snapshot(): IndexSnapshot {
    return {
      generation: this.currentGeneration,
      records: this.list(),
      issues: this.issues(),
    };
  }

  async fullScan(): Promise<ApplySummary> {
    this.byId.clear();
    this.pathToId.clear();
    this.issuesByKey.clear();

    const paths: string[] = [];
    for (const root of MANAGED_ROOTS) {
      paths.push(...(await this.collectMarkdown(root)));
    }

    const upserted: string[] = [];
    for (const path of paths.sort()) {
      if ((await this.change(path)) === 'indexed') upserted.push(path);
    }

    this.recomputeDerivedIssues();
    this.currentGeneration += 1;

    return { generation: this.currentGeneration, upserted, deleted: [], ignored: false };
  }

  async applyChange(relativePath: string, options: ApplyOptions = {}): Promise<ApplySummary> {
    const path = this.safePath(relativePath);
    if (path === null) return this.summary([], [], true);

    const outcome = await this.change(path, options);
    if (outcome === 'ignored') return this.summary([], [], true);

    this.recomputeDerivedIssues();
    this.currentGeneration += 1;

    return this.summary(
      outcome === 'indexed' ? [path] : [],
      outcome === 'missing' ? [path] : [],
      false,
    );
  }

  async applyDelete(relativePath: string): Promise<ApplySummary> {
    const path = this.safePath(relativePath);
    if (path === null) return this.summary([], [], true);

    await this.deletePath(path);
    this.recomputeDerivedIssues();
    this.currentGeneration += 1;
    return this.summary([], [path], false);
  }

  async applyBatch(batch: WatchBatch, options: ApplyOptions = {}): Promise<ApplySummary> {
    const upserted: string[] = [];
    const deleted: string[] = [];

    for (const path of batch.deletes) {
      const safe = this.safePath(path);
      if (safe === null) continue;
      await this.deletePath(safe);
      deleted.push(safe);
    }

    for (const path of batch.upserts) {
      const safe = this.safePath(path);
      if (safe === null) continue;
      const outcome = await this.change(safe, options);
      if (outcome === 'indexed') upserted.push(safe);
      if (outcome === 'missing') deleted.push(safe);
    }

    if (upserted.length === 0 && deleted.length === 0) return this.summary([], [], true);

    this.recomputeDerivedIssues();
    this.currentGeneration += 1;
    return this.summary(upserted, deleted, false);
  }

  private summary(
    upserted: readonly string[],
    deleted: readonly string[],
    ignored: boolean,
  ): ApplySummary {
    return { generation: this.currentGeneration, upserted, deleted, ignored };
  }

  private safePath(relativePath: string): string | null {
    try {
      const normalized = normalizeRelativePath(relativePath);
      return normalized.endsWith('.md') ? normalized : null;
    } catch (error) {
      if (error instanceof PathEscapeError) return null;
      throw error;
    }
  }

  private async collectMarkdown(root: string): Promise<string[]> {
    const directory = join(this.root, root);
    let entries;
    try {
      entries = await readdir(directory, { recursive: true, withFileTypes: true });
    } catch {
      return [];
    }

    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.'))
      .map((entry) => relative(this.root, join(entry.parentPath, entry.name)).split(sep).join('/'));
  }

  private async change(relativePath: string, options: ApplyOptions = {}): Promise<ChangeOutcome> {
    let absolute: string;
    try {
      absolute = resolveRecordPath(this.root, relativePath);
    } catch {
      this.removeRecordForPath(relativePath);
      this.clearPathIssues(relativePath);
      this.addIssue(
        createIssue({
          code: 'parse-error',
          path: relativePath,
          message: 'Path is outside the managed directories',
        }),
      );
      return 'rejected';
    }

    const parsed = await this.readAndParse(relativePath, absolute, options.skipSelfWriteCheck === true);

    if (parsed.kind === 'self-write') return 'ignored';

    if (parsed.kind === 'failure') {
      this.removeRecordForPath(relativePath);
      this.clearPathIssues(relativePath);

      if (parsed.code === 'missing') return 'missing';

      this.addIssue(
        createIssue({
          code: parsed.code,
          path: relativePath,
          message:
            parsed.code === 'parse-error'
              ? 'Frontmatter could not be parsed'
              : parsed.code === 'too-large'
                ? 'File is too large to index'
                : 'File is not valid UTF-8 text',
          ...(parsed.detail === undefined ? {} : { detail: parsed.detail }),
        }),
      );
      return 'failed';
    }

    const type = TYPE_BY_ROOT[relativePath.split('/')[0] ?? ''];
    if (type === undefined) return 'rejected';

    const id = parsed.frontmatter['id'];
    this.clearPathIssues(relativePath);

    if (typeof id !== 'string' || id.trim() === '') {
      this.removeRecordForPath(relativePath);
      this.addIssue(
        createIssue({
          code: 'missing-id',
          path: relativePath,
          message: 'Record has no "id" in its frontmatter',
        }),
      );
      return 'rejected';
    }

    const replacedId = this.removeRecordForPath(relativePath);

    const taskStatus = type === 'task' ? taskStatusFromPath(relativePath) : null;
    const isOrphanTask = type === 'task' && (taskStatus === null || isOrphanTaskPath(relativePath));

    if (isOrphanTask) {
      this.addIssue(
        createIssue({
          code: 'orphan-task-path',
          path: relativePath,
          id,
          message: 'Task is outside tasks/todo, tasks/doing or tasks/done',
        }),
      );
    }

    const projection = projectRecord({
      type,
      id,
      path: relativePath,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      taskStatus,
    });

    if (projection.issues.length > 0) {
      this.addIssue(
        createIssue({
          code: 'schema-invalid',
          path: relativePath,
          id,
          message: projection.issues.map((issue) => issue.message).join('; '),
        }),
      );
    }

    if (/^<<<<<<< /m.test(parsed.body)) {
      this.addIssue(
        createIssue({
          code: 'conflict-marker',
          path: relativePath,
          id,
          message: 'File contains unresolved Git conflict markers',
        }),
      );
    }

    const indexed: IndexedRecord = {
      record: projection.record,
      hash: parsed.hash,
      mtimeMs: parsed.mtimeMs,
      size: parsed.size,
      degraded: projection.issues.length > 0,
    };

    if (replacedId !== null && replacedId !== id) {
      await this.promoteDuplicates(replacedId);
    }

    return this.insert(indexed) ? 'indexed' : 'rejected';
  }

  private insert(entry: IndexedRecord): boolean {
    const { id, path } = entry.record;
    const existing = this.byId.get(id);

    if (existing === undefined || existing.record.path === path) {
      this.byId.set(id, entry);
      this.pathToId.set(path, id);
      return true;
    }

    const keepNew = isPreferredPath(path, existing.record.path);
    const loser = keepNew ? existing.record.path : path;
    const winner = keepNew ? path : existing.record.path;

    this.addIssue(
      createIssue({
        code: 'duplicate-id',
        path: loser,
        id,
        message: `Another file already uses id ${id}`,
        detail: `Canonical file: ${winner}`,
      }),
    );

    if (!keepNew) return false;

    this.pathToId.delete(existing.record.path);
    this.byId.set(id, entry);
    this.pathToId.set(path, id);
    return true;
  }

  private async promoteDuplicates(id: string): Promise<void> {
    const candidates = [...this.issuesByKey.values()]
      .filter((issue) => issue.code === 'duplicate-id' && issue.id === id)
      .map((issue) => issue.path)
      .sort();

    for (const candidate of candidates) {
      if (this.byId.has(id)) return;
      await this.change(candidate);
    }
  }

  private async deletePath(relativePath: string): Promise<void> {
    const removedId = this.removeRecordForPath(relativePath);
    this.clearPathIssues(relativePath);
    if (removedId !== null) await this.promoteDuplicates(removedId);
  }

  private removeRecordForPath(relativePath: string): string | null {
    const id = this.pathToId.get(relativePath);
    if (id === undefined) return null;

    this.pathToId.delete(relativePath);
    const entry = this.byId.get(id);
    if (entry !== undefined && entry.record.path === relativePath) {
      this.byId.delete(id);
      return id;
    }
    return null;
  }

  private async readAndParse(
    relativePath: string,
    absolutePath: string,
    skipSelfWriteCheck: boolean,
  ): Promise<ParseOutcome> {
    const delays = [0, ...this.retryDelaysMs];
    let lastDetail: string | undefined;

    for (const [attempt, delay] of delays.entries()) {
      if (delay > 0) await sleep(delay);

      const read = await readRecordFile(absolutePath);
      if (!read.ok) {
        // A rename can briefly look like a delete; give the writer a moment.
        if (read.code === 'missing' && attempt < delays.length - 1) continue;
        return {
          kind: 'failure',
          code: read.code,
          ...(read.detail === undefined ? {} : { detail: read.detail }),
        };
      }

      if (!skipSelfWriteCheck && consumeSelfWrite(relativePath, read.value.hash)) {
        return { kind: 'self-write' };
      }

      try {
        const parsed = parseFrontmatter(read.value.text);
        return {
          kind: 'parsed',
          frontmatter: parsed.data,
          body: parsed.split.body,
          hash: read.value.hash,
          mtimeMs: read.value.mtimeMs,
          size: read.value.size,
        };
      } catch (error) {
        lastDetail = error instanceof Error ? error.message : String(error);
        if (attempt === delays.length - 1) {
          return { kind: 'failure', code: 'parse-error', detail: lastDetail };
        }
      }
    }

    return { kind: 'failure', code: 'parse-error', ...(lastDetail === undefined ? {} : { detail: lastDetail }) };
  }

  private clearPathIssues(relativePath: string): void {
    for (const [key, issue] of this.issuesByKey) {
      if (issue.path === relativePath) this.issuesByKey.delete(key);
    }
  }

  private addIssue(issue: Issue): void {
    this.issuesByKey.set(issue.key, issue);
  }

  private referenceExists(field: string, value: string): boolean {
    if (field === 'terms_document') {
      return this.list('document').some((entry) => entry.record.path === value);
    }
    const expectedType = REF_TYPES[field];
    if (expectedType === undefined) return true;
    const target = this.byId.get(value);
    return target !== undefined && target.record.type === expectedType;
  }

  private recomputeDerivedIssues(): void {
    for (const [key, issue] of this.issuesByKey) {
      if (issue.code === 'dangling-ref' || issue.code === 'duplicate-number') {
        this.issuesByKey.delete(key);
      }
    }

    for (const entry of this.byId.values()) {
      const record = entry.record;
      const missing: string[] = [];

      for (const field of RECORD_REFS[record.type]) {
        const value = (record as unknown as Record<string, unknown>)[field];
        if (typeof value !== 'string' || value === '') continue;
        if (!this.referenceExists(field, value)) missing.push(`${field}=${value}`);
      }

      if (missing.length > 0) {
        this.addIssue(
          createIssue({
            code: 'dangling-ref',
            path: record.path,
            id: record.id,
            message: `Missing reference: ${missing.join(', ')}`,
          }),
        );
      }
    }

    this.reportDuplicateNumbers('invoice');
    this.reportDuplicateNumbers('estimate');
  }

  private reportDuplicateNumbers(type: 'invoice' | 'estimate'): void {
    const groups = new Map<string, string[]>();

    for (const entry of this.list(type)) {
      const record = entry.record;
      const number =
        record.type === 'invoice'
          ? record.invoice_number
          : record.type === 'estimate'
            ? record.estimate_number
            : '';
      if (number === '') continue;
      groups.set(number, [...(groups.get(number) ?? []), record.path]);
    }

    for (const [number, paths] of groups) {
      if (paths.length < 2) continue;
      const sorted = [...paths].sort();
      for (const path of sorted.slice(1)) {
        this.addIssue(
          createIssue({
            code: 'duplicate-number',
            path,
            message: `${type === 'invoice' ? 'Invoice' : 'Estimate'} number ${number} is used by ${sorted.length} files`,
          }),
        );
      }
    }
  }
}
