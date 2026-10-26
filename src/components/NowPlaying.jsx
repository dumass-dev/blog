import React, { useState, useEffect, useRef } from 'react';
import { safeApiFetch } from '../supabase';
import { fetchSiteSettings } from '../utils/siteSettings';
import { Music } from 'lucide-react';

export default function NowPlaying({ forceShow = false, expandable = false, defaultExpanded = true }) {
  const [data, setData] = useState(null);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [authorName, setAuthorName] = useState(() => {
    try {
      const stored = localStorage.getItem('site_author_name');
      if (stored && stored.trim()) return stored.trim();
      const cached = localStorage.getItem('cached_about_data');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.author_name && parsed.author_name.trim()) return parsed.author_name.trim();
      }
    } catch {}
    return 'q04ti';
  });
  const [imgError, setImgError] = useState(false);
  // Last time a poll actually returned a track, and last time a poll ran
  // at all. The card deliberately keeps the last known track when polls
  // fail — but after several missed polls the "currently listening to"
  // claim goes stale, so the header wording says so.
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [lastPollAt, setLastPollAt] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    fetchSiteSettings()
      .then(info => {
        if (info && info.author_name && info.author_name.trim()) setAuthorName(info.author_name.trim());
      })
      .catch(() => {});

    const handleAuthorUpdate = (e) => {
      const name = e.detail?.data?.author_name || e.detail?.payload?.author_name || e.detail?.author_name;
      if (name && name.trim()) {
        setAuthorName(name.trim());
      }
    };

    window.addEventListener('about-data-updated', handleAuthorUpdate);
    window.addEventListener('site-settings-updated', handleAuthorUpdate);
    return () => {
      window.removeEventListener('about-data-updated', handleAuthorUpdate);
      window.removeEventListener('site-settings-updated', handleAuthorUpdate);
    };
  }, []);

  useEffect(() => {
    let interval;
    const fetchNowPlaying = async () => {
      try {
        const json = await safeApiFetch(`/api/now-playing?t=${Date.now()}`);
        if (json) {
          setData(json);
          setImgError(false);
          setLastUpdatedAt(Date.now());
        }
        // A failed/slow poll (safeApiFetch returns null on timeouts and
        // server errors) must not blank the card: keep the last known track
        // until a poll actually succeeds. Blanking here is what made the
        // card "hide by itself" whenever the backend hiccuped.
      } catch (_err) {
        // silently fail
      } finally {
        setLastPollAt(Date.now());
      }

    };

    fetchNowPlaying();
    interval = setInterval(fetchNowPlaying, 15000); // refresh every 15s

    const handleRealtimeUpdate = () => {
      fetchNowPlaying();
    };

    window.addEventListener('now-playing-updated', handleRealtimeUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('now-playing-updated', handleRealtimeUpdate);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (expandable && isExpanded && containerRef.current && !containerRef.current.contains(e.target)) {
        setIsExpanded(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    }
  }, [expandable, isExpanded]);

  if (!data && !forceShow) return null;
  if (data && !data.showOnHome && !forceShow) return null;

  const displayData = data && data.title ? data : {
    ...data,
    title: 'Nothing playing',
    artist: 'Silence',
    coverUrl: null
  };

  // Stale once three 15s polls in a row brought nothing new: the track
  // on screen is a kept last-known one, not a live "currently listening".
  const isStale = Boolean(
    data && data.title && !displayData.isPaused &&
    lastUpdatedAt && lastPollAt && (lastPollAt - lastUpdatedAt > 45000)
  );

  // If we are in the pill view (burger menu) and music is paused/offline, hide it completely!
  if (!expandable && displayData.isPaused) {
    return null;
  }

  if (expandable) {
    return (
      <div className={`relative animate-content-fade ${isExpanded ? 'z-50' : ''}`} ref={containerRef}>
        {!isExpanded ? (
          <div 
            className="now-playing-compact"
            onClick={() => setIsExpanded(true)}
            title={displayData.isPaused || isStale ? `Last listened to ${displayData.title}` : `Listening to ${displayData.title}`}
          >
            {displayData.coverUrl && !imgError ? (
              <img 
                src={displayData.coverUrl} 
                alt="Album Art" 
                className="w-full h-full object-cover block"
                onError={() => setImgError(true)}
              />
            ) : (
              <Music className="now-playing-fallback-icon" />
            )}
          </div>
        ) : (
          <div className="now-playing-card">
            <div className="now-playing-card-header">
              {authorName} {displayData.isPaused ? 'last listened to' : isStale ? 'was listening to' : 'is currently listening to'}
            </div>
            <div className="now-playing-card-body">
              <div className="now-playing-card-cover">
                {displayData.coverUrl && !imgError ? (
                  <img 
                    src={displayData.coverUrl} 
                    alt="Album Art"
                    onError={() => setImgError(true)} 
                  />
                ) : (
                  <Music className="now-playing-fallback-icon" />
                )}
              </div>
              <div className="now-playing-card-info">
                <div className="now-playing-card-title" title={displayData.title}>{displayData.title}</div>
                <div className="now-playing-card-artist" title={displayData.artist}>
                  {displayData.artist} {displayData.album ? `• ${displayData.album}` : ''}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Default pill style for non-expandable places (like hamburger menu)
  return (
    <div className="now-playing-pill animate-content-fade" title={displayData.title}>
      <div className="now-playing-cover">
        {displayData.coverUrl && !imgError ? (
          <img 
            src={displayData.coverUrl} 
            alt="Album Art"
            onError={() => setImgError(true)} 
          />
        ) : (
          <Music className="now-playing-fallback-icon" />
        )}
      </div>
      <div className="now-playing-info">
        <div className="now-playing-title">{displayData.title}</div>
        <div className="now-playing-artist" title={displayData.artist}>
          {displayData.artist} {displayData.album ? `• ${displayData.album}` : ''}
        </div>
      </div>
    </div>
  );
}
