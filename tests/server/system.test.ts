import { afterEach, describe, expect, it } from 'vitest';
import type { SystemStats } from '../../src/server/routes/system.js';
import { createTestServer } from '../helpers/server.js';
import type { TestServer } from '../helpers/server.js';
import { removeTempDir } from '../helpers/tmp.js';

let servers: TestServer[] = [];

afterEach(async () => {
  for (const server of servers) await removeTempDir(server.parent);
  servers = [];
});

const server = async (): Promise<TestServer> => {
  const created = await createTestServer({ fixture: 'demo', gitDebounceMs: 60_000 });
  servers.push(created);
  return created;
};

const readSystem = async (test: TestServer): Promise<SystemStats> => {
  const response = await test.req('/api/system');
  expect(response.status).toBe(200);
  return ((await response.json()) as { system: SystemStats }).system;
};

describe('GET /api/system', () => {
  it('reports runtime, memory, cpu and workspace facts', async () => {
    const test = await server();
    const system = await readSystem(test);

    expect(system.workspace).toBe(test.root);
    expect(system.version).toBe('0.0.0-test');
    expect(system.records).toBe(test.context.index.list().length);
    expect(system.generation).toBe(test.context.index.generation);
    expect(system.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(system.node.startsWith('v')).toBe(true);
    expect(system.platform.length).toBeGreaterThan(0);

    expect(system.cpu.cores).toBeGreaterThan(0);
    expect(system.cpu.load1).toBeGreaterThanOrEqual(0);
    expect(system.cpu.load5).toBeGreaterThanOrEqual(0);
    expect(system.cpu.load15).toBeGreaterThanOrEqual(0);

    expect(system.memory.totalBytes).toBeGreaterThan(0);
    expect(system.memory.freeBytes).toBeGreaterThanOrEqual(0);
    expect(system.memory.rssBytes).toBeGreaterThan(0);
    expect(system.memory.heapUsedBytes).toBeGreaterThan(0);
    expect(system.memory.heapTotalBytes).toBeGreaterThanOrEqual(system.memory.heapUsedBytes);
  });

  it('reports workspace disk usage when the filesystem supports it', async () => {
    const test = await server();
    const { disk } = await readSystem(test);

    if (disk === null) {
      // Some network mounts cannot answer statfs; the UI renders "Unavailable".
      expect(disk).toBeNull();
      return;
    }

    expect(disk.totalBytes).toBeGreaterThan(0);
    expect(disk.freeBytes).toBeGreaterThanOrEqual(0);
    expect(disk.availableBytes).toBeLessThanOrEqual(disk.totalBytes);
  });

  it('needs no mutation token', async () => {
    const test = await server();
    expect((await test.req('/api/system')).status).toBe(200);
  });
});
