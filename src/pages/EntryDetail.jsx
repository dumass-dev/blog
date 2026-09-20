import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import RichViewer from '../components/RichViewer';
import ReadingProgressBar from '../components/ReadingProgressBar';
import ImageLightbox from '../components/ImageLightbox';
import Reactions from '../components/Reactions';
import Comments from '../components/Comments';
import QuoteCardModal from '../components/QuoteCardModal';
import ProtectedEntryModal from '../components/ProtectedEntryModal';
import { supabase, safeApiFetch } from '../supabase';
import { Clock, MapPin, Cloud, Smile, Lock, Share2, Eye, Quote } from 'lucide-react';

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

export default function EntryDetail() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Lightbox State
  const [lightbox, setLightbox] = useState({ isOpen: false, src: '', caption: '' });

  // Quote Card State
  const [selectedQuote, setSelectedQuote] = useState('');
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [floatingBtnPos, setFloatingBtnPos] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setIsUnlocked(false);

    const loadEntry = async () => {
      let postData = null;
      let prev = null;
      let next = null;

      // 1. Try API server first
      const resData = await safeApiFetch(`/api/posts/${slug}`);
      if (resData && typeof resData === 'object') {
        postData = resData.entry || resData;
        prev = resData.prev || null;
        next = resData.next || null;
      } else {
        // 2. Direct Supabase fallback
        try {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
          let query = supabase.from('entries').select('*').eq('status', 'published');
          if (isUuid) {
            query = query.eq('id', slug);
          } else {
            query = query.eq('slug', slug);
          }

          const { data: posts, error: supaErr } = await query;
          if (supaErr || !posts || posts.length === 0) {
            throw new Error('Entry not found.');
          }
          postData = posts[0];
        } catch (err) {
          setError(err.message || 'Entry not found.');
          setLoading(false);
          return;
        }
      }

      if (postData) {
        // Increment view count
        const updatedViews = (postData.views || 0) + 1;
        postData.views = updatedViews;

        // Persist incremented view count to Supabase
        if (postData.id) {
          supabase
            .from('entries')
            .update({ views: updatedViews })
            .eq('id', postData.id)
            .then(() => {})
            .catch(() => {});
        }

        const hasPasscode = Boolean(postData.has_passcode || (postData.passcode && postData.passcode.trim() !== ''));

        setData({
          entry: {
            ...postData,
            has_passcode: hasPasscode,
            content: hasPasscode ? '🔒 This entry is passcode-protected.' : postData.content
          },
          prev,
          next
        });

        if (!hasPasscode) {
          setIsUnlocked(true);
        }
      }

      setLoading(false);
    };

    loadEntry();
  }, [slug]);

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
        } catch (e) {}
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
      <div className="notebook-container py-16 text-center text-sm font-sans text-[var(--text-muted)] italic">
        Opening entry...
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

  return (
    <article className="notebook-container relative">
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
      <div className="mb-8">
        <Link
          to={entry.type === 'writing' ? '/writing' : entry.type === 'update' ? '/updates' : '/journal'}
          className="text-xs font-sans text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors uppercase tracking-wider"
        >
          ← Back to {entry.type}
        </Link>
      </div>

      {/* Header */}
      <header className="mb-8">
        <div className="entry-meta-row text-xs font-sans text-[var(--text-muted)] tracking-wider uppercase mb-3 flex flex-wrap items-center min-w-0 max-w-full">
          <span className="meta-chip inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <time dateTime={entry.date}>{formatDate(entry.date)}</time>
          </span>

          <span className="meta-chip inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <span>{entry.type}</span>
          </span>

          {entry.category && (
            <span className="meta-chip inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <span>{entry.category}</span>
            </span>
          )}

          {entry.type !== 'update' && (
            <span className="meta-chip inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <Clock className="w-3 h-3 opacity-60 shrink-0" />
              <span>{calcReadingTime(entry.content)}</span>
            </span>
          )}

          {entry.views !== undefined && entry.views !== null && (
            <span className="meta-chip inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <Eye className="w-3 h-3 opacity-60 shrink-0" />
              <span>{entry.views} {entry.views === 1 ? 'view' : 'views'}</span>
            </span>
          )}
        </div>

        {entry.type !== 'update' && (
          <h1 className="text-3xl sm:text-4xl font-serif font-medium tracking-tight leading-tight mb-4">
            {entry.title}
          </h1>
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
          onUnlock={(unlockedData) => {
            if (unlockedData && unlockedData.content) {
              setData(prev => ({
                ...prev,
                entry: {
                  ...prev.entry,
                  content: unlockedData.content,
                  cover_image: unlockedData.cover_image,
                  excerpt: unlockedData.excerpt
                }
              }));
            }
            setIsUnlocked(true);
          }}
        />
      ) : (
        <>
          {/* Cover Image if present */}
          {entry.cover_image && (
            <div className="mb-10 cursor-pointer group" onClick={handleImageClick}>
              <img
                src={entry.cover_image}
                alt={entry.title}
                className="w-full h-auto rounded border border-[var(--border-subtle)] object-cover max-h-[440px] group-hover:opacity-95 transition-opacity"
              />
              <div className="text-[11px] font-sans text-right text-[var(--text-muted)] mt-1">
                Click photo for high-res lightbox view
              </div>
            </div>
          )}

          {/* Rich Body Reader */}
          <div className="mb-12" onClick={handleImageClick}>
            <RichViewer content={entry.content} />
          </div>

          {/* Emoji Reactions Bar */}
          <Reactions postId={entry.id} />

          {/* Reader Comments */}
          <Comments postId={entry.id} />
        </>
      )}

      {/* Tags */}
      {entry.tags && (
        <div className="pt-4 flex flex-wrap gap-2 text-xs font-sans text-[var(--text-muted)] mb-12">
          {entry.tags.split(',').map((tag, idx) => (
            <Link
              key={`${tag.trim()}-${idx}`}
              to={`/archive?tag=${encodeURIComponent(tag.trim())}`}
              className="hover:text-[var(--text-primary)] transition-colors"
            >
              #{tag.trim()}
            </Link>
          ))}
        </div>
      )}

      {/* Next & Previous navigation */}
      <nav className="pt-8 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs font-sans">
        <div>
          {prev ? (
            <Link to={`/entry/${prev.slug}`} className="group block text-left">
              <span className="text-[var(--text-muted)] block uppercase tracking-wider mb-0.5">← Previous</span>
              <span className="font-serif text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-warm)] transition-colors">
                {prev.title}
              </span>
            </Link>
          ) : null}
        </div>

        <div className="text-right sm:text-right">
          {next ? (
            <Link to={`/entry/${next.slug}`} className="group block text-right">
              <span className="text-[var(--text-muted)] block uppercase tracking-wider mb-0.5">Next →</span>
              <span className="font-serif text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-warm)] transition-colors">
                {next.title}
              </span>
            </Link>
          ) : null}
        </div>
      </nav>
    </article>
  );
}

