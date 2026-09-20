import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
      const data = await fetchPublishedEntries({ limit: 25, forHomeFeed: true });
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
      {/* Feed Page Header */}
      <header className="mb-4 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-serif font-medium tracking-tight mb-1 text-[var(--text-primary)]">
          Chronological Feed
        </h1>
        <p className="hidden sm:block text-xs sm:text-sm font-sans text-[var(--text-secondary)]">
          A stream of essays, notes, thoughts, photos, and recent updates.
        </p>
      </header>

      {loading ? (
        <div className="py-8 text-center text-xs font-sans text-[var(--text-muted)] italic">
          Loading entries...
        </div>
      ) : entries.length === 0 ? (
        <div className="py-8 text-center text-xs font-sans text-[var(--text-muted)]">
          No published entries yet.
        </div>
      ) : (
        <div>
          {entries.map((item, idx) => {
            const itemDate = formatShortDate(item.date);
            const prevItem = entries[idx - 1];
            const nextItem = entries[idx + 1];
            const prevDate = prevItem ? formatShortDate(prevItem.date) : null;
            const nextDate = nextItem ? formatShortDate(nextItem.date) : null;

            // Grouping logic: if consecutive entries share a date, display date header once above the group
            const isGrouped = (prevDate === itemDate || nextDate === itemDate);
            const isFirstInGroup = isGrouped && (prevDate !== itemDate);

            const isPhoto = Boolean(
              item.type === 'photo' ||
              (item.category && item.category.toLowerCase() === 'photos')
            );
            const effectiveType = isPhoto ? 'photo' : (item.type || 'journal');
            const categoryLabel = (item.category || effectiveType).toUpperCase();
            const readTimeText = calcReadingTimeText(item.content);
            const photoSrc = isPhoto || item.cover_image ? getPhotoSrc(item) : null;

            return (
              <React.Fragment key={item.id || idx}>
                {/* Date Header for grouped date entries */}
                {isFirstInGroup && (
                  <div className="text-xs font-sans font-medium text-[var(--text-muted)] tracking-widest uppercase pt-4 pb-1 mb-1 border-b border-[var(--border-subtle)]/50">
                    {itemDate}
                  </div>
                )}

                <article className="py-3 sm:py-4 border-b border-[var(--border-subtle)] last:border-0 group">
                  {/* Simplified Meta Line: JOURNAL · 20 Sep 2026 (or JOURNAL if in date group) */}
                  <div className="text-[11px] font-sans text-[var(--text-muted)] tracking-wider uppercase mb-1 flex flex-wrap items-center gap-1.5 leading-none">
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

                  {/* Entry Title as Link */}
                  {effectiveType !== 'update' && item.title ? (
                    <h2 className="text-base sm:text-lg font-serif font-medium tracking-tight mb-1 text-[var(--text-primary)] leading-snug">
                      <Link
                        to={effectiveType === 'photo' ? '/photos' : `/entry/${item.slug}`}
                        className="hover:underline underline-offset-4 decoration-[var(--border-subtle)] transition-all"
                      >
                        {item.title}
                      </Link>
                    </h2>
                  ) : null}

                  {/* Optional Photo Preview */}
                  {effectiveType === 'photo' && photoSrc && !item.has_passcode && (
                    <div className="my-2 rounded overflow-hidden border border-[var(--border-subtle)] max-w-sm bg-black/5">
                      <Link to="/photos">
                        <img
                          src={photoSrc}
                          alt={item.title || 'Photo'}
                          className="w-full h-auto max-h-56 object-cover hover:opacity-95 transition-opacity"
                          loading="lazy"
                        />
                      </Link>
                    </div>
                  )}

                  {/* Excerpt: Regular weight, muted gray, clamped to 2 lines */}
                  {item.content && (
                    <p className="text-xs sm:text-sm font-sans text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                      {stripMarkdown(item.excerpt || item.content)}
                    </p>
                  )}
                </article>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
