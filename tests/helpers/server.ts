import type { Hono } from 'hono';
import { RecordIndex } from '../../src/index/indexer.js';
import { createGitService } from '../../src/git/service.js';
import type { GitService } from '../../src/git/types.js';
import { createApp } from '../../src/server/app.js';
import type { AppContext } from '../../src/server/context.js';
import { createEventBus } from '../../src/server/events.js';
import { defaultConfig, writeConfig } from '../../src/workspace/config.js';
import { makeEmptyWorkspace, makeFixtureWorkspace } from './workspace.js';

export const TEST_TOKEN = 'test-token';
export const TEST_ORIGIN = 'http://127.0.0.1:19731';

export interface TestServerOptions {
  readonly fixture?: string;
  /** Inject a service to make the debounce deterministic; otherwise one is created. */
  readonly git?: GitService;
  readonly gitDebounceMs?: number;
}

export interface TestServer {
  readonly app: Hono;
  readonly context: AppContext;
  readonly root: string;
  readonly parent: string;
  readonly git: GitService;
  readonly req: (path: string, init?: RequestInit) => Promise<Response>;
  readonly mutate: (method: string, path: string, body?: unknown) => Promise<Response>;
}

export async function createTestServer(options: TestServerOptions = {}): Promise<TestServer> {
  const workspace =
    options.fixture === undefined
      ? await makeEmptyWorkspace()
      : await makeFixtureWorkspace(options.fixture);

  if (options.fixture === undefined) {
    await writeConfig(workspace.root, defaultConfig());
  }

  const index = new RecordIndex({ root: workspace.root, retryDelaysMs: [] });
  await index.fullScan();

  const context: AppContext = {
    workspace: workspace.root,
    index,
    bus: createEventBus(),
    token: TEST_TOKEN,
    version: '0.0.0-test',
    startedAt: Date.now(),
    port: 19731,
  };

  const git =
    options.git ??
    createGitService({
      root: workspace.root,
      publisher: context.bus,
      debounceMs: options.gitDebounceMs ?? 50,
      statusCacheMs: 0,
    });

  const app = createApp(context, { git });
  const url = (path: string): string => `${TEST_ORIGIN}${path}`;

  return {
    app,
    context,
    root: workspace.root,
    parent: workspace.parent,
    git,
    req: async (path, init) => app.request(url(path), init),
    mutate: async (method, path, body) =>
      app.request(url(path), {
        method,
        headers: {
          'content-type': 'application/json',
          'x-ob-token': TEST_TOKEN,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
  };
}
