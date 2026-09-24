import React, { createContext, useContext, useEffect, useState } from 'react';

const TypewriterContext = createContext({
  typewriterEnabled: false,
  toggleTypewriter: () => {},
  setTypewriterEnabled: () => {}
});

export function TypewriterProvider({ children }) {
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

  const [hasUserPreference, setHasUserPreference] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage && localStorage.getItem('typewriter-enabled') !== null;
    } catch (_e) {
      return false;
    }
  });

  useEffect(() => {
    // If visitor has no explicit choice in localStorage, sync with site default preference
    if (!hasUserPreference) {
      fetch('/api/about')
        .then(res => res.json())
        .then(data => {
          if (data && typeof data.default_typewriter_enabled === 'boolean') {
            setTypewriterEnabled(data.default_typewriter_enabled);
          }
        })
        .catch(() => {});
    }
  }, [hasUserPreference]);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage && hasUserPreference) {
        localStorage.setItem('typewriter-enabled', String(typewriterEnabled));
      }
    } catch (_e) {}
  }, [typewriterEnabled, hasUserPreference]);

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

  return (
    <TypewriterContext.Provider value={{ typewriterEnabled, toggleTypewriter, setTypewriterEnabled }}>
      {children}
    </TypewriterContext.Provider>
  );
}

export function useTypewriter() {
  return useContext(TypewriterContext);
}
