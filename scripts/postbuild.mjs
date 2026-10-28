// Post-build steps for the published package (docs/11-packaging.md):
//   1. copy the canonical demo workspace to dist/demo
//   2. make dist/cli/index.js executable with a node shebang
//   3. fail if the single-file UI is missing or not self-contained
//   4. fail if a banned import (js-yaml, ADR-04) leaked into dist
import { chmod, cp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(root, 'dist');
const cliPath = join(distDir, 'cli', 'index.js');
const htmlPath = join(distDir, 'client', 'index.html');
const demoSourceDir = join(root, 'fixtures', 'workspaces', 'demo');
const demoDestDir = join(distDir, 'demo');
const SHEBANG = '#!/usr/bin/env node\n';

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    }),
  );
  return files.flat();
}

// 1. demo workspace — the only workspace data shipped in the package
await rm(demoDestDir, { recursive: true, force: true });
await cp(demoSourceDir, demoDestDir, { recursive: true });
const demoFiles = await walk(demoDestDir);
if (!demoFiles.some((file) => file.endsWith(join('.ob', 'config.json')))) {
  throw new Error(`Demo workspace is incomplete: ${demoDestDir} has no .ob/config.json`);
}

// 2. CLI entry point
const cliSource = await readFile(cliPath, 'utf8');
if (!cliSource.startsWith('#!')) {
  await writeFile(cliPath, SHEBANG + cliSource, 'utf8');
}
await chmod(cliPath, 0o755);

// 3. single-file UI
const html = await readFile(htmlPath, 'utf8');
if (!html.includes('<div id="root">')) {
  throw new Error(`UI bundle looks wrong: ${htmlPath} has no #root element`);
}
if (/(?:src|href)="(?!data:|#)[^"]*\.(?:js|css)"/.test(html)) {
  throw new Error('UI bundle is not self-contained: external asset reference found');
}

// 4. banned imports
const files = await walk(distDir);
const offenders = [];
for (const file of files) {
  if (!file.endsWith('.js')) continue;
  const source = await readFile(file, 'utf8');
  if (/from\s+['"]js-yaml['"]|require\(['"]js-yaml['"]\)/.test(source)) offenders.push(file);
}
if (offenders.length > 0) {
  throw new Error(`Banned js-yaml import in build output:\n${offenders.join('\n')}`);
}

const sizes = await Promise.all(
  [
    { label: 'cli', path: cliPath },
    { label: 'ui', path: htmlPath },
  ].map(async ({ label, path }) => `${label}: ${((await stat(path)).size / 1024).toFixed(1)} KB`),
);

process.stdout.write(
  `build ok — ${sizes.join(', ')}, demo: ${demoFiles.length} files\n`,
);
