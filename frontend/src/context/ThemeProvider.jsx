import { useState, useLayoutEffect, useEffect } from 'react';
import { ThemeContext, getInitialTheme } from './theme-context';

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(getInitialTheme);

      useLayoutEffect(() => {
    try {
      localStorage.setItem('theme', theme);
    } catch {
          }
    const root = document.documentElement;

    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme !== 'dark');
    root.style.colorScheme = theme;
        root.style.transition = 'background-color 0.5s ease, color 0.5s ease';
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemThemeChange = (e) => {
      let userManuallySet = null;
      try {
        userManuallySet = localStorage.getItem('themeManuallySet');
      } catch {
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
          }
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
