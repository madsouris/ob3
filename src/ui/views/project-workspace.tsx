import { useState } from 'react';
import { ArrowLeftIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { ProjectEditor } from '@/components/project-editor';
import { StatusBadge } from '@/components/status-badge';
import { TaskBoard, type TaskMove } from '@/components/task-board';
import { TaskEditor } from '@/components/task-editor';
import { api } from '@/lib/api';
import { formatDate, pluralize } from '@/lib/format';
import { navigate } from '@/lib/router';
import { recordTitle, useWorkspace } from '@/lib/workspace';

export interface ProjectWorkspaceProps {
  readonly projectId: string;
}

export const ProjectWorkspace = ({ projectId }: ProjectWorkspaceProps) => {
  const { records, loading, upsert } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);

  const project = records.project.find((item) => item.id === projectId) ?? null;
  const client =
    project === null
      ? null
      : (records.contact.find((contact) => contact.id === project.client_id) ?? null);
  const tasks = records.task.filter((task) => task.project_id === projectId);

  const move = async (id: string, moveTo: TaskMove): Promise<void> => {
    try {
      const response = await api.moveTask(id, moveTo);
      upsert(response.record);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not move the task');
    }
  };

  if (project === null) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('projects')}>
          <ArrowLeftIcon data-icon="inline-start" />
          All projects
        </Button>
        {loading ? null : (
          <Alert variant="destructive">
            <AlertTitle>Project not found</AlertTitle>
            <AlertDescription>
              This project was renamed or deleted. The filesystem is the source of truth; check
              projects/ in your workspace.
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  const open = tasks.filter((task) => task.status !== 'done').length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-auto self-start px-0 text-muted-foreground"
          onClick={() => navigate('projects')}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          All projects
        </Button>

        <PageHeader
          title={recordTitle(project)}
          description={
            client === null
              ? 'No client linked'
              : `${recordTitle(client)}${client.type === 'contact' && client.company !== '' ? ` · ${client.company}` : ''}`
          }
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <PencilIcon data-icon="inline-start" />
                Edit
              </Button>
              <Button size="sm" onClick={() => setCreatingTask(true)}>
                <PlusIcon data-icon="inline-start" />
                New task
              </Button>
            </>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={project.status} />
          <Badge variant="outline">{pluralize(tasks.length, 'task')}</Badge>
          <Badge variant="outline">{pluralize(open, 'open task')}</Badge>
          <Badge variant="outline">Updated {formatDate(project.updated_at)}</Badge>
          <span className="font-mono text-[11px] text-muted-foreground">{project.path}</span>
        </div>
      </div>

      {project.body.trim() === '' ? null : (
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
            <CardDescription>The project file body, as written.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{project.body}</p>
          </CardContent>
        </Card>
      )}

      <TaskBoard
        tasks={tasks}
        projects={new Map([[project.id, recordTitle(project)]])}
        onOpen={setTaskId}
        onMove={(id, moveTo) => void move(id, moveTo)}
        emptyHint="No tasks in this column yet."
      />

      <ProjectEditor projectId={project.id} open={editing} onOpenChange={setEditing} />
      <TaskEditor
        taskId={taskId}
        defaultProjectId={project.id}
        open={creatingTask || taskId !== null}
        onOpenChange={(next) => {
          if (next) return;
          setCreatingTask(false);
          setTaskId(null);
        }}
      />
    </div>
  );
};
