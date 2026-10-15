import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { publishRealtimeUpdate } from '../utils/realtime';
import { supabase } from '../supabase';

const ViewCountContext = createContext({
  showViewCount: true,
  toggleViewCount: () => {},
  setShowViewCount: () => {},
  updateSiteDefault: () => {}
});

export function ViewCountProvider({ children }) {
  const { isAdmin, token } = useAuth();
  const [showViewCount, setShowViewCount] = useState(true);

  // Fetch initial site view count visibility from /api/about
  useEffect(() => {
    fetch('/api/about')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.show_view_count === 'boolean') {
          setShowViewCount(data.show_view_count);
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
      }
    };

    window.addEventListener('about-data-updated', handleAboutUpdate);
    return () => {
      window.removeEventListener('about-data-updated', handleAboutUpdate);
    };
  }, []);

  const toggleViewCount = async () => {
    if (!isAdmin) return;
    const nextVal = !showViewCount;
    setShowViewCount(nextVal);

    try {
      publishRealtimeUpdate({
        type: 'about',
        op: 'UPDATE',
        data: { show_view_count: nextVal }
      });

      // Direct write to Supabase for instant persistence
      if (supabase && typeof supabase.from === 'function') {
        supabase.from('realtime_sync').upsert({
          id: 'site_settings',
          version: Date.now(),
          event: 'site_settings_updated',
          payload: {
            show_view_count: nextVal
          },
          updated_at: new Date().toISOString()
        }).then(() => {}).catch(() => {});
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
