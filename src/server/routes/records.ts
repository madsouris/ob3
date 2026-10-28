import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import { z } from 'zod';
import { RECORD_TYPES, writeSchemas } from '../../model/schemas.js';
import type { AppContext } from '../context.js';
import { recordServiceContext } from '../context.js';
import { ApiError, errorBody } from '../errors.js';
import {
  TYPE_TO_PLURAL,
  createInvoiceFromEstimate,
  createRecord,
  deleteRecord,
  listRecords,
  moveTask,
  toApiRecord,
  updateRecord,
} from '../services/records.js';
import type { ListFilters } from '../services/records.js';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const validateId = (raw: string): string => {
  if (!ID_PATTERN.test(raw)) throw new ApiError(400, 'invalid_id', 'Invalid record id');
  return raw;
};

const validationHook = (
  result: { success: boolean; error?: z.ZodError },
  c: Context,
): Response | undefined => {
  if (result.success) return undefined;
  return c.json(
    errorBody('validation_failed', 'Invalid payload', {
      issues: (result.error?.issues ?? []).map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    }),
    422,
  );
};

const readFilters = (c: Context): ListFilters => {
  const filters: { q?: string; status?: string; project_id?: string; client_id?: string } = {};
  for (const key of ['q', 'status', 'project_id', 'client_id'] as const) {
    const value = c.req.query(key);
    if (value !== undefined && value !== '') filters[key] = value;
  }
  return filters;
};

const bodyOf = (payload: Record<string, unknown>): string | undefined =>
  typeof payload['body'] === 'string' ? payload['body'] : undefined;

const serialize = async (
  context: AppContext,
  record: ReturnType<typeof toApiRecord>,
): Promise<unknown> => ({
  record,
  hash: context.index.getById(record.id)?.hash ?? '',
  generation: context.index.generation,
});

export const createRecordRoutes = (context: AppContext): Hono => {
  const routes = new Hono();
  const service = recordServiceContext(context);

  const publishUpsert = (record: ReturnType<typeof toApiRecord>): void => {
    context.bus.publish('record.upsert', {
      generation: context.index.generation,
      record,
    });
  };

  for (const type of RECORD_TYPES) {
    const plural = TYPE_TO_PLURAL[type];
    const base = writeSchemas[type] as z.AnyZodObject;
    const createSchema = base.extend({ body: z.string().optional() });
    const patchSchema = base.partial().extend({
      body: z.string().optional(),
      baseHash: z.string().optional(),
    });

    routes.get(`/${plural}`, (c) =>
      c.json({
        records: listRecords(service, type, readFilters(c)),
        generation: context.index.generation,
      }),
    );

    routes.get(`/${plural}/:id`, (c) => {
      const id = validateId(c.req.param('id'));
      const entry = context.index.getById(id);
      if (entry === null || entry.record.type !== type) {
        throw new ApiError(404, 'unknown_id', `No ${type} with id ${id}`);
      }
      return c.json({
        record: toApiRecord(entry),
        hash: entry.hash,
        generation: context.index.generation,
      });
    });

    routes.post(`/${plural}`, zValidator('json', createSchema, validationHook), async (c) => {
      const payload = c.req.valid('json') as Record<string, unknown>;
      const body = bodyOf(payload);
      const record = await createRecord(
        service,
        type,
        body === undefined ? { fields: payload } : { fields: payload, body },
      );
      publishUpsert(record);
      return c.json(await serialize(context, record), 201);
    });

    routes.patch(`/${plural}/:id`, zValidator('json', patchSchema, validationHook), async (c) => {
      const id = validateId(c.req.param('id'));
      const payload = c.req.valid('json') as Record<string, unknown>;
      const body = bodyOf(payload);
      const baseHash = typeof payload['baseHash'] === 'string' ? payload['baseHash'] : undefined;

      const record = await updateRecord(service, type, id, {
        fields: payload,
        ...(body === undefined ? {} : { body }),
        ...(baseHash === undefined ? {} : { baseHash }),
      });

      publishUpsert(record);
      return c.json(await serialize(context, record));
    });

    routes.delete(`/${plural}/:id`, async (c) => {
      const id = validateId(c.req.param('id'));
      const baseHash = c.req.query('baseHash');
      await deleteRecord(service, type, id, baseHash);
      context.bus.publish('record.delete', { generation: context.index.generation, id });
      return c.body(null, 204);
    });
  }

  routes.post('/tasks/:id/move', async (c) => {
    const id = validateId(c.req.param('id'));
    const previous = context.index.getById(id)?.record.path ?? null;

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON');
    }

    const record = await moveTask(service, id, payload);
    context.bus.publish('record.moved', {
      generation: context.index.generation,
      id,
      from: previous,
      to: record.path,
    });
    publishUpsert(record);
    return c.json(await serialize(context, record));
  });

  routes.post('/invoices/from-estimate/:estimateId', async (c) => {
    const estimateId = validateId(c.req.param('estimateId'));
    const estimateBefore = context.index.getById(estimateId);

    const invoice = await createInvoiceFromEstimate(service, estimateId);
    publishUpsert(invoice);

    const estimate = context.index.getById(estimateId);
    if (estimate !== null && estimate.record !== estimateBefore?.record) {
      publishUpsert(toApiRecord(estimate));
    }

    return c.json(await serialize(context, invoice), 201);
  });

  return routes;
};
