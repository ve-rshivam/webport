import { Link } from 'react-router-dom';

const INDEX_LINKS = [
  { label: 'Work', path: '/projects' },
  { label: 'About', path: '/about' },
  { label: 'Skills', path: '/skills' },
  { label: 'Experience', path: '/experience' },
  { label: 'Services', path: '/services' },
];

const ELSEWHERE_LINKS = [
  { label: 'Client portal', path: '/portal' },
  { label: 'Payment', path: '/payment' },
  { label: 'Reviews', path: '/reviews' },
];

const Footer = () => {
  return (
    <footer className="border-t border-[var(--rule)]">
      <div className="mx-auto grid max-w-[1440px] grid-cols-12 gap-x-8 gap-y-10 px-6 py-14 md:px-10">
        <div className="col-span-12 md:col-span-6">
          <p className="font-display text-3xl leading-none text-[var(--ink)]">
            Shivam Kumar<span className="text-[var(--signal)]">.</span>
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-[var(--ink-soft)]">
            Full-stack developer working across interfaces, APIs and applied AI.
          </p>
        </div>

        <nav aria-label="Footer index" className="col-span-6 md:col-span-3">
          <p className="eyebrow text-[var(--ink-soft)]">Index</p>
          <ul className="mt-4 space-y-2.5">
            {INDEX_LINKS.map((link) => (
              <li key={link.path}>
                <Link
                  to={link.path}
                  className="text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--signal)]"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="col-span-6 md:col-span-3">
          <p className="eyebrow text-[var(--ink-soft)]">Elsewhere</p>
          <ul className="mt-4 space-y-2.5">
            <li>
              <a
                href="https://linkedin.com/in/ve-rshivam"
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--signal)]"
              >
                LinkedIn ↗
              </a>
            </li>
            {ELSEWHERE_LINKS.map((link) => (
              <li key={link.path}>
                <Link
                  to={link.path}
                  className="text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--signal)]"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-[var(--rule)]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-6 py-4 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)] md:flex-row md:items-center md:justify-between md:px-10">
          <span>© {new Date().getFullYear()} Shivam Kumar</span>
          <span>Set in Instrument Serif &amp; IBM Plex</span>
          <span>Built with React</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
