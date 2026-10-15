import React, { createContext, useContext, useEffect, useState } from 'react';

const ViewCountContext = createContext({
  showViewCount: true,
  toggleViewCount: () => {},
  setShowViewCount: () => {},
  siteDefaultShowViews: true,
  updateSiteDefault: () => {}
});

export function ViewCountProvider({ children }) {
  const [hasUserPreference, setHasUserPreference] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage && localStorage.getItem('show_view_count') !== null;
    } catch (_e) {
      return false;
    }
  });

  const [siteDefaultShowViews, setSiteDefaultShowViews] = useState(true);

  const [showViewCount, setShowViewCount] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem('show_view_count');
        if (saved !== null) {
          return saved === 'true';
        }
      }
    } catch (_e) {}
    return true;
  });

  // Fetch initial site default preference from /api/about
  useEffect(() => {
    fetch('/api/about')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.show_view_count === 'boolean') {
          setSiteDefaultShowViews(data.show_view_count);
          if (!hasUserPreference) {
            setShowViewCount(data.show_view_count);
          }
        }
      })
      .catch(() => {});
  }, [hasUserPreference]);

  // Sync state across tabs and handle realtime updates
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'show_view_count') {
        if (e.newValue !== null) {
          setHasUserPreference(true);
          setShowViewCount(e.newValue === 'true');
        } else {
          setHasUserPreference(false);
          setShowViewCount(siteDefaultShowViews);
        }
      }
    };

    const handleAboutUpdate = (e) => {
      const data = e.detail?.data || e.detail?.payload || e.detail;
      if (data && typeof data.show_view_count === 'boolean') {
        setSiteDefaultShowViews(data.show_view_count);
        if (!hasUserPreference) {
          setShowViewCount(data.show_view_count);
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('about-data-updated', handleAboutUpdate);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('about-data-updated', handleAboutUpdate);
    };
  }, [siteDefaultShowViews, hasUserPreference]);

  const toggleViewCount = () => {
    setHasUserPreference(true);
    setShowViewCount(prev => {
      const next = !prev;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('show_view_count', String(next));
        }
      } catch (_e) {}
      return next;
    });
  };

  const updateSiteDefault = (newDefault) => {
    const boolDefault = Boolean(newDefault);
    setSiteDefaultShowViews(boolDefault);
    setShowViewCount(boolDefault);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('show_view_count', String(boolDefault));
        setHasUserPreference(true);
      }
    } catch (_e) {}
  };

  return (
    <ViewCountContext.Provider value={{
      showViewCount,
      toggleViewCount,
      setShowViewCount,
      siteDefaultShowViews,
      updateSiteDefault
    }}>
      {children}
    </ViewCountContext.Provider>
  );
}

export function useViewCount() {
  return useContext(ViewCountContext);
}
