import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageWrapper from '../components/PageWrapper';
import './ClientPortal.css';

function ClientPortal() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [projectsList, setProjectsList] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState('');
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [loginData, setLoginData] = useState({ email: '', accessKey: '' });
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMsg, setOtpMsg] = useState('');
  const [otpError, setOtpError] = useState('');
  const [newKey, setNewKey] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [clientReply, setClientReply] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  const projectData = projectsList.find((p) => p._id === activeProjectId) || projectsList[0];

  useEffect(() => {
    const refreshProjectData = async () => {
      const savedEmail = localStorage.getItem('clientEmail');
      if (!isLoggedIn || !savedEmail) return;
      try {
        const res = await fetch('https://webport-5ru9.onrender.com/api/client/get-projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: savedEmail }),
        });
        const data = await res.json();
        if (data.success && data.projects && data.projects.length > 0) {
          setProjectsList(data.projects);
          localStorage.setItem('clientProjectsList', JSON.stringify(data.projects));

          if (!activeProjectId) {
            setActiveProjectId(data.projects[0]._id);
          }
        }
      } catch {
        console.log('Refresh failed, using cached data.');
      }
    };
    refreshProjectData();
  }, [isLoggedIn, activeProjectId]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('https://webport-5ru9.onrender.com/api/client/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData),
      });
      const data = await res.json();

      if (data.success) {
        if (!data.projects || data.projects.length === 0) {
          setError('Please contact the administrator. Your project data is missing.');
          setLoading(false);
          return;
        }
        localStorage.setItem('clientLoggedIn', 'true');
        localStorage.setItem('clientEmail', loginData.email);
        localStorage.setItem('clientProjectsList', JSON.stringify(data.projects));

        setProjectsList(data.projects);
        setActiveProjectId(data.projects[0]._id);
        setIsLoggedIn(true);
        setShowWelcomePopup(true);
      } else {
        setError(data.message || 'Invalid credentials. Ensure your payment is verified.');
      }
    } catch {
      setError('Server connection error. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('clientLoggedIn');
    localStorage.removeItem('clientEmail');
    localStorage.removeItem('clientProjectsList');
    setIsLoggedIn(false);
    setProjectsList([]);
    setActiveProjectId('');
    setIsLoggedIn(false);
    setShowWelcomePopup(false);
    setShowSettings(false);
    setShowPasswordModal(false);
    setError('');
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotLoading(true);
    setForgotMsg('');
    setForgotError('');
    setOtpCode('');
    setNewKey('');
    setOtpMsg('');
    setOtpError('');
    try {
      const res = await fetch('https://webport-5ru9.onrender.com/api/client/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (data.success) {
        setForgotMsg('If that email is on file, the reset code has been sent to your inbox. Check your spam folder if you do not see it.');
        if (data.otpProvided) {
          setOtpCode(String(data.otp).toString().slice(-6));
        }
        setOtpLoading(false);
        setOtpMsg('');
        setNewKey('');
        setOtpError('');
        setForgotLoading(false);
      } else {
        setForgotError(data.message || 'If that email is on file, the reset code has been sent to your inbox. Check your spam folder if you do not see it.');
      }
    } catch {
      setForgotError('Server connection error. Please try again later.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetWithOtp = async (e) => {
    e.preventDefault();
    if (!forgotEmail || !otpCode || !newKey) return;
    setOtpLoading(true);
    setOtpMsg('');
    setOtpError('');
    try {
      const res = await fetch('https://webport-5ru9.onrender.com/api/client/reset-password-with-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, otp: otpCode, newKey }),
      });
      const data = await res.json();
      if (data.success) {
        setOtpMsg('New access key saved. You can now sign in with it.');
        setOtpCode('');
        setNewKey('');
        setOtpLoading(false);
        setForgotMsg('');
        setForgotError('');
      } else {
        setOtpError(data.message || 'Could not set the new access key. Try again.');
      }
    } catch {
      setOtpError('Server connection error. Please try again later.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!clientReply.trim() || !projectData) return;

    setIsSendingReply(true);
    try {
      const res = await fetch('https://webport-5ru9.onrender.com/api/client/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: projectData.clientEmail,
          projectId: projectData._id,
          message: clientReply,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Your message has been sent to the developer!');
        setClientReply('');
      } else {
        alert('Failed to send message. Please try again.');
      }
    } catch {
      alert('Server error while sending message.');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handlePayRemaining = () => {
    if (!projectData) return;
    const gateUrl = 'https://webport-5ru9.onrender.com';
    const payUrl =
      gateUrl +
      '/api/payment/razorpay-order?serviceId=&amount=' +
      projectData.balanceDue +
      '&totalAmount=' +
      projectData.totalCost +
      '&projectId=' +
      projectData._id +
      '&isRemainingPayment=true';

    window.location.href = payUrl || 'https://webport-5ru9.onrender.com/portal';
  };

  const buttonClass =
    'inline-flex items-center justify-center rounded-lg border border-[var(--rule)] bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)] focus:ring-offset-2 focus:ring-offset-[var(--paper)]';

  const fieldClass =
    'w-full rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder-[var(--ink-soft)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--signal)] focus:border-transparent';

  const labelClass = 'block mt-1.5 text-sm font-medium text-[var(--ink)]';

  return (
    <PageWrapper>
      <div className="mx-auto min-h-screen max-w-6xl px-5 pb-16 sm:px-8">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-[var(--signal)]">Client portal</p>
            <h1 className="mt-2 font-display text-3xl leading-tight text-[var(--ink)]">
              {projectData?.clientName || 'Your project file.'}
            </h1>
            <p className="mt-1.5 max-w-md text-sm leading-6 text-[var(--ink-soft)]">
              {isLoggedIn
                ? 'Signed in to your project dashboard.'
                : 'Enter the email and access key sent to you after your payment was verified.'}
            </p>
          </div>
          {isLoggedIn && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className={buttonClass}
              >
                Settings
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-red-800/40 bg-red-950/20 px-4 py-2 text-sm font-medium text-red-900 transition-colors hover:bg-red-950/40"
              >
                Sign out
              </button>
            </div>
          )}
        </header>

        <AnimatePresence>
          {!isLoggedIn && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-[var(--rule)] bg-[var(--paper)] p-6 md:p-10"
            >
              <form onSubmit={handleLogin} className="flex flex-col gap-5">
                <div>
                  <label className={labelClass}>Email</label>
                  <input
                    type="email"
                    required
                    className={fieldClass}
                    placeholder="you@example.com"
                    value={loginData.email}
                    onChange={(e) =>
                      setLoginData({ ...loginData, email: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Access key</label>
                  <input
                    type="password"
                    required
                    className={fieldClass}
                    placeholder="Your access key"
                    value={loginData.accessKey}
                    onChange={(e) =>
                      setLoginData({ ...loginData, accessKey: e.target.value })
                    }
                  />
                </div>
                {error && (
                  <p className="rounded-lg border border-red-800/30 bg-red-950/20 px-4 py-3 text-sm text-red-900">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className={`${buttonClass} w-full`}
                >
                  {loading ? 'Signing in…' : 'Sign in to portal'}
                </button>

                <p className="flex justify-center">
                  <span className="text-sm text-[var(--ink-soft)]">or</span>
                </p>

                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="justify-center text-sm text-[var(--signal)] underline underline-offset-2 hover:opacity-80"
                >
                  Forgot your access key?
                </button>

                <AnimatePresence>
                  {showForgot && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-[var(--rule)] pt-6">
                        <p className="text-sm font-medium text-[var(--ink)]">
                          Request a reset code
                        </p>
                        <p className="mt-1 text-xs text-[var(--ink-soft)]">
                          Enter the email on file. If that email is registered, a verification
                          code will be sent to it.
                        </p>

                        {!forgotMsg && !otpMsg && (
                          <div className="mt-4">
                            <div className="relative">
                              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                <svg
                                  className="h-4 w-4 text-[var(--ink-soft)]"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                                  />
                                </svg>
                              </span>
                              <input
                                type="email"
                                required
                                className={`${fieldClass} pl-10`}
                                placeholder="Email on file"
                                value={forgotEmail}
                                onChange={(e) => setForgotEmail(e.target.value)}
                              />
                            </div>
                            <div className="mt-4 flex gap-3">
                              <button
                                type="button"
                                onClick={handleForgotPassword}
                                disabled={forgotLoading || !forgotEmail}
                                className={`${buttonClass} flex-1`}
                              >
                                {forgotLoading ? 'Sending…' : 'Send verification code'}
                              </button>
                              {forgotMsg && (
                                <p className="flex-1 text-sm text-green-700">{forgotMsg}</p>
                              )}
                              {forgotError && (
                                <p className="flex-1 text-sm text-red-700">{forgotError}</p>
                              )}
                            </div>
                          </div>
                        )}

                        {forgotMsg && !otpMsg && (
                          <div className="mt-4 border-t border-[var(--rule)] pt-5">
                            <p className="text-sm font-medium text-[var(--ink)]">
                              Enter the code sent to {forgotEmail}
                            </p>
                            <p className="mt-1 text-xs text-[var(--ink-soft)]">
                              Check your inbox for a 6-digit code. It is valid for 10 minutes.
                            </p>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                              <label className="block">
                                <span className={labelClass}>Verification code</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={6}
                                  required
                                  className={fieldClass}
                                  placeholder="000000"
                                  value={otpCode}
                                  onChange={(e) =>
                                    setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                                  }
                                />
                              </label>
                              <label className="block">
                                <span className={labelClass}>New access key</span>
                                <input
                                  type="password"
                                  required
                                  minLength={6}
                                  className={fieldClass}
                                  placeholder="At least 6 characters"
                                  value={newKey}
                                  onChange={(e) => setNewKey(e.target.value)}
                                />
                              </label>
                            </div>
                            <div className="mt-4 flex gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setForgotMsg('');
                                  setOtpMsg('');
                                  setForgotEmail('');
                                  setForgotError('');
                                  setOtpError('');
                                  setOtpCode('');
                                  setNewKey('');
                                }}
                                className={`${buttonClass} flex-1`}
                              >
                                Back
                              </button>
                              <button
                                type="button"
                                onClick={handleResetWithOtp}
                                disabled={otpLoading || otpCode.length !== 6 || newKey.length < 6}
                                className={`${buttonClass} flex-1`}
                              >
                                {otpLoading ? 'Saving…' : 'Save new access key'}
                              </button>
                            </div>
                            {otpMsg && (
                              <p className="mt-3 text-sm text-green-700">{otpMsg}</p>
                            )}
                            {otpError && (
                              <p className="mt-3 text-sm text-red-700">{otpError}</p>
                            )}
                          </div>
                        )}

                        {otpMsg && (
                          <div className="mt-4 border-t border-[var(--rule)] pt-5">
                            <p className="text-sm text-green-700">{otpMsg}</p>
                            <button
                              type="button"
                              onClick={() => {
                                setShowForgot(false);
                                setForgotMsg('');
                                setOtpMsg('');
                                setForgotEmail('');
                                setForgotError('');
                                setOtpError('');
                                setOtpCode('');
                                setNewKey('');
                              }}
                              className={`${buttonClass} mt-4 w-full`}
                            >
                              Back to sign in
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <p className="flex justify-center text-xs text-[var(--ink-soft)]">
                  Need help?
                  <a
                    href="/contact"
                    className="ml-1 text-[var(--signal)] underline underline-offset-2 hover:opacity-80"
                  >
                    Contact us
                  </a>
                  .
                </p>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {isLoggedIn && projectData && (
          <AnimatePresence>
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-x-8">
                <div className="col-span-12 md:col-span-7">
                  <p className="eyebrow text-[var(--ink-soft)]">Project overview</p>
                  <h2 className="mt-2 font-display text-3xl leading-tight text-[var(--ink)]">
                    {projectData.projectTitle || 'Untitled project'}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--ink-soft)]">
                    Client: {projectData.clientName} ({projectData.clientEmail})
                  </p>
                </div>
                <div className="col-span-12 md:col-span-5">
                  <p className="eyebrow text-[var(--ink-soft)]">Status</p>
                  <div className="mt-2 rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-5">
                    <dl className="grid grid-cols-2 gap-y-4 gap-x-4 text-sm">
                      <div>
                        <dt className="text-[var(--ink-soft)]">Progress</dt>
                        <dd className="mt-1 font-medium text-[var(--ink)]">
                          {projectData.progress || 0}%
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--ink-soft)]">Payment</dt>
                        <dd className="mt-1 font-medium text-[var(--ink)]">
                          {projectData.paymentStatus || 'Not set'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--ink-soft)]">Total cost</dt>
                        <dd className="mt-1 font-medium text-[var(--ink)]">
                          ${projectData.totalCost || 0}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--ink-soft)]">Paid</dt>
                        <dd className="mt-1 font-medium text-[var(--ink)]">
                          ${projectData.amountPaid || 0}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--ink-soft)]">Balance due</dt>
                        <dd className="mt-1 font-medium text-[var(--ink)]">
                          ${projectData.balanceDue || 0}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--ink-soft)]">Delivery</dt>
                        <dd className="mt-1 font-medium text-[var(--ink)]">
                          {projectData.deliveryDate || 'To be agreed'}
                        </dd>
                      </div>
                    </dl>
                    {projectData.balanceDue > 0 && (
                      <div className="mt-5 border-t border-[var(--rule)] pt-4">
                        <p className="text-sm text-[var(--ink-soft)]">
                          A remaining balance is still due to continue the project.
                        </p>
                        <button
                          type="button"
                          onClick={handlePayRemaining}
                          className={`${buttonClass} mt-4`}
                        >
                          Pay remaining balance →
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-x-8">
                <div className="col-span-12 md:col-span-7">
                  <p className="eyebrow text-[var(--ink-soft)]">Live progress</p>
                  <div className="mt-4 rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-6">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--paper-2)]">
                      <div
                        className="h-full rounded-full bg-[var(--signal)] transition-all duration-500 ease-out"
                        style={{ width: `${projectData.progress || 0}%` }}
                      />
                    </div>
                    <p className="mt-3 text-sm text-[var(--ink-soft)]">
                      Current progress: {projectData.progress || 0}%
                    </p>
                    {projectData.notes && (
                      <div className="mt-4 border-t border-[var(--rule)] pt-4">
                        <p className="eyebrow text-[var(--ink-soft)]">Latest note</p>
                        <p className="mt-2 max-w-2xl whitespace-pre-wrap text-base leading-7 text-[var(--ink)]">
                          {projectData.notes}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="col-span-12 md:col-span-5">
                  <p className="eyebrow text-[var(--ink-soft)]">Payments</p>
                  <div className="mt-4 rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-5">
                    <p className="text-sm text-[var(--ink-soft)]">
                      Payment history for this project.
                    </p>
                    <ul className="mt-4 space-y-3">
                      <li className="rounded-lg border border-[var(--rule)] bg-[var(--paper-2)] p-4">
                        <dl className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <dt className="text-[var(--ink-soft)]">Amount paid</dt>
                            <dd className="font-medium text-[var(--ink)]">
                              ${projectData.amountPaid || 0}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[var(--ink-soft)]">Balance</dt>
                            <dd className="font-medium text-[var(--ink)]">
                              ${projectData.balanceDue || 0}
                            </dd>
                          </div>
                        </dl>
                      </li>
                    </ul>
                    <button
                      type="button"
                      onClick={handlePayRemaining}
                      className={`${buttonClass} mt-4 w-full`}
                    >
                      Pay remaining balance
                    </button>
                  </div>
                </div>
              </div>

              <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-x-8">
                <div className="col-span-12 md:col-span-7">
                  <p className="eyebrow text-[var(--ink-soft)]">Delivery</p>
                  <div className="mt-4 rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-6">
                    <p className="text-sm text-[var(--ink-soft)]">
                      The agreed hand-over date for this project.
                    </p>
                    <p className="mt-3 font-display text-2xl text-[var(--ink)]">
                      {projectData.deliveryDate || 'To be agreed'}
                    </p>
                    <p className="mt-2 text-sm text-[var(--ink-soft)]">
                      Dates are estimates and move with feedback and scope. Any change is
                      posted in the note below.
                    </p>
                  </div>
                </div>
                <div className="col-span-12 md:col-span-5">
                  <p className="eyebrow text-[var(--ink-soft)]">Inside the portal</p>
                  <ul className="mt-5 border-t border-[var(--rule)] text-sm">
                    {[
                      ['01', 'Live progress', 'Where the build stands right now.'],
                      ['02', 'Payments', 'What is settled and what remains due.'],
                      ['03', 'Delivery', 'The agreed hand-over date.'],
                      ['04', 'Messages', 'A direct line to the developer.'],
                    ].map(([index, title, description]) => (
                      <li
                        key={index}
                        className="flex gap-5 border-b border-[var(--rule)] py-4"
                      >
                        <span className="font-mono-ui text-[10px] tracking-[0.14em] text-[var(--signal)]">
                          {index}
                        </span>
                        <div>
                          <p className="text-[var(--ink)]">{title}</p>
                          <p className="mt-0.5 text-[var(--ink-soft)]">{description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <section className="pb-10">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="eyebrow text-[var(--signal)]">Messages</p>
                  <p className="eyebrow text-[var(--ink-soft)]">From the developer</p>
                </div>

                <p className="mt-4 max-w-3xl whitespace-pre-wrap text-lg leading-8 text-[var(--ink)]">
                  {projectData.notes ||
                    'No new updates right now. Working on your project!'}
                </p>

                <form
                  onSubmit={handleSendReply}
                  className="mt-8 max-w-2xl border-t border-[var(--rule)] pt-6"
                >
                  <label className="block">
                    <span className={labelClass}>Message the developer</span>
                    <textarea
                      rows="4"
                      placeholder="Feedback, a question, or a change request…"
                      value={clientReply}
                      onChange={(e) => setClientReply(e.target.value)}
                      className={`${fieldClass} resize-y`}
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={isSendingReply}
                    className={`${buttonClass} mt-4`}
                  >
                    {isSendingReply ? 'Sending…' : 'Send message →'}
                  </button>
                </form>
              </section>
            </motion.div>
          </AnimatePresence>
        )}

        <AnimatePresence>
          {showWelcomePopup && isLoggedIn && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,8,6,0.7)] px-4"
              onClick={() => setShowWelcomePopup(false)}
            >
              <motion.div
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 12, opacity: 0 }}
                className="relative w-full max-w-lg border border-[var(--rule)] bg-[var(--paper)] p-6 md:p-8"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setShowWelcomePopup(false)}
                  aria-label="Close"
                  className="absolute right-4 top-4 font-mono-ui text-lg text-[var(--ink-soft)] transition-colors hover:text-[var(--signal)]"
                >
                  ×
                </button>
                <p className="eyebrow text-[var(--signal)]">Session opened</p>
                <h2 className="mt-2 font-display text-2xl leading-tight text-[var(--ink)]">
                  Welcome back, {projectData?.clientName || 'there'}.
                </h2>
                <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
                  You have{' '}
                  <strong className="font-medium text-[var(--ink)]">
                    {projectsList.length}
                  </strong>{' '}
                  active project(s) on file. The latest update is below.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowWelcomePopup(false);
                      setShowSettings(false);
                    }}
                    className={buttonClass}
                  >
                    Open dashboard
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowWelcomePopup(false);
                      setShowSettings(true);
                    }}
                    className={buttonClass}
                  >
                    Settings
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showSettings && isLoggedIn && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,8,6,0.7)] px-4"
              onClick={() => setShowSettings(false)}
            >
              <motion.div
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 12, opacity: 0 }}
                className="relative w-full max-w-md border border-[var(--rule)] bg-[var(--paper)] p-7 md:p-9"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  aria-label="Close"
                  className="absolute right-4 top-4 font-mono-ui text-lg text-[var(--ink-soft)] transition-colors hover:text-[var(--signal)]"
                >
                  ×
                </button>
                <p className="eyebrow text-[var(--ink-soft)]">Account</p>
                <h2 className="mt-3 font-display text-3xl leading-tight text-[var(--ink)]">
                  Settings
                </h2>
                <div className="mt-6 space-y-4">
                  <div className="rounded-lg border border-[var(--rule)] bg-[var(--paper-2)] p-4">
                    <p className="text-sm font-medium text-[var(--ink)]">
                      Email on file
                    </p>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      {projectData?.clientEmail || 'Not set'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--rule)] bg-[var(--paper-2)] p-4">
                    <p className="text-sm font-medium text-[var(--ink)]">
                      Access key
                    </p>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      This key signs you in to the portal.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSettings(false);
                        setShowPasswordModal(true);
                      }}
                      className={buttonClass}
                    >
                      Change access key
                    </button>
                  </div>
                  <div className="rounded-lg border border-[var(--rule)] bg-[var(--paper-2)] p-4">
                    <p className="text-sm font-medium text-[var(--ink)]">Sign out</p>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      Sign out of the portal on this device.
                    </p>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="rounded-lg border border-red-800/40 bg-red-950/20 px-4 py-2 text-sm font-medium text-red-900 transition-colors hover:bg-red-950/40"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPasswordModal && isLoggedIn && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(20,18,16,0.7)] px-4"
              onClick={() => setShowPasswordModal(false)}
            >
              <motion.div
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 12, opacity: 0 }}
                className="relative w-full max-w-md border border-[var(--rule)] bg-[var(--paper)] p-7 md:p-9"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  aria-label="Close"
                  className="absolute right-4 top-4 font-mono-ui text-lg text-[var(--ink-soft)] transition-colors hover:text-[var(--signal)]"
                >
                  ×
                </button>
                <p className="eyebrow text-[var(--ink-soft)]">Account</p>
                <h2 className="mt-3 font-display text-3xl leading-tight text-[var(--ink)]">
                  Change access key.
                </h2>
                <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
                  Update the key used to sign in to this portal.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const oldK = e.target.oldKey.value;
                    const newK = e.target.newKey.value;
                    try {
                      const res = await fetch(
                        'https://webport-5ru9.onrender.com/api/client/change-password',
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            email: projectData.clientEmail,
                            oldKey: oldK,
                            newKey: newK,
                          }),
                        }
                      );
                      const data = await res.json();
                      if (data.success) {
                        alert('Access key updated successfully.');
                        setShowPasswordModal(false);
                      } else {
                        alert(data.message);
                      }
                    } catch {
                      alert('Server error');
                    }
                  }}
                  className="mt-6 flex flex-col gap-4"
                >
                  <label className="block">
                    <span className={labelClass}>Current key</span>
                    <input
                      type="password"
                      name="oldKey"
                      placeholder="Current password"
                      required
                      className={fieldClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>New key</span>
                    <input
                      type="password"
                      name="newKey"
                      placeholder="New password"
                      required
                      className={fieldClass}
                    />
                  </label>
                  <button type="submit" className={`${buttonClass} w-full`}>
                    Update access key
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageWrapper>
  );
}

export default ClientPortal;
