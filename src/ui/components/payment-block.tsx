import { useEffect, useState } from 'react';
import type { ObConfig } from '../../workspace/config.js';

export interface PaymentBlockProps {
  readonly business: ObConfig['business'] | undefined;
}

/**
 * The payment instruction inside a printed sheet. `business.payment` picks the
 * mode: `link` prints the URL, `qr` prints the image (with the URL underneath
 * when both exist), `''` prints nothing. The QR is a fixed workspace file, so
 * if it cannot be loaded the block falls back to the link rather than to a
 * broken image.
 */
export const PaymentBlock = ({ business }: PaymentBlockProps) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [business?.payment_qr]);

  if (business === undefined) return null;

  const link = business.payment_link_url.trim();
  const mode = business.payment;

  if (mode === '') return null;

  const hasQr = mode === 'qr' && business.payment_qr !== '' && !failed;
  if (!hasQr && link === '') return null;

  return (
    <section className="print-payment">
      <p className="print-label">Payment</p>
      {hasQr ? (
        <div className="print-payment-body">
          <img
            src="/api/qr"
            alt="Payment QR code"
            className="print-qr"
            onError={() => setFailed(true)}
          />
          <div>
            <p className="print-small">Scan with your banking app to pay.</p>
            {link === '' ? null : (
              <p className="print-small">
                Or pay online: <span className="print-strong">{link}</span>
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="print-small">
          Pay online: <span className="print-strong">{link}</span>
        </p>
      )}
    </section>
  );
};
