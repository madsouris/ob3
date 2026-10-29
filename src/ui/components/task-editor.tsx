import { useEffect, useState } from 'react';
import { Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/field';
import { DateField } from '@/components/date-field';
import { SheetBody } from '@/components/sheet-body';
import { api } from '@/lib/api';
import type { ApiRecord } from '@/lib/api';
import { recordTitle, useWorkspace } from '@/lib/workspace';
import type { TaskStatus } from '@/components/task-board';

const NO_PROJECT = '__none';
const COLUMNS: ReadonlyArray<{ status: TaskStatus; label: string }> = [
  { status: 'todo', label: 'To do' },
  { status: 'doing', label: 'Doing' },
  { status: 'done', label: 'Done' },
];

interface TaskForm {
  title: string;
  project_id: string;
  due_date: string;
  body: string;
}

const EMPTY: TaskForm = { title: '', project_id: '', due_date: '', body: '' };

const toForm = (record: ApiRecord): TaskForm =>
  record.type === 'task'
    ? {
        title: record.title,
        project_id: record.project_id,
        due_date: record.due_date.slice(0, 10),
        body: record.body,
      }
    : EMPTY;

export interface TaskEditorProps {
  readonly taskId: string | null;
  readonly defaultProjectId?: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const TaskEditor = ({ taskId, defaultProjectId, open, onOpenChange }: TaskEditorProps) => {
  const { records, upsert, remove } = useWorkspace();
  const [form, setForm] = useState<TaskForm>(EMPTY);
  const [hash, setHash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);

  const editing =
    taskId === null ? null : (records.task.find((task) => task.id === taskId) ?? null);
  const creating = taskId === null;

  useEffect(() => {
    if (!open) return;

    if (taskId === null) {
      setForm({ ...EMPTY, project_id: defaultProjectId ?? '' });
      setHash(null);
      return;
    }

    const current = records.task.find((task) => task.id === taskId);
    if (current === undefined) return;
    setForm(toForm(current));
    void api
      .get('tasks', taskId)
      .then((response) => {
        setHash(response.hash);
        setForm(toForm(response.record));
      })
      .catch(() => undefined);
  }, [open, taskId, defaultProjectId, records.task]);

  const close = (): void => onOpenChange(false);

  const save = async (): Promise<void> => {
    if (form.title.trim() === '') {
      toast.error('Title is required');
      return;
    }

    setSaving(true);
    const dueDate = form.due_date === '' ? '' : `${form.due_date}T00:00:00Z`;
    const payload: Record<string, unknown> = {
      title: form.title,
      project_id: form.project_id,
      due_date: dueDate,
      body: form.body,
    };

    try {
      if (creating) {
        const response = await api.create('tasks', payload);
        upsert(response.record);
        toast.success('Task created');
        close();
      } else if (editing !== null) {
        const response = await api.update('tasks', editing.id, {
          ...payload,
          ...(hash === null ? {} : { baseHash: hash }),
        });
        upsert(response.record);
        toast.success('Task saved');
        close();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the task');
    } finally {
      setSaving(false);
    }
  };

  const move = async (to: TaskStatus): Promise<void> => {
    if (editing === null) return;
    setMoving(true);
    try {
      const response = await api.moveTask(editing.id, { to });
      upsert(response.record);
      toast.success(`Moved to ${to}`);
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not move the task');
    } finally {
      setMoving(false);
    }
  };

  const destroy = async (): Promise<void> => {
    if (editing === null) return;
    try {
      await api.remove('tasks', editing.id, hash ?? undefined);
      remove(editing.id);
      toast.success('Task deleted');
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the task');
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <SheetContent className="w-full sm:max-w-lg">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-3 pb-6">
            <SheetHeader>
              <SheetTitle>{creating ? 'New task' : 'Edit task'}</SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {editing?.path ?? 'tasks/todo/'}
              </SheetDescription>
            </SheetHeader>

            <SheetBody>
              <Field label="Title" htmlFor="task-title">
              <Input
                id="task-title"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project" htmlFor="task-project">
                <Select
                  value={form.project_id === '' ? NO_PROJECT : form.project_id}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      project_id: value === NO_PROJECT ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger id="task-project" className="w-full">
                    <SelectValue placeholder="No project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROJECT}>No project</SelectItem>
                    {records.project.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {recordTitle(project)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Due date" htmlFor="task-due">
                <DateField
                  id="task-due"
                  value={form.due_date}
                  onChange={(value) => setForm((current) => ({ ...current, due_date: value }))}
                />
              </Field>
            </div>

            {editing?.type === 'task' && editing.status !== null ? (
              <Field label="Column" htmlFor="task-column">
                <div className="flex gap-2">
                  {COLUMNS.map((column) => (
                    <Button
                      key={column.status}
                      id={column.status === editing.status ? 'task-column' : undefined}
                      type="button"
                      variant={column.status === editing.status ? 'secondary' : 'outline'}
                      size="sm"
                      disabled={moving || column.status === editing.status}
                      onClick={() => void move(column.status)}
                    >
                      {column.label}
                    </Button>
                  ))}
                </div>
              </Field>
            ) : null}

            <Field label="Notes" htmlFor="task-body" hint="Markdown body, preserved as written.">
              <Textarea
                id="task-body"
                value={form.body}
                onChange={(event) =>
                  setForm((current) => ({ ...current, body: event.target.value }))
                }
                rows={8}
                className="font-mono text-xs"
              />
            </Field>
            </SheetBody>

            <SheetFooter className="flex-row justify-between gap-2">
              {creating ? (
                <span />
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <Trash2Icon data-icon="inline-start" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this task?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The file is removed from disk. This cannot be undone outside Git.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void destroy()}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={close}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void save()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </SheetFooter>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
