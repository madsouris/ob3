import type { IndexedRecord, RecordIndex } from '../index/indexer.js';
import type { AnyRecord } from '../model/schemas.js';
import { CONTACT_STATUSES, PROJECT_STATUSES } from '../model/schemas.js';
import type { TaskStatus } from '../model/task-status.js';
import { ApiError } from '../server/errors.js';
import { createRecord } from '../server/services/records.js';
import type { ApiRecord, RecordServiceContext } from '../server/services/records.js';
import { CsvError, parseCsv } from './csv.js';
import { IMPORT_DEFINITIONS, MAX_IMPORT_ROWS, type ImportType } from './definitions.js';

const TASK_COLUMNS = ['todo', 'doing', 'done'] as const;

/** A whole-file problem: the route turns it into a 422 with the message. */
export class ImportError extends Error {
  override name = 'ImportError';
}

export interface ImportRowError {
  readonly line: number;
  readonly message: string;
}

export interface ImportResult {
  /** Data rows read, including the ones that failed. */
  readonly rows: number;
  readonly records: readonly ApiRecord[];
  readonly failed: readonly ImportRowError[];
}

export interface ImportRequest {
  readonly context: RecordServiceContext;
  readonly type: ImportType;
  readonly csv: string;
}

type Reader = (header: string) => string;
/** `null` marks a key shared by more than one record. */
type Lookup = ReadonlyMap<string, string | null>;

const normalizeHeader = (header: string): string =>
  header
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const messageOf = (error: unknown): string => {
  if (error instanceof CsvError || error instanceof ImportError) return error.message;
  if (error instanceof ApiError) {
    const details = error.details as
      { issues?: readonly { path?: string; message?: string }[] } | undefined;
    const issues = details?.issues;
    if (Array.isArray(issues) && issues.length > 0) {
      return issues
        .map((issue) => `${issue.path ?? ''}: ${issue.message ?? ''}`.replace(/^: /, ''))
        .join('; ');
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
};

const buildLookup = (
  entries: readonly IndexedRecord[],
  keysOf: (record: AnyRecord) => readonly string[],
): Lookup => {
  const lookup = new Map<string, string | null>();
  for (const entry of entries) {
    for (const raw of keysOf(entry.record)) {
      const key = raw.trim().toLowerCase();
      if (key === '') continue;
      const existing = lookup.get(key);
      if (existing === undefined) lookup.set(key, entry.record.id);
      else if (existing !== entry.record.id) lookup.set(key, null);
    }
  }
  return lookup;
};

const findId = (lookup: Lookup, value: string, kind: string): string => {
  const key = value.trim().toLowerCase();
  const id = lookup.get(key);
  if (id === undefined) throw new ImportError(`Unknown ${kind} "${value}"`);
  if (id === null)
    throw new ImportError(`Ambiguous ${kind} "${value}" — more than one record matches`);
  return id;
};

const requireValue = (read: Reader, header: string): string => {
  const value = read(header);
  if (value === '') throw new ImportError(`${header} is required`);
  return value;
};

const contactFields = (read: Reader): Record<string, unknown> => {
  const fields: Record<string, unknown> = { first_name: requireValue(read, 'first_name') };
  for (const key of [
    'last_name',
    'email',
    'company',
    'job_role',
    'phone_number',
    'website',
    'primary_link',
  ]) {
    const value = read(key);
    if (value !== '') fields[key] = value;
  }

  const status = read('status');
  if (status !== '') {
    if (!(CONTACT_STATUSES as readonly string[]).includes(status)) {
      throw new ImportError(`status must be one of ${CONTACT_STATUSES.join(', ')}`);
    }
    fields['status'] = status;
  }

  return fields;
};

const projectFields = (read: Reader, contacts: Lookup): Record<string, unknown> => {
  const fields: Record<string, unknown> = { project_name: requireValue(read, 'project_name') };

  const client = read('client');
  if (client !== '') fields['client_id'] = findId(contacts, client, 'contact');

  const status = read('status');
  if (status !== '') {
    if (!(PROJECT_STATUSES as readonly string[]).includes(status)) {
      throw new ImportError(`status must be one of ${PROJECT_STATUSES.join(', ')}`);
    }
    fields['status'] = status;
  }

  return fields;
};

const taskPlan = (
  read: Reader,
  projects: Lookup,
): { fields: Record<string, unknown>; column: TaskStatus } => {
  const fields: Record<string, unknown> = { title: requireValue(read, 'title') };

  const project = read('project');
  if (project !== '') fields['project_id'] = findId(projects, project, 'project');

  const dueDate = read('due_date');
  if (dueDate !== '') {
    // `new Date` rolls 2026-02-30 over to March, so compare the round-trip.
    const parsed = new Date(`${dueDate}T00:00:00Z`);
    const isReal = !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dueDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !isReal) {
      throw new ImportError('due_date must be YYYY-MM-DD');
    }
    fields['due_date'] = `${dueDate}T00:00:00Z`;
  }

  const raw = read('column').toLowerCase();
  const column = raw === '' ? 'todo' : raw;
  if (!(TASK_COLUMNS as readonly string[]).includes(column)) {
    throw new ImportError(`column must be one of ${TASK_COLUMNS.join(', ')}`);
  }

  return { fields, column: column as TaskStatus };
};

/**
 * Creates one record per valid row through the normal create path, so ids,
 * defaults, filenames, indexing and commit-on-save all behave exactly like a
 * form save. An invalid row writes nothing and reports its line (docs/14).
 */
export const importCsv = async (request: ImportRequest): Promise<ImportResult> => {
  const definition = IMPORT_DEFINITIONS[request.type];
  const rows = parseCsv(request.csv);
  const header = rows[0];
  if (header === undefined) throw new ImportError('The file is empty');

  const positions = new Map<string, number>();
  header.cells.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    if (key !== '' && !positions.has(key)) positions.set(key, index);
  });

  const missing = definition.columns.filter(
    (column) => column.required === true && !positions.has(column.header),
  );
  if (missing.length > 0) {
    throw new ImportError(
      `Missing required column${missing.length === 1 ? '' : 's'}: ${missing
        .map((column) => column.header)
        .join(', ')}`,
    );
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new ImportError(
      `Import is limited to ${MAX_IMPORT_ROWS} rows per file (found ${dataRows.length})`,
    );
  }

  const index: RecordIndex = request.context.index;
  const contacts = buildLookup(index.list('contact'), (record) =>
    record.type === 'contact' ? [record.email, `${record.first_name} ${record.last_name}`] : [],
  );
  const projects = buildLookup(index.list('project'), (record) =>
    record.type === 'project' ? [record.project_name] : [],
  );

  const records: ApiRecord[] = [];
  const failed: ImportRowError[] = [];

  for (const row of dataRows) {
    const read: Reader = (column) => {
      const at = positions.get(column);
      return at === undefined ? '' : (row.cells[at] ?? '').trim();
    };

    try {
      const body = read('notes');
      const plan =
        request.type === 'contact'
          ? { fields: contactFields(read), column: undefined }
          : request.type === 'project'
            ? { fields: projectFields(read, contacts), column: undefined }
            : taskPlan(read, projects);

      records.push(
        await createRecord(request.context, request.type, {
          fields: plan.fields,
          ...(body === '' ? {} : { body }),
          ...(plan.column === undefined ? {} : { column: plan.column }),
        }),
      );
    } catch (error) {
      failed.push({ line: row.line, message: messageOf(error) });
    }
  }

  return { rows: dataRows.length, records, failed };
};
