import { useState } from 'react';
import { FileTextIcon, ReceiptIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge, invoiceStatus } from '@/components/status-badge';
import { api } from '@/lib/api';
import type { ApiRecord } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { navigate } from '@/lib/router';
import { recordTitle, useWorkspace } from '@/lib/workspace';

export interface BillingProps {
  readonly type: 'estimate' | 'invoice';
  readonly initialId: string | null;
}

const LABELS = {
  estimate: {
    title: 'Estimates',
    description: 'Proposals with line items. Converting one creates an invoice and links both files.',
    folder: 'estimates/',
    plural: 'estimates',
    emptyTitle: 'No estimates yet',
    emptyDescription: 'Estimates are created from a client and a set of line items.',
    number: 'Estimate',
  },
  invoice: {
    title: 'Invoices',
    description: 'Bills with totals in integer cents. Overdue is derived from the due date, never written.',
    folder: 'invoices/',
    plural: 'invoices',
    emptyTitle: 'No invoices yet',
    emptyDescription: 'An invoice can be created directly or from an accepted estimate.',
    number: 'Invoice',
  },
} as const;

export const Billing = ({ type, initialId }: BillingProps) => {
  const { records, upsert, refresh, config } = useWorkspace();
  const meta = LABELS[type];
  const list: readonly ApiRecord[] = type === 'estimate' ? records.estimate : records.invoice;
  const selected = initialId === null ? null : (list.find((item) => item.id === initialId) ?? null);
  const [converting, setConverting] = useState(false);
  const clients = new Map(
    records.contact.map((contact) => [contact.id, recordTitle(contact)] as const),
  );

  const convert = async (estimateId: string): Promise<void> => {
    setConverting(true);
    try {
      const response = await api.invoiceFromEstimate(estimateId);
      upsert(response.record);
      await refresh();
      toast.success('Invoice created from estimate');
      navigate(`invoices/${response.record.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the invoice');
    } finally {
      setConverting(false);
    }
  };

  const close = (): void => navigate(meta.plural);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={meta.title} description={meta.description} />

      {list.length === 0 ? (
        <EmptyState
          icon={type === 'estimate' ? FileTextIcon : ReceiptIcon}
          title={meta.emptyTitle}
          description={meta.emptyDescription}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{meta.number}</TableHead>
                <TableHead className="hidden md:table-cell">Client</TableHead>
                <TableHead className="tabular text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Issued</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((record) => {
                const currency =
                  record.type === 'invoice' || record.type === 'estimate'
                    ? record.currency === ''
                      ? config?.business.currency ?? 'USD'
                      : record.currency
                    : 'USD';
                const total =
                  record.type === 'invoice' || record.type === 'estimate' ? record.total_cents : 0;
                const clientId =
                  record.type === 'invoice' || record.type === 'estimate' ? record.client_id : '';
                const issued =
                  record.type === 'invoice' || record.type === 'estimate' ? record.issue_date : '';
                const status =
                  record.type === 'invoice'
                    ? invoiceStatus(record)
                    : record.type === 'estimate'
                      ? record.status
                      : 'draft';

                return (
                  <TableRow
                    key={record.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`${meta.plural}/${record.id}`)}
                  >
                    <TableCell>
                      <button
                        type="button"
                        className="text-left font-mono text-sm font-medium hover:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`${meta.plural}/${record.id}`);
                        }}
                      >
                        {recordTitle(record)}
                      </button>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {clients.get(clientId) ?? '—'}
                    </TableCell>
                    <TableCell className="tabular text-right">{formatMoney(total, currency)}</TableCell>
                    <TableCell>
                      <StatusBadge status={status} />
                    </TableCell>
                    <TableCell className="tabular hidden text-xs text-muted-foreground sm:table-cell">
                      {formatDate(issued)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={selected !== null} onOpenChange={(next) => (next ? undefined : close())}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {selected === null ? null : (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono text-base">
                  {recordTitle(selected)}
                </DialogTitle>
                <DialogDescription>
                  {selected.type === 'invoice' || selected.type === 'estimate'
                    ? selected.title
                    : ''}
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {selected.path}
                  </span>
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={
                    selected.type === 'invoice'
                      ? invoiceStatus(selected)
                      : selected.type === 'estimate'
                        ? selected.status
                        : 'draft'
                  }
                />
                <Badge variant="outline">
                  {clients.get(
                    selected.type === 'invoice' || selected.type === 'estimate'
                      ? selected.client_id
                      : '',
                  ) ?? 'No client'}
                </Badge>
                {selected.type === 'invoice' || selected.type === 'estimate' ? (
                  <>
                    <Badge variant="outline">Issued {formatDate(selected.issue_date)}</Badge>
                    <Badge variant="outline">
                      {selected.type === 'invoice'
                        ? `Due ${formatDate(selected.due_date)}`
                        : `Valid until ${formatDate(selected.valid_until)}`}
                    </Badge>
                  </>
                ) : null}
              </div>

              {selected.type === 'invoice' || selected.type === 'estimate' ? (
                <>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead className="tabular w-20 text-right">Qty</TableHead>
                          <TableHead className="tabular w-32 text-right">Unit</TableHead>
                          <TableHead className="tabular w-32 text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selected.line_items.map((line, index) => (
                          <TableRow key={`${selected.id}-line-${index}`}>
                            <TableCell>{line.description}</TableCell>
                            <TableCell className="tabular text-right">{line.quantity}</TableCell>
                            <TableCell className="tabular text-right">
                              {formatMoney(line.unit_price_cents, selected.currency)}
                            </TableCell>
                            <TableCell className="tabular text-right">
                              {formatMoney(line.total_cents, selected.currency)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-col gap-1 self-end text-sm">
                    <div className="flex justify-between gap-8">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="tabular">
                        {formatMoney(selected.subtotal_cents, selected.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-8">
                      <span className="text-muted-foreground">
                        Tax ({(selected.tax_rate_bps / 100).toFixed(2)}%)
                      </span>
                      <span className="tabular">
                        {formatMoney(selected.tax_amount_cents, selected.currency)}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between gap-8 font-medium">
                      <span>Total</span>
                      <span className="tabular">
                        {formatMoney(selected.total_cents, selected.currency)}
                      </span>
                    </div>
                  </div>
                </>
              ) : null}

              {selected.body.trim() === '' ? null : (
                <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
                  {selected.body}
                </pre>
              )}

              {type === 'estimate' && selected.type === 'estimate' ? (
                <div className="flex items-center justify-between gap-3 border-t pt-4">
                  <p className="text-xs text-muted-foreground">
                    {selected.converted_invoice_id === ''
                      ? 'Converting writes a new invoice file and links it here.'
                      : 'This estimate has already been converted.'}
                  </p>
                  <Button
                    size="sm"
                    disabled={converting || selected.converted_invoice_id !== ''}
                    onClick={() => void convert(selected.id)}
                  >
                    {converting ? 'Creating…' : 'Create invoice'}
                  </Button>
                </div>
              ) : null}

              <p className="text-xs text-muted-foreground">
                Line-item editing and printing land in the next milestone. The file is the source of
                truth until then.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
