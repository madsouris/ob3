import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AppContext } from '../context.js';
import { countsByType } from '../context.js';
import { listIssues } from '../services/issues.js';

const HEARTBEAT_MS = 20_000;

export const createEventRoutes = (context: AppContext): Hono => {
  const routes = new Hono();

  routes.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      const send = (event: string, data: unknown): void => {
        void stream.writeSSE({ event, data: JSON.stringify(data) });
      };

      send('snapshot', {
        generation: context.index.generation,
        counts: countsByType(context.index),
        issues: (await listIssues(context)).length,
      });

      const unsubscribe = context.bus.subscribe(({ event, data }) => {
        send(event, data);
      });

      const heartbeat = setInterval(() => {
        void stream.writeSSE({ event: 'ping', data: '{}' });
      }, HEARTBEAT_MS);
      heartbeat.unref?.();

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          clearInterval(heartbeat);
          unsubscribe();
          resolve();
        });
      });
    }),
  );

  return routes;
};
