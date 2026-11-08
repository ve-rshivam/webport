import { useEffect, useMemo, useState } from 'react';
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

const METHODS = ['UPI_QR', 'BANK_TRANSFER', 'CASH', 'OTHER'];
const STATUSES = ['PENDING', 'AWAITING_VERIFICATION', 'SUCCEEDED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'];

function emptyForm() {
  return {
    customerId: '',
    invoiceId: '',
    method: 'UPI_QR',
    amount: '',
    reference: '',
    proofDataUrl: '',
    proofName: '',
  };
}

function purgeRemaining(value) {
  const hours = (new Date(value).getTime() - Date.now()) / 3600000;
  return hours > 0 ? `${hours.toFixed(1)} h` : 'expired';
}

function newIdempotencyKey() {
  try {
    if (typeof window.crypto?.randomUUID === 'function') return window.crypto.randomUUID();
  } catch {
    /* fall through to a random key */
  }
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function fetchLedgerData(status, tab) {
  const [ledger, customerList, invoiceList] = await Promise.all([
    crmApi.payments({ status, limit: 100 }),
    crmApi.customers({ limit: 100 }),
    crmApi.invoices({ limit: 100 }),
  ]);
  const bin = tab === 'recycle' ? (await crmApi.recycleBin()).data : [];
  return { ledger, customerList, invoiceList, bin };
}

export default function CrmPayments({ actor }) {
  const canVerify =
    actor?.role === 'SUPERADMIN' ||
    (Array.isArray(actor?.permissions) && actor.permissions.includes('PAYMENTS_VERIFY'));
  const canExport =
    actor?.role === 'SUPERADMIN' ||
    (Array.isArray(actor?.permissions) && actor.permissions.includes('EXPORT_DATA'));
  const [tab, setTab] = useState('ledger');
  const [payments, setPayments] = useState([]);
  const [recycle, setRecycle] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [formError, setFormError] = useState('');
  const [action, setAction] = useState(null);
  const [actionReason, setActionReason] = useState('');
  const [actionReference, setActionReference] = useState('');
  const [actionAmount, setActionAmount] = useState('');
  const effectiveTab = canVerify && tab === 'recycle' ? 'recycle' : 'ledger';

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await fetchLedgerData(status, effectiveTab);
      setPayments(result.ledger.data);
      setCustomers(result.customerList.data);
      setInvoices(result.invoiceList.data);
      setRecycle(result.bin);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetchLedgerData(status, effectiveTab)
      .then((result) => {
        if (!active) return;
        setPayments(result.ledger.data);
        setCustomers(result.customerList.data);
        setInvoices(result.invoiceList.data);
        setRecycle(result.bin);
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
  }, [status, effectiveTab]);

  const invoiceOptions = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          (!form.customerId || invoice.customerId === form.customerId) &&
          invoice.number &&
          !['DRAFT', 'VOID', 'PAID'].includes(invoice.status)
      ),
    [invoices, form.customerId]
  );

  async function readProof(file) {
    if (!file) {
      setForm((current) => ({ ...current, proofDataUrl: '', proofName: '' }));
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setFormError('Proof must be a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setFormError('Proof must be 3 MB or smaller.');
      return;
    }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read the file.'));
        reader.readAsDataURL(file);
      });
      setFormError('');
      setForm((current) => ({ ...current, proofDataUrl: dataUrl, proofName: file.name }));
    } catch {
      setFormError('Could not read the proof file. Try another image.');
    }
  }

  async function submitManual(event) {
    event.preventDefault();
    setFormError('');
    if (form.method === 'UPI_QR' && !form.proofDataUrl) {
      setFormError('A screenshot is required for UPI payments.');
      return;
    }
    setBusy('manual');
    try {
      await crmApi.manualPayment({
        customerId: form.customerId,
        invoiceId: form.invoiceId || undefined,
        method: form.method,
        amount: form.amount,
        reference: form.reference || undefined,
        proofDataUrl: form.proofDataUrl || undefined,
        idempotencyKey,
      });
      setForm(emptyForm());
      setIdempotencyKey(newIdempotencyKey());
      setTab('ledger');
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function openProof(payment) {
    try {
      const blob = await crmApi.proofBlob(payment.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitAction(event) {
    event.preventDefault();
    setBusy('action');
    try {
      if (action.mode === 'verify') {
        await crmApi.verifyPayment(action.payment.id, {
          reference: actionReference || undefined,
        });
      } else if (action.mode === 'refund') {
        await crmApi.refundPayment(action.payment.id, {
          amount: actionAmount,
          reason: actionReason,
        });
      } else {
        await crmApi.rejectPayment(action.payment.id, actionReason);
      }
      setAction(null);
      setActionReason('');
      setActionReference('');
      setActionAmount('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function restore(payment) {
    if (!window.confirm(`Restore the proof for ${payment.customer?.contactName || 'this payment'}?`)) return;
    setBusy(payment.id);
    try {
      await crmApi.restoreProof(payment.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function purge(payment) {
    if (!window.confirm('Permanently purge this proof now? This cannot be undone.')) return;
    setBusy(payment.id);
    try {
      await crmApi.purgeProof(payment.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function exportLedger() {
    setExporting(true);
    setError('');
    try {
      const blob = await crmApi.exportLedger();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `crm-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Payments"
        title="The ledger."
        intro="Verified payments are the source of truth for balances. Manual proofs are retained for 36 hours in a recycle bin after a decision, then purged automatically; the SHA-256 digest remains as evidence."
        actions={
          <div className="flex gap-3">
            {canExport && (
              <button type="button" onClick={exportLedger} className={quietClass} disabled={exporting}>
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            )}
            <button type="button" onClick={load} className={quietClass} disabled={loading}>
              Refresh
            </button>
          </div>
        }
      />

      <div className="flex gap-4 border-b border-[var(--rule)]">
        {[
          ['ledger', 'Ledger'],
          ['submit', 'Submit proof'],
          ...(canVerify ? [['recycle', 'Recycle bin']] : []),
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`border-b-2 pb-3 font-mono-ui text-[10px] uppercase tracking-[0.16em] ${
              tab === value
                ? 'border-[var(--signal)] text-[var(--ink)]'
                : 'border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ErrorNote message={error} onRetry={load} />
      {loading && <Loading label="Loading payments" />}

      {tab === 'ledger' && !loading && (
        <>
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

          {payments.length === 0 ? (
            <p className="py-8 text-sm text-[var(--ink-soft)]">No payments match.</p>
          ) : (
            <Table head={['Date', 'Customer', 'Method', 'Amount', 'INR value', 'Status', 'Proof', 'Actions']}>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b border-[var(--rule)] last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--ink-soft)]">
                    {formatDate(payment.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-[var(--ink)]">
                      {payment.customer?.companyName || payment.customer?.contactName}
                    </p>
                    <p className="text-[11px] text-[var(--ink-soft)]">{payment.customer?.email}</p>
                  </td>
                  <td className="px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.1em]">
                    {payment.method}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    <Money value={payment.amount} currency={payment.currency} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    <Money value={payment.baseAmountInr} />
                  </td>
                  <td className="px-4 py-3"><Pill value={payment.status} /></td>
                  <td className="px-4 py-3 text-xs text-[var(--ink-soft)]">
                    {payment.proofStatus === 'ACTIVE' &&
                      (canVerify ? (
                        <button type="button" onClick={() => openProof(payment)} className={quietClass}>
                          View
                        </button>
                      ) : (
                        'On file'
                      ))}
                    {payment.proofStatus === 'RECYCLED' && `Recycled · ${purgeRemaining(payment.proofPurgeAfter)}`}
                    {payment.proofStatus === 'PURGED' && 'Purged'}
                    {payment.proofStatus === 'NONE' && '—'}
                  </td>
                  <td className="px-4 py-3">
                    {canVerify && ['AWAITING_VERIFICATION', 'PENDING'].includes(payment.status) ? (
                      <div className="flex gap-3">
                        <button
                          type="button"
                          className={quietClass}
                          onClick={() => {
                            setAction({ mode: 'verify', payment });
                            setActionReference(payment.reference || '');
                          }}
                        >
                          Verify
                        </button>
                        <button
                          type="button"
                          className={quietClass}
                          onClick={() => setAction({ mode: 'reject', payment })}
                        >
                          Reject
                        </button>
                      </div>
                    ) : canVerify && ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.status) ? (
                      <button
                        type="button"
                        className={quietClass}
                        onClick={() => {
                          setAction({ mode: 'refund', payment });
                          setActionAmount(payment.amount);
                        }}
                      >
                        Refund
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--ink-soft)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}

      {tab === 'submit' && (
        <form onSubmit={submitManual} className="max-w-2xl space-y-4 border border-[var(--rule)] p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer">
              <select
                required
                value={form.customerId}
                onChange={(event) =>
                  setForm({ ...form, customerId: event.target.value, invoiceId: '' })
                }
                className={inputClass}
              >
                <option value="">Choose customer…</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.companyName || customer.contactName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Invoice (optional)">
              <select
                value={form.invoiceId}
                onChange={(event) => setForm({ ...form, invoiceId: event.target.value })}
                className={inputClass}
              >
                <option value="">No invoice</option>
                {invoiceOptions.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.number || 'Draft'} · {invoice.currency} {invoice.total}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Method">
              <select
                value={form.method}
                onChange={(event) => setForm({ ...form, method: event.target.value })}
                className={inputClass}
              >
                {METHODS.map((method) => (
                  <option key={method} value={method}>{method.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </Field>
            <Field label="Amount (INR)">
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                className={inputClass}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Reference / UTR">
                <input
                  value={form.reference}
                  onChange={(event) => setForm({ ...form, reference: event.target.value })}
                  className={inputClass}
                  placeholder="Bank reference or transaction ID"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field
                label="Payment proof"
                hint="PNG, JPEG or WebP, up to 3 MB. The image is re-encoded, metadata is stripped, and active content is rejected before storage."
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => readProof(event.target.files?.[0])}
                  className="block w-full text-xs text-[var(--ink-soft)]"
                />
              </Field>
              {form.proofName && (
                <p className="mt-1 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                  {form.proofName} selected
                </p>
              )}
            </div>
          </div>
          <ErrorNote message={formError} />
          <button type="submit" className={primaryClass} disabled={busy === 'manual'}>
            {busy === 'manual' ? 'Submitting…' : 'Submit for verification'}
          </button>
          <p className="text-[11px] leading-5 text-[var(--ink-soft)]">
            Submissions are idempotent per form. Amounts must not exceed the selected invoice balance.
          </p>
        </form>
      )}

      {canVerify && tab === 'recycle' && !loading && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--ink-soft)]">
            Proofs move here after a payment is verified or rejected. Restore within 36 hours or purge
            immediately.
          </p>
          {recycle.length === 0 ? (
            <p className="py-8 text-sm text-[var(--ink-soft)]">The recycle bin is empty.</p>
          ) : (
            recycle.map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 border border-[var(--rule)] px-4 py-3">
                <div>
                  <p className="text-sm text-[var(--ink)]">
                    {payment.customer?.companyName || payment.customer?.contactName} ·{' '}
                    <Money value={payment.amount} currency={payment.currency} />
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--ink-soft)]">
                    {payment.invoice?.number || 'No invoice'} · purges in {purgeRemaining(payment.proofPurgeAfter)}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button type="button" className={quietClass} onClick={() => openProof(payment)} disabled={busy === payment.id}>
                    View
                  </button>
                  <button type="button" className={quietClass} onClick={() => restore(payment)} disabled={busy === payment.id}>
                    Restore
                  </button>
                  <button type="button" className={quietClass} onClick={() => purge(payment)} disabled={busy === payment.id}>
                    Purge
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {action && (
        <Modal
          title={
            action.mode === 'verify'
              ? 'Verify payment'
              : action.mode === 'refund'
                ? 'Record refund'
                : 'Reject payment proof'
          }
          onClose={() => setAction(null)}
          footer={
            <>
              <button type="button" className={secondaryClass} onClick={() => setAction(null)}>
                Cancel
              </button>
              <button type="submit" form="payment-action" className={primaryClass} disabled={busy === 'action'}>
                {busy === 'action'
                  ? 'Saving…'
                  : action.mode === 'verify'
                    ? 'Confirm received'
                    : action.mode === 'refund'
                      ? 'Record refund'
                      : 'Reject proof'}
              </button>
            </>
          }
        >
          <form id="payment-action" onSubmit={submitAction} className="space-y-4">
            <p className="text-sm text-[var(--ink-soft)]">
              {action.payment.customer?.companyName || action.payment.customer?.contactName} ·{' '}
              <Money value={action.payment.amount} currency={action.payment.currency} /> ·{' '}
              {action.payment.method}
            </p>
            {action.mode === 'verify' ? (
              <Field label="Bank reference (optional)">
                <input
                  value={actionReference}
                  onChange={(event) => setActionReference(event.target.value)}
                  className={inputClass}
                  autoFocus
                />
              </Field>
            ) : action.mode === 'refund' ? (
              <>
                <Field label="Refund amount" hint={`Maximum ${action.payment.amount} ${action.payment.currency}`}>
                  <input
                    required
                    type="number"
                    min="0.01"
                    max={action.payment.amount}
                    step="0.01"
                    value={actionAmount}
                    onChange={(event) => setActionAmount(event.target.value)}
                    className={inputClass}
                    autoFocus
                  />
                </Field>
                <Field label="Reason">
                  <textarea
                    required
                    rows={3}
                    value={actionReason}
                    onChange={(event) => setActionReason(event.target.value)}
                    className={inputClass}
                  />
                </Field>
              </>
            ) : (
              <Field label="Reason">
                <textarea
                  required
                  rows={4}
                  value={actionReason}
                  onChange={(event) => setActionReason(event.target.value)}
                  className={inputClass}
                  autoFocus
                />
              </Field>
            )}
            <p className="text-[11px] leading-5 text-[var(--ink-soft)]">
              {action.mode === 'verify'
                ? 'Verifying writes the payment, recalculates the invoice balance, and recycles the proof for 36 hours.'
                : action.mode === 'refund'
                  ? 'Refunds reduce net paid value and customer LTV immediately. The original payment is retained as immutable evidence.'
                  : 'Rejecting keeps the proof in the recycle bin for 36 hours for review, then purges it.'}
            </p>
          </form>
        </Modal>
      )}
    </div>
  );
}
