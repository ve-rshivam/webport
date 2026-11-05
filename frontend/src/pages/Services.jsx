import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { ArrowLink, PageIntro, PageShell, buttonClass } from '../components/Editorial';

const FALLBACK_SERVICES = [
  {
    id: 1,
    title: 'Frontend Development',
    description:
      'Modern, responsive interfaces with React, Tailwind CSS and Framer Motion.',
    price: '',
  },
  {
    id: 2,
    title: 'Backend Development',
    description:
      'Secure REST APIs, database architecture and server-side logic with Node, Express and MongoDB.',
    price: '',
  },
  {
    id: 3,
    title: 'Full-Stack Web App',
    description:
      'End-to-end product development from interface to database and deployment.',
    price: '',
  },
  {
    id: 4,
    title: '3D Web Experiences',
    description:
      'Interactive canvas and 3D interfaces built with Three.js and React Three Fiber.',
    price: '',
  },
  {
    id: 5,
    title: 'Bug Fixing & Refactoring',
    description:
      'Performance work, code cleanup and untangling problems in existing React or Node codebases.',
    price: '',
  },
  {
    id: 6,
    title: 'API Integration',
    description:
      'Connecting third-party services such as Stripe, PayPal, Firebase, OpenAI or a custom API.',
    price: '',
  },
];

const PROCESS = [
  {
    title: 'Upfront deposit',
    body: 'A 40–50% deposit locks the timeline and covers initial research and setup.',
  },
  {
    title: 'Milestones',
    body: 'Larger projects are split into reviewable milestones, for example UI approval and backend setup.',
  },
  {
    title: 'Final handover',
    body: 'The balance is settled on approval, before source code and deployment credentials change hands.',
  },
];

const mergeServices = (serverServices) => {
  const byTitle = new Map();

  [...FALLBACK_SERVICES, ...serverServices].forEach((service) => {
    if (!service?.title) return;

    const key = service.title.toLowerCase();
    const existing = byTitle.get(key) || {};

    byTitle.set(key, {
      ...existing,
      ...service,
      description: service.description || existing.description,
      price: service.price || existing.price,
    });
  });

  return Array.from(byTitle.values());
};

const servicePriceLabel = (price) => {
  const amount = Number(String(price ?? '').replace(/[^0-9.]/g, ''));
  if (Number.isFinite(amount) && amount > 0) {
    return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
  return price || 'Quote on request';
};

const Services = () => {
  const [services, setServices] = useState([]);
  const [status, setStatus] = useState('loading');
  const navigate = useNavigate();

  useEffect(() => {
    apiGet('/api/services')
      .then((data) => {
        setServices(mergeServices(Array.isArray(data) ? data : []));
        setStatus('ready');
      })
      .catch((error) => {
        console.error('Backend fetch error:', error);
        setServices(FALLBACK_SERVICES);
        setStatus('ready');
      });
  }, []);

  return (
    <PageShell>
      <PageIntro
        index="03"
        label="Services"
        title="Work I take on."
        intro="Small, focused engagements and full builds. Pick a starting point or send me the shape of the problem."
      />

      <section className="py-12 md:py-16">
        {status === 'loading' && (
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
            Loading services…
          </p>
        )}

        {status === 'ready' && (
          <ul className="border-t border-[var(--rule)]">
            {services.map((service, index) => (
              <li key={service._id || service.id || index}>
                <button
                  type="button"
                  onClick={() => navigate('/payment', { state: { preSelectedService: service.title } })}
                  className="group -mx-2 grid w-full grid-cols-12 gap-x-4 gap-y-3 border-b border-[var(--rule)] px-2 py-7 text-left transition-colors hover:bg-[var(--signal-soft)] md:-mx-3 md:px-3 md:py-8"
                >
                  <span className="col-span-2 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] md:col-span-1">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <div className="col-span-10 md:col-span-4">
                    <h2 className="font-display text-2xl leading-none text-[var(--ink)] transition-colors group-hover:text-[var(--signal)] md:text-3xl">
                      {service.title}
                    </h2>
                  </div>

                  <p className="col-span-10 col-start-3 max-w-xl text-sm leading-relaxed text-[var(--ink-soft)] md:col-span-5 md:col-start-auto">
                    {service.description}
                  </p>

                  <div className="col-span-10 col-start-3 flex items-center justify-between gap-4 md:col-span-2 md:col-start-auto md:justify-end">
                    <span className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                      {servicePriceLabel(service.price)}
                    </span>
                    <span className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] transition-colors group-hover:text-[var(--signal)]">
                      Select
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-[var(--rule)] py-12 md:py-16">
        <div className="grid grid-cols-12 gap-x-8 gap-y-8">
          <div className="col-span-12 md:col-span-4">
            <p className="eyebrow text-[var(--signal)]">Payment process</p>
            <h2 className="mt-4 font-display text-3xl leading-tight text-[var(--ink)] md:text-4xl">
              Simple milestones, no surprises.
            </h2>
          </div>

          <div className="col-span-12 md:col-span-8">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
              {PROCESS.map((step, index) => (
                <div key={step.title} className="border-t border-[var(--rule)] pt-4">
                  <span className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--signal)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-2 font-display text-2xl leading-tight text-[var(--ink)]">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{step.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap items-end justify-between gap-6 border-t border-[var(--rule)] pt-6">
              <div>
                <p className="eyebrow text-[var(--ink-soft)]">Accepted methods</p>
                <p className="mt-2 text-sm text-[var(--ink-soft)]">
                  PayPal · Bank transfer / UPI · Crypto (USDT)
                </p>
              </div>
              <button type="button" onClick={() => navigate('/contact')} className={buttonClass}>
                Discuss a project
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-[var(--rule)] py-10">
        <ArrowLink to="/payment">Make a payment</ArrowLink>
        <ArrowLink to="/projects">See the work</ArrowLink>
      </div>
    </PageShell>
  );
};

export default Services;
