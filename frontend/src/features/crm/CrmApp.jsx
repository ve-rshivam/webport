import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { crmApi, crmSession } from './crmApi';
import CrmLogin from './CrmLogin';
import CrmForgotPassword from './CrmForgotPassword';
import { CrmShell, Loading, primaryClass } from './crmUi';
import CrmDashboard from './CrmDashboard';
import CrmCustomers from './CrmCustomers';
import CrmCustomerDetail from './CrmCustomerDetail';
import CrmPipeline from './CrmPipeline';
import CrmPayments from './CrmPayments';
import CrmInvoices from './CrmInvoices';
import CrmAudit from './CrmAudit';

export default function CrmApp() {
  const [actor, setActor] = useState(() => (crmSession.token() ? crmSession.actor() : null));
  const [checking, setChecking] = useState(Boolean(crmSession.token()));

  useEffect(() => {
    if (!crmSession.token()) return;
    let active = true;
    crmApi
      .me()
      .then((response) => {
        if (!active) return;
        crmSession.saveActor(response.data.actor);
        setActor(response.data.actor);
      })
      .catch(() => {
        if (!active) return;
        crmSession.clear();
        setActor(null);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setActor(null);
    window.addEventListener('crm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('crm:unauthorized', onUnauthorized);
  }, []);

  async function signOut() {
    try {
      await crmApi.logout();
    } catch {
      /* the local session is cleared regardless */
    }
    crmSession.clear();
    setActor(null);
  }

  if (checking && crmSession.token()) {
    return <Loading label="Checking session" />;
  }

  if (!crmSession.token() || !actor) {
    return (
      <Routes>
        <Route path="forgot-password" element={<CrmForgotPassword />} />
        <Route
          path="*"
          element={
            <CrmLogin
              onLogin={(nextActor) => {
                setActor(nextActor);
                setChecking(false);
              }}
            />
          }
        />
      </Routes>
    );
  }

  if (actor.role === 'CLIENT') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center px-6 py-16">
        <p className="eyebrow text-[var(--signal)]">Studio CRM</p>
        <h1 className="mt-3 font-display text-4xl text-[var(--ink)]">
          This area is for studio accounts.
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          Client accounts use the project portal. Sign in with a studio account to manage customers,
          invoices and payments.
        </p>
        <button type="button" onClick={signOut} className={`${primaryClass} mt-6 self-start`}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <CrmShell actor={actor} onSignOut={signOut}>
      <Routes>
        <Route index element={<CrmDashboard />} />
        <Route path="customers" element={<CrmCustomers />} />
        <Route path="customers/:id" element={<CrmCustomerDetail />} />
        <Route path="pipeline" element={<CrmPipeline />} />
        <Route path="invoices" element={<CrmInvoices />} />
        <Route path="payments" element={<CrmPayments actor={actor} />} />
        <Route path="audit" element={<CrmAudit />} />
        <Route path="*" element={<Navigate to="/admin/crm" replace />} />
      </Routes>
    </CrmShell>
  );
}