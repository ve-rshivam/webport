import { useState, useEffect } from 'react';
import { apiGet } from '../lib/api';

const Education = () => {
  const [educations, setEducations] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    apiGet('/api/resume-data')
      .then((data) => {
        const records = data?.education || data?.educations || data?.academic || [];
        const sorted = Array.isArray(records)
          ? [...records].sort((a, b) => {
              const idA = a?._id?.toString() || '';
              const idB = b?._id?.toString() || '';
              return idB.localeCompare(idA);
            })
          : [];
        setEducations(sorted);
        setStatus('ready');
      })
      .catch((error) => {
        console.error('Failed to fetch education data:', error);
        setEducations([]);
        setStatus('error');
      });
  }, []);

  return (
    <section>
      <p className="eyebrow text-[var(--signal)]">Education</p>
      <h2 className="mt-2 font-display text-heading leading-none text-[var(--ink)]">
        Where I study.
      </h2>

      {status === 'loading' && (
        <p className="mt-8 font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)]">
          Loading record…
        </p>
      )}

      {status === 'error' && (
        <p className="mt-8 text-sm text-[var(--ink-soft)]">The education record could not load.</p>
      )}

      {status === 'ready' && educations.length === 0 && (
        <p className="mt-8 text-sm text-[var(--ink-soft)]">No education records found.</p>
      )}

      {status === 'ready' && educations.length > 0 && (
        <ul className="mt-8 border-t border-[var(--rule)]">
          {educations.map((edu, index) => {
            if (!edu) return null;

            return (
              <li
                key={edu._id || index}
                className="grid grid-cols-12 gap-x-6 gap-y-2 border-b border-[var(--rule)] py-6"
              >
                <span className="col-span-12 font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)] sm:col-span-3">
                  {edu.year || edu.duration || '—'}
                </span>

                <div className="col-span-12 sm:col-span-9">
                  <h3 className="font-display text-title leading-tight text-[var(--ink)]">
                    {edu.degree || edu.title || 'Bachelor of Technology'}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--signal)]">
                    {edu.institution || edu.college || edu.school || 'University'}
                  </p>
                  {edu.description && (
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-soft)]">
                      {edu.description}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default Education;
