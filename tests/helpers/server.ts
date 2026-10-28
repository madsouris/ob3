import type { Hono } from 'hono';
import { RecordIndex } from '../../src/index/indexer.js';
import { createApp } from '../../src/server/app.js';
import type { AppContext } from '../../src/server/context.js';
import { createEventBus } from '../../src/server/events.js';
import { defaultConfig, writeConfig } from '../../src/workspace/config.js';
import { makeEmptyWorkspace, makeFixtureWorkspace } from './workspace.js';

export const TEST_TOKEN = 'test-token';
export const TEST_ORIGIN = 'http://127.0.0.1:19731';

export interface TestServer {
  readonly app: Hono;
  readonly context: AppContext;
  readonly root: string;
  readonly parent: string;
  readonly req: (path: string, init?: RequestInit) => Promise<Response>;
  readonly mutate: (method: string, path: string, body?: unknown) => Promise<Response>;
}

export async function createTestServer(options: { fixture?: string } = {}): Promise<TestServer> {
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

  const app = createApp(context);
  const url = (path: string): string => `${TEST_ORIGIN}${path}`;

  return {
    app,
    context,
    root: workspace.root,
    parent: workspace.parent,
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
