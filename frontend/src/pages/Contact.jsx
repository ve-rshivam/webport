import { useState, useEffect } from 'react';
import { apiGet, apiUrl } from '../lib/api';
import {
  ArrowLink,
  PageIntro,
  PageShell,
  buttonClass,
  inputClass,
  labelClass,
} from '../components/Editorial';

const SOCIALS = [
  { name: 'LinkedIn', url: 'https://linkedin.com/in/ve-rshivam' },
  { name: 'GitHub', url: 'https://github.com/ve-rshivam' },
  { name: 'Instagram', url: 'https://instagram.com/ve.rshivam' },
  { name: 'Email', url: 'mailto:getus.shivam@gmail.com' },
  { name: 'Twitter / X', url: 'https://x.com/ve8rshivam' },
];

const Contact = () => {
  const [result, setResult] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [contactLinks, setContactLinks] = useState([]);

  useEffect(() => {
    apiGet('/api/content')
      .then((data) => {
        if (Array.isArray(data?.contactData)) setContactLinks(data.contactData);
      })
      .catch((error) => console.log('Content fetch error', error));
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    setIsSending(true);
    setResult('Sending message…');

    const formData = new FormData(event.target);
    const data = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      message: formData.get('message'),
      type: 'contact',
    };

    try {
      const response = await fetch(apiUrl('/api/messages'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const payload = await response.json();

      if (payload.success) {
        setResult('Message sent. I will reply from my personal inbox.');
        event.target.reset();
      } else {
        setResult('The message could not be saved. Please try again.');
      }
    } catch (error) {
      console.error('Contact error:', error);
      setResult('The backend is offline right now. Please email instead.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <PageShell>
      <PageIntro
        index="04"
        label="Contact"
        title="Tell me what you are building."
        intro="A sentence about the project and the part that is getting in the way is enough to start. I reply personally."
      />

      <div className="grid grid-cols-12 gap-x-8 gap-y-12 py-12 md:py-16">
        <div className="col-span-12 md:col-span-7">
          <form onSubmit={onSubmit} className="border-t border-[var(--rule)]">
            <div className="grid grid-cols-1 gap-6 border-b border-[var(--rule)] py-6 sm:grid-cols-2">
              <div>
                <label htmlFor="contact-name" className={labelClass}>
                  Name
                </label>
                <input
                  id="contact-name"
                  type="text"
                  name="name"
                  required
                  autoComplete="name"
                  placeholder="Your name"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="contact-email" className={labelClass}>
                  Email
                </label>
                <input
                  id="contact-email"
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="you@domain.com"
                  className={inputClass}
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="contact-phone" className={labelClass}>
                  Phone <span className="normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  id="contact-phone"
                  type="tel"
                  name="phone"
                  autoComplete="tel"
                  placeholder="+91"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="border-b border-[var(--rule)] py-6">
              <label htmlFor="contact-message" className={labelClass}>
                Project
              </label>
              <textarea
                id="contact-message"
                name="message"
                required
                rows="6"
                placeholder="What are you building, and where are you stuck?"
                className={`${inputClass} resize-y`}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-6">
              <button type="submit" disabled={isSending} className={buttonClass}>
                {isSending ? 'Sending…' : 'Send message ↗'}
              </button>
              <p className="max-w-sm text-sm text-[var(--ink-soft)]" role="status">
                {result}
              </p>
            </div>
          </form>
        </div>

        <aside className="col-span-12 md:col-span-5 md:pl-8">
          <div className="border-t border-[var(--rule)] pt-6">
            <p className="eyebrow text-[var(--signal)]">Direct</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--ink-soft)]">
              Prefer email or a social message? Those work too. I keep the contact list short on
              purpose.
            </p>

            <ul className="mt-6">
              {SOCIALS.map((social) => (
                <li key={social.name} className="border-b border-[var(--rule)]">
                  <a
                    href={social.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-baseline justify-between py-3 text-sm text-[var(--ink)] transition-colors hover:text-[var(--signal)]"
                  >
                    {social.name}
                    <span aria-hidden="true" className="font-mono-ui text-[10px]">
                      ↗
                    </span>
                  </a>
                </li>
              ))}

              {contactLinks.map((link, index) => (
                <li key={`${link.title}-${index}`} className="border-b border-[var(--rule)]">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-baseline justify-between py-3 text-sm text-[var(--ink)] transition-colors hover:text-[var(--signal)]"
                  >
                    {link.title}
                    <span aria-hidden="true" className="font-mono-ui text-[10px]">
                      ↗
                    </span>
                  </a>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <ArrowLink to="/services">Services</ArrowLink>
              <ArrowLink to="/reviews">Reviews</ArrowLink>
            </div>
          </div>
        </aside>
      </div>
    </PageShell>
  );
};

export default Contact;
