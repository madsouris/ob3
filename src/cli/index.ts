import { parseMetaArgs, readPackageVersion, USAGE } from './usage.js';

const action = parseMetaArgs(process.argv.slice(2));

if (action.kind === 'help') {
  process.stdout.write(USAGE);
  process.exit(0);
}

if (action.kind === 'version') {
  process.stdout.write(`ob ${readPackageVersion()}\n`);
  process.exit(0);
}

// M0 ships the shell only. Workspace startup, pre-flight and the init wizard
// land in M1 (see plan.md). Fail loudly instead of silently doing nothing.
process.stderr.write('ob: workspace startup is not implemented yet (milestone M1).\n\n');
process.stdout.write(USAGE);
process.exit(1);
