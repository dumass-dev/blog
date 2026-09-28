import React, { useState, useEffect } from 'react';
import { safeApiFetch } from '../supabase';
import { Music, PauseCircle, PlayCircle } from 'lucide-react';

export default function NowPlaying() {
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

  if (!data) return null;

  return (
    <div className="flex items-center gap-3 p-3 rounded bg-[var(--card-bg)] border border-[var(--border-subtle)] max-w-sm mb-8 animate-content-fade">
      <div className="shrink-0 relative w-12 h-12 rounded overflow-hidden bg-black/5 dark:bg-white/5">
        {data.coverUrl ? (
          <img src={data.coverUrl} alt="Album Art" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-5 h-5 opacity-40" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {data.isPaused ? (
            <PauseCircle className="w-3.5 h-3.5 opacity-60 shrink-0" />
          ) : (
            <PlayCircle className="w-3.5 h-3.5 text-green-500 shrink-0 animate-pulse" />
          )}
          <span className="text-xs font-sans uppercase tracking-wider text-[var(--text-muted)] truncate">
            {data.isPaused ? 'Paused' : 'Now Playing'}
          </span>
        </div>
        <div className="text-sm font-medium truncate" title={data.title}>
          {data.title}
        </div>
        <div className="text-xs font-sans text-[var(--text-secondary)] truncate" title={data.artist}>
          {data.artist} {data.album ? `• ${data.album}` : ''}
        </div>
      </div>
    </div>
  );
}
