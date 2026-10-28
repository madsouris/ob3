import type { ParsedArgs, WorkspaceCommand } from './args.js';
import { UsageError, parseArgs } from './args.js';
import { out } from './output.js';
import { printReport, runPreflight } from './preflight.js';
import { runStart } from './start.js';
import { USAGE, readPackageVersion } from './usage.js';
import { chooseInitMode } from './wizard.js';
import { isInitialized, readConfig } from '../workspace/config.js';
import { initWorkspace } from '../workspace/init.js';
import { WorkspaceBusyError, acquireLock, releaseLock } from '../workspace/lock.js';
import { resolveWorkspace } from '../workspace/paths.js';

type InitArgs = WorkspaceCommand;
type CheckArgs = Extract<ParsedArgs, { kind: 'check' }>;

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);

  switch (parsed.kind) {
    case 'help':
      process.stdout.write(USAGE);
      return 0;
    case 'version':
      process.stdout.write(`ob ${readPackageVersion()}\n`);
      return 0;
    case 'start':
      return runStart(parsed);
    case 'init':
      return runInit(parsed);
    case 'check':
      return runCheck(parsed);
    case 'sync':
      out.error('`ob sync` is not implemented yet (milestone M6). Use git directly for now.');
      return 1;
  }
}

async function runCheck(args: CheckArgs): Promise<number> {
  const root = resolveWorkspace(args.workspace ?? process.cwd());
  const report = await runPreflight({ workspace: root, requireGitIdentity: true });
  const initialized = await isInitialized(root);

  let configError: string | null = null;
  if (initialized) {
    try {
      await readConfig(root);
    } catch (error) {
      configError = error instanceof Error ? error.message : String(error);
    }
  }

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify(
        { workspace: root, ok: !report.failed && configError === null, initialized, configError, checks: report.results },
        null,
        2,
      )}\n`,
    );
  } else {
    printReport(report);
    if (initialized) out.ok('Workspace is initialized');
    else out.warn('No workspace found (.ob/config.json missing)');
    if (configError !== null) out.fail(configError);
  }

  return report.failed || configError !== null ? 1 : 0;
}

async function runInit(args: InitArgs): Promise<number> {
  const root = resolveWorkspace(args.workspace ?? process.cwd());
  const report = await runPreflight({ workspace: root, requireGitIdentity: args.git });
  printReport(report);
  if (report.failed) return 1;

  const alreadyInitialized = await isInitialized(root);
  let mode = args.mode;
  if (!alreadyInitialized && mode === undefined) {
    if (!process.stdin.isTTY) {
      out.error('Workspace is not initialized and no terminal is attached. Pass --demo or --empty.');
      return 1;
    }
    out.line();
    const choice = await chooseInitMode();
    if (choice === 'exit') {
      out.dim('Nothing to do.');
      return 0;
    }
    mode = choice;
  }

  try {
    const lock = await acquireLock(root, { pid: process.pid });
    if (lock.reclaimedPid !== null) {
      out.warn(`Reclaimed a stale lock from PID ${lock.reclaimedPid}.`);
    }
    try {
      const result = await initWorkspace({ root, mode: mode ?? 'empty', git: args.git });
      out.line();
      if (alreadyInitialized) {
        out.ok('Workspace already initialized — existing files were left untouched');
      } else {
        out.ok(`Workspace initialized (${mode ?? 'empty'})`);
      }
      if (result.filesWritten > 0) out.ok(`Seeded ${result.filesWritten} demo records`);
      if (result.filesSkipped > 0) out.dim(`Skipped ${result.filesSkipped} existing demo records`);
      if (result.gitInitialized) out.ok('Git repository initialized with an initial commit');
      for (const warning of result.warnings) out.warn(warning);
      return 0;
    } finally {
      await releaseLock(root);
    }
  } catch (error) {
    if (error instanceof WorkspaceBusyError) {
      out.error(error.message);
      return 1;
    }
    throw error;
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exit(code);
  })
  .catch((error: unknown) => {
    if (error instanceof UsageError) {
      out.error(error.message);
      process.stderr.write(`\n${USAGE}`);
      process.exit(2);
    }
    if (error instanceof WorkspaceBusyError) {
      out.error(error.message);
      process.exit(1);
    }
    out.error(error instanceof Error ? error.message : String(error));
    if (process.env['OB_DEBUG'] !== undefined && error instanceof Error && error.stack !== undefined) {
      process.stderr.write(`${error.stack}\n`);
    }
    process.exit(1);
  });
