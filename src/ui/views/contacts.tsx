import { useState } from 'react';
import { PlusIcon, UsersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ContactEditor } from '@/components/contact-editor';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { navigate } from '@/lib/router';
import { recordTitle, useWorkspace } from '@/lib/workspace';

/** Contacts table. Opening a row goes to the read-only contact page. */
export const Contacts = () => {
  const { records } = useWorkspace();
  const [creating, setCreating] = useState(false);

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

      {records.contact.length === 0 ? (
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

      <ContactEditor contactId={null} open={creating} onOpenChange={setCreating} />
    </div>
  );
};
