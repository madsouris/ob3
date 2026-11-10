import { useState } from 'react';
import { FileTextIcon, PlusIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { SortableHead, TableControls } from '@/components/table-controls';
import type { SortOption } from '@/components/table-controls';
import type { ApiRecordOf } from '@/lib/api';
import { DOCUMENT_KIND_OPTIONS } from '@/lib/document-kinds';
import { formatDate } from '@/lib/format';
import { navigate } from '@/lib/router';
import { matchesQuery, sortRows, useTableControls } from '@/lib/table';
import { recordTitle, useWorkspace } from '@/lib/workspace';

type ScopeFilter = 'all' | 'global' | 'client';
type DocumentSort = 'title' | 'kind' | 'scope' | 'updated';

const SORT_OPTIONS: readonly SortOption[] = [
  { value: 'title', label: 'Title' },
  { value: 'kind', label: 'Kind' },
  { value: 'scope', label: 'Scope' },
  { value: 'updated', label: 'Updated' },
];

const SCOPE_RANK: Readonly<Record<string, number>> = { global: 0, client: 1 };

/** Document list. Opening a row goes to the rendered document page. */
export const Documents = () => {
  const { records } = useWorkspace();
  const [filter, setFilter] = useState<ScopeFilter>('all');
  const controls = useTableControls<DocumentSort>('title', { updated: 'desc' });

  const all = records.document.filter(
    (record): record is ApiRecordOf<'document'> => record.type === 'document',
  );
  const clients = new Map(
    records.contact.map((contact) => [contact.id, recordTitle(contact)] as const),
  );
  const scoped = all.filter((document) => filter === 'all' || document.scope === filter);
  const globalCount = all.filter((document) => document.scope === 'global').length;
  const clientCount = all.filter((document) => document.scope === 'client').length;

  const compare = (left: ApiRecordOf<'document'>, right: ApiRecordOf<'document'>): number => {
    switch (controls.field) {
      case 'title':
        return recordTitle(left).localeCompare(recordTitle(right), undefined, {
          sensitivity: 'base',
        });
      case 'kind': {
        const leftRank = DOCUMENT_KIND_OPTIONS.indexOf(left.kind);
        const rightRank = DOCUMENT_KIND_OPTIONS.indexOf(right.kind);
        return (
          (leftRank === -1 ? DOCUMENT_KIND_OPTIONS.length : leftRank) -
          (rightRank === -1 ? DOCUMENT_KIND_OPTIONS.length : rightRank)
        );
      }
      case 'scope':
        return (SCOPE_RANK[left.scope] ?? 9) - (SCOPE_RANK[right.scope] ?? 9);
      case 'updated':
        return left.updated_at.localeCompare(right.updated_at);
    }
  };

  const rows = sortRows(
    scoped.filter((document) => matchesQuery(controls.query, [recordTitle(document)])),
    compare,
    controls.direction,
  );
  const filtering = controls.query.trim() !== '';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Documents"
        description="Global templates and client-scoped contracts. Open one to render it or print it to A4."
        actions={
          <Button onClick={() => navigate('documents/new')} size="sm">
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
          <TabsTrigger value="all">All ({all.length})</TabsTrigger>
          <TabsTrigger value="global">Global ({globalCount})</TabsTrigger>
          <TabsTrigger value="client">Client ({clientCount})</TabsTrigger>
        </TabsList>
      </Tabs>

      {scoped.length === 0 ? (
        <EmptyState
          icon={FileTextIcon}
          title={filter === 'all' ? 'No documents yet' : `No ${filter} documents`}
          description={
            filter === 'client'
              ? 'Create a client-scoped contract or proposal from a client record.'
              : 'Keep reusable terms and proposal templates here; attach them to estimates and invoices.'
          }
          action={
            <Button onClick={() => navigate('documents/new')} size="sm">
              <PlusIcon data-icon="inline-start" />
              New document
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <TableControls
            search={{
              value: controls.query,
              onChange: controls.setQuery,
              label: 'Search documents',
              placeholder: 'Search title',
              ...(filtering ? { count: `${rows.length} of ${scoped.length}` } : {}),
            }}
            sortOptions={SORT_OPTIONS}
            sortField={controls.field}
            onSortField={(value) => {
              if (
                value === 'title' ||
                value === 'kind' ||
                value === 'scope' ||
                value === 'updated'
              ) {
                controls.selectField(value);
              }
            }}
            direction={controls.direction}
            onToggleDirection={controls.toggleDirection}
          />

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="Title"
                    active={controls.field === 'title'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('title')}
                  />
                  <SortableHead
                    label="Kind"
                    active={controls.field === 'kind'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('kind')}
                  />
                  <SortableHead
                    label="Scope"
                    active={controls.field === 'scope'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('scope')}
                  />
                  <SortableHead
                    label="Updated"
                    className="hidden sm:table-cell"
                    active={controls.field === 'updated'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('updated')}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No documents match “{controls.query.trim()}”.
                      <Button
                        variant="link"
                        size="sm"
                        className="ml-1 h-auto px-0"
                        onClick={() => controls.setQuery('')}
                      >
                        Clear search
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((document) => (
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
                        <StatusBadge status={document.kind} />
                      </TableCell>
                      <TableCell>
                        {document.scope === 'client' ? (
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
};
