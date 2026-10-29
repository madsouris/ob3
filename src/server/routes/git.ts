import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import type { GitService } from '../../git/types.js';
import { errorBody } from '../errors.js';

const recoverSchema = z.object({
  action: z.enum(['abort-sync', 'set-upstream']),
});

const remoteSchema = z.object({
  url: z.string().min(1).max(2048),
  push: z.boolean().default(false),
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
 * Git operations are domain actions: a failed sync is a successful HTTP call
 * with `{ ok: false, error, steps }` so the UI can show the real git output
 * (docs/07, docs/09).
 */
export const createGitRoutes = (git: GitService): Hono => {
  const routes = new Hono();

  routes.get('/git/status', async (c) =>
    c.json({ status: await git.status({ force: c.req.query('force') === '1' }) }),
  );

  routes.post('/git/init', async (c) => c.json(await git.init()));

  routes.post('/git/sync', async (c) => c.json(await git.sync()));

  routes.post('/git/recover', zValidator('json', recoverSchema, validationHook), async (c) => {
    const { action } = c.req.valid('json');
    return c.json(await git.recover(action));
  });

  routes.post('/git/remote', zValidator('json', remoteSchema, validationHook), async (c) => {
    const { url, push } = c.req.valid('json');
    return c.json(await git.setRemote({ url, push }));
  });

  return routes;
};
