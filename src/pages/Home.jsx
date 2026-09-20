import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, MapPin, Cloud, Smile, Lock } from 'lucide-react';
import { fetchPublishedEntries, subscribeToEntries } from '../supabase';
import { stripMarkdown } from '../utils/excerpt';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function calcReadingTime(text) {
  if (!text) return '1 min read';
  const words = text.trim().split(/\s+/).length;
  const mins = Math.ceil(words / 200);
  return `${mins} min read`;
}

export default function Home() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadHomeEntries = async () => {
      const data = await fetchPublishedEntries({ limit: 15 });
      if (isMounted) {
        setEntries(Array.isArray(data) ? data : []);
        setLoading(false);
      }
    };

    loadHomeEntries();
    const unsubscribe = subscribeToEntries(() => {
      loadHomeEntries();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="notebook-container">

      <header className="mb-12">
        <h1 className="text-3xl font-serif font-medium tracking-tight mb-2 text-[var(--text-primary)]">
          Chronological Feed
        </h1>
        <p className="text-sm font-sans text-[var(--text-secondary)]">
          A stream of essays, notes, thoughts, and recent updates.
        </p>
      </header>

      {loading ? (
        <div className="py-12 text-center text-sm font-sans text-[var(--text-muted)] italic">
          Loading entries...
        </div>
      ) : entries.length === 0 ? (
        <div className="py-12 text-center text-sm font-sans text-[var(--text-muted)]">
          No published entries yet.
        </div>
      ) : (
        <div className="space-y-8 sm:space-y-12">
          {entries.map((item) => (
            <article key={item.id} className="group pb-8 sm:pb-10 border-b border-[var(--border-subtle)]/70 last:border-0">
              {/* Date Marker & Reading Time */}
              <div className="text-xs sm:text-sm font-sans text-[var(--text-muted)] tracking-wide mb-2 flex flex-wrap items-center gap-2.5">
                <time dateTime={item.date}>{formatDate(item.date)}</time>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--code-bg)] font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                  {item.type}
                </span>

                {item.type !== 'update' && (
                  <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                    <Clock className="w-3 h-3 opacity-60" />
                    <span>{calcReadingTime(item.content)}</span>
                  </span>
                )}

                {item.has_passcode && (
                  <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-[var(--code-bg)] text-[var(--text-primary)] border border-[var(--border-subtle)] flex items-center gap-1 font-medium">
                    <Lock className="w-2.5 h-2.5" />
                    <span>Protected</span>
                  </span>
                )}
              </div>

              {/* Title if present */}
              {item.type !== 'update' ? (
                <h2 className="text-xl sm:text-2xl font-serif font-medium tracking-tight mb-2">
                  <Link
                    to={`/entry/${item.slug}`}
                    className="hover:text-[var(--accent-warm)] transition-colors"
                  >
                    {item.title}
                  </Link>
                </h2>
              ) : null}

              {/* Context Badges (Location, Weather, Mood) */}
              {(item.location || item.weather || item.mood) && (
                <div className="flex flex-wrap gap-3 text-xs font-sans text-[var(--text-secondary)] mb-3 italic">
                  {item.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[var(--accent-warm)] opacity-80" />
                      <span>{item.location}</span>
                    </span>
                  )}
                  {item.weather && (
                    <span className="flex items-center gap-1">
                      <Cloud className="w-3 h-3 text-[var(--accent-warm)] opacity-80" />
                      <span>{item.weather}</span>
                    </span>
                  )}
                  {item.mood && (
                    <span className="flex items-center gap-1">
                      <Smile className="w-3 h-3 text-[var(--accent-warm)] opacity-80" />
                      <span>{item.mood}</span>
                    </span>
                  )}
                </div>
              )}

              {/* Preview Content / Excerpt */}
              <div className="text-[var(--text-primary)] font-serif leading-relaxed italic text-base sm:text-lg opacity-90">
                {stripMarkdown(item.excerpt || (item.content.length > 220 ? item.content.substring(0, 220) + '...' : item.content))}
              </div>

              {item.type !== 'update' && (
                <div className="mt-3.5">
                  <Link
                    to={`/entry/${item.slug}`}
                    className="text-xs font-sans tracking-wider text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] uppercase underline decoration-[var(--border-subtle)] underline-offset-4 transition-colors inline-flex items-center gap-1"
                  >
                    <span>Read entry</span>
                    <span>→</span>
                  </Link>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
