import { createServer } from 'node:net';
import { DEFAULT_PORT, PORT_PROBE_RANGE } from './paths.js';

export const LOOPBACK = '127.0.0.1';

type ProbeResult = { free: boolean; code?: string };

function probe(port: number, host: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once('error', (error: NodeJS.ErrnoException) => {
      resolve({ free: false, ...(error.code === undefined ? {} : { code: error.code }) });
    });
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve({ free: true }));
    });
  });
}

export async function isPortFree(port: number, host: string = LOOPBACK): Promise<boolean> {
  return (await probe(port, host)).free;
}

/**
 * Binds the preferred port, probing upward when it is taken (ADR-11). The
 * caller must print and open the port that was actually chosen.
 */
export async function findAvailablePort(
  preferred: number = DEFAULT_PORT,
  options: { host?: string; maxProbe?: number } = {},
): Promise<number> {
  const host = options.host ?? LOOPBACK;
  const maxProbe = options.maxProbe ?? PORT_PROBE_RANGE;
  const last = Math.min(preferred + maxProbe, 65_535);

  for (let port = preferred; port <= last; port += 1) {
    const result = await probe(port, host);
    if (result.free) return port;
    if (result.code === 'EPERM' || result.code === 'EACCES') {
      throw new Error(
        `Cannot bind ${host}:${port} (${result.code}). This environment forbids listening on local sockets; run ob outside the sandbox.`,
      );
    }
  }

  throw new Error(`No free port in range ${preferred}–${last} on ${host}`);
}
