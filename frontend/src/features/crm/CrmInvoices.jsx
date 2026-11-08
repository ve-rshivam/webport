import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { crmApi } from './crmApi';
import {
  ErrorNote,
  Field,
  Loading,
  Modal,
  Money,
  PageHead,
  Pill,
  Table,
  inputClass,
  primaryClass,
  quietClass,
  secondaryClass,
} from './crmUi';
import { formatDate } from './crmFormat';

const STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'];

export default function CrmInvoices() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [voiding, setVoiding] = useState(null);
  const [reason, setReason] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await crmApi.invoices({ status, limit: 100 });
      setRows(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    crmApi
      .invoices({ status, limit: 100 })
      .then((response) => {
        if (!active) return;
        setRows(response.data);
        setError('');
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [status]);

  async function issue(invoice) {
    setBusy(invoice.id);
    setError('');
    try {
      await crmApi.issueInvoice(invoice.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function voidInvoice(event) {
    event.preventDefault();
    setBusy(voiding.id);
    try {
      await crmApi.voidInvoice(voiding.id, reason);
      setVoiding(null);
      setReason('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function download(invoice) {
    try {
      const blob = await crmApi.invoiceBlob(invoice.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${invoice.number || invoice.id}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Invoices"
        title="What has been billed."
        intro="Drafts are editable only until issue. Issuing allocates the next number for the year, freezes the customer snapshot, and records the event on the customer timeline."
        actions={
          <Link to="/admin/crm/customers" className={secondaryClass}>
            New from a customer
          </Link>
        }
      />

      <label className="inline-block">
        <span className="eyebrow mb-2 block text-[var(--ink-soft)]">Status</span>
        <select
          value={status}
          onChange={(event) => {
            setLoading(true);
            setStatus(event.target.value);
          }}
          className={inputClass}
        >
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>

      <ErrorNote message={error} onRetry={load} />
      {loading && <Loading label="Loading invoices" />}

      {!loading && !error && (
        <>
          {rows.length === 0 ? (
            <p className="py-8 text-sm text-[var(--ink-soft)]">No invoices match.</p>
          ) : (
            <Table head={['Invoice', 'Customer', 'Status', 'Total', 'Paid', 'Balance', 'Due', 'Actions']}>
              {rows.map((invoice) => (
                <tr key={invoice.id} className="border-b border-[var(--rule)] last:border-0">
                  <td className="px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.1em]">
                    {invoice.number || 'Draft'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Link
                      to={`/admin/crm/customers/${invoice.customerId}`}
                      className="underline decoration-transparent underline-offset-4 hover:decoration-[var(--signal)]"
                    >
                      {invoice.customer?.companyName || invoice.customer?.contactName}
                    </Link>
                  </td>
                  <td className="px-4 py-3"><Pill value={invoice.status} /></td>
                  <td className="px-4 py-3 tabular-nums"><Money value={invoice.total} currency={invoice.currency} /></td>
                  <td className="px-4 py-3 tabular-nums"><Money value={invoice.paid} currency={invoice.currency} /></td>
                  <td className="px-4 py-3 tabular-nums"><Money value={invoice.balanceDue} currency={invoice.currency} /></td>
                  <td className="px-4 py-3 text-xs text-[var(--ink-soft)]">{formatDate(invoice.dueDate)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-3">
                      {invoice.status === 'DRAFT' && (
                        <button type="button" onClick={() => issue(invoice)} className={quietClass} disabled={busy === invoice.id}>
                          Issue
                        </button>
                      )}
                      {['DRAFT', 'SENT'].includes(invoice.status) && (
                        <button type="button" onClick={() => setVoiding(invoice)} className={quietClass}>
                          Void
                        </button>
                      )}
                      {invoice.number && (
                        <button type="button" onClick={() => download(invoice)} className={quietClass}>
                          PDF
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}

      {voiding && (
        <Modal
          title={`Void ${voiding.number || 'draft invoice'}`}
          onClose={() => setVoiding(null)}
          footer={
            <>
              <button type="button" className={secondaryClass} onClick={() => setVoiding(null)}>
                Cancel
              </button>
              <button type="submit" form="void-form" className={primaryClass} disabled={busy === voiding.id}>
                {busy === voiding.id ? 'Voiding…' : 'Void invoice'}
              </button>
            </>
          }
        >
          <form id="void-form" onSubmit={voidInvoice} className="space-y-4">
            <p className="text-sm text-[var(--ink-soft)]">
              A voided invoice keeps its number and is never deleted. Invoices with payments cannot be
              voided.
            </p>
            <Field label="Reason">
              <textarea
                required
                minLength={5}
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className={inputClass}
                autoFocus
              />
            </Field>
          </form>
        </Modal>
      )}
    </div>
  );
}
