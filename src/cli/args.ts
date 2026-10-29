export type InitMode = 'demo' | 'empty';
export type Subcommand = 'init' | 'sync' | 'check' | 'start';

export class UsageError extends Error {
  override name = 'UsageError';
}

export type WorkspaceCommand = {
  kind: 'init' | 'start';
  workspace: string | undefined;
  mode: InitMode | undefined;
  port: number | undefined;
  git: boolean;
  open: boolean;
  verbose: boolean;
};

export type ParsedArgs =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'check'; workspace: string | undefined; verbose: boolean; json: boolean }
  | { kind: 'sync'; workspace: string | undefined; verbose: boolean; dryRun: boolean; allowParentRepo: boolean }
  | WorkspaceCommand;

const SUBCOMMANDS = new Set<string>(['init', 'sync', 'check']);

/**
 * Parses argv (without the node/script prefix).
 *
 *   ob [path] | ob init [path] | ob sync [path] | ob check [path]
 *   --port <n> --demo --empty --no-git --no-open --verbose -h -v
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  let mode: InitMode | undefined;
  let port: number | undefined;
  let git = true;
  let open = true;
  let verbose = false;
  let json = false;
  let dryRun = false;
  let allowParentRepo = false;
  const positionals: string[] = [];

  const setMode = (next: InitMode, flag: string): void => {
    if (mode !== undefined && mode !== next) {
      throw new UsageError(`--demo and --empty cannot be combined (saw ${flag})`);
    }
    mode = next;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === '-h' || arg === '--help' || arg === 'help') return { kind: 'help' };
    if (arg === '-v' || arg === '--version' || arg === 'version') return { kind: 'version' };

    switch (arg) {
      case '--demo':
        setMode('demo', arg);
        break;
      case '--empty':
        setMode('empty', arg);
        break;
      case '--no-git':
        git = false;
        break;
      case '--no-open':
        open = false;
        break;
      case '--verbose':
        verbose = true;
        break;
      case '--json':
        json = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--allow-parent-repo':
        allowParentRepo = true;
        break;
      case '--port': {
        const raw = argv[i + 1];
        if (raw === undefined) throw new UsageError('--port requires a value');
        const value = Number(raw);
        if (!Number.isInteger(value) || value < 1 || value > 65535) {
          throw new UsageError(`--port must be an integer between 1 and 65535 (got "${raw}")`);
        }
        port = value;
        i += 1;
        break;
      }
      default:
        if (arg.startsWith('-')) throw new UsageError(`Unknown flag: ${arg}`);
        positionals.push(arg);
    }
  }

  if (positionals.length > 2) {
    throw new UsageError(`Too many arguments: ${positionals.join(' ')}`);
  }

  const first = positionals[0];
  const hasSub = first !== undefined && SUBCOMMANDS.has(first);
  const subcommand: Subcommand = hasSub ? (first as Subcommand) : 'start';
  const workspace = hasSub ? positionals[1] : first;

  if (positionals.length === 2 && !hasSub) {
    throw new UsageError(`Unexpected argument: ${positionals[1]}`);
  }

  if (subcommand === 'check' || subcommand === 'sync') {
    if (mode !== undefined || port !== undefined) {
      throw new UsageError(`--demo/--empty/--port do not apply to "ob ${subcommand}"`);
    }
    if (subcommand === 'check') {
      if (dryRun) throw new UsageError('--dry-run only applies to "ob sync"');
      if (allowParentRepo) throw new UsageError('--allow-parent-repo only applies to "ob sync"');
      return { kind: 'check', workspace, verbose, json };
    }
    if (json) throw new UsageError('--json only applies to "ob check"');
    return { kind: 'sync', workspace, verbose, dryRun, allowParentRepo };
  }

  if (json) throw new UsageError('--json only applies to "ob check"');
  if (dryRun) throw new UsageError('--dry-run only applies to "ob sync"');
  if (allowParentRepo) throw new UsageError('--allow-parent-repo only applies to "ob sync"');

  return {
    kind: subcommand === 'init' ? 'init' : 'start',
    workspace,
    mode,
    port,
    git,
    open,
    verbose,
  };
}
