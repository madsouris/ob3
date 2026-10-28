import { readFileSync } from 'node:fs';
import { Hono } from 'hono';

export type AppOptions = {
  workspace: string;
  version: string;
  startedAt: number;
};

const FALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>ob</title></head>
  <body style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 3rem">
    <h1>ob</h1>
    <p>The UI bundle was not found. Run <code>npm run build</code> to generate
    <code>dist/client/index.html</code>, then reload.</p>
  </body>
</html>
`;

/**
 * Locates the single-file UI without assuming a cwd. From `src/server/app.ts`
 * (tsx) the bundle is at `dist/client/index.html`; from `dist/server/app.js`
 * (published) it is `../client/index.html`.
 */
export function resolveClientHtml(moduleUrl: string = import.meta.url): string | null {
  const candidates = [
    new URL('../../dist/client/index.html', moduleUrl),
    new URL('../client/index.html', moduleUrl),
  ];
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8');
    } catch {
      // try the next candidate
    }
  }
  return null;
}

export function createApp(options: AppOptions): Hono {
  const app = new Hono();
  const startedAt = options.startedAt;

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      version: options.version,
      workspace: options.workspace,
      uptimeSeconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    }),
  );

  app.get('/', (c) => {
    const html = resolveClientHtml() ?? FALLBACK_HTML;
    return c.html(html, 200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
    });
  });

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: { code: 'not_found', message: 'Unknown route' } }, 404);
    }
    const html = resolveClientHtml() ?? FALLBACK_HTML;
    return c.html(html, 200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
    });
  });

  return app;
}
