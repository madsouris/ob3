import { createServer } from 'node:net';
import type { Server } from 'node:net';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { findAvailablePort, isPortFree } from '../../src/workspace/port.js';

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

async function occupyPort(): Promise<{ port: number; server: Server }> {
  const server = createServer();
  const port = await listen(server, 0);
  return { port, server };
}

// Some sandboxes forbid binding a socket. The suite is meaningful only where
// listening is permitted, so detect that once and skip instead of failing.
const canBind = await new Promise<boolean>((resolve) => {
  const probe = createServer();
  probe.once('error', () => resolve(false));
  probe.listen(0, '127.0.0.1', () => probe.close(() => resolve(true)));
});

describe.skipIf(!canBind)('port probing', () => {
  it('reports an occupied port as busy', async () => {
    const { port, server } = await occupyPort();
    expect(await isPortFree(port)).toBe(false);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await isPortFree(port)).toBe(true);
  });

  it('returns the preferred port when it is free', async () => {
    const { port, server } = await occupyPort();
    await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(await isPortFree(port)).toBe(true);
    expect(await findAvailablePort(port, { maxProbe: 5 })).toBe(port);
  });

  it('probes upward when the preferred port is taken', async () => {
    const { port, server } = await occupyPort();
    try {
      const found = await findAvailablePort(port, { maxProbe: 5 });
      expect(found).toBeGreaterThan(port);
      expect(found).toBeLessThanOrEqual(port + 5);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('fails when the whole probe range is unavailable', async () => {
    const { port, server } = await occupyPort();
    try {
      await expect(findAvailablePort(port, { maxProbe: 0 })).rejects.toThrow(/No free port/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
