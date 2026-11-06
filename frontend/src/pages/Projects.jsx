import { useState, useEffect } from 'react';
import { ArrowLink, PageIntro, PageShell } from '../components/Editorial';

const GITHUB_USER = 've-rshivam';

const Projects = () => {
  const [repos, setRepos] = useState([]);
  const [status, setStatus] = useState('loading');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch(`https://api.github.com/users/${GITHUB_USER}/repos?sort=updated&per_page=100`)
      .then((response) => {
        if (!response.ok) throw new Error(`GitHub responded with ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        setRepos(Array.isArray(data) ? data : []);
        setStatus('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Error fetching projects:', error);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retry = () => {
    setStatus('loading');
    setReloadKey((key) => key + 1);
  };

  return (
    <PageShell>
      <PageIntro
        index="01"
        label="Work"
        title="The work archive."
        intro="Public repositories, synced from GitHub. The short, pinned selection lives on the home page."
      />

      <section className="py-12 md:py-16">
        {status === 'loading' && (
          <p className="font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)]">
            Reading GitHub…
          </p>
        )}

        {status === 'error' && (
          <div className="flex flex-wrap items-center gap-5">
            <p className="text-sm text-[var(--ink-soft)]">
              The archive could not load from GitHub. It may be rate-limited; try again in a moment.
            </p>
            <button
              type="button"
              onClick={retry}
              className="border-b border-[var(--ink)] pb-0.5 font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink)] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
            >
              Try again
            </button>
          </div>
        )}

        {status === 'ready' && repos.length === 0 && (
          <p className="text-sm text-[var(--ink-soft)]">No public repositories found.</p>
        )}

        {status === 'ready' && repos.length > 0 && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-3 pb-4">
              <p className="eyebrow text-[var(--ink-soft)]">All repositories</p>
              <span className="font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                {String(repos.length).padStart(2, '0')} repositories
              </span>
            </div>

            <ul className="border-t border-[var(--rule)]">
              {repos.map((repo, index) => (
                <li key={repo.id}>
                  <a
                    href={repo.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="group grid grid-cols-12 gap-x-4 gap-y-3 border-b border-[var(--rule)] py-7 transition-colors hover:bg-[var(--signal-soft)]"
                  >
                    <span className="col-span-2 font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)] md:col-span-1">
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    <div className="col-span-10 md:col-span-5">
                      <h2 className="font-display text-heading capitalize leading-none text-[var(--ink)] transition-colors group-hover:text-[var(--signal)]">
                        {(repo.name || 'Untitled').replace(/-/g, ' ')}
                      </h2>
                      {repo.description && (
                        <p className="mt-2 max-w-lg text-sm leading-relaxed text-[var(--ink-soft)]">
                          {repo.description}
                        </p>
                      )}
                    </div>

                    <div className="col-span-8 col-start-3 md:col-span-3 md:col-start-auto">
                      {repo.language && (
                        <p className="font-mono-ui text-label uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                          {repo.language}
                        </p>
                      )}
                      <p className="mt-1 font-mono-ui text-label uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                        {repo.stargazers_count || 0} stars
                      </p>
                    </div>

                    <div className="col-span-4 flex justify-end md:col-span-3">
                      <span className="font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)] transition-colors group-hover:text-[var(--signal)]">
                        Source
                      </span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-[var(--rule)] py-10">
        <ArrowLink href={`https://github.com/${GITHUB_USER}`} outline>GitHub profile</ArrowLink>
        <ArrowLink to="/contact" solid>Start a project</ArrowLink>
      </div>
    </PageShell>
  );
};

export default Projects;
