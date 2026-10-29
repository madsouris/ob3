import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ApiRecordOf } from '@/lib/api';
import { formatDate, formatToday } from '@/lib/format';
import { recordTitle } from '@/lib/workspace';

export type TaskStatus = 'todo' | 'doing' | 'done';

export interface TaskMove {
  readonly to: TaskStatus;
  readonly beforeId?: string;
  readonly afterId?: string;
}

const COLUMNS: ReadonlyArray<{ status: TaskStatus; label: string; hint: string }> = [
  { status: 'todo', label: 'To do', hint: 'tasks/todo' },
  { status: 'doing', label: 'Doing', hint: 'tasks/doing' },
  { status: 'done', label: 'Done', hint: 'tasks/done' },
];

interface TaskCardProps {
  readonly task: ApiRecordOf<'task'>;
  readonly projectName: string | null;
  readonly showProject: boolean;
  readonly dragging: boolean;
  /** Neighbours in the same column, for the keyboard reorder path. */
  readonly previousId: string | null;
  readonly nextId: string | null;
  readonly onOpen: (id: string) => void;
  readonly onMove: (id: string, move: TaskMove) => void;
  readonly onDragStart: (id: string) => void;
  readonly onDragEnd: () => void;
  readonly onDropBefore: (id: string, status: TaskStatus) => void;
}

const TaskCard = ({
  task,
  projectName,
  showProject,
  dragging,
  previousId,
  nextId,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
  onDropBefore,
}: TaskCardProps) => {
  const status = task.status ?? 'todo';
  const due = task.due_date;
  const overdue = due !== '' && due.slice(0, 10) < formatToday() && status !== 'done';
  const targets = COLUMNS.filter((column) => column.status !== status);

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', task.id);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDropBefore(task.id, status);
      }}
      className={cn(
        'flex flex-col gap-2 rounded-md border bg-card p-3 shadow-xs transition-opacity',
        dragging && 'opacity-50',
      )}
    >
      <button
        type="button"
        className="text-left text-sm font-medium hover:underline"
        onClick={() => onOpen(task.id)}
      >
        {recordTitle(task)}
      </button>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {showProject && projectName !== null ? (
          <span className="truncate">{projectName}</span>
        ) : null}
        {due === '' ? null : (
          <Badge variant={overdue ? 'destructive' : 'outline'}>{formatDate(due)}</Badge>
        )}
        {task.project_id === '' && !showProject ? (
          <span className="text-muted-foreground">No project</span>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="xs" onClick={() => onOpen(task.id)}>
          Open
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs">
              Move to…
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Column</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {targets.map((target) => (
              <DropdownMenuItem
                key={target.status}
                onSelect={() => onMove(task.id, { to: target.status })}
              >
                {target.label}
              </DropdownMenuItem>
            ))}
            {previousId === null && nextId === null ? null : (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Order in column</DropdownMenuLabel>
                {previousId === null ? null : (
                  <DropdownMenuItem
                    onSelect={() => onMove(task.id, { to: status, beforeId: previousId })}
                  >
                    Move up
                  </DropdownMenuItem>
                )}
                {nextId === null ? null : (
                  <DropdownMenuItem
                    onSelect={() => onMove(task.id, { to: status, afterId: nextId })}
                  >
                    Move down
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export interface TaskBoardProps {
  readonly tasks: readonly ApiRecordOf<'task'>[];
  readonly projects?: ReadonlyMap<string, string>;
  readonly showProject?: boolean;
  readonly onOpen: (id: string) => void;
  readonly onMove: (id: string, move: TaskMove) => void;
  readonly emptyHint?: string;
}

/**
 * Folder-derived columns. Drag a card onto another card to insert before it,
 * or onto a column to append. The "Move to…" menu is the keyboard path: it
 * changes column and reorders within the current one (docs/08).
 */
export const TaskBoard = ({
  tasks,
  projects,
  showProject = false,
  onOpen,
  onMove,
  emptyHint = 'Nothing here.',
}: TaskBoardProps) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const drop = (status: TaskStatus, beforeId?: string): void => {
    if (draggingId === null || draggingId === beforeId) {
      setDraggingId(null);
      return;
    }
    onMove(draggingId, beforeId === undefined ? { to: status } : { to: status, beforeId });
    setDraggingId(null);
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMNS.map((column) => {
        const columnTasks = tasks
          .filter((task) => (task.status ?? 'todo') === column.status)
          .sort((left, right) => left.order - right.order);

        return (
          <section
            key={column.status}
            aria-label={column.label}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              drop(column.status);
            }}
            className="flex min-h-40 flex-col gap-3 rounded-lg border bg-muted/30 p-3"
          >
            <header className="flex items-center justify-between gap-2 px-1">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{column.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{column.hint}</span>
              </div>
              <Badge variant="secondary">{columnTasks.length}</Badge>
            </header>

            <div className="flex flex-col gap-2">
              {columnTasks.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">{emptyHint}</p>
              ) : (
                columnTasks.map((task, index) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    projectName={projects?.get(task.project_id) ?? null}
                    showProject={showProject}
                    dragging={draggingId === task.id}
                    previousId={columnTasks[index - 1]?.id ?? null}
                    nextId={columnTasks[index + 1]?.id ?? null}
                    onOpen={onOpen}
                    onMove={onMove}
                    onDragStart={setDraggingId}
                    onDragEnd={() => setDraggingId(null)}
                    onDropBefore={(beforeId, status) => drop(status, beforeId)}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};
