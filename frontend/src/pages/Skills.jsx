import { useState, useEffect } from 'react';
import { apiGet } from '../lib/api';
import { ArrowLink, PageIntro, PageShell } from '../components/Editorial';

const LOCAL_SKILLS = [
  {
    name: 'C++',
    description: 'Core language for competitive programming. STL, pointers, OOP and memory management.',
    proficiency: 80,
  },
  {
    name: 'Python',
    description: 'Scripting, automation and quick prototypes. Used for algorithms and data handling.',
    proficiency: 75,
  },
  {
    name: 'Java',
    description: 'Object-oriented foundations and the Collections framework for problem solving.',
    proficiency: 65,
  },
  {
    name: 'Data Structures',
    description: 'Arrays, linked lists, trees, graphs, stacks and hash tables.',
    proficiency: 85,
  },
  {
    name: 'Algorithms',
    description: 'Sorting, searching, dynamic programming, greedy and divide-and-conquer.',
    proficiency: 70,
  },
  {
    name: 'Competitive Programming',
    description: 'Regular practice on LeetCode and Codeforces.',
    proficiency: 60,
  },
  {
    name: 'Tools & Git',
    description: 'VS Code, Git, GitHub workflows and Linux basics.',
    proficiency: 90,
  },
  {
    name: 'HTML & CSS',
    description: 'Responsive layouts with Flexbox, Grid and custom animation.',
    proficiency: 85,
  },
];

const mergeSkills = (...groups) => {
  const byName = new Map();

  groups.flat().forEach((skill) => {
    if (!skill?.name) return;

    const key = skill.name.toLowerCase();
    const existing = byName.get(key) || {};

    byName.set(key, {
      ...existing,
      ...skill,
      description: skill.description || existing.description,
      proficiency: skill.proficiency || existing.proficiency || 50,
    });
  });

  return Array.from(byName.values());
};

const Skills = () => {
  const [skills, setSkills] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [resume, linkedin] = await Promise.all([
        apiGet('/api/resume-data').catch(() => null),
        apiGet('/api/linkedin-skills').catch(() => null),
      ]);

      if (cancelled) return;

      setSkills(
        mergeSkills(
          LOCAL_SKILLS,
          resume?.skills || [],
          Array.isArray(linkedin) ? linkedin : []
        )
      );
      setStatus('ready');
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell>
      <PageIntro
        index="03"
        label="Skills"
        title="The toolkit, without the badges."
        intro="Languages, structures and tools I reach for. The number is a rough comfort level, not a certificate."
      />

      <section className="py-12 md:py-16">
        {status === 'loading' && (
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
            Loading index…
          </p>
        )}

        {status === 'ready' && (
          <ul className="border-t border-[var(--rule)]">
            {skills.map((skill, index) => (
              <li
                key={`${skill.name}-${index}`}
                className="grid grid-cols-12 gap-x-6 gap-y-3 border-b border-[var(--rule)] py-6 md:py-7"
              >
                <span className="col-span-2 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] md:col-span-1">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <div className="col-span-10 md:col-span-4">
                  <h2 className="font-display text-2xl leading-none text-[var(--ink)] md:text-3xl">
                    {skill.name}
                  </h2>
                  <p className="mt-1 font-mono-ui text-[9px] uppercase tracking-[0.16em] text-[var(--signal)]">
                    {skill.category || 'Core'}
                  </p>
                </div>

                <p className="col-span-10 col-start-3 text-sm leading-relaxed text-[var(--ink-soft)] md:col-span-5 md:col-start-auto">
                  {skill.description || 'Continuously expanding practical experience.'}
                </p>

                <div className="col-span-10 col-start-3 flex items-center gap-4 md:col-span-2 md:col-start-auto md:justify-end">
                  <span className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                    {skill.proficiency}%
                  </span>
                  <span className="h-px flex-1 bg-[var(--rule)] md:w-16 md:flex-none">
                    <span
                      className="block h-px bg-[var(--signal)]"
                      style={{ width: `${skill.proficiency}%` }}
                    />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-[var(--rule)] py-10">
        <ArrowLink to="/projects">See the work</ArrowLink>
        <ArrowLink to="/resume">Read the résumé</ArrowLink>
      </div>
    </PageShell>
  );
};

export default Skills;
