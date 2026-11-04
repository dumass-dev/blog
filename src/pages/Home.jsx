import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Cloud, Smile } from 'lucide-react';
import { useFeedData } from '../hooks/useFeedData';
import { useEntryPrefetch } from '../hooks/useEntryPrefetch';
import useDocumentMeta from '../hooks/useDocumentMeta';
import FeedSkeleton from '../components/FeedSkeleton';
import ProgressiveImage from '../components/ProgressiveImage';
import TypewriterText from '../components/TypewriterText';
import { stripMarkdown } from '../utils/excerpt';
import { resolveMediaUrl } from '../utils/media';
import NowPlaying from '../components/NowPlaying';
import GitHubContributions from '../components/GitHubContributions';

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
  let src = item.cover_image && item.cover_image.trim();
  if (src && /q04ti-quote|quote-/i.test(src)) {
    src = null;
  }
  if (!src && item.content) {
    const matches = [...item.content.matchAll(/!\[.*?\]\((.*?)\)/g)].map(m => m[1])
      .concat([...item.content.matchAll(/https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+[^\s)"]*/gi)].map(m => m[0]));
    src = matches.find(url => !/q04ti-quote|quote-/i.test(url)) || matches[0] || null;
  }
  return resolveMediaUrl(src);
}

export default function Home() {
  useDocumentMeta({
    title: 'Chronological Feed',
    description: 'A stream of essays, notes, thoughts, photos, and recent updates.'
  });

  const { displayedEntries, loading, error, stale, refreshing, entries, hasMore, loadMore, refetch } = useFeedData({
    forHomeFeed: true,
    pageSize: 10
  });

  useEntryPrefetch(entries);

  return (
    <div className="notebook-container">
      <header className="mb-12 flex justify-between items-start gap-4">
        <div className="flex-1 min-w-0">
          <TypewriterText
            text="Chronological Feed"
            as="h1"
            className="text-3xl font-serif font-medium tracking-tight mb-2 text-[var(--text-primary)] leading-none pt-1"
          />
          <TypewriterText
            text="A stream of essays, notes, thoughts, photos, and recent updates."
            as="p"
            className="text-sm font-sans text-[var(--text-secondary)] mt-2"
          />
        </div>
        <div className="flex-shrink-0 mt-1.5">
          <NowPlaying expandable={true} defaultExpanded={false} />
        </div>
      </header>

      {loading ? (
        <FeedSkeleton count={4} />
      ) : error ? (
        <div className="py-12 text-center">
          <p className="text-sm font-sans text-[var(--text-primary)]">Couldn&apos;t load the latest entries.</p>
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
          No published entries yet.
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
        <div className="space-y-8 sm:space-y-12">
          {displayedEntries.map((item, idx) => {
            const itemDate = formatShortDate(item.date);
            const prevItem = displayedEntries[idx - 1];
            const nextItem = displayedEntries[idx + 1];
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
            const readTimeText = calcReadingTimeText(item.excerpt || item.content);
            const photoSrc = isPhoto || item.cover_image ? getPhotoSrc(item) : null;
            const isLockedPasscode = item.has_passcode && item.content && item.content.includes('🔒');

            const staggerClass = `stagger-${Math.min(idx + 1, 6)}`;

            return (
              <React.Fragment key={item.id || idx}>
                {isFirstInGroup && (
                  <div className="text-xs font-sans font-medium text-[var(--text-muted)] tracking-wider uppercase pt-2 pb-1 mb-2 border-b border-[var(--border-subtle)]/50">
                    {itemDate}
                  </div>
                )}

                <article className={`group pb-8 sm:pb-10 border-b border-[var(--border-subtle)]/70 last:border-0 animate-content-fade ${staggerClass}`}>
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

                  {item.title ? (
                    <h2 className="text-xl sm:text-2xl font-serif font-medium tracking-tight mb-2">
                      <Link
                        to={effectiveType === 'photo' ? '/photos' : `/entry/${item.slug || item.id}`}
                        className="hover:text-[var(--accent-warm)] transition-colors text-[var(--text-primary)]"
                      >
                        <TypewriterText text={item.title} />
                      </Link>
                    </h2>
                  ) : null}

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

                  {effectiveType === 'photo' && photoSrc && !isLockedPasscode && (
                    <div className="my-3.5 rounded-lg overflow-hidden border border-[var(--border-subtle)] max-w-md bg-[var(--code-bg)]">
                      <Link to="/photos" className="block w-full leading-none">
                        <ProgressiveImage
                          src={photoSrc}
                          alt={item.title || 'Photo'}
                          objectFit="object-cover"
                          className="w-full h-auto max-h-[520px]"
                          imgClassName="max-h-[520px] group-hover:opacity-95 transition-opacity"
                        />
                      </Link>
                    </div>
                  )}

                  {Boolean(stripMarkdown(item.excerpt || '').trim() && stripMarkdown(item.excerpt || '').trim() !== stripMarkdown(item.title || '').trim()) && (
                    <div className="text-[var(--text-secondary)] font-serif leading-relaxed italic text-sm sm:text-base opacity-90 line-clamp-2">
                      <Link
                        to={effectiveType === 'photo' ? '/photos' : `/entry/${item.slug || item.id}`}
                        className="hover:text-[var(--text-primary)] transition-colors text-inherit"
                      >
                        <TypewriterText text={stripMarkdown(item.excerpt).replace(/^🔒\s*/, '')} />
                      </Link>
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
                Load more feed entries ↓
              </button>
            </div>
          )}
        </div>
        </>
      )}

      {/* GitHub Contributions Section at the bottom of Chrono Feed */}
      {!loading && (
        <section className="mt-14 pt-8 border-t border-[var(--border-subtle)]" aria-label="GitHub Activity">
          <GitHubContributions username="q04ti" showHeader={true} minimal={true} />
        </section>
      )}
    </div>
  );
}
