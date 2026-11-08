import { useState } from 'react';
import { crmApi, crmSession } from './crmApi';
import { ErrorNote, Field, inputClass, labelClass, primaryClass } from './crmUi';

export default function CrmLogin({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await crmApi.login(email.trim(), password);
      const { token, refreshToken, actor } = response.data;
      crmSession.save(token, actor, refreshToken);
      onLogin(actor);
    } catch (err) {
      setError(err.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-[1440px] items-center px-6 py-12 md:px-10">
      <div className="grid w-full gap-10 md:grid-cols-12">
        <div className="md:col-span-6">
          <p className={labelClass}>Studio CRM</p>
          <h1 className="font-display text-5xl leading-[0.95] text-[var(--ink)] md:text-6xl">
            The studio’s
            <br />
            working record.
          </h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-[var(--ink-soft)]">
            Leads, projects, invoices and the payment ledger in one place. Access is restricted to
            studio accounts, and every session is bound to the device that signed in.
          </p>
          <p className="mt-6 max-w-md border-l border-[var(--signal)] pl-4 font-mono-ui text-[10px] uppercase leading-5 tracking-[0.14em] text-[var(--ink-soft)]">
            Separate from the client portal.
            <br />
            No client data is shared across accounts.
          </p>
        </div>

        <div className="md:col-span-5 md:col-start-8">
          <form onSubmit={submit} className="border border-[var(--rule)] bg-[var(--paper-2)] p-6 md:p-8">
            <h2 className="font-display text-3xl text-[var(--ink)]">Sign in</h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">Use your studio CRM credentials.</p>

            <div className="mt-6 space-y-4">
              <Field label="Email">
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClass}
                  placeholder="you@studio.com"
                  autoFocus
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={inputClass}
                  placeholder="10+ characters, letter, number, symbol"
                />
              </Field>
            </div>

            {error && (
              <div className="mt-4">
                <ErrorNote message={error} />
              </div>
            )}

            <button type="submit" disabled={busy} className={`${primaryClass} mt-6 w-full`}>
              {busy ? 'Signing in…' : 'Open CRM'}
            </button>

            <p className="mt-4 text-[11px] leading-5 text-[var(--ink-soft)]">
              This browser is registered as a device. A session copied to another browser will be
              rejected and revoked.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
