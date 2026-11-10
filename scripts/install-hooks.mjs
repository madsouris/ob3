import { execFileSync } from 'node:child_process';

/**
 * Enables the repository's git hooks (`core.hooksPath`) on install. The hook is
 * the local Playwright smoke test before a push; CI does not depend on it, and a
 * tarball install (no .git) exits silently.
 */
const git = (args) => execFileSync('git', args, { stdio: 'ignore' });

try {
  git(['rev-parse', '--git-dir']);
} catch {
  process.exit(0);
}

try {
  const current = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
    encoding: 'utf8',
  }).trim();
  if (current === '.githooks') process.exit(0);
} catch {
  // No hooks path configured yet.
}

try {
  git(['config', 'core.hooksPath', '.githooks']);
  console.log('ob: git hooks enabled (.githooks) — pre-push runs `pnpm test:e2e`');
} catch {
  console.warn('ob: run `git config core.hooksPath .githooks` to enable the pre-push test');
}
