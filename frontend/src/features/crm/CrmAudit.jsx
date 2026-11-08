import { useEffect, useState } from 'react';
import { crmApi } from './crmApi';
import {
  ErrorNote,
  Loading,
  PageHead,
  Pill,
  Table,
  inputClass,
  quietClass,
} from './crmUi';
import { formatDateTime } from './crmFormat';

export default function CrmAudit() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await crmApi.audit({ q: query, limit: 50 });
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
      .audit({ q: '', limit: 50 })
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
  }, []);

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Audit"
        title="Every change, on the record."
        intro="Mutations are appended with the actor, role, IP, request ID, and a redacted before/after diff. Secrets, tokens and payment proof bytes are never written here."
        actions={
          <button type="button" onClick={load} className={quietClass} disabled={loading}>
            Refresh
          </button>
        }
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          load();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="min-w-[240px] flex-1">
          <span className="eyebrow mb-2 block text-[var(--ink-soft)]">Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Action, actor ID, target email"
            className={inputClass}
          />
        </label>
        <button type="submit" className={quietClass}>
          Search →
        </button>
      </form>

      <ErrorNote message={error} onRetry={load} />
      {loading && <Loading label="Loading audit trail" />}

      {!loading && !error && (
        <>
          <Table head={['Time', 'Action', 'Actor', 'Entity', 'Outcome', 'Diff']}>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--rule)] align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--ink-soft)]">
                  {formatDateTime(row.createdAt)}
                </td>
                <td className="px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.1em] text-[var(--ink)]">
                  {row.action}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--ink-soft)]">
                  {row.actorRole || 'system'}
                  {row.actorId ? <span className="block text-[10px]">{row.actorId}</span> : null}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--ink-soft)]">
                  {row.entityType || '—'}
                  {row.entityId ? <span className="block text-[10px]">{row.entityId}</span> : null}
                </td>
                <td className="px-4 py-3">
                  <Pill value={row.outcome} tone={row.outcome === 'DENIED' || row.outcome === 'FAILED' ? 'negative' : 'positive'} />
                </td>
                <td className="px-4 py-3 text-xs">
                  {row.before || row.after ? (
                    <details>
                      <summary className="cursor-pointer text-[var(--ink-soft)]">View</summary>
                      <pre className="mt-2 max-w-md overflow-x-auto whitespace-pre-wrap break-words bg-[var(--paper)] p-2 text-[10px] leading-4 text-[var(--ink-soft)]">
                        {JSON.stringify({ before: row.before, after: row.after }, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    <span className="text-[var(--ink-soft)]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          {rows.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--ink-soft)]">No audit entries match.</p>
          )}
          <div className="flex items-center justify-between font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            <span>
              {rows.length} of {meta?.total ?? rows.length} entries
            </span>
            <span>Page {meta?.page ?? 1}</span>
          </div>
        </>
      )}
    </div>
  );
}
