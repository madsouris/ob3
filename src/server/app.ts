import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { PathEscapeError } from '../io/path-safety.js';
import { createSearchService } from '../index/search.js';
import { createGitService } from '../git/service.js';
import type { GitService } from '../git/types.js';
import { ConfigError } from '../workspace/config.js';
import type { AppContext } from './context.js';
import { ApiError, errorBody } from './errors.js';
import { createAssetRoutes } from './routes/assets.js';
import { createConfigRoutes } from './routes/config.js';
import { createEventRoutes } from './routes/events.js';
import { createGitRoutes } from './routes/git.js';
import { createImportRoutes } from './routes/import.js';
import { createIssueRoutes } from './routes/issues.js';
import { createRecordRoutes } from './routes/records.js';
import { createSearchRoutes } from './routes/search.js';
import { allowedHostsFor, allowedOriginsFor, createSecurityMiddleware } from './security.js';

const MAX_BODY_BYTES = 1024 * 1024;

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

const htmlHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'text/html; charset=utf-8',
} as const;

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

/** The per-run token is inlined at request time, never written into `dist/`. */
export const injectToken = (html: string, token: string): string =>
  html.split('__OB_TOKEN__').join(token);

export interface AppOptions {
  /** Injected by the CLI so shutdown can flush pending commits; tests may inject too. */
  readonly git?: GitService;
}

/**
 * The HTTP surface for the local app: same-origin, loopback only, token-gated
 * mutations (docs/07). Throws `ApiError`s that `onError` shapes into the
 * `{ error: { code, message } }` envelope.
 */
export const createApp = (context: AppContext, options: AppOptions = {}): Hono => {
  const app = new Hono();

  const git =
    options.git ??
    createGitService({
      root: context.workspace,
      publisher: context.bus,
      allowParentRepo: process.env['OB_ALLOW_PARENT_REPO'] === '1',
    });

  app.use(
    '*',
    secureHeaders({
      strictTransportSecurity: false,
      xFrameOptions: 'DENY',
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    }),
  );

  app.use(
    '/api/*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) =>
        c.json(errorBody('payload_too_large', 'Request body exceeds 1 MB'), 413),
    }),
  );

  app.use(
    '/api/*',
    createSecurityMiddleware({
      token: context.token,
      allowedHosts: allowedHostsFor(context.port),
      allowedOrigins: allowedOriginsFor(context.port),
    }),
  );

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      version: context.version,
      workspace: context.workspace,
      generation: context.index.generation,
      records: context.index.list().length,
      uptimeSeconds: Math.max(0, Math.round((Date.now() - context.startedAt) / 1000)),
    }),
  );

  app.route('/api', createEventRoutes(context));
  const search = createSearchService(context.index);
  app.route('/api', createRecordRoutes(context, search, git));
  app.route('/api', createSearchRoutes(context, search));
  app.route('/api', createConfigRoutes(context, git));
  app.route('/api', createAssetRoutes(context, git));
  app.route('/api', createImportRoutes(context, git));
  app.route('/api', createGitRoutes(git));
  app.route('/api', createIssueRoutes(context, git));

  app.get('/', (c) =>
    c.html(injectToken(resolveClientHtml() ?? FALLBACK_HTML, context.token), 200, htmlHeaders),
  );

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json(errorBody(error.code, error.message, error.details), error.status);
    }
    if (error instanceof PathEscapeError) {
      return c.json(errorBody('path_escape', 'Path escapes the workspace'), 400);
    }
    if (error instanceof ConfigError) {
      return c.json(errorBody('config_invalid', error.message), 500);
    }
    if (error instanceof HTTPException) {
      return c.json(errorBody('internal', error.message), error.status);
    }

    // Never leak stack traces or filesystem paths to the client.
    console.error(error);
    return c.json(errorBody('internal', 'Internal server error'), 500);
  });

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json(errorBody('not_found', 'Unknown route'), 404);
    }
    return c.html(injectToken(resolveClientHtml() ?? FALLBACK_HTML, context.token), 200, htmlHeaders);
  });

  return app;
};
