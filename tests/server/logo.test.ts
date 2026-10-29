import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LOGO_FILE } from '../../src/workspace/paths.js';
import { MAX_LOGO_BYTES } from '../../src/server/routes/assets.js';
import { commitSubjects, git, seedGitWorkspace, statusPorcelain } from '../helpers/git.js';
import { TEST_TOKEN, createTestServer } from '../helpers/server.js';
import type { TestServer } from '../helpers/server.js';
import { removeTempDir } from '../helpers/tmp.js';

let servers: TestServer[] = [];

afterEach(async () => {
  for (const server of servers) await removeTempDir(server.parent);
  servers = [];
});

async function server(git = false): Promise<TestServer> {
  const created = await createTestServer({ fixture: 'demo', gitDebounceMs: 60_000 });
  if (git) await seedGitWorkspace(created.root);
  servers.push(created);
  return created;
}

/** A valid 1×1 transparent PNG. The route only verifies the signature. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=',
  'base64',
);

const upload = (test: TestServer, body: Uint8Array, token = true): Promise<Response> =>
  test.req('/api/config/logo', {
    method: 'POST',
    headers: {
      'content-type': 'image/png',
      ...(token ? { 'x-ob-token': TEST_TOKEN } : {}),
    },
    body: Uint8Array.from(body).buffer,
  });

describe('business logo', () => {
  it('stores a PNG, updates config, and serves the same bytes', async () => {
    const test = await server();

    const response = await upload(test, new Uint8Array(PNG));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { config: { business: { logo: string } } };
    expect(body.config.business.logo).toBe(LOGO_FILE);

    expect(await readFile(join(test.root, LOGO_FILE))).toEqual(PNG);

    const served = await test.req('/api/logo');
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await served.arrayBuffer())).toEqual(PNG);

    const config = (await (await test.req('/api/config')).json()) as {
      config: { business: { logo: string } };
    };
    expect(config.config.business.logo).toBe(LOGO_FILE);
  });

  it('requires the mutation token', async () => {
    const test = await server();
    const response = await upload(test, new Uint8Array(PNG), false);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('invalid_token');
  });

  it('rejects a body that is not a PNG', async () => {
    const test = await server();
    const response = await upload(test, new TextEncoder().encode('<html>not an image</html>'));

    expect(response.status).toBe(422);
    const body = (await response.json()) as {
      error: { code: string; details?: { reason?: string } };
    };
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details?.reason).toBe('png_signature');
    await expect(stat(join(test.root, LOGO_FILE))).rejects.toThrow();
  });

  it('rejects a logo over 512 KB without touching the workspace', async () => {
    const test = await server();
    const oversized = new Uint8Array(MAX_LOGO_BYTES + 8);
    oversized.set(PNG);

    const response = await upload(test, oversized);
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe('payload_too_large');
    await expect(stat(join(test.root, LOGO_FILE))).rejects.toThrow();
  });

  it('removes the file and clears the reference', async () => {
    const test = await server();
    await upload(test, new Uint8Array(PNG));

    const removed = await test.mutate('DELETE', '/api/config/logo');
    expect(removed.status).toBe(200);
    const body = (await removed.json()) as { config: { business: { logo: string } } };
    expect(body.config.business.logo).toBe('');

    await expect(stat(join(test.root, LOGO_FILE))).rejects.toThrow();
    expect((await test.req('/api/logo')).status).toBe(404);
  });

  it('commits the logo and config together when commit-on-save is on', async () => {
    const test = await server(true);
    await upload(test, new Uint8Array(PNG));
    await test.git.flush();

    expect(await statusPorcelain(test.root)).toBe('');
    const tracked = (await git(test.root, ['ls-files'])).trim();
    expect(tracked).toContain(LOGO_FILE);
    expect(tracked).toContain('.ob/config.json');
    expect((await commitSubjects(test.root))[0]).toMatch(/^ob: save /);
  });
});
