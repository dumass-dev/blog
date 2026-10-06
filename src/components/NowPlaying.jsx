import React, { useState, useEffect, useRef } from 'react';
import { safeApiFetch } from '../supabase';
import { Music } from 'lucide-react';

export default function NowPlaying({ forceShow = false, expandable = false, defaultExpanded = true }) {
  const [data, setData] = useState(null);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [authorName, setAuthorName] = useState('q04ti');
  const containerRef = useRef(null);

  useEffect(() => {
    fetch('/api/about')
      .then(res => res.json())
      .then(info => {
        if (info && info.author_name) setAuthorName(info.author_name);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let interval;
    const fetchNowPlaying = async () => {
      try {
        const json = await safeApiFetch(`/api/now-playing?t=${Date.now()}`);
        if (json) {
          setData(json);
        } else {
          setData(null);
        }
      } catch (err) {
        // silently fail
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
            title={displayData.isPaused ? `Last listened to ${displayData.title}` : `Listening to ${displayData.title}`}
          >
            {displayData.coverUrl ? (
              <img src={displayData.coverUrl} alt="Album Art" className="w-full h-full object-cover block" />
            ) : (
              <Music className="now-playing-fallback-icon" />
            )}
          </div>
        ) : (
          <div className="now-playing-card">
            <div className="now-playing-card-header">
              {authorName} {displayData.isPaused ? 'last listened to' : 'is currently listening to'}
            </div>
            <div className="now-playing-card-body">
              <div className="now-playing-card-cover">
                {displayData.coverUrl ? (
                  <img src={displayData.coverUrl} alt="Album Art" />
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
        {displayData.coverUrl ? (
          <img src={displayData.coverUrl} alt="Album Art" />
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
