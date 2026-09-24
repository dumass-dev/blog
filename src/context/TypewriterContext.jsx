import React, { createContext, useContext, useEffect, useState } from 'react';

const TypewriterContext = createContext({
  typewriterEnabled: false,
  toggleTypewriter: () => {},
  setTypewriterEnabled: () => {},
  siteDefaultEnabled: false,
  setSiteDefaultEnabled: () => {}
});

export function TypewriterProvider({ children }) {
  const [hasUserPreference, setHasUserPreference] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage && localStorage.getItem('typewriter-enabled') !== null;
    } catch (_e) {
      return false;
    }
  });

  const [siteDefaultEnabled, setSiteDefaultEnabled] = useState(false);

  const [typewriterEnabled, setTypewriterEnabled] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem('typewriter-enabled');
        if (saved !== null) {
          return saved === 'true';
        }
      }
    } catch (_e) {}
    return false;
  });

  // Fetch initial site default preference from /api/about
  useEffect(() => {
    fetch('/api/about')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.default_typewriter_enabled === 'boolean') {
          setSiteDefaultEnabled(data.default_typewriter_enabled);
          if (!hasUserPreference) {
            setTypewriterEnabled(data.default_typewriter_enabled);
          }
        }
      })
      .catch(() => {});
  }, [hasUserPreference]);

  // Sync state when typewriter-enabled or site default changes across tabs/windows
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'typewriter-enabled') {
        if (e.newValue !== null) {
          setHasUserPreference(true);
          setTypewriterEnabled(e.newValue === 'true');
        } else {
          setHasUserPreference(false);
          setTypewriterEnabled(siteDefaultEnabled);
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [siteDefaultEnabled]);

  const toggleTypewriter = () => {
    setHasUserPreference(true);
    setTypewriterEnabled(prev => {
      const next = !prev;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('typewriter-enabled', String(next));
        }
      } catch (_e) {}
      return next;
    });
  };

  const updateSiteDefault = (newDefault) => {
    setSiteDefaultEnabled(newDefault);
    // When admin updates site default, apply it immediately to live context
    setTypewriterEnabled(newDefault);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('typewriter-enabled', String(newDefault));
        setHasUserPreference(true);
      }
    } catch (_e) {}
  };

  return (
    <TypewriterContext.Provider value={{
      typewriterEnabled,
      toggleTypewriter,
      setTypewriterEnabled,
      siteDefaultEnabled,
      updateSiteDefault
    }}>
      {children}
    </TypewriterContext.Provider>
  );
}

export function useTypewriter() {
  return useContext(TypewriterContext);
}
