import { describe, expect, it } from 'vitest';
import { createApp, resolveClientHtml } from '../../src/server/app.js';

function app(): ReturnType<typeof createApp> {
  return createApp({ workspace: '/tmp/workspace', version: '0.1.0', startedAt: Date.now() });
}

describe('GET /api/health', () => {
  it('reports ok, version and workspace', async () => {
    const response = await app().request('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      version: '0.1.0',
      workspace: '/tmp/workspace',
    });
  });
});

describe('GET /', () => {
  it('serves an HTML document', async () => {
    const response = await app().request('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.text()).toLowerCase()).toContain('<!doctype html');
  });

  it('applies the security headers from hono/secure-headers', async () => {
    const response = await app().request('/');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    // Loopback HTTP: HSTS must stay off.
    expect(response.headers.get('strict-transport-security')).toBeNull();
  });

  it('serves the SPA shell for unknown non-API routes', async () => {
    const response = await app().request('/contacts/cnt_whatever');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
  });
});

describe('unknown API routes', () => {
  it('returns the JSON error envelope', async () => {
    const response = await app().request('/api/nope');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'not_found', message: 'Unknown route' },
    });
  });
});

describe('client bundle resolution', () => {
  it('finds the built bundle or reports its absence without throwing', () => {
    const html = resolveClientHtml();
    if (html !== null) expect(html.toLowerCase()).toContain('<!doctype html');
    else expect(html).toBeNull();
  });
});
