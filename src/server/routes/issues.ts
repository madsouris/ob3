import { Hono } from 'hono';
import type { AppContext } from '../context.js';
import { listIssues, previewIssue, resolveIssue } from '../services/issues.js';

export const createIssueRoutes = (context: AppContext): Hono => {
  const routes = new Hono();

  routes.get('/issues', async (c) =>
    c.json({ issues: await listIssues(context), generation: context.index.generation }),
  );

  // Issue keys contain `:` and `/`, so the param must accept the rest of the path.
  routes.get('/issues/:key{.+}/preview', async (c) => {
    const key = c.req.param('key');
    return c.json(await previewIssue(context, key));
  });

  routes.post('/issues/:key{.+}/resolve', async (c) => {
    const key = c.req.param('key');

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      payload = {};
    }

    const result = await resolveIssue(context, key, payload);
    context.bus.publish('issues.changed', {
      generation: context.index.generation,
      issues: await listIssues(context),
    });

    return c.json({ ...result, generation: context.index.generation });
  });

  return routes;
};
