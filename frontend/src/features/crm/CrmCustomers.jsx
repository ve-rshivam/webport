import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  secondaryClass,
} from './crmUi';

const STAGES = ['NEW', 'CONTACTED', 'PROPOSAL_SENT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'];
const SOURCES = ['REFERRAL', 'WEBSITE', 'ORGANIC', 'SOCIAL', 'OUTBOUND', 'RETURNING', 'OTHER'];

const EMPTY_FORM = {
  contactName: '',
  companyName: '',
  email: '',
  phone: '',
  stage: 'NEW',
  source: 'OTHER',
  notes: '',
};

export default function CrmCustomers() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await crmApi.customers({ q: query, stage, limit: 50 });
      setRows(response.data);
      setMeta(response.meta);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    crmApi
      .customers({ q: query, stage, limit: 50 })
      .then((response) => {
        if (!active) return;
        setRows(response.data);
        setMeta(response.meta);
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
  }, [query, stage]);

  async function create(event) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const response = await crmApi.createCustomer({
        ...form,
        companyName: form.companyName || undefined,
        phone: form.phone || undefined,
        notes: form.notes || undefined,
      });
      setOpen(false);
      setForm(EMPTY_FORM);
      navigate(`/admin/crm/customers/${response.data.id}`);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Customers & leads"
        title="Everyone the studio talks to."
        intro="A lead and a customer are the same record at different stages. Opening a record shows every project, invoice, payment and note attached to it."
        actions={
          <button type="button" onClick={() => setOpen(true)} className={primaryClass}>
            New customer
          </button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            load();
          }}
          className="flex flex-1 flex-wrap items-end gap-3"
        >
          <label className="min-w-[220px] flex-1">
            <span className="eyebrow mb-2 block text-[var(--ink-soft)]">Search</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setLoading(true);
                setQuery(event.target.value);
              }}
              placeholder="Name, company, email"
              className={inputClass}
            />
          </label>
          <label>
            <span className="eyebrow mb-2 block text-[var(--ink-soft)]">Stage</span>
            <select
              value={stage}
              onChange={(event) => {
                setLoading(true);
                setStage(event.target.value);
              }}
              className={inputClass}
            >
              <option value="">All stages</option>
              {STAGES.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={secondaryClass}>
            Filter
          </button>
        </form>
      </div>

      <ErrorNote message={error} onRetry={load} />
      {loading && <Loading label="Loading customers" />}

      {!loading && !error && rows.length === 0 && (
        <div className="border border-dashed border-[var(--rule)] px-6 py-12 text-center">
          <p className="font-display text-2xl text-[var(--ink)]">No customers match.</p>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Clear the filters, or add the first lead.
          </p>
          <button type="button" onClick={() => setOpen(true)} className={`${primaryClass} mt-5`}>
            Add customer
          </button>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <Table head={['Customer', 'Stage', 'Owner', 'Lifetime value', 'Outstanding', 'Last updated']}>
            {rows.map((customer) => (
              <tr key={customer.id} className="border-b border-[var(--rule)] last:border-0">
                <td className="px-4 py-3">
                  <Link
                    to={`/admin/crm/customers/${customer.id}`}
                    className="font-medium text-[var(--ink)] underline decoration-transparent underline-offset-4 transition-colors hover:decoration-[var(--signal)]"
                  >
                    {customer.companyName || customer.contactName}
                  </Link>
                  <p className="mt-1 text-xs text-[var(--ink-soft)]">
                    {customer.contactName}
                    {customer.companyName ? ` · ${customer.email}` : ''}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <Pill value={customer.stage} />
                </td>
                <td className="px-4 py-3 text-xs text-[var(--ink-soft)]">
                  {customer.owner?.name || 'Unassigned'}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  <Money value={customer.metrics?.lifetimeValue} />
                </td>
                <td className="px-4 py-3 tabular-nums">
                  <Money value={customer.metrics?.outstanding} />
                </td>
                <td className="px-4 py-3 text-xs text-[var(--ink-soft)]">
                  {new Date(customer.updatedAt).toLocaleDateString('en-IN')}
                </td>
              </tr>
            ))}
          </Table>
          <div className="flex items-center justify-between font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            <span>
              {rows.length} of {meta?.total ?? rows.length} records
            </span>
            <span>Page {meta?.page ?? 1}</span>
          </div>
        </>
      )}

      {open && (
        <Modal
          title="New customer or lead"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" className={secondaryClass} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" form="customer-form" className={primaryClass} disabled={saving}>
                {saving ? 'Saving…' : 'Create record'}
              </button>
            </>
          }
        >
          <form id="customer-form" onSubmit={create} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact name">
                <input
                  required
                  value={form.contactName}
                  onChange={(event) => setForm({ ...form, contactName: event.target.value })}
                  className={inputClass}
                  autoFocus
                />
              </Field>
              <Field label="Company">
                <input
                  value={form.companyName}
                  onChange={(event) => setForm({ ...form, companyName: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Email">
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Phone">
                <input
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  className={inputClass}
                  placeholder="+91"
                />
              </Field>
              <Field label="Stage">
                <select
                  value={form.stage}
                  onChange={(event) => setForm({ ...form, stage: event.target.value })}
                  className={inputClass}
                >
                  {STAGES.map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Source">
                <select
                  value={form.source}
                  onChange={(event) => setForm({ ...form, source: event.target.value })}
                  className={inputClass}
                >
                  {SOURCES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Internal note" hint="Stored as untrusted text and scanned for prompt-injection patterns.">
              <textarea
                rows={3}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                className={inputClass}
              />
            </Field>
            <ErrorNote message={formError} />
          </form>
        </Modal>
      )}
    </div>
  );
}
