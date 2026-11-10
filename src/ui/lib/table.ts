import { useState } from 'react';

export type SortDirection = 'asc' | 'desc';

/** Trimmed, case-insensitive substring match across the given fields. */
export const matchesQuery = (query: string, fields: readonly (string | undefined)[]): boolean => {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return fields.some((field) => (field ?? '').toLowerCase().includes(needle));
};

/** Copies, then sorts by the comparator; the input order is never mutated. */
export const sortRows = <T>(
  rows: readonly T[],
  compare: (left: T, right: T) => number,
  direction: SortDirection,
): readonly T[] => {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => sign * compare(left, right));
};

export const otherDirection = (direction: SortDirection): SortDirection =>
  direction === 'asc' ? 'desc' : 'asc';

export interface TableControlsState<Field extends string> {
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly field: Field;
  readonly direction: SortDirection;
  /** Flips the direction when the field is already active, else switches field. */
  readonly selectField: (field: Field) => void;
  readonly toggleDirection: () => void;
}

/**
 * Search + sort state shared by every table. `defaults` sets the direction used
 * the first time a field is selected (dates default to newest first).
 */
export const useTableControls = <Field extends string>(
  initialField: Field,
  defaults: Partial<Record<Field, SortDirection>> = {},
): TableControlsState<Field> => {
  const [query, setQuery] = useState('');
  const [field, setField] = useState<Field>(initialField);
  const [direction, setDirection] = useState<SortDirection>(defaults[initialField] ?? 'asc');

  const selectField = (next: Field): void => {
    if (next === field) {
      setDirection((current) => otherDirection(current));
      return;
    }
    setField(next);
    setDirection(defaults[next] ?? 'asc');
  };

  return {
    query,
    setQuery,
    field,
    direction,
    selectField,
    toggleDirection: () => setDirection((current) => otherDirection(current)),
  };
};
