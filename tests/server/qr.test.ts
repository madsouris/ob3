import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG_FILE, QR_FILE } from '../../src/workspace/paths.js';
import { MAX_QR_BYTES } from '../../src/server/routes/assets.js';
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

/** The route only verifies the SOI/APP0 signature. */
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

const upload = (test: TestServer, body: Uint8Array, token = true): Promise<Response> =>
  test.req('/api/config/qr', {
    method: 'POST',
    headers: {
      'content-type': 'image/jpeg',
      ...(token ? { 'x-ob-token': TEST_TOKEN } : {}),
    },
    body: Uint8Array.from(body).buffer,
  });

interface ConfigBody {
  readonly config: {
    readonly business: {
      readonly payment: string;
      readonly payment_qr: string;
      readonly payment_link_url: string;
    };
  };
}

describe('payment QR', () => {
  it('stores a JPEG, switches the mode, and serves the same bytes', async () => {
    const test = await server();

    const response = await upload(test, new Uint8Array(JPEG));
    expect(response.status).toBe(200);
    const body = (await response.json()) as ConfigBody;
    expect(body.config.business.payment).toBe('qr');
    expect(body.config.business.payment_qr).toBe(QR_FILE);

    expect(await readFile(join(test.root, QR_FILE))).toEqual(JPEG);

    const served = await test.req('/api/qr');
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await served.arrayBuffer())).toEqual(JPEG);
  });

  it('overwrites the single qr.jpg instead of accumulating files', async () => {
    const test = await server();
    await upload(test, new Uint8Array(JPEG));

    const replacement = Buffer.concat([JPEG, Buffer.from([0x00, 0x01])]);
    await upload(test, new Uint8Array(replacement));

    const served = await test.req('/api/qr');
    expect(Buffer.from(await served.arrayBuffer())).toEqual(replacement);

    const files = await readdir(join(test.root, '.ob/assets'));
    expect(files.filter((name) => name.startsWith('qr'))).toEqual(['qr.jpg']);
  });

  it('requires the mutation token', async () => {
    const test = await server();
    const response = await upload(test, new Uint8Array(JPEG), false);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('invalid_token');
  });

  it('rejects a body that is not a JPEG', async () => {
    const test = await server();
    const response = await upload(test, new TextEncoder().encode('<html>not an image</html>'));

    expect(response.status).toBe(422);
    const body = (await response.json()) as {
      error: { code: string; details?: { reason?: string } };
    };
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details?.reason).toBe('jpeg_signature');
    await expect(stat(join(test.root, QR_FILE))).rejects.toThrow();
  });

  it('rejects an image over 512 KB without touching the workspace', async () => {
    const test = await server();
    const oversized = new Uint8Array(MAX_QR_BYTES + 8);
    oversized.set(JPEG);

    const response = await upload(test, oversized);
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe('payload_too_large');
    await expect(stat(join(test.root, QR_FILE))).rejects.toThrow();
  });

  it('removes the file and turns the printed payment block off', async () => {
    const test = await server();
    await upload(test, new Uint8Array(JPEG));

    const removed = await test.mutate('DELETE', '/api/config/qr');
    expect(removed.status).toBe(200);
    const body = (await removed.json()) as ConfigBody;
    expect(body.config.business.payment).toBe('');
    expect(body.config.business.payment_qr).toBe('');

    await expect(stat(join(test.root, QR_FILE))).rejects.toThrow();
    expect((await test.req('/api/qr')).status).toBe(404);
  });

  it('serves 404 before an image is uploaded', async () => {
    const test = await server();
    expect((await test.req('/api/qr')).status).toBe(404);
  });

  it('prints nothing for an unknown payment mode', async () => {
    const test = await server();
    const response = await test.mutate('PATCH', '/api/config', { business: { payment: 'cash' } });
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('validation_failed');
  });

  it('commits the QR and config together when commit-on-save is on', async () => {
    const test = await server(true);
    await upload(test, new Uint8Array(JPEG));
    await test.git.flush();

    expect(await statusPorcelain(test.root)).toBe('');
    const tracked = (await git(test.root, ['ls-files'])).trim();
    expect(tracked).toContain(QR_FILE);
    expect(tracked).toContain(CONFIG_FILE);
    expect((await commitSubjects(test.root))[0]).toMatch(/^ob: save /);
  });
});
