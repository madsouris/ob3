/**
 * CSV import shapes for the record types that are simple enough to import
 * without money math. Estimates and invoices are deliberately excluded
 * (docs/14-csv-import.md).
 */
export const IMPORT_TYPES = ['contact', 'project', 'task'] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

/** Keeps one bad paste from writing thousands of files. */
export const MAX_IMPORT_ROWS = 1000;

export interface ImportColumn {
  /** Target field name, or one of the import-only keys `client|project|column|notes`. */
  readonly header: string;
  readonly required?: boolean;
  readonly example: string;
  readonly hint?: string;
}

export interface ImportDefinition {
  readonly type: ImportType;
  /** Human label for the picker. */
  readonly label: string;
  /** Folder name, also the skeleton file stem. */
  readonly plural: string;
  readonly columns: readonly ImportColumn[];
}

export const IMPORT_DEFINITIONS: Readonly<Record<ImportType, ImportDefinition>> = {
  contact: {
    type: 'contact',
    label: 'Contacts',
    plural: 'contacts',
    columns: [
      { header: 'first_name', required: true, example: 'Jane' },
      { header: 'last_name', example: 'Doe' },
      { header: 'email', example: 'jane@acme.com' },
      { header: 'company', example: 'Acme Corp' },
      { header: 'job_role', example: 'VP of Product' },
      { header: 'phone_number', example: '+1 555 0199' },
      { header: 'website', example: 'https://acme.com' },
      { header: 'primary_link', example: 'https://linkedin.com/in/janedoe' },
      { header: 'status', example: 'lead', hint: 'lead | active | inactive | archived' },
      { header: 'notes', example: 'Met at the Tech Expo.', hint: 'Markdown body' },
    ],
  },
  project: {
    type: 'project',
    label: 'Projects',
    plural: 'projects',
    columns: [
      { header: 'project_name', required: true, example: 'Website Redesign' },
      { header: 'client', example: 'jane@acme.com', hint: 'Contact email or full name (optional)' },
      { header: 'status', example: 'active', hint: 'active | completed | archived' },
      { header: 'notes', example: 'Redesign the marketing site.', hint: 'Markdown body' },
    ],
  },
  task: {
    type: 'task',
    label: 'Tasks',
    plural: 'tasks',
    columns: [
      { header: 'title', required: true, example: 'Build the homepage hero' },
      { header: 'project', example: 'Website Redesign', hint: 'Project name (optional)' },
      { header: 'column', example: 'todo', hint: 'todo | doing | done (default todo)' },
      { header: 'due_date', example: '2026-11-05', hint: 'YYYY-MM-DD' },
      { header: 'notes', example: '- [ ] Responsive breakpoints', hint: 'Markdown body' },
    ],
  },
};

export const isImportType = (value: string): value is ImportType =>
  (IMPORT_TYPES as readonly string[]).includes(value);
