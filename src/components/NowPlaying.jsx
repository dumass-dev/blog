import React, { useState, useEffect } from 'react';
import { safeApiFetch } from '../supabase';
import { Music } from 'lucide-react';

export default function NowPlaying({ forceShow = false }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let interval;
    const fetchNowPlaying = async () => {
      try {
        const response = await safeApiFetch('/api/now-playing');
        const json = await response.json();
        if (json.playing) {
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
    <div className="inline-flex items-center gap-3 p-1.5 pr-4 rounded-full bg-[var(--card-bg)]/80 backdrop-blur border border-[var(--border-subtle)] shadow-sm animate-content-fade">
      <div className="shrink-0 relative w-8 h-8 rounded-full overflow-hidden bg-black/5 dark:bg-white/5 flex items-center justify-center">
        {displayData.coverUrl ? (
          <img src={displayData.coverUrl} alt="Album Art" className="w-full h-full object-cover" />
        ) : (
          <Music className="w-4 h-4 opacity-40" />
        )}
      </div>
      <div className="flex flex-col justify-center min-w-0 max-w-[150px]">
        <div className="text-sm font-medium truncate leading-tight" title={displayData.title}>
          {displayData.title}
        </div>
        <div className="text-[10px] font-sans text-[var(--text-secondary)] truncate leading-tight mt-0.5" title={displayData.artist}>
          {displayData.artist} {displayData.album ? `• ${displayData.album}` : ''}
        </div>
      </div>
    </div>
  );
}
