import { ArrowLeftIcon, PrinterIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BusinessLogo } from '@/components/business-logo';
import { Markdown } from '@/components/markdown';
import { formatDate, formatMoney } from '@/lib/format';
import { templateVariablesFor } from '@/lib/document-variables';
import { renderTemplate } from '@/lib/template';
import { navigate } from '@/lib/router';
import { recordTitle, useWorkspace } from '@/lib/workspace';

export interface PrintDocumentProps {
  readonly type: 'invoice' | 'estimate';
  readonly id: string;
}

/**
 * A4 document for browser print / "Save as PDF". Deliberately light-only:
 * the sheet uses fixed print classes, not theme tokens, so printing from dark
 * mode produces the same paper document.
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

  const business = config?.business;
  const businessName =
    business?.name === undefined || business.name === '' ? 'Your business' : business.name;
  const client = records.contact.find((contact) => contact.id === record.client_id) ?? null;
  const project = records.project.find((item) => item.id === record.project_id) ?? null;
  const currency = record.currency === '' ? (business?.currency ?? 'USD') : record.currency;

  const attachmentVariables = templateVariablesFor({
    config,
    client,
    project,
    invoice: record.type === 'invoice' ? record : null,
    estimate: record.type === 'estimate' ? record : null,
  });

  const attachments = (
    record.document_ids.length > 0
      ? record.document_ids.map((documentId) => ({
          key: documentId,
          document: records.document.find((item) => item.id === documentId) ?? null,
          missing: `Missing document ${documentId}`,
        }))
      : record.terms_document === ''
        ? []
        : [
            {
              key: record.terms_document,
              document:
                records.document.find((item) => item.path === record.terms_document) ?? null,
              missing: `Missing document ${record.terms_document}`,
            },
          ]
  );

  return (
    <div className="print-shell flex min-h-dvh flex-col bg-muted/40">
      <div className="no-print mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-4">
        <Button variant="ghost" size="sm" onClick={back}>
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

      <div className="print-sheet mx-auto mb-8 w-full max-w-[210mm]">
        <header className="flex items-start justify-between gap-8">
          <div>
            <BusinessLogo
              name={businessName}
              logo={business?.logo ?? ''}
              className="print-logo mb-2"
            />
            <p className="print-business">{businessName}</p>
            {business?.address === undefined || business.address === '' ? null : (
              <p className="print-muted print-small">{business.address}</p>
            )}
            {business?.email === undefined || business.email === '' ? null : (
              <p className="print-muted print-small">{business.email}</p>
            )}
            {business?.phone === undefined || business.phone === '' ? null : (
              <p className="print-muted print-small">{business.phone}</p>
            )}
          </div>

          <div className="text-right">
            <p className="print-doc-type">{type === 'invoice' ? 'Invoice' : 'Estimate'}</p>
            <p className="print-number">
              {record.type === 'invoice' ? record.invoice_number : record.estimate_number}
            </p>
            <p className="print-muted print-small">Issued {formatDate(record.issue_date)}</p>
            <p className="print-muted print-small">
              {record.type === 'invoice'
                ? `Due ${formatDate(record.due_date)}`
                : `Valid until ${formatDate(record.valid_until)}`}
            </p>
          </div>
        </header>

        <section className="print-parties">
          <div>
            <p className="print-label">Billed to</p>
            <p className="print-strong">{client === null ? 'No client' : recordTitle(client)}</p>
            {client?.type === 'contact' && client.company !== '' ? (
              <p className="print-muted print-small">{client.company}</p>
            ) : null}
            {client?.type === 'contact' && client.email !== '' ? (
              <p className="print-muted print-small">{client.email}</p>
            ) : null}
          </div>
          <div>
            <p className="print-label">Project</p>
            <p className="print-small">{project === null ? '—' : recordTitle(project)}</p>
            {record.title === '' ? null : <p className="print-muted print-small">{record.title}</p>}
          </div>
        </section>

        <table className="print-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="print-cell-num">Qty</th>
              <th className="print-cell-num">Unit price</th>
              <th className="print-cell-num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {record.line_items.map((line, index) => (
              <tr key={`${record.id}-line-${index}`}>
                <td>{line.description}</td>
                <td className="print-cell-num print-tabular">{line.quantity}</td>
                <td className="print-cell-num print-tabular">
                  {formatMoney(line.unit_price_cents, currency)}
                </td>
                <td className="print-cell-num print-tabular">
                  {formatMoney(line.total_cents, currency)}
                </td>
              </tr>
            ))}
            {record.line_items.length === 0 ? (
              <tr>
                <td colSpan={4} className="print-muted">
                  No line items.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <section className="print-totals">
          <div className="print-totals-row">
            <span className="print-muted">Subtotal</span>
            <span className="print-tabular">{formatMoney(record.subtotal_cents, currency)}</span>
          </div>
          <div className="print-totals-row">
            <span className="print-muted">Tax ({(record.tax_rate_bps / 100).toFixed(2)}%)</span>
            <span className="print-tabular">{formatMoney(record.tax_amount_cents, currency)}</span>
          </div>
          <div className="print-totals-row print-total">
            <span>Total</span>
            <span className="print-tabular">{formatMoney(record.total_cents, currency)}</span>
          </div>
        </section>

        {record.body.trim() === '' ? null : (
          <section className="print-notes">
            <p className="print-label">Notes</p>
            <Markdown className="print-small">{record.body}</Markdown>
          </section>
        )}

        {attachments.map((attachment) => (
          <section className="print-notes" key={attachment.key}>
            {attachment.document === null ? (
              <>
                <p className="print-label">Attachment</p>
                <p className="print-muted print-small">{attachment.missing}</p>
              </>
            ) : (
              <>
                <p className="print-label">{recordTitle(attachment.document)}</p>
                <Markdown className="print-small">
                  {renderTemplate(attachment.document.body, attachmentVariables)}
                </Markdown>
              </>
            )}
          </section>
        ))}

        <footer className="print-footer">
          {business?.payment_link_url === undefined || business.payment_link_url === '' ? null : (
            <p className="print-muted print-small">Pay online: {business.payment_link_url}</p>
          )}
          <p className="print-muted print-small">{record.path} · generated by ob</p>
        </footer>
      </div>
    </div>
  );
};
