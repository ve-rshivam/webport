import { Link } from 'react-router-dom';

export const PageShell = ({ children }) => (
  <article className="mx-auto w-full max-w-[1440px] px-6 md:px-10">{children}</article>
);

export const PageIntro = ({ index, label, title, intro, children }) => (
  <header className="border-b border-[var(--rule)] pb-10 pt-8 md:pb-14 md:pt-12">
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <p className="eyebrow text-[var(--signal)]">
        {index} — {label}
      </p>
      {children}
    </div>

    <h1 className="mt-5 max-w-5xl font-display text-[clamp(2.8rem,7vw,6rem)] leading-[0.92] tracking-[-0.02em] text-[var(--ink)]">
      {title}
    </h1>

    {intro && (
      <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--ink-soft)] md:text-lg">
        {intro}
      </p>
    )}
  </header>
);

export const Panel = ({ children, className = '' }) => (
  <div className={`border border-[var(--rule)] bg-[var(--paper-2)] p-6 md:p-8 ${className}`}>
    {children}
  </div>
);

export const ArrowLink = ({ to, href, children, className = '' }) => {
  const classes = `group inline-flex items-center gap-3 border-b border-[var(--ink)] pb-1 text-sm font-medium text-[var(--ink)] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)] ${className}`;
  const arrow = (
    <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
      {href ? '↗' : '→'}
    </span>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes}>
        {children}
        {arrow}
      </a>
    );
  }

  return (
    <Link to={to} className={classes}>
      {children}
      {arrow}
    </Link>
  );
};

export const inputClass =
  'w-full border border-[var(--rule)] bg-transparent px-3 py-2.5 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-soft)] focus:border-[var(--signal)]';

export const labelClass = 'eyebrow mb-2 block text-[var(--ink-soft)]';

export const buttonClass =
  'inline-flex items-center justify-center gap-2 border border-[var(--ink)] px-5 py-3 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-50';
