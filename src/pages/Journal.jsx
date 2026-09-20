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

export default function Journal() {
  const cached = getCachedFeed('journal');
  const [entries, setEntries] = useState(() => {
    if (!Array.isArray(cached)) return [];
    return cached.filter(item => 
      item.type !== 'photo' && 
      (!item.category || item.category.toLowerCase() !== 'photos')
    );
  });
  const [loading, setLoading] = useState(() => !cached || cached.length === 0);

  useEffect(() => {
    let isMounted = true;
    const loadJournalEntries = async () => {
      const data = await fetchPublishedEntries({ type: 'journal' });
      if (isMounted) {
        const journalOnly = (Array.isArray(data) ? data : []).filter(item => 
          item.type !== 'photo' && 
          (!item.category || item.category.toLowerCase() !== 'photos')
        );
        setEntries(journalOnly);
        setLoading(false);
      }
    };

    loadJournalEntries();
    const unsubscribe = subscribeToEntries(() => {
      loadJournalEntries();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="notebook-container">
      <header className="mb-4 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-serif font-medium tracking-tight mb-1">Journal</h1>
        <p className="hidden sm:block text-xs sm:text-sm font-sans text-[var(--text-secondary)]">
          Personal thoughts, daily notebook entries, and life logs.
        </p>
      </header>

      {loading ? (
        <div className="py-8 text-center text-xs font-sans text-[var(--text-muted)] italic">
          Loading journal entries...
        </div>
      ) : entries.length === 0 ? (
        <div className="py-8 text-center text-xs font-sans text-[var(--text-muted)]">
          No journal entries published yet.
        </div>
      ) : (
        <div>
          {entries.map((item, idx) => {
            const itemDate = formatShortDate(item.date);
            const prevItem = entries[idx - 1];
            const nextItem = entries[idx + 1];
            const prevDate = prevItem ? formatShortDate(prevItem.date) : null;
            const nextDate = nextItem ? formatShortDate(nextItem.date) : null;

            const isGrouped = (prevDate === itemDate || nextDate === itemDate);
            const isFirstInGroup = isGrouped && (prevDate !== itemDate);
            const categoryLabel = (item.category || 'JOURNAL').toUpperCase();
            const readTimeText = calcReadingTimeText(item.content);

            return (
              <React.Fragment key={item.id || idx}>
                {isFirstInGroup && (
                  <div className="text-xs font-sans font-medium text-[var(--text-muted)] tracking-widest uppercase pt-4 pb-1 mb-1 border-b border-[var(--border-subtle)]/50">
                    {itemDate}
                  </div>
                )}

                <article className="py-3 sm:py-4 border-b border-[var(--border-subtle)] last:border-0 group">
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

                  <h2 className="text-base sm:text-lg font-serif font-medium tracking-tight mb-1 text-[var(--text-primary)] leading-snug">
                    <Link
                      to={`/entry/${item.slug}`}
                      className="hover:underline underline-offset-4 decoration-[var(--border-subtle)] transition-all"
                    >
                      {item.title}
                    </Link>
                  </h2>

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
