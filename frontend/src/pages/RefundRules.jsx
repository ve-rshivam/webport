import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

const RefundRules = () => {
  const [refundText, setRefundText] = useState(null);

  useEffect(() => {
    apiGet('/api/content')
      .then((data) => {
        if (data?.policyData?.refund) setRefundText(data.policyData.refund);
      })
      .catch((error) => console.error('Failed to fetch refund policy:', error));
  }, []);

  if (refundText) {
    return (
      <div className="whitespace-pre-wrap text-base leading-8 text-[var(--ink-soft)]">
        {refundText}
      </div>
    );
  }

  return (
    <div className="space-y-7 text-base leading-8 text-[var(--ink-soft)]">
      <p>
        A fair payment structure protects both the client’s investment and the developer’s time.
      </p>

      <section className="border-t border-[var(--rule)] pt-5">
        <h2 className="font-display text-2xl text-[var(--ink)]">Advance payment</h2>
        <p className="mt-2">
          A <strong className="font-medium text-[var(--signal)]">40–50% advance</strong> is required
          to secure the project slot and begin initial research and setup.
        </p>
      </section>

      <section className="border-t border-[var(--rule)] pt-5">
        <h2 className="font-display text-2xl text-[var(--ink)]">24-hour grace period</h2>
        <p className="mt-2">
          If you cancel within{' '}
          <strong className="font-medium text-[var(--signal)]">
            24 hours of the advance payment
          </strong>{' '}
          and no coding or design work has started, you receive a full refund minus third-party
          payment processing fees (approximately 5%).
        </p>
        <p className="mt-3">
          To request a cancellation in that window, email{' '}
          <a
            href="mailto:support.shivam@gmail.com?subject=Refund%20Request"
            className="border-b border-[var(--signal)] text-[var(--signal)] transition-opacity hover:opacity-70"
          >
            support.shivam@gmail.com
          </a>
          .
        </p>
      </section>

      <section className="border-t border-[var(--rule)] pt-5">
        <h2 className="font-display text-2xl text-[var(--ink)]">Cancellation after 24 hours</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            If development has <strong className="font-medium text-[var(--ink)]">not started</strong>,
            a 15% administrative fee is deducted and the balance is refunded.
          </li>
          <li>
            If development has <strong className="font-medium text-[var(--ink)]">started</strong>,
            the advance becomes non-refundable, covering the blocked schedule and work already
            invested.
          </li>
        </ul>
      </section>

      <section className="border-t border-[var(--rule)] pt-5">
        <h2 className="font-display text-2xl text-[var(--ink)]">Final settlement</h2>
        <p className="mt-2">
          The remaining 50% is due on approval of the final demonstration. Ownership, API keys,
          source files and hosting credentials transfer only after the final payment is verified.
        </p>
      </section>
    </div>
  );
};

export default RefundRules;
