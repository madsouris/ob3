import { unlink, readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import type { AppContext } from '../context.js';
import type { GitService } from '../../git/types.js';
import { ApiError } from '../errors.js';
import { writeBytesAtomic } from '../../io/atomic.js';
import { mergeConfig, readConfig, writeConfig } from '../../workspace/config.js';
import { CONFIG_FILE, LOGO_FILE, workspacePath } from '../../workspace/paths.js';

/** 512 KB is generous for a logo and keeps the config commit small. */
export const MAX_LOGO_BYTES = 512 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const isPng = (bytes: Uint8Array): boolean =>
  bytes.length >= PNG_SIGNATURE.length &&
  PNG_SIGNATURE.equals(Buffer.from(bytes.subarray(0, PNG_SIGNATURE.length)));

/**
 * Business logo. The file lives in the user's workspace at a fixed path so a
 * hostile `business.logo` value can never make the server read another file
 * (docs/07). Uploads are normalized to PNG by the client; the server still
 * validates the signature.
 */
export const createAssetRoutes = (context: AppContext, git?: GitService): Hono => {
  const routes = new Hono();

  routes.get('/logo', async (c) => {
    let bytes: Buffer;
    try {
      bytes = await readFile(workspacePath(context.workspace, LOGO_FILE));
    } catch {
      throw new ApiError(404, 'not_found', 'No logo is set');
    }

    return c.body(new Uint8Array(bytes), 200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache',
      'Content-Disposition': 'inline',
    });
  });

  routes.post('/config/logo', async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());

    if (bytes.length === 0) {
      throw new ApiError(422, 'validation_failed', 'Upload a PNG image');
    }
    if (bytes.length > MAX_LOGO_BYTES) {
      throw new ApiError(413, 'payload_too_large', 'Logo must be 512 KB or smaller');
    }
    if (!isPng(bytes)) {
      throw new ApiError(422, 'validation_failed', 'Logo must be a PNG image', {
        reason: 'png_signature',
      });
    }

    await writeBytesAtomic(workspacePath(context.workspace, LOGO_FILE), bytes);

    const merged = mergeConfig(await readConfig(context.workspace), {
      business: { logo: LOGO_FILE },
    });
    await writeConfig(context.workspace, merged);

    git?.scheduleCommit({ path: LOGO_FILE, label: 'logo' });
    git?.scheduleCommit({ path: CONFIG_FILE, label: 'config' });
    context.bus.publish('config.changed', { config: merged });

    return c.json({ config: merged });
  });

  routes.delete('/config/logo', async (c) => {
    await unlink(workspacePath(context.workspace, LOGO_FILE)).catch(() => undefined);

    const merged = mergeConfig(await readConfig(context.workspace), { business: { logo: '' } });
    await writeConfig(context.workspace, merged);

    git?.scheduleCommit({ path: LOGO_FILE, label: 'logo' });
    git?.scheduleCommit({ path: CONFIG_FILE, label: 'config' });
    context.bus.publish('config.changed', { config: merged });

    return c.json({ config: merged });
  });

  return routes;
};
