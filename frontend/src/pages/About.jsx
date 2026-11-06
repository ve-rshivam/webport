import Education from '../components/Education';
import { ArrowLink, PageIntro, PageShell } from '../components/Editorial';

const SECTIONS = [
  {
    title: 'Code as a creative practice',
    body: 'I am Shivam Kumar, a B.Tech Computer Science and Engineering student at Gurukula Kangri Vishwavidyalaya. I treat computer science as a canvas: a place where algorithms, design and ideas meet to solve problems that actually matter.',
  },
  {
    title: 'Drawn to artificial intelligence',
    body: 'My focus is artificial intelligence and machine learning. I am building the foundations to train models and ship intelligent, scalable applications, and I care more about understanding how a system learns than about collecting frameworks.',
  },
  {
    title: 'Community, leadership and open source',
    body: 'I work alongside the wider developer community as a Google Student Ambassador and a Microsoft Learn Student Ambassador. I am also part of the Google Developer Club and the GitHub Developer Program, and I spend time contributing to open source and sharing what I learn.',
  },
  {
    title: 'What comes next',
    body: 'I keep experimenting, reading other people’s code and looking for the next hard problem. Whether I am architecting a model, representing a community or starting a side project, the goal stays the same: build technology that is useful and lasts.',
  },
];

const About = () => {
  return (
    <PageShell>
      <PageIntro
        index="02"
        label="About"
        title="Notes from a developer in progress."
        intro="A short version of who I am, what I study, and the kind of work I want to be doing."
      />

      <div className="grid grid-cols-12 gap-x-8 gap-y-12 border-b border-[var(--rule)] py-12 md:py-16">
        <aside className="col-span-12 md:col-span-4">
          <figure className="border border-[var(--rule)] bg-[var(--paper-2)] p-2">
            <img
              src="/profile.png"
              alt="Portrait of Shivam Kumar"
              className="aspect-[4/5] w-full object-cover grayscale"
            />
            <figcaption className="mt-2 flex items-baseline justify-between font-mono-ui text-label tracking-[0.14em] text-[var(--ink-soft)]">
              <span>Fig. 02 — Portrait</span>
              <span>2026</span>
            </figcaption>
          </figure>

          <dl className="mt-8 border-t border-[var(--rule)] pt-5 text-sm">
            <div className="flex justify-between gap-6 border-b border-[var(--rule)] py-2.5">
              <dt className="font-mono-ui text-label uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                Studying
              </dt>
              <dd className="text-right text-[var(--ink)]">B.Tech CSE</dd>
            </div>
            <div className="flex justify-between gap-6 border-b border-[var(--rule)] py-2.5">
              <dt className="font-mono-ui text-label uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                Focus
              </dt>
              <dd className="text-right text-[var(--ink)]">AI / ML, full-stack</dd>
            </div>
            <div className="flex justify-between gap-6 py-2.5">
              <dt className="font-mono-ui text-label uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                Based
              </dt>
              <dd className="text-right text-[var(--ink)]">Haridwar, India</dd>
            </div>
          </dl>
        </aside>

        <div className="col-span-12 md:col-span-8">
          <div className="max-w-2xl space-y-9">
            {SECTIONS.map((section) => (
              <section key={section.title} className="border-t border-[var(--rule)] pt-6">
                <h2 className="font-display text-heading leading-tight text-[var(--ink)]">
                  {section.title}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-[var(--ink-soft)]">
                  {section.body}
                </p>
              </section>
            ))}
          </div>
        </div>
      </div>

      <div className="border-b border-[var(--rule)] py-12 md:py-16">
        <Education />
      </div>

      <div className="flex flex-col gap-6 py-12 md:flex-row md:items-end md:justify-between md:py-16">
        <p className="max-w-xl font-display text-heading leading-tight text-[var(--ink)]">
          Want the longer version, or the version with code?
        </p>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <ArrowLink to="/resume">Read the resume</ArrowLink>
          <ArrowLink to="/contact" solid>Start a conversation</ArrowLink>
        </div>
      </div>
    </PageShell>
  );
};

export default About;
