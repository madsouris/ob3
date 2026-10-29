import { statfs } from 'node:fs/promises';
import { cpus, freemem, loadavg, platform, release, totalmem } from 'node:os';
import { Hono } from 'hono';
import type { AppContext } from '../context.js';

export interface DiskStats {
  readonly totalBytes: number;
  readonly freeBytes: number;
  readonly availableBytes: number;
}

export interface CpuStats {
  readonly cores: number;
  readonly model: string;
  readonly load1: number;
  readonly load5: number;
  readonly load15: number;
}

export interface MemoryStats {
  readonly totalBytes: number;
  readonly freeBytes: number;
  readonly rssBytes: number;
  readonly heapUsedBytes: number;
  readonly heapTotalBytes: number;
}

export interface SystemStats {
  readonly version: string;
  readonly workspace: string;
  readonly records: number;
  readonly generation: number;
  readonly uptimeSeconds: number;
  readonly node: string;
  readonly platform: string;
  readonly cpu: CpuStats;
  readonly memory: MemoryStats;
  /** `null` when the filesystem cannot report stats (some network mounts). */
  readonly disk: DiskStats | null;
}

const readDisk = async (path: string): Promise<DiskStats | null> => {
  try {
    const stats = await statfs(path);
    return {
      totalBytes: stats.bsize * stats.blocks,
      freeBytes: stats.bsize * stats.bfree,
      availableBytes: stats.bsize * stats.bavail,
    };
  } catch {
    return null;
  }
};

/**
 * Runtime and machine insight for Settings → Workspace (docs/07). Read-only and
 * cheap: no scan, no git call, nothing that can block on the network.
 */
export const readSystemStats = async (context: AppContext): Promise<SystemStats> => {
  const [load1 = 0, load5 = 0, load15 = 0] = loadavg();
  const processors = cpus();
  const usage = process.memoryUsage();

  return {
    version: context.version,
    workspace: context.workspace,
    records: context.index.list().length,
    generation: context.index.generation,
    uptimeSeconds: Math.max(0, Math.round((Date.now() - context.startedAt) / 1000)),
    node: process.version,
    platform: `${platform()} ${release()}`,
    cpu: {
      cores: processors.length,
      model: processors[0]?.model.trim() ?? 'unknown',
      // Windows always reports [0, 0, 0]; the UI renders them as-is.
      load1,
      load5,
      load15,
    },
    memory: {
      totalBytes: totalmem(),
      freeBytes: freemem(),
      rssBytes: usage.rss,
      heapUsedBytes: usage.heapUsed,
      heapTotalBytes: usage.heapTotal,
    },
    disk: await readDisk(context.workspace),
  };
};

export const createSystemRoutes = (context: AppContext): Hono => {
  const routes = new Hono();

  routes.get('/system', async (c) => c.json({ system: await readSystemStats(context) }));

  return routes;
};
