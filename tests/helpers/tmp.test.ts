import { realpath } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { makeTempDir, removeTempDir } from './tmp.js';

describe('makeTempDir', () => {
  it('returns a canonical, existing directory', async () => {
    const dir = await makeTempDir();
    try {
      expect(dir).toBe(await realpath(dir));
    } finally {
      await removeTempDir(dir);
    }
  });

  it('honours the prefix', async () => {
    const dir = await makeTempDir('ob-prefix-');
    try {
      expect(dir).toContain('ob-prefix-');
    } finally {
      await removeTempDir(dir);
    }
  });
});
