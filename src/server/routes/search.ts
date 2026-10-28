import { Hono } from 'hono';
import { RECORD_TYPES, type RecordType } from '../../model/schemas.js';
import type { AppContext } from '../context.js';
import type { SearchService } from '../../index/search.js';

const asType = (value: string | undefined): RecordType | undefined =>
  value !== undefined && (RECORD_TYPES as readonly string[]).includes(value)
    ? (value as RecordType)
    : undefined;

const asLimit = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const createSearchRoutes = (context: AppContext, search: SearchService): Hono => {
  const routes = new Hono();

  routes.get('/search', (c) => {
    const query = c.req.query('q') ?? '';
    const type = asType(c.req.query('type'));
    const limit = asLimit(c.req.query('limit'));

    return c.json({
      query,
      hits: search.search(query, {
        ...(type === undefined ? {} : { type }),
        ...(limit === undefined ? {} : { limit }),
      }),
      generation: context.index.generation,
    });
  });

  return routes;
};

export { asType as recordTypeFromQuery };
