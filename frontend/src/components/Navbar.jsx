import { useState, useEffect, useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ThemeContext } from '../context/theme-context';

const NAV_ITEMS = [
  { label: 'Work', path: '/projects', index: '01' },
  { label: 'About', path: '/about', index: '02' },
  { label: 'Skills', path: '/skills', index: '03' },
  { label: 'Experience', path: '/experience', index: '04' },
];

const Navbar = () => {
  const { theme, toggleTheme } = useContext(ThemeContext);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === '/';

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMenuOpen]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--rule)] bg-[var(--paper)]">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-6 md:gap-6 md:px-10">
        <Link
          to="/"
          aria-label="Shivam Kumar — home"
          aria-current={isHome ? 'page' : undefined}
          className="flex shrink-0 items-center gap-2.5"
        >
          <span className="h-2 w-2 bg-[var(--signal)]" aria-hidden="true" />
          <span
            className={`font-display text-[1.375rem] leading-none text-[var(--ink)] ${
              isHome ? 'border-b border-[var(--signal)] pb-0.5' : ''
            }`}
          >
            Rshivam
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={isActive ? 'page' : undefined}
                className={`group inline-flex items-baseline gap-1.5 font-mono-ui text-label uppercase tracking-[0.16em] transition-colors ${
                  isActive ? 'text-[var(--signal)]' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                }`}
              >
                <span className="text-[var(--rule)] transition-colors group-hover:text-[var(--signal)]">
                  {item.index}
                </span>
                <span aria-hidden="true" className="text-[var(--rule)]">
                  —
                </span>
                <span className={isActive ? 'border-b border-[var(--signal)] pb-0.5' : ''}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 md:gap-4">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('chat_open'))}
            aria-haspopup="dialog"
            className="hidden items-center gap-2 border border-[var(--rule)] px-3 py-2 font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal)] sm:inline-flex"
          >
            Ask
            <span aria-hidden="true">↗</span>
          </button>

          <Link
            to="/contact"
            className="hidden items-center gap-2 border border-[var(--ink)] px-3 py-2 font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] md:inline-flex"
          >
            Contact
            <span aria-hidden="true">→</span>
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="inline-flex items-center gap-2 border border-[var(--rule)] px-3 py-2 font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal)]"
          >
            <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
            className="font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink)] md:hidden"
          >
            {isMenuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden border-t border-[var(--rule)] bg-[var(--paper)] md:hidden"
          >
            <nav aria-label="Mobile" className="px-6 py-5">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMenuOpen(false)}
                  aria-current={location.pathname === item.path ? 'page' : undefined}
                  className="flex items-baseline justify-between border-b border-[var(--rule)] py-4"
                >
                  <span className="font-display text-heading text-[var(--ink)]">{item.label}</span>
                  <span className="font-mono-ui text-label tracking-[0.16em] text-[var(--ink-soft)]">
                    {item.index}
                  </span>
                </Link>
              ))}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                <Link
                  to="/contact"
                  onClick={() => setIsMenuOpen(false)}
                  className="font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--signal)]"
                >
                  Contact
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    window.dispatchEvent(new Event('chat_open'));
                  }}
                  className="font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)] sm:hidden"
                >
                  Ask
                </button>
                <Link
                  to="/portal"
                  onClick={() => setIsMenuOpen(false)}
                  className="font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)]"
                >
                  Client portal
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Navbar;
