import { useEffect, useState } from 'react';
import { Trash2Icon } from 'lucide-react';
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
import { Field, FieldGrid } from '@/components/field';
import { MarkdownField } from '@/components/markdown-field';
import { SheetBody } from '@/components/sheet-body';
import { ApiRequestError, api } from '@/lib/api';
import type { ApiRecord } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

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

export interface ContactEditorProps {
  readonly contactId: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const ContactEditor = ({ contactId, open, onOpenChange }: ContactEditorProps) => {
  const { records, upsert, remove, loading } = useWorkspace();
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [hash, setHash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);

  const creating = contactId === null;
  const editing =
    contactId === null ? null : (records.contact.find((record) => record.id === contactId) ?? null);
  const path = editing?.path ?? 'contacts/';

  useEffect(() => {
    if (!open) return;

    if (contactId === null) {
      setForm(EMPTY_FORM);
      setHash(null);
      setConflict(false);
      return;
    }

    const current = records.contact.find((record) => record.id === contactId);
    if (current === undefined) return;
    setForm(toForm(current));
    setHash(null);
    setConflict(false);
    void api
      .get('contacts', contactId)
      .then((response) => {
        setHash(response.hash);
        setForm(toForm(response.record));
      })
      .catch(() => undefined);
  }, [open, contactId, records.contact]);

  // The record can disappear under us (external delete); close instead of
  // showing an editor that would write to a missing file.
  useEffect(() => {
    if (!loading && open && contactId !== null && editing === null) onOpenChange(false);
  }, [loading, open, contactId, editing, onOpenChange]);

  const update = <K extends keyof ContactForm>(key: K, value: ContactForm[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const close = (): void => onOpenChange(false);

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
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <SheetContent className="w-full sm:max-w-lg">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-3 pb-6">
            <SheetHeader>
              <SheetTitle>{creating ? 'New contact' : 'Edit contact'}</SheetTitle>
              <SheetDescription className="font-mono text-xs">{path}</SheetDescription>
            </SheetHeader>

            <SheetBody>
              {conflict ? (
                <Alert variant="destructive">
                  <AlertTitle>This file changed on disk</AlertTitle>
                  <AlertDescription>
                    Reload the file to keep the external edits, or save again to overwrite it.
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto px-0"
                      onClick={() => void reload()}
                    >
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

              <MarkdownField
                id="body"
                label="Notes"
                value={form.body}
                onChange={(value) => update('body', value)}
                rows={8}
                hint="Markdown. This is the file body, preserved byte-for-byte."
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
  );
};
