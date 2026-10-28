import { afterEach, describe, expect, it } from 'vitest';
import { createApp, injectToken } from '../../src/server/app.js';
import { removeTempDir } from '../helpers/tmp.js';
import { createTestServer } from '../helpers/server.js';
import type { TestServer } from '../helpers/server.js';

let servers: TestServer[] = [];

afterEach(async () => {
  for (const server of servers) await removeTempDir(server.parent);
  servers = [];
});

async function server(): Promise<TestServer> {
  const created = await createTestServer();
  servers.push(created);
  return created;
}

describe('GET /api/health', () => {
  it('reports ok, version, workspace and index state', async () => {
    const { req } = await server();
    const response = await req('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      version: '0.0.0-test',
      records: 0,
      generation: 1,
    });
  });
});

describe('GET /', () => {
  it('serves an HTML document with the security headers', async () => {
    const { req } = await server();
    const response = await req('/');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.text()).toLowerCase()).toContain('<!doctype html');
  });

  it('applies hono/secure-headers defaults', async () => {
    const { req } = await server();
    const response = await req('/');

    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('strict-transport-security')).toBeNull();
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  it('serves the SPA shell for unknown non-API routes', async () => {
    const { req } = await server();
    const response = await req('/contacts/cnt_whatever');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
  });
});

describe('token injection', () => {
  it('replaces the placeholder in the served document', () => {
    const html = '<meta name="ob-token" content="__OB_TOKEN__" />';
    expect(injectToken(html, 'abc123')).toBe('<meta name="ob-token" content="abc123" />');
  });

  it('never leaks the placeholder to the client', async () => {
    const { req } = await server();
    const body = await (await req('/')).text();
    expect(body).not.toContain('__OB_TOKEN__');
  });
});

describe('unknown API routes', () => {
  it('returns the JSON error envelope', async () => {
    const { req } = await server();
    const response = await req('/api/nope');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'not_found', message: 'Unknown route' },
    });
  });
});

describe('createApp contract', () => {
  it('is constructible from a bare context', async () => {
    const { context } = await server();
    const app = createApp(context);
    expect(await app.request('http://127.0.0.1:19731/api/health')).toBeInstanceOf(Response);
  });
});
