import { createHash } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { basename } from 'node:path';
import { stringify } from 'yaml';
import { z } from 'zod';
import { resolveRecordPath } from '../../io/path-safety.js';
import { readRecordFile } from '../../io/reader.js';
import { rememberSelfWrite } from '../../io/self-writes.js';
import { writeFileAtomic } from '../../io/atomic.js';
import type { RecordIndex, IndexedRecord } from '../../index/indexer.js';
import { parseFrontmatter, replaceBody, updateFrontmatter } from '../../model/frontmatter.js';
import { createId, type RecordPrefix } from '../../model/ids.js';
import { lineTotalCents, sumLineTotals, taxCents } from '../../model/money.js';
import {
  RECORD_TYPES,
  writeSchemas,
  type AnyRecord,
  type LineItem,
  type RecordType,
} from '../../model/schemas.js';
import { recordFileName } from '../../model/slug.js';
import { taskStatusFromPath, type TaskStatus } from '../../model/task-status.js';
import { ApiError } from '../errors.js';
import type { ObConfig } from '../../workspace/config.js';

export const PLURAL_TO_TYPE: Readonly<Record<string, RecordType>> = {
  contacts: 'contact',
  projects: 'project',
  tasks: 'task',
  estimates: 'estimate',
  invoices: 'invoice',
  documents: 'document',
};

export const TYPE_TO_PLURAL: Readonly<Record<RecordType, string>> = {
  contact: 'contacts',
  project: 'projects',
  task: 'tasks',
  estimate: 'estimates',
  invoice: 'invoices',
  document: 'documents',
};

const PREFIX: Readonly<Record<RecordType, RecordPrefix>> = {
  contact: 'cnt',
  project: 'proj',
  task: 'tsk',
  estimate: 'est',
  invoice: 'inv',
  document: 'doc',
};

const FOLDER: Readonly<Record<RecordType, string>> = {
  contact: 'contacts',
  project: 'projects',
  task: 'tasks/todo',
  estimate: 'estimates',
  invoice: 'invoices',
  document: 'documents',
};

const MONEY_TYPES = new Set<RecordType>(['estimate', 'invoice']);
const ORDER_STEP = 1024;

export interface RecordServiceContext {
  readonly workspace: string;
  readonly index: RecordIndex;
  readonly config: () => Promise<ObConfig>;
  /** Commit-on-save hook; failures must never surface as a failed write. */
  readonly onWrote?: (target: { readonly path: string; readonly label: string }) => void;
}

export type ApiRecord = AnyRecord & { readonly degraded: boolean };

export interface CreateInput {
  readonly fields: unknown;
  readonly body?: string;
}

export interface UpdateInput extends CreateInput {
  readonly baseHash?: string;
}

export const toApiRecord = (entry: IndexedRecord): ApiRecord => ({
  ...entry.record,
  degraded: entry.degraded,
});

const hashText = (text: string): string => createHash('sha256').update(text).digest('hex');

const nowIso = (): string => new Date().toISOString();

const requireEntry = (
  context: RecordServiceContext,
  type: RecordType,
  id: string,
): IndexedRecord => {
  const entry = context.index.getById(id);
  if (entry === null || entry.record.type !== type) {
    throw new ApiError(404, 'unknown_id', `No ${type} with id ${id}`);
  }
  return entry;
};

const parseFields = (type: RecordType, raw: unknown, partial: boolean): Record<string, unknown> => {
  const schema = partial ? writeSchemas[type].partial() : writeSchemas[type];
  const result = schema.safeParse(raw ?? {});
  if (!result.success) {
    throw new ApiError(422, 'validation_failed', 'Invalid payload', {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data as Record<string, unknown>;
};

const normalizeLineItems = (value: unknown): LineItem[] => {
  if (!Array.isArray(value)) return [];
  const lines: LineItem[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const line = entry as Record<string, unknown>;
    const quantity = typeof line['quantity'] === 'number' ? line['quantity'] : 1;
    const unitPrice = typeof line['unit_price_cents'] === 'number' ? line['unit_price_cents'] : 0;
    lines.push({
      description: typeof line['description'] === 'string' ? line['description'] : '',
      quantity,
      unit_price_cents: unitPrice,
      total_cents: lineTotalCents(quantity, unitPrice),
    });
  }
  return lines;
};

const applyMoney = (
  type: RecordType,
  fields: Record<string, unknown>,
  config: ObConfig,
): Record<string, unknown> => {
  if (!MONEY_TYPES.has(type)) return fields;

  const currency =
    typeof fields['currency'] === 'string' && fields['currency'] !== ''
      ? (fields['currency'] as string)
      : config.business.currency;
  const rateBps =
    typeof fields['tax_rate_bps'] === 'number'
      ? (fields['tax_rate_bps'] as number)
      : config.business.tax_rate_bps;

  const lineItems = normalizeLineItems(fields['line_items']);
  const subtotal = sumLineTotals(lineItems);
  const tax = taxCents(subtotal, rateBps);

  return {
    ...fields,
    currency,
    tax_rate_bps: rateBps,
    line_items: lineItems,
    subtotal_cents: subtotal,
    tax_amount_cents: tax,
    total_cents: subtotal + tax,
  };
};

const fileNameBase = (type: RecordType, fields: Record<string, unknown>): string => {
  const text = (key: string): string =>
    typeof fields[key] === 'string' ? (fields[key] as string) : '';

  switch (type) {
    case 'contact':
      return `${text('first_name')} ${text('last_name')}`.trim();
    case 'project':
      return text('project_name');
    case 'task':
      return text('title');
    case 'estimate':
      return text('estimate_number');
    case 'invoice':
      return text('invoice_number');
    case 'document':
      return text('title');
  }
};

const nextOrder = (index: RecordIndex, status: TaskStatus): number => {
  const orders = index
    .boardTasks(status)
    .map((entry) => (entry.record.type === 'task' ? entry.record.order : 0));
  return orders.length === 0 ? ORDER_STEP : Math.max(...orders) + ORDER_STEP;
};

const serializeNew = (fields: Record<string, unknown>, body: string): string => {
  const block = stringify(fields, { lineWidth: 0, flowCollectionPadding: false });
  return body === '' ? `---\n${block}---\n` : `---\n${block}---\n\n${body}`;
};

const writeNewFile = async (
  context: RecordServiceContext,
  folder: string,
  fileName: string,
  text: string,
): Promise<string> => {
  const extensionIndex = fileName.lastIndexOf('.');
  const stem = extensionIndex === -1 ? fileName : fileName.slice(0, extensionIndex);
  const extension = extensionIndex === -1 ? '' : fileName.slice(extensionIndex);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? fileName : `${stem}-${attempt + 1}${extension}`;
    const relativePath = `${folder}/${candidate}`;
    const absolute = resolveRecordPath(context.workspace, relativePath);
    try {
      await writeFileAtomic(absolute, text, { exclusive: true });
      rememberSelfWrite(relativePath, hashText(text));
      return relativePath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }

  throw new ApiError(409, 'conflict', 'Could not find a free filename for the new record');
};

export const createRecord = async (
  context: RecordServiceContext,
  type: RecordType,
  input: CreateInput,
): Promise<ApiRecord> => {
  const config = await context.config();
  const fields = applyMoney(type, parseFields(type, input.fields, false), config);
  const now = nowIso();
  const id = createId(PREFIX[type]);

  const frontmatter: Record<string, unknown> = {
    ob_schema: 1,
    id,
    type,
    ...(type === 'contact' ? { status: 'lead' } : {}),
    ...(type === 'project' ? { status: 'active' } : {}),
    ...(type === 'estimate' ? { status: 'draft' } : {}),
    ...(type === 'invoice' ? { status: 'draft' } : {}),
    ...(type === 'estimate' || type === 'invoice' ? { document_ids: [] } : {}),
    ...(type === 'document' ? { kind: 'note', scope: 'global', client_id: '' } : {}),
    ...(type === 'task' ? { order: nextOrder(context.index, 'todo') } : {}),
    ...fields,
    created_at: now,
    updated_at: now,
  };

  const relativePath = await writeNewFile(
    context,
    FOLDER[type],
    recordFileName(PREFIX[type], fileNameBase(type, fields)),
    serializeNew(frontmatter, input.body ?? ''),
  );

  await context.index.applyChange(relativePath, { skipSelfWriteCheck: true });

  const entry = context.index.getByPath(relativePath);
  if (entry === null) {
    throw new ApiError(500, 'internal', 'Record was written but could not be indexed');
  }
  context.onWrote?.({ path: relativePath, label: `${type} ${id}` });
  return toApiRecord(entry);
};

export const updateRecord = async (
  context: RecordServiceContext,
  type: RecordType,
  id: string,
  input: UpdateInput,
): Promise<ApiRecord> => {
  const entry = requireEntry(context, type, id);
  const absolute = resolveRecordPath(context.workspace, entry.record.path);
  const file = await readRecordFile(absolute);
  if (!file.ok) {
    throw new ApiError(409, 'conflict', 'Record file could not be read', { reason: file.code });
  }

  if (input.baseHash !== undefined && input.baseHash !== file.value.hash) {
    throw new ApiError(409, 'file_changed_on_disk', 'Record changed on disk while editing', {
      currentHash: file.value.hash,
    });
  }

  let current: Readonly<Record<string, unknown>>;
  try {
    current = parseFrontmatter(file.value.text).data;
  } catch (error) {
    throw new ApiError(409, 'conflict', 'Record frontmatter is invalid; fix the file first', {
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const patch = parseFields(type, input.fields, true);
  const merged: Record<string, unknown> = { ...current, ...patch };

  if (MONEY_TYPES.has(type) && ('line_items' in patch || 'tax_rate_bps' in patch)) {
    const recomputed = applyMoney(type, merged, await context.config());
    patch['line_items'] = recomputed['line_items'];
    patch['subtotal_cents'] = recomputed['subtotal_cents'];
    patch['tax_rate_bps'] = recomputed['tax_rate_bps'];
    patch['tax_amount_cents'] = recomputed['tax_amount_cents'];
    patch['total_cents'] = recomputed['total_cents'];
  }

  patch['updated_at'] = nowIso();

  let updated = updateFrontmatter(file.value.text, patch);
  if (input.body !== undefined) updated = replaceBody(updated, input.body);

  await writeFileAtomic(absolute, updated);
  rememberSelfWrite(entry.record.path, hashText(updated));
  await context.index.applyChange(entry.record.path, { skipSelfWriteCheck: true });

  const fresh = context.index.getById(id);
  if (fresh === null) throw new ApiError(500, 'internal', 'Record could not be re-indexed');
  context.onWrote?.({ path: entry.record.path, label: `${type} ${id}` });
  return toApiRecord(fresh);
};

export const deleteRecord = async (
  context: RecordServiceContext,
  type: RecordType,
  id: string,
  baseHash?: string,
): Promise<{ id: string; path: string }> => {
  const entry = requireEntry(context, type, id);
  const absolute = resolveRecordPath(context.workspace, entry.record.path);

  if (baseHash !== undefined) {
    const file = await readRecordFile(absolute);
    if (file.ok && file.value.hash !== baseHash) {
      throw new ApiError(409, 'file_changed_on_disk', 'Record changed on disk while deleting', {
        currentHash: file.value.hash,
      });
    }
  }

  try {
    await unlink(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  await context.index.applyDelete(entry.record.path);
  context.onWrote?.({ path: entry.record.path, label: `${type} ${id}` });
  return { id, path: entry.record.path };
};

const moveSchema = z.object({
  to: z.enum(['todo', 'doing', 'done']),
  beforeId: z.string().optional(),
  afterId: z.string().optional(),
});

const computeOrder = (
  siblings: readonly number[],
  index: number,
): { order: number; needsRebalance: boolean } => {
  const previous = index === 0 ? 0 : (siblings[index - 1] ?? 0);
  const next = index >= siblings.length ? null : (siblings[index] ?? 0);

  if (next === null) return { order: previous + ORDER_STEP, needsRebalance: false };

  const midpoint = Math.floor((previous + next) / 2);
  if (midpoint <= previous) return { order: 0, needsRebalance: true };
  return { order: midpoint, needsRebalance: false };
};

export const moveTask = async (
  context: RecordServiceContext,
  id: string,
  input: unknown,
): Promise<ApiRecord> => {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(422, 'validation_failed', 'Invalid move payload', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const entry = requireEntry(context, 'task', id);
  if (entry.record.type !== 'task') throw new ApiError(404, 'not_a_task', 'Record is not a task');
  if (entry.record.status === null) {
    throw new ApiError(400, 'invalid_move', 'Task is outside a column; adopt its path first');
  }

  const { to, beforeId, afterId } = parsed.data;
  const sourcePath = entry.record.path;
  const fileName = basename(sourcePath);
  const targetPath = `tasks/${to}/${fileName}`;

  const column = context.index.boardTasks(to);
  const siblings = column
    .filter((item) => item.record.id !== id)
    .map((item) => (item.record.type === 'task' ? item.record.order : 0));

  let insertAt = siblings.length;
  if (afterId !== undefined) {
    const position = column.findIndex((item) => item.record.id === afterId);
    if (position !== -1) insertAt = position;
  } else if (beforeId !== undefined) {
    const position = column.findIndex((item) => item.record.id === beforeId);
    if (position !== -1) insertAt = position;
  }

  const computed = computeOrder(siblings, insertAt);

  if (computed.needsRebalance) {
    const ordered = column.filter((item) => item.record.id !== id);
    for (const [position, item] of ordered.entries()) {
      await patchFrontmatter(context, item.record.path, { order: (position + 1) * ORDER_STEP });
    }
  }

  const order = computed.needsRebalance
    ? insertAt * ORDER_STEP + ORDER_STEP / 2
    : computed.order;

  const absoluteSource = resolveRecordPath(context.workspace, sourcePath);
  const file = await readRecordFile(absoluteSource);
  if (!file.ok) throw new ApiError(409, 'conflict', 'Task file could not be read');

  const updated = updateFrontmatter(file.value.text, { order, updated_at: nowIso() });
  const absoluteTarget = resolveRecordPath(context.workspace, targetPath);
  await writeFileAtomic(absoluteTarget, updated);
  rememberSelfWrite(targetPath, hashText(updated));

  if (targetPath !== sourcePath) {
    await unlink(absoluteSource).catch(() => undefined);
  }

  await context.index.applyBatch(
    {
      deletes: targetPath === sourcePath ? [] : [sourcePath],
      upserts: [targetPath],
    },
    { skipSelfWriteCheck: true },
  );

  const label = `task ${id}`;
  if (targetPath !== sourcePath) context.onWrote?.({ path: sourcePath, label });
  context.onWrote?.({ path: targetPath, label });

  const fresh = context.index.getById(id);
  if (fresh === null) throw new ApiError(500, 'internal', 'Moved task could not be re-indexed');
  return toApiRecord(fresh);
};

const patchFrontmatter = async (
  context: RecordServiceContext,
  relativePath: string,
  patch: Record<string, unknown>,
): Promise<void> => {
  const absolute = resolveRecordPath(context.workspace, relativePath);
  const file = await readRecordFile(absolute);
  if (!file.ok) return;

  const updated = updateFrontmatter(file.value.text, patch);
  await writeFileAtomic(absolute, updated);
  rememberSelfWrite(relativePath, hashText(updated));
  await context.index.applyChange(relativePath, { skipSelfWriteCheck: true });

  const entry = context.index.getByPath(relativePath);
  if (entry !== null) {
    context.onWrote?.({ path: relativePath, label: `${entry.record.type} ${entry.record.id}` });
  }
};

const nextDocumentNumber = (
  context: RecordServiceContext,
  type: 'invoice' | 'estimate',
  year: number,
): string => {
  const prefix = type === 'invoice' ? 'INV' : 'EST';
  let highest = 0;

  for (const entry of context.index.list(type)) {
    const record = entry.record;
    const number =
      record.type === 'invoice'
        ? record.invoice_number
        : record.type === 'estimate'
          ? record.estimate_number
          : '';
    const match = new RegExp(`^${prefix}-${year}-(\\d+)$`).exec(number);
    if (match?.[1] !== undefined) highest = Math.max(highest, Number(match[1]));
  }

  return `${prefix}-${year}-${String(highest + 1).padStart(3, '0')}`;
};

const addDays = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Creates an invoice from an estimate and back-links `converted_invoice_id`. */
export const createInvoiceFromEstimate = async (
  context: RecordServiceContext,
  estimateId: string,
): Promise<ApiRecord> => {
  const entry = requireEntry(context, 'estimate', estimateId);
  if (entry.record.type !== 'estimate') {
    throw new ApiError(404, 'unknown_id', `No estimate with id ${estimateId}`);
  }
  const estimate = entry.record;

  if (estimate.converted_invoice_id !== '') {
    throw new ApiError(409, 'conflict', 'Estimate has already been converted', {
      invoiceId: estimate.converted_invoice_id,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));

  const invoice = await createRecord(context, 'invoice', {
    fields: {
      invoice_number: nextDocumentNumber(context, 'invoice', year),
      client_id: estimate.client_id,
      project_id: estimate.project_id,
      estimate_id: estimate.id,
      title: estimate.title === '' ? `Invoice for ${estimate.estimate_number}` : estimate.title,
      status: 'draft',
      issue_date: today,
      due_date: addDays(today, 15),
      currency: estimate.currency,
      ...(estimate.terms_document === '' ? {} : { terms_document: estimate.terms_document }),
      document_ids: estimate.document_ids,
      tax_rate_bps: estimate.tax_rate_bps,
      line_items: estimate.line_items.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unit_price_cents: line.unit_price_cents,
        total_cents: line.total_cents,
      })),
    },
  });

  await patchFrontmatter(context, estimate.path, { converted_invoice_id: invoice.id });
  return invoice;
};

/** Clones an estimate or invoice with a fresh number, draft status and today's dates. */
export const duplicateRecord = async (
  context: RecordServiceContext,
  type: RecordType,
  id: string,
): Promise<ApiRecord> => {
  if (type !== 'estimate' && type !== 'invoice') {
    throw new ApiError(400, 'invalid_duplicate', 'Only estimates and invoices can be duplicated');
  }

  const entry = requireEntry(context, type, id);
  const record = entry.record;
  const today = new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const title = record.type === 'estimate' || record.type === 'invoice' ? record.title : '';

  const common = {
    title: title === '' ? '' : `${title} (copy)`,
    status: 'draft',
    issue_date: today,
    client_id: 'client_id' in record ? record.client_id : '',
    project_id: 'project_id' in record ? record.project_id : '',
    terms_document: 'terms_document' in record ? record.terms_document : '',
    document_ids:
      'document_ids' in record && Array.isArray(record.document_ids)
        ? record.document_ids
        : [],
    currency: 'currency' in record ? record.currency : '',
    tax_rate_bps: 'tax_rate_bps' in record ? record.tax_rate_bps : 0,
    line_items:
      'line_items' in record
        ? record.line_items.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            unit_price_cents: line.unit_price_cents,
            total_cents: line.total_cents,
          }))
        : [],
  };

  const fields: Record<string, unknown> =
    type === 'estimate'
      ? {
          ...common,
          estimate_number: nextDocumentNumber(context, 'estimate', year),
          valid_until: addDays(today, 30),
          converted_invoice_id: null,
        }
      : {
          ...common,
          invoice_number: nextDocumentNumber(context, 'invoice', year),
          due_date: addDays(today, 15),
          ...('estimate_id' in record && record.estimate_id !== ''
            ? { estimate_id: record.estimate_id }
            : {}),
        };

  return createRecord(context, type, { fields, body: record.body });
};

export interface ListFilters {
  readonly status?: string;
  readonly project_id?: string;
  readonly client_id?: string;
}

/**
 * Lists records with hard filters. Free-text `q` is handled by the ranked
 * search service in the route layer (docs/10-search.md).
 */
export const listRecords = (
  context: RecordServiceContext,
  type: RecordType,
  filters: ListFilters = {},
): ApiRecord[] => {
  let entries = context.index.list(type);
  const status = filters.status;
  const projectId = filters.project_id;
  const clientId = filters.client_id;

  if (status !== undefined) {
    entries = entries.filter(
      (entry) => 'status' in entry.record && entry.record.status === status,
    );
  }
  if (projectId !== undefined) {
    entries = entries.filter(
      (entry) => 'project_id' in entry.record && entry.record.project_id === projectId,
    );
  }
  if (clientId !== undefined) {
    entries = entries.filter(
      (entry) => 'client_id' in entry.record && entry.record.client_id === clientId,
    );
  }

  return [...entries]
    .sort((left, right) => left.record.path.localeCompare(right.record.path))
    .map(toApiRecord);
};

export const recordTypeForPlural = (plural: string): RecordType | null =>
  PLURAL_TO_TYPE[plural] ?? null;

export const RECORD_TYPE_LIST: readonly RecordType[] = RECORD_TYPES;

export const taskStatusOfPath = (relativePath: string): TaskStatus | null =>
  taskStatusFromPath(relativePath);
