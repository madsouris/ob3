import { useEffect, useState } from 'react';
import { PlusIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { ApiRequestError, api } from '@/lib/api';
import type { ApiRecord } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { navigate } from '@/lib/router';
import { recordTitle, useWorkspace } from '@/lib/workspace';

/** Mirrors docs/03. Duplicated here to keep Zod out of the client bundle. */
const STATUSES = ['lead', 'active', 'inactive', 'archived'] as const;

interface ContactForm {
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  job_role: string;
  phone_number: string;
  website: string;
  primary_link: string;
  status: string;
  body: string;
}

const EMPTY_FORM: ContactForm = {
  first_name: '',
  last_name: '',
  email: '',
  company: '',
  job_role: '',
  phone_number: '',
  website: '',
  primary_link: '',
  status: 'lead',
  body: '',
};

const toForm = (record: ApiRecord): ContactForm =>
  record.type === 'contact'
    ? {
        first_name: record.first_name,
        last_name: record.last_name,
        email: record.email,
        company: record.company,
        job_role: record.job_role,
        phone_number: record.phone_number,
        website: record.website,
        primary_link: record.primary_link,
        status: record.status,
        body: record.body,
      }
    : EMPTY_FORM;

export interface ContactsProps {
  readonly initialId: string | null;
}

export const Contacts = ({ initialId }: ContactsProps) => {
  const { records, upsert, remove, loading } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(initialId);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [hash, setHash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);

  const open = creating || editingId !== null;
  const editing = editingId === null ? null : (records.contact.find((r) => r.id === editingId) ?? null);
  const path = editing?.path ?? 'contacts/';

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
    setHash(null);
    setConflict(false);
    void api
      .get('contacts', editing.id)
      .then((response) => {
        setHash(response.hash);
        setForm(toForm(response.record));
      })
      .catch(() => undefined);
  }, [editing?.id]);

  // The record can disappear under us (external delete); close instead of
  // showing an editor that would write to a missing file.
  useEffect(() => {
    if (!loading && editingId !== null && editing === null) setEditingId(null);
  }, [loading, editingId, editing]);

  const update = <K extends keyof ContactForm>(key: K, value: ContactForm[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const close = (): void => {
    setCreating(false);
    setEditingId(null);
    setConflict(false);
    navigate('contacts');
  };

  const startCreate = (): void => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setHash(null);
    setConflict(false);
    setCreating(true);
  };

  const save = async (): Promise<void> => {
    if (form.first_name.trim() === '') {
      toast.error('First name is required');
      return;
    }

    setSaving(true);
    const payload: Record<string, unknown> = {
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      company: form.company,
      job_role: form.job_role,
      phone_number: form.phone_number,
      website: form.website,
      primary_link: form.primary_link,
      status: form.status,
      body: form.body,
    };

    try {
      if (creating) {
        const response = await api.create('contacts', payload);
        upsert(response.record);
        toast.success('Contact created');
        close();
      } else if (editing !== null) {
        const response = await api.update('contacts', editing.id, {
          ...payload,
          ...(hash === null ? {} : { baseHash: hash }),
        });
        upsert(response.record);
        toast.success('Contact saved');
        close();
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'file_changed_on_disk') {
        setConflict(true);
        return;
      }
      toast.error(error instanceof Error ? error.message : 'Could not save the contact');
    } finally {
      setSaving(false);
    }
  };

  const reload = async (): Promise<void> => {
    if (editing === null) return;
    try {
      const response = await api.get('contacts', editing.id);
      setForm(toForm(response.record));
      setHash(response.hash);
      setConflict(false);
      toast.success('Reloaded from disk');
    } catch {
      toast.error('Could not reload the file');
    }
  };

  const destroy = async (): Promise<void> => {
    if (editing === null) return;
    try {
      await api.remove('contacts', editing.id, hash ?? undefined);
      remove(editing.id);
      toast.success('Contact deleted');
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the contact');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contacts"
        description="People and companies. Each row is a Markdown file in contacts/."
        actions={
          <Button onClick={startCreate} size="sm">
            <PlusIcon data-icon="inline-start" />
            New contact
          </Button>
        }
      />

      {records.contact.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No contacts yet"
          description="Add your first client and ob will write contacts/<id>.md for you."
          action={
            <Button onClick={startCreate} size="sm">
              <PlusIcon data-icon="inline-start" />
              New contact
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Company</TableHead>
                <TableHead className="hidden lg:table-cell">Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.contact.map((contact) => (
                <TableRow
                  key={contact.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`contacts/${contact.id}`)}
                >
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`contacts/${contact.id}`);
                      }}
                    >
                      {recordTitle(contact)}
                    </button>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {contact.type === 'contact' && contact.company !== '' ? contact.company : '—'}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {contact.type === 'contact' && contact.email !== '' ? contact.email : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={contact.type === 'contact' ? contact.status : 'lead'} />
                  </TableCell>
                  <TableCell className="tabular hidden text-xs text-muted-foreground sm:table-cell">
                    {formatDate(contact.updated_at)}
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
                <SheetTitle>{creating ? 'New contact' : 'Edit contact'}</SheetTitle>
                <SheetDescription className="font-mono text-xs">{path}</SheetDescription>
              </SheetHeader>

              {conflict ? (
                <Alert variant="destructive">
                  <AlertTitle>This file changed on disk</AlertTitle>
                  <AlertDescription>
                    Reload the file to keep the external edits, or save again to overwrite it.
                    <Button variant="link" size="sm" className="h-auto px-0" onClick={() => void reload()}>
                      Reload from disk
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              <FieldGrid>
                <Field label="First name" htmlFor="first_name">
                  <Input
                    id="first_name"
                    value={form.first_name}
                    onChange={(event) => update('first_name', event.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Last name" htmlFor="last_name">
                  <Input
                    id="last_name"
                    value={form.last_name}
                    onChange={(event) => update('last_name', event.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Email" htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) => update('email', event.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Company" htmlFor="company">
                  <Input
                    id="company"
                    value={form.company}
                    onChange={(event) => update('company', event.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Job role" htmlFor="job_role">
                  <Input
                    id="job_role"
                    value={form.job_role}
                    onChange={(event) => update('job_role', event.target.value)}
                  />
                </Field>
                <Field label="Phone" htmlFor="phone_number">
                  <Input
                    id="phone_number"
                    value={form.phone_number}
                    onChange={(event) => update('phone_number', event.target.value)}
                  />
                </Field>
                <Field label="Website" htmlFor="website">
                  <Input
                    id="website"
                    value={form.website}
                    onChange={(event) => update('website', event.target.value)}
                  />
                </Field>
                <Field label="Primary link" htmlFor="primary_link" hint="LinkedIn, portfolio, etc.">
                  <Input
                    id="primary_link"
                    value={form.primary_link}
                    onChange={(event) => update('primary_link', event.target.value)}
                  />
                </Field>
              </FieldGrid>

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

              <Field label="Notes" htmlFor="body" hint="Markdown. This is the file body, preserved byte-for-byte.">
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
                        <AlertDialogTitle>Delete this contact?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The file {path} is removed from disk. Git history keeps the old version.
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
