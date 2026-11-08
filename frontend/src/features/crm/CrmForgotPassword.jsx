import { useState } from 'react';
import { Link } from 'react-router-dom';
import { crmApi } from './crmApi';
import { ErrorNote, Field, inputClass, labelClass, primaryClass } from './crmUi';

export default function CrmForgotPassword() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  async function requestOtp(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await crmApi.forgotPassword(email.trim());
      setStep(2);
    } catch (err) {
      setError(err.message || 'Failed to request reset code.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await crmApi.resetPassword(email.trim(), otp.trim(), newPassword);
      setSuccessMsg('Password updated successfully. You can now sign in.');
      setStep(3);
    } catch (err) {
      setError(err.message || 'Failed to reset password.');
    } finally {
      setBusy(false);
    }
  }

  if (step === 3) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-12">
        <p className={labelClass}>Studio CRM</p>
        <h2 className="mt-2 font-display text-3xl text-[var(--ink)]">Password updated</h2>
        <p className="mt-4 border border-[var(--rule)] bg-[var(--paper-2)] p-4 text-sm text-[var(--ink)]">
          {successMsg}
        </p>
        <Link to="/admin/crm" className={`${primaryClass} mt-6 block w-full text-center`}>
          Return to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-[1440px] items-center px-6 py-12 md:px-10">
      <div className="grid w-full gap-10 md:grid-cols-12">
        <div className="md:col-span-6">
          <p className={labelClass}>Account Recovery</p>
          <h1 className="font-display text-5xl leading-[0.95] text-[var(--ink)] md:text-6xl">
            Reset your
            <br />
            CRM access.
          </h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-[var(--ink-soft)]">
            A 6-digit recovery code will be sent to your studio email address. Codes expire after 10
            minutes, and resetting your password revokes all existing active sessions.
          </p>
        </div>

        <div className="md:col-span-5 md:col-start-8">
          {step === 1 ? (
            <form onSubmit={requestOtp} className="border border-[var(--rule)] bg-[var(--paper-2)] p-6 md:p-8">
              <h2 className="font-display text-3xl text-[var(--ink)]">Request code</h2>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">Enter your studio CRM email.</p>

              <div className="mt-6 space-y-4">
                <Field label="Email">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={inputClass}
                    placeholder="you@studio.com"
                    autoFocus
                  />
                </Field>
              </div>

              {error && (
                <div className="mt-4">
                  <ErrorNote message={error} />
                </div>
              )}

              <button type="submit" disabled={busy} className={`${primaryClass} mt-6 w-full`}>
                {busy ? 'Sending code…' : 'Send reset code'}
              </button>

              <Link
                to="/admin/crm"
                className="mt-4 block text-center font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)] hover:text-[var(--ink)]"
              >
                ← Back to sign in
              </Link>
            </form>
          ) : (
            <form onSubmit={handleReset} className="border border-[var(--rule)] bg-[var(--paper-2)] p-6 md:p-8">
              <h2 className="font-display text-3xl text-[var(--ink)]">Enter code</h2>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">
                Enter the 6-digit code sent to <span className="text-[var(--ink)]">{email}</span>.
              </p>

              <div className="mt-6 space-y-4">
                <Field label="6-Digit OTP">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(event) => setOtp(event.target.value)}
                    className={`${inputClass} font-mono tracking-widest`}
                    placeholder="123456"
                    autoFocus
                  />
                </Field>
                <Field label="New Password">
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className={inputClass}
                    placeholder="At least 8 characters"
                  />
                </Field>
              </div>

              {error && (
                <div className="mt-4">
                  <ErrorNote message={error} />
                </div>
              )}

              <button type="submit" disabled={busy} className={`${primaryClass} mt-6 w-full`}>
                {busy ? 'Updating password…' : 'Reset password'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError('');
                }}
                className="mt-4 block w-full text-center font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)] hover:text-[var(--ink)]"
              >
                ← Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}