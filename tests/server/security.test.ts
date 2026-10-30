import { afterEach, describe, expect, it } from 'vitest';
import { TEST_TOKEN } from '../helpers/server.js';
import type { TestServer } from '../helpers/server.js';
import { createTestServer } from '../helpers/server.js';
import { removeTempDir } from '../helpers/tmp.js';

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

const contactBody = (): string => JSON.stringify({ first_name: 'Sec' });

describe('token gate', () => {
  it('rejects a mutation without X-OB-Token', async () => {
    const { req } = await server();
    const response = await req('/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: contactBody(),
    });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('invalid_token');
  });

  it('rejects a wrong token', async () => {
    const { req } = await server();
    const response = await req('/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ob-token': 'nope' },
      body: contactBody(),
    });
    expect(response.status).toBe(401);
  });

  it('allows reads without a token', async () => {
    const { req } = await server();
    expect((await req('/api/contacts')).status).toBe(200);
  });

  it('accepts a mutation with the right token', async () => {
    const { mutate } = await server();
    expect((await mutate('POST', '/api/contacts', { first_name: 'Sec' })).status).toBe(201);
  });
});

describe('host and origin hardening', () => {
  it('rejects an unknown Host header', async () => {
    const { req } = await server();
    const response = await req('/api/health', { headers: { host: 'evil.example.com' } });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('host_not_allowed');
  });

  it('allows the loopback hosts', async () => {
    const { req } = await server();
    for (const host of ['127.0.0.1:19731', 'localhost:19731']) {
      expect((await req('/api/health', { headers: { host } })).status).toBe(200);
    }
  });

  it('rejects a foreign Origin on a mutation', async () => {
    const { req } = await server();
    const response = await req('/api/contacts', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ob-token': TEST_TOKEN,
        origin: 'https://evil.example.com',
      },
      body: contactBody(),
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('cross_origin');
  });

  it('accepts the app origin', async () => {
    const { req } = await server();
    const response = await req('/api/contacts', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ob-token': TEST_TOKEN,
        origin: 'http://127.0.0.1:19731',
      },
      body: contactBody(),
    });
    expect(response.status).toBe(201);
  });

  it('rejects a cross-site fetch', async () => {
    const { req } = await server();
    const response = await req('/api/health', { headers: { 'sec-fetch-site': 'cross-site' } });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('cross_origin');
  });

  it('allows same-origin and none', async () => {
    const { req } = await server();
    expect((await req('/api/health', { headers: { 'sec-fetch-site': 'same-origin' } })).status).toBe(
      200,
    );
    expect((await req('/api/health', { headers: { 'sec-fetch-site': 'none' } })).status).toBe(200);
  });
});

describe('content security policy', () => {
  it('allows the object URLs used to decode a picked image', async () => {
    const { req } = await server();
    const csp = (await req('/api/health')).headers.get('content-security-policy') ?? '';
    const imgSrc = csp
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('img-src')) ?? '';

    expect(imgSrc).toContain("'self'");
    expect(imgSrc).toContain('data:');
    // Logo/QR uploads re-encode through a canvas fed by URL.createObjectURL.
    expect(imgSrc).toContain('blob:');
  });
});

describe('body limit', () => {
  it('rejects a body over 1 MB', async () => {
    const { req } = await server();
    const response = await req('/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ob-token': TEST_TOKEN },
      body: JSON.stringify({ first_name: 'x'.repeat(1024 * 1024 + 10) }),
    });
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe('payload_too_large');
  });
});
