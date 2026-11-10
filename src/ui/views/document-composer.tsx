import { useEffect, useState } from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Markdown } from '@/components/markdown';
import { VariableReference } from '@/components/variable-reference';
import { DOCUMENT_KIND_OPTIONS, documentKindLabel } from '@/lib/document-kinds';
import { api } from '@/lib/api';
import type { ApiRecord } from '@/lib/api';
import { navigate } from '@/lib/router';
import { templateVariablesFor } from '@/lib/document-variables';
import { renderTemplate } from '@/lib/template';
import { TEMPLATE_VARIABLE_GROUPS } from '@/lib/template';
import { recordTitle, useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';

const NO_CLIENT = '__none';
type Scope = 'global' | 'client';
type Mode = 'write' | 'preview' | 'split';

interface DocumentForm {
  title: string;
  kind: string;
  scope: Scope;
  client_id: string;
  body: string;
}

const EMPTY: DocumentForm = {
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
    : EMPTY;

export interface DocumentComposerProps {
  /** `null` creates a document; an id edits one. */
  readonly documentId: string | null;
}

/**
 * Full-page document editor, for creation and editing. Writing stays plain
 * Markdown — the file is the source — with a live preview and an optional
 * side-by-side view. Template variables resolve in the preview only.
 */
export const DocumentComposer = ({ documentId }: DocumentComposerProps) => {
  const { records, config, upsert } = useWorkspace();
  const [form, setForm] = useState<DocumentForm>(EMPTY);
  const [hash, setHash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>('write');

  const editing =
    documentId === null
      ? null
      : (records.document.find((record) => record.id === documentId) ?? null);

  useEffect(() => {
    if (documentId === null) {
      setForm(EMPTY);
      setHash(null);
      return;
    }

    const current = records.document.find((record) => record.id === documentId);
    if (current !== undefined) setForm(toForm(current));

    void api
      .get('documents', documentId)
      .then((response) => {
        setHash(response.hash);
        setForm(toForm(response.record));
      })
      .catch(() => undefined);
    // Loading is keyed by the document id; the workspace list is only a warm start.
  }, [documentId]);

  const client =
    form.scope === 'client'
      ? (records.contact.find((contact) => contact.id === form.client_id) ?? null)
      : null;
  const preview = renderTemplate(form.body, templateVariablesFor({ config, client }));

  const back = (): void => {
    if (documentId === null) navigate('documents');
    else navigate(`documents/${documentId}`);
  };

  const update = <K extends keyof DocumentForm>(key: K, value: DocumentForm[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async (): Promise<void> => {
    if (form.title.trim() === '') {
      toast.error('Title is required');
      return;
    }
    if (form.scope === 'client' && form.client_id === '') {
      toast.error('Pick a client, or make this a global document');
      return;
    }

    const payload = {
      title: form.title.trim(),
      kind: form.kind,
      scope: form.scope,
      client_id: form.scope === 'client' ? form.client_id : '',
      body: form.body,
    };

    setSaving(true);
    try {
      if (documentId === null) {
        const response = await api.create('documents', payload);
        upsert(response.record);
        toast.success('Document created');
        navigate(`documents/${response.record.id}`);
      } else {
        const response = await api.update('documents', documentId, {
          ...payload,
          ...(hash === null ? {} : { baseHash: hash }),
        });
        upsert(response.record);
        toast.success('Document saved');
        navigate(`documents/${documentId}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the document');
    } finally {
      setSaving(false);
    }
  };

  const editorHeight = 'min-h-[50vh]';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={back}>
          <ArrowLeftIcon data-icon="inline-start" />
          {documentId === null ? 'All documents' : 'Back to document'}
        </Button>

        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
            {editing?.path ?? 'documents/'}
          </span>
          <Button variant="ghost" size="sm" onClick={back}>
            Cancel
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Input
          aria-label="Document title"
          placeholder="Untitled"
          value={form.title}
          onChange={(event) => update('title', event.target.value)}
          className="h-auto border-0 bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-0"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Select value={form.kind} onValueChange={(value) => update('kind', value)}>
            <SelectTrigger className="w-44" aria-label="Document kind">
              <SelectValue placeholder={documentKindLabel(form.kind)} />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_KIND_OPTIONS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {documentKindLabel(kind)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={form.scope}
            aria-label="Document scope"
            onValueChange={(value) => {
              if (value === '') return;
              update('scope', value === 'client' ? 'client' : 'global');
            }}
          >
            <ToggleGroupItem value="global">Global</ToggleGroupItem>
            <ToggleGroupItem value="client">Client</ToggleGroupItem>
          </ToggleGroup>

          {form.scope === 'client' ? (
            <Select
              value={form.client_id === '' ? NO_CLIENT : form.client_id}
              onValueChange={(value) => update('client_id', value === NO_CLIENT ? '' : value)}
            >
              <SelectTrigger className="w-56" aria-label="Client">
                <SelectValue placeholder="Pick a client" />
              </SelectTrigger>
              <SelectContent>
                {records.contact.length === 0 ? (
                  <SelectItem value={NO_CLIENT}>No contacts yet</SelectItem>
                ) : null}
                {records.contact.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {recordTitle(contact)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium">Body</span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={mode}
          aria-label="Editor mode"
          onValueChange={(value) => {
            if (value === 'write' || value === 'preview' || value === 'split') setMode(value);
          }}
        >
          <ToggleGroupItem value="write">Write</ToggleGroupItem>
          <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
          <ToggleGroupItem value="split">Split</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className={cn('grid gap-4', mode === 'split' && 'lg:grid-cols-2')}>
        {mode === 'preview' ? null : (
          <Textarea
            aria-label="Document body"
            value={form.body}
            onChange={(event) => update('body', event.target.value)}
            placeholder="Write in Markdown. Use {{client.name}} and {{business.name}} for variables."
            className={cn('resize-y font-mono text-xs leading-relaxed', editorHeight)}
          />
        )}
        {mode === 'write' ? null : (
          <div className={cn('overflow-auto rounded-md border bg-muted/20 p-4', editorHeight)}>
            <Markdown emptyText="Nothing to preview yet.">{preview}</Markdown>
          </div>
        )}
      </div>

      <VariableReference groups={TEMPLATE_VARIABLE_GROUPS} />
    </div>
  );
};
