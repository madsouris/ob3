/**
 * Display labels for the fixed kind set (docs/13). The stored value stays the
 * short token; only the UI spells it out, so `sow` reads "Statement of work"
 * and `nda` keeps its capitals. `tests/ui/document-kinds.test.ts` asserts the
 * keys match `DOCUMENT_KINDS` in the model.
 */
export const DOCUMENT_KIND_LABELS: Readonly<Record<string, string>> = {
  terms: 'Terms',
  proposal: 'Proposal',
  contract: 'Contract',
  sow: 'Statement of work',
  nda: 'NDA',
  brief: 'Brief',
  note: 'Note',
  other: 'Other',
};

/** Picker order: templates, agreements, working notes, catch-all. */
export const DOCUMENT_KIND_OPTIONS: readonly string[] = Object.keys(DOCUMENT_KIND_LABELS);

export const documentKindLabel = (kind: string): string =>
  kind === '' ? 'Note' : (DOCUMENT_KIND_LABELS[kind] ?? kind);
