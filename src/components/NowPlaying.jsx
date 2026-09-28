import React, { useState, useEffect } from 'react';
import { safeApiFetch } from '../supabase';
import { Music } from 'lucide-react';

export default function NowPlaying({ forceShow = false }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let interval;
    const fetchNowPlaying = async () => {
      try {
        const json = await safeApiFetch('/api/now-playing');
        if (json && json.playing) {
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

    return () => clearInterval(interval);
  }, []);

  if (!data && !forceShow) return null;
  if (data && !data.showOnHome && !forceShow) return null;

  const displayData = data || {
    title: 'Nothing playing',
    artist: 'Silence',
    coverUrl: null
  };

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
