import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { SUPPORT_EMAIL, emailHref } from '../lib/contact';
import { ArrowLink, PageIntro, PageShell } from './Editorial';

const LegalPage = ({ index, label, title, intro, policyKey, children }) => {
  const [policyText, setPolicyText] = useState(null);

  useEffect(() => {
    apiGet('/api/content')
      .then((data) => {
        const text = data?.policyData?.[policyKey];
        if (text) setPolicyText(text);
      })
      .catch((error) => console.error('Failed to fetch policy content:', error));
  }, [policyKey]);

  return (
    <PageShell>
      <PageIntro index={index} label={label} title={title} intro={intro} />

      <section className="max-w-3xl py-12 md:py-16">
        <div className="border-t border-[var(--rule)] pt-8">
          {policyText ? (
            <div className="whitespace-pre-wrap text-base leading-8 text-[var(--ink-soft)]">
              {policyText}
            </div>
          ) : (
            children
          )}
        </div>
      </section>

      <div className="border-t border-[var(--rule)] py-8">
        <p className="text-sm leading-7 text-[var(--ink-soft)]">
          Questions, requests or concerns about this policy?{' '}
          {SUPPORT_EMAIL ? (
            <>Write to <a href={emailHref(SUPPORT_EMAIL)} className="text-[var(--ink)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--signal)]">{SUPPORT_EMAIL}</a>.</>
          ) : (
            <>Use the <Link to="/contact" className="underline">contact form</Link>.</>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-[var(--rule)] py-10">
        <ArrowLink to="/contact">Questions about this policy</ArrowLink>
        <ArrowLink to="/">Back home</ArrowLink>
      </div>
    </PageShell>
  );
};

export default LegalPage;
