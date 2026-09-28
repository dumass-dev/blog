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

  if (!data) return null;
  if (!data.showOnHome && !forceShow) return null;

  return (
    <div className="inline-flex items-center gap-3 p-1.5 pr-4 rounded-full bg-[var(--card-bg)]/80 backdrop-blur border border-[var(--border-subtle)] shadow-sm animate-content-fade">
      <div className="shrink-0 relative w-8 h-8 rounded-full overflow-hidden bg-black/5 dark:bg-white/5">
        {data.coverUrl ? (
          <img src={data.coverUrl} alt="Album Art" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-4 h-4 opacity-40" />
          </div>
        )}
      </div>
      <div className="flex flex-col justify-center min-w-0 max-w-[200px]">
        <div className="text-sm font-medium truncate leading-tight" title={data.title}>
          {data.title}
        </div>
        <div className="text-xs font-sans text-[var(--text-secondary)] truncate leading-tight mt-0.5" title={data.artist}>
          {data.artist} {data.album ? `• ${data.album}` : ''}
        </div>
      </div>
    </div>
  );
}
