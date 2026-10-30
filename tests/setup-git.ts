import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Git needs a user identity to commit, and `ob` reads it from git *config*, not
 * from `GIT_AUTHOR_*`. A CI runner has no global config, so `POST /api/git/init`
 * would correctly refuse with `identity_missing` and the suite would fail there
 * while passing on a developer laptop.
 *
 * Point every git subprocess (the app spawns git with `process.env`) at a
 * throwaway global config: identity and `init.defaultBranch` are then the same
 * on CI, macOS and Windows, and a developer's personal git setup can no longer
 * change a test result.
 */
const MARKER = 'ob-test-gitconfig-';

if (process.env['GIT_CONFIG_GLOBAL']?.includes(MARKER) !== true) {
  const directory = mkdtempSync(join(tmpdir(), MARKER));
  const configFile = join(directory, 'gitconfig');
  writeFileSync(
    configFile,
    [
      '[user]',
      '\tname = ob test',
      '\temail = ob-test@example.com',
      '[commit]',
      '\tgpgsign = false',
      '[init]',
      '\tdefaultBranch = main',
      '',
    ].join('\n'),
  );

  process.env['GIT_CONFIG_GLOBAL'] = configFile;
  // Ignore /etc/gitconfig too: a distro hook must not change a test result.
  process.env['GIT_CONFIG_NOSYSTEM'] = '1';

  process.once('exit', () => {
    rmSync(directory, { recursive: true, force: true });
  });
}
