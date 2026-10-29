import { useState } from 'react';
import { FileTextIcon, PlusIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DocumentEditor } from '@/components/document-editor';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { navigate } from '@/lib/router';
import { recordTitle, useWorkspace } from '@/lib/workspace';

type ScopeFilter = 'all' | 'global' | 'client';

/** Document list. Opening a row goes to the rendered document page. */
export const Documents = () => {
  const { records } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<ScopeFilter>('all');

  const clients = new Map(
    records.contact.map((contact) => [contact.id, recordTitle(contact)] as const),
  );
  const visible = records.document.filter((document) => {
    if (filter === 'all') return true;
    return document.type === 'document' && document.scope === filter;
  });
  const globalCount = records.document.filter(
    (document) => document.type === 'document' && document.scope === 'global',
  ).length;
  const clientCount = records.document.filter(
    (document) => document.type === 'document' && document.scope === 'client',
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Documents"
        description="Global templates and client-scoped contracts. Open one to render it or print it to A4."
        actions={
          <Button onClick={() => setCreating(true)} size="sm">
            <PlusIcon data-icon="inline-start" />
            New document
          </Button>
        }
      />

      <Tabs
        value={filter}
        onValueChange={(value) =>
          setFilter(value === 'global' || value === 'client' ? value : 'all')
        }
      >
        <TabsList>
          <TabsTrigger value="all">All ({records.document.length})</TabsTrigger>
          <TabsTrigger value="global">Global ({globalCount})</TabsTrigger>
          <TabsTrigger value="client">Client ({clientCount})</TabsTrigger>
        </TabsList>
      </Tabs>

      {visible.length === 0 ? (
        <EmptyState
          icon={FileTextIcon}
          title={filter === 'all' ? 'No documents yet' : `No ${filter} documents`}
          description={
            filter === 'client'
              ? 'Create a client-scoped contract or proposal from a client record.'
              : 'Keep reusable terms and proposal templates here; attach them to estimates and invoices.'
          }
          action={
            <Button onClick={() => setCreating(true)} size="sm">
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
                <TableHead>Scope</TableHead>
                <TableHead className="hidden sm:table-cell">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((document) => (
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
                  <TableCell>
                    {document.type === 'document' && document.scope === 'client' ? (
                      <span className="flex items-center gap-2">
                        <Badge variant="outline">Client</Badge>
                        <span className="truncate text-xs text-muted-foreground">
                          {clients.get(document.client_id) ?? 'Unknown client'}
                        </span>
                      </span>
                    ) : (
                      <Badge variant="secondary">Global</Badge>
                    )}
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

      <DocumentEditor documentId={null} open={creating} onOpenChange={setCreating} />
    </div>
  );
};
