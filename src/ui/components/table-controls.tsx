import { ArrowDownIcon, ArrowUpIcon, SearchIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableHead } from '@/components/ui/table';
import type { SortDirection } from '@/lib/table';
import { cn } from '@/lib/utils';

export interface TableSearchProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly placeholder: string;
  /** e.g. `2 of 8` while filtering. */
  readonly count?: string;
  readonly hint?: string;
  readonly className?: string;
}

/** Search box used by every table and by the task boards. */
export const TableSearch = ({
  value,
  onChange,
  label,
  placeholder,
  count,
  hint,
  className,
}: TableSearchProps) => (
  <div className={cn('flex flex-wrap items-center gap-2', className)}>
    <div className="relative w-full min-w-48 sm:max-w-xs">
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="pl-8"
      />
    </div>
    {count === undefined ? null : (
      <span className="tabular text-xs text-muted-foreground">{count}</span>
    )}
    {hint === undefined ? null : <span className="text-xs text-muted-foreground">{hint}</span>}
  </div>
);

export interface SortOption {
  readonly value: string;
  readonly label: string;
}

export interface TableControlsProps {
  readonly search: TableSearchProps;
  readonly sortOptions: readonly SortOption[];
  readonly sortField: string;
  readonly onSortField: (field: string) => void;
  readonly direction: SortDirection;
  readonly onToggleDirection: () => void;
  readonly trailing?: ReactNode;
}

/** One toolbar row: search on the left, sort field and direction on the right. */
export const TableControls = ({
  search,
  sortOptions,
  sortField,
  onSortField,
  direction,
  onToggleDirection,
  trailing,
}: TableControlsProps) => (
  <div className="flex flex-wrap items-center gap-2">
    <TableSearch {...search} />
    <div className="ml-auto flex items-center gap-2">
      {trailing}
      <Select value={sortField} onValueChange={onSortField}>
        <SelectTrigger className="w-40" aria-label="Sort by">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sortOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
        onClick={onToggleDirection}
      >
        {direction === 'asc' ? <ArrowUpIcon aria-hidden /> : <ArrowDownIcon aria-hidden />}
      </Button>
    </div>
  </div>
);

export interface SortableHeadProps {
  readonly label: string;
  readonly active: boolean;
  readonly direction: SortDirection;
  readonly onSort: () => void;
  readonly className?: string;
}

/** A table header whose label sorts; `aria-sort` carries the state. */
export const SortableHead = ({
  label,
  active,
  direction,
  onSort,
  className,
}: SortableHeadProps) => (
  <TableHead
    className={className}
    aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
  >
    <button
      type="button"
      onClick={onSort}
      className="inline-flex items-center gap-1 text-left font-medium hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {label}
      {active ? (
        direction === 'asc' ? (
          <ArrowUpIcon aria-hidden className="size-3.5" />
        ) : (
          <ArrowDownIcon aria-hidden className="size-3.5" />
        )
      ) : null}
    </button>
  </TableHead>
);
