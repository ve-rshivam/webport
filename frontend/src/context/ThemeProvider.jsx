import { useState, useLayoutEffect, useEffect } from 'react';
import { ThemeContext, getInitialTheme } from './theme-context';

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(getInitialTheme);

  // useLayoutEffect (not useEffect) so the class lands before paint and inside
  // the View Transition snapshot.
  useLayoutEffect(() => {
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Storage can be unavailable in private browsing; the UI still updates.
    }
    const root = document.documentElement;

    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme !== 'dark');
    root.style.colorScheme = theme;
    // Smooth transition on theme change
    root.style.transition = 'background-color 0.5s ease, color 0.5s ease';
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemThemeChange = (e) => {
      let userManuallySet = null;
      try {
        userManuallySet = localStorage.getItem('themeManuallySet');
      } catch {
        // Storage can be unavailable; treat it as an unset preference.
      }
      if (!userManuallySet) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, []);

  const toggleTheme = () => {
    try {
      localStorage.setItem('themeManuallySet', 'true');
    } catch {
      // Storage can be unavailable; the in-memory theme still toggles.
    }
    // Add flash animation to button
    const btn = document.querySelector('[aria-label="Switch to light theme"], [aria-label="Switch to dark theme"]');
    if (btn) {
      btn.classList.add('theme-toggle-flash');
      btn.addEventListener('animationend', () => btn.classList.remove('theme-toggle-flash'), { once: true });
    }
    setTheme((prevTheme) => (prevTheme === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
