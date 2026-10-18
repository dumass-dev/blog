import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import RichViewer from '../components/RichViewer';
import TypewriterText from '../components/TypewriterText';
import ReadingProgressBar from '../components/ReadingProgressBar';
import ImageLightbox from '../components/ImageLightbox';
import Reactions from '../components/Reactions';
import Comments from '../components/Comments';
import QuoteCardModal from '../components/QuoteCardModal';
import ProtectedEntryModal from '../components/ProtectedEntryModal';
import { supabase, safeApiFetch, getCachedEntry, cacheEntry, updateCachedEntryViews } from '../supabase';
import { publishRealtimeUpdate } from '../utils/realtime';
import { resolveEntryDetailState, shouldShowCommentsAndReactions } from '../utils/entry';
import { Clock, MapPin, Cloud, Smile, Eye, Quote, Share2 } from 'lucide-react';
import { useViewCount } from '../context/ViewCountContext';
import { useAuth } from '../context/AuthContext';
import FeedSkeleton from '../components/FeedSkeleton';
import ProgressiveImage from '../components/ProgressiveImage';
import { resolveMediaUrl } from '../utils/media';

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

import useDocumentMeta from '../hooks/useDocumentMeta';

export default function EntryDetail() {
  const { slug } = useParams();
  const cachedInitial = getCachedEntry(slug);
  const initialState = resolveEntryDetailState(slug, cachedInitial);

  const [data, setData] = useState(initialState.data);
  const { showViewCount, toggleViewCount } = useViewCount();
  const { isAdmin } = useAuth();

  useDocumentMeta({
    title: data?.entry?.title || 'Entry',
    description: data?.entry?.excerpt || data?.entry?.title,
    image: data?.entry?.cover_image,
    type: 'article'
  });
  const [loading, setLoading] = useState(initialState.loading);
  const [error, setError] = useState(initialState.error);
  const [isUnlocked, setIsUnlocked] = useState(initialState.isUnlocked);
  const isUnlockedRef = useRef(initialState.isUnlocked);
  const [isDeleted, setIsDeleted] = useState(false);

  // Lightbox State
  const [lightbox, setLightbox] = useState({ isOpen: false, src: '', caption: '' });

  // Quote Card State
  const [selectedQuote, setSelectedQuote] = useState('');
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [floatingBtnPos, setFloatingBtnPos] = useState(null);
  const viewedSlugsRef = useRef(new Set());

  const loadEntry = useCallback(async (isSilent = false) => {
    let postData = null;
    let prev = null;
    let next = null;

    if (!isSilent) {
      const cached = getCachedEntry(slug);
      if (cached && typeof cached.content === 'string' && cached.content.trim() !== '') {
        postData = cached;
      }
    }

    // 1. Try server API endpoint FIRST to get fresh 24h Backblaze B2 signed URLs
    try {
      const resData = await safeApiFetch(`/api/posts/${encodeURIComponent(slug)}`);
      if (resData) {
        if (resData.prev) prev = resData.prev;
        if (resData.next) next = resData.next;
        if (resData.entry || resData.title) {
          postData = resData.entry || resData;
          cacheEntry(postData);
        }
      }
    } catch (_err) {}

    // 2. Secondary fallback: Direct Supabase query if API server endpoint is not reachable
    if (!postData) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
        let query = supabase.from('public_published_entries').select('*');
        if (isUuid) {
          query = query.eq('id', slug);
        } else {
          query = query.eq('slug', slug);
        }

        let { data: posts } = await query;
        if ((!posts || posts.length === 0) && !isUuid) {
          const ilikeRes = await supabase.from('public_published_entries').select('*').ilike('slug', slug);
          if (ilikeRes.data && ilikeRes.data.length > 0) {
            posts = ilikeRes.data;
          }
        }
        if (posts && posts[0]) {
          postData = posts[0];
          cacheEntry(postData);
        }
      } catch (_err) {}
    }

    if (!postData) {
      if (!isSilent) {
        setError('Entry not found.');
        setLoading(false);
      }
      return;
    }

    // When views are hidden by admin, completely strip views from non-admin state
    if (!showViewCount && !isAdmin) {
      delete postData.views;
    }

    // Increment view count on initial view (deduplicated per slug per navigation)
    const viewKey = `${slug || postData.id || postData.slug}`;
    if (!isSilent && !viewedSlugsRef.current.has(viewKey)) {
      viewedSlugsRef.current.add(viewKey);
      const optimisticViews = (postData.views || 0) + 1;
      if (showViewCount || isAdmin) {
        postData.views = optimisticViews;
      }
      cacheEntry(postData);

      const identifier = postData.id || postData.slug || slug;
      fetch(`/api/posts/${encodeURIComponent(identifier)}/views`, { method: 'POST' })
        .then(async (res) => {
          if (res.ok) {
            const json = await res.json();
            if ((showViewCount || isAdmin) && json && typeof json.views === 'number') {
              setData(prev => {
                if (!prev?.entry) return prev;
                return {
                  ...prev,
                  entry: { ...prev.entry, views: json.views }
                };
              });
              updateCachedEntryViews(json.id || postData.id, json.slug || postData.slug, json.views);
            }
          } else {
            // Direct RPC fallback if server endpoint is unavailable
            supabase.rpc('increment_views', { target_slug: postData.id || identifier })
              .then(() => {
                if (showViewCount || isAdmin) {
                  publishRealtimeUpdate({
                    type: 'entry_view_updated',
                    id: postData.id,
                    slug: postData.slug,
                    views: optimisticViews
                  });
                }
              })
              .catch(() => {});
          }
        })
        .catch(() => {
          // Network failure fallback
          supabase.rpc('increment_views', { target_slug: postData.id || identifier })
            .then(() => {
              if (showViewCount || isAdmin) {
                publishRealtimeUpdate({
                  type: 'entry_view_updated',
                  id: postData.id,
                  slug: postData.slug,
                  views: optimisticViews
                });
              }
            })
            .catch(() => {});
        });
    }

    const hasPasscode = Boolean(postData.has_passcode || (postData.passcode && postData.passcode.trim() !== ''));

    setData(prevData => {
      const alreadyUnlocked = isUnlockedRef.current || (prevData?.entry?.content && !prevData.entry.content.startsWith('🔒'));
      
      const incomingIsRedacted = postData.content && postData.content.startsWith('🔒');
      
      const effectiveContent = (alreadyUnlocked && incomingIsRedacted)
        ? prevData.entry.content
        : (hasPasscode && !alreadyUnlocked ? '🔒 This entry is passcode-protected.' : postData.content);
        
      const effectiveCover = (alreadyUnlocked && incomingIsRedacted)
        ? (prevData.entry.cover_image || postData.cover_image)
        : (hasPasscode && !alreadyUnlocked ? '' : postData.cover_image);

      const effectiveViews = (showViewCount || isAdmin)
        ? Math.max(postData.views || 0, prevData?.entry?.views || 0, 1)
        : undefined;

      return {
        entry: {
          ...postData,
          views: effectiveViews,
          has_passcode: hasPasscode,
          content: effectiveContent,
          cover_image: effectiveCover
        },
        prev: prev || prevData?.prev,
        next: next || prevData?.next
      };
    });

    if (!hasPasscode) {
      isUnlockedRef.current = true;
      setIsUnlocked(true);
    }
    setLoading(false);
  }, [slug, isAdmin, showViewCount]);

  useEffect(() => {
    const cached = getCachedEntry(slug);
    const resolved = resolveEntryDetailState(slug, cached);

    isUnlockedRef.current = Boolean(resolved.isUnlocked);
    setData(resolved.data);
    setLoading(resolved.loading);
    setError(resolved.error);
    setIsUnlocked(resolved.isUnlocked);
    setIsDeleted(false);

    loadEntry(false);
  }, [slug, loadEntry]);

  // Realtime subscription for live entry updates or deletion
  useEffect(() => {
    const handleEntryChange = (e) => {
      const detail = e.detail;
      const currentId = data?.entry?.id;
      const currentSlug = data?.entry?.slug || slug;

      if (detail) {
        if (detail.op === 'DELETE' || detail.event === 'entry_deleted') {
          if (detail.id === currentId || detail.slug === currentSlug) {
            setIsDeleted(true);
            return;
          }
        }
      }

      // Quietly reload entry with latest content in real-time
      loadEntry(true);
    };

    window.addEventListener('entry-updated', handleEntryChange);
    window.addEventListener('feed-data-invalidated', handleEntryChange);
    return () => {
      window.removeEventListener('entry-updated', handleEntryChange);
      window.removeEventListener('feed-data-invalidated', handleEntryChange);
    };
  }, [slug, data?.entry?.id, data?.entry?.slug, loadEntry]);

  // Realtime subscription for live view count updates
  useEffect(() => {
    const handleViewsUpdate = (e) => {
      const detail = e.detail;
      if (!detail) return;
      const currentId = data?.entry?.id;
      const currentSlug = data?.entry?.slug || slug;

      if ((detail.id && detail.id === currentId) || (detail.slug && detail.slug === currentSlug)) {
        if (typeof detail.views === 'number') {
          setData(prev => {
            if (!prev?.entry) return prev;
            if (prev.entry.views === detail.views) return prev;
            return {
              ...prev,
              entry: { ...prev.entry, views: detail.views }
            };
          });
        }
      }
    };

    window.addEventListener('entry-views-updated', handleViewsUpdate);
    return () => {
      window.removeEventListener('entry-views-updated', handleViewsUpdate);
    };
  }, [slug, data?.entry?.id, data?.entry?.slug]);


  // Listen for text selection to show Floating "Quote Card" pill
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const text = selection ? selection.toString().trim() : '';

      if (text && text.length >= 6) {
        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            setSelectedQuote(text);
            const isNearTop = rect.top < 65;
            const topPos = isNearTop ? rect.bottom + 10 : rect.top - 46;
            const leftPos = Math.max(75, Math.min(window.innerWidth - 75, rect.left + rect.width / 2));
            setFloatingBtnPos({
              top: topPos,
              left: leftPos
            });
            return;
          }
        } catch (_e) {}
      }
      setFloatingBtnPos(null);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const handleImageClick = (e) => {
    if (e.target.tagName === 'IMG') {
      setLightbox({
        isOpen: true,
        src: e.target.src,
        caption: e.target.alt || data?.entry?.title || ''
      });
    }
  };

  if (loading) {
    return (
      <div className="notebook-container py-8">
        <FeedSkeleton type="detail" />
      </div>
    );
  }

  if (isDeleted) {
    return (
      <div className="notebook-container py-16 text-center animate-content-fade">
        <h1 className="text-2xl font-serif font-medium mb-3">This entry was unpublished</h1>
        <p className="text-sm font-sans text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
          The author has removed or unpublished this entry in real-time.
        </p>
        <Link to="/" className="inline-flex items-center text-xs font-sans font-medium text-[var(--accent-warm)] hover:underline">
          ← Return to Chronological Feed
        </Link>
      </div>
    );
  }

  if (error || !data || !data.entry) {
    return (
      <div className="notebook-container py-16 text-center">
        <h1 className="text-2xl font-serif font-medium mb-4">Entry Not Found</h1>
        <p className="text-sm font-sans text-[var(--text-secondary)] mb-6">
          {error || "The entry you're looking for doesn't exist or is private."}
        </p>
        <Link to="/" className="text-xs font-sans uppercase tracking-wider underline">
          ← Return Home
        </Link>
      </div>
    );
  }

  const { entry, prev, next } = data;

  const isPhotoEntry = Boolean(
    entry.type === 'photo' ||
    (entry.category && entry.category.toLowerCase() === 'photos')
  );

  const backLink = isPhotoEntry
    ? '/photos'
    : (entry.type === 'writing' ? '/writing' : entry.type === 'update' ? '/updates' : '/journal');

  const backLabel = isPhotoEntry
    ? 'Photos'
    : (entry.type === 'writing' ? 'Writing' : entry.type === 'update' ? 'Updates' : 'Journal');

  const displayType = isPhotoEntry ? 'photo' : entry.type;

  // Check if content already includes the image to prevent duplicate image rendering
  const contentHasImage = Boolean(
    entry.content && (
      (entry.cover_image && entry.content.includes(entry.cover_image)) ||
      /!\[.*?\]\((.*?)\)/.test(entry.content) ||
      /https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+/i.test(entry.content)
    )
  );

  const shouldRenderCoverImage = Boolean(isPhotoEntry && entry.cover_image && !contentHasImage);

  const handleShare = async () => {
    const shareData = {
      title: data?.entry?.title || 'q04ti blog',
      url: window.location.href
    };
    
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        const btn = document.getElementById('share-btn-text');
        if (btn) {
          const original = btn.innerText;
          btn.innerText = 'Copied!';
          setTimeout(() => { btn.innerText = original; }, 2000);
        }
      }
    } catch (_e) {
      // AbortError is normal if user cancels the share dialog
    }

  };

  return (
    <article className="notebook-container relative animate-content-fade">
      {/* Top Reading Progress Bar */}
      <ReadingProgressBar />

      {/* Photo Lightbox */}
      <ImageLightbox
        isOpen={lightbox.isOpen}
        src={lightbox.src}
        caption={lightbox.caption}
        onClose={() => setLightbox({ isOpen: false, src: '', caption: '' })}
      />

      {/* Quote Card Generator Modal */}
      <QuoteCardModal
        isOpen={showQuoteModal}
        quoteText={selectedQuote}
        postTitle={entry.title || 'Journal Entry'}
        onClose={() => setShowQuoteModal(false)}
      />

      {/* Ultra-Minimal Floating Quote Card Pill */}
      {floatingBtnPos && (
        <div
          style={{
            top: `${floatingBtnPos.top}px`,
            left: `${floatingBtnPos.left}px`,
          }}
          className="fixed z-50 -translate-x-1/2 whitespace-nowrap animate-in fade-in zoom-in-95 duration-150 pointer-events-auto"
        >
          <button
            onClick={() => {
              setShowQuoteModal(true);
              setFloatingBtnPos(null);
            }}
            className="group relative flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-stone-900/90 dark:bg-stone-100/90 text-stone-100 dark:text-stone-900 border border-stone-700/40 dark:border-stone-300/40 backdrop-blur-md shadow-xl text-xs font-sans font-medium tracking-wide hover:scale-105 active:scale-95 transition-all cursor-pointer select-none"
          >
            <Quote className="w-3.5 h-3.5 text-[var(--accent-warm)] shrink-0 transition-transform group-hover:rotate-12" />
            <span>Quote Card</span>
            <span className="text-[10px] font-mono opacity-50 font-normal">✦</span>
          </button>
        </div>
      )}

      {/* Back button */}
      <div className="mb-3 sm:mb-5">
        <Link
          to={backLink}
          className="text-xs font-sans text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors uppercase tracking-wider"
        >
          ← Back to {backLabel}
        </Link>
      </div>

      {/* Header */}
      <header className="mb-6 sm:mb-8">
        <div className="entry-meta-row text-xs font-sans text-[var(--text-muted)] tracking-wider uppercase mb-3 flex flex-wrap items-center min-w-0 max-w-full">
          <span className="meta-chip inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <time dateTime={entry.date}>{formatDate(entry.date)}</time>
          </span>

          <span className="meta-chip inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <span>{displayType}</span>
          </span>

          {entry.category && (
            <span className="meta-chip inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <span>{entry.category}</span>
            </span>
          )}

          {entry.tags && (
            <span className="meta-chip inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <span>#{entry.tags.split(',')[0].trim()}</span>
            </span>
          )}

          {entry.type !== 'update' && (
            <span className="meta-chip inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <Clock className="w-3 h-3 opacity-60 shrink-0" />
              <span>{calcReadingTime(entry.content)}</span>
            </span>
          )}

          {/* View Count Display (Admin Toggle vs Public Visitor Static View) */}
          {/* View Count Display: Only rendered when showViewCount is true! When hidden, render nothing (no 'views hidden' text) */}
          {showViewCount && (
            isAdmin ? (
              <button
                type="button"
                onClick={toggleViewCount}
                className="meta-chip inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors border-0 rounded px-2 py-0.5 select-none"
                title="Admin: Click to hide view counts across website"
                aria-label="Hide view count on site"
              >
                <Eye className="w-3 h-3 opacity-60 shrink-0" />
                <span>{entry.views || 1} {(entry.views || 1) === 1 ? 'view' : 'views'}</span>
              </button>
            ) : (
              (entry.views !== undefined && entry.views !== null) && (
                <span className="meta-chip inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
                  <Eye className="w-3 h-3 opacity-60 shrink-0" />
                  <span>{entry.views || 1} {(entry.views || 1) === 1 ? 'view' : 'views'}</span>
                </span>
              )
            )
          )}

          <button 
            onClick={handleShare}
            className="meta-chip inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer ml-auto transition-colors rounded px-2 py-1 -my-1"
            title="Share this entry"
          >
            <Share2 className="w-3 h-3 opacity-60 shrink-0" />
            <span id="share-btn-text">Share</span>
          </button>
        </div>

        {entry.title && (
          <TypewriterText
            text={entry.title}
            as="h1"
            className="text-3xl sm:text-4xl font-serif font-medium tracking-tight leading-tight mb-4"
          />
        )}


        {/* Context Badges (Location, Weather, Mood) */}
        {(entry.location || entry.weather || entry.mood) && (
          <div className="flex flex-wrap gap-4 text-xs font-sans text-[var(--text-secondary)] italic pt-2 border-t border-[var(--border-subtle)]/50">
            {entry.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[var(--accent-warm)]" />
                <span>{entry.location}</span>
              </span>
            )}
            {entry.weather && (
              <span className="flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-[var(--accent-warm)]" />
                <span>{entry.weather}</span>
              </span>
            )}
            {entry.mood && (
              <span className="flex items-center gap-1.5">
                <Smile className="w-3.5 h-3.5 text-[var(--accent-warm)]" />
                <span>{entry.mood}</span>
              </span>
            )}
          </div>
        )}
      </header>

      {/* Passcode Protection Lock Check */}
      {!isUnlocked ? (
        <ProtectedEntryModal
          postId={entry.id}
          slug={slug || entry.slug}
          onUnlock={(unlockedData) => {
            if (unlockedData && unlockedData.content && !unlockedData.content.startsWith('🔒')) {
              isUnlockedRef.current = true;
              setIsUnlocked(true);
              setData(prev => {
                const updatedEntry = {
                  ...prev.entry,
                  content: unlockedData.content,
                  cover_image: unlockedData.cover_image || prev.entry?.cover_image,
                  excerpt: unlockedData.excerpt || prev.entry?.excerpt,
                  has_passcode: false
                };
                cacheEntry(updatedEntry);
                return {
                  ...prev,
                  entry: updatedEntry
                };
              });
            }
          }}
        />
      ) : (
        <>
          {/* Cover Image if present and not duplicated in content */}
          {shouldRenderCoverImage && (
            <div className="mb-10 cursor-pointer group" onClick={handleImageClick}>
              <ProgressiveImage
                src={resolveMediaUrl(entry.cover_image)}
                alt={entry.title || 'Cover image'}
                objectFit="object-cover"
                className="w-full h-auto rounded border border-[var(--border-subtle)] max-h-[440px]"
                imgClassName="group-hover:opacity-95 transition-opacity"
              />
            </div>
          )}

          {/* Rich Body Reader */}
          <div className="mb-12" onClick={handleImageClick}>
            <RichViewer content={entry.content} />
          </div>

          {/* Emoji Reactions Bar (hidden for Photo posts) */}
          {shouldShowCommentsAndReactions(entry) && <Reactions postId={entry.id} />}

          {/* Reader Comments (hidden for Photo posts) */}
          {shouldShowCommentsAndReactions(entry) && <Comments postId={entry.id} />}
        </>
      )}

      {/* Tags */}
      {entry.tags && (
        <div className="pt-4 flex flex-wrap gap-2 text-xs font-sans text-[var(--text-muted)] mb-12 min-w-0 max-w-full">
          {entry.tags.split(',').map((tag, idx) => (
            <Link
              key={`${tag.trim()}-${idx}`}
              to={`/archive?tag=${encodeURIComponent(tag.trim())}`}
              className="hover:text-[var(--text-primary)] transition-colors inline-block max-w-full truncate"
            >
              #{tag.trim()}
            </Link>
          ))}
        </div>
      )}

      {/* Next & Previous navigation */}
      <nav className="pt-8 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs font-sans">
        <div className="w-full sm:w-auto">
          {prev ? (
            <Link to={`/entry/${prev.slug || prev.id}`} className="group block text-left">
              <span className="text-[var(--text-muted)] block uppercase tracking-wider mb-0.5">← Previous</span>
              <span className="font-serif text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-warm)] transition-colors">
                {prev.title.split(' ').length > 3 ? prev.title.split(' ').slice(0, 3).join(' ') + '...' : prev.title}
              </span>
            </Link>
          ) : null}
        </div>

        <div className="text-right w-full sm:w-auto">
          {next ? (
            <Link to={`/entry/${next.slug || next.id}`} className="group block text-right">
              <span className="text-[var(--text-muted)] block uppercase tracking-wider mb-0.5">Next →</span>
              <span className="font-serif text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-warm)] transition-colors">
                {next.title.split(' ').length > 3 ? next.title.split(' ').slice(0, 3).join(' ') + '...' : next.title}
              </span>
            </Link>
          ) : null}
        </div>
      </nav>
    </article>
  );
}

