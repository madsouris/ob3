import { describe, expect, it } from 'vitest';
import {
  isOrphanTaskPath,
  pathForTaskStatus,
  taskFolder,
  taskStatusFromPath,
} from '../../src/model/task-status.js';

describe('task status comes from the folder', () => {
  it.each([
    ['tasks/todo/tsk_a.md', 'todo'],
    ['tasks/doing/tsk_b.md', 'doing'],
    ['tasks/done/tsk_c.md', 'done'],
  ])('reads %s as %s', (path, expected) => {
    expect(taskStatusFromPath(path)).toBe(expected);
  });

  it.each([
    ['tasks/tsk_orphan.md'],
    ['tasks/archive/tsk_x.md'],
    ['projects/proj_x.md'],
    ['tasks/todo/nested/tsk_x.md'],
    ['tasks/todo/tsk_x.txt'],
    ['tasks/todo'],
  ])('returns null for %s', (path) => {
    expect(taskStatusFromPath(path)).toBeNull();
  });

  it('builds paths', () => {
    expect(taskFolder('doing')).toBe('tasks/doing');
    expect(pathForTaskStatus('done', 'tsk_a.md')).toBe('tasks/done/tsk_a.md');
  });

  it('detects orphan task paths', () => {
    expect(isOrphanTaskPath('tasks/tsk_x.md')).toBe(true);
    expect(isOrphanTaskPath('tasks/todo/tsk_x.md')).toBe(false);
    expect(isOrphanTaskPath('projects/tsk_x.md')).toBe(false);
  });
});
