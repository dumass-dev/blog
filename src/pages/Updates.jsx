import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPublishedEntries, subscribeToEntries } from '../supabase';

function formatUpdateTimestamp(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();

  const isToday = d.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const timeStr = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  if (isToday) {
    return `Today · ${timeStr}`;
  } else if (isYesterday) {
    return `Yesterday · ${timeStr}`;
  } else {
    const dayMonth = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `${dayMonth} · ${timeStr}`;
  }
}

export default function Updates() {
  const cached = getCachedFeed('update');
  const [updates, setUpdates] = useState(() => (Array.isArray(cached) ? cached : []));
  const [loading, setLoading] = useState(() => !cached || cached.length === 0);

  useEffect(() => {
    let isMounted = true;
    const loadUpdates = async () => {
      const data = await fetchPublishedEntries({ type: 'update' });
      if (isMounted) {
        setUpdates(data);
        setLoading(false);
      }
    };

    loadUpdates();
    const unsubscribe = subscribeToEntries(() => {
      loadUpdates();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="notebook-container">
      <header className="mb-12">
        <h1 className="text-3xl font-serif font-medium tracking-tight mb-2">Updates</h1>
        <p className="text-sm font-sans text-[var(--text-secondary)]">
          Lightweight micro-stream of notes, moments, and daily thoughts.
        </p>
      </header>

      {loading ? (
        <div className="py-12 text-center text-sm font-sans text-[var(--text-muted)] italic">
          Loading updates...
        </div>
      ) : updates.length === 0 ? (
        <div className="py-12 text-center text-sm font-sans text-[var(--text-muted)]">
          No updates posted yet.
        </div>
      ) : (
        <div className="space-y-8 relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[1px] before:bg-[var(--border-subtle)] pl-6">
          {updates.map((item) => (
            <div key={item.id} className="relative group">
              {/* Bullet point on line */}
              <div className="absolute -left-[31px] top-1.5 w-2.5 h-2.5 rounded-full bg-[var(--bg-main)] border border-[var(--text-muted)] group-hover:border-[var(--accent-warm)] transition-colors" />

              {/* Timestamp */}
              <div className="text-xs font-sans font-medium text-[var(--text-secondary)] tracking-wide mb-1">
                {formatUpdateTimestamp(item.date)}
              </div>

              {/* Content blockquote / text */}
              <blockquote className="font-serif text-lg text-[var(--text-primary)] leading-relaxed italic border-l-0 pl-0 my-0">
                "{item.content}"
              </blockquote>

              <div className="mt-1">
                <Link
                  to={`/entry/${item.slug}`}
                  className="text-[11px] font-sans text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Permalink →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
