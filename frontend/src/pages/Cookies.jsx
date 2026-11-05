import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLink, PageIntro, PageShell, buttonClass } from '../components/Editorial';
import { SUPPORT_EMAIL, emailHref } from '../lib/contact';

const STORAGE_KEY = 'portfolio_cookie_consent';

const Cookies = () => {
  const [currentPreference, setCurrentPreference] = useState('unset');
  const [resetNotice, setResetNotice] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      setCurrentPreference(saved || 'unset');
    } catch {
      setCurrentPreference('unset');
    }

    const onConsentUpdated = (e) => {
      const decision = e?.detail?.decision;
      setCurrentPreference(decision || 'unset');
    };

    window.addEventListener('cookie_consent_updated', onConsentUpdated);
    return () => window.removeEventListener('cookie_consent_updated', onConsentUpdated);
  }, []);

  const handleResetPreferences = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setCurrentPreference('unset');
      setResetNotice('Your cookie preferences were cleared. The consent banner has reappeared.');
      window.dispatchEvent(new Event('cookie_consent_open'));
      window.dispatchEvent(
        new CustomEvent('cookie_consent_updated', { detail: { decision: null } })
      );
    } catch (err) {
      console.warn('Could not clear cookie preferences:', err);
    }
  };

  return (
    <PageShell>
      <PageIntro
        index="09"
        label="Privacy"
        title="Cookie policy."
        intro="How cookies, local storage, and session tokens are used to keep your browsing and client portal sessions secure and functional."
      />

      <article className="max-w-4xl py-12 md:py-16">
        <div className="space-y-12">
          { }
          <section className="border-t border-[var(--rule)] pt-8">
            <div className="flex items-baseline justify-between gap-3">
              <p className="eyebrow text-[var(--signal)]">01 / Scope</p>
              <span className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                General
              </span>
            </div>
            <h2 className="mt-4 font-display text-2xl text-[var(--ink)] md:text-3xl">
              Overview & scope
            </h2>
            <p className="mt-4 text-base leading-8 text-[var(--ink-soft)]">
              This policy explains how this website (<code className="font-mono text-sm text-[var(--ink)]">rshivam.dev</code>)
              and its integrated client portal utilize HTTP cookies and modern web storage technologies
              (<code className="font-mono text-sm text-[var(--ink)]">localStorage</code> and{' '}
              <code className="font-mono text-sm text-[var(--ink)]">sessionStorage</code>).
            </p>
            <p className="mt-4 text-base leading-8 text-[var(--ink-soft)]">
              We practice data minimization: we do not sell your data, we never deploy intrusive
              cross-site tracking cookies, and we restrict persistent storage to what is strictly
              necessary for security, account authentication, and your interface preferences.
            </p>
          </section>

          { }
          <section className="border-t border-[var(--rule)] pt-8">
            <div className="flex items-baseline justify-between gap-3">
              <p className="eyebrow text-[var(--signal)]">02 / Breakdown</p>
              <span className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                Storage Audit
              </span>
            </div>
            <h2 className="mt-4 font-display text-2xl text-[var(--ink)] md:text-3xl">
              Storage breakdown & classifications
            </h2>
            <p className="mt-4 text-base leading-8 text-[var(--ink-soft)]">
              We categorize our browser storage into three distinct tiers depending on necessity and user choice:
            </p>

            { }
            <div className="mt-8 space-y-4">
              <h3 className="font-display text-xl text-[var(--ink)]">
                A. Strictly Essential Storage
              </h3>
              <p className="text-sm leading-7 text-[var(--ink-soft)]">
                These items are strictly necessary for core application features, identity
                verification, and defensive security. They cannot be disabled.
              </p>

              <div className="overflow-x-auto border border-[var(--rule)] bg-[var(--paper-2)]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--rule)] font-mono-ui uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                      <th className="p-3.5 md:p-4">Key / Identifier</th>
                      <th className="p-3.5 md:p-4">Storage Type</th>
                      <th className="p-3.5 md:p-4">Lifespan</th>
                      <th className="p-3.5 md:p-4">Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--rule)] text-[var(--ink)]">
                    <tr>
                      <td className="p-3.5 font-mono text-[var(--signal)] md:p-4">auth.client.session</td>
                      <td className="p-3.5 md:p-4">localStorage</td>
                      <td className="p-3.5 text-[var(--ink-soft)] md:p-4">Until sign-out / 25m idle</td>
                      <td className="p-3.5 text-[var(--ink-soft)] md:p-4">
                        Cryptographically signed JWT authenticating client portal access.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-mono text-[var(--signal)] md:p-4">auth.admin.session</td>
                      <td className="p-3.5 md:p-4">localStorage</td>
                      <td className="p-3.5 text-[var(--ink-soft)] md:p-4">Until sign-out / 25m idle</td>
                      <td className="p-3.5 text-[var(--ink-soft)] md:p-4">
                        Admin authorization token with hardware/PIN two-factor state.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-mono text-[var(--signal)] md:p-4">lastActiveTimestamp</td>
                      <td className="p-3.5 md:p-4">localStorage</td>
                      <td className="p-3.5 text-[var(--ink-soft)] md:p-4">Session lifetime</td>
                      <td className="p-3.5 text-[var(--ink-soft)] md:p-4">
                        Enforces automatic logout after 25 minutes of inactivity for admin and client sessions.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-mono text-[var(--signal)] md:p-4">Anti-CSRF Tokens</td>
                      <td className="p-3.5 md:p-4">HTTP Header / Memory</td>
                      <td className="p-3.5 text-[var(--ink-soft)] md:p-4">Per request</td>
                      <td className="p-3.5 text-[var(--ink-soft)] md:p-4">
                        Guards payment verification and form submissions against forgery attacks.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            { }
            <div className="mt-10 space-y-4">
              <h3 className="font-display text-xl text-[var(--ink)]">
                B. Functional & Preference Storage
              </h3>
              <p className="text-sm leading-7 text-[var(--ink-soft)]">
                These items remember your personalized settings across visits so you do not have to
                reconfigure the site every time you return.
              </p>

              <div className="overflow-x-auto border border-[var(--rule)] bg-[var(--paper-2)]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--rule)] font-mono-ui uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                      <th className="p-3.5 md:p-4">Key / Identifier</th>
                      <th className="p-3.5 md:p-4">Storage Type</th>
                      <th className="p-3.5 md:p-4">Lifespan</th>
                      <th className="p-3.5 md:p-4">Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--rule)] text-[var(--ink)]">
                    <tr>
                      <td className="p-3.5 font-mono text-[var(--signal)] md:p-4">portfolio_cookie_consent</td>
                      <td className="p-3.5 md:p-4">localStorage</td>
                      <td className="p-3.5 text-[var(--ink-soft)] md:p-4">Persistent</td>
                      <td className="p-3.5 text-[var(--ink-soft)] md:p-4">
                        Remembers your cookie decision (<code className="font-mono text-[var(--ink)]">'all'</code> or{' '}
                        <code className="font-mono text-[var(--ink)]">'essential'</code>) to prevent nagging banners.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-mono text-[var(--signal)] md:p-4">portfolio.homeRoles.v1</td>
                      <td className="p-3.5 md:p-4">localStorage</td>
                      <td className="p-3.5 text-[var(--ink-soft)] md:p-4">Persistent</td>
                      <td className="p-3.5 text-[var(--ink-soft)] md:p-4">
                        Caches dynamic role titles to minimize backend database roundtrips.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-mono text-[var(--signal)] md:p-4">introSeen</td>
                      <td className="p-3.5 md:p-4">localStorage</td>
                      <td className="p-3.5 text-[var(--ink-soft)] md:p-4">Persistent</td>
                      <td className="p-3.5 text-[var(--ink-soft)] md:p-4">
                        Tracks whether you have viewed the terminal welcome animation.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            { }
            <div className="mt-10 space-y-4">
              <h3 className="font-display text-xl text-[var(--ink)]">
                C. Analytics & Third-Party Performance
              </h3>
              <p className="text-sm leading-7 text-[var(--ink-soft)]">
                We respect your autonomy: optional analytics or performance measurement scripts
                (e.g., anonymized visitor counters, error diagnostic telemetry) are strictly gated.
                They only execute if you click <strong>"Accept all"</strong> on the consent banner.
                If you select <strong>"Essential only"</strong>, no optional analytics cookies or trackers are loaded.
              </p>
            </div>
          </section>

          { }
          <section className="border-t border-[var(--rule)] pt-8">
            <div className="flex items-baseline justify-between gap-3">
              <p className="eyebrow text-[var(--signal)]">03 / Controls</p>
              <span className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                Preferences
              </span>
            </div>
            <h2 className="mt-4 font-display text-2xl text-[var(--ink)] md:text-3xl">
              User control & preference management
            </h2>
            <p className="mt-4 text-base leading-8 text-[var(--ink-soft)]">
              You maintain total authority over your stored data. You can inspect or clear all stored
              values at any time directly through your browser or by using our one-click reset control below:
            </p>

            <div className="mt-6 border border-[var(--rule)] bg-[var(--paper-2)] p-6 md:p-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="eyebrow text-[var(--ink-soft)]">Active state</p>
                  <p className="mt-1 font-mono text-sm text-[var(--ink)]">
                    Current consent:{' '}
                    <span className="font-bold text-[var(--signal)]">
                      {currentPreference.toUpperCase()}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-soft)]">
                    Clear your saved choice to change your selection.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetPreferences}
                  className={`${buttonClass} bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--signal)] hover:text-white hover:border-[var(--signal)]`}
                >
                  Reset Cookie Preferences
                </button>
              </div>

              {resetNotice && (
                <p className="mt-4 border-l-2 border-[var(--signal)] pl-3 text-xs leading-5 text-[var(--signal)]">
                  {resetNotice}
                </p>
              )}
            </div>

            <div className="mt-8 space-y-4">
              <h3 className="font-display text-lg text-[var(--ink)]">
                Clearing cookies in your browser
              </h3>
              <p className="text-sm leading-7 text-[var(--ink-soft)]">
                Most web browsers allow you to block or delete cookies in your settings:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-sm leading-7 text-[var(--ink-soft)]">
                <li>
                  <strong className="text-[var(--ink)]">Google Chrome / Brave:</strong> Settings Privacy & Security Third-party cookies.
                </li>
                <li>
                  <strong className="text-[var(--ink)]">Apple Safari:</strong> Preferences / Settings Privacy Manage Website Data.
                </li>
                <li>
                  <strong className="text-[var(--ink)]">Mozilla Firefox:</strong> Settings Privacy & Security Enhanced Tracking Protection.
                </li>
              </ul>
              <p className="text-xs text-[var(--ink-soft)]">
                <em>Note:</em> Clearing essential session storage will require you to sign in again if you have an active client portal session.
              </p>
            </div>
          </section>
        </div>
      </article>

      { }
      <div className="border-t border-[var(--rule)] py-8">
        <p className="text-sm leading-7 text-[var(--ink-soft)]">
          Questions or specific data privacy inquiries?{' '}
          {SUPPORT_EMAIL ? (
            <>Reach out at <a href={emailHref(SUPPORT_EMAIL)} className="text-[var(--ink)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--signal)]">{SUPPORT_EMAIL}</a>.</>
          ) : (
            <>Use the <Link to="/contact" className="underline">contact form</Link>.</>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-[var(--rule)] py-10">
        <ArrowLink to="/privacy">Privacy policy</ArrowLink>
        <ArrowLink to="/terms">Terms of service</ArrowLink>
        <ArrowLink to="/contact">Contact</ArrowLink>
        <ArrowLink to="/">Back home</ArrowLink>
      </div>
    </PageShell>
  );
};

export default Cookies;

