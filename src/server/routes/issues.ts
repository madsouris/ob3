import { Hono } from 'hono';
import type { AppContext } from '../context.js';
import type { GitService } from '../../git/types.js';
import { listIssues, previewIssue, resolveIssue } from '../services/issues.js';

export const createIssueRoutes = (context: AppContext, git?: GitService): Hono => {
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

    if (result.path !== undefined) {
      const entry = context.index.getByPath(result.path);
      const recordId = result.id ?? entry?.record.id ?? '';
      const label = `${entry?.record.type ?? 'record'} ${recordId}`.trim();
      if (result.from !== undefined) git?.scheduleCommit({ path: result.from, label });
      git?.scheduleCommit({ path: result.path, label });
    }

    context.bus.publish('issues.changed', {
      generation: context.index.generation,
      issues: await listIssues(context),
    });

    return c.json({ ...result, generation: context.index.generation });
  });

  return routes;
};
