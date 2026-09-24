import React from 'react';
import { Link } from 'react-router-dom';
import useDocumentMeta from '../hooks/useDocumentMeta';
import { useFeedData } from '../hooks/useFeedData';
import FeedSkeleton from '../components/FeedSkeleton';

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
        <div className="space-y-8 relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[1px] before:bg-[var(--border-subtle)] pl-6">
          {updates.map((item, idx) => (
            <div key={item.id} className={`relative group animate-content-fade stagger-${Math.min(idx + 1, 6)}`}>
              {/* Bullet point on line */}
              <div className="absolute -left-[31px] top-1.5 w-2.5 h-2.5 rounded-full bg-[var(--bg-main)] border border-[var(--text-muted)] group-hover:border-[var(--accent-warm)] transition-colors" />

              {/* Timestamp */}
              <div className="text-xs font-sans font-medium text-[var(--text-secondary)] tracking-wide mb-1">
                {formatUpdateTimestamp(item.date)}
              </div>

              {/* Title heading if present */}
              {item.title && (
                <h2 className="text-xl font-serif font-medium tracking-tight mb-1 text-[var(--text-primary)]">
                  <Link to={`/entry/${item.slug}`} className="hover:text-[var(--accent-warm)] transition-colors">
                    {item.title}
                  </Link>
                </h2>
              )}

              {/* Content blockquote / text */}
              <blockquote className="font-serif text-base sm:text-lg text-[var(--text-primary)] leading-relaxed italic border-l-0 pl-0 my-0">
                "{item.excerpt || item.title}"
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
