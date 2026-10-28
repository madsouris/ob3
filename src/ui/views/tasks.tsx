import { useEffect, useState } from 'react';
import { CalendarDaysIcon, PlusIcon, Trash2Icon } from 'lucide-react';
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
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import type { ApiRecord } from '@/lib/api';
import { formatDate, formatToday } from '@/lib/format';
import { navigate } from '@/lib/router';
import { recordTitle, useWorkspace } from '@/lib/workspace';

type TaskStatus = 'todo' | 'doing' | 'done';

const COLUMNS: ReadonlyArray<{ status: TaskStatus; label: string; hint: string }> = [
  { status: 'todo', label: 'To do', hint: 'tasks/todo' },
  { status: 'doing', label: 'Doing', hint: 'tasks/doing' },
  { status: 'done', label: 'Done', hint: 'tasks/done' },
];

const NO_PROJECT = '__none';

interface TaskForm {
  title: string;
  project_id: string;
  due_date: string;
  body: string;
}

const EMPTY_FORM: TaskForm = { title: '', project_id: '', due_date: '', body: '' };

const toForm = (record: ApiRecord): TaskForm =>
  record.type === 'task'
    ? {
        title: record.title,
        project_id: record.project_id,
        due_date: record.due_date.slice(0, 10),
        body: record.body,
      }
    : EMPTY_FORM;

export interface TasksProps {
  readonly initialId: string | null;
}

export const Tasks = ({ initialId }: TasksProps) => {
  const { records, upsert, remove, loading } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(initialId);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [hash, setHash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);

  const open = creating || editingId !== null;
  const editing = editingId === null ? null : (records.task.find((r) => r.id === editingId) ?? null);
  const projects = new Map(
    records.project.map((project) => [project.id, recordTitle(project)] as const),
  );
  const today = formatToday();

  useEffect(() => {
    setEditingId(initialId);
    setCreating(false);
  }, [initialId]);

  useEffect(() => {
    if (editing === null) {
      setForm(EMPTY_FORM);
      setHash(null);
      return;
    }
    setForm(toForm(editing));
    void api
      .get('tasks', editing.id)
      .then((response) => {
        setHash(response.hash);
        setForm(toForm(response.record));
      })
      .catch(() => undefined);
  }, [editing?.id]);

  useEffect(() => {
    if (!loading && editingId !== null && editing === null) setEditingId(null);
  }, [loading, editingId, editing]);

  const close = (): void => {
    setCreating(false);
    setEditingId(null);
    navigate('tasks');
  };

  const startCreate = (): void => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setHash(null);
    setCreating(true);
  };

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

  const move = async (id: string, to: TaskStatus): Promise<void> => {
    setMoving(true);
    try {
      const response = await api.moveTask(id, { to });
      upsert(response.record);
      toast.success(`Moved to ${to}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not move the task');
    } finally {
      setMoving(false);
    }
  };

  const byColumn = (status: TaskStatus): ApiRecord[] =>
    records.task
      .filter((task) => task.status === status)
      .sort((left, right) =>
        left.type === 'task' && right.type === 'task' ? left.order - right.order : 0,
      );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tasks"
        description="The board is the filesystem: a card's column is the folder it lives in."
        actions={
          <Button onClick={startCreate} size="sm">
            <PlusIcon data-icon="inline-start" />
            New task
          </Button>
        }
      />

      {records.task.length === 0 ? (
        <EmptyState
          icon={CalendarDaysIcon}
          title="No tasks yet"
          description="Create one and ob writes tasks/todo/<id>.md. Moving it between columns moves the file."
          action={
            <Button onClick={startCreate} size="sm">
              <PlusIcon data-icon="inline-start" />
              New task
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((column) => {
            const tasks = byColumn(column.status);
            return (
              <section
                key={column.status}
                aria-label={column.label}
                className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3"
              >
                <header className="flex items-center justify-between gap-2 px-1">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{column.label}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {column.hint}
                    </span>
                  </div>
                  <Badge variant="secondary">{tasks.length}</Badge>
                </header>

                <div className="flex flex-col gap-2">
                  {tasks.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                      Nothing here.
                    </p>
                  ) : (
                    tasks.map((task) => {
                      const due = task.type === 'task' ? task.due_date : '';
                      const overdue = due !== '' && due.slice(0, 10) < today && column.status !== 'done';

                      return (
                        <div
                          key={task.id}
                          className="flex flex-col gap-2 rounded-md border bg-card p-3 shadow-xs"
                        >
                          <button
                            type="button"
                            className="text-left text-sm font-medium hover:underline"
                            onClick={() => navigate(`tasks/${task.id}`)}
                          >
                            {recordTitle(task)}
                          </button>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {task.type === 'task' && task.project_id !== '' ? (
                              <span className="truncate">
                                {projects.get(task.project_id) ?? 'Unknown project'}
                              </span>
                            ) : null}
                            {due === '' ? null : (
                              <Badge variant={overdue ? 'destructive' : 'outline'}>
                                {formatDate(due)}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => navigate(`tasks/${task.id}`)}
                            >
                              Open
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="xs" disabled={moving}>
                                  Move to…
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Column</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {COLUMNS.filter((target) => target.status !== column.status).map(
                                  (target) => (
                                    <DropdownMenuItem
                                      key={target.status}
                                      onSelect={() => void move(task.id, target.status)}
                                    >
                                      {target.label}
                                    </DropdownMenuItem>
                                  ),
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Sheet open={open} onOpenChange={(next) => (next ? undefined : close())}>
        <SheetContent className="w-full sm:max-w-lg">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-5 pb-6">
              <SheetHeader>
                <SheetTitle>{creating ? 'New task' : 'Edit task'}</SheetTitle>
                <SheetDescription className="font-mono text-xs">
                  {editing?.path ?? 'tasks/todo/'}
                </SheetDescription>
              </SheetHeader>

              <Field label="Title" htmlFor="title">
                <Input
                  id="title"
                  value={form.title}
                  onChange={(event) => setForm((c) => ({ ...c, title: event.target.value }))}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Project" htmlFor="project_id">
                  <Select
                    value={form.project_id === '' ? NO_PROJECT : form.project_id}
                    onValueChange={(value) =>
                      setForm((c) => ({ ...c, project_id: value === NO_PROJECT ? '' : value }))
                    }
                  >
                    <SelectTrigger id="project_id" className="w-full">
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
                <Field label="Due date" htmlFor="due_date">
                  <Input
                    id="due_date"
                    type="date"
                    value={form.due_date}
                    onChange={(event) => setForm((c) => ({ ...c, due_date: event.target.value }))}
                  />
                </Field>
              </div>

              {editing?.type === 'task' && editing.status !== null ? (
                <Field label="Column" htmlFor="column">
                  <div className="flex gap-2">
                    {COLUMNS.map((column) => (
                      <Button
                        key={column.status}
                        id={column.status === editing.status ? 'column' : undefined}
                        type="button"
                        variant={column.status === editing.status ? 'secondary' : 'outline'}
                        size="sm"
                        disabled={moving || column.status === editing.status}
                        onClick={() => {
                          if (editing.status !== null) void move(editing.id, column.status);
                        }}
                      >
                        {column.label}
                      </Button>
                    ))}
                  </div>
                </Field>
              ) : null}

              <Field label="Notes" htmlFor="body" hint="Markdown body, preserved as written.">
                <Textarea
                  id="body"
                  value={form.body}
                  onChange={(event) => setForm((c) => ({ ...c, body: event.target.value }))}
                  rows={8}
                  className="font-mono text-xs"
                />
              </Field>

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
    </div>
  );
};
