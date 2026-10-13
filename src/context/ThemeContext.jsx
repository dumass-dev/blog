import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
  siteDefaultTheme: 'dark',
  updateSiteDefaultTheme: () => {},
  hasUserOverride: false
});

export function ThemeProvider({ children }) {
  const [hasUserOverride, setHasUserOverride] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage && localStorage.getItem('theme_user_override') === 'true';
    } catch {
      return false;
    }
  });

  const [siteDefaultTheme, setSiteDefaultTheme] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cached = localStorage.getItem('site_default_theme');
        if (cached === 'light' || cached === 'dark') return cached;
      }
    } catch {}
    return 'dark';
  });

  const [theme, setTheme] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const userOverride = localStorage.getItem('theme_user_override') === 'true';
        const saved = localStorage.getItem('diary-theme') || localStorage.getItem('theme');
        if (userOverride && (saved === 'light' || saved === 'dark')) {
          return saved;
        }
        const cachedDefault = localStorage.getItem('site_default_theme');
        if (cachedDefault === 'light' || cachedDefault === 'dark') {
          return cachedDefault;
        }
      }
    } catch {}
    return 'dark';
  });

  // Fetch initial site default preference from /api/about
  useEffect(() => {
    fetch('/api/about')
      .then(res => res.json())
      .then(data => {
        if (data && (data.default_theme === 'light' || data.default_theme === 'dark')) {
          const newDefault = data.default_theme;
          setSiteDefaultTheme(newDefault);
          try {
            localStorage.setItem('site_default_theme', newDefault);
          } catch {}
          // If visitor has NOT set a manual preference, follow the site default
          if (!hasUserOverride) {
            setTheme(newDefault);
          }
        }
      })
      .catch(() => {});
  }, [hasUserOverride]);

  // Sync state across browser tabs
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'diary-theme' || e.key === 'theme') {
        if (e.newValue === 'light' || e.newValue === 'dark') {
          setHasUserOverride(true);
          setTheme(e.newValue);
        }
      } else if (e.key === 'site_default_theme') {
        if (e.newValue === 'light' || e.newValue === 'dark') {
          setSiteDefaultTheme(e.newValue);
          if (!hasUserOverride) {
            setTheme(e.newValue);
          }
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [hasUserOverride]);

  // Apply dark class to document root
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      if (document.body) document.body.classList.add('dark');
    } else {
      root.classList.remove('dark');
      if (document.body) document.body.classList.remove('dark');
    }
  }, [theme]);

  // When a user toggles the button on the main website
  const toggleTheme = () => {
    setHasUserOverride(true);
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('theme_user_override', 'true');
        localStorage.setItem('diary-theme', next);
        localStorage.setItem('theme', next);
      } catch {}
      return next;
    });
  };

  // When the admin updates the site default theme in AboutEdit
  const updateSiteDefaultTheme = (newDefault) => {
    if (newDefault !== 'light' && newDefault !== 'dark') return;
    setSiteDefaultTheme(newDefault);
    setTheme(newDefault);
    try {
      localStorage.setItem('site_default_theme', newDefault);
      localStorage.setItem('theme_user_override', 'true');
      localStorage.setItem('diary-theme', newDefault);
      localStorage.setItem('theme', newDefault);
    } catch {}
  };

  return (
    <ThemeContext.Provider value={{
      theme,
      toggleTheme,
      setTheme,
      siteDefaultTheme,
      updateSiteDefaultTheme,
      hasUserOverride
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
