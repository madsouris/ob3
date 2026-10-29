import { DOCUMENT_KIND_LABELS } from './document-kinds.js';

/**
 * Display label for a stored enum token. Radix `SelectValue` mirrors the
 * selected item's children into the trigger, so a CSS `capitalize` on the item
 * never reaches the closed select — items must render the label itself.
 */
export const valueLabel = (value: string): string => {
  if (value === '') return '—';
  return DOCUMENT_KIND_LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
};
