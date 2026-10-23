import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { publishRealtimeUpdate } from '../utils/realtime';
import { fetchSiteSettings } from '../utils/siteSettings';
import { supabase } from '../supabase';

const ViewCountContext = createContext({
  showViewCount: true,
  toggleViewCount: () => {},
  setShowViewCount: () => {},
  updateSiteDefault: () => {}
});

export function ViewCountProvider({ children }) {
  const { isAdmin, token } = useAuth();
  const [showViewCount, setShowViewCount] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        if (typeof window.__SITE_SHOW_VIEWS__ === 'boolean') {
          return window.__SITE_SHOW_VIEWS__;
        }
        const injectedAttr = document.documentElement.getAttribute('data-show-views-injected');
        if (injectedAttr === 'false') return false;
        if (injectedAttr === 'true') return true;
        const cached = localStorage.getItem('site_show_views');
        if (cached === 'false') return false;
        if (cached === 'true') return true;
      }
    } catch (_e) {}
    return true;
  });

  // Fetch initial site view count visibility from the shared settings store
  useEffect(() => {
    fetchSiteSettings()
      .then(data => {
        if (data && typeof data.show_view_count === 'boolean') {
          setShowViewCount(data.show_view_count);
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              localStorage.setItem('site_show_views', String(data.show_view_count));
            }
          } catch (_e) {}
        }
      })
      .catch(() => {});
  }, []);

  // Listen to realtime site updates
  useEffect(() => {
    const handleAboutUpdate = (e) => {
      const data = e.detail?.data || e.detail?.payload || e.detail;
      if (data && typeof data.show_view_count === 'boolean') {
        setShowViewCount(data.show_view_count);
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('site_show_views', String(data.show_view_count));
          }
        } catch (_e) {}
      }
    };

    window.addEventListener('about-data-updated', handleAboutUpdate);
    window.addEventListener('site-settings-updated', handleAboutUpdate);
    return () => {
      window.removeEventListener('about-data-updated', handleAboutUpdate);
      window.removeEventListener('site-settings-updated', handleAboutUpdate);
    };
  }, []);

  const toggleViewCount = async () => {
    if (!isAdmin) return;
    const nextVal = !showViewCount;
    setShowViewCount(nextVal);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('site_show_views', String(nextVal));
      }
    } catch (_e) {}

    try {
      publishRealtimeUpdate({
        type: 'about',
        op: 'UPDATE',
        data: { show_view_count: nextVal }
      });

      // Direct write to Supabase for instant persistence without clobbering other settings
      if (supabase && typeof supabase.from === 'function') {
        supabase.from('realtime_sync').select('payload').eq('id', 'site_settings').maybeSingle().then(({ data }) => {
          const current = data?.payload || {};
          supabase.from('realtime_sync').upsert({
            id: 'site_settings',
            version: Date.now(),
            event: 'site_settings_updated',
            payload: {
              ...current,
              show_view_count: nextVal
            },
            updated_at: new Date().toISOString()
          }).then(() => {}).catch(() => {});
        }).catch(() => {});
      }

      if (token) {
        await fetch('/api/about', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ show_view_count: nextVal })
        });
      }
    } catch (_err) {}
  };

  const updateSiteDefault = (newDefault) => {
    setShowViewCount(Boolean(newDefault));
  };

  return (
    <ViewCountContext.Provider value={{
      showViewCount,
      toggleViewCount,
      setShowViewCount,
      updateSiteDefault
    }}>
      {children}
    </ViewCountContext.Provider>
  );
}

export function useViewCount() {
  return useContext(ViewCountContext);
}
