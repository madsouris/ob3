import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PathEscapeError,
  isManagedRelativePath,
  normalizeRelativePath,
  resolveInWorkspace,
  resolveRecordPath,
} from '../../src/io/path-safety.js';
import { makeTempDir, removeTempDir } from '../helpers/tmp.js';

let temp: string | null = null;

afterEach(async () => {
  if (temp !== null) await removeTempDir(temp);
  temp = null;
});

async function workspace(): Promise<string> {
  temp = await makeTempDir();
  await mkdir(join(temp, 'contacts'), { recursive: true });
  return temp;
}

describe('normalizeRelativePath', () => {
  it('normalizes separators and collapses redundant segments', () => {
    expect(normalizeRelativePath('contacts\\cnt_a.md')).toBe('contacts/cnt_a.md');
    expect(normalizeRelativePath('./contacts//cnt_a.md')).toBe('contacts/cnt_a.md');
  });

  it.each(['/etc/passwd', 'C:\\Windows\\x', '../x', 'contacts/../../x', 'contacts/../..', '', '\0bad'])(
    'rejects %s',
    (input) => {
      expect(() => normalizeRelativePath(input)).toThrow(PathEscapeError);
    },
  );
});

describe('isManagedRelativePath', () => {
  it('accepts only managed roots', () => {
    expect(isManagedRelativePath('contacts/cnt_a.md')).toBe(true);
    expect(isManagedRelativePath('tasks/doing/tsk_a.md')).toBe(true);
    expect(isManagedRelativePath('documents/doc_a.md')).toBe(true);
    expect(isManagedRelativePath('.ob/config.json')).toBe(false);
    expect(isManagedRelativePath('src/cli/index.ts')).toBe(false);
  });
});

describe('resolveInWorkspace', () => {
  it('resolves a managed file inside the workspace', async () => {
    const root = await workspace();
    await writeFile(join(root, 'contacts/cnt_a.md'), 'x');
    expect(resolveInWorkspace(root, 'contacts/cnt_a.md')).toBe(join(root, 'contacts/cnt_a.md'));
  });

  it('allows a file that does not exist yet', async () => {
    const root = await workspace();
    expect(resolveInWorkspace(root, 'contacts/cnt_new.md')).toBe(join(root, 'contacts/cnt_new.md'));
  });

  it('rejects a traversal attempt', async () => {
    const root = await workspace();
    expect(() => resolveInWorkspace(root, 'contacts/../../outside.md')).toThrow(PathEscapeError);
  });

  it('rejects a symlinked directory that escapes the workspace', async () => {
    const root = await workspace();
    const outside = await makeTempDir('ob-outside-');
    await writeFile(join(outside, 'secret.md'), 'secret');
    try {
      await symlink(outside, join(root, 'contacts/escape'), 'dir');
    } catch {
      // Windows without developer mode cannot create symlinks; nothing to assert.
      await removeTempDir(outside);
      return;
    }

    expect(() => resolveInWorkspace(root, 'contacts/escape/secret.md')).toThrow(PathEscapeError);
    await removeTempDir(outside);
  });
});

describe('resolveRecordPath', () => {
  it('rejects paths outside the managed directories', async () => {
    const root = await workspace();
    expect(() => resolveRecordPath(root, '.ob/config.json')).toThrow(/outside the managed directories/);
    expect(() => resolveRecordPath(root, 'package.json')).toThrow(PathEscapeError);
  });

  it('accepts managed paths', async () => {
    const root = await workspace();
    expect(resolveRecordPath(root, 'contacts/cnt_a.md')).toContain('contacts');
  });
});
