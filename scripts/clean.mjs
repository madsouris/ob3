// Removes the previous build so `tsc` never leaves stale artifacts in the
// package (for example source maps from an earlier build).
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

await rm(fileURLToPath(new URL('../dist', import.meta.url)), { recursive: true, force: true });
