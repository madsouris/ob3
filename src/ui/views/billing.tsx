import { useEffect, useState } from 'react';
import { CopyIcon, FileTextIcon, PlusIcon, PrinterIcon, ReceiptIcon, Trash2Icon } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/empty-state';
import { DateField } from '@/components/date-field';
import { Field } from '@/components/field';
import { LineItemsEditor, computeTotals, draftsFrom, emptyLine } from '@/components/line-items';
import type { LineItemDraft } from '@/components/line-items';
import { PageHeader } from '@/components/page-header';
import { SheetBody } from '@/components/sheet-body';
import { StatusBadge, invoiceStatus } from '@/components/status-badge';
import { api } from '@/lib/api';
import type { ApiRecord } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { navigate } from '@/lib/router';
import { recordTitle, useWorkspace } from '@/lib/workspace';
import { parseMoney } from '../../model/money.js';

export interface BillingProps {
  readonly type: 'estimate' | 'invoice';
  readonly initialId: string | null;
}

const LABELS = {
  estimate: {
    title: 'Estimates',
    description: 'Proposals with line items. Convert one into an invoice without retyping it.',
    folder: 'estimates/',
    plural: 'estimates',
    emptyTitle: 'No estimates yet',
    emptyDescription: 'Create an estimate, add line items, then convert it once the client accepts.',
    numberLabel: 'Estimate',
    statuses: ['draft', 'sent', 'accepted', 'declined', 'expired'],
    dateLabel: 'Valid until',
  },
  invoice: {
    title: 'Invoices',
    description: 'Bills with totals in integer cents. Overdue is derived from the due date.',
    folder: 'invoices/',
    plural: 'invoices',
    emptyTitle: 'No invoices yet',
    emptyDescription: 'Create an invoice directly, or convert an accepted estimate.',
    numberLabel: 'Invoice',
    statuses: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
    dateLabel: 'Due date',
  },
} as const;

const NO_LINK = '__none';

interface BillingForm {
  number: string;
  title: string;
  client_id: string;
  project_id: string;
  status: string;
  issue_date: string;
  second_date: string;
  currency: string;
  taxPercent: string;
  terms_document: string;
  body: string;
  items: LineItemDraft[];
}

const today = (): string => new Date().toISOString().slice(0, 10);

const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const formFrom = (record: ApiRecord): BillingForm | null => {
  if (record.type !== 'estimate' && record.type !== 'invoice') return null;
  return {
    number: record.type === 'estimate' ? record.estimate_number : record.invoice_number,
    title: record.title,
    client_id: record.client_id,
    project_id: record.project_id,
    status: record.status,
    issue_date: record.issue_date,
    second_date: record.type === 'estimate' ? record.valid_until : record.due_date,
    currency: record.currency,
    taxPercent: (record.tax_rate_bps / 100).toFixed(2),
    terms_document: record.terms_document,
    body: record.body,
    items: draftsFrom(record.line_items),
  };
};

const nextNumber = (type: 'estimate' | 'invoice', list: readonly ApiRecord[]): string => {
  const prefix = type === 'invoice' ? 'INV' : 'EST';
  const year = new Date().getFullYear();
  let highest = 0;

  for (const record of list) {
    const number =
      record.type === 'invoice'
        ? record.invoice_number
        : record.type === 'estimate'
          ? record.estimate_number
          : '';
    const match = new RegExp(`^${prefix}-${year}-(\\d+)$`).exec(number);
    if (match?.[1] !== undefined) highest = Math.max(highest, Number(match[1]));
  }

  return `${prefix}-${year}-${String(highest + 1).padStart(3, '0')}`;
};

export const Billing = ({ type, initialId }: BillingProps) => {
  const { records, upsert, remove, refresh, config } = useWorkspace();
  const meta = LABELS[type];
  const list: readonly ApiRecord[] = type === 'estimate' ? records.estimate : records.invoice;
  const isInvoice = type === 'invoice';

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<BillingForm | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);

  const open = creating || initialId !== null;
  const editing = initialId === null ? null : (list.find((record) => record.id === initialId) ?? null);
  const totals = form === null ? null : computeTotals(form.items, form.taxPercent);

  const emptyForm = (): BillingForm => ({
    number: nextNumber(type, list),
    title: '',
    client_id: '',
    project_id: '',
    status: 'draft',
    issue_date: today(),
    second_date: addDays(today(), isInvoice ? 15 : 30),
    currency: config?.business.currency ?? 'USD',
    taxPercent: ((config?.business.tax_rate_bps ?? 0) / 100).toFixed(2),
    terms_document: config?.default_terms_document ?? '',
    body: '',
    items: [emptyLine()],
  });

  useEffect(() => {
    if (!open) {
      setForm(null);
      setHash(null);
      return;
    }

    if (initialId === null) {
      setForm(emptyForm());
      setHash(null);
      return;
    }

    const current = list.find((record) => record.id === initialId);
    const fromList = current === undefined ? null : formFrom(current);
    if (fromList !== null) setForm(fromList);

    void api
      .get(meta.plural, initialId)
      .then((response) => {
        setHash(response.hash);
        const loaded = formFrom(response.record);
        if (loaded !== null) setForm(loaded);
      })
      .catch(() => undefined);
  }, [open, initialId, type, records.estimate, records.invoice]);

  const close = (): void => {
    setCreating(false);
    navigate(meta.plural);
  };

  const startCreate = (): void => {
    setForm(emptyForm());
    setHash(null);
    setCreating(true);
  };

  const payload = (current: BillingForm, computed: NonNullable<typeof totals>): Record<string, unknown> => ({
    [isInvoice ? 'invoice_number' : 'estimate_number']: current.number,
    title: current.title,
    client_id: current.client_id,
    project_id: current.project_id,
    status: current.status,
    issue_date: current.issue_date,
    ...(isInvoice ? { due_date: current.second_date } : { valid_until: current.second_date }),
    currency: current.currency,
    terms_document: current.terms_document,
    tax_rate_bps: computed.taxRateBps,
    line_items: current.items.map((item, index) => ({
      description: item.description,
      quantity: Number(item.quantity) || 0,
      unit_price_cents: parseMoney(item.unit) ?? 0,
      total_cents: computed.lines[index] ?? 0,
    })),
    body: current.body,
  });

  const save = async (): Promise<void> => {
    if (form === null || totals === null) return;
    if (form.number.trim() === '') {
      toast.error(`${meta.numberLabel} number is required`);
      return;
    }

    setSaving(true);
    try {
      if (creating) {
        const response = await api.create(meta.plural, payload(form, totals));
        upsert(response.record);
        toast.success(`${meta.numberLabel} created`);
        close();
      } else if (editing !== null) {
        const response = await api.update(meta.plural, editing.id, {
          ...payload(form, totals),
          ...(hash === null ? {} : { baseHash: hash }),
        });
        upsert(response.record);
        toast.success(`${meta.numberLabel} saved`);
        close();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async (): Promise<void> => {
    if (editing === null) return;
    try {
      const response = await api.duplicate(meta.plural, editing.id);
      upsert(response.record);
      toast.success('Duplicated as a draft');
      navigate(`${meta.plural}/${response.record.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not duplicate');
    }
  };

  const convert = async (): Promise<void> => {
    if (editing === null) return;
    setConverting(true);
    try {
      const response = await api.invoiceFromEstimate(editing.id);
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

  const destroy = async (): Promise<void> => {
    if (editing === null) return;
    try {
      await api.remove(meta.plural, editing.id, hash ?? undefined);
      remove(editing.id);
      toast.success(`${meta.numberLabel} deleted`);
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete');
    }
  };

  const clients = new Map(
    records.contact.map((contact) => [contact.id, recordTitle(contact)] as const),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          <Button size="sm" onClick={startCreate}>
            <PlusIcon data-icon="inline-start" />
            New {type}
          </Button>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          icon={isInvoice ? ReceiptIcon : FileTextIcon}
          title={meta.emptyTitle}
          description={meta.emptyDescription}
          action={
            <Button size="sm" onClick={startCreate}>
              <PlusIcon data-icon="inline-start" />
              New {type}
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{meta.numberLabel}</TableHead>
                <TableHead className="hidden md:table-cell">Client</TableHead>
                <TableHead className="tabular text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Issued</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((record) => {
                const currency = record.type === 'invoice' || record.type === 'estimate' ? record.currency : 'USD';
                const total = record.type === 'invoice' || record.type === 'estimate' ? record.total_cents : 0;
                const clientId = record.type === 'invoice' || record.type === 'estimate' ? record.client_id : '';
                const issued = record.type === 'invoice' || record.type === 'estimate' ? record.issue_date : '';
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
                    <TableCell className="tabular text-right">
                      {new Intl.NumberFormat(undefined, {
                        style: 'currency',
                        currency: currency === '' ? 'USD' : currency,
                      }).format(total / 100)}
                    </TableCell>
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

      <Sheet open={open} onOpenChange={(next) => (next ? undefined : close())}>
        <SheetContent className="w-full sm:max-w-3xl">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-3 pb-6">
              <SheetHeader>
                <SheetTitle>
                  {creating ? `New ${type}` : `Edit ${type}`}
                </SheetTitle>
                <SheetDescription className="font-mono text-xs">
                  {editing?.path ?? meta.folder}
                </SheetDescription>
              </SheetHeader>

              {form === null ? null : (
                <>
                  <SheetBody>
                    {editing?.type === 'estimate' && editing.converted_invoice_id !== '' ? (
                    <Alert>
                      <AlertTitle>Already converted</AlertTitle>
                      <AlertDescription>
                        An invoice was created from this estimate. Duplicating it makes a fresh
                        draft without touching the link.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                    <Field label={`${meta.numberLabel} number`} htmlFor="billing-number">
                      <Input
                        id="billing-number"
                        value={form.number}
                        onChange={(event) =>
                          setForm((current) =>
                            current === null ? current : { ...current, number: event.target.value },
                          )
                        }
                        className="font-mono"
                      />
                    </Field>
                    <Field label="Title" htmlFor="billing-title">
                      <Input
                        id="billing-title"
                        value={form.title}
                        onChange={(event) =>
                          setForm((current) =>
                            current === null ? current : { ...current, title: event.target.value },
                          )
                        }
                      />
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Client" htmlFor="billing-client">
                      <Select
                        value={form.client_id === '' ? NO_LINK : form.client_id}
                        onValueChange={(value) =>
                          setForm((current) =>
                            current === null
                              ? current
                              : { ...current, client_id: value === NO_LINK ? '' : value },
                          )
                        }
                      >
                        <SelectTrigger id="billing-client" className="w-full">
                          <SelectValue placeholder="No client" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_LINK}>No client</SelectItem>
                          {records.contact.map((contact) => (
                            <SelectItem key={contact.id} value={contact.id}>
                              {recordTitle(contact)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="Project" htmlFor="billing-project">
                      <Select
                        value={form.project_id === '' ? NO_LINK : form.project_id}
                        onValueChange={(value) =>
                          setForm((current) =>
                            current === null
                              ? current
                              : { ...current, project_id: value === NO_LINK ? '' : value },
                          )
                        }
                      >
                        <SelectTrigger id="billing-project" className="w-full">
                          <SelectValue placeholder="No project" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_LINK}>No project</SelectItem>
                          {records.project.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {recordTitle(project)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Status" htmlFor="billing-status">
                      <Select
                        value={form.status}
                        onValueChange={(value) =>
                          setForm((current) =>
                            current === null ? current : { ...current, status: value },
                          )
                        }
                      >
                        <SelectTrigger id="billing-status" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {meta.statuses.map((status) => (
                            <SelectItem key={status} value={status} className="capitalize">
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Issue date" htmlFor="billing-issued">
                      <DateField
                        id="billing-issued"
                        value={form.issue_date}
                        onChange={(value) =>
                          setForm((current) =>
                            current === null ? current : { ...current, issue_date: value },
                          )
                        }
                      />
                    </Field>
                    <Field label={meta.dateLabel} htmlFor="billing-second">
                      <DateField
                        id="billing-second"
                        value={form.second_date}
                        onChange={(value) =>
                          setForm((current) =>
                            current === null ? current : { ...current, second_date: value },
                          )
                        }
                      />
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Currency" htmlFor="billing-currency">
                      <Input
                        id="billing-currency"
                        value={form.currency}
                        maxLength={3}
                        onChange={(event) =>
                          setForm((current) =>
                            current === null
                              ? current
                              : { ...current, currency: event.target.value.toUpperCase() },
                          )
                        }
                        className="font-mono uppercase"
                      />
                    </Field>
                    <Field label="Tax rate %" htmlFor="billing-tax" hint="Stored as basis points.">
                      <Input
                        id="billing-tax"
                        inputMode="decimal"
                        value={form.taxPercent}
                        onChange={(event) =>
                          setForm((current) =>
                            current === null ? current : { ...current, taxPercent: event.target.value },
                          )
                        }
                        className="tabular"
                      />
                    </Field>
                    <Field label="Terms document" htmlFor="billing-terms">
                      <Select
                        value={form.terms_document === '' ? NO_LINK : form.terms_document}
                        onValueChange={(value) =>
                          setForm((current) =>
                            current === null
                              ? current
                              : { ...current, terms_document: value === NO_LINK ? '' : value },
                          )
                        }
                      >
                        <SelectTrigger id="billing-terms" className="w-full">
                          <SelectValue placeholder="No terms" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_LINK}>No terms</SelectItem>
                          {records.document.map((document) => (
                            <SelectItem key={document.id} value={document.path}>
                              {recordTitle(document)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">Line items</span>
                    <LineItemsEditor
                      items={form.items}
                      currency={form.currency}
                      taxPercent={form.taxPercent}
                      onChange={(items) =>
                        setForm((current) => (current === null ? current : { ...current, items }))
                      }
                    />
                  </div>

                  <Field label="Notes" htmlFor="billing-body" hint="Markdown body, preserved as written.">
                    <Textarea
                      id="billing-body"
                      value={form.body}
                      onChange={(event) =>
                        setForm((current) =>
                          current === null ? current : { ...current, body: event.target.value },
                        )
                      }
                      rows={5}
                      className="font-mono text-xs"
                    />
                  </Field>

                  </SheetBody>

                  <SheetFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-1">
                      {editing === null ? null : (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void duplicate()}
                          >
                            <CopyIcon data-icon="inline-start" />
                            Duplicate
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`${meta.plural}/${editing.id}/print`)}
                          >
                            <PrinterIcon data-icon="inline-start" />
                            Print / PDF
                          </Button>
                          {editing.type === 'estimate' && editing.converted_invoice_id === '' ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={converting}
                              onClick={() => void convert()}
                            >
                              <ReceiptIcon data-icon="inline-start" />
                              {converting ? 'Creating…' : 'Create invoice'}
                            </Button>
                          ) : null}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Trash2Icon data-icon="inline-start" />
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this {type}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {editing.path} is removed from disk. Git keeps the previous
                                  version.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => void destroy()}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={close}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => void save()} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  </SheetFooter>
                </>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
};
