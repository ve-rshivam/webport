import { useEffect } from 'react';
import {
  clearAllSessions,
  getSessionActivityState,
  SESSION_IDLE_MS,
  touch,
} from '../lib/authSession';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
const EXPIRED_MESSAGE = 'Session expired due to inactivity.';

export default function useInactivityTimeout() {
  useEffect(() => {
    let redirecting = false;

    const expireSession = () => {
      if (redirecting) return;
      const state = getSessionActivityState();
      if (!state.active) return;
      redirecting = true;
      const currentPath = window.location.pathname;
      const target = currentPath.startsWith('/portal')
        ? '/portal'
        : currentPath.startsWith('/admin') || state.adminActive
          ? '/admin'
          : '/portal';
      clearAllSessions();
      import('../lib/socket').then(({ disconnectRealtimeSocket }) => disconnectRealtimeSocket());
      window.dispatchEvent(new CustomEvent('auth:expired', { detail: { message: EXPIRED_MESSAGE } }));
      window.location.replace(`${target}?sessionExpired=1`);
    };

    const checkIdle = () => {
      const state = getSessionActivityState();
      if (state.active && (!state.lastActiveAt || Date.now() - state.lastActiveAt > SESSION_IDLE_MS)) {
        expireSession();
      }
    };

    const recordActivity = () => {
      const state = getSessionActivityState();
      if (!state.active) return;
      if (!state.lastActiveAt || Date.now() - state.lastActiveAt > SESSION_IDLE_MS) {
        expireSession();
        return;
      }
      touch();
    };

            checkIdle();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));
    const timer = window.setInterval(checkIdle, 15_000);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, recordActivity));
      window.clearInterval(timer);
    };
  }, []);
}
