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
import { Field, FieldGrid } from '@/components/field';
import { MarkdownField } from '@/components/markdown-field';
import { SheetBody } from '@/components/sheet-body';
import { api } from '@/lib/api';
import type { ApiRecord } from '@/lib/api';
import { valueLabel } from '@/lib/labels';
import { recordTitle, useWorkspace } from '@/lib/workspace';

const STATUSES = ['active', 'completed', 'archived'] as const;
const NO_CLIENT = '__none';

interface ProjectForm {
  project_name: string;
  client_id: string;
  status: string;
  body: string;
}

const EMPTY: ProjectForm = { project_name: '', client_id: '', status: 'active', body: '' };

const toForm = (record: ApiRecord): ProjectForm =>
  record.type === 'project'
    ? {
        project_name: record.project_name,
        client_id: record.client_id,
        status: record.status,
        body: record.body,
      }
    : EMPTY;

export interface ProjectEditorProps {
  readonly projectId: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const ProjectEditor = ({ projectId, open, onOpenChange }: ProjectEditorProps) => {
  const { records, upsert, remove } = useWorkspace();
  const [form, setForm] = useState<ProjectForm>(EMPTY);
  const [hash, setHash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const editing =
    projectId === null
      ? null
      : (records.project.find((project) => project.id === projectId) ?? null);
  const creating = projectId === null;

  useEffect(() => {
    if (!open) return;

    if (projectId === null) {
      setForm(EMPTY);
      setHash(null);
      return;
    }

    const current = records.project.find((project) => project.id === projectId);
    if (current === undefined) return;
    setForm(toForm(current));
    void api
      .get('projects', projectId)
      .then((response) => {
        setHash(response.hash);
        setForm(toForm(response.record));
      })
      .catch(() => undefined);
  }, [open, projectId, records.project]);

  const close = (): void => onOpenChange(false);

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

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <SheetContent className="w-full sm:max-w-lg">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-3 pb-6">
            <SheetHeader>
              <SheetTitle>{creating ? 'New project' : 'Edit project'}</SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {editing?.path ?? 'projects/'}
              </SheetDescription>
            </SheetHeader>

            <SheetBody>
              <Field label="Project name" htmlFor="project_name">
              <Input
                id="project_name"
                value={form.project_name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, project_name: event.target.value }))
                }
              />
            </Field>

            <FieldGrid>
              <Field label="Client" htmlFor="project_client">
                <Select
                  value={form.client_id === '' ? NO_CLIENT : form.client_id}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      client_id: value === NO_CLIENT ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger id="project_client" className="w-full">
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
              <Field label="Status" htmlFor="project_status">
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}
                >
                  <SelectTrigger id="project_status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {valueLabel(status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGrid>

            <MarkdownField
              id="project_body"
              label="Description"
              value={form.body}
              onChange={(value) => setForm((current) => ({ ...current, body: value }))}
              rows={8}
              hint="Markdown body, preserved as written."
            />
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
                      <AlertDialogTitle>Delete this project?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The file is removed from disk. Tasks keep their project_id and show a
                        dangling reference until fixed.
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
