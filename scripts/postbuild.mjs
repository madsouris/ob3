// Post-build steps for the published package (docs/11-packaging.md):
//   1. make dist/cli/index.js executable with a node shebang
//   2. fail if the single-file UI is missing
//   3. fail if a banned import (js-yaml, ADR-04) leaked into dist
import { chmod, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = fileURLToPath(new URL('../dist', import.meta.url));
const cliPath = join(distDir, 'cli', 'index.js');
const htmlPath = join(distDir, 'client', 'index.html');
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

const cliSource = await readFile(cliPath, 'utf8');
if (!cliSource.startsWith('#!')) {
  await writeFile(cliPath, SHEBANG + cliSource, 'utf8');
}
await chmod(cliPath, 0o755);

const html = await readFile(htmlPath, 'utf8');
if (!html.includes('<div id="root">')) {
  throw new Error(`UI bundle looks wrong: ${htmlPath} has no #root element`);
}
if (/(?:src|href)="(?!data:|#)[^"]*\.(?:js|css)"/.test(html)) {
  throw new Error('UI bundle is not self-contained: external asset reference found');
}

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

process.stdout.write(`build ok — dist/cli/index.js executable, ${sizes.join(', ')}\n`);
