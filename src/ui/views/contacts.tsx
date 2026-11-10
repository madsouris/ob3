import { useState } from 'react';
import { PlusIcon, UsersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { ContactEditor } from '@/components/contact-editor';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { SortableHead, TableControls } from '@/components/table-controls';
import type { SortOption } from '@/components/table-controls';
import type { ApiRecordOf } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { navigate } from '@/lib/router';
import { matchesQuery, sortRows, useTableControls } from '@/lib/table';
import { recordTitle, useWorkspace } from '@/lib/workspace';

type ContactSort = 'name' | 'company' | 'email' | 'status' | 'updated';

const SORT_OPTIONS: readonly SortOption[] = [
  { value: 'name', label: 'Name' },
  { value: 'company', label: 'Company' },
  { value: 'email', label: 'Email' },
  { value: 'status', label: 'Status' },
  { value: 'updated', label: 'Updated' },
];

/** Lifecycle order, not the alphabet. Unknown values sort last. */
const STATUS_RANK: Readonly<Record<string, number>> = {
  lead: 0,
  active: 1,
  inactive: 2,
  archived: 3,
};

const compare = (
  left: ApiRecordOf<'contact'>,
  right: ApiRecordOf<'contact'>,
  field: ContactSort,
): number => {
  switch (field) {
    case 'name':
      return recordTitle(left).localeCompare(recordTitle(right), undefined, {
        sensitivity: 'base',
      });
    case 'company':
      return left.company.localeCompare(right.company, undefined, { sensitivity: 'base' });
    case 'email':
      return left.email.localeCompare(right.email, undefined, { sensitivity: 'base' });
    case 'status':
      return (STATUS_RANK[left.status] ?? 9) - (STATUS_RANK[right.status] ?? 9);
    case 'updated':
      return left.updated_at.localeCompare(right.updated_at);
  }
};

/** Contacts table. Opening a row goes to the read-only contact page. */
export const Contacts = () => {
  const { records } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const controls = useTableControls<ContactSort>('name', { updated: 'desc' });

  const all = records.contact.filter(
    (record): record is ApiRecordOf<'contact'> => record.type === 'contact',
  );
  const rows = sortRows(
    all.filter((contact) =>
      matchesQuery(controls.query, [recordTitle(contact), contact.company, contact.email]),
    ),
    (left, right) => compare(left, right, controls.field),
    controls.direction,
  );
  const filtering = controls.query.trim() !== '';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contacts"
        description="People and companies. Each row is a Markdown file in contacts/."
        actions={
          <Button onClick={() => setCreating(true)} size="sm">
            <PlusIcon data-icon="inline-start" />
            New contact
          </Button>
        }
      />

      {all.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No contacts yet"
          description="Add your first client and ob will write contacts/<id>.md for you."
          action={
            <Button onClick={() => setCreating(true)} size="sm">
              <PlusIcon data-icon="inline-start" />
              New contact
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <TableControls
            search={{
              value: controls.query,
              onChange: controls.setQuery,
              label: 'Search contacts',
              placeholder: 'Search name, company or email',
              ...(filtering ? { count: `${rows.length} of ${all.length}` } : {}),
            }}
            sortOptions={SORT_OPTIONS}
            sortField={controls.field}
            onSortField={(value) => {
              if (
                value === 'name' ||
                value === 'company' ||
                value === 'email' ||
                value === 'status' ||
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
                    label="Name"
                    active={controls.field === 'name'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('name')}
                  />
                  <SortableHead
                    label="Company"
                    className="hidden md:table-cell"
                    active={controls.field === 'company'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('company')}
                  />
                  <SortableHead
                    label="Email"
                    className="hidden lg:table-cell"
                    active={controls.field === 'email'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('email')}
                  />
                  <SortableHead
                    label="Status"
                    active={controls.field === 'status'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('status')}
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
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No contacts match “{controls.query.trim()}”.
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
                  rows.map((contact) => (
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
                        {contact.company === '' ? '—' : contact.company}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {contact.email === '' ? '—' : contact.email}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={contact.status} />
                      </TableCell>
                      <TableCell className="tabular hidden text-xs text-muted-foreground sm:table-cell">
                        {formatDate(contact.updated_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <ContactEditor contactId={null} open={creating} onOpenChange={setCreating} />
    </div>
  );
};
