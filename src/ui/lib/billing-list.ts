import type { SortDirection } from './table.js';
export type { SortDirection };

export type BillType = 'invoice' | 'estimate';
export type BillSortField = 'issued' | 'client' | 'total' | 'status';

/** One table row, resolved from a record plus the client map. */
export interface BillRow {
  readonly id: string;
  readonly type: BillType;
  readonly number: string;
  readonly title: string;
  readonly clientName: string;
  readonly issued: string;
  readonly total: number;
  readonly currency: string;
  /** Display status: an invoice's derived `overdue` is already applied. */
  readonly status: string;
}

export const SORT_FIELDS: readonly { readonly field: BillSortField; readonly label: string }[] = [
  { field: 'issued', label: 'Issued date' },
  { field: 'client', label: 'Client' },
  { field: 'total', label: 'Total' },
  { field: 'status', label: 'Status' },
];

/**
 * Lifecycle order, not the alphabet: `paid` must not sort next to `draft` just
 * because of its first letter. Unknown values sort last.
 */
const STATUS_ORDER: Readonly<Record<BillType, readonly string[]>> = {
  invoice: ['draft', 'sent', 'overdue', 'paid', 'cancelled'],
  estimate: ['draft', 'sent', 'accepted', 'declined', 'expired'],
};

const statusRank = (row: BillRow): number => {
  const order = STATUS_ORDER[row.type];
  const index = order.indexOf(row.status);
  return index === -1 ? order.length : index;
};

/** Number, client or title contains the query, case-insensitively. */
export const filterBills = (rows: readonly BillRow[], query: string): readonly BillRow[] => {
  const needle = query.trim().toLowerCase();
  if (needle === '') return rows;
  return rows.filter(
    (row) =>
      row.number.toLowerCase().includes(needle) ||
      row.clientName.toLowerCase().includes(needle) ||
      row.title.toLowerCase().includes(needle),
  );
};

const compare = (left: BillRow, right: BillRow, field: BillSortField): number => {
  switch (field) {
    case 'issued':
      return left.issued.localeCompare(right.issued);
    case 'client':
      return left.clientName.localeCompare(right.clientName, undefined, { sensitivity: 'base' });
    case 'total':
      return left.total - right.total;
    case 'status':
      return statusRank(left) - statusRank(right);
  }
};

/** Copies, then sorts by the field with the number as a stable tiebreaker. */
export const sortBills = (
  rows: readonly BillRow[],
  field: BillSortField,
  direction: SortDirection,
): readonly BillRow[] => {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const primary = compare(left, right, field);
    if (primary !== 0) return primary * sign;
    return left.number.localeCompare(right.number, undefined, { numeric: true });
  });
};
