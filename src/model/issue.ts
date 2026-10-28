export const ISSUE_CODES = [
  'parse-error',
  'unreadable',
  'too-large',
  'missing-id',
  'duplicate-id',
  'duplicate-number',
  'schema-invalid',
  'orphan-task-path',
  'dangling-ref',
  'conflict-marker',
] as const;

export type IssueCode = (typeof ISSUE_CODES)[number];
export type IssueSeverity = 'error' | 'warning';

export const ISSUE_ACTIONS = ['assign-id', 'adopt-path', 'preview', 'ignore', 'open-folder'] as const;
export type IssueAction = (typeof ISSUE_ACTIONS)[number];

export interface Issue {
  readonly key: string;
  readonly code: IssueCode;
  readonly severity: IssueSeverity;
  readonly path: string;
  readonly id?: string;
  readonly message: string;
  readonly detail?: string;
  readonly actions: readonly IssueAction[];
}

/** Stable identity for an issue: same code + path (+ id) never duplicates. */
export const issueKey = (code: IssueCode, path: string, id?: string): string =>
  id === undefined ? `${code}:${path}` : `${code}:${path}:${id}`;

export interface IssueInput {
  readonly code: IssueCode;
  readonly path: string;
  readonly id?: string;
  readonly message: string;
  readonly detail?: string;
  readonly severity?: IssueSeverity;
  readonly actions?: readonly IssueAction[];
}

const DEFAULT_SEVERITY: Readonly<Record<IssueCode, IssueSeverity>> = {
  'parse-error': 'error',
  unreadable: 'error',
  'too-large': 'error',
  'missing-id': 'error',
  'duplicate-id': 'error',
  'duplicate-number': 'warning',
  'schema-invalid': 'warning',
  'orphan-task-path': 'error',
  'dangling-ref': 'warning',
  'conflict-marker': 'error',
};

const DEFAULT_ACTIONS: Readonly<Record<IssueCode, readonly IssueAction[]>> = {
  'parse-error': ['preview', 'open-folder', 'ignore'],
  unreadable: ['preview', 'open-folder', 'ignore'],
  'too-large': ['open-folder', 'ignore'],
  'missing-id': ['assign-id', 'preview', 'ignore'],
  'duplicate-id': ['preview', 'open-folder', 'ignore'],
  'duplicate-number': ['preview', 'ignore'],
  'schema-invalid': ['preview', 'ignore'],
  'orphan-task-path': ['adopt-path', 'preview', 'ignore'],
  'dangling-ref': ['preview', 'ignore'],
  'conflict-marker': ['preview', 'open-folder', 'ignore'],
};

export const createIssue = (input: IssueInput): Issue => ({
  key: issueKey(input.code, input.path, input.id),
  code: input.code,
  severity: input.severity ?? DEFAULT_SEVERITY[input.code],
  path: input.path,
  ...(input.id === undefined ? {} : { id: input.id }),
  message: input.message,
  ...(input.detail === undefined ? {} : { detail: input.detail }),
  actions: input.actions ?? DEFAULT_ACTIONS[input.code],
});
