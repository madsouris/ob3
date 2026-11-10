import { ArrowLeftIcon, PrinterIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentSheet } from '@/components/document-sheet';
import { navigate } from '@/lib/router';
import { useWorkspace } from '@/lib/workspace';

export interface PrintDocumentProps {
  readonly type: 'invoice' | 'estimate';
  readonly id: string;
}

/**
 * A4 document for browser print / "Save as PDF". Deliberately light-only: the
 * sheet uses fixed print classes, not theme tokens, so printing from dark mode
 * produces the same paper document. The sheet itself is shared with the in-app
 * preview (`DocumentSheet`).
 */
export const PrintDocument = ({ type, id }: PrintDocumentProps) => {
  const { records, config, loading } = useWorkspace();
  const plural = type === 'invoice' ? 'invoices' : 'estimates';
  const record =
    type === 'invoice'
      ? (records.invoice.find((item) => item.id === id) ?? null)
      : (records.estimate.find((item) => item.id === id) ?? null);

  const back = (): void => navigate(`${plural}/${id}`);

  if (record === null) {
    return (
      <div className="print-shell flex min-h-dvh flex-col items-center justify-center gap-4 p-8">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading the document…</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">This {type} was not found.</p>
            <Button variant="outline" size="sm" onClick={() => navigate(plural)}>
              Back to {plural}
            </Button>
          </>
        )}
      </div>
    );
  }

  const client = records.contact.find((contact) => contact.id === record.client_id) ?? null;
  const project = records.project.find((item) => item.id === record.project_id) ?? null;

  return (
    <div className="print-shell flex min-h-dvh flex-col bg-muted/40">
      <div className="no-print mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-4">
        <Button variant="outline" size="sm" onClick={back}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">A4 · prints light</span>
          <Button size="sm" onClick={() => window.print()}>
            <PrinterIcon data-icon="inline-start" />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      <div className="mb-8">
        <DocumentSheet
          type={type}
          record={record}
          client={client}
          project={project}
          documents={records.document}
          config={config}
        />
      </div>
    </div>
  );
};
