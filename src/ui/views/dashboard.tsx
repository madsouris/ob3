import { AlertTriangleIcon, ArrowRightIcon, CheckCircle2Icon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { StatusBadge, invoiceStatus } from '@/components/status-badge';
import { formatDate, formatMoney, pluralize } from '@/lib/format';
import { navigate } from '@/lib/router';
import { recordTitle, useWorkspace } from '@/lib/workspace';

const COLUMNS = [
  { status: 'todo', label: 'To do' },
  { status: 'doing', label: 'Doing' },
  { status: 'done', label: 'Done' },
] as const;

const sumTotals = (invoices: readonly { readonly total_cents: number }[]): number =>
  invoices.reduce((sum, invoice) => sum + invoice.total_cents, 0);

export const Dashboard = () => {
  const { records, issues, config } = useWorkspace();
  const currency = config?.business.currency ?? 'USD';

  const activeProjects = records.project.filter((project) => project.status === 'active');
  const openTasks = records.task.filter((task) => task.status !== 'done');

  // Revenue is paid invoices, bucketed by `issue_date` (UTC). Outstanding is
  // issued but unpaid: sent or derived-overdue. Drafts are not owed yet.
  const paidInvoices = records.invoice.filter((invoice) => invoice.status === 'paid');
  const openInvoices = records.invoice.filter((invoice) => {
    const status = invoiceStatus(invoice);
    return status === 'sent' || status === 'overdue';
  });

  const monthPrefix = new Date().toISOString().slice(0, 7);
  const totalRevenue = sumTotals(paidInvoices);
  const monthRevenue = sumTotals(
    paidInvoices.filter((invoice) => invoice.issue_date.startsWith(monthPrefix)),
  );
  const outstanding = sumTotals(openInvoices);
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date());

  const clients = new Map(
    records.contact.map((contact) => [contact.id, recordTitle(contact)] as const),
  );

  const stats = [
    {
      label: 'Contacts',
      value: String(records.contact.length),
      hint: pluralize(records.contact.filter((c) => c.status === 'active').length, 'active'),
      view: 'contacts',
    },
    {
      label: 'Active projects',
      value: String(activeProjects.length),
      hint: pluralize(records.project.length, 'project'),
      view: 'projects',
    },
    {
      label: 'Open tasks',
      value: String(openTasks.length),
      hint: pluralize(records.task.length, 'task'),
      view: 'tasks',
    },
    {
      label: 'Outstanding',
      value: formatMoney(outstanding, currency),
      hint: pluralize(openInvoices.length, 'open invoice'),
      view: 'invoices',
    },
  ] as const;

  const revenue = [
    {
      label: 'Total revenue',
      value: formatMoney(totalRevenue, currency),
      hint: pluralize(paidInvoices.length, 'paid invoice'),
    },
    {
      label: 'This month',
      value: formatMoney(monthRevenue, currency),
      hint: monthLabel,
    },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {config?.business.name === undefined || config.business.name === ''
            ? 'Your workspace'
            : config.business.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Everything here is a file in your workspace. Edit it in any editor; this view follows.
        </p>
      </div>

      {issues.length > 0 ? (
        <Alert className="border-dashed">
          <AlertTriangleIcon aria-hidden />
          <AlertTitle>{pluralize(issues.length, 'file needs')} attention</AlertTitle>
          <AlertDescription>
            <span className="text-muted-foreground">
              {issues
                .slice(0, 2)
                .map((issue) => issue.code)
                .join(', ')}
              {issues.length > 2 ? ' and more' : ''}
            </span>
            <Button
              variant="link"
              size="sm"
              className="h-auto px-0"
              onClick={() => navigate('issues')}
            >
              Review them
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2Icon aria-hidden className="size-3.5 text-primary/70" />
          Workspace is consistent — every record parsed and every reference resolves.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="tabular text-2xl font-semibold">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <Button
                variant="link"
                size="sm"
                className="h-auto px-0 text-muted-foreground"
                onClick={() => navigate(stat.view)}
              >
                {stat.hint}
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue</CardTitle>
          <CardDescription>
            Paid invoices, by issue date (UTC). Outstanding counts invoices that are sent or
            overdue.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {revenue.map((figure) => (
            <div key={figure.label} className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">{figure.label}</span>
              <span className="tabular text-2xl font-semibold">{figure.value}</span>
              <span className="text-xs text-muted-foreground">{figure.hint}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Task board</CardTitle>
            <CardDescription>Columns are folders: tasks/todo, doing, done.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {COLUMNS.map((column) => {
              const tasks = records.task
                .filter((task) => task.status === column.status)
                .sort((left, right) =>
                  left.type === 'task' && right.type === 'task' ? left.order - right.order : 0,
                )
                .slice(0, 4);

              return (
                <div key={column.status} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {column.label}
                    </span>
                    <Badge variant="secondary">
                      {records.task.filter((task) => task.status === column.status).length}
                    </Badge>
                  </div>
                  {tasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing here.</p>
                  ) : (
                    tasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => navigate(`tasks/${task.id}`)}
                        className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                      >
                        <span className="truncate">{recordTitle(task)}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(task.type === 'task' ? task.due_date : '')}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              );
            })}
            <Separator />
            <Button variant="ghost" size="sm" onClick={() => navigate('tasks')}>
              Open the board
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent invoices</CardTitle>
            <CardDescription>Newest first, by issue date.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {records.invoice.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              [...records.invoice]
                .sort((left, right) =>
                  left.type === 'invoice' && right.type === 'invoice'
                    ? right.issue_date.localeCompare(left.issue_date)
                    : 0,
                )
                .slice(0, 5)
                .map((invoice) => (
                  <button
                    key={invoice.id}
                    type="button"
                    onClick={() => navigate(`invoices/${invoice.id}`)}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{recordTitle(invoice)}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {invoice.type === 'invoice'
                          ? clients.get(invoice.client_id) ?? 'No client'
                          : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="tabular text-sm">
                        {invoice.type === 'invoice'
                          ? formatMoney(
                              invoice.total_cents,
                              invoice.currency === '' ? currency : invoice.currency,
                            )
                          : ''}
                      </span>
                      <StatusBadge
                        status={invoice.type === 'invoice' ? invoiceStatus(invoice) : 'draft'}
                      />
                    </span>
                  </button>
                ))
            )}
            <Separator />
            <Button variant="ghost" size="sm" onClick={() => navigate('invoices')}>
              All invoices
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
