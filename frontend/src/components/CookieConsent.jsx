import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { buttonClass } from './Editorial';

const STORAGE_KEY = 'portfolio_cookie_consent';

export const getCookieConsent = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const CookieConsent = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        setIsVisible(true);
      }
    } catch {
      setIsVisible(true);
    }

        const onOpenPreferences = () => setIsVisible(true);
    window.addEventListener('cookie_consent_open', onOpenPreferences);
    return () => window.removeEventListener('cookie_consent_open', onOpenPreferences);
  }, []);

  const handleDecision = (decision) => {
    try {
      localStorage.setItem(STORAGE_KEY, decision);
    } catch (err) {
      console.warn('[CookieConsent] Failed to write preference to localStorage:', err);
    }
    setIsVisible(false);

        const event = new CustomEvent('cookie_consent_updated', {
      detail: { decision, timestamp: Date.now() },
    });
    window.dispatchEvent(event);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.aside
          key="cookie-consent-banner"
          initial={{ opacity: 0, y: 32, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          role="region"
          aria-label="Cookie consent banner"
          className="fixed bottom-4 left-4 right-4 z-50 md:bottom-6 md:left-auto md:right-6 md:max-w-md border border-[var(--rule)] bg-[var(--paper-2)] p-6 shadow-2xl backdrop-blur-sm"
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow text-[var(--signal)]">Privacy Notice</p>
            <span className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
              Cookies
            </span>
          </div>

          <h2 className="mt-3 font-display text-xl text-[var(--ink)]">
            Privacy & cookie preferences
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">
            We use essential cookies to secure your sessions and deliver core features. With your
            permission, we also collect anonymized usage analytics to improve our service.
          </p>

          <div className="mt-3">
            <Link
              to="/cookies"
              className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--signal)]"
            >
              Review cookie policy & storage breakdown 
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => handleDecision('all')}
              className={`${buttonClass} bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--signal)] hover:text-white hover:border-[var(--signal)]`}
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={() => handleDecision('essential')}
              className={buttonClass}
            >
              Essential only
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};

export default CookieConsent;

