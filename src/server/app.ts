import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';

export interface AppOptions {
  readonly workspace: string;
  readonly version: string;
  readonly startedAt: number;
}

const FALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>ob</title></head>
  <body style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 3rem">
    <h1>ob</h1>
    <p>The UI bundle was not found. Run <code>pnpm build</code> to generate
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

const htmlHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'text/html; charset=utf-8',
} as const;

/**
 * The HTTP surface for the local app. Everything is same-origin and loopback
 * only; security middleware and the token check arrive in M3 (docs/07).
 */
export const createApp = (options: AppOptions): Hono => {
  const app = new Hono();

  app.use(
    '*',
    secureHeaders({
      // Loopback HTTP only: HSTS would be meaningless and can confuse browsers.
      strictTransportSecurity: false,
      xFrameOptions: 'DENY',
    }),
  );

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      version: options.version,
      workspace: options.workspace,
      uptimeSeconds: Math.max(0, Math.round((Date.now() - options.startedAt) / 1000)),
    }),
  );

  app.get('/', (c) => c.html(resolveClientHtml() ?? FALLBACK_HTML, 200, htmlHeaders));

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json(
        { error: { code: 'http_error', message: error.message } },
        error.status,
      );
    }
    // Never leak stack traces or filesystem paths to the client.
    console.error(error);
    return c.json({ error: { code: 'internal', message: 'Internal server error' } }, 500);
  });

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: { code: 'not_found', message: 'Unknown route' } }, 404);
    }
    return c.html(resolveClientHtml() ?? FALLBACK_HTML, 200, htmlHeaders);
  });

  return app;
};
