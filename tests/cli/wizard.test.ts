import { describe, expect, it } from 'vitest';
import { parseChoice } from '../../src/cli/wizard.js';

describe('parseChoice', () => {
  it.each([
    ['1', 'demo'],
    ['2', 'empty'],
    ['3', 'exit'],
    ['demo', 'demo'],
    ['EMPTY', 'empty'],
    [' exit ', 'exit'],
    ['q', 'exit'],
  ])('maps %s to %s', (input, expected) => {
    expect(parseChoice(input)).toBe(expected);
  });

  it('returns null for anything unrecognized', () => {
    for (const input of ['', '0', '4', 'yes', 'demo!']) {
      expect(parseChoice(input)).toBeNull();
    }
  });
});
