/** Task status is the containing folder — never a frontmatter field (ADR-03). */
export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

const TASK_FILE_PATTERN = /^tasks\/(todo|doing|done)\/[^/]+\.md$/;

export const taskStatusFromPath = (relativePath: string): TaskStatus | null => {
  const match = TASK_FILE_PATTERN.exec(relativePath);
  return match?.[1] === undefined ? null : (match[1] as TaskStatus);
};

export const taskFolder = (status: TaskStatus): string => `tasks/${status}`;

export const pathForTaskStatus = (status: TaskStatus, fileName: string): string =>
  `${taskFolder(status)}/${fileName}`;

export const isTaskPath = (relativePath: string): boolean =>
  relativePath === 'tasks' || relativePath.startsWith('tasks/');

/** A task file that sits at `tasks/<file>.md` (outside a column folder). */
export const isOrphanTaskPath = (relativePath: string): boolean =>
  /^tasks\/[^/]+\.md$/.test(relativePath);
