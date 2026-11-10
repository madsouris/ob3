import { useEffect, useState } from 'react';
import {
  ArrowLeftIcon,
  CopyIcon,
  FileTextIcon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  ReceiptIcon,
  Trash2Icon,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { DocumentSheet } from '@/components/document-sheet';
import { SortableHead, TableControls } from '@/components/table-controls';
import { EmptyState } from '@/components/empty-state';
import { DateField } from '@/components/date-field';
import { Field } from '@/components/field';
import { MarkdownField } from '@/components/markdown-field';
import { LineItemsEditor, computeTotals, draftsFrom, emptyLine } from '@/components/line-items';
import type { LineItemDraft } from '@/components/line-items';
import { DocumentPicker } from '@/components/document-picker';
import { PageHeader } from '@/components/page-header';
import { SheetBody } from '@/components/sheet-body';
import { StatusBadge, invoiceStatus } from '@/components/status-badge';
import { api } from '@/lib/api';
import type { ApiRecord } from '@/lib/api';
import { SORT_FIELDS, filterBills, sortBills } from '@/lib/billing-list';
import type { BillRow, BillSortField } from '@/lib/billing-list';
import { useTableControls } from '@/lib/table';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { valueLabel } from '@/lib/labels';
import { navigate } from '@/lib/router';
import { recordTitle, useWorkspace } from '@/lib/workspace';
import { addDaysIso, todayLocal } from '../../model/dates.js';
import { parseMoney } from '../../model/money.js';

export type BillType = 'estimate' | 'invoice';

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
  document_ids: string[];
  body: string;
  items: LineItemDraft[];
}

const today = (): string => todayLocal();

const addDays = (isoDate: string, days: number): string => addDaysIso(isoDate, days);

const formFrom = (record: ApiRecord, documents: readonly ApiRecord[]): BillingForm | null => {
  if (record.type !== 'estimate' && record.type !== 'invoice') return null;
  const ids = [...record.document_ids];
  if (ids.length === 0 && record.terms_document !== '') {
    const legacy = documents.find(
      (document) => document.type === 'document' && document.path === record.terms_document,
    );
    if (legacy !== undefined) ids.push(legacy.id);
  }

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
    document_ids: ids,
    body: record.body,
    items: draftsFrom(record.line_items),
  };
};

const nextNumber = (type: BillType, list: readonly ApiRecord[]): string => {
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

/* ── Editor (sheet) ────────────────────────────────────────────────────────── */

interface BillingEditorProps {
  readonly type: BillType;
  /** `null` creates a new record; an id edits the existing one. */
  readonly recordId: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved?: (record: ApiRecord) => void;
}

/** The billing form. Opened by the list (create) and by the preview page (edit). */
export const BillingEditor = ({
  type,
  recordId,
  open,
  onOpenChange,
  onSaved,
}: BillingEditorProps) => {
  const { records, upsert, config } = useWorkspace();
  const meta = LABELS[type];
  const list: readonly ApiRecord[] = type === 'estimate' ? records.estimate : records.invoice;
  const isInvoice = type === 'invoice';
  const creating = recordId === null;
  const editing =
    recordId === null ? null : (list.find((record) => record.id === recordId) ?? null);

  const [form, setForm] = useState<BillingForm | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totals = form === null ? null : computeTotals(form.items, form.taxPercent);

  const emptyForm = (): BillingForm => {
    const defaultTerms = records.document.find(
      (document) => document.type === 'document' && document.path === config?.default_terms_document,
    );

    return {
      number: nextNumber(type, list),
      title: '',
      client_id: '',
      project_id: '',
      status: 'draft',
      issue_date: today(),
      second_date: addDays(today(), isInvoice ? 15 : 30),
      currency: config?.business.currency ?? 'USD',
      taxPercent: ((config?.business.tax_rate_bps ?? 0) / 100).toFixed(2),
      document_ids: defaultTerms === undefined ? [] : [defaultTerms.id],
      body: '',
      items: [emptyLine()],
    };
  };

  useEffect(() => {
    if (!open) {
      setForm(null);
      setHash(null);
      return;
    }

    if (recordId === null) {
      setForm(emptyForm());
      setHash(null);
      return;
    }

    const current = list.find((record) => record.id === recordId);
    const fromList = current === undefined ? null : formFrom(current, records.document);
    if (fromList !== null) setForm(fromList);

    void api
      .get(meta.plural, recordId)
      .then((response) => {
        setHash(response.hash);
        const loaded = formFrom(response.record, records.document);
        if (loaded !== null) setForm(loaded);
      })
      .catch(() => undefined);
    // `emptyForm` reads config and the document list; both are covered below.
  }, [open, recordId, type, records.estimate, records.invoice]);

  const close = (): void => onOpenChange(false);

  const payload = (
    current: BillingForm,
    computed: NonNullable<typeof totals>,
  ): Record<string, unknown> => ({
    [isInvoice ? 'invoice_number' : 'estimate_number']: current.number,
    title: current.title,
    client_id: current.client_id,
    project_id: current.project_id,
    status: current.status,
    issue_date: current.issue_date,
    ...(isInvoice ? { due_date: current.second_date } : { valid_until: current.second_date }),
    currency: current.currency,
    terms_document: '',
    document_ids: current.document_ids,
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
        onSaved?.(response.record);
      } else if (editing !== null) {
        const response = await api.update(meta.plural, editing.id, {
          ...payload(form, totals),
          ...(hash === null ? {} : { baseHash: hash }),
        });
        upsert(response.record);
        toast.success(`${meta.numberLabel} saved`);
        close();
        onSaved?.(response.record);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <SheetContent className="w-full sm:max-w-3xl">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-3 pb-6">
            <SheetHeader>
              <SheetTitle>{creating ? `New ${type}` : `Edit ${type}`}</SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {editing?.path ?? meta.folder}
              </SheetDescription>
            </SheetHeader>

            {form === null || totals === null ? null : (
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
                            <SelectItem key={status} value={status}>
                              {valueLabel(status)}
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

                  <div className="grid gap-4 sm:grid-cols-2">
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
                            current === null
                              ? current
                              : { ...current, taxPercent: event.target.value },
                          )
                        }
                        className="tabular"
                      />
                    </Field>
                  </div>

                  <Field
                    label="Attached documents"
                    htmlFor="billing-documents"
                    hint="Rendered after the notes, in this order, with client and invoice variables filled."
                  >
                    <DocumentPicker
                      id="billing-documents"
                      documents={records.document}
                      value={form.document_ids}
                      onChange={(documentIds) =>
                        setForm((current) =>
                          current === null ? current : { ...current, document_ids: documentIds },
                        )
                      }
                    />
                  </Field>

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

                  <MarkdownField
                    id="billing-body"
                    label="Notes"
                    value={form.body}
                    onChange={(value) =>
                      setForm((current) => (current === null ? current : { ...current, body: value }))
                    }
                    rows={5}
                    hint="Markdown body, preserved as written."
                  />
                </SheetBody>

                <SheetFooter className="flex-row items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={close}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => void save()} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                </SheetFooter>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

/* ── List ──────────────────────────────────────────────────────────────────── */

export interface BillingProps {
  readonly type: BillType;
}

const SORT_OPTIONS = SORT_FIELDS.map(({ field, label }) => ({ value: field, label }));

const isSortField = (value: string): value is BillSortField =>
  SORT_FIELDS.some((option) => option.field === value);

export const Billing = ({ type }: BillingProps) => {
  const { records } = useWorkspace();
  const meta = LABELS[type];
  const list: readonly ApiRecord[] = type === 'estimate' ? records.estimate : records.invoice;
  const isInvoice = type === 'invoice';
  const [creating, setCreating] = useState(false);
  const controls = useTableControls<BillSortField>('issued', { issued: 'desc' });

  const clients = new Map(
    records.contact.map((contact) => [contact.id, recordTitle(contact)] as const),
  );

  const allRows: readonly BillRow[] = list.flatMap((record) => {
    if (record.type !== 'invoice' && record.type !== 'estimate') return [];
    return [
      {
        id: record.id,
        type: record.type,
        number: record.type === 'invoice' ? record.invoice_number : record.estimate_number,
        title: record.title,
        clientName: clients.get(record.client_id) ?? '',
        issued: record.issue_date,
        total: record.total_cents,
        currency: record.currency === '' ? 'USD' : record.currency,
        status: record.type === 'invoice' ? invoiceStatus(record) : record.status,
      },
    ];
  });
  const rows = sortBills(
    filterBills(allRows, controls.query),
    controls.field,
    controls.direction,
  );
  const filtering = controls.query.trim() !== '';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
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
            <Button size="sm" onClick={() => setCreating(true)}>
              <PlusIcon data-icon="inline-start" />
              New {type}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <TableControls
            search={{
              value: controls.query,
              onChange: controls.setQuery,
              label: `Search ${meta.plural}`,
              placeholder: 'Search number or client',
              ...(filtering ? { count: `${rows.length} of ${list.length}` } : {}),
            }}
            sortOptions={SORT_OPTIONS}
            sortField={controls.field}
            onSortField={(value) => {
              if (isSortField(value)) controls.selectField(value);
            }}
            direction={controls.direction}
            onToggleDirection={controls.toggleDirection}
          />

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{meta.numberLabel}</TableHead>
                  <SortableHead
                    label="Client"
                    className="hidden md:table-cell"
                    active={controls.field === 'client'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('client')}
                  />
                  <SortableHead
                    label="Total"
                    className="tabular text-right"
                    active={controls.field === 'total'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('total')}
                  />
                  <SortableHead
                    label="Issued"
                    className="hidden sm:table-cell"
                    active={controls.field === 'issued'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('issued')}
                  />
                  <SortableHead
                    label="Status"
                    active={controls.field === 'status'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('status')}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      No {meta.plural} match “{controls.query.trim()}”.
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
                  rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`${meta.plural}/${row.id}`)}
                    >
                      <TableCell>
                        <button
                          type="button"
                          className="text-left font-mono text-sm font-medium hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`${meta.plural}/${row.id}`);
                          }}
                        >
                          {row.number}
                        </button>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {row.clientName === '' ? '—' : row.clientName}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoney(row.total, row.currency)}
                      </TableCell>
                      <TableCell className="tabular hidden text-xs text-muted-foreground sm:table-cell">
                        {formatDate(row.issued)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <BillingEditor
        type={type}
        recordId={null}
        open={creating}
        onOpenChange={setCreating}
        onSaved={(record) => navigate(`${meta.plural}/${record.id}`)}
      />
    </div>
  );
};

/* ── Preview ───────────────────────────────────────────────────────────────── */

export interface BillingDetailProps {
  readonly type: BillType;
  readonly id: string;
}

export const BillingDetail = ({ type, id }: BillingDetailProps) => {
  const { records, config, loading, upsert, remove, refresh } = useWorkspace();
  const meta = LABELS[type];
  const isInvoice = type === 'invoice';
  const record =
    type === 'invoice'
      ? (records.invoice.find((item) => item.id === id) ?? null)
      : (records.estimate.find((item) => item.id === id) ?? null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && record === null) navigate(meta.plural);
  }, [loading, record, meta.plural]);

  if (record === null) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate(meta.plural)}>
          <ArrowLeftIcon data-icon="inline-start" />
          All {meta.plural}
        </Button>
        {loading ? null : (
          <Alert>
            <AlertTitle>{meta.numberLabel} not found</AlertTitle>
            <AlertDescription>Returning to the list…</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  const client = records.contact.find((contact) => contact.id === record.client_id) ?? null;
  const project = records.project.find((item) => item.id === record.project_id) ?? null;
  const currency = record.currency === '' ? (config?.business.currency ?? 'USD') : record.currency;
  const status = record.type === 'invoice' ? invoiceStatus(record) : record.status;
  const number = record.type === 'invoice' ? record.invoice_number : record.estimate_number;
  const secondDate = record.type === 'invoice' ? record.due_date : record.valid_until;
  const converted = record.type === 'estimate' && record.converted_invoice_id !== '';

  const setStatus = async (next: string): Promise<void> => {
    setBusy(true);
    try {
      const response = await api.update(meta.plural, record.id, { status: next });
      upsert(response.record);
      toast.success(`Marked ${valueLabel(next).toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the status');
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (): Promise<void> => {
    try {
      const response = await api.duplicate(meta.plural, record.id);
      upsert(response.record);
      toast.success('Duplicated as a draft');
      navigate(`${meta.plural}/${response.record.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not duplicate');
    }
  };

  const convert = async (): Promise<void> => {
    if (record.type !== 'estimate') return;
    setBusy(true);
    try {
      const response = await api.invoiceFromEstimate(record.id);
      upsert(response.record);
      await refresh();
      toast.success('Invoice created from estimate');
      navigate(`invoices/${response.record.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the invoice');
    } finally {
      setBusy(false);
    }
  };

  const destroy = async (): Promise<void> => {
    try {
      await api.remove(meta.plural, record.id);
      remove(record.id);
      toast.success(`${meta.numberLabel} deleted`);
      navigate(meta.plural);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete');
    }
  };

  const quickAction = (): { label: string; next: string } | null => {
    if (isInvoice) {
      if (status === 'draft') return { label: 'Mark sent', next: 'sent' };
      if (status === 'sent' || status === 'overdue') return { label: 'Mark paid', next: 'paid' };
      return null;
    }
    if (status === 'draft') return { label: 'Mark sent', next: 'sent' };
    if (status === 'sent') return { label: 'Mark accepted', next: 'accepted' };
    return null;
  };
  const action = quickAction();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate(meta.plural)}>
          <ArrowLeftIcon data-icon="inline-start" />
          All {meta.plural}
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          {action === null ? null : (
            <Button size="sm" disabled={busy} onClick={() => void setStatus(action.next)}>
              {action.label}
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void duplicate()}>
            <CopyIcon data-icon="inline-start" />
            Duplicate
          </Button>
          {record.type === 'estimate' && !converted ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void convert()}>
              <ReceiptIcon data-icon="inline-start" />
              {busy ? 'Creating…' : 'Create invoice'}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`${meta.plural}/${record.id}/print`)}
          >
            <PrinterIcon data-icon="inline-start" />
            Print / PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <PencilIcon data-icon="inline-start" />
            Edit
          </Button>
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
                  {record.path} is removed from disk. Git keeps the previous version.
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
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-xl font-semibold tracking-tight">{number}</h1>
          <StatusBadge status={status} />
          {record.title === '' ? null : (
            <span className="text-sm text-muted-foreground">{record.title}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {client === null ? 'No client' : recordTitle(client)}
            {project === null ? '' : ` · ${recordTitle(project)}`}
          </span>
          <span className="tabular">Issued {formatDate(record.issue_date)}</span>
          <span className="tabular">
            {isInvoice ? 'Due' : 'Valid until'} {formatDate(secondDate)}
          </span>
          <span className="tabular font-medium text-foreground">
            {formatMoney(record.total_cents, currency)}
          </span>
          {record.type === 'invoice' && record.paid_at !== '' ? (
            <span className="tabular">Paid {formatDateTime(record.paid_at)}</span>
          ) : null}
          <span className="font-mono text-[11px]">{record.path}</span>
        </div>
      </div>

      <div className="print-shell rounded-lg bg-muted/40 p-3 md:p-6">
        <DocumentSheet
          type={type}
          record={record}
          client={client}
          project={project}
          documents={records.document}
          config={config}
          variant="preview"
        />
      </div>

      <BillingEditor
        type={type}
        recordId={record.id}
        open={editing}
        onOpenChange={setEditing}
      />
    </div>
  );
};
