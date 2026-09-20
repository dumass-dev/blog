import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Cloud, Smile, Lock } from 'lucide-react';
import { fetchPublishedEntries, getCachedFeed, subscribeToEntries } from '../supabase';
import { stripMarkdown } from '../utils/excerpt';

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = d.getDate();
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function calcReadingTimeText(text) {
  if (!text) return null;
  const words = text.trim().split(/\s+/).length;
  const mins = Math.ceil(words / 200);
  return mins >= 3 ? `${mins} min read` : null;
}

function getPhotoSrc(item) {
  if (!item) return null;
  if (item.cover_image && item.cover_image.trim()) return item.cover_image;
  if (!item.content) return null;
  const imgMatch = item.content.match(/!\[.*?\]\((.*?)\)/) || item.content.match(/https?:\/\/[^\s\)\"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[a-f0-9\-]+\.[a-z0-9]+[^\s\)\"]*/i);
  if (imgMatch) return imgMatch[1] || imgMatch[0];
  return null;
}

export default function Home() {
  const cached = getCachedFeed('home');
  const [entries, setEntries] = useState(() => (Array.isArray(cached) ? cached.filter(item => item.show_in_feed !== false) : []));
  const [loading, setLoading] = useState(() => !cached || cached.length === 0);

  useEffect(() => {
    let isMounted = true;
    const loadHomeEntries = async () => {
      const data = await fetchPublishedEntries({ limit: 15, forHomeFeed: true });
      if (isMounted) {
        const feed = (Array.isArray(data) ? data : []).filter(item => item.show_in_feed !== false);
        setEntries(feed);
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
          A stream of essays, notes, thoughts, photos, and recent updates.
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
          {entries.map((item, idx) => {
            const itemDate = formatShortDate(item.date);
            const prevItem = entries[idx - 1];
            const nextItem = entries[idx + 1];
            const prevDate = prevItem ? formatShortDate(prevItem.date) : null;
            const nextDate = nextItem ? formatShortDate(nextItem.date) : null;

            const isGrouped = (prevDate === itemDate || nextDate === itemDate);
            const isFirstInGroup = isGrouped && (prevDate !== itemDate);

            const isPhoto = Boolean(
              item.type === 'photo' ||
              (item.category && item.category.toLowerCase() === 'photos')
            );
            const effectiveType = isPhoto ? 'photo' : item.type;
            const categoryLabel = (item.category || effectiveType || 'journal').toUpperCase();
            const readTimeText = calcReadingTimeText(item.content);
            const photoSrc = isPhoto || item.cover_image ? getPhotoSrc(item) : null;
            const isLockedPasscode = item.has_passcode && item.content && item.content.includes('🔒');

            return (
              <React.Fragment key={item.id || idx}>
                {/* Date Header for grouped date entries */}
                {isFirstInGroup && (
                  <div className="text-xs font-sans font-medium text-[var(--text-muted)] tracking-wider uppercase pt-2 pb-1 mb-2 border-b border-[var(--border-subtle)]/50">
                    {itemDate}
                  </div>
                )}

                <article className="group pb-8 sm:pb-10 border-b border-[var(--border-subtle)]/70 last:border-0">
                  {/* Simplified Meta Line: JOURNAL · 20 Sep 2026 (or JOURNAL if in date group) */}
                  <div className="text-xs font-sans text-[var(--text-muted)] tracking-wider uppercase mb-2 flex flex-wrap items-center gap-1.5">
                    <span>{categoryLabel}</span>
                    {!isGrouped && itemDate && (
                      <>
                        <span>·</span>
                        <span>{itemDate}</span>
                      </>
                    )}
                    {readTimeText && (
                      <>
                        <span>·</span>
                        <span>{readTimeText}</span>
                      </>
                    )}
                    {item.has_passcode && (
                      <>
                        <span>·</span>
                        <span className="text-[10px] text-[var(--text-primary)] font-medium">PROTECTED</span>
                      </>
                    )}
                  </div>

                  {/* Title if present */}
                  {effectiveType !== 'update' ? (
                    <h2 className="text-xl sm:text-2xl font-serif font-medium tracking-tight mb-2">
                      <Link
                        to={effectiveType === 'photo' ? '/photos' : `/entry/${item.slug}`}
                        className="hover:text-[var(--accent-warm)] transition-colors text-[var(--text-primary)]"
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

                  {/* Photo Thumbnail Preview for Photo entries */}
                  {effectiveType === 'photo' && photoSrc && !isLockedPasscode && (
                    <div className="my-3.5 rounded-lg overflow-hidden border border-[var(--border-subtle)] max-w-md bg-black/5">
                      <Link to="/photos">
                        <img
                          src={photoSrc}
                          alt={item.title || 'Photo'}
                          className="w-full h-auto max-h-80 object-cover group-hover:opacity-95 transition-opacity"
                          loading="lazy"
                        />
                      </Link>
                    </div>
                  )}

                  {/* Preview Content / Excerpt - Smaller than currently, muted gray, clamped to 2 lines */}
                  <div className="text-[var(--text-secondary)] font-serif leading-relaxed italic text-sm sm:text-base opacity-90 line-clamp-2">
                    {stripMarkdown(item.excerpt || (item.content.length > 220 ? item.content.substring(0, 220) + '...' : item.content))}
                  </div>

                  {/* Action Link */}
                  {effectiveType === 'photo' ? (
                    <div className="mt-3.5">
                      <Link
                        to="/photos"
                        className="text-xs font-sans tracking-wider text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] uppercase underline decoration-[var(--border-subtle)] underline-offset-4 transition-colors inline-flex items-center gap-1"
                      >
                        <span>View photo</span>
                        <span>→</span>
                      </Link>
                    </div>
                  ) : effectiveType !== 'update' ? (
                    <div className="mt-3.5">
                      <Link
                        to={`/entry/${item.slug}`}
                        className="text-xs font-sans tracking-wider text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] uppercase underline decoration-[var(--border-subtle)] underline-offset-4 transition-colors inline-flex items-center gap-1"
                      >
                        <span>Read entry</span>
                        <span>→</span>
                      </Link>
                    </div>
                  ) : null}
                </article>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
