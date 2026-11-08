import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';

export const inputClass =
  'w-full border border-[var(--rule)] bg-[var(--paper)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-soft)] focus:border-[var(--signal)] disabled:opacity-60';

export const labelClass = 'eyebrow mb-2 block text-[var(--ink-soft)]';

export const primaryClass =
  'inline-flex items-center justify-center gap-2 border border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 font-mono-ui text-label uppercase tracking-[0.14em] text-[var(--paper)] transition-colors hover:border-[var(--signal)] hover:bg-[var(--signal)] disabled:cursor-not-allowed disabled:opacity-50';

export const secondaryClass =
  'inline-flex items-center justify-center gap-2 border border-[var(--ink)] px-4 py-2.5 font-mono-ui text-label uppercase tracking-[0.14em] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-50';

export const quietClass =
  'inline-flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)] transition-colors hover:text-[var(--signal)] disabled:opacity-50';

export function PageHead({ eyebrow, title, intro, actions }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b border-[var(--rule)] pb-6">
      <div>
        {eyebrow && <p className="eyebrow text-[var(--signal)]">{eyebrow}</p>}
        <h1 className="mt-2 font-display text-4xl leading-none text-[var(--ink)]">{title}</h1>
        {intro && <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = '' }) {
  return <section className={`border border-[var(--rule)] bg-[var(--paper-2)] p-5 ${className}`}>{children}</section>;
}

export function Pill({ value, tone }) {
  const palette = {
    positive: 'border-[var(--signal)] text-[var(--signal)]',
    negative: 'border-[var(--ink)] text-[var(--ink)]',
    muted: 'border-[var(--rule)] text-[var(--ink-soft)]',
  };
  const positive = new Set(['SUCCEEDED', 'PAID', 'ACTIVE', 'COMPLETED', 'DELIVERED', 'CLIENT']);
  const negative = new Set(['FAILED', 'OVERDUE', 'VOID', 'BLOCKED', 'HIGH', 'ARCHIVED']);
  const key = tone || (positive.has(value) ? 'positive' : negative.has(value) ? 'negative' : 'muted');
  return (
    <span
      className={`inline-flex border px-2 py-1 font-mono-ui text-[10px] uppercase tracking-[0.12em] ${palette[key]}`}
    >
      {String(value ?? '—').replaceAll('_', ' ')}
    </span>
  );
}

export function Money({ value, currency = 'INR' }) {
  const amount = Number(value ?? 0);
  const code = typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : 'INR';
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
  return <span className="tabular-nums">{formatted}</span>;
}

export function Loading({ label = 'Loading' }) {
  return (
    <div className="flex items-center gap-3 py-12 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
      <span className="h-2 w-2 animate-pulse bg-[var(--signal)]" aria-hidden="true" />
      {label}…
    </div>
  );
}

export function ErrorNote({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--signal)] bg-[var(--signal-soft)] px-4 py-3 text-sm text-[var(--ink)]">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className={quietClass}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="border border-dashed border-[var(--rule)] px-6 py-12 text-center">
      <p className="font-display text-2xl text-[var(--ink)]">{title}</p>
      {children && <div className="mt-2 text-sm text-[var(--ink-soft)]">{children}</div>}
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-4 text-[var(--ink-soft)]">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:p-10">
      <div
        className="w-full max-w-2xl border border-[var(--ink)] bg-[var(--paper)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-modal-title"
      >
        <div className="flex items-center justify-between border-b border-[var(--rule)] px-5 py-4">
          <h2 id="crm-modal-title" className="font-display text-2xl text-[var(--ink)]">
            {title}
          </h2>
          <button type="button" onClick={onClose} className={quietClass} aria-label="Close dialog">
            Close ✕
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-[var(--rule)] px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Table({ head, children, className = '' }) {
  return (
    <div className={`overflow-x-auto border border-[var(--rule)] ${className}`}>
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--rule)] bg-[var(--paper-2)]">
            {head.map((cell) => (
              <th
                key={cell}
                scope="col"
                className="px-4 py-3 font-mono-ui text-[10px] font-normal uppercase tracking-[0.14em] text-[var(--ink-soft)]"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const NAV = [
  { to: '/admin/crm', label: 'Overview', end: true },
  { to: '/admin/crm/customers', label: 'Customers' },
  { to: '/admin/crm/pipeline', label: 'Pipeline' },
  { to: '/admin/crm/invoices', label: 'Invoices' },
  { to: '/admin/crm/payments', label: 'Payments' },
  { to: '/admin/crm/audit', label: 'Audit', permission: 'AUDIT_READ' },
];

export function CrmShell({ actor, onSignOut, children }) {
  const canSee = (item) =>
    !item.permission ||
    actor?.role === 'SUPERADMIN' ||
    (Array.isArray(actor?.permissions) && actor.permissions.includes(item.permission));
  return (
    <div className="min-h-[75vh]">
      <header className="border-b border-[var(--rule)] bg-[var(--paper)]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-4 md:px-10">
          <div>
            <p className="eyebrow text-[var(--signal)]">Studio CRM</p>
            <p className="mt-1 text-sm text-[var(--ink)]">
              {actor?.name || actor?.email}
              <span className="ml-2 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                {actor?.role}
              </span>
            </p>
          </div>
          <button type="button" onClick={onSignOut} className={quietClass}>
            Sign out
          </button>
        </div>
        <nav aria-label="CRM sections" className="border-t border-[var(--rule)]">
          <div className="mx-auto flex max-w-[1440px] gap-6 overflow-x-auto px-6 md:px-10">
            {NAV.filter(canSee).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `whitespace-nowrap border-b-2 py-3 font-mono-ui text-[10px] uppercase tracking-[0.16em] transition-colors ${
                    isActive
                      ? 'border-[var(--signal)] text-[var(--ink)]'
                      : 'border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-[1440px] px-6 py-8 md:px-10">{children}</main>
    </div>
  );
}
