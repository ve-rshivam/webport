import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { PageShell, buttonClass, labelClass } from '../components/Editorial';

const ClientPortal = () => {
  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('clientLoggedIn') === 'true';
  });
  const [loginData, setLoginData] = useState({ email: '', accessKey: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [projectsList, setProjectsList] = useState(() => {
    const saved = localStorage.getItem('clientProjectsList');
    return saved ? JSON.parse(saved) : [];
  });

  const [activeProjectId, setActiveProjectId] = useState(null);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotError, setForgotError] = useState('');

  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  const [isTempKey, setIsTempKey] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

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

        setIsTempKey(data.projects[0].isTemporaryKey || false);
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
    setActiveProjectId(null);
    setLoginData({ email: '', accessKey: '' });
    setShowWelcomePopup(false);
    setShowSettings(false);
    setShowPasswordModal(false);
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMsg('');
    setForgotError('');
    try {
      const res = await fetch('https://webport-5ru9.onrender.com/api/client/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (data.success) {
        setForgotMsg('The new password has been sent successfully. Please check your inbox.');
        setForgotEmail('');
      } else {
        setForgotError(
          data.message || 'The new password has been sent successfully. Please check your inbox.'
        );
      }
    } catch {
      setForgotError('Server connection error. Please try again later.');
    } finally {
      setForgotLoading(false);
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

    navigate('/payment', {
      state: {
        isRemainingPayment: true,
        projectId: projectData._id,
        service: projectData.projectTitle,
        clientName: projectData.clientName,
        clientEmail: projectData.clientEmail,
        remainingAmount: projectData.balanceDue,
        originalTotal: projectData.totalCost,
      },
    });
  };

  const fieldClass =
    'w-full border border-[var(--rule)] bg-transparent px-3 py-3 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-soft)] focus:border-[var(--signal)]';

  return (
    <PageShell>
      <header className="border-b border-[var(--rule)] pb-8 pt-8 md:pb-10 md:pt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="eyebrow text-[var(--signal)]">Client portal</p>
          <p className="eyebrow text-[var(--ink-soft)]">
            {isLoggedIn ? 'Private record' : 'Access by invitation'}
          </p>
        </div>

        <h1 className="mt-5 max-w-4xl font-display text-[clamp(2.8rem,7vw,5.5rem)] leading-[0.92] tracking-[-0.02em] text-[var(--ink)]">
          {isLoggedIn ? 'Your project file.' : 'Client access.'}
        </h1>

        <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--ink-soft)]">
          {isLoggedIn
            ? 'Progress, payment status and the latest note from the desk — all in one place.'
            : 'Enter the email and access key sent to you after your payment was verified.'}
        </p>
      </header>

      <AnimatePresence>
        {showWelcomePopup && projectData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex items-center justify-center bg-[rgba(20,18,16,0.7)] px-4"
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              className="w-full max-w-md border border-[var(--rule)] bg-[var(--paper)] p-7 md:p-9"
            >
              <p className={`eyebrow ${isTempKey ? 'text-[var(--signal)]' : 'text-[var(--ink-soft)]'}`}>
                {isTempKey ? 'Security notice' : 'Session opened'}
              </p>

              <h2 className="mt-3 font-display text-3xl leading-tight text-[var(--ink)]">
                {isTempKey ? 'Please change your password.' : `Welcome back, ${projectData.clientName}.`}
              </h2>

              {isTempKey ? (
                <p className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">
                  You are signed in with a <strong className="font-medium text-[var(--ink)]">temporary access key</strong>.
                  For security, change it from the settings menu before continuing.
                </p>
              ) : (
                <p className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">
                  You have{' '}
                  <strong className="font-medium text-[var(--ink)]">{projectsList.length}</strong>{' '}
                  active project(s) on file. The latest update is below.
                </p>
              )}

              <div className="mt-7 flex flex-wrap gap-3">
                {isTempKey ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowWelcomePopup(false);
                      setShowSettings(true);
                    }}
                    className={buttonClass}
                  >
                    Change access key
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowWelcomePopup(false)}
                    className={buttonClass}
                  >
                    Open dashboard
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPasswordModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(20,18,16,0.7)] px-4"
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              className="relative w-full max-w-md border border-[var(--rule)] bg-[var(--paper)] p-7 md:p-9"
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

              {isTempKey && (
                <p className="mt-3 border-l-2 border-[var(--signal)] pl-3 text-sm leading-6 text-[var(--signal)]">
                  You are using a temporary key — please change it immediately.
                </p>
              )}

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
                      alert('Password changed successfully.');
                      setIsTempKey(false);
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
                  <input type="password" name="oldKey" placeholder="Current password" required className={fieldClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>New key</span>
                  <input type="password" name="newKey" placeholder="New password" required className={fieldClass} />
                </label>
                <button type="submit" className={`${buttonClass} w-full`}>
                  Update access key
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isLoggedIn ? (
        <div className="grid grid-cols-12 gap-x-8 gap-y-12 py-12 md:py-16">
          <div className="col-span-12 md:col-span-5">
            <p className="eyebrow text-[var(--ink-soft)]">Inside the portal</p>
            <ul className="mt-5 border-t border-[var(--rule)] text-sm">
              {[
                ['01', 'Live progress', 'Where the build stands right now.'],
                ['02', 'Payments', 'What is settled and what remains due.'],
                ['03', 'Delivery', 'The agreed hand-over date.'],
                ['04', 'Messages', 'A direct line to the developer.'],
              ].map(([index, title, description]) => (
                <li key={index} className="flex gap-5 border-b border-[var(--rule)] py-4">
                  <span className="font-mono-ui text-[10px] tracking-[0.14em] text-[var(--signal)]">
                    {index}
                  </span>
                  <div>
                    <p className="text-[var(--ink)]">{title}</p>
                    <p className="mt-1 leading-relaxed text-[var(--ink-soft)]">{description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="col-span-12 md:col-span-6 md:col-start-7">
            <div className="border border-[var(--rule)] p-6 md:p-8">
              <AnimatePresence mode="wait">
                {!showForgot ? (
                  <motion.div
                    key="login"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <p className="eyebrow text-[var(--ink-soft)]">Sign in</p>

                    <form onSubmit={handleLogin} className="mt-5 flex flex-col gap-5">
                      <label className="block">
                        <span className={labelClass}>Registered email</span>
                        <input
                          type="email"
                          required
                          placeholder="you@example.com"
                          id="email"
                          name="email"
                          value={loginData.email}
                          onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                          className={fieldClass}
                        />
                      </label>

                      <label className="block">
                        <span className={labelClass}>Secure access key</span>
                        <input
                          type="password"
                          required
                          placeholder="••••••••"
                          id="accessKey"
                          name="accessKey"
                          value={loginData.accessKey}
                          onChange={(e) => setLoginData({ ...loginData, accessKey: e.target.value })}
                          className={fieldClass}
                        />
                      </label>

                      <button type="submit" disabled={loading} className={`${buttonClass} w-full`}>
                        {loading ? 'Verifying…' : 'Open dashboard →'}
                      </button>
                    </form>

                    {error && (
                      <p className="mt-5 border-l-2 border-[var(--signal)] pl-3 text-sm text-[var(--signal)]">
                        {error}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setShowForgot(true);
                        setError('');
                      }}
                      className="mt-6 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--signal)]"
                    >
                      Forgot your access key?
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="forgot"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <p className="eyebrow text-[var(--ink-soft)]">Recover access</p>
                    <h2 className="mt-3 font-display text-3xl leading-tight text-[var(--ink)]">
                      A new key, by email.
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">
                      Enter the email on file and a new access key will be sent to your inbox.
                    </p>

                    <form onSubmit={handleForgotPassword} className="mt-5 flex flex-col gap-5">
                      <label className="block">
                        <span className={labelClass}>Registered email</span>
                        <input
                          type="email"
                          required
                          placeholder="you@example.com"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className={fieldClass}
                        />
                      </label>

                      <button type="submit" disabled={forgotLoading} className={`${buttonClass} w-full`}>
                        {forgotLoading ? 'Sending…' : 'Send new access key'}
                      </button>
                    </form>

                    {forgotMsg && (
                      <p className="mt-5 border-l-2 border-[var(--ink)] pl-3 text-sm text-[var(--ink)]">
                        {forgotMsg}
                      </p>
                    )}
                    {forgotError && (
                      <p className="mt-5 border-l-2 border-[var(--signal)] pl-3 text-sm text-[var(--signal)]">
                        {forgotError}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setShowForgot(false);
                        setForgotMsg('');
                        setForgotError('');
                      }}
                      className="mt-6 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--signal)]"
                    >
                      ← Back to sign in
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      ) : !projectData ? (
        <div className="flex min-h-[50vh] items-center justify-center py-16">
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            Loading project data…
          </p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10 md:py-14">
          <div className="flex flex-wrap items-start justify-between gap-6 border-b border-[var(--rule)] pb-6">
            <div>
              <p className="eyebrow text-[var(--ink-soft)]">Signed in as</p>
              <p className="mt-2 text-lg text-[var(--ink)]">
                {projectData.clientName}
                <span className="ml-3 font-mono-ui text-[11px] tracking-[0.06em] text-[var(--ink-soft)]">
                  {projectData.clientEmail}
                </span>
              </p>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className={`${buttonClass} px-4 py-2`}
              >
                Settings
              </button>

              <AnimatePresence>
                {showSettings && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 border border-[var(--rule)] bg-[var(--paper)]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowSettings(false);
                        setShowPasswordModal(true);
                      }}
                      className="w-full border-b border-[var(--rule)] px-4 py-3 text-left font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink)] transition-colors hover:text-[var(--signal)]"
                    >
                      Change access key
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full px-4 py-3 text-left font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--signal)] transition-colors hover:bg-[var(--signal-soft)]"
                    >
                      Sign out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {projectsList.length > 1 && (
            <div className="flex gap-6 overflow-x-auto border-b border-[var(--rule)]">
              {projectsList.map((p) => (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => setActiveProjectId(p._id)}
                  className={`-mb-px whitespace-nowrap border-b-2 py-4 font-mono-ui text-[10px] uppercase tracking-[0.14em] transition-colors ${
                    activeProjectId === p._id
                      ? 'border-[var(--signal)] text-[var(--ink)]'
                      : 'border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]'
                  }`}
                >
                  {p.projectTitle}
                </button>
              ))}
            </div>
          )}

          <section className="border-b border-[var(--rule)] py-10">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="eyebrow text-[var(--ink-soft)]">Active project</p>
                <h2 className="mt-3 font-display text-[clamp(2rem,4vw,3.2rem)] leading-none text-[var(--ink)]">
                  {projectData.projectTitle}
                </h2>
              </div>
              <p className="font-display text-[clamp(2.4rem,6vw,4.5rem)] leading-none text-[var(--signal)]">
                {projectData.progress ?? 0}
                <span className="ml-1 font-mono-ui text-sm tracking-[0.1em]">%</span>
              </p>
            </div>

            <div className="mt-6 h-1.5 w-full bg-[var(--paper-2)]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${projectData.progress ?? 0}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
                className="h-full bg-[var(--signal)]"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              <span>Status — {projectData.status}</span>
              <span>
                Updated{' '}
                {projectData.lastUpdated
                  ? new Date(projectData.lastUpdated).toLocaleDateString()
                  : 'N/A'}
              </span>
            </div>
          </section>

          <div className="grid grid-cols-12 gap-x-8 gap-y-10 border-b border-[var(--rule)] py-10">
            <div className="col-span-12 md:col-span-6">
              <p className="eyebrow text-[var(--ink-soft)]">Payment status</p>
              <h3
                className={`mt-3 font-display text-3xl leading-tight ${
                  projectData.balanceDue > 0 ? 'text-[var(--signal)]' : 'text-[var(--ink)]'
                }`}
              >
                {projectData.paymentStatus}
              </h3>

              {projectData.balanceDue > 0 && (
                <div className="mt-5 border-t border-[var(--rule)] pt-4">
                  <p className="text-sm text-[var(--ink-soft)]">
                    Remaining due —{' '}
                    <strong className="font-medium text-[var(--ink)]">${projectData.balanceDue}</strong>
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

            <div className="col-span-12 md:col-span-5 md:col-start-8">
              <p className="eyebrow text-[var(--ink-soft)]">Expected delivery</p>
              <h3 className="mt-3 font-display text-3xl leading-tight text-[var(--ink)]">
                {projectData.deliveryDate || 'To be agreed'}
              </h3>
              <p className="mt-4 max-w-sm text-sm leading-7 text-[var(--ink-soft)]">
                Dates are estimates and move with feedback and scope. Any change is posted in the
                note below.
              </p>
            </div>
          </div>

          <section className="py-10">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="eyebrow text-[var(--signal)]">Latest note</p>
              <p className="eyebrow text-[var(--ink-soft)]">From the developer</p>
            </div>

            <p className="mt-4 max-w-3xl whitespace-pre-wrap text-lg leading-8 text-[var(--ink)]">
              {projectData.notes || 'No new updates right now. Working on your project!'}
            </p>

            <form onSubmit={handleSendReply} className="mt-8 max-w-2xl border-t border-[var(--rule)] pt-6">
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
      )}
    </PageShell>
  );
};

export default ClientPortal;
