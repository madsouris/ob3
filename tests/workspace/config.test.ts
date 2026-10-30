import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ConfigError,
  defaultConfig,
  isInitialized,
  readConfig,
  writeConfig,
} from '../../src/workspace/config.js';
import { makeTempDir, removeTempDir } from '../helpers/tmp.js';

let temp: string | null = null;

afterEach(async () => {
  if (temp !== null) await removeTempDir(temp);
  temp = null;
});

async function workspace(): Promise<string> {
  temp = await makeTempDir();
  return temp;
}

async function writeRawConfig(root: string, raw: string): Promise<void> {
  await mkdir(join(root, '.ob'), { recursive: true });
  await writeFile(join(root, '.ob/config.json'), raw);
}

describe('config defaults', () => {
  it('provides a valid empty-workspace config', () => {
    const config = defaultConfig();
    expect(config.version).toBe('1.1.0');
    expect(config.business.currency).toBe('USD');
    expect(config.business.tax_rate_bps).toBe(0);
    expect(config.business.payment).toBe('');
    expect(config.business.payment_qr).toBe('');
    expect(config.business.payment_link_url).toBe('');
    expect(config.server.port).toBe(19_731);
    expect(config.git.commit_on_save).toBe(true);
    expect(config.default_terms_document).toBeNull();
  });
});

describe('config read/write', () => {
  it('round-trips including unknown keys', async () => {
    const root = await workspace();
    await writeRawConfig(
      root,
      JSON.stringify({
        version: '1.1.0',
        business: { name: 'Studio', currency: 'EUR' },
        custom: { theme: 'dark' },
      }),
    );

    const config = await readConfig(root);
    expect(config.business.name).toBe('Studio');
    expect(config.business.currency).toBe('EUR');
    expect((config as Record<string, unknown>)['custom']).toEqual({ theme: 'dark' });

    await writeConfig(root, config);
    const again = await readConfig(root);
    expect((again as Record<string, unknown>)['custom']).toEqual({ theme: 'dark' });
  });

  it('applies defaults for missing optional sections', async () => {
    const root = await workspace();
    await writeRawConfig(root, JSON.stringify({ version: '1.1.0' }));

    const config = await readConfig(root);
    expect(config.business.currency).toBe('USD');
    expect(config.server.port).toBe(19_731);
  });

  it('isInitialized reflects the presence of .ob/config.json', async () => {
    const root = await workspace();
    expect(await isInitialized(root)).toBe(false);
    await writeConfig(root, defaultConfig());
    expect(await isInitialized(root)).toBe(true);
  });
});

describe('config errors', () => {
  it('rejects missing config', async () => {
    const root = await workspace();
    await expect(readConfig(root)).rejects.toBeInstanceOf(ConfigError);
  });

  it('rejects invalid JSON with the parse reason', async () => {
    const root = await workspace();
    await writeRawConfig(root, '{ nope');
    await expect(readConfig(root)).rejects.toThrow(/Invalid JSON in \.ob\/config\.json/);
  });

  it('rejects an invalid currency code', async () => {
    const root = await workspace();
    await writeRawConfig(root, JSON.stringify({ business: { currency: 'dollars' } }));
    await expect(readConfig(root)).rejects.toThrow(/business\.currency/);
  });

  it('rejects an out-of-range tax rate', async () => {
    const root = await workspace();
    await writeRawConfig(root, JSON.stringify({ business: { tax_rate_bps: 20_000 } }));
    await expect(readConfig(root)).rejects.toThrow(/tax_rate_bps/);
  });
});
