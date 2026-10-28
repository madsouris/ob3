import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import type { Hono } from 'hono';
import type { InitMode } from './args.js';
import { openBrowser } from './browser.js';
import { out } from './output.js';
import { printReport, runPreflight } from './preflight.js';
import { readPackageVersion } from './usage.js';
import { chooseInitMode } from './wizard.js';
import { createApp } from '../server/app.js';
import type { WorkspaceRuntime } from '../server/runtime.js';
import { createWorkspaceRuntime } from '../server/runtime.js';
import { isInitialized, readConfig } from '../workspace/config.js';
import { initWorkspace } from '../workspace/init.js';
import { WorkspaceBusyError, acquireLock, releaseLock } from '../workspace/lock.js';
import { MANAGED_DIRS, resolveWorkspace } from '../workspace/paths.js';
import { LOOPBACK, findAvailablePort } from '../workspace/port.js';
import { createToken, writeSession } from '../workspace/session.js';

export type StartOptions = {
  workspace: string | undefined;
  mode: InitMode | undefined;
  port: number | undefined;
  git: boolean;
  open: boolean;
  verbose: boolean;
};

/**
 * Full start sequence (docs/01-cli-and-preflight.md):
 * pre-flight → lock → init if needed → config → index+watcher → port → server
 * → session → browser. Resolves only when the server shuts down.
 */
export async function runStart(options: StartOptions): Promise<number> {
  const root = resolveWorkspace(options.workspace ?? process.cwd());

  out.line();
  out.dim(`ob ${readPackageVersion()} — local-first CRM`);
  out.dim(root);
  out.line();

  const report = await runPreflight({ workspace: root, requireGitIdentity: options.git });
  printReport(report);
  if (report.failed) {
    out.error('Pre-flight checks failed. Fix the items above and retry.');
    return 1;
  }

  let server: ServerType | null = null;
  let runtime: WorkspaceRuntime | null = null;
  let shutdownStarted = false;
  let settle: (code: number) => void = () => undefined;
  const settled = new Promise<number>((resolve) => {
    settle = resolve;
  });

  const shutdown = (code: number): void => {
    if (shutdownStarted) return;
    shutdownStarted = true;

    const finish = (): void => {
      settle(code);
    };

    const closeRuntime = (): void => {
      if (runtime === null) {
        void releaseLock(root).finally(finish);
        return;
      }
      void runtime
        .close()
        .catch(() => undefined)
        .finally(() => {
          void releaseLock(root).finally(finish);
        });
    };

    if (server === null) {
      closeRuntime();
      return;
    }
    server.close(closeRuntime);
  };

  process.once('SIGINT', () => {
    out.line();
    out.dim('Shutting down…');
    shutdown(0);
  });
  process.once('SIGTERM', () => shutdown(0));

  try {
    const lock = await acquireLock(root, { pid: process.pid });
    if (lock.reclaimedPid !== null) {
      out.warn(`Reclaimed a stale lock from PID ${lock.reclaimedPid}.`);
    }

    if (await isInitialized(root)) {
      for (const dir of MANAGED_DIRS) {
        await mkdir(join(root, dir), { recursive: true });
      }
    } else {
      let mode = options.mode;
      if (mode === undefined) {
        if (!process.stdin.isTTY) {
          out.error('Workspace is not initialized and no terminal is attached. Pass --demo or --empty.');
          await releaseLock(root);
          return 1;
        }
        out.line();
        const choice = await chooseInitMode();
        if (choice === 'exit') {
          out.dim('Nothing to do.');
          await releaseLock(root);
          return 0;
        }
        mode = choice;
      }

      out.line();
      const result = await initWorkspace({ root, mode, git: options.git });
      out.ok(`Workspace initialized (${mode})`);
      if (result.filesWritten > 0) out.ok(`Seeded ${result.filesWritten} demo files`);
      if (result.filesSkipped > 0) out.dim(`Skipped ${result.filesSkipped} existing demo files`);
      if (result.gitInitialized) out.ok('Git repository initialized with an initial commit');
      for (const warning of result.warnings) out.warn(warning);
    }

    const config = await readConfig(root);
    const port = await findAvailablePort(options.port ?? config.server.port);

    runtime = await createWorkspaceRuntime({ root });
    const records = runtime.index.list().length;
    const issues = runtime.index.issues().length;
    out.ok(`Indexed ${records} records${issues > 0 ? ` (${issues} need attention)` : ''}`);

    const token = createToken();
    const app = createApp({
      workspace: root,
      version: readPackageVersion(),
      startedAt: Date.now(),
      token,
      port,
      index: runtime.index,
      bus: runtime.bus,
    });

    server = await listen(app, port);

    await writeSession(root, {
      token,
      port,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });

    const url = `http://${LOOPBACK}:${port}`;
    out.line();
    out.info(`Listening on ${url}`);
    if (options.open) {
      if (openBrowser(url)) out.dim('Opening browser… (press Ctrl+C to stop)');
      else out.warn(`Could not open a browser automatically. Visit ${url}`);
    } else {
      out.dim('Press Ctrl+C to stop.');
    }

    return await settled;
  } catch (error) {
    if (runtime !== null) await runtime.close().catch(() => undefined);
    await releaseLock(root);

    if (error instanceof WorkspaceBusyError) {
      out.error(error.message);
      out.dim('Stop the running instance, or start a different workspace.');
      return 1;
    }
    throw error;
  }
}

function listen(app: Hono, port: number): Promise<ServerType> {
  return new Promise<ServerType>((resolve, reject) => {
    const instance = serve({ fetch: app.fetch, hostname: LOOPBACK, port }, () => resolve(instance));
    instance.once('error', reject);
  });
}
