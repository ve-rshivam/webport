import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageWrapper from '../components/PageWrapper';
import { apiUrl, portalApi, portalSession } from '../lib/api';
import { SUPPORT_EMAIL, emailHref } from '../lib/contact';
import './ClientPortal.css';
import LivePreviewTab from '../components/LivePreviewTab';

const formatInr = (value) =>
  `\u20b9${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const paymentStatusLabel = (status) => ({
  FULLY_PAID: 'Fully paid',
  PARTIALLY_PAID: 'Partially paid',
  PENDING: 'Pending',
}[status] || status || 'Not set');

function ClientPortal() {
  const location = useLocation();
  const navigate = useNavigate();
  const pendingCheckout = location.state || {};
  const sessionExpiredNotice = new URLSearchParams(window.location.search).has('sessionExpired')
    ? 'Session expired due to inactivity.'
    : '';

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(
    pendingCheckout.paymentSubmitted
      ? 'Payment received. Once verification finishes, sign in with the temporary password sent to your email.'
      : sessionExpiredNotice
  );
  const [session, setSession] = useState(null);
  const [projectsList, setProjectsList] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState('');
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [loginData, setLoginData] = useState({ email: pendingCheckout.email || '', password: '' });
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotError, setForgotError] = useState('');
  // [H2] Secure reset link ka single-use token (/portal?resetToken=...). 6-digit OTP flow hata diya gaya.
  const [resetToken] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('resetToken') || '';
  });
  const [resetKey, setResetKey] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState('');
  const [resetError, setResetError] = useState('');
  const [showForgot, setShowForgot] = useState(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(new URLSearchParams(window.location.search).get('resetToken'));
  });
  const [clientReply, setClientReply] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [thread, setThread] = useState({ projectId: null, items: [], loading: false, error: '' });
  const [invoiceDownloading, setInvoiceDownloading] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  const projectData = projectsList.find((p) => p.id === activeProjectId) || projectsList[0];
  const threadMatches = Boolean(projectData?.id) && thread.projectId === projectData.id;
  const messages = threadMatches ? thread.items : [];
  const messagesLoading = Boolean(projectData?.id) && (!threadMatches || thread.loading);
  const messagesError = threadMatches ? thread.error : '';

    useEffect(() => {
    const restoreSession = async () => {
      if (!portalSession.getToken()) return;
      try {
        const data = await portalApi.me();
        setSession({ user: data.user ?? null });
        setProjectsList(data.projects ?? []);
        setActiveProjectId(data.projects?.[0]?.id ?? '');
        setMustChangePassword(Boolean(data.mustChangePassword));
        setShowWelcomePopup(!data.mustChangePassword);
        setIsLoggedIn(true);
      } catch {
        portalSession.clear();
      }
    };
    restoreSession();
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    let disposed = false;
    let socket = null;

    const onProjectMutated = ({ action, project, user } = {}) => {
      if (!project?.id) return;
      if (user?.name || user?.email) {
        setSession((current) => current
          ? { ...current, user: { ...current.user, ...user } }
          : current);
      }
      if (action === 'deleted') {
        setActiveProjectId((activeId) => activeId === project.id ? '' : activeId);
        setProjectsList((current) => current.filter((item) => item.id !== project.id));
        return;
      }
      setProjectsList((current) => current.some((item) => item.id === project.id)
        ? current.map((item) => item.id === project.id ? { ...item, ...project } : item)
        : [project, ...current]);
      setActiveProjectId((activeId) => activeId || project.id);
    };

    const onMessageNew = ({ message } = {}) => {
      if (!message?.projectId) return;
      setThread((current) => {
        if (current.projectId !== message.projectId || (current.items || []).some((item) => item.id === message.id)) {
          return current;
        }
        return { ...current, items: [...(current.items || []), message] };
      });
    };

    import('../lib/socket').then(({ connectRealtimeSocket }) => {
      if (disposed) return;
      socket = connectRealtimeSocket(portalSession.getToken());
      if (!socket) return;
      socket.on('project:mutated', onProjectMutated);
      socket.on('message:new', onMessageNew);
    }).catch((err) => console.warn('Could not connect to live portal updates:', err));
    return () => {
      disposed = true;
      if (!socket) return;
      socket.off('project:mutated', onProjectMutated);
      socket.off('message:new', onMessageNew);
    };
  }, [isLoggedIn]);

    useEffect(() => {
    const onExpired = () => {
      setIsLoggedIn(false);
      setSession(null);
      setProjectsList([]);
      setActiveProjectId('');
      setShowWelcomePopup(false);
      setShowSettings(false);
      setShowPasswordModal(false);
      setMustChangePassword(false);
      setError('Your session ended. Sign in again to continue.');
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

      useEffect(() => {
    if (!isLoggedIn || !projectData?.id) return undefined;
    const projectId = projectData.id;
    let cancelled = false;

    portalApi
      .listMessages(projectId)
      .then((data) => {
        if (!cancelled) {
          setThread({ projectId, items: data.messages ?? [], loading: false, error: '' });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setThread({
            projectId,
            items: [],
            loading: false,
            error: err.message || 'Could not load messages.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, projectData?.id]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');

    try {
      const data = await portalApi.login(loginData.email.trim(), loginData.password);
      portalSession.save(data.token, data.user?.email ?? loginData.email.trim());

      setSession({ user: data.user ?? null });
      setProjectsList(data.projects ?? []);
      setActiveProjectId(data.projects?.[0]?.id ?? '');
      setMustChangePassword(Boolean(data.mustChangePassword));
      setIsLoggedIn(true);
      setLoginData((prev) => ({ ...prev, password: '' }));
      setShowWelcomePopup(!data.mustChangePassword);
    } catch (err) {
      setError(err.message || 'Invalid credentials. Ensure your payment is verified.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await portalApi.logout();
    } catch {
          }
    portalSession.clear();
    import('../lib/socket').then(({ disconnectRealtimeSocket }) => disconnectRealtimeSocket());
    setIsLoggedIn(false);
    setSession(null);
    setProjectsList([]);
    setActiveProjectId('');
    setShowWelcomePopup(false);
    setShowSettings(false);
    setShowPasswordModal(false);
    setMustChangePassword(false);
    setThread({ projectId: null, items: [], loading: false, error: '' });
    setError('');
    setNotice('');
  };

  // [SESSION CONTROL] Server par session token + device binding clear karke sab devices se sign out.
  const handleLogoutAll = async () => {
    if (!window.confirm('Sign out of the portal on every device? Every active session will be revoked.')) return;
    try {
      await portalApi.logoutAll();
    } catch {
          }
    portalSession.clear();
    import('../lib/socket').then(({ disconnectRealtimeSocket }) => disconnectRealtimeSocket());
    setIsLoggedIn(false);
    setSession(null);
    setProjectsList([]);
    setActiveProjectId('');
    setShowSettings(false);
    setShowPasswordModal(false);
    setShowWelcomePopup(false);
    setMustChangePassword(false);
    setThread({ projectId: null, items: [], loading: false, error: '' });
    setError('');
    setNotice('Signed out of every device.');
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotLoading(true);
    setForgotMsg('');
    setForgotError('');
    try {
      const data = await portalApi.forgotPassword(forgotEmail.trim());
      setForgotMsg(
        data.message ||
          'If that email is on file, a secure reset link has been sent. It expires in 15 minutes — check your spam folder if you do not see it.'
      );
    } catch (err) {
      setForgotError(err.message || 'Server connection error. Please try again later.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetWithToken = async (e) => {
    e.preventDefault();
    if (!resetToken || resetKey.length < 8) return;
    setResetLoading(true);
    setResetMsg('');
    setResetError('');
    try {
      const data = await portalApi.resetPasswordWithToken(resetToken, resetKey);
      setResetMsg(data.message || 'New password saved. You can now sign in with it.');
      setResetKey('');
      setForgotMsg('');
      setForgotError('');
      // Token single-use hai — URL se hata dete hain taaki back/refresh par dobara na chale.
      try {
        window.history.replaceState({}, '', '/portal');
      } catch {}
    } catch (err) {
      setResetError(err.message || 'Could not set the new password. Request a new reset link.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError('The two passwords do not match.');
      return;
    }
    setPasswordLoading(true);
    setPasswordError('');
    try {
      await portalApi.setPassword(newPassword);
      setMustChangePassword(false);
      setNewPassword('');
      setConfirmPassword('');
      setNotice('Password saved. Your portal is ready.');
    } catch (err) {
      setPasswordError(err.message || 'Could not save the password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!clientReply.trim() || !projectData?.id) return;

    setIsSendingReply(true);
    try {
      await portalApi.sendMessage(projectData.id, clientReply.trim());
      setClientReply('');
      const data = await portalApi.listMessages(projectData.id);
      setThread({ projectId: projectData.id, items: data.messages ?? [], loading: false, error: '' });
    } catch (err) {
      alert(err.message || 'Server error while sending message.');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handlePayRemaining = () => {
    if (!projectData) return;
    navigate('/payment', {
      state: {
        isRemainingPayment: true,
        service: projectData.projectTitle || projectData.serviceName || 'Project balance',
        clientName: session?.user?.name || '',
        clientEmail: session?.user?.email || '',
        projectId: projectData.id,
        remainingAmount: projectData.balanceDue,
        originalTotal: projectData.totalCost,
      },
    });
  };

  const handleDownloadInvoice = async () => {
    if (!projectData?.invoiceNumber || invoiceDownloading) return;
    setInvoiceDownloading(true);
    setInvoiceError('');
    try {
      const response = await fetch(apiUrl(`/api/portal/projects/${encodeURIComponent(projectData.id)}/invoice`), {
        headers: {
          Accept: 'application/pdf',
          ...(portalSession.getToken() ? { Authorization: `Bearer ${portalSession.getToken()}` } : {}),
        },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || 'The invoice PDF is not available right now.');
      }
      const pdf = await response.blob();
      if (!pdf.size || (pdf.type && pdf.type !== 'application/pdf')) {
        throw new Error('The server returned an empty or invalid invoice file. Please contact support.');
      }
      const objectUrl = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `Invoice-${projectData.invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      setInvoiceError(err.message || 'Could not download the invoice PDF.');
    } finally {
      setInvoiceDownloading(false);
    }
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
              {session?.user?.name || 'Your project file.'}
            </h1>
            <p className="mt-1.5 max-w-md text-sm leading-6 text-[var(--ink-soft)]">
              {isLoggedIn
                ? 'Signed in to your project dashboard.'
                : 'Enter the email and password sent to you after your payment was verified.'}
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
                  <label className={labelClass}>Password</label>
                  <input
                    type="password"
                    required
                    className={fieldClass}
                    placeholder="Your portal password"
                    value={loginData.password}
                    onChange={(e) =>
                      setLoginData({ ...loginData, password: e.target.value })
                    }
                  />
                </div>
                {notice && (
                  <p className="rounded-lg border border-[var(--rule)] bg-[var(--paper-2)] px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]">
                    {notice}
                  </p>
                )}
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
                  Forgot your password?
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
                          Reset your password
                        </p>
                        <p className="mt-1 text-xs text-[var(--ink-soft)]">
                          Enter the email on file. If that email is registered, we will send a
                          secure single-use reset link that expires in 15 minutes.
                        </p>

                        {!forgotMsg && !resetToken && (
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
                                {forgotLoading ? 'Sending…' : 'Send reset link'}
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

                        {forgotMsg && !resetToken && !resetMsg && (
                          <div className="mt-4 border-t border-[var(--rule)] pt-5">
                            <p className="text-sm text-green-700">{forgotMsg}</p>
                            <button
                              type="button"
                              onClick={() => {
                                setForgotMsg('');
                                setForgotEmail('');
                                setForgotError('');
                              }}
                              className={`${buttonClass} mt-4 w-full`}
                            >
                              Back
                            </button>
                          </div>
                        )}

                        {resetToken && !resetMsg && (
                          <div className="mt-4 border-t border-[var(--rule)] pt-5">
                            <p className="text-sm font-medium text-[var(--ink)]">
                              Choose a new password
                            </p>
                            <p className="mt-1 text-xs text-[var(--ink-soft)]">
                              This secure link works once and expires 15 minutes after it was
                              requested.
                            </p>
                            <label className="mt-4 block">
                              <span className={labelClass}>New password</span>
                              <input
                                type="password"
                                required
                                minLength={8}
                                className={fieldClass}
                                placeholder="8+ chars, letters and numbers"
                                value={resetKey}
                                onChange={(e) => setResetKey(e.target.value)}
                              />
                            </label>
                            {resetError && (
                              <p className="mt-3 text-sm text-red-700">{resetError}</p>
                            )}
                            <button
                              type="button"
                              onClick={handleResetWithToken}
                              disabled={resetLoading || resetKey.length < 8}
                              className={`${buttonClass} mt-4 w-full`}
                            >
                              {resetLoading ? 'Saving…' : 'Save new password'}
                            </button>
                          </div>
                        )}

                        {resetMsg && (
                          <div className="mt-4 border-t border-[var(--rule)] pt-5">
                            <p className="text-sm text-green-700">{resetMsg}</p>
                            <button
                              type="button"
                              onClick={() => {
                                setShowForgot(false);
                                setForgotMsg('');
                                setForgotEmail('');
                                setForgotError('');
                                setResetMsg('');
                                setResetKey('');
                                setResetError('');
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

        {isLoggedIn && mustChangePassword && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-[var(--rule)] bg-[var(--paper)] p-6 md:p-10"
          >
            <p className="eyebrow text-[var(--signal)]">First sign-in</p>
            <h2 className="mt-2 font-display text-3xl leading-tight text-[var(--ink)]">
              Set a permanent password.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--ink-soft)]">
              You signed in with the temporary password from your payment email. Choose a
              password you will keep — at least 8 characters with a letter and a number.
            </p>
            <form onSubmit={handleSetPassword} className="mt-6 flex max-w-md flex-col gap-4">
              <label className="block">
                <span className={labelClass}>New password</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  className={fieldClass}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Confirm password</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  className={fieldClass}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </label>
              {passwordError && (
                <p className="rounded-lg border border-red-800/30 bg-red-950/20 px-4 py-3 text-sm text-red-900">
                  {passwordError}
                </p>
              )}
              <button type="submit" disabled={passwordLoading} className={buttonClass}>
                {passwordLoading ? 'Saving…' : 'Save password and open portal'}
              </button>
            </form>
          </motion.div>
        )}

        {isLoggedIn && !mustChangePassword && !projectData && (
          <div className="rounded-2xl border border-[var(--rule)] bg-[var(--paper)] p-6 md:p-10">
            <p className="eyebrow text-[var(--ink-soft)]">No project on file</p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
              Your account is active but no project is attached yet.{' '}
              {SUPPORT_EMAIL ? <>Write to <a className="underline" href={emailHref(SUPPORT_EMAIL)}>{SUPPORT_EMAIL}</a> and we will link it.</> : <>Use the <a className="underline" href="/contact">contact form</a> and we will link it.</>}
            </p>
          </div>
        )}

        {isLoggedIn && !mustChangePassword && projectData && (
          <AnimatePresence>
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Project selector and the two portal views */}
              <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--rule)] pb-4">
                <div role="tablist" aria-label="Project sections" className="flex items-center gap-2">
                  <button
                    type="button"
                    role="tab"
                    id="portal-overview-tab"
                    onClick={() => setActiveTab('overview')}
                    aria-selected={activeTab === 'overview'}
                    aria-controls="portal-overview-panel"
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      activeTab === 'overview'
                        ? 'bg-[var(--ink)] text-[var(--paper)]'
                        : 'border border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-soft)] hover:text-[var(--ink)]'
                    }`}
                  >
                    Project overview
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="portal-preview-tab"
                    onClick={() => setActiveTab('preview')}
                    aria-selected={activeTab === 'preview'}
                    aria-controls="portal-preview-panel"
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      activeTab === 'preview'
                        ? 'bg-[var(--ink)] text-[var(--paper)]'
                        : 'border border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-soft)] hover:text-[var(--ink)]'
                    }`}
                  >
                    Live preview
                  </button>
                </div>

                {projectsList.length > 1 && (
                  <select
                    value={projectData.id}
                    onChange={(e) => setActiveProjectId(e.target.value)}
                    className="rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)]"
                  >
                    {projectsList.map((proj) => (
                      <option key={proj.id} value={proj.id}>
                        {proj.projectTitle || 'Untitled Project'}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {activeTab === 'preview' && (
                <div
                  role="tabpanel"
                  id="portal-preview-panel"
                  aria-labelledby="portal-preview-tab"
                  className="mb-10"
                >
                  <LivePreviewTab
                    previewUrl={projectData.previewUrl}
                    projectTitle={projectData.projectTitle}
                  />
                </div>
              )}
              {activeTab === 'overview' && (
                <div
                  role="tabpanel"
                  id="portal-overview-panel"
                  aria-labelledby="portal-overview-tab"
                >
              <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-x-8">
                <div className="col-span-12 md:col-span-7">
                  <p className="eyebrow text-[var(--ink-soft)]">Project overview</p>
                  <h2 className="mt-2 font-display text-3xl leading-tight text-[var(--ink)]">
                    {projectData.projectTitle || 'Untitled project'}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--ink-soft)]">
                    Client: {projectData.clientName || session?.user?.name || '—'} ({session?.user?.email || 'on file'})
                  </p>
                  {projectData.projectType && (
                    <p className="mt-3 text-sm text-[var(--ink-soft)]">
                      Project type <span className="ml-2 font-medium text-[var(--ink)]">{projectData.projectType}</span>
                    </p>
                  )}
                  {Array.isArray(projectData.features) && projectData.features.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2" aria-label="Included project features">
                      {projectData.features.map((feature) => (
                        <span key={`${projectData.id}:${feature}`} className="rounded-full border border-[var(--rule)] bg-[var(--paper)] px-3 py-1 text-xs text-[var(--ink-soft)]">{feature}</span>
                      ))}
                    </div>
                  )}
                  {projectData.invoiceNumber && (
                    <div className="mt-4">
                      <button type="button" onClick={handleDownloadInvoice} disabled={invoiceDownloading} className={`${buttonClass} disabled:cursor-wait disabled:opacity-50`}>
                        {invoiceDownloading ? 'Preparing invoice PDF…' : 'Download Invoice & SOW (PDF) ↓'}
                      </button>
                      <p className="mt-2 text-xs text-[var(--ink-soft)]">Invoice {projectData.invoiceNumber}</p>
                      {invoiceError && <p role="alert" className="mt-2 text-sm text-red-700">{invoiceError}</p>}
                    </div>
                  )}
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
                          {paymentStatusLabel(projectData.paymentStatus)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--ink-soft)]">Total cost</dt>
                        <dd className="mt-1 font-medium text-[var(--ink)]">
                          {formatInr(projectData.totalCost)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--ink-soft)]">Paid</dt>
                        <dd className="mt-1 font-medium text-[var(--ink)]">
                          {formatInr(projectData.amountPaid)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--ink-soft)]">Balance due</dt>
                        <dd className="mt-1 font-medium text-[var(--ink)]">
                          {formatInr(projectData.balanceDue)}
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
                          Pay remaining balance 
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
                              {formatInr(projectData.amountPaid)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[var(--ink-soft)]">Balance</dt>
                            <dd className="font-medium text-[var(--ink)]">
                              {formatInr(projectData.balanceDue)}
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
                  <p className="eyebrow text-[var(--ink-soft)]">Project thread</p>
                </div>

                <p className="mt-4 max-w-3xl whitespace-pre-wrap text-lg leading-8 text-[var(--ink)]">
                  {projectData.notes ||
                    'No new updates right now. Working on your project!'}
                </p>

                <div className="mt-8 border-t border-[var(--rule)] pt-6">
                  <p className="eyebrow text-[var(--ink-soft)]">Conversation</p>
                  {messagesLoading && (
                    <p className="mt-3 text-sm text-[var(--ink-soft)]">Loading messages…</p>
                  )}
                  {messagesError && (
                    <p className="mt-3 text-sm text-red-700">{messagesError}</p>
                  )}
                  {!messagesLoading && !messagesError && messages.length === 0 && (
                    <p className="mt-3 text-sm text-[var(--ink-soft)]">
                      No messages yet. Send the first one below.
                    </p>
                  )}
                  <ul className="mt-4 space-y-3">
                    {messages.map((msg) => {
                      const fromClient = msg.senderType === 'client';
                      return (
                        <li
                          key={msg.id}
                          className={`rounded-lg border border-[var(--rule)] p-4 ${fromClient ? 'bg-[var(--paper)]' : 'bg-[var(--paper-2)]'}`}
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-sm font-medium text-[var(--ink)]">
                              {fromClient ? 'You' : msg.senderName || 'Shivam (developer)'}
                            </p>
                            <p className="font-mono-ui text-[10px] uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                              {new Date(msg.createdAt).toLocaleString()}
                            </p>
                          </div>
                          {msg.subject && (
                            <p className="mt-1 text-sm font-medium text-[var(--ink)]">
                              {msg.subject}
                            </p>
                          )}
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--ink-soft)]">
                            {msg.body}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>

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
                    {isSendingReply ? 'Sending…' : 'Send message '}
                  </button>
                </form>
              </section>
                </div>
              )}
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
                  Welcome back, {session?.user?.name || 'there'}.
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
                      {session?.user?.email || 'Not set'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--rule)] bg-[var(--paper-2)] p-4">
                    <p className="text-sm font-medium text-[var(--ink)]">
                      Password
                    </p>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      This password signs you in to the portal.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSettings(false);
                        setShowPasswordModal(true);
                      }}
                      className={buttonClass}
                    >
                      Change password
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
                  <div className="rounded-lg border border-[var(--rule)] bg-[var(--paper-2)] p-4">
                    <p className="text-sm font-medium text-[var(--ink)]">Sign out of all devices</p>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      Revokes every portal session tied to this account, on every device.
                    </p>
                    <button
                      type="button"
                      onClick={handleLogoutAll}
                      className="rounded-lg border border-red-800/40 bg-red-950/20 px-4 py-2 text-sm font-medium text-red-900 transition-colors hover:bg-red-950/40"
                    >
                      Sign out of all devices
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
                  Change password.
                </h2>
                <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
                  Choose a new password for this portal. You will stay signed in.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const pass = e.target.newKey.value;
                    const confirm = e.target.confirmKey.value;
                    if (pass !== confirm) {
                      alert('The two passwords do not match.');
                      return;
                    }
                    try {
                      await portalApi.setPassword(pass);
                      alert('Password updated successfully.');
                      setShowPasswordModal(false);
                    } catch (err) {
                      alert(err.message || 'Server error');
                    }
                  }}
                  className="mt-6 flex flex-col gap-4"
                >
                  <label className="block">
                    <span className={labelClass}>New password</span>
                    <input
                      type="password"
                      name="newKey"
                      placeholder="At least 8 characters"
                      minLength={8}
                      required
                      className={fieldClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Confirm new password</span>
                    <input
                      type="password"
                      name="confirmKey"
                      placeholder="Repeat the password"
                      minLength={8}
                      required
                      className={fieldClass}
                    />
                  </label>
                  <button type="submit" className={`${buttonClass} w-full`}>
                    Update password
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
