import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { crmApi } from './crmApi';
import { ErrorNote, Loading, Money, PageHead, Pill } from './crmUi';
import { formatDate } from './crmFormat';

const COLUMNS = [
  { stage: 'NEW', label: 'New' },
  { stage: 'CONTACTED', label: 'Contacted' },
  { stage: 'PROPOSAL_SENT', label: 'Proposal sent' },
  { stage: 'ACTIVE', label: 'Active' },
];

const NEXT_STAGES = {
  NEW: ['CONTACTED', 'ARCHIVED'],
  CONTACTED: ['NEW', 'PROPOSAL_SENT', 'ARCHIVED'],
  PROPOSAL_SENT: ['CONTACTED', 'ACTIVE', 'ARCHIVED'],
  ACTIVE: ['COMPLETED', 'ARCHIVED'],
};

export default function CrmPipeline() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await crmApi.customers({ limit: 100, sort: 'updated' });
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
      .customers({ limit: 100, sort: 'updated' })
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
  }, []);

  async function move(customer, toStage) {
    setMoving(customer.id);
    setError('');
    try {
      await crmApi.changeStage(customer.id, { toStage, version: customer.version });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setMoving('');
    }
  }

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Pipeline"
        title="Where every lead stands."
        intro="Only valid transitions are offered, and every move is recorded on the customer timeline with the actor and time."
      />

      <ErrorNote message={error} onRetry={load} />
      {loading && <Loading label="Loading pipeline" />}

      {!loading && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((column) => {
            const cards = rows.filter((row) => row.stage === column.stage);
            const value = cards.reduce((sum, row) => sum + Number(row.metrics?.lifetimeValue ?? 0), 0);
            return (
              <section key={column.stage} className="border border-[var(--rule)]">
                <header className="flex items-baseline justify-between border-b border-[var(--rule)] bg-[var(--paper-2)] px-4 py-3">
                  <h2 className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink)]">
                    {column.label}
                  </h2>
                  <span className="text-xs tabular-nums text-[var(--ink-soft)]">{cards.length}</span>
                </header>
                <div className="border-b border-[var(--rule)] px-4 py-2 text-[11px] text-[var(--ink-soft)]">
                  Collected value <Money value={value} />
                </div>
                <div className="space-y-2 p-3">
                  {cards.length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-[var(--ink-soft)]">No records here.</p>
                  )}
                  {cards.map((customer) => (
                    <article key={customer.id} className="border border-[var(--rule)] bg-[var(--paper)] p-3">
                      <Link
                        to={`/admin/crm/customers/${customer.id}`}
                        className="font-medium text-[var(--ink)] underline decoration-transparent underline-offset-4 hover:decoration-[var(--signal)]"
                      >
                        {customer.companyName || customer.contactName}
                      </Link>
                      <p className="mt-1 text-xs text-[var(--ink-soft)]">
                        {customer.contactName}
                        {customer.owner?.name ? ` · ${customer.owner.name}` : ''}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <Pill value={customer.source} />
                        <span className="text-[10px] text-[var(--ink-soft)]">{formatDate(customer.updatedAt)}</span>
                      </div>
                      <label className="mt-3 block">
                        <span className="sr-only">Move {customer.contactName} to another stage</span>
                        <select
                          value=""
                          disabled={moving === customer.id}
                          onChange={(event) => event.target.value && move(customer, event.target.value)}
                          className="w-full border border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-[var(--ink-soft)]"
                        >
                          <option value="">Move to…</option>
                          {(NEXT_STAGES[customer.stage] ?? []).map((stage) => (
                            <option key={stage} value={stage}>
                              {stage.replaceAll('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </label>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="text-[11px] leading-5 text-[var(--ink-soft)]">
        Completed and archived customers are not shown on the board. They remain available from the
        customer list and their 360° record.
      </p>
    </div>
  );
}
