import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import { z } from 'zod';
import type { GitService } from '../../git/types.js';
import { isImportType, IMPORT_DEFINITIONS, IMPORT_TYPES } from '../../import/definitions.js';
import { skeletonCsv } from '../../import/csv.js';
import { ImportError, importCsv } from '../../import/importer.js';
import type { AppContext } from '../context.js';
import { recordServiceContext } from '../context.js';
import { ApiError, errorBody } from '../errors.js';

const MAX_CSV_CHARS = 1_000_000;

const importSchema = z.object({
  type: z.enum([...IMPORT_TYPES]),
  csv: z.string().min(1).max(MAX_CSV_CHARS),
});

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

/**
 * CSV import (docs/14-csv-import.md): a downloadable skeleton and one POST
 * that creates records through the normal service path. Invalid rows write
 * nothing and come back with their spreadsheet line number.
 */
export const createImportRoutes = (context: AppContext, git?: GitService): Hono => {
  const routes = new Hono();
  const service = recordServiceContext(context, git);

  routes.get('/import/skeleton', (c) => {
    const type = c.req.query('type') ?? 'contact';
    if (!isImportType(type)) {
      throw new ApiError(400, 'unknown_type', `type must be one of ${IMPORT_TYPES.join(', ')}`);
    }

    const { plural } = IMPORT_DEFINITIONS[type];
    return c.body(skeletonCsv(type), 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${plural}-skeleton.csv"`,
      'Cache-Control': 'no-store',
    });
  });

  routes.post('/import', zValidator('json', importSchema, validationHook), async (c) => {
    const { type, csv } = c.req.valid('json');

    let result: Awaited<ReturnType<typeof importCsv>>;
    try {
      result = await importCsv({ context: service, type, csv });
    } catch (error) {
      if (error instanceof ImportError) {
        throw new ApiError(422, 'validation_failed', error.message, { reason: 'import' });
      }
      throw error;
    }

    for (const record of result.records) {
      context.bus.publish('record.upsert', {
        generation: context.index.generation,
        record,
      });
    }

    return c.json({
      type,
      rows: result.rows,
      created: result.records.length,
      failed: result.failed,
      generation: context.index.generation,
    });
  });

  return routes;
};
