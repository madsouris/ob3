import { Badge } from '@/components/ui/badge';
import type { ApiRecord } from '@/lib/api';
import { formatToday } from '@/lib/format';
import { valueLabel } from '@/lib/labels';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const VARIANTS: Readonly<Record<string, BadgeVariant>> = {
  active: 'default',
  lead: 'secondary',
  inactive: 'outline',
  archived: 'outline',
  completed: 'secondary',
  draft: 'outline',
  sent: 'secondary',
  paid: 'default',
  overdue: 'destructive',
  cancelled: 'outline',
  accepted: 'default',
  declined: 'outline',
  expired: 'outline',
  terms: 'secondary',
  proposal: 'outline',
  contract: 'secondary',
  sow: 'outline',
  nda: 'secondary',
  brief: 'outline',
  note: 'outline',
  other: 'outline',
};

export const StatusBadge = ({ status }: { readonly status: string }) => (
  <Badge variant={VARIANTS[status] ?? 'outline'}>{valueLabel(status)}</Badge>
);

/** `overdue` is derived for display: a sent invoice past its due date. Never written to the file. */
export const invoiceStatus = (record: ApiRecord): string => {
  if (record.type !== 'invoice') return 'draft';
  if (record.status === 'sent' && record.due_date !== '' && record.due_date < formatToday()) {
    return 'overdue';
  }
  return record.status;
};

export const recordStatus = (record: ApiRecord): string | null => {
  switch (record.type) {
    case 'contact':
    case 'project':
    case 'estimate':
      return record.status;
    case 'invoice':
      return invoiceStatus(record);
    case 'document':
      return record.kind;
    case 'task':
      return record.status;
  }
};
