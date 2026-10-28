import { readFileSync } from 'node:fs';

export const USAGE = `ob — local-first CRM

Usage:
  ob [path]                 Start the workspace server (initializing if needed)
  ob init [path]            Initialize a workspace only, no server
  ob sync [path]            Run: git add -> commit -> pull --rebase -> push
  ob check [path]           Pre-flight diagnostics only

Options:
  --port <n>     Preferred port (default 19731; probes upward when busy)
  --demo         Seed a demo workspace (skip the wizard)
  --empty        Create an empty workspace (skip the wizard)
  --no-git       Do not run git init during initialization
  --no-open      Do not open a browser
  --verbose      Verbose diagnostics on stderr
  -h, --help     Show this help and exit
  -v, --version  Show version and exit
`;

export type MetaAction = { kind: 'help' } | { kind: 'version' } | { kind: 'none' };

const HELP_FLAGS = new Set(['-h', '--help', 'help']);
const VERSION_FLAGS = new Set(['-v', '--version', 'version']);

/**
 * Resolves the two flags that must work before any workspace or dependency
 * check runs. Everything else belongs to M1 arg parsing.
 */
export function parseMetaArgs(argv: readonly string[]): MetaAction {
  const first = argv[0];
  if (first === undefined) return { kind: 'none' };
  if (HELP_FLAGS.has(first)) return { kind: 'help' };
  if (VERSION_FLAGS.has(first)) return { kind: 'version' };
  return { kind: 'none' };
}

/**
 * Reads the package version relative to a module URL. Works from both
 * `src/cli/` (tsx) and `dist/cli/` (published), because both sit two
 * directories below the package root.
 */
export function readPackageVersion(moduleUrl: string = import.meta.url): string {
  const pkgUrl = new URL('../../package.json', moduleUrl);
  const parsed: unknown = JSON.parse(readFileSync(pkgUrl, 'utf8'));
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'version' in parsed &&
    typeof (parsed as { version: unknown }).version === 'string'
  ) {
    return (parsed as { version: string }).version;
  }
  throw new Error(`No "version" field in ${pkgUrl.pathname}`);
}
