import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';

import Navbar from './components/Navbar';
import Chatbot from './components/Chatbot';
import Footer from './components/Footer';
import PageWrapper from './components/PageWrapper';
import IntroModal from './components/IntroModal';
import CookieConsent from './components/CookieConsent';
import useInactivityTimeout from './hooks/useInactivityTimeout';

import Home from './pages/Home';
import Skills from './pages/Skills';
import Projects from './pages/Projects';
import Resume from './pages/Resume';
import Services from './pages/Services';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Refund from './pages/Refund';
import Reviews from './pages/Reviews';
import ClientPortal from './pages/ClientPortal';
import Experience from './pages/Experience';
import Cookies from './pages/Cookies';
import NotFound from './pages/NotFound';

const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const Admin = lazy(() => import('./pages/Admin'));
const Payment = lazy(() => import('./pages/Payment'));
const Legal = lazy(() => import('./pages/Legal'));

// [SEO] Admin subdomain aur /admin, /portal routes par noindex, nofollow meta set hota hai.
const RobotsMeta = () => {
  const location = useLocation();

  useEffect(() => {
    const isPrivate =
      window.location.hostname.startsWith('admin.') ||
      location.pathname.startsWith('/admin') ||
      location.pathname.startsWith('/portal');

    const existing = document.querySelector('meta[name="robots"]');
    if (isPrivate) {
      const tag = existing || document.createElement('meta');
      tag.setAttribute('name', 'robots');
      tag.setAttribute('content', 'noindex, nofollow');
      if (!existing) document.head.appendChild(tag);
    } else if (existing) {
      existing.remove();
    }
  }, [location.pathname]);

  return null;
};

const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageWrapper><Home /></PageWrapper>} />
        <Route path="/about" element={<PageWrapper><About /></PageWrapper>} />
        <Route path="/skills" element={<PageWrapper><Skills /></PageWrapper>} />
        <Route path="/projects" element={<PageWrapper><Projects /></PageWrapper>} />
        <Route path="/resume" element={<PageWrapper><Resume /></PageWrapper>} />
        <Route path="/contact" element={<PageWrapper><Contact /></PageWrapper>} />
        <Route path="/services" element={<PageWrapper><Services /></PageWrapper>} />
        <Route path="/payment" element={<PageWrapper><Payment /></PageWrapper>} />
        <Route path="/privacy" element={<PageWrapper><Privacy /></PageWrapper>} />
        <Route path="/terms" element={<PageWrapper><Terms /></PageWrapper>} />
        <Route path="/refund" element={<PageWrapper><Refund /></PageWrapper>} />
        <Route path="/legal" element={<PageWrapper><Legal /></PageWrapper>} />
        <Route path="/cookies" element={<PageWrapper><Cookies /></PageWrapper>} />
        <Route path="/reviews" element={<PageWrapper><Reviews /></PageWrapper>} />
        <Route path="/admin" element={<PageWrapper><Admin /></PageWrapper>} />
        <Route path="/experience" element={<PageWrapper><Experience /></PageWrapper>} />
        <Route path="/portal" element={<PageWrapper><ClientPortal /></PageWrapper>} />
        <Route path="*" element={<PageWrapper><NotFound /></PageWrapper>} />
      </Routes>
    </AnimatePresence>
  );
};

function App() {
  useInactivityTimeout();
  const isAdminSubdomain = window.location.hostname.startsWith('admin.');

  return (
    <Router>
      <RobotsMeta />
      <div className="flex min-h-screen flex-col bg-[var(--paper)] text-[var(--ink)]">
        {isAdminSubdomain ? (
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                Loading admin…
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<PageWrapper><Admin /></PageWrapper>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        ) : (
          <>
            <Navbar />
            <main className="flex-grow pt-16">
              <Suspense
                fallback={
                  <div className="flex min-h-[60vh] items-center justify-center font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                    Loading…
                  </div>
                }
              >
                <AnimatedRoutes />
              </Suspense>
            </main>
            <Footer />
            <Chatbot />
            <IntroModal />
            <CookieConsent />
          </>
        )}
      </div>
    </Router>
  );
}

export default App;
