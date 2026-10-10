import React from 'react';
import { Link } from 'react-router-dom';
import useDocumentMeta from '../hooks/useDocumentMeta';
import { useFeedData } from '../hooks/useFeedData';
import FeedSkeleton from '../components/FeedSkeleton';
import TypewriterText from '../components/TypewriterText';

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
  useDocumentMeta({
    title: 'Updates',
    description: 'Lightweight micro-stream of notes, moments, and daily thoughts.'
  });

  const { displayedEntries: updates, loading, entries, hasMore, loadMore } = useFeedData({
    type: 'update',
    pageSize: 10
  });

  return (
    <div className="notebook-container">
      <header className="mb-12">
        <h1 className="text-3xl font-serif font-medium tracking-tight mb-2">Updates</h1>
        <p className="text-sm font-sans text-[var(--text-secondary)]">
          Lightweight micro-stream of notes, moments, and daily thoughts.
        </p>
      </header>

      {loading ? (
        <FeedSkeleton type="update" count={4} />
      ) : entries.length === 0 ? (
        <div className="py-12 text-center text-sm font-sans text-[var(--text-muted)]">
          No updates posted yet.
        </div>
      ) : (
        <div className="space-y-8 sm:space-y-12">
          {updates.map((item, idx) => {
            const itemDate = formatUpdateTimestamp(item.date);
            const prevItem = updates[idx - 1];
            const nextItem = updates[idx + 1];
            const prevDate = prevItem ? formatUpdateTimestamp(prevItem.date) : null;
            const nextDate = nextItem ? formatUpdateTimestamp(nextItem.date) : null;

            const isGrouped = (prevDate === itemDate || nextDate === itemDate);
            const isFirstInGroup = isGrouped && (prevDate !== itemDate);
            const categoryLabel = (item.category || 'UPDATE').toUpperCase();

            const staggerClass = `stagger-${Math.min(idx + 1, 6)}`;

            return (
              <React.Fragment key={item.id || idx}>
                {isFirstInGroup && (
                  <div className="text-xs font-sans font-medium text-[var(--text-muted)] tracking-wider uppercase pt-2 pb-1 mb-2 border-b border-[var(--border-subtle)]/50">
                    {itemDate}
                  </div>
                )}

                <article className={`pb-10 border-b border-[var(--border-subtle)] last:border-0 group animate-content-fade ${staggerClass}`}>
                  <div className="text-xs font-sans text-[var(--text-muted)] tracking-wider uppercase mb-2 flex flex-wrap items-center gap-1.5">
                    <span>{categoryLabel}</span>
                    {!isGrouped && itemDate && (
                      <>
                        <span>·</span>
                        <span>{itemDate}</span>
                      </>
                    )}
                    {item.has_passcode && (
                      <>
                        <span>·</span>
                        <span className="text-[10px] text-[var(--text-primary)] font-medium">PROTECTED</span>
                      </>
                    )}
                  </div>

                  {item.title ? (
                    <h2 className="text-xl sm:text-2xl font-serif font-medium tracking-tight mb-2">
                      <Link to={`/entry/${item.slug}`} className="hover:text-[var(--accent-warm)] transition-colors">
                        <TypewriterText text={item.title} />
                      </Link>
                    </h2>
                  ) : null}

                  <div className="text-[var(--text-secondary)] font-serif text-sm sm:text-base leading-relaxed mb-4 italic opacity-90 line-clamp-2">
                    <Link to={`/entry/${item.slug}`} className="hover:text-[var(--text-primary)] transition-colors text-inherit">
                      <TypewriterText text={stripMarkdown(item.excerpt || item.title || item.content)} />
                    </Link>
                  </div>
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
                Load more updates ↓
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
