import { Fragment, useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { readCachedRoles, sanitizeRoles, writeCachedRoles } from '../lib/roleCache';

const DEFAULT_ROLES = [
  'Full-Stack Web Developer',
  'AI & ML Enthusiast',
  "Google Student Ambassador '26",
  'Microsoft Learn Student Ambassador',
  'DSA Problem Solver',
  'Open Source Contributor',
];

const DEFAULT_HERO_SUBTITLE =
  'I build high-performance, interactive web applications with modern frameworks, careful algorithms and scalable backends.';

const ROLE_HOLD_MS = 2000;
const ROLE_EXIT_MS = 280;

const RoleRotator = ({ roles, reduceMotion }) => {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(false);
  const count = roles.length;
  const activeIndex = count > 0 ? active % count : 0;

    useEffect(() => {
    const timer = setTimeout(() => {
      setStarted(true);
      setVisible(true);
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!started || reduceMotion || count < 2 || !visible) return undefined;
    const timer = setTimeout(() => setVisible(false), ROLE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [started, visible, count, reduceMotion]);

  useEffect(() => {
    if (!started || reduceMotion || count < 2 || visible) return undefined;
    const timer = setTimeout(() => {
      setActive((current) => (current + 1) % count);
      setVisible(true);
    }, ROLE_EXIT_MS);
    return () => clearTimeout(timer);
  }, [started, visible, count, reduceMotion]);

  if (count === 0) return null;
  if (reduceMotion || count === 1) return <>{roles.join(' · ')}</>;

  const renderRole = (role) => {
    let charIndex = 0;
    return role.split(' ').map((word, wordIndex) => {
      const chars = [...word].map((char) => {
        const index = charIndex++;
        return (
          <span
            className="role-char"
            style={{ '--i': String(index) }}
            key={`${wordIndex}-${index}`}
          >
            {char}
          </span>
        );
      });
      return (
        <Fragment key={wordIndex}>
          {wordIndex > 0 ? ' ' : null}
          <span className="role-word">{chars}</span>
        </Fragment>
      );
    });
  };

  return (
    <>
      <span className="sr-only">{roles.join(' · ')}</span>
      <span className="role-stack" aria-hidden="true">
        {roles.map((role, index) => (
          <span
            key={index}
            className={`role-stack-item ${visible && index === activeIndex ? 'is-on' : ''}`}
          >
            {renderRole(role)}
          </span>
        ))}
      </span>
    </>
  );
};

const Home = () => {
  const reduceMotion = useReducedMotion();

  const [projects, setProjects] = useState([]);
  const [projectStatus, setProjectStatus] = useState('loading');

  const [homeContent, setHomeContent] = useState(() => {
    const cachedRoles = readCachedRoles();
    return {
      heroSubtitle: DEFAULT_HERO_SUBTITLE,
      roles: cachedRoles,
      rolesLoaded: cachedRoles.length > 0,
    };
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
        const hasRoles = Array.isArray(data?.homeData?.roles);
        const roles = sanitizeRoles(data?.homeData?.roles);

        setHomeContent((prev) => ({
          ...prev,
          heroSubtitle:
            typeof data?.homeData?.heroSubtitle === 'string' && data.homeData.heroSubtitle.trim()
              ? data.homeData.heroSubtitle
              : prev.heroSubtitle,
          roles: hasRoles ? roles : prev.roles,
          rolesLoaded: true,
        }));

        if (hasRoles) writeCachedRoles(roles);

        if (data?.aboutData?.description) {
          setAboutContent({ description: data.aboutData.description });
        }
      })
      .catch((err) => {
        console.log('Content fetch error', err);
        setHomeContent((prev) => ({
          ...prev,
          roles: prev.roles.length > 0 ? prev.roles : DEFAULT_ROLES,
          rolesLoaded: true,
        }));
      });

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
          const skillNames = data.skills
            .map((skill) => (typeof skill === 'string' ? skill : skill?.name))
            .filter(Boolean);
          if (skillNames.length > 0) setPreviewSkills(skillNames.slice(0, 8));
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
      { }
      <section className="border-b border-[var(--rule)] pb-12 pt-8 md:pb-16 md:pt-12">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)]">
          <span className="normal-case tracking-[0.12em]">Portfolio — 2026</span>
          <span className="hidden md:inline">Full-stack / Interface / AI</span>
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 bg-[var(--signal)]" aria-hidden="true" />
            Open to select work
          </span>
        </div>

        <div className="mt-10 grid grid-cols-12 items-start gap-x-8 gap-y-12 md:mt-14">
          <motion.div className="col-span-12 lg:col-span-8" {...reveal()}>
            <p role="heading" aria-level={2} className="eyebrow normal-case tracking-[0.14em] text-[var(--signal)]">01 — Introduction</p>

            <h1 className="mt-5 font-display text-hero leading-[0.82] tracking-[-0.02em] text-[var(--ink)]">
              {'Shivam'}
              <br />
              {'Kumar'}<span className="text-[var(--signal)]">.</span>
            </h1>

            <p className="mt-8 min-h-[3.5rem] max-w-xl text-lg leading-relaxed text-[var(--ink-soft)]">
              {!homeContent.rolesLoaded ? (
                <span
                  aria-hidden="true"
                  className="mt-2 block h-5 w-2/3 max-w-sm animate-pulse rounded-sm bg-[var(--rule)]"
                />
              ) : homeContent.roles.length > 0 ? (
                <RoleRotator roles={homeContent.roles} reduceMotion={reduceMotion} />
              ) : (
                homeContent.heroSubtitle
              )}
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3">
              <Link
                to="/contact"
                className="group inline-flex items-center gap-3 bg-[var(--ink)] px-6 py-3.5 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--signal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal)]"
              >
                Start a project
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">↗</span>
              </Link>

              <Link
                to="/resume"
                className="inline-flex items-center gap-2 border border-[var(--ink)] px-5 py-3.5 font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink)] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal)]"
              >
                Read resume <span aria-hidden="true">↗</span>
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
              <figcaption className="mt-2 flex items-baseline justify-between font-mono-ui text-label uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                <span>Fig. 01 — Portrait</span>
                <span>2026</span>
              </figcaption>
            </motion.figure>

            <dl className="mt-8 border-t border-[var(--rule)] pt-5 text-sm">
              <div className="flex justify-between gap-6 border-b border-[var(--rule)] py-2.5">
                <dt className="font-mono-ui text-label uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                  Focus
                </dt>
                <dd className="text-right text-[var(--ink)]">Web platforms &amp; applied AI</dd>
              </div>
              <div className="flex justify-between gap-6 border-b border-[var(--rule)] py-2.5">
                <dt className="font-mono-ui text-label uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                  Stack
                </dt>
                <dd className="text-right text-[var(--ink)]">React · Node · Python</dd>
              </div>
              <div className="flex justify-between gap-6 py-2.5">
                <dt className="font-mono-ui text-label uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                  Status
                </dt>
                <dd className="text-right text-[var(--signal)]">Available</dd>
              </div>
            </dl>
          </aside>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--rule)] pt-4">
          <span className="eyebrow text-[var(--signal)]">Currently</span>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono-ui text-label tracking-[0.14em] text-[var(--ink-soft)]">
            {!homeContent.rolesLoaded ? (
              <li aria-hidden="true" className="flex items-center gap-5">
                <span className="inline-block h-2.5 w-40 animate-pulse bg-[var(--rule)]" />
              </li>
            ) : (
              homeContent.roles.map((role, index) => (
                <li key={`${role}-${index}`} className="flex items-center gap-5">
                  {index > 0 && <span aria-hidden="true" className="h-3 w-px bg-[var(--rule)]" />}
                  {role}
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      { }
      <section className="border-b border-[var(--rule)] py-16 md:py-24">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <p role="heading" aria-level={2} className="eyebrow normal-case tracking-[0.14em] text-[var(--signal)]">02 — Selected work</p>
          <span className="font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)]">
            {projectStatus === 'ready'
              ? `${String(projects.length).padStart(2, '0')} projects`
              : 'Index'}
          </span>
        </div>

        <div className="mt-10 border-t border-[var(--rule)]">
          {projectStatus === 'loading' && (
            <p className="py-8 font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)]">
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
                className="border-b border-[var(--ink)] pb-0.5 font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink)] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
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
              const hasStack = Boolean(repo.techStack || repo.dateRange);

              return (
                <Row
                  key={repo._id || repo.repoId || index}
                  href={href || undefined}
                  target={href ? '_blank' : undefined}
                  rel={href ? 'noreferrer' : undefined}
                  className="group -mx-2 grid grid-cols-12 items-start gap-x-4 gap-y-3 border-b border-[var(--rule)] px-2 py-7 transition-colors hover:bg-[var(--signal-soft)] md:-mx-3 md:px-3 md:py-9"
                >
                  <span className="col-span-2 font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)] md:col-span-1">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <div
                    className={`col-span-10 max-w-[52ch] ${hasStack ? 'md:col-span-6' : 'md:col-span-11'}`}
                  >
                    <h3 className="font-display text-heading capitalize leading-none text-[var(--ink)] transition-colors group-hover:text-[var(--signal)]">
                      {(repo.name || 'Untitled project').replace(/-/g, ' ')}
                    </h3>
                    {repo.description && (
                      <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--ink-soft)]">
                        {repo.description}
                      </p>
                    )}
                    {href && (
                      <span className="mt-3 inline-flex items-center gap-1.5 border-b border-[var(--rule)] pb-0.5 font-mono-ui text-label uppercase tracking-[0.14em] text-[var(--ink)] transition-colors group-hover:border-[var(--signal)] group-hover:text-[var(--signal)]">
                        Visit
                        <span aria-hidden="true">↗</span>
                      </span>
                    )}
                  </div>

                  {hasStack && (
                    <div className="col-span-8 col-start-3 md:col-span-5 md:col-start-auto">
                      {repo.techStack && (
                        <p className="font-mono-ui text-label uppercase leading-relaxed tracking-[0.14em] text-[var(--ink-soft)]">
                          {repo.techStack}
                        </p>
                      )}
                      {repo.dateRange && (
                        <p className="mt-1 font-mono-ui text-label uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                          {repo.dateRange}
                        </p>
                      )}
                    </div>
                  )}
                </Row>
              );
            })}
        </div>

        <div className="mt-8">
          <Link
            to="/projects"
            className="inline-flex items-center gap-3 border-b border-[var(--ink)] pb-1 text-sm font-medium transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
          >
            All projects <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      { }
      <section className="border-b border-[var(--rule)] py-16 md:py-24">
        <div className="grid grid-cols-12 gap-x-8 gap-y-10">
          <div className="col-span-12 md:col-span-4">
            <p role="heading" aria-level={2} className="eyebrow normal-case tracking-[0.14em] text-[var(--signal)]">03 — About</p>
            <p className="mt-4 max-w-xs font-mono-ui text-label leading-relaxed tracking-[0.08em] text-[var(--ink-soft)]">
              A short note on how I work and what I care about.
            </p>
          </div>

          <motion.div className="col-span-12 md:col-span-8" {...reveal()}>
            <p className="max-w-[46ch] text-pretty font-display text-[clamp(1.5rem,2.4vw,2.125rem)] leading-[1.25] text-[var(--ink)] first-letter:float-left first-letter:mr-3 first-letter:font-display first-letter:text-[2.6em] first-letter:leading-[0.8]">
              {aboutContent.description}
            </p>

            <div className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-x-12">
              <div>
                <p className="eyebrow pl-12 text-[var(--ink-soft)]">Disciplines</p>
                <ul className="mt-4">
                  {homeContent.roles.map((role, index) => (
                    <li
                      key={`${role}-${index}`}
                      className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 border-b border-[var(--rule)] py-2.5 text-sm text-[var(--ink)]"
                    >
                      <span className="font-mono-ui text-label text-[var(--signal)]">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span>{role}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="eyebrow text-[var(--ink-soft)]">Core stack</p>
                <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 font-mono-ui text-label uppercase leading-6 tracking-[0.12em] text-[var(--ink-soft)]">
                  {previewSkills.map((skill) => (
                    <li key={skill}>{skill}</li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      { }
      <section className="py-16 md:py-24">
        <div className="grid grid-cols-12 gap-x-8 gap-y-8">
          <div className="col-span-12 md:col-span-4">
            <p role="heading" aria-level={2} className="eyebrow normal-case tracking-[0.14em] text-[var(--signal)]">04 — Contact</p>
          </div>

          <motion.div className="col-span-12 md:col-span-8" {...reveal()}>
            <h2 className="font-display text-display leading-[0.95] tracking-[-0.02em] text-[var(--ink)]">
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
                >↗
                  
                </span>
              </Link>

              <Link
                to="/services"
                className="font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)] transition-colors hover:text-[var(--signal)]"
              >
                Services
              </Link>
              <Link
                to="/payment"
                className="font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)] transition-colors hover:text-[var(--signal)]"
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
