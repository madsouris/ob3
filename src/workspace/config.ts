import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { exists, writeFileAtomic } from '../io/atomic.js';
import { CONFIG_FILE, workspacePath } from './paths.js';

/** Schema/spec generation written into new configs (brief.md §5.1). */
export const CONFIG_VERSION = '1.1.0';

const businessSchema = z
  .object({
    name: z.string().default(''),
    email: z.string().default(''),
    address: z.string().default(''),
    phone: z.string().default(''),
    tax_rate_bps: z.number().int().min(0).max(10_000).default(0),
    currency: z
      .string()
      .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO code')
      .default('USD'),
    payment_link_url: z.string().default(''),
    /** Workspace-relative PNG path; `.ob/assets/logo.png` when set. */
    logo: z.string().default(''),
  })
  .passthrough();

const serverSchema = z
  .object({
    port: z.number().int().min(1).max(65_535).default(19_731),
  })
  .passthrough();

const gitSchema = z
  .object({
    commit_on_save: z.boolean().default(true),
  })
  .passthrough();

export const configSchema = z
  .object({
    version: z.string().default(CONFIG_VERSION),
    business: businessSchema.default({}),
    default_terms_document: z.string().nullable().default(null),
    server: serverSchema.default({}),
    git: gitSchema.default({}),
  })
  .passthrough();

export type ObConfig = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  override name = 'ConfigError';
  constructor(
    message: string,
    readonly filePath: string,
  ) {
    super(message);
  }
}

export function defaultConfig(): ObConfig {
  return configSchema.parse({});
}

export async function readConfig(root: string): Promise<ObConfig> {
  const filePath = workspacePath(root, CONFIG_FILE);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    throw new ConfigError(`Cannot read ${CONFIG_FILE}`, filePath);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ConfigError(
      `Invalid JSON in ${CONFIG_FILE}: ${error instanceof Error ? error.message : String(error)}`,
      filePath,
    );
  }

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new ConfigError(`Invalid ${CONFIG_FILE}: ${details}`, filePath);
  }
  return result.data;
}

export async function writeConfig(
  root: string,
  config: ObConfig,
  options: { exclusive?: boolean } = {},
): Promise<void> {
  await writeFileAtomic(
    workspacePath(root, CONFIG_FILE),
    `${JSON.stringify(config, null, 2)}\n`,
    options,
  );
}

/** Shallow-merges a partial config (business/server/git are merged one level deep). */
export const mergeConfig = (current: ObConfig, patch: unknown): ObConfig => {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    throw new ConfigError('Config patch must be a JSON object', CONFIG_FILE);
  }

  const incoming = patch as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...current };

  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'version') continue;
    const existing = (current as Record<string, unknown>)[key];
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof existing === 'object' &&
      existing !== null &&
      !Array.isArray(existing)
    ) {
      merged[key] = { ...(existing as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      merged[key] = value;
    }
  }

  const result = configSchema.safeParse(merged);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new ConfigError(`Invalid config patch: ${details}`, CONFIG_FILE);
  }
  return result.data;
};

/** A workspace is initialized when `.ob/config.json` exists (doc 02). */
export async function isInitialized(root: string): Promise<boolean> {
  return exists(workspacePath(root, CONFIG_FILE));
}
