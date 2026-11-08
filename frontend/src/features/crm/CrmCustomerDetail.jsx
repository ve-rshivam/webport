import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { crmApi } from './crmApi';
import {
  Card,
  ErrorNote,
  Field,
  Loading,
  Modal,
  Money,
  Pill,
  inputClass,
  primaryClass,
  quietClass,
  secondaryClass,
} from './crmUi';
import { formatDate, formatDateTime } from './crmFormat';

const FLOW = {
  NEW: ['CONTACTED', 'ARCHIVED'],
  CONTACTED: ['NEW', 'PROPOSAL_SENT', 'ARCHIVED'],
  PROPOSAL_SENT: ['CONTACTED', 'ACTIVE', 'ARCHIVED'],
  ACTIVE: ['COMPLETED', 'ARCHIVED'],
  COMPLETED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: ['NEW'],
};

const ACTIVITY_TYPES = ['NOTE', 'CALL', 'EMAIL_OUT', 'EMAIL_IN'];
const SOURCE_OPTIONS = ['REFERRAL', 'WEBSITE', 'ORGANIC', 'SOCIAL', 'OUTBOUND', 'RETURNING', 'OTHER'];
const PROJECT_FLOW = {
  DISCOVERY: ['IN_PROGRESS', 'ARCHIVED'],
  IN_PROGRESS: ['REVIEW', 'BLOCKED', 'DELIVERED', 'ARCHIVED'],
  REVIEW: ['IN_PROGRESS', 'BLOCKED', 'DELIVERED'],
  BLOCKED: ['IN_PROGRESS', 'REVIEW', 'ARCHIVED'],
  DELIVERED: ['IN_PROGRESS', 'ARCHIVED'],
  ARCHIVED: ['DISCOVERY'],
};

function todayPlus(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default function CrmCustomerDetail() {
  const { id } = useParams();
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [note, setNote] = useState({ type: 'NOTE', subject: '', body: '', visibility: 'INTERNAL' });
  const [project, setProject] = useState({ title: '', serviceType: '', contractValue: '', dueDate: '' });
  const [invoice, setInvoice] = useState({
    description: '',
    quantity: '1',
    unitPrice: '',
    dueDate: todayPlus(14),
    issueNow: true,
  });
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState('');
  const [movingProject, setMovingProject] = useState('');

  async function load() {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await crmApi.customer(id);
      setState({ loading: false, error: '', data: response.data });
    } catch (err) {
      setState({ loading: false, error: err.message, data: null });
    }
  }

  useEffect(() => {
    let active = true;
    crmApi
      .customer(id)
      .then((response) => {
        if (active) setState({ loading: false, error: '', data: response.data });
      })
      .catch((err) => {
        if (active) setState({ loading: false, error: err.message, data: null });
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function moveStage(toStage) {
    if (!state.data) return;
    setBusy('stage');
    setNotice('');
    try {
      await crmApi.changeStage(id, { toStage, version: state.data.customer.version });
      await load();
      setNotice(`Moved to ${toStage.replaceAll('_', ' ').toLowerCase()}.`);
    } catch (err) {
      setState((current) => ({ ...current, error: err.message }));
    } finally {
      setBusy('');
    }
  }

  async function addNote(event) {
    event.preventDefault();
    setBusy('note');
    setNotice('');
    try {
      await crmApi.addActivity(id, {
        type: note.type,
        subject: note.subject || undefined,
        body: note.body,
        visibility: note.visibility,
      });
      setNote({ type: 'NOTE', subject: '', body: '', visibility: 'INTERNAL' });
      await load();
      setNotice('Activity recorded.');
    } catch (err) {
      setState((current) => ({ ...current, error: err.message }));
    } finally {
      setBusy('');
    }
  }

  async function addProject(event) {
    event.preventDefault();
    setBusy('project');
    setNotice('');
    try {
      await crmApi.createProject({
        customerId: id,
        title: project.title,
        serviceType: project.serviceType || undefined,
        contractValue: project.contractValue || undefined,
        dueDate: project.dueDate || undefined,
        status: 'DISCOVERY',
      });
      setProject({ title: '', serviceType: '', contractValue: '', dueDate: '' });
      await load();
      setNotice('Project created.');
    } catch (err) {
      setState((current) => ({ ...current, error: err.message }));
    } finally {
      setBusy('');
    }
  }

  async function addInvoice(event) {
    event.preventDefault();
    setBusy('invoice');
    setNotice('');
    try {
      const created = await crmApi.createInvoice({
        customerId: id,
        lines: [
          {
            description: invoice.description,
            quantity: Number(invoice.quantity),
            unitPrice: invoice.unitPrice,
          },
        ],
        dueDate: invoice.dueDate,
      });
      if (invoice.issueNow) await crmApi.issueInvoice(created.data.id);
      setInvoice({
        description: '',
        quantity: '1',
        unitPrice: '',
        dueDate: todayPlus(14),
        issueNow: true,
      });
      await load();
      setNotice(invoice.issueNow ? 'Invoice created and issued.' : 'Draft invoice created.');
    } catch (err) {
      setState((current) => ({ ...current, error: err.message }));
    } finally {
      setBusy('');
    }
  }

  async function issue(invoiceId) {
    setBusy(invoiceId);
    setNotice('');
    try {
      await crmApi.issueInvoice(invoiceId);
      await load();
      setNotice('Invoice issued.');
    } catch (err) {
      setState((current) => ({ ...current, error: err.message }));
    } finally {
      setBusy('');
    }
  }

  function openEdit() {
    const customer = state.data?.customer;
    if (!customer) return;
    setEditForm({
      contactName: customer.contactName ?? '',
      companyName: customer.companyName ?? '',
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      website: customer.website ?? '',
      source: customer.source ?? 'OTHER',
      notes: customer.notes ?? '',
    });
    setEditError('');
    setEditOpen(true);
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editForm) return;
    setBusy('edit');
    setEditError('');
    try {
      await crmApi.updateCustomer(id, {
        contactName: editForm.contactName,
        companyName: editForm.companyName || null,
        email: editForm.email,
        phone: editForm.phone || null,
        website: editForm.website || null,
        source: editForm.source,
        notes: editForm.notes || null,
        version: state.data.customer.version,
      });
      setEditOpen(false);
      await load();
      setNotice('Customer details updated.');
    } catch (err) {
      setEditError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function changeProject(item, toStatus) {
    setMovingProject(item.id);
    setNotice('');
    try {
      await crmApi.changeProjectStatus(item.id, { toStatus, version: item.version });
      await load();
      setNotice(`Project moved to ${toStatus.replaceAll('_', ' ').toLowerCase()}.`);
    } catch (err) {
      setState((current) => ({ ...current, error: err.message }));
    } finally {
      setMovingProject('');
    }
  }

  if (state.loading && !state.data) return <Loading label="Loading customer" />;
  if (!state.data) return <ErrorNote message={state.error || 'Customer not found.'} onRetry={load} />;

  const { customer, metrics, projects, invoices, payments, recentActivity } = state.data;
  const nextStages = FLOW[customer.stage] ?? [];

  return (
    <div className="space-y-8">
      <div>
        <Link to="/admin/crm/customers" className={quietClass}>
          ← Customers
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--rule)] pb-6">
          <div>
            <p className="eyebrow text-[var(--signal)]">{customer.stage.replaceAll('_', ' ')}</p>
            <h1 className="mt-2 font-display text-5xl leading-none text-[var(--ink)]">
              {customer.companyName || customer.contactName}
            </h1>
            <p className="mt-3 text-sm text-[var(--ink-soft)]">
              {customer.contactName} · {customer.email}
              {customer.phone ? ` · ${customer.phone}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" onClick={openEdit} className={secondaryClass}>
              Edit details
            </button>
            <label>
              <span className="eyebrow mb-2 block text-[var(--ink-soft)]">Move stage</span>
              <select
                value=""
                disabled={busy === 'stage' || nextStages.length === 0}
                onChange={(event) => event.target.value && moveStage(event.target.value)}
                className={inputClass}
              >
                <option value="">Choose transition…</option>
                {nextStages.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <Link to="/admin/crm/payments" className={secondaryClass}>
              Record payment
            </Link>
          </div>
        </div>
      </div>

      {state.error && <ErrorNote message={state.error} onRetry={load} />}
      {notice && (
        <p role="status" className="border border-[var(--rule)] bg-[var(--paper-2)] px-4 py-2 text-sm text-[var(--ink)]">
          {notice}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Lifetime value', value: <Money value={metrics?.lifetimeValue} /> },
          { label: 'Outstanding', value: <Money value={metrics?.outstanding} /> },
          { label: 'Active projects', value: <span className="tabular-nums">{metrics?.activeProjects ?? 0}</span> },
          { label: 'Last activity', value: formatDateTime(metrics?.lastActivityAt) },
        ].map((item) => (
          <Card key={item.label}>
            <p className="eyebrow text-[var(--ink-soft)]">{item.label}</p>
            <p className="mt-3 font-display text-2xl text-[var(--ink)]">{item.value}</p>
          </Card>
        ))}
      </div>

      <section>
        <div className="flex items-baseline justify-between border-b border-[var(--rule)] pb-3">
          <h2 className="font-display text-3xl text-[var(--ink)]">Projects</h2>
          <span className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            {projects.length} total
          </span>
        </div>
        {projects.length === 0 ? (
          <p className="py-6 text-sm text-[var(--ink-soft)]">No projects yet.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {projects.map((item) => (
              <article key={item.id} className="grid gap-3 border border-[var(--rule)] p-4 md:grid-cols-12 md:items-center">
                <div className="md:col-span-5">
                  <p className="font-medium text-[var(--ink)]">{item.title}</p>
                  <p className="mt-1 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                    {item.code} {item.serviceType ? `· ${item.serviceType}` : ''}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <Pill value={item.status} />
                  <select
                    value=""
                    disabled={
                      movingProject === item.id || (PROJECT_FLOW[item.status] ?? []).length === 0
                    }
                    onChange={(event) => event.target.value && changeProject(item, event.target.value)}
                    className="mt-2 w-full border border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 font-mono-ui text-[10px] uppercase tracking-[0.1em] text-[var(--ink-soft)]"
                  >
                    <option value="">Move…</option>
                    {(PROJECT_FLOW[item.status] ?? []).map((status) => (
                      <option key={status} value={status}>
                        {status.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2 text-sm tabular-nums text-[var(--ink)]">
                  <Money value={item.contractValue} currency={item.currency} />
                </div>
                <div className="md:col-span-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 flex-1 bg-[var(--paper-2)]" aria-hidden="true">
                      <span className="block h-full bg-[var(--signal)]" style={{ width: `${item.progress || 0}%` }} />
                    </span>
                    <span className="text-[10px] tabular-nums text-[var(--ink-soft)]">{item.progress || 0}%</span>
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--ink-soft)]">Due {formatDate(item.dueDate)}</p>
                </div>
              </article>
            ))}
          </div>
        )}

        <details className="mt-4 border border-[var(--rule)]">
          <summary className="cursor-pointer px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
            Add project
          </summary>
          <form onSubmit={addProject} className="grid gap-4 border-t border-[var(--rule)] p-4 md:grid-cols-2">
            <Field label="Title">
              <input
                required
                value={project.title}
                onChange={(event) => setProject({ ...project, title: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Service">
              <input
                value={project.serviceType}
                onChange={(event) => setProject({ ...project, serviceType: event.target.value })}
                className={inputClass}
                placeholder="Website, retainer…"
              />
            </Field>
            <Field label="Contract value (INR)">
              <input
                type="number"
                min="1"
                step="0.01"
                value={project.contractValue}
                onChange={(event) => setProject({ ...project, contractValue: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Due date">
              <input
                type="date"
                value={project.dueDate}
                onChange={(event) => setProject({ ...project, dueDate: event.target.value })}
                className={inputClass}
              />
            </Field>
            <div className="md:col-span-2">
              <button type="submit" className={primaryClass} disabled={busy === 'project'}>
                {busy === 'project' ? 'Creating…' : 'Create project'}
              </button>
            </div>
          </form>
        </details>
      </section>

      <section>
        <div className="flex items-baseline justify-between border-b border-[var(--rule)] pb-3">
          <h2 className="font-display text-3xl text-[var(--ink)]">Invoices</h2>
          <span className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            {invoices.length} total
          </span>
        </div>
        {invoices.length === 0 ? (
          <p className="py-6 text-sm text-[var(--ink-soft)]">No invoices yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto border border-[var(--rule)]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--rule)] bg-[var(--paper-2)]">
                  {['Invoice', 'Status', 'Total', 'Paid', 'Balance', 'Due', ''].map((cell) => (
                    <th key={cell} scope="col" className="px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--rule)] last:border-0">
                    <td className="px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.1em]">
                      {item.number || 'Draft'}
                    </td>
                    <td className="px-4 py-3"><Pill value={item.status} /></td>
                    <td className="px-4 py-3 tabular-nums"><Money value={item.total} currency={item.currency} /></td>
                    <td className="px-4 py-3 tabular-nums"><Money value={item.paid} currency={item.currency} /></td>
                    <td className="px-4 py-3 tabular-nums"><Money value={item.balanceDue} currency={item.currency} /></td>
                    <td className="px-4 py-3 text-xs text-[var(--ink-soft)]">{formatDate(item.dueDate)}</td>
                    <td className="px-4 py-3 text-right">
                      {item.status === 'DRAFT' && (
                        <button type="button" onClick={() => issue(item.id)} className={quietClass} disabled={busy === item.id}>
                          Issue
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <details className="mt-4 border border-[var(--rule)]">
          <summary className="cursor-pointer px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
            New invoice
          </summary>
          <form onSubmit={addInvoice} className="grid gap-4 border-t border-[var(--rule)] p-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field label="Line description">
                <input
                  required
                  value={invoice.description}
                  onChange={(event) => setInvoice({ ...invoice, description: event.target.value })}
                  className={inputClass}
                  placeholder="Website design and build"
                />
              </Field>
            </div>
            <Field label="Quantity">
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={invoice.quantity}
                onChange={(event) => setInvoice({ ...invoice, quantity: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Unit price (INR)">
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={invoice.unitPrice}
                onChange={(event) => setInvoice({ ...invoice, unitPrice: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Due date">
              <input
                type="date"
                required
                value={invoice.dueDate}
                onChange={(event) => setInvoice({ ...invoice, dueDate: event.target.value })}
                className={inputClass}
              />
            </Field>
            <label className="flex items-center gap-2 pt-6 text-sm text-[var(--ink-soft)]">
              <input
                type="checkbox"
                checked={invoice.issueNow}
                onChange={(event) => setInvoice({ ...invoice, issueNow: event.target.checked })}
              />
              Issue immediately
            </label>
            <div className="md:col-span-2">
              <button type="submit" className={primaryClass} disabled={busy === 'invoice'}>
                {busy === 'invoice' ? 'Creating…' : invoice.issueNow ? 'Create & issue' : 'Save draft'}
              </button>
            </div>
          </form>
        </details>
      </section>

      <section>
        <div className="flex items-baseline justify-between border-b border-[var(--rule)] pb-3">
          <h2 className="font-display text-3xl text-[var(--ink)]">Payments</h2>
          <Link to="/admin/crm/payments" className={quietClass}>
            Ledger →
          </Link>
        </div>
        {payments.length === 0 ? (
          <p className="py-6 text-sm text-[var(--ink-soft)]">No payments recorded yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-[var(--rule)] border border-[var(--rule)]">
            {payments.map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm tabular-nums text-[var(--ink)]">
                    <Money value={payment.amount} currency={payment.currency} />
                    <span className="ml-2 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                      {payment.method}
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--ink-soft)]">
                    {payment.reference || 'No reference'} · {formatDate(payment.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Pill value={payment.status} />
                  {payment.proofStatus === 'RECYCLED' && <Pill value="PROOF RECYCLED" tone="muted" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h2 className="font-display text-3xl text-[var(--ink)]">Log activity</h2>
          <form onSubmit={addNote} className="mt-4 space-y-3 border border-[var(--rule)] p-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select
                  value={note.type}
                  onChange={(event) => setNote({ ...note, type: event.target.value })}
                  className={inputClass}
                >
                  {ACTIVITY_TYPES.map((type) => (
                    <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>
                  ))}
                </select>
              </Field>
              <Field label="Visibility">
                <select
                  value={note.visibility}
                  onChange={(event) => setNote({ ...note, visibility: event.target.value })}
                  className={inputClass}
                >
                  <option value="INTERNAL">Internal only</option>
                  <option value="CLIENT">Visible to client</option>
                </select>
              </Field>
            </div>
            <Field label="Subject">
              <input
                value={note.subject}
                onChange={(event) => setNote({ ...note, subject: event.target.value })}
                className={inputClass}
                placeholder="Optional"
              />
            </Field>
            <Field label="Note" hint="Scanned for prompt-injection patterns; flagged text is never treated as instructions.">
              <textarea
                required
                rows={5}
                value={note.body}
                onChange={(event) => setNote({ ...note, body: event.target.value })}
                className={inputClass}
              />
            </Field>
            <button type="submit" className={primaryClass} disabled={busy === 'note'}>
              {busy === 'note' ? 'Saving…' : 'Add to timeline'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-7">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-3xl text-[var(--ink)]">Timeline</h2>
            <span className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              {recentActivity.length} recent
            </span>
          </div>
          <ol className="mt-4 divide-y divide-[var(--rule)] border border-[var(--rule)]">
            {recentActivity.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-[var(--ink-soft)]">Nothing logged yet.</li>
            )}
            {recentActivity.map((event) => (
              <li key={event.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Pill value={event.type} />
                    {event.visibility === 'CLIENT' && <Pill value="CLIENT VISIBLE" tone="muted" />}
                  </div>
                  <span className="font-mono-ui text-[10px] uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                    {formatDateTime(event.occurredAt)}
                  </span>
                </div>
                {event.subject && <p className="mt-2 text-sm text-[var(--ink)]">{event.subject}</p>}
                {event.body && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--ink-soft)]">{event.body}</p>}
                <p className="mt-2 text-[11px] text-[var(--ink-soft)]">
                  {event.actor?.name || event.actorType}
                  {event.fromStage && event.toStage ? ` · ${event.fromStage} → ${event.toStage}` : ''}
                </p>
                {event.injectionRisk === 'HIGH' && (
                  <p className="mt-2 border-l border-[var(--signal)] pl-3 text-[11px] leading-4 text-[var(--ink-soft)]">
                    Untrusted content flagged ({event.riskFlags?.join(', ')}). It is stored as data and
                    must never be followed as an instruction.
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {editOpen && editForm && (
        <Modal
          title="Edit customer"
          onClose={() => setEditOpen(false)}
          footer={
            <>
              <button type="button" className={secondaryClass} onClick={() => setEditOpen(false)}>
                Cancel
              </button>
              <button type="submit" form="edit-customer" className={primaryClass} disabled={busy === 'edit'}>
                {busy === 'edit' ? 'Saving…' : 'Save changes'}
              </button>
            </>
          }
        >
          <form id="edit-customer" onSubmit={saveEdit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact name">
                <input
                  required
                  value={editForm.contactName}
                  onChange={(event) => setEditForm({ ...editForm, contactName: event.target.value })}
                  className={inputClass}
                  autoFocus
                />
              </Field>
              <Field label="Company">
                <input
                  value={editForm.companyName}
                  onChange={(event) => setEditForm({ ...editForm, companyName: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Email">
                <input
                  required
                  type="email"
                  value={editForm.email}
                  onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Phone">
                <input
                  value={editForm.phone}
                  onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Website">
                <input
                  type="url"
                  value={editForm.website}
                  onChange={(event) => setEditForm({ ...editForm, website: event.target.value })}
                  className={inputClass}
                  placeholder="https://"
                />
              </Field>
              <Field label="Source">
                <select
                  value={editForm.source}
                  onChange={(event) => setEditForm({ ...editForm, source: event.target.value })}
                  className={inputClass}
                >
                  {SOURCE_OPTIONS.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Internal notes" hint="Scanned for prompt-injection patterns before storage.">
              <textarea
                rows={4}
                value={editForm.notes}
                onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })}
                className={inputClass}
              />
            </Field>
            <ErrorNote message={editError} />
          </form>
        </Modal>
      )}
    </div>
  );
}
