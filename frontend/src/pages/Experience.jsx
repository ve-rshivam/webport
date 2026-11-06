import { useState, useEffect } from 'react';
import { apiGet } from '../lib/api';
import { ArrowLink, PageIntro, PageShell } from '../components/Editorial';

const Experience = () => {
  const [experiences, setExperiences] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    apiGet('/api/resume-data')
      .then((data) => {
        const records = Array.isArray(data?.experiences) ? data.experiences : [];
        setExperiences(
          [...records].sort((a, b) => {
            const idA = a?._id?.toString() || '';
            const idB = b?._id?.toString() || '';
            return idB.localeCompare(idA);
          })
        );
        setStatus('ready');
      })
      .catch((error) => {
        console.error('Failed to fetch experiences:', error);
        setStatus('error');
      });
  }, []);

  return (
    <PageShell>
      <PageIntro
        index="04"
        label="Experience"
        title="A short professional record."
        intro="Roles, collaborations and the work that shaped how I build software."
      />

      <section className="py-12 md:py-16">
        {status === 'loading' && (
          <p className="font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)]">
            Loading record…
          </p>
        )}

        {status === 'error' && (
          <p className="text-sm text-[var(--ink-soft)]">The experience record could not load.</p>
        )}

        {status === 'ready' && experiences.length === 0 && (
          <p className="text-sm text-[var(--ink-soft)]">No experience records found.</p>
        )}

        {status === 'ready' && experiences.length > 0 && (
          <ul className="border-t border-[var(--rule)]">
            {experiences.map((experience, index) => (
              <li
                key={experience._id || index}
                className="border-b border-[var(--rule)] py-8 md:py-10"
              >
                <p className="font-mono-ui text-label tracking-[0.14em] text-[var(--ink-soft)]">
                  {experience.duration || '—'}
                </p>

                <h2 className="mt-2 font-display text-heading leading-none text-[var(--ink)]">
                  {experience.role || 'Software Engineer'}
                </h2>
                <p className="mt-2 text-sm text-[var(--signal)]">
                  {experience.company || 'Independent'}
                </p>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--ink-soft)]">
                  {experience.description || 'Details available on request.'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-[var(--rule)] py-10">
        <ArrowLink to="/resume">Read the resume</ArrowLink>
        <ArrowLink to="/projects">See the work</ArrowLink>
      </div>
    </PageShell>
  );
};

export default Experience;
