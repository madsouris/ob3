import { BusinessLogo } from '@/components/business-logo';
import { Markdown } from '@/components/markdown';
import { PaymentBlock } from '@/components/payment-block';
import { formatDate, formatMoney } from '@/lib/format';
import { templateVariablesFor } from '@/lib/document-variables';
import { renderTemplate } from '@/lib/template';
import { recordTitle } from '@/lib/workspace';
import type { ApiRecordOf } from '@/lib/api';
import type { ObConfig } from '../../workspace/config.js';
import { cn } from '@/lib/utils';

export type BillType = 'invoice' | 'estimate';

export interface DocumentSheetProps {
  readonly type: BillType;
  readonly record: ApiRecordOf<'invoice'> | ApiRecordOf<'estimate'>;
  readonly client: ApiRecordOf<'contact'> | null;
  readonly project: ApiRecordOf<'project'> | null;
  readonly documents: readonly ApiRecordOf<'document'>[];
  readonly config: ObConfig | null;
  /**
   * `print` is the A4 page (fixed height, page-break rules). `preview` is the
   * same paper inside the app: fluid width, no forced page height.
   */
  readonly variant?: 'print' | 'preview';
}

/**
 * The bill itself — header, parties, lines, totals, notes, attachments, payment
 * instructions. One renderer for the print route and the in-app preview, so the
 * paper and the preview cannot drift.
 */
export const DocumentSheet = ({
  type,
  record,
  client,
  project,
  documents,
  config,
  variant = 'print',
}: DocumentSheetProps) => {
  const business = config?.business;
  const businessName =
    business?.name === undefined || business.name === '' ? 'Your business' : business.name;
  const currency = record.currency === '' ? (business?.currency ?? 'USD') : record.currency;

  const attachmentVariables = templateVariablesFor({
    config,
    client,
    project,
    invoice: record.type === 'invoice' ? record : null,
    estimate: record.type === 'estimate' ? record : null,
  });

  const attachments =
    record.document_ids.length > 0
      ? record.document_ids.map((documentId) => ({
          key: documentId,
          document: documents.find((item) => item.id === documentId) ?? null,
          missing: `Missing document ${documentId}`,
        }))
      : record.terms_document === ''
        ? []
        : [
            {
              key: record.terms_document,
              document: documents.find((item) => item.path === record.terms_document) ?? null,
              missing: `Missing document ${record.terms_document}`,
            },
          ];

  return (
    <div
      className={cn(
        'print-sheet mx-auto w-full max-w-[210mm]',
        variant === 'preview' && 'print-sheet--preview',
      )}
    >
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

      <PaymentBlock business={business} />

      <footer className="print-footer">
        <p className="print-muted print-small">{record.path} · generated by ob</p>
      </footer>
    </div>
  );
};
