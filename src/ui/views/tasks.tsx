import { useState } from 'react';
import { ListTodoIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { TaskBoard, type TaskMove } from '@/components/task-board';
import { TaskEditor } from '@/components/task-editor';
import { api } from '@/lib/api';
import { navigate } from '@/lib/router';
import { recordTitle, useWorkspace } from '@/lib/workspace';

export interface TasksProps {
  readonly initialId: string | null;
}

/** Cross-project board. The primary flow is project → board (project workspace). */
export const Tasks = ({ initialId }: TasksProps) => {
  const { records, upsert } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const projectNames = new Map(
    records.project.map((project) => [project.id, recordTitle(project)] as const),
  );

  const move = async (id: string, moveTo: TaskMove): Promise<void> => {
    try {
      const response = await api.moveTask(id, moveTo);
      upsert(response.record);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not move the task');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="All tasks"
        description="Every task in the workspace. Open a project for its own board."
        actions={
          <Button onClick={() => setCreating(true)} size="sm">
            <PlusIcon data-icon="inline-start" />
            New task
          </Button>
        }
      />

      {records.task.length === 0 ? (
        <EmptyState
          icon={ListTodoIcon}
          title="No tasks yet"
          description="Create a task here, or open a project and add one to that project's board."
          action={
            <Button onClick={() => setCreating(true)} size="sm">
              <PlusIcon data-icon="inline-start" />
              New task
            </Button>
          }
        />
      ) : (
        <TaskBoard
          tasks={records.task}
          projects={projectNames}
          showProject
          onOpen={(id) => navigate(`tasks/${id}`)}
          onMove={(id, moveTo) => void move(id, moveTo)}
        />
      )}

      <TaskEditor
        taskId={initialId}
        open={creating || initialId !== null}
        onOpenChange={(next) => {
          if (next) return;
          setCreating(false);
          navigate('tasks');
        }}
      />
    </div>
  );
};
