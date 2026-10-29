import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import type { AppContext } from '../context.js';
import type { GitService } from '../../git/types.js';
import { ApiError, errorBody } from '../errors.js';
import { CONFIG_FILE } from '../../workspace/paths.js';
import { ConfigError, mergeConfig, readConfig, writeConfig } from '../../workspace/config.js';

const patchSchema = z.record(z.unknown());

const validationHook = (result: { success: boolean; error?: z.ZodError }, c: Context): Response | undefined => {
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

export const createConfigRoutes = (context: AppContext, git?: GitService): Hono => {
  const routes = new Hono();

  routes.get('/config', async (c) => c.json({ config: await readConfig(context.workspace) }));

  routes.patch('/config', zValidator('json', patchSchema, validationHook), async (c) => {
    const current = await readConfig(context.workspace);

    try {
      const merged = mergeConfig(current, c.req.valid('json'));
      await writeConfig(context.workspace, merged);
      git?.scheduleCommit({ path: CONFIG_FILE, label: 'config' });
      context.bus.publish('config.changed', { config: merged });
      return c.json({ config: merged });
    } catch (error) {
      if (error instanceof ConfigError) {
        throw new ApiError(422, 'validation_failed', error.message);
      }
      throw error;
    }
  });

  return routes;
};
