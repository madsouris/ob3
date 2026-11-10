import { useEffect, useState } from 'react';
import {
  ArrowLeftIcon,
  CalendarIcon,
  PencilIcon,
  PrinterIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Markdown } from '@/components/markdown';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { navigate } from '@/lib/router';
import { templateVariablesFor } from '@/lib/document-variables';
import { renderTemplate } from '@/lib/template';
import { recordTitle, useWorkspace } from '@/lib/workspace';

export interface DocumentDetailProps {
  readonly documentId: string;
}

export const DocumentDetail = ({ documentId }: DocumentDetailProps) => {
  const { records, config, loading, remove } = useWorkspace();
  const [deleting, setDeleting] = useState(false);

  const document = records.document.find((record) => record.id === documentId) ?? null;
  const client =
    document === null ||
    document.type !== 'document' ||
    document.scope !== 'client' ||
    document.client_id === ''
      ? null
      : (records.contact.find((contact) => contact.id === document.client_id) ?? null);

  useEffect(() => {
    if (!loading && document === null) navigate('documents');
  }, [loading, document]);

  if (document === null) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate('documents')}>
          <ArrowLeftIcon data-icon="inline-start" />
          All documents
        </Button>
        {loading ? null : (
          <Alert>
            <AlertTitle>Document not found</AlertTitle>
            <AlertDescription>Returning to the document list…</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  const variables = templateVariablesFor({ config, client });
  const content = renderTemplate(document.body, variables);
  const scopeLabel = document.scope === 'client' ? 'Client document' : 'Global template';
  const isDefaultTerms = config?.default_terms_document === document.path;

  const destroy = async (): Promise<void> => {
    setDeleting(true);
    try {
      await api.remove('documents', document.id);
      remove(document.id);
      toast.success('Document deleted');
      navigate('documents');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the document');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('documents')}>
          <ArrowLeftIcon data-icon="inline-start" />
          All documents
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`documents/${document.id}/print`)}
          >
            <PrinterIcon data-icon="inline-start" />
            Print / PDF
          </Button>
          <Button size="sm" onClick={() => navigate(`documents/${document.id}/edit`)}>
            <PencilIcon data-icon="inline-start" />
            Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={deleting}>
                <Trash2Icon data-icon="inline-start" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                <AlertDialogDescription>
                  {document.path} is removed from disk. Git keeps the previous version.
                  {isDefaultTerms
                    ? ' This is the template attached to new estimates and invoices; deleting it leaves them without default terms.'
                    : ''}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void destroy()}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{recordTitle(document)}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={document.kind} />
          <Badge variant="outline">{scopeLabel}</Badge>
          {document.scope === 'client' ? (
            client === null ? (
              <Badge variant="destructive">Unknown client</Badge>
            ) : (
              <Button
                variant="link"
                size="sm"
                className="h-auto px-0 text-xs"
                onClick={() => navigate(`contacts/${client.id}`)}
              >
                <UserIcon data-icon="inline-start" />
                {recordTitle(client)}
              </Button>
            )
          ) : null}
          <Badge variant="outline">Updated {formatDate(document.updated_at)}</Badge>
          <span className="font-mono text-[11px] text-muted-foreground">{document.path}</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Content</CardTitle>
            <CardDescription>
              Variables are filled from your business and the linked client; unknown placeholders
              stay visible.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Markdown emptyText="This document has no body yet.">{content}</Markdown>
          </CardContent>
        </Card>

        <Card className="self-start bg-transparent shadow-none border">
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>From the frontmatter.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Kind</span>
              <span className="capitalize">{document.kind}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Scope</span>
              <span>{scopeLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Client</span>
              <span className="truncate">
                {client === null
                  ? document.scope === 'client'
                    ? 'Unknown'
                    : '—'
                  : recordTitle(client)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-muted-foreground">
                <CalendarIcon aria-hidden />
                Created
              </span>
              <span>{formatDateTime(document.created_at)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-muted-foreground">
                <CalendarIcon aria-hidden />
                Updated
              </span>
              <span>{formatDateTime(document.updated_at)}</span>
            </div>
            <div className="border-t pt-3">
              <p className="mb-1 text-xs text-muted-foreground">File</p>
              <p className="font-mono text-[11px] break-all">{document.path}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
