import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Playwright's `webServer`. Seeds a throwaway demo workspace in the OS temp dir
 * and starts the built CLI on a fixed port, so the browser test never touches
 * the user's own workspace and every run starts from the same files.
 */
const port = process.argv[2] ?? '19871';
const cli = join(process.cwd(), 'dist/cli/index.js');
const workspace = mkdtempSync(join(tmpdir(), 'ob-e2e-'));

execFileSync(process.execPath, [cli, 'init', workspace, '--demo', '--no-git'], {
  stdio: 'inherit',
});

const child = spawn(process.execPath, [cli, workspace, '--port', port, '--no-open'], {
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on('exit', (code) => process.exit(code ?? 0));
