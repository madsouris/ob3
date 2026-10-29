import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  Building2Icon,
  CalendarIcon,
  FolderIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  ReceiptIcon,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ContactEditor } from '@/components/contact-editor';
import { Markdown } from '@/components/markdown';
import { StatusBadge, invoiceStatus } from '@/components/status-badge';
import { formatDate, formatMoney, pluralize } from '@/lib/format';
import { navigate } from '@/lib/router';
import { recordTitle, useWorkspace } from '@/lib/workspace';
import type { ApiRecordOf } from '@/lib/api';

const initials = (contact: ApiRecordOf<'contact'>): string => {
  const value = `${contact.first_name.charAt(0)}${contact.last_name.charAt(0)}`.trim();
  return value === '' ? '?' : value.toUpperCase();
};

const externalHref = (value: string): string =>
  /^https?:\/\//i.test(value) ? value : `https://${value}`;

const DetailRow = ({
  icon,
  label,
  children,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly children: ReactNode;
}) => (
  <div className="flex items-start justify-between gap-3 text-sm">
    <span className="flex items-center gap-2 text-muted-foreground">
      {icon}
      {label}
    </span>
    <span className="min-w-0 truncate text-right">{children}</span>
  </div>
);

const LinkValue = ({ href, children }: { readonly href: string; readonly children: ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="underline underline-offset-4 hover:text-foreground"
  >
    {children}
  </a>
);

export interface ContactDetailProps {
  readonly contactId: string;
}

export const ContactDetail = ({ contactId }: ContactDetailProps) => {
  const { records, config, loading } = useWorkspace();
  const [editing, setEditing] = useState(false);

  const contact = records.contact.find((record) => record.id === contactId) ?? null;

  useEffect(() => {
    if (!loading && contact === null) navigate('contacts');
  }, [loading, contact]);

  if (contact === null) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('contacts')}>
          <ArrowLeftIcon data-icon="inline-start" />
          All contacts
        </Button>
        {loading ? null : (
          <Alert>
            <AlertTitle>Contact not found</AlertTitle>
            <AlertDescription>Returning to the contact list…</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  const currency = config?.business.currency ?? 'USD';
  const fullName = `${contact.first_name} ${contact.last_name}`.trim();
  const subtitle = [contact.job_role, contact.company].filter((value) => value !== '').join(' · ');
  const projects = records.project.filter((project) => project.client_id === contact.id);
  const estimates = records.estimate.filter((estimate) => estimate.client_id === contact.id);
  const invoices = records.invoice.filter((invoice) => invoice.client_id === contact.id);
  const billing = [...estimates, ...invoices].sort((left, right) =>
    right.issue_date.localeCompare(left.issue_date),
  );

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="h-auto self-start px-0 text-muted-foreground"
        onClick={() => navigate('contacts')}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        All contacts
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full border bg-accent font-mono text-lg font-semibold text-accent-foreground">
            {initials(contact)}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {fullName === '' ? 'Unnamed contact' : fullName}
            </h1>
            {subtitle === '' ? null : (
              <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={contact.status} />
              <Badge variant="outline">{pluralize(projects.length, 'project')}</Badge>
              <Badge variant="outline">{pluralize(billing.length, 'document')}</Badge>
            </div>
          </div>
        </div>

        <Button size="sm" onClick={() => setEditing(true)}>
          <PencilIcon data-icon="inline-start" />
          Edit
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
              <CardDescription>The contact file body, rendered as Markdown.</CardDescription>
            </CardHeader>
            <CardContent>
              <Markdown emptyText="No notes for this contact yet.">{contact.body}</Markdown>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Projects</CardTitle>
              <CardDescription>
                {pluralize(projects.length, 'project')} for this client.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects for this client yet.</p>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => navigate(`projects/${project.id}`)}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FolderIcon aria-hidden className="text-muted-foreground" />
                      <span className="truncate text-sm font-medium">{recordTitle(project)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={project.status} />
                      <ArrowUpRightIcon aria-hidden className="text-muted-foreground" />
                    </span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Billing</CardTitle>
              <CardDescription>Estimates and invoices addressed to this client.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {billing.length === 0 ? (
                <p className="text-sm text-muted-foreground">No estimates or invoices yet.</p>
              ) : (
                billing.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() =>
                      navigate(
                        `${record.type === 'invoice' ? 'invoices' : 'estimates'}/${record.id}`,
                      )
                    }
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ReceiptIcon aria-hidden className="text-muted-foreground" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-mono text-xs">{recordTitle(record)}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {formatDate(record.issue_date)}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular text-sm">
                        {formatMoney(
                          record.total_cents,
                          record.currency === '' ? currency : record.currency,
                        )}
                      </span>
                      <StatusBadge
                        status={record.type === 'invoice' ? invoiceStatus(record) : record.status}
                      />
                    </span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>Read from the frontmatter.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {contact.email === '' ? null : (
              <DetailRow icon={<MailIcon aria-hidden />} label="Email">
                <LinkValue href={`mailto:${contact.email}`}>{contact.email}</LinkValue>
              </DetailRow>
            )}
            {contact.phone_number === '' ? null : (
              <DetailRow icon={<PhoneIcon aria-hidden />} label="Phone">
                <LinkValue href={`tel:${contact.phone_number.replace(/\s+/g, '')}`}>
                  {contact.phone_number}
                </LinkValue>
              </DetailRow>
            )}
            {contact.website === '' ? null : (
              <DetailRow icon={<Building2Icon aria-hidden />} label="Website">
                <LinkValue href={externalHref(contact.website)}>{contact.website}</LinkValue>
              </DetailRow>
            )}
            {contact.primary_link === '' ? null : (
              <DetailRow icon={<ArrowUpRightIcon aria-hidden />} label="Primary link">
                <LinkValue href={externalHref(contact.primary_link)}>
                  {contact.primary_link}
                </LinkValue>
              </DetailRow>
            )}
            <DetailRow icon={<CalendarIcon aria-hidden />} label="Created">
              {formatDate(contact.created_at)}
            </DetailRow>
            <DetailRow icon={<CalendarIcon aria-hidden />} label="Updated">
              {formatDate(contact.updated_at)}
            </DetailRow>
            <div className="border-t pt-3">
              <p className="mb-1 text-xs text-muted-foreground">File</p>
              <p className="font-mono text-[11px] break-all">{contact.path}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <ContactEditor contactId={contact.id} open={editing} onOpenChange={setEditing} />
    </div>
  );
};
