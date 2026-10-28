import { useEffect, useState } from 'react';
import { FolderIcon, PlusIcon, Trash2Icon } from 'lucide-react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/empty-state';
import { Field, FieldGrid } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import type { ApiRecord } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { navigate } from '@/lib/router';
import { recordTitle, useWorkspace } from '@/lib/workspace';

const STATUSES = ['active', 'completed', 'archived'] as const;
const NO_CLIENT = '__none';

interface ProjectForm {
  project_name: string;
  client_id: string;
  status: string;
  body: string;
}

const EMPTY_FORM: ProjectForm = { project_name: '', client_id: '', status: 'active', body: '' };

const toForm = (record: ApiRecord): ProjectForm =>
  record.type === 'project'
    ? {
        project_name: record.project_name,
        client_id: record.client_id,
        status: record.status,
        body: record.body,
      }
    : EMPTY_FORM;

export interface ProjectsProps {
  readonly initialId: string | null;
}

export const Projects = ({ initialId }: ProjectsProps) => {
  const { records, upsert, remove, loading } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(initialId);
  const [form, setForm] = useState<ProjectForm>(EMPTY_FORM);
  const [hash, setHash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const open = creating || editingId !== null;
  const editing = editingId === null ? null : (records.project.find((r) => r.id === editingId) ?? null);
  const clients = new Map(records.contact.map((contact) => [contact.id, recordTitle(contact)] as const));

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
      .get('projects', editing.id)
      .then((response) => {
        setHash(response.hash);
        setForm(toForm(response.record));
      })
      .catch(() => undefined);
  }, [editing?.id]);

  useEffect(() => {
    if (!loading && editingId !== null && editing === null) setEditingId(null);
  }, [loading, editingId, editing]);

  const update = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const close = (): void => {
    setCreating(false);
    setEditingId(null);
    navigate('projects');
  };

  const startCreate = (): void => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setHash(null);
    setCreating(true);
  };

  const save = async (): Promise<void> => {
    if (form.project_name.trim() === '') {
      toast.error('Project name is required');
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      project_name: form.project_name,
      client_id: form.client_id,
      status: form.status,
      body: form.body,
    };
    try {
      if (creating) {
        const response = await api.create('projects', payload);
        upsert(response.record);
        toast.success('Project created');
        close();
      } else if (editing !== null) {
        const response = await api.update('projects', editing.id, {
          ...payload,
          ...(hash === null ? {} : { baseHash: hash }),
        });
        upsert(response.record);
        toast.success('Project saved');
        close();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the project');
    } finally {
      setSaving(false);
    }
  };

  const destroy = async (): Promise<void> => {
    if (editing === null) return;
    try {
      await api.remove('projects', editing.id, hash ?? undefined);
      remove(editing.id);
      toast.success('Project deleted');
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the project');
    }
  };

  const taskCount = (projectId: string): number =>
    records.task.filter((task) => task.type === 'task' && task.project_id === projectId).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Projects"
        description="Engagements, grouped by client. Each row is a file in projects/."
        actions={
          <Button onClick={startCreate} size="sm">
            <PlusIcon data-icon="inline-start" />
            New project
          </Button>
        }
      />

      {records.project.length === 0 ? (
        <EmptyState
          icon={FolderIcon}
          title="No projects yet"
          description="Create a project to group tasks, estimates and invoices around one engagement."
          action={
            <Button onClick={startCreate} size="sm">
              <PlusIcon data-icon="inline-start" />
              New project
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead className="hidden md:table-cell">Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="tabular hidden sm:table-cell">Tasks</TableHead>
                <TableHead className="hidden lg:table-cell">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.project.map((project) => (
                <TableRow
                  key={project.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`projects/${project.id}`)}
                >
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`projects/${project.id}`);
                      }}
                    >
                      {recordTitle(project)}
                    </button>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {project.type === 'project' ? clients.get(project.client_id) ?? '—' : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={project.type === 'project' ? project.status : 'active'} />
                  </TableCell>
                  <TableCell className="tabular hidden sm:table-cell">
                    {taskCount(project.id)}
                  </TableCell>
                  <TableCell className="tabular hidden text-xs text-muted-foreground lg:table-cell">
                    {formatDate(project.updated_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Sheet open={open} onOpenChange={(next) => (next ? undefined : close())}>
        <SheetContent className="w-full sm:max-w-lg">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-5 pb-6">
              <SheetHeader>
                <SheetTitle>{creating ? 'New project' : 'Edit project'}</SheetTitle>
                <SheetDescription className="font-mono text-xs">
                  {editing?.path ?? 'projects/'}
                </SheetDescription>
              </SheetHeader>

              <Field label="Project name" htmlFor="project_name">
                <Input
                  id="project_name"
                  value={form.project_name}
                  onChange={(event) => update('project_name', event.target.value)}
                />
              </Field>

              <FieldGrid>
                <Field label="Client" htmlFor="client_id">
                  <Select
                    value={form.client_id === '' ? NO_CLIENT : form.client_id}
                    onValueChange={(value) => update('client_id', value === NO_CLIENT ? '' : value)}
                  >
                    <SelectTrigger id="client_id" className="w-full">
                      <SelectValue placeholder="No client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CLIENT}>No client</SelectItem>
                      {records.contact.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {recordTitle(contact)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Status" htmlFor="status">
                  <Select value={form.status} onValueChange={(value) => update('status', value)}>
                    <SelectTrigger id="status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((status) => (
                        <SelectItem key={status} value={status} className="capitalize">
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGrid>

              <Field label="Description" htmlFor="body" hint="Markdown body, preserved as written.">
                <Textarea
                  id="body"
                  value={form.body}
                  onChange={(event) => update('body', event.target.value)}
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
                        <AlertDialogTitle>Delete this project?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The file is removed from disk. Linked tasks keep their project_id and will
                          show a dangling reference until fixed.
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
