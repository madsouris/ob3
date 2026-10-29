import { describe, expect, it } from 'vitest';
import { configSchema } from '../../src/workspace/config.js';
import { DemoSourceError, demoFiles, resolveDemoDir } from '../../src/workspace/demo.js';

const files = await demoFiles();
const records = files.filter((file) => file.path.endsWith('.md'));

describe('demo fixture', () => {
  it('resolves the canonical directory', () => {
    const dir = resolveDemoDir();
    expect(dir).not.toBeNull();
    expect(dir).toMatch(/fixtures[/\\]workspaces[/\\]demo$/);
  });

  it('contains the workspace config and 15 records', () => {
    expect(files.map((file) => file.path)).toContain('.ob/config.json');
    expect(records).toHaveLength(15);
  });

  it('has a valid, non-empty workspace config', () => {
    const configFile = files.find((file) => file.path === '.ob/config.json');
    expect(configFile).toBeDefined();
    const parsed = configSchema.safeParse(JSON.parse(configFile?.content ?? '{}'));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.business.name).toBe('Acme Digital Studio');
      expect(parsed.data.business.tax_rate_bps).toBe(850);
      expect(parsed.data.default_terms_document).toBe('documents/doc_default-terms.md');
    }
  });

  it('only uses managed directories and POSIX relative paths', () => {
    const allowed = [
      'contacts/',
      'projects/',
      'tasks/todo/',
      'tasks/doing/',
      'tasks/done/',
      'estimates/',
      'invoices/',
      'documents/',
      '.ob/',
    ];
    for (const file of files) {
      expect(file.path).not.toContain('\\');
      expect(file.path.startsWith('/')).toBe(false);
      expect(allowed.some((prefix) => file.path.startsWith(prefix))).toBe(true);
    }
  });

  it('is sorted and free of runtime state', () => {
    const paths = files.map((file) => file.path);
    expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b)));
    expect(paths.some((path) => path.startsWith('.ob/state'))).toBe(false);
    expect(paths).not.toContain('.gitignore');
  });

  it('every record starts with a frontmatter block', () => {
    for (const record of records) {
      expect(record.content.startsWith('---\n')).toBe(true);
      expect(record.content).toMatch(/\n---\n/);
    }
  });
});

describe('demo source errors', () => {
  it('throws DemoSourceError when the directory does not exist', async () => {
    await expect(demoFiles('/definitely/not/here')).rejects.toBeInstanceOf(DemoSourceError);
  });
});
