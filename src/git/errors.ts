import type { GitFailureCode } from './types.js';

/** Raised by git operations that fail before a sync step can classify them. */
export class GitError extends Error {
  override name = 'GitError';

  constructor(
    readonly code: GitFailureCode,
    message: string,
    readonly output?: string,
  ) {
    super(message);
  }
}
