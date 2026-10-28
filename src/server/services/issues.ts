import { createHash } from 'node:crypto';
import { readFile, rename } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { exists, writeFileAtomic } from '../../io/atomic.js';
import { PathEscapeError, resolveRecordPath } from '../../io/path-safety.js';
import { readRecordFile } from '../../io/reader.js';
import { rememberSelfWrite } from '../../io/self-writes.js';
import { parseFrontmatter, updateFrontmatter } from '../../model/frontmatter.js';
import { createId, type RecordPrefix } from '../../model/ids.js';
import type { Issue } from '../../model/issue.js';
import type { RecordType } from '../../model/schemas.js';
import type { AppContext } from '../context.js';
import { ApiError } from '../errors.js';

const IGNORED_FILE = '.ob/state/ignored-issues.json';

const PREFIX_BY_ROOT: Readonly<Record<string, RecordPrefix>> = {
  contacts: 'cnt',
  projects: 'proj',
  tasks: 'tsk',
  estimates: 'est',
  invoices: 'inv',
  documents: 'doc',
};

const TYPE_BY_ROOT: Readonly<Record<string, RecordType>> = {
  contacts: 'contact',
  projects: 'project',
  tasks: 'task',
  estimates: 'estimate',
  invoices: 'invoice',
  documents: 'document',
};

const resolveSchema = z.object({
  action: z.enum(['assign-id', 'adopt-path', 'ignore']),
  to: z.enum(['todo', 'doing', 'done']).optional(),
});

export interface PreviewPayload {
  readonly path: string;
  readonly raw: string | null;
  readonly frontmatter: Readonly<Record<string, unknown>> | null;
  readonly body: string | null;
  readonly reason?: string;
}

export interface ResolveResult {
  readonly action: string;
  readonly id?: string;
  readonly path?: string;
}

const hashOf = (text: string): string => createHash('sha256').update(text).digest('hex');

const safePath = (context: AppContext, relativePath: string): string => {
  try {
    return resolveRecordPath(context.workspace, relativePath);
  } catch (error) {
    if (error instanceof PathEscapeError) {
      throw new ApiError(400, 'path_escape', 'Issue path is not inside the workspace');
    }
    throw error;
  }
};

export const readIgnoredIssues = async (context: AppContext): Promise<Set<string>> => {
  try {
    const raw = await readFile(join(context.workspace, IGNORED_FILE), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
    }
  } catch {
    // Missing or corrupt file: treat as empty. It is local-only state.
  }
  return new Set();
};

const writeIgnoredIssues = async (context: AppContext, keys: Set<string>): Promise<void> => {
  await writeFileAtomic(
    join(context.workspace, IGNORED_FILE),
    `${JSON.stringify([...keys].sort(), null, 2)}\n`,
  );
};

export const listIssues = async (context: AppContext): Promise<Issue[]> => {
  const ignored = await readIgnoredIssues(context);
  return context.index.issues().filter((issue) => !ignored.has(issue.key));
};

const findIssue = async (context: AppContext, key: string): Promise<Issue> => {
  const issue = context.index.issues().find((entry) => entry.key === key);
  if (issue === undefined) throw new ApiError(404, 'unknown_issue', 'Unknown issue key');
  return issue;
};

export const previewIssue = async (
  context: AppContext,
  key: string,
): Promise<PreviewPayload> => {
  const issue = await findIssue(context, key);
  const file = await readRecordFile(safePath(context, issue.path));

  if (!file.ok) {
    return { path: issue.path, raw: null, frontmatter: null, body: null, reason: file.code };
  }

  try {
    const parsed = parseFrontmatter(file.value.text);
    return {
      path: issue.path,
      raw: file.value.text,
      frontmatter: parsed.data,
      body: parsed.split.body,
    };
  } catch {
    return {
      path: issue.path,
      raw: file.value.text,
      frontmatter: null,
      body: null,
      reason: 'parse-error',
    };
  }
};

const prefixForPath = (relativePath: string): RecordPrefix | null =>
  PREFIX_BY_ROOT[relativePath.split('/')[0] ?? ''] ?? null;

const typeForPath = (relativePath: string): RecordType | null =>
  TYPE_BY_ROOT[relativePath.split('/')[0] ?? ''] ?? null;

const pickOrphanTarget = async (context: AppContext, status: string, fileName: string): Promise<string> => {
  const extensionIndex = fileName.lastIndexOf('.');
  const stem = extensionIndex === -1 ? fileName : fileName.slice(0, extensionIndex);
  const extension = extensionIndex === -1 ? '' : fileName.slice(extensionIndex);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? fileName : `${stem}-${attempt + 1}${extension}`;
    const relativePath = `tasks/${status}/${candidate}`;
    if (!(await exists(safePath(context, relativePath)))) return relativePath;
  }

  throw new ApiError(409, 'conflict', 'Could not find a free filename in the target column');
};

export const resolveIssue = async (
  context: AppContext,
  key: string,
  input: unknown,
): Promise<ResolveResult> => {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(422, 'validation_failed', 'Invalid resolve payload', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const issue = await findIssue(context, key);

  if (parsed.data.action === 'ignore') {
    const ignored = await readIgnoredIssues(context);
    ignored.add(issue.key);
    await writeIgnoredIssues(context, ignored);
    return { action: 'ignore' };
  }

  if (parsed.data.action === 'assign-id') {
    if (issue.code !== 'missing-id') {
      throw new ApiError(409, 'conflict', 'This issue does not support "assign-id"');
    }

    const absolute = safePath(context, issue.path);
    const file = await readRecordFile(absolute);
    if (!file.ok) throw new ApiError(409, 'conflict', 'File could not be read');

    const prefix = prefixForPath(issue.path);
    const type = typeForPath(issue.path);
    if (prefix === null || type === null) {
      throw new ApiError(400, 'path_escape', 'Issue path is not inside a managed directory');
    }

    const id = createId(prefix);
    const now = new Date().toISOString();
    const existing = parseFrontmatter(file.value.text).data;
    const updated = updateFrontmatter(file.value.text, {
      ob_schema: 1,
      id,
      type,
      ...(typeof existing['created_at'] === 'string' ? {} : { created_at: now }),
      updated_at: now,
    });

    await writeFileAtomic(absolute, updated);
    rememberSelfWrite(issue.path, hashOf(updated));
    await context.index.applyChange(issue.path, { skipSelfWriteCheck: true });

    return { action: 'assign-id', id, path: issue.path };
  }

  if (issue.code !== 'orphan-task-path') {
    throw new ApiError(409, 'conflict', 'This issue does not support "adopt-path"');
  }

  const targetPath = await pickOrphanTarget(
    context,
    parsed.data.to ?? 'todo',
    basename(issue.path),
  );

  await rename(safePath(context, issue.path), safePath(context, targetPath));
  await context.index.applyBatch(
    { deletes: [issue.path], upserts: [targetPath] },
    { skipSelfWriteCheck: true },
  );

  return { action: 'adopt-path', path: targetPath };
};
