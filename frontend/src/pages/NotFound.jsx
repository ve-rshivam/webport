import { ArrowLink, PageShell } from '../components/Editorial';

const NotFound = () => {
  return (
    <PageShell>
      <section className="flex min-h-[70vh] flex-col justify-center border-b border-[var(--rule)] py-16">
        <p className="eyebrow text-[var(--signal)]">Error 404</p>

        <h1 className="mt-6 max-w-4xl font-display text-[clamp(3rem,10vw,8rem)] leading-[0.9] tracking-[-0.02em] text-[var(--ink)]">
          This page is not in the notebook.
        </h1>

        <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--ink-soft)]">
          The address may have moved, or it never existed. Either way, there is nothing filed here.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
          <ArrowLink to="/">Back to the index</ArrowLink>
          <ArrowLink to="/contact">Report a broken link</ArrowLink>
        </div>
      </section>
    </PageShell>
  );
};

export default NotFound;
