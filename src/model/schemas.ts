import { z } from 'zod';
import type { IssueCode } from './issue.js';
import type { TaskStatus } from './task-status.js';

export const RECORD_TYPES = ['contact', 'project', 'task', 'estimate', 'invoice', 'document'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const CONTACT_STATUSES = ['lead', 'active', 'inactive', 'archived'] as const;
export const PROJECT_STATUSES = ['active', 'completed', 'archived'] as const;
export const ESTIMATE_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'expired'] as const;
export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'cancelled'] as const;
export const DOCUMENT_KINDS = ['terms', 'proposal', 'note'] as const;

export interface LineItem {
  readonly description: string;
  readonly quantity: number;
  readonly unit_price_cents: number;
  readonly total_cents: number;
}

export interface BaseRecord {
  readonly id: string;
  readonly type: RecordType;
  readonly path: string;
  readonly ob_schema: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly body: string;
  /** Frontmatter keys `ob` does not own; preserved and shown read-only. */
  readonly extra: Readonly<Record<string, unknown>>;
}

export interface ContactRecord extends BaseRecord {
  readonly type: 'contact';
  readonly first_name: string;
  readonly last_name: string;
  readonly email: string;
  readonly company: string;
  readonly job_role: string;
  readonly phone_number: string;
  readonly website: string;
  readonly primary_link: string;
  readonly status: string;
}

export interface ProjectRecord extends BaseRecord {
  readonly type: 'project';
  readonly project_name: string;
  readonly client_id: string;
  readonly status: string;
}

export interface TaskRecord extends BaseRecord {
  readonly type: 'task';
  readonly title: string;
  readonly project_id: string;
  readonly order: number;
  readonly due_date: string;
  /** Derived from the containing folder; `null` when the file is outside a column. */
  readonly status: TaskStatus | null;
}

export interface EstimateRecord extends BaseRecord {
  readonly type: 'estimate';
  readonly estimate_number: string;
  readonly client_id: string;
  readonly project_id: string;
  readonly title: string;
  readonly status: string;
  readonly issue_date: string;
  readonly valid_until: string;
  readonly currency: string;
  readonly terms_document: string;
  readonly subtotal_cents: number;
  readonly tax_rate_bps: number;
  readonly tax_amount_cents: number;
  readonly total_cents: number;
  readonly line_items: readonly LineItem[];
  readonly converted_invoice_id: string;
}

export interface InvoiceRecord extends BaseRecord {
  readonly type: 'invoice';
  readonly invoice_number: string;
  readonly client_id: string;
  readonly project_id: string;
  readonly estimate_id: string;
  readonly title: string;
  readonly status: string;
  readonly issue_date: string;
  readonly due_date: string;
  readonly currency: string;
  readonly terms_document: string;
  readonly subtotal_cents: number;
  readonly tax_rate_bps: number;
  readonly tax_amount_cents: number;
  readonly total_cents: number;
  readonly line_items: readonly LineItem[];
}

export interface DocumentRecord extends BaseRecord {
  readonly type: 'document';
  readonly title: string;
  readonly kind: string;
}

export type AnyRecord =
  | ContactRecord
  | ProjectRecord
  | TaskRecord
  | EstimateRecord
  | InvoiceRecord
  | DocumentRecord;

export interface ProjectionIssue {
  readonly code: IssueCode;
  readonly message: string;
  readonly detail?: string;
}

export interface ProjectionInput {
  readonly type: RecordType;
  readonly id: string;
  readonly path: string;
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly body: string;
  readonly taskStatus: TaskStatus | null;
}

export interface ProjectionResult {
  readonly record: AnyRecord;
  readonly issues: readonly ProjectionIssue[];
}

const BASE_KEYS = ['ob_schema', 'id', 'type', 'created_at', 'updated_at'] as const;

const KNOWN_KEYS: Readonly<Record<RecordType, readonly string[]>> = {
  contact: [
    ...BASE_KEYS,
    'first_name',
    'last_name',
    'email',
    'company',
    'job_role',
    'phone_number',
    'website',
    'primary_link',
    'status',
  ],
  project: [...BASE_KEYS, 'project_name', 'client_id', 'status'],
  task: [...BASE_KEYS, 'title', 'project_id', 'order', 'due_date'],
  estimate: [
    ...BASE_KEYS,
    'estimate_number',
    'client_id',
    'project_id',
    'title',
    'status',
    'issue_date',
    'valid_until',
    'currency',
    'terms_document',
    'subtotal_cents',
    'tax_rate_bps',
    'tax_amount_cents',
    'total_cents',
    'line_items',
    'converted_invoice_id',
  ],
  invoice: [
    ...BASE_KEYS,
    'invoice_number',
    'client_id',
    'project_id',
    'estimate_id',
    'title',
    'status',
    'issue_date',
    'due_date',
    'currency',
    'terms_document',
    'subtotal_cents',
    'tax_rate_bps',
    'tax_amount_cents',
    'total_cents',
    'line_items',
  ],
  document: [...BASE_KEYS, 'title', 'kind'],
};

const asString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
};

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asInteger = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;

const asLineItems = (
  value: unknown,
  issues: ProjectionIssue[],
): readonly LineItem[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    issues.push({ code: 'schema-invalid', message: 'line_items is not a list' });
    return [];
  }

  const lines: LineItem[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'object' || entry === null) {
      issues.push({ code: 'schema-invalid', message: `line_items[${index}] is not a mapping` });
      continue;
    }
    const line = entry as Record<string, unknown>;
    lines.push({
      description: asString(line['description']),
      quantity: asNumber(line['quantity'], 1),
      unit_price_cents: asInteger(line['unit_price_cents']),
      total_cents: asInteger(line['total_cents']),
    });
  }
  return lines;
};

const checkEnum = (
  value: string,
  allowed: readonly string[],
  field: string,
  issues: ProjectionIssue[],
): void => {
  if (value === '') return;
  if (!allowed.includes(value)) {
    issues.push({
      code: 'schema-invalid',
      message: `${field} has unexpected value "${value}"`,
      detail: `Allowed: ${allowed.join(', ')}`,
    });
  }
};

const requireField = (value: string, field: string, issues: ProjectionIssue[]): void => {
  if (value.trim() === '') {
    issues.push({ code: 'schema-invalid', message: `Missing required field "${field}"` });
  }
};

const extraKeys = (type: RecordType, frontmatter: Readonly<Record<string, unknown>>): Record<string, unknown> => {
  const known = new Set(KNOWN_KEYS[type]);
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!known.has(key)) extra[key] = value;
  }
  return extra;
};

/**
 * Projects raw frontmatter into a typed record. Permissive on read: anything
 * unusable becomes a `schema-invalid` issue and a documented fallback, so one
 * broken field never hides the rest of the record.
 */
export const projectRecord = (input: ProjectionInput): ProjectionResult => {
  const issues: ProjectionIssue[] = [];
  const fm = input.frontmatter;

  const base = {
    id: input.id,
    path: input.path,
    ob_schema: asInteger(fm['ob_schema'], 1),
    created_at: asString(fm['created_at']),
    updated_at: asString(fm['updated_at']),
    body: input.body,
    extra: extraKeys(input.type, fm),
  };

  switch (input.type) {
    case 'contact': {
      const status = asString(fm['status'], 'lead');
      const first_name = asString(fm['first_name']);
      requireField(first_name, 'first_name', issues);
      checkEnum(status, CONTACT_STATUSES, 'status', issues);
      return {
        issues,
        record: {
          ...base,
          type: 'contact',
          first_name,
          last_name: asString(fm['last_name']),
          email: asString(fm['email']),
          company: asString(fm['company']),
          job_role: asString(fm['job_role']),
          phone_number: asString(fm['phone_number']),
          website: asString(fm['website']),
          primary_link: asString(fm['primary_link']),
          status,
        },
      };
    }
    case 'project': {
      const status = asString(fm['status'], 'active');
      const project_name = asString(fm['project_name']);
      requireField(project_name, 'project_name', issues);
      checkEnum(status, PROJECT_STATUSES, 'status', issues);
      return {
        issues,
        record: {
          ...base,
          type: 'project',
          project_name,
          client_id: asString(fm['client_id']),
          status,
        },
      };
    }
    case 'task': {
      const title = asString(fm['title']);
      requireField(title, 'title', issues);
      if (fm['status'] !== undefined) {
        issues.push({
          code: 'schema-invalid',
          message: 'Task status belongs in the folder, not the frontmatter',
        });
      }
      return {
        issues,
        record: {
          ...base,
          type: 'task',
          title,
          project_id: asString(fm['project_id']),
          order: asInteger(fm['order']),
          due_date: asString(fm['due_date']),
          status: input.taskStatus,
        },
      };
    }
    case 'estimate': {
      const status = asString(fm['status'], 'draft');
      const estimate_number = asString(fm['estimate_number']);
      requireField(estimate_number, 'estimate_number', issues);
      checkEnum(status, ESTIMATE_STATUSES, 'status', issues);
      return {
        issues,
        record: {
          ...base,
          type: 'estimate',
          estimate_number,
          client_id: asString(fm['client_id']),
          project_id: asString(fm['project_id']),
          title: asString(fm['title']),
          status,
          issue_date: asString(fm['issue_date']),
          valid_until: asString(fm['valid_until']),
          currency: asString(fm['currency'], 'USD'),
          terms_document: asString(fm['terms_document']),
          subtotal_cents: asInteger(fm['subtotal_cents']),
          tax_rate_bps: asInteger(fm['tax_rate_bps']),
          tax_amount_cents: asInteger(fm['tax_amount_cents']),
          total_cents: asInteger(fm['total_cents']),
          line_items: asLineItems(fm['line_items'], issues),
          converted_invoice_id: asString(fm['converted_invoice_id']),
        },
      };
    }
    case 'invoice': {
      const status = asString(fm['status'], 'draft');
      const invoice_number = asString(fm['invoice_number']);
      requireField(invoice_number, 'invoice_number', issues);
      checkEnum(status, INVOICE_STATUSES, 'status', issues);
      return {
        issues,
        record: {
          ...base,
          type: 'invoice',
          invoice_number,
          client_id: asString(fm['client_id']),
          project_id: asString(fm['project_id']),
          estimate_id: asString(fm['estimate_id']),
          title: asString(fm['title']),
          status,
          issue_date: asString(fm['issue_date']),
          due_date: asString(fm['due_date']),
          currency: asString(fm['currency'], 'USD'),
          terms_document: asString(fm['terms_document']),
          subtotal_cents: asInteger(fm['subtotal_cents']),
          tax_rate_bps: asInteger(fm['tax_rate_bps']),
          tax_amount_cents: asInteger(fm['tax_amount_cents']),
          total_cents: asInteger(fm['total_cents']),
          line_items: asLineItems(fm['line_items'], issues),
        },
      };
    }
    case 'document': {
      const title = asString(fm['title']);
      const kind = asString(fm['kind'], 'note');
      requireField(title, 'title', issues);
      checkEnum(kind, DOCUMENT_KINDS, 'kind', issues);
      return {
        issues,
        record: { ...base, type: 'document', title, kind },
      };
    }
  }
};

/** Display title with a stable fallback, so a missing field never blanks a row. */
export const recordTitle = (record: AnyRecord): string => {
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

const centsSchema = z.number().int().min(0);
const bpsSchema = z.number().int().min(0).max(10_000);
const isoDateSchema = z.string().min(1);
const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price_cents: centsSchema,
  total_cents: centsSchema,
});

/**
 * Strict schemas for writes (API bodies from M3). Reading is permissive and
 * goes through `projectRecord` above.
 */
export const writeSchemas = {
  contact: z.object({
    first_name: z.string().min(1),
    last_name: z.string().optional(),
    email: z.string().optional(),
    company: z.string().optional(),
    job_role: z.string().optional(),
    phone_number: z.string().optional(),
    website: z.string().optional(),
    primary_link: z.string().optional(),
    status: z.enum(CONTACT_STATUSES).optional(),
  }),
  project: z.object({
    project_name: z.string().min(1),
    client_id: z.string().optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
  }),
  task: z.object({
    title: z.string().min(1),
    project_id: z.string().optional(),
    order: z.number().int().min(0).optional(),
    due_date: z.string().optional(),
  }),
  estimate: z.object({
    estimate_number: z.string().min(1),
    client_id: z.string().optional(),
    project_id: z.string().optional(),
    title: z.string().optional(),
    status: z.enum(ESTIMATE_STATUSES).optional(),
    issue_date: isoDateSchema.optional(),
    valid_until: isoDateSchema.optional(),
    currency: z.string().optional(),
    terms_document: z.string().optional(),
    subtotal_cents: centsSchema.optional(),
    tax_rate_bps: bpsSchema.optional(),
    tax_amount_cents: centsSchema.optional(),
    total_cents: centsSchema.optional(),
    line_items: z.array(lineItemSchema).optional(),
    converted_invoice_id: z.string().nullable().optional(),
  }),
  invoice: z.object({
    invoice_number: z.string().min(1),
    client_id: z.string().optional(),
    project_id: z.string().optional(),
    estimate_id: z.string().optional(),
    title: z.string().optional(),
    status: z.enum(INVOICE_STATUSES).optional(),
    issue_date: isoDateSchema.optional(),
    due_date: isoDateSchema.optional(),
    currency: z.string().optional(),
    terms_document: z.string().optional(),
    subtotal_cents: centsSchema.optional(),
    tax_rate_bps: bpsSchema.optional(),
    tax_amount_cents: centsSchema.optional(),
    total_cents: centsSchema.optional(),
    line_items: z.array(lineItemSchema).optional(),
  }),
  document: z.object({
    title: z.string().min(1),
    kind: z.enum(DOCUMENT_KINDS).optional(),
  }),
} as const;
