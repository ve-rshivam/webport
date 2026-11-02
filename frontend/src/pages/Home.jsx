import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { apiGet } from '../lib/api';

const Home = () => {
  const reduceMotion = useReducedMotion();

  const [projects, setProjects] = useState([]);
  const [projectStatus, setProjectStatus] = useState('loading');

  const [homeContent, setHomeContent] = useState({
    heroSubtitle:
      'I build high-performance, interactive web applications with modern frameworks, careful algorithms and scalable backends.',
    roles: [
      'Full-Stack Web Developer',
      'AI & ML Enthusiast',
      "Google Student Ambassador '26",
      'Microsoft Learn Student Ambassador',
      'DSA Problem Solver',
      'Open Source Contributor',
    ],
  });

  const [aboutContent, setAboutContent] = useState({
    description:
      'I am a passionate full-stack developer specialised in the MERN stack. I like bringing ideas to life through code and building interfaces that feel considered rather than assembled.',
  });

  const [previewSkills, setPreviewSkills] = useState([
    'C++', 'Python', 'Next.js', 'React.js', 'Node.js', 'MongoDB',
  ]);

  const retryProjects = () => {
    setProjectStatus('loading');
    apiGet('/api/pinned-projects')
      .then((data) => {
        if (Array.isArray(data)) setProjects(data.slice(0, 4));
        setProjectStatus('ready');
      })
      .catch((err) => {
        console.error('Error fetching pinned projects:', err);
        setProjectStatus('error');
      });
  };

  useEffect(() => {
    apiGet('/api/content')
      .then((data) => {
        if (!data) return;

        if (data.homeData?.heroSubtitle) {
          setHomeContent((prev) => ({
            ...prev,
            heroSubtitle: data.homeData.heroSubtitle,
          }));
        }

        if (data.aboutData?.description) {
          setAboutContent({ description: data.aboutData.description });
        }
      })
      .catch((err) => console.log('Content fetch error', err));

    apiGet('/api/pinned-projects')
      .then((data) => {
        if (Array.isArray(data)) setProjects(data.slice(0, 4));
        setProjectStatus('ready');
      })
      .catch((err) => {
        console.error('Error fetching pinned projects:', err);
        setProjectStatus('error');
      });

    apiGet('/api/resume-data')
      .then((data) => {
        if (data.skills?.length > 0) {
          setPreviewSkills(data.skills.slice(0, 8).map((skill) => skill.name));
        }
      })
      .catch((err) => console.log('Error fetching skills:', err));
  }, []);

  const reveal = (delay = 0) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-60px' },
          transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1], delay },
        };

  return (
    <article className="mx-auto w-full max-w-[1440px] px-6 md:px-10">
      {/* 01 — Masthead */}
      <section className="border-b border-[var(--rule)] pb-12 pt-8 md:pb-16 md:pt-12">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
          <span>Portfolio — 2026</span>
          <span className="hidden md:inline">Full-stack / Interface / AI</span>
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 bg-[var(--signal)]" aria-hidden="true" />
            Open to select work
          </span>
        </div>

        <div className="mt-10 grid grid-cols-12 items-start gap-x-8 gap-y-12 md:mt-14">
          <motion.div className="col-span-12 lg:col-span-8" {...reveal()}>
            <p className="eyebrow text-[var(--signal)]">01 — Introduction</p>

            <h1 className="mt-5 font-display text-[clamp(3.9rem,11vw,9.5rem)] leading-[0.82] tracking-[-0.02em] text-[var(--ink)]">
              {'Shivam'}
              <br />
              {'Kumar'}<span className="text-[var(--signal)]">.</span>
            </h1>

            <p className="mt-8 max-w-xl text-lg leading-relaxed text-[var(--ink-soft)] md:text-xl">
              {homeContent.heroSubtitle}
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Link
                to="/contact"
                className="group inline-flex items-center gap-3 border-b border-[var(--ink)] pb-1 text-sm font-medium text-[var(--ink)] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
              >
                Start a project
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                >
                  ↗
                </span>
              </Link>

              <Link
                to="/resume"
                className="inline-flex items-center gap-2 font-mono-ui text-[11px] uppercase tracking-[0.16em] text-[var(--ink-soft)] transition-colors hover:text-[var(--signal)]"
              >
                Read résumé <span aria-hidden="true">→</span>
              </Link>
            </div>
          </motion.div>

          <aside className="col-span-12 lg:col-span-4 lg:pl-6">
            <motion.figure
              {...reveal(0.08)}
              className="border border-[var(--rule)] bg-[var(--paper-2)] p-2"
            >
              <img
                src="/profile.png"
                alt="Portrait of Shivam Kumar"
                className="aspect-[4/5] w-full object-cover grayscale contrast-[1.05]"
              />
              <figcaption className="mt-2 flex items-baseline justify-between font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                <span>Fig. 01 — Portrait</span>
                <span>2026</span>
              </figcaption>
            </motion.figure>

            <dl className="mt-8 border-t border-[var(--rule)] pt-5 text-sm">
              <div className="flex justify-between gap-6 border-b border-[var(--rule)] py-2.5">
                <dt className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                  Focus
                </dt>
                <dd className="text-right text-[var(--ink)]">Web platforms &amp; applied AI</dd>
              </div>
              <div className="flex justify-between gap-6 border-b border-[var(--rule)] py-2.5">
                <dt className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                  Stack
                </dt>
                <dd className="text-right text-[var(--ink)]">React · Node · Python</dd>
              </div>
              <div className="flex justify-between gap-6 py-2.5">
                <dt className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                  Status
                </dt>
                <dd className="text-right text-[var(--signal)]">Available</dd>
              </div>
            </dl>
          </aside>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--rule)] pt-4">
          <span className="eyebrow text-[var(--signal)]">Currently</span>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            {homeContent.roles.map((role, index) => (
              <li key={role} className="flex items-center gap-5">
                {index > 0 && <span aria-hidden="true" className="h-3 w-px bg-[var(--rule)]" />}
                {role}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 02 — Selected work */}
      <section className="border-b border-[var(--rule)] py-16 md:py-24">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <p className="eyebrow text-[var(--signal)]">02 — Selected work</p>
          <span className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
            {projectStatus === 'ready'
              ? `${String(projects.length).padStart(2, '0')} projects`
              : 'Index'}
          </span>
        </div>

        <div className="mt-10 border-t border-[var(--rule)]">
          {projectStatus === 'loading' && (
            <p className="py-8 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
              Loading index…
            </p>
          )}

          {projectStatus === 'error' && (
            <div className="flex flex-wrap items-center gap-4 py-8">
              <p className="text-sm text-[var(--ink-soft)]">
                The index did not load. The API may still be waking up.
              </p>
              <button
                type="button"
                onClick={retryProjects}
                className="border-b border-[var(--ink)] pb-0.5 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink)] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
              >
                Try again
              </button>
            </div>
          )}

          {projectStatus === 'ready' && projects.length === 0 && (
            <p className="py-8 text-sm text-[var(--ink-soft)]">No pinned projects yet.</p>
          )}

          {projectStatus === 'ready' &&
            projects.map((repo, index) => {
              const href = repo.liveLink || repo.homepage || repo.html_url;
              const Row = href ? 'a' : 'div';

              return (
                <Row
                  key={repo._id || repo.repoId || index}
                  href={href || undefined}
                  target={href ? '_blank' : undefined}
                  rel={href ? 'noreferrer' : undefined}
                  className="group -mx-2 grid grid-cols-12 items-start gap-x-4 gap-y-3 border-b border-[var(--rule)] px-2 py-7 transition-colors hover:bg-[var(--signal-soft)] md:-mx-3 md:px-3 md:py-9"
                >
                  <span className="col-span-2 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] md:col-span-1">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <div className="col-span-10 md:col-span-5">
                    <h3 className="font-display text-3xl capitalize leading-none text-[var(--ink)] transition-colors group-hover:text-[var(--signal)] md:text-4xl">
                      {(repo.name || 'Untitled project').replace(/-/g, ' ')}
                    </h3>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--ink-soft)]">
                      {repo.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="col-span-8 col-start-3 md:col-span-3 md:col-start-auto">
                    <p className="font-mono-ui text-[10px] uppercase leading-relaxed tracking-[0.14em] text-[var(--ink-soft)]">
                      {repo.techStack || 'Stack not listed'}
                    </p>
                    {repo.dateRange && (
                      <p className="mt-1 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                        {repo.dateRange}
                      </p>
                    )}
                  </div>

                  <div className="col-span-4 flex justify-end md:col-span-3">
                    <span className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] transition-colors group-hover:text-[var(--signal)]">
                      {href ? 'Visit ↗' : '—'}
                    </span>
                  </div>
                </Row>
              );
            })}
        </div>

        <div className="mt-8">
          <Link
            to="/projects"
            className="inline-flex items-center gap-3 border-b border-[var(--ink)] pb-1 text-sm font-medium transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
          >
            All projects <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {/* 03 — About */}
      <section className="border-b border-[var(--rule)] py-16 md:py-24">
        <div className="grid grid-cols-12 gap-x-8 gap-y-10">
          <div className="col-span-12 md:col-span-4">
            <p className="eyebrow text-[var(--signal)]">03 — About</p>
            <p className="mt-4 max-w-xs font-mono-ui text-[10px] uppercase leading-relaxed tracking-[0.14em] text-[var(--ink-soft)]">
              A short note on how I work and what I care about.
            </p>
          </div>

          <motion.div className="col-span-12 md:col-span-8" {...reveal()}>
            <p className="font-display text-[clamp(1.8rem,3.4vw,3rem)] leading-[1.12] text-[var(--ink)] first-letter:float-left first-letter:mr-3 first-letter:font-display first-letter:text-[3.6em] first-letter:leading-[0.78]">
              {aboutContent.description}
            </p>

            <div className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-2">
              <div>
                <p className="eyebrow text-[var(--ink-soft)]">Disciplines</p>
                <ul className="mt-4">
                  {homeContent.roles.map((role, index) => (
                    <li
                      key={role}
                      className="flex gap-4 border-b border-[var(--rule)] py-2.5 text-sm text-[var(--ink)]"
                    >
                      <span className="font-mono-ui text-[10px] text-[var(--signal)]">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span>{role}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="eyebrow text-[var(--ink-soft)]">Core stack</p>
                <p className="mt-4 font-mono-ui text-[11px] uppercase leading-8 tracking-[0.12em] text-[var(--ink-soft)]">
                  {previewSkills.join(' / ')}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 04 — Contact */}
      <section className="py-16 md:py-24">
        <div className="grid grid-cols-12 gap-x-8 gap-y-8">
          <div className="col-span-12 md:col-span-4">
            <p className="eyebrow text-[var(--signal)]">04 — Contact</p>
          </div>

          <motion.div className="col-span-12 md:col-span-8" {...reveal()}>
            <h2 className="font-display text-[clamp(2.6rem,6vw,5.4rem)] leading-[0.95] tracking-[-0.02em] text-[var(--ink)]">
              Have something
              <br />
              worth building?
            </h2>

            <p className="mt-6 max-w-md text-base leading-relaxed text-[var(--ink-soft)]">
              I take on a small number of projects at a time. Tell me what you are working on and
              what is getting in the way.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Link
                to="/contact"
                className="group inline-flex items-center gap-3 border-b border-[var(--ink)] pb-1 text-sm font-medium text-[var(--ink)] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
              >
                Write to me
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5"
                >
                  →
                </span>
              </Link>

              <Link
                to="/services"
                className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] transition-colors hover:text-[var(--signal)]"
              >
                Services
              </Link>
              <Link
                to="/payment"
                className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] transition-colors hover:text-[var(--signal)]"
              >
                Payment
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </article>
  );
};

export default Home;
