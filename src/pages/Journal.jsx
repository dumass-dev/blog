import React from 'react';
import { Link } from 'react-router-dom';
import { useFeedData } from '../hooks/useFeedData';
import { useEntryPrefetch } from '../hooks/useEntryPrefetch';
import useDocumentMeta from '../hooks/useDocumentMeta';
import FeedSkeleton from '../components/FeedSkeleton';
import TypewriterText from '../components/TypewriterText';
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
  useDocumentMeta({
    title: 'Journal',
    description: 'Personal thoughts, daily notebook entries, and life logs.'
  });

  const { displayedEntries, loading, error, stale, refreshing, entries, hasMore, loadMore, refetch } = useFeedData({
    type: 'journal',
    pageSize: 8
  });

  useEntryPrefetch(entries);

  return (
    <div className="notebook-container">
      <header className="mb-12">
        <TypewriterText
          text="Journal"
          as="h1"
          className="text-3xl font-serif font-medium tracking-tight mb-2"
        />
        <TypewriterText
          text="Personal thoughts, daily notebook entries, and life logs."
          as="p"
          className="text-sm font-sans text-[var(--text-secondary)]"
        />
      </header>

      {loading ? (
        <FeedSkeleton count={4} />
      ) : error ? (
        <div className="py-12 text-center">
          <p className="text-sm font-sans text-[var(--text-primary)]">Couldn&apos;t load the journal entries.</p>
          <p className="text-xs font-sans text-[var(--text-muted)] mt-1 mb-4">Check your connection and try again.</p>
          <button
            onClick={refetch}
            disabled={refreshing}
            className="quiet-button text-xs font-sans uppercase tracking-wider py-2.5 px-6 rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-all cursor-pointer"
          >
            {refreshing ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="py-12 text-center text-sm font-sans text-[var(--text-muted)]">
          No journal entries published yet.
        </div>
      ) : (
        <>
        {stale && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 text-xs font-sans text-[var(--text-muted)]">
            <span>Showing a saved copy — it may be out of date.</span>
            <button
              onClick={refetch}
              disabled={refreshing}
              className="underline hover:text-[var(--text-primary)] cursor-pointer"
            >
              {refreshing ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}
        <div className="space-y-12">
          {displayedEntries.map((item, idx) => {
            const itemDate = formatShortDate(item.date);
            const prevItem = displayedEntries[idx - 1];
            const nextItem = displayedEntries[idx + 1];
            const prevDate = prevItem ? formatShortDate(prevItem.date) : null;
            const nextDate = nextItem ? formatShortDate(nextItem.date) : null;

            const isGrouped = (prevDate === itemDate || nextDate === itemDate);
            const isFirstInGroup = isGrouped && (prevDate !== itemDate);
            const categoryLabel = (item.category || 'JOURNAL').toUpperCase();
            const readTimeText = calcReadingTimeText(item.excerpt || item.content);

            const staggerClass = `stagger-${Math.min(idx + 1, 6)}`;

            return (
              <React.Fragment key={item.id || idx}>
                {isFirstInGroup && (
                  <div className="text-xs font-sans font-medium text-[var(--text-muted)] tracking-wider uppercase pt-2 pb-1 mb-2 border-b border-[var(--border-subtle)]/50">
                    {itemDate}
                  </div>
                )}

                <article className={`pb-8 border-b border-[var(--border-subtle)] last:border-0 group animate-content-fade ${staggerClass}`}>
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

                  <h2 className="text-xl sm:text-2xl font-serif font-medium tracking-tight mb-2">
                    <Link to={`/entry/${item.slug || item.id}`} className="hover:text-[var(--accent-warm)] transition-colors">
                      <TypewriterText text={item.title} />
                    </Link>

                  </h2>

                  <p className="text-[var(--text-secondary)] font-serif text-sm sm:text-base leading-relaxed mb-4 italic opacity-90 line-clamp-2">
                    <TypewriterText text={stripMarkdown(item.excerpt || item.title)} />
                  </p>

                  {item.tags && (
                    <div className="flex flex-wrap gap-2 text-xs font-sans text-[var(--text-muted)] mb-1 min-w-0 max-w-full">
                      {item.tags.split(',').map((tag, i) => (
                        <span key={`${tag.trim()}-${i}`} className="hover:text-[var(--text-primary)] inline-block max-w-full truncate">
                          #{tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              </React.Fragment>
            );
          })}

          {hasMore && (
            <div className="pt-6 text-center">
              <button
                onClick={loadMore}
                className="quiet-button text-xs font-sans uppercase tracking-wider py-2.5 px-6 rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-all cursor-pointer"
              >
                Load more journal entries ↓
              </button>
            </div>
          )}
        </div>
        </>
      )}
    </div>
  );
}
