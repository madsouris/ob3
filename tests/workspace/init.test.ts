import { execFile } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { readConfig } from '../../src/workspace/config.js';
import { demoFiles } from '../../src/workspace/demo.js';
import { initWorkspace } from '../../src/workspace/init.js';
import { MANAGED_DIRS } from '../../src/workspace/paths.js';
import { listFiles, makeTempDir, removeTempDir } from '../helpers/tmp.js';

const exec = promisify(execFile);

let temp: string | null = null;

afterEach(async () => {
  if (temp !== null) await removeTempDir(temp);
  temp = null;
});

async function workspace(): Promise<string> {
  temp = await makeTempDir();
  return temp;
}

function frontmatter(content: string): Record<string, unknown> {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (match?.[1] === undefined) throw new Error('no frontmatter');
  return parse(match[1]) as Record<string, unknown>;
}

describe('initWorkspace — empty', () => {
  it('creates folders, config and .gitignore without records', async () => {
    const root = await workspace();
    const result = await initWorkspace({ root, mode: 'empty', git: false });

    expect(result.filesWritten).toBe(0);
    expect(result.gitInitialized).toBe(false);
    expect(result.warnings).toEqual([]);

    const files = await listFiles(root);
    expect(files).toEqual(['.gitignore', '.ob/config.json']);

    const config = await readConfig(root);
    expect(config.business.name).toBe('');
    expect(config.business.currency).toBe('USD');

    const gitignore = await readFile(join(root, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.ob/state/');

    for (const dir of MANAGED_DIRS) {
      const stats = await stat(join(root, dir));
      expect(stats.isDirectory()).toBe(true);
    }
  });

  it('does not initialize git when asked not to', async () => {
    const root = await workspace();
    await initWorkspace({ root, mode: 'empty', git: false });
    expect(await listFiles(root)).not.toContain('.git/HEAD');
  });
});

describe('initWorkspace — demo', () => {
  it('seeds every demo record with valid ids and correct money', async () => {
    const root = await workspace();
    const result = await initWorkspace({ root, mode: 'demo', git: false });

    expect(result.filesWritten).toBe(demoFiles().length);
    expect(result.filesSkipped).toBe(0);

    const files = await listFiles(root);
    expect(files).toHaveLength(demoFiles().length + 2); // + config + gitignore
    expect(files).toContain('tasks/todo/tsk_homepage-hero.md');
    expect(files).toContain('documents/doc_default-terms.md');

    const ids = new Set<string>();
    for (const file of demoFiles()) {
      const content = await readFile(join(root, file.path), 'utf8');
      const data = frontmatter(content);
      const id = data['id'];
      expect(typeof id).toBe('string');
      expect(id as string).toMatch(/^(cnt|proj|tsk|est|inv|doc)_[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(ids.has(id as string)).toBe(false);
      ids.add(id as string);

      if (data['type'] === 'task') {
        expect(data['status']).toBeUndefined();
      }
    }

    const invoice = frontmatter(await readFile(join(root, 'invoices/inv_2026-001.md'), 'utf8'));
    expect(invoice['subtotal_cents']).toBe(250_000);
    expect(invoice['tax_rate_bps']).toBe(850);
    expect(invoice['tax_amount_cents']).toBe(21_250);
    expect(invoice['total_cents']).toBe(271_250);

    const config = await readConfig(root);
    expect(config.business.name).toBe('Acme Digital Studio');
    expect(config.business.tax_rate_bps).toBe(850);
  });

  it('is idempotent — a second init neither duplicates nor overwrites', async () => {
    const root = await workspace();
    await initWorkspace({ root, mode: 'demo', git: false });
    const before = await listFiles(root);

    const second = await initWorkspace({ root, mode: 'demo', git: false });
    expect(second.filesWritten).toBe(0);
    expect(second.filesSkipped).toBe(demoFiles().length);
    expect(await listFiles(root)).toEqual(before);
  });

  it('keeps a hand-edited file and writes the demo record beside it', async () => {
    const root = await workspace();
    const target = join(root, 'contacts/cnt_acme-corp.md');
    await initWorkspace({ root, mode: 'empty', git: false });
    await writeFile(target, 'my own file\n');

    await initWorkspace({ root, mode: 'demo', git: false });

    expect(await readFile(target, 'utf8')).toBe('my own file\n');
    const files = await listFiles(root);
    expect(files).toContain('contacts/cnt_acme-corp-2.md');
  });
});

describe('initWorkspace — git', () => {
  it('initializes a repository with one initial commit', async () => {
    const root = await workspace();
    const result = await initWorkspace({
      root,
      mode: 'demo',
      git: true,
      gitIdentity: { name: 'Test User', email: 'test@example.com' },
    });

    expect(result.gitInitialized).toBe(true);
    const { stdout } = await exec('git', ['-C', root, 'rev-list', '--count', 'HEAD']);
    expect(stdout.trim()).toBe('1');

    const { stdout: status } = await exec('git', ['-C', root, 'status', '--porcelain']);
    expect(status.trim()).toBe('');
  });

  it('does not commit again when .git already exists', async () => {
    const root = await workspace();
    await exec('git', ['-C', root, 'init', '--quiet']);
    const result = await initWorkspace({ root, mode: 'empty', git: true });
    expect(result.gitInitialized).toBe(false);
  });
});
