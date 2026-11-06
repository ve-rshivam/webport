import { Link } from 'react-router-dom';
import { SUPPORT_EMAIL, emailHref } from '../lib/contact';

const SITE_MAP = [
  {
    title: 'Pages',
    links: [
      { label: 'Home', path: '/' },
      { label: 'About', path: '/about' },
      { label: 'Skills', path: '/skills' },
      { label: 'Work', path: '/projects' },
      { label: 'Experience', path: '/experience' },
      { label: 'Services', path: '/services' },
      { label: 'Resume', path: '/resume' },
      { label: 'Reviews', path: '/reviews' },
      { label: 'Contact', path: '/contact' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Client portal', path: '/portal' },
      { label: 'Payment', path: '/payment' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy policy', path: '/privacy' },
      { label: 'Terms & conditions', path: '/terms' },
      { label: 'Refund policy', path: '/refund' },
      { label: 'Cookie policy', path: '/cookies' },
    ],
  },
];

const SOCIAL_LINKS = [
  { label: 'LinkedIn', handle: '', url: 'https://linkedin.com/in/ve-rshivam' },
  { label: 'GitHub', handle: '', url: 'https://github.com/ve-rshivam' },
  { label: 'Instagram', handle: '', url: 'https://instagram.com/ve.rshivam' },
  { label: 'X', handle: '', url: 'https://x.com/ve8rshivam' },
  ...(SUPPORT_EMAIL ? [{ label: 'Email', handle: '', url: emailHref(SUPPORT_EMAIL) }] : []),
];

const Elsewhere = () => (
  <ul className="mt-4 space-y-3">
    {SOCIAL_LINKS.map((social) => {
      const external = social.url.startsWith('http');
      return (
        <li key={social.label}>
          <a
            href={social.url}
            {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
            className="group flex flex-col text-sm text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--signal)] hover:decoration-[var(--signal)]"
          >
            <span className="inline-flex items-baseline gap-1.5">
              {social.label}
              {external && <span aria-hidden="true">↗</span>}
            </span>
            <span className="font-mono-ui text-label tracking-[0.06em] text-[var(--ink-soft)] group-hover:text-[var(--signal)]">
              {social.handle}
            </span>
          </a>
        </li>
      );
    })}
  </ul>
);

const Footer = () => {
  return (
    <footer className="border-t border-[var(--rule)]">
      <div className="mx-auto grid max-w-[1440px] grid-cols-12 gap-x-8 gap-y-10 px-6 py-14 md:px-10">
        <div className="col-span-12 lg:col-span-4">
          <p className="font-display text-3xl leading-none text-[var(--ink)]">
            Shivam Kumar<span className="text-[var(--signal)]">.</span>
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-[var(--ink-soft)]">
            Full-stack developer working across interfaces, APIs and applied AI.
          </p>
          <div className="mt-4 text-sm text-[var(--ink-soft)]">
            <p>Support</p>
            {SUPPORT_EMAIL ? (
              <a
                href={emailHref(SUPPORT_EMAIL)}
                className="mt-0.5 inline-block text-[var(--ink)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--signal)]"
              >
                {SUPPORT_EMAIL}
              </a>
            ) : (
              <Link
                to="/contact"
                className="mt-0.5 inline-block text-[var(--ink)] underline decoration-[var(--rule)] underline-offset-4"
              >
                contact form
              </Link>
            )}
          </div>
        </div>

        <nav
          aria-label="Site map"
          className="col-span-12 lg:col-span-8"
        >
          <p role="heading" aria-level={2} className="eyebrow border-b border-[var(--rule)] pb-2 text-[var(--ink-soft)]">
            Site map
          </p>
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-4">
            {SITE_MAP.map((group) => (
              <div key={group.title}>
                <p className="font-mono-ui text-label uppercase tracking-[0.14em] text-[var(--ink)]">
                  {group.title}
                </p>
                <ul className={group.links.length > 4 ? 'mt-3 grid grid-cols-2 gap-x-8 gap-y-2.5' : 'mt-3 space-y-2.5'}>
                  {group.links.map((link) => (
                    <li key={`${group.title}-${link.path}`}>
                      <Link
                        to={link.path}
                        className="text-sm text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--signal)] hover:decoration-[var(--signal)]"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div>
              <p className="font-mono-ui text-label uppercase tracking-[0.14em] text-[var(--ink)]">
                Elsewhere
              </p>
              <Elsewhere />
            </div>
          </div>
        </nav>
      </div>

      <div className="border-t border-[var(--rule)]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-6 py-4 font-mono-ui text-label tracking-[0.14em] text-[var(--ink-soft)] md:flex-row md:items-center md:justify-between md:px-10">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>© {new Date().getFullYear()} Shivam Kumar</span>
            <span aria-hidden="true" className="text-[var(--rule)]">/</span>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('cookie_consent_open'))}
              className="cursor-pointer uppercase tracking-[0.14em] transition-colors hover:text-[var(--signal)]"
            >
              Cookie settings
            </button>
          </div>
          <span>Set in Instrument Serif &amp; IBM Plex</span>
          <span>Built with React</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
