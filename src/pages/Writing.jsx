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

export default function Writing() {
  const cached = getCachedFeed('writing');
  const [entries, setEntries] = useState(() => (Array.isArray(cached) ? cached : []));
  const [loading, setLoading] = useState(() => !cached || cached.length === 0);

  useEffect(() => {
    let isMounted = true;
    const loadWritingEntries = async () => {
      const data = await fetchPublishedEntries({ type: 'writing' });
      if (isMounted) {
        setEntries(Array.isArray(data) ? data : []);
        setLoading(false);
      }
    };

    loadWritingEntries();
    const unsubscribe = subscribeToEntries(() => {
      loadWritingEntries();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="notebook-container">
      <header className="mb-12">
        <h1 className="text-3xl font-serif font-medium tracking-tight mb-2">Writing</h1>
        <p className="text-sm font-sans text-[var(--text-secondary)]">
          Essays, technical notes, software reflections, and long-form articles.
        </p>
      </header>

      {loading ? (
        <div className="py-12 text-center text-sm font-sans text-[var(--text-muted)] italic">
          Loading writing...
        </div>
      ) : entries.length === 0 ? (
        <div className="py-12 text-center text-sm font-sans text-[var(--text-muted)]">
          No writing published yet.
        </div>
      ) : (
        <div className="space-y-12">
          {entries.map((item, idx) => {
            const itemDate = formatShortDate(item.date);
            const prevItem = entries[idx - 1];
            const nextItem = entries[idx + 1];
            const prevDate = prevItem ? formatShortDate(prevItem.date) : null;
            const nextDate = nextItem ? formatShortDate(nextItem.date) : null;

            const isGrouped = (prevDate === itemDate || nextDate === itemDate);
            const isFirstInGroup = isGrouped && (prevDate !== itemDate);
            const categoryLabel = (item.category || 'WRITING').toUpperCase();
            const readTimeText = calcReadingTimeText(item.content);

            return (
              <React.Fragment key={item.id || idx}>
                {isFirstInGroup && (
                  <div className="text-xs font-sans font-medium text-[var(--text-muted)] tracking-wider uppercase pt-2 pb-1 mb-2 border-b border-[var(--border-subtle)]/50">
                    {itemDate}
                  </div>
                )}

                <article className="pb-10 border-b border-[var(--border-subtle)] last:border-0 group">
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

                  <h2 className="text-2xl font-serif font-medium tracking-tight mb-3">
                    <Link to={`/entry/${item.slug}`} className="hover:text-[var(--accent-warm)] transition-colors">
                      {item.title}
                    </Link>
                  </h2>

                  <p className="text-[var(--text-secondary)] font-serif text-sm sm:text-base leading-relaxed mb-4 italic opacity-90 line-clamp-2">
                    {stripMarkdown(item.excerpt || (item.content.length > 220 ? item.content.substring(0, 220) + '...' : item.content))}
                  </p>

                  <Link
                    to={`/entry/${item.slug}`}
                    className="text-xs font-sans tracking-wider text-[var(--text-primary)] uppercase underline underline-offset-4 decoration-[var(--border-subtle)] hover:decoration-[var(--accent-warm)] transition-colors"
                  >
                    Read essay →
                  </Link>
                </article>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
