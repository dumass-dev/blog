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
        return localStorage.getItem('typewriter-enabled') === 'true';
      }
    } catch (_e) {}
    return false;
  });

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('typewriter-enabled', String(typewriterEnabled));
      }
    } catch (_e) {}
  }, [typewriterEnabled]);

  const toggleTypewriter = () => {
    setTypewriterEnabled(prev => !prev);
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
