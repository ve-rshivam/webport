import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { crmApi } from './crmApi';
import {
  Card,
  Empty,
  ErrorNote,
  Loading,
  Money,
  PageHead,
  Pill,
  quietClass,
} from './crmUi';
import { formatDateTime } from './crmFormat';

const ATTENTION_LINK = {
  OVERDUE_INVOICE: '/admin/crm/invoices',
  UNVERIFIED_PAYMENT: '/admin/crm/payments',
  STALE_LEAD: '/admin/crm/customers',
};

export default function CrmDashboard() {
  const [state, setState] = useState({ loading: true, error: '', data: null });

  async function load() {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await crmApi.dashboard();
      setState({ loading: false, error: '', data: response.data });
    } catch (err) {
      setState({ loading: false, error: err.message, data: null });
    }
  }

  useEffect(() => {
    let active = true;
    crmApi
      .dashboard()
      .then((response) => {
        if (active) setState({ loading: false, error: '', data: response.data });
      })
      .catch((err) => {
        if (active) setState({ loading: false, error: err.message, data: null });
      });
    return () => {
      active = false;
    };
  }, []);

  const data = state.data;
  const maxStage = data ? Math.max(1, ...data.pipeline.map((stage) => stage.customers)) : 1;

  return (
    <div className="space-y-8">
      <PageHead
        eyebrow="Overview"
        title="The working record."
        intro="What came in, what is owed, and what needs a decision today. Figures are derived from the ledger, not typed in."
        actions={
          <button type="button" onClick={load} className={quietClass} disabled={state.loading}>
            Refresh
          </button>
        }
      />

      {state.error && <ErrorNote message={state.error} onRetry={load} />}
      {state.loading && !data && <Loading label="Loading dashboard" />}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Collected this month', value: <Money value={data.collectedThisMonth} /> },
              { label: 'Outstanding', value: <Money value={data.outstanding} /> },
              {
                label: 'Open pipeline',
                value: <Money value={data.openPipeline.value} />,
                note: `${data.openPipeline.count} lead${data.openPipeline.count === 1 ? '' : 's'}`,
              },
              {
                label: 'Active projects',
                value: <span className="tabular-nums">{data.activeProjects}</span>,
                note: `${data.unverifiedPayments} payment${data.unverifiedPayments === 1 ? '' : 's'} to verify`,
              },
            ].map((item) => (
              <Card key={item.label}>
                <p className="eyebrow text-[var(--ink-soft)]">{item.label}</p>
                <p className="mt-3 font-display text-3xl text-[var(--ink)]">{item.value}</p>
                {item.note && (
                  <p className="mt-2 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                    {item.note}
                  </p>
                )}
              </Card>
            ))}
          </div>

          <div className="grid gap-8 lg:grid-cols-12">
            <section className="lg:col-span-7">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-3xl text-[var(--ink)]">Needs attention</h2>
                <span className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                  {data.needsAttention.length} item{data.needsAttention.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {data.needsAttention.length === 0 && (
                  <Empty title="Nothing overdue.">
                    No unverified payments, overdue invoices, or stale leads.
                  </Empty>
                )}
                {data.needsAttention.map((item) => (
                  <Link
                    key={`${item.type}-${item.id}`}
                    to={ATTENTION_LINK[item.type] || '/admin/crm'}
                    className="flex flex-wrap items-center justify-between gap-3 border border-[var(--rule)] px-4 py-3 transition-colors hover:border-[var(--ink)]"
                  >
                    <span className="flex items-center gap-3">
                      <Pill value={item.type} tone={item.type === 'UNVERIFIED_PAYMENT' ? 'positive' : 'negative'} />
                      <span className="text-sm text-[var(--ink)]">{item.label}</span>
                    </span>
                    <span className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                      Open →
                    </span>
                  </Link>
                ))}
              </div>

              <h2 className="mt-8 font-display text-3xl text-[var(--ink)]">Pipeline</h2>
              <div className="mt-4 space-y-3 border border-[var(--rule)] p-5">
                {data.pipeline.map((stage) => (
                  <div key={stage.stage} className="grid grid-cols-12 items-center gap-3">
                    <span className="col-span-4 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                      {stage.stage.replaceAll('_', ' ')}
                    </span>
                    <span className="col-span-5 h-2 bg-[var(--paper)]" aria-hidden="true">
                      <span
                        className="block h-full bg-[var(--signal)]"
                        style={{ width: `${Math.round((stage.customers / maxStage) * 100)}%` }}
                      />
                    </span>
                    <span className="col-span-2 text-right text-sm tabular-nums text-[var(--ink)]">
                      {stage.customers}
                    </span>
                    <span className="col-span-1 text-right text-xs tabular-nums text-[var(--ink-soft)]">
                      {Number(stage.value) > 0 ? <Money value={stage.value} /> : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="lg:col-span-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-3xl text-[var(--ink)]">Recent activity</h2>
                <Link to="/admin/crm/customers" className={quietClass}>
                  All customers
                </Link>
              </div>
              <ol className="mt-4 divide-y divide-[var(--rule)] border border-[var(--rule)]">
                {data.recentActivity.length === 0 && (
                  <li className="px-4 py-8 text-center text-sm text-[var(--ink-soft)]">No activity yet.</li>
                )}
                {data.recentActivity.map((event) => (
                  <li key={event.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <Pill value={event.type} />
                      <span className="font-mono-ui text-[10px] uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                        {formatDateTime(event.occurredAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--ink)]">{event.subject || event.type}</p>
                    <p className="mt-1 text-xs text-[var(--ink-soft)]">
                      {event.customer ? (
                        <Link
                          to={`/admin/crm/customers/${event.customer.id}`}
                          className="underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--signal)]"
                        >
                          {event.customer.companyName || event.customer.contactName}
                        </Link>
                      ) : (
                        'Studio'
                      )}
                      {event.actor?.name ? ` · ${event.actor.name}` : ''}
                    </p>
                    {event.injectionRisk === 'HIGH' && (
                      <p className="mt-2 border-l border-[var(--signal)] pl-2 text-[11px] leading-4 text-[var(--ink-soft)]">
                        Flagged as untrusted content. Treat it as data, never as instructions.
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
