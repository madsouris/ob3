import { useEffect, useState } from 'react';
import { FileTextIcon, PlusIcon, Trash2Icon } from 'lucide-react';
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
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { SheetBody } from '@/components/sheet-body';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import type { ApiRecord } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { navigate } from '@/lib/router';
import { recordTitle, useWorkspace } from '@/lib/workspace';

const KINDS = ['terms', 'proposal', 'note'] as const;

interface DocumentForm {
  title: string;
  kind: string;
  body: string;
}

const EMPTY_FORM: DocumentForm = { title: '', kind: 'note', body: '' };

const toForm = (record: ApiRecord): DocumentForm =>
  record.type === 'document'
    ? { title: record.title, kind: record.kind, body: record.body }
    : EMPTY_FORM;

export interface DocumentsProps {
  readonly initialId: string | null;
}

export const Documents = ({ initialId }: DocumentsProps) => {
  const { records, upsert, remove, loading } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(initialId);
  const [form, setForm] = useState<DocumentForm>(EMPTY_FORM);
  const [hash, setHash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const open = creating || editingId !== null;
  const editing =
    editingId === null ? null : (records.document.find((r) => r.id === editingId) ?? null);

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
      .get('documents', editing.id)
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
    navigate('documents');
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
    const payload: Record<string, unknown> = {
      title: form.title,
      kind: form.kind,
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Documents"
        description="Terms, proposals and notes. Estimates and invoices can reference these files."
        actions={
          <Button onClick={startCreate} size="sm">
            <PlusIcon data-icon="inline-start" />
            New document
          </Button>
        }
      />

      {records.document.length === 0 ? (
        <EmptyState
          icon={FileTextIcon}
          title="No documents yet"
          description="Keep reusable terms or proposal templates here; invoices link to them by path."
          action={
            <Button onClick={startCreate} size="sm">
              <PlusIcon data-icon="inline-start" />
              New document
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="hidden md:table-cell">Path</TableHead>
                <TableHead className="hidden sm:table-cell">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.document.map((document) => (
                <TableRow
                  key={document.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`documents/${document.id}`)}
                >
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`documents/${document.id}`);
                      }}
                    >
                      {recordTitle(document)}
                    </button>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={document.type === 'document' ? document.kind : 'note'} />
                  </TableCell>
                  <TableCell className="hidden truncate font-mono text-xs text-muted-foreground md:table-cell">
                    {document.path}
                  </TableCell>
                  <TableCell className="tabular hidden text-xs text-muted-foreground sm:table-cell">
                    {formatDate(document.updated_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Sheet open={open} onOpenChange={(next) => (next ? undefined : close())}>
        <SheetContent className="w-full sm:max-w-2xl">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-3 pb-6">
              <SheetHeader>
                <SheetTitle>{creating ? 'New document' : 'Edit document'}</SheetTitle>
                <SheetDescription className="font-mono text-xs">
                  {editing?.path ?? 'documents/'}
                </SheetDescription>
              </SheetHeader>

              <SheetBody>
                <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
                <Field label="Title" htmlFor="title">
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(event) => setForm((c) => ({ ...c, title: event.target.value }))}
                  />
                </Field>
                <Field label="Kind" htmlFor="kind">
                  <Select
                    value={form.kind}
                    onValueChange={(value) => setForm((c) => ({ ...c, kind: value }))}
                  >
                    <SelectTrigger id="kind" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind} className="capitalize">
                          {kind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Content" htmlFor="body" hint="Markdown. Saved as the file body.">
                <Textarea
                  id="body"
                  value={form.body}
                  onChange={(event) => setForm((c) => ({ ...c, body: event.target.value }))}
                  rows={20}
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
                        <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Invoices referencing it by path will show a missing reference.
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
