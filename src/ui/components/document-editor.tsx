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
import { Field } from '@/components/field';
import { MarkdownField } from '@/components/markdown-field';
import { SheetBody } from '@/components/sheet-body';
import { VariableReference } from '@/components/variable-reference';
import { api } from '@/lib/api';
import type { ApiRecord } from '@/lib/api';
import { DOCUMENT_KIND_OPTIONS, documentKindLabel } from '@/lib/document-kinds';
import { TEMPLATE_VARIABLE_GROUPS } from '@/lib/template';
import { recordTitle, useWorkspace } from '@/lib/workspace';

const SCOPES = ['global', 'client'] as const;
const NO_CLIENT = '__none__';

interface DocumentForm {
  title: string;
  kind: string;
  scope: 'global' | 'client';
  client_id: string;
  body: string;
}

const EMPTY_FORM: DocumentForm = {
  title: '',
  kind: 'note',
  scope: 'global',
  client_id: '',
  body: '',
};

const toForm = (record: ApiRecord): DocumentForm =>
  record.type === 'document'
    ? {
        title: record.title,
        kind: record.kind,
        scope: record.scope === 'client' ? 'client' : 'global',
        client_id: record.client_id,
        body: record.body,
      }
    : EMPTY_FORM;

export interface DocumentEditorProps {
  readonly documentId: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const DocumentEditor = ({ documentId, open, onOpenChange }: DocumentEditorProps) => {
  const { records, upsert, remove } = useWorkspace();
  const [form, setForm] = useState<DocumentForm>(EMPTY_FORM);
  const [hash, setHash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const creating = documentId === null;
  const editing =
    documentId === null
      ? null
      : (records.document.find((record) => record.id === documentId) ?? null);
  const path = editing?.path ?? 'documents/';

  useEffect(() => {
    if (!open) return;

    if (documentId === null) {
      setForm(EMPTY_FORM);
      setHash(null);
      return;
    }

    const current = records.document.find((record) => record.id === documentId);
    if (current === undefined) return;
    setForm(toForm(current));
    setHash(null);
    void api
      .get('documents', documentId)
      .then((response) => {
        setHash(response.hash);
        setForm(toForm(response.record));
      })
      .catch(() => undefined);
  }, [open, documentId, records.document]);

  const close = (): void => onOpenChange(false);

  const save = async (): Promise<void> => {
    if (form.title.trim() === '') {
      toast.error('Title is required');
      return;
    }
    if (form.scope === 'client' && form.client_id === '') {
      toast.error('Pick a client for a client-scoped document');
      return;
    }

    setSaving(true);
    const payload: Record<string, unknown> = {
      title: form.title,
      kind: form.kind,
      scope: form.scope,
      client_id: form.scope === 'client' ? form.client_id : '',
      body: form.body,
    };

    try {
      if (creating) {
        const response = await api.create('documents', payload);
        upsert(response.record);
        toast.success('Document created');
        close();
      } else if (editing !== null) {
        const response = await api.update('documents', editing.id, {
          ...payload,
          ...(hash === null ? {} : { baseHash: hash }),
        });
        upsert(response.record);
        toast.success('Document saved');
        close();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the document');
    } finally {
      setSaving(false);
    }
  };

  const destroy = async (): Promise<void> => {
    if (editing === null) return;
    try {
      await api.remove('documents', editing.id, hash ?? undefined);
      remove(editing.id);
      toast.success('Document deleted');
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the document');
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <SheetContent className="w-full sm:max-w-2xl">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-3 pb-6">
            <SheetHeader>
              <SheetTitle>{creating ? 'New document' : 'Edit document'}</SheetTitle>
              <SheetDescription className="font-mono text-xs">{path}</SheetDescription>
            </SheetHeader>

            <SheetBody>
              <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
                <Field label="Title" htmlFor="title">
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, title: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Kind" htmlFor="kind">
                  <Select
                    value={form.kind}
                    onValueChange={(value) => setForm((current) => ({ ...current, kind: value }))}
                  >
                    <SelectTrigger id="kind" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_KIND_OPTIONS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {documentKindLabel(kind)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Scope" htmlFor="scope">
                  <Select
                    value={form.scope}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        scope: value === 'client' ? 'client' : 'global',
                        ...(value === 'client' ? {} : { client_id: '' }),
                      }))
                    }
                  >
                    <SelectTrigger id="scope" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCOPES.map((scope) => (
                        <SelectItem key={scope} value={scope}>
                          {scope === 'global' ? 'Global template' : 'Client document'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                {form.scope === 'client' ? (
                  <Field label="Client" htmlFor="document-client">
                    <Select
                      value={form.client_id === '' ? NO_CLIENT : form.client_id}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          client_id: value === NO_CLIENT ? '' : value,
                        }))
                      }
                    >
                      <SelectTrigger id="document-client" className="w-full">
                        <SelectValue placeholder="Pick a client" />
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
                ) : (
                  <div className="flex items-end">
                    <p className="pb-2 text-xs text-muted-foreground">
                      Global templates can be attached to any invoice or estimate.
                    </p>
                  </div>
                )}
              </div>

              <MarkdownField
                id="body"
                label="Content"
                value={form.body}
                onChange={(value) => setForm((current) => ({ ...current, body: value }))}
                rows={20}
                hint="Markdown. Placeholders are filled when the document is viewed or printed."
              />

              <VariableReference groups={TEMPLATE_VARIABLE_GROUPS} />
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
                      <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The file {path} is removed from disk. Invoices referencing it show a missing
                        attachment until edited.
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
