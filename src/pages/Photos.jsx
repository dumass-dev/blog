import React, { useState, useEffect } from 'react';
import { Heart, MessageSquare, LayoutGrid, Rows, X, ChevronLeft, ChevronRight, MapPin, Calendar, Image as ImageIcon, Send, Lock } from 'lucide-react';
import { formatDate } from '../utils/date';
import ProtectedEntryModal from '../components/ProtectedEntryModal';
import { fetchPublishedEntries, getCachedFeed, subscribeToEntries } from '../supabase';

export default function Photos() {
  const cached = getCachedFeed('photo');
  const [photos, setPhotos] = useState(() => (Array.isArray(cached) ? cached : []));
  const [loading, setLoading] = useState(() => !cached || cached.length === 0);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'feed'
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
  
  // Interactions for active lightbox photo
  const [reactions, setReactions] = useState({ hearts: 0, userLiked: false });
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState({ name: '', text: '' });
  const [submittingComment, setSubmittingComment] = useState(false);
  
  // Passcode modal state
  const [passcodeModalPhoto, setPasscodeModalPhoto] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadPhotos = async () => {
      let photoEntries = await fetchPublishedEntries({ type: 'photo' });
      if (!photoEntries || photoEntries.length === 0) {
        try {
          const res = await fetch('/api/posts?type=photo');
          if (res.ok) {
            const data = await res.json();
            photoEntries = data.filter(item => 
              item.type === 'photo' || 
              (item.category && item.category.toLowerCase() === 'photos') ||
              (item.cover_image && item.cover_image.trim() !== '')
            );
          }
        } catch {}
      }

      if (isMounted) {
        setPhotos(Array.isArray(photoEntries) ? photoEntries : []);
        setLoading(false);
      }
    };

    loadPhotos();
    const unsubscribe = subscribeToEntries(() => {
      loadPhotos();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const activePhoto = selectedPhotoIndex !== null ? photos[selectedPhotoIndex] : null;

  // Load interactions when a lightbox photo is selected
  useEffect(() => {
    if (!activePhoto) return;

    // Fetch reactions
    fetch(`/api/posts/${activePhoto.id}/reactions`)
      .then(res => res.json())
      .then(data => {
        setReactions({ hearts: data.hearts || 0, userLiked: false });
      })
      .catch(() => {});

    // Fetch comments
    fetch(`/api/posts/${activePhoto.id}/comments`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setComments(data);
      })
      .catch(() => {});
  }, [activePhoto?.id]);

  // Handle keypress for lightbox navigation
  useEffect(() => {
    function handleKeyDown(e) {
      if (selectedPhotoIndex === null) return;
      if (e.key === 'Escape') setSelectedPhotoIndex(null);
      if (e.key === 'ArrowLeft') navigatePhoto(-1);
      if (e.key === 'ArrowRight') navigatePhoto(1);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPhotoIndex, photos.length]);

  const navigatePhoto = (direction) => {
    if (selectedPhotoIndex === null) return;
    const newIdx = selectedPhotoIndex + direction;
    if (newIdx >= 0 && newIdx < photos.length) {
      setSelectedPhotoIndex(newIdx);
    }
  };

  const handleLike = async (photoId, e) => {
    if (e) e.stopPropagation();
    if (reactions.userLiked) return;

    // Optimistic UI update
    setReactions(prev => ({
      hearts: prev.hearts + 1,
      userLiked: true
    }));

    try {
      const res = await fetch(`/api/posts/${photoId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction_type: 'loved', type: 'heart' })
      });
      if (res.ok) {
        const data = await res.json();
        setReactions({
          hearts: data.hearts !== undefined ? data.hearts : (data.loved || 1),
          userLiked: true
        });
      }
    } catch (err) {
      console.error('Error liking photo:', err);
    }
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.text.trim() || !activePhoto) return;

    try {
      setSubmittingComment(true);
      const res = await fetch(`/api/posts/${activePhoto.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author_name: newComment.name.trim() || 'Anonymous Reader',
          content: newComment.text.trim()
        })
      });

      if (res.ok) {
        const added = await res.json();
        setComments(prev => [...prev, added]);
        setNewComment({ name: '', text: '' });
      }
    } catch (err) {
      console.error('Error posting comment:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const openPhoto = (photo, index) => {
    if (photo.has_passcode && photo.content && photo.content.includes('🔒')) {
      setPasscodeModalPhoto(photo);
      return;
    }
    setSelectedPhotoIndex(index);
  };

  const getPhotoSrc = (item) => {
    if (!item) return null;
    if (item.cover_image && item.cover_image.trim()) {
      return item.cover_image;
    }
    if (!item.content) return null;
    const imgMatch = item.content.match(/!\[.*?\]\((.*?)\)/) || item.content.match(/https?:\/\/[^\s\)\"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[a-f0-9\-]+\.[a-z0-9]+[^\s\)\"]*/i);
    if (imgMatch) return imgMatch[1] || imgMatch[0];
    return null;
  };

  const getCleanCaption = (item) => {
    if (!item || !item.content) return '';
    if (item.content.startsWith('🔒')) return '';
    const clean = item.content.replace(/!\[.*?\]\(.*?\)/g, '').trim();
    if (clean && !clean.startsWith('http://') && !clean.startsWith('https://')) {
      return clean;
    }
    return '';
  };

  return (
    <div className="notebook-container pb-20">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-[var(--border-subtle)] pb-6 mb-8 gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-[var(--text-primary)] font-normal">
            Photos
          </h1>
          <p className="font-sans text-xs sm:text-sm text-[var(--text-muted)] mt-1">
            Visual journal, moments & Backblaze film archives ({photos.length} captures)
          </p>
        </div>

        {/* Feed View Controls */}
        <div className="flex items-center space-x-1 bg-[var(--card-bg)] p-1 rounded-lg border border-[var(--border-subtle)] self-start sm:self-auto">
          <button
            onClick={() => setViewMode('grid')}
            style={viewMode === 'grid' ? { backgroundColor: 'var(--text-primary)', color: 'var(--bg-main)' } : {}}
            className={`px-3 py-1.5 rounded-md text-xs font-sans flex items-center space-x-1.5 transition-colors cursor-pointer ${
              viewMode === 'grid'
                ? 'font-medium shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            title="Grid View"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Grid</span>
          </button>
          <button
            onClick={() => setViewMode('feed')}
            style={viewMode === 'feed' ? { backgroundColor: 'var(--text-primary)', color: 'var(--bg-main)' } : {}}
            className={`px-3 py-1.5 rounded-md text-xs font-sans flex items-center space-x-1.5 transition-colors cursor-pointer ${
              viewMode === 'feed'
                ? 'font-medium shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            title="Feed Stream View"
          >
            <Rows className="w-3.5 h-3.5" />
            <span>Stream</span>
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map(n => (
            <div key={n} className="aspect-square bg-[var(--code-bg)] rounded-md border border-[var(--border-subtle)]" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[var(--border-subtle)] rounded-lg">
          <ImageIcon className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3 opacity-50" />
          <p className="font-serif text-lg text-[var(--text-primary)]">No photos published yet</p>
          <p className="font-sans text-xs text-[var(--text-muted)] mt-1">
            Upload images in Admin Studio to build your visual stream.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW (3-column Instagram style) */
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
          {photos.map((item, idx) => {
            const imgSrc = getPhotoSrc(item);
            const isProtected = item.has_passcode && item.content && item.content.includes('🔒');

            return (
              <div
                key={item.id || idx}
                onClick={() => openPhoto(item, idx)}
                className="group relative aspect-square bg-[var(--code-bg)] rounded-md overflow-hidden border border-[var(--border-subtle)] cursor-pointer select-none"
              >
                {imgSrc ? (
                  <img
                    src={imgSrc}
                    alt={item.title || 'Photo'}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-4 text-center">
                    <span className="font-serif text-xs text-[var(--text-muted)] italic">
                      {isProtected ? '🔒 Passcode Protected' : item.title}
                    </span>
                  </div>
                )}

                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 text-white">
                  <p className="font-sans text-xs font-medium line-clamp-1">
                    {item.title}
                  </p>
                  <p className="font-sans text-[10px] text-white/80 mt-0.5">
                    {formatDate(item.date)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* FEED / STREAM VIEW (Vertical Instagram style) */
        <div className="max-w-xl mx-auto space-y-12">
          {photos.map((item, idx) => {
            const imgSrc = getPhotoSrc(item);

            return (
              <article
                key={item.id || idx}
                className="border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--bg-main)] shadow-sm"
              >
                {/* Header */}
                <div className="p-4 flex items-center justify-between border-b border-[var(--border-subtle)]">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--text-primary)] text-[var(--bg-main)] font-serif font-medium flex items-center justify-center text-xs">
                      q
                    </div>
                    <div>
                      <h3 className="font-sans text-xs font-semibold text-[var(--text-primary)] break-words leading-normal whitespace-normal">
                        {item.title}
                      </h3>
                      {item.location && (
                        <p className="font-sans text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5" />
                          <span>{item.location}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="font-sans text-[11px] text-[var(--text-muted)]">
                    {formatDate(item.date)}
                  </span>
                </div>

                {/* Image */}
                <div
                  className="relative aspect-square sm:aspect-auto max-h-[560px] bg-black/5 cursor-pointer overflow-hidden flex items-center justify-center"
                  onClick={() => openPhoto(item, idx)}
                >
                  {item.has_passcode && item.content && item.content.includes('🔒') ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center space-y-3 py-16 bg-[var(--card-bg)] w-full h-full">
                      <div className="w-12 h-12 rounded-full bg-[var(--code-bg)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-warm)]">
                        <Lock className="w-5 h-5" />
                      </div>
                      <h4 className="font-serif text-base font-medium text-[var(--text-primary)]">Passcode Protected Photo</h4>
                      <p className="font-sans text-xs text-[var(--text-muted)] max-w-xs leading-relaxed">
                        This capture is private. Tap to enter passcode and view high-res photo.
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPhoto(item, idx);
                        }}
                        className="quiet-button text-xs py-2 px-4 font-sans inline-flex items-center gap-1.5 mt-2"
                      >
                        <span>Unlock Photo</span>
                      </button>
                    </div>
                  ) : imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={item.title}
                      className="w-full h-full object-contain max-h-[560px]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="p-8 text-center text-[var(--text-muted)] font-serif italic text-sm">
                      No image available
                    </div>
                  )}
                </div>

                {/* Footer / Caption */}
                <div className="p-4 space-y-2">
                  <div className="flex items-center space-x-4 text-[var(--text-secondary)]">
                    <button
                      onClick={(e) => handleLike(item.id, e)}
                      className="flex items-center space-x-1 hover:text-red-500 transition-colors text-xs font-sans"
                    >
                      <Heart className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openPhoto(item, idx)}
                      className="flex items-center space-x-1 hover:text-[var(--text-primary)] transition-colors text-xs font-sans"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  </div>

                  {getCleanCaption(item) && (
                    <p className="font-sans text-xs sm:text-sm text-[var(--text-primary)] leading-relaxed">
                      {getCleanCaption(item)}
                    </p>
                  )}

                  {item.tags && (
                    <p className="font-sans text-[11px] text-[var(--text-muted)]">
                      {item.tags.split(',').map(t => `#${t.trim()}`).join(' ')}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* FULLSCREEN LIGHTBOX MODAL */}
      {activePhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedPhotoIndex(null);
          }}
        >


          {/* Navigation Arrows */}
          {selectedPhotoIndex > 0 && (
            <button
              onClick={() => navigatePhoto(-1)}
              className="fixed left-3 sm:left-6 top-1/2 -translate-y-1/2 z-[100] p-2.5 text-white/90 hover:text-white bg-black/70 hover:bg-black rounded-full transition-transform hover:scale-110 shadow-xl cursor-pointer"
              aria-label="Previous photo"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {selectedPhotoIndex < photos.length - 1 && (
            <button
              onClick={() => navigatePhoto(1)}
              className="fixed right-3 sm:right-6 top-1/2 -translate-y-1/2 z-[100] p-2.5 text-white/90 hover:text-white bg-black/70 hover:bg-black rounded-full transition-transform hover:scale-110 shadow-xl cursor-pointer"
              aria-label="Next photo"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          {/* Main Modal Layout Card */}
          <div className="relative w-full max-w-5xl max-h-[90vh] bg-[var(--bg-main)] rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row border border-[var(--border-subtle)]">
            {/* Single Close Button on Photo Card Top-Left Corner */}
            <button
              onClick={() => setSelectedPhotoIndex(null)}
              className="absolute top-3 left-3 z-[110] p-2 rounded-full bg-black/70 hover:bg-black text-white shadow-lg border border-white/20 transition-all hover:scale-105 cursor-pointer flex items-center justify-center"
              aria-label="Close photo view"
              title="Close photo"
            >
              <X className="w-4 h-4" />
            </button>
            {/* Image Viewport Column */}
            <div className="md:w-7/12 lg:w-8/12 bg-black flex items-center justify-center relative min-h-[280px] max-h-[50vh] md:max-h-[85vh] p-3 sm:p-6 select-none">
              {getPhotoSrc(activePhoto) ? (
                <img
                  src={getPhotoSrc(activePhoto)}
                  alt={activePhoto.title}
                  className="max-w-full max-h-[78vh] object-contain rounded shadow-lg"
                />
              ) : (
                <div className="text-white/60 font-serif italic text-sm">No preview available</div>
              )}
            </div>

            {/* Sidebar Details & Comments Column */}
            <div className="md:w-5/12 lg:w-4/12 flex flex-col h-full max-h-[40vh] md:max-h-[85vh] border-t md:border-t-0 md:border-l border-[var(--border-subtle)] bg-[var(--bg-main)]">
              {/* Header */}
              <div className="p-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="font-serif text-base sm:text-lg font-medium text-[var(--text-primary)] break-words line-clamp-2">
                    {activePhoto.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)] font-sans mt-1">
                    <span className="flex items-center gap-1 shrink-0">
                      <Calendar className="w-3 h-3" />
                      {formatDate(activePhoto.date)}
                    </span>
                    {activePhoto.location && (
                      <span className="flex items-center gap-1 shrink-0 truncate max-w-[140px]">
                        <MapPin className="w-3 h-3" />
                        <span>{activePhoto.location}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Caption & Comments List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-sans">
                {getCleanCaption(activePhoto) && (
                  <div className="pb-3 border-b border-[var(--border-subtle)] text-[var(--text-primary)] leading-relaxed break-words">
                    {getCleanCaption(activePhoto)}
                  </div>
                )}

                {/* Reactions counter */}
                <div className="flex items-center justify-between py-1 border-b border-[var(--border-subtle)]">
                  <button
                    onClick={() => handleLike(activePhoto.id)}
                    className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors cursor-pointer ${
                      reactions.userLiked
                        ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/40 dark:border-red-900/50'
                        : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${reactions.userLiked ? 'fill-current text-red-500' : ''}`} />
                    <span>{reactions.hearts} {reactions.hearts === 1 ? 'like' : 'likes'}</span>
                  </button>

                  <span className="text-[11px] text-[var(--text-muted)]">
                    {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
                  </span>
                </div>

                {/* Comments Stream */}
                <div className="space-y-3 pt-1">
                  {comments.length === 0 ? (
                    <p className="text-center text-[var(--text-muted)] italic text-[11px] py-4">
                      No comments yet. Be the first to comment!
                    </p>
                  ) : (
                    comments.map((c, i) => (
                      <div key={c.id || i} className="space-y-0.5 bg-[var(--card-bg)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[var(--text-primary)] truncate max-w-[120px]">{c.author_name}</span>
                          <span className="text-[10px] text-[var(--text-muted)] shrink-0">{formatDate(c.created_at)}</span>
                        </div>
                        <p className="text-[var(--text-secondary)] break-words">{c.content}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Comment Input Form */}
              <form onSubmit={handleCommentSubmit} className="p-3 border-t border-[var(--border-subtle)] bg-[var(--card-bg)] space-y-2">
                <input
                  type="text"
                  placeholder="Your name (optional)..."
                  value={newComment.name}
                  onChange={e => setNewComment(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full text-xs px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-hover)]"
                />
                <div className="flex space-x-1.5">
                  <input
                    type="text"
                    placeholder="Write a comment..."
                    value={newComment.text}
                    onChange={e => setNewComment(prev => ({ ...prev, text: e.target.value }))}
                    className="flex-1 text-xs px-2.5 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-hover)]"
                    required
                  />
                  <button
                    type="submit"
                    disabled={submittingComment || !newComment.text.trim()}
                    className="px-3 py-1.5 bg-[var(--text-primary)] text-[var(--bg-main)] text-xs rounded font-medium disabled:opacity-50 transition-opacity flex items-center justify-center cursor-pointer shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Protected Entry Modal for Passcode-Locked Photos */}
      {passcodeModalPhoto && (
        <ProtectedEntryModal
          entry={passcodeModalPhoto}
          onUnlock={(unlockedData) => {
            const unlockedId = passcodeModalPhoto.id || passcodeModalPhoto.slug;
            setPhotos(prev => prev.map(p => {
              if (p.id === unlockedId || p.slug === unlockedId) {
                return {
                  ...p,
                  has_passcode: false,
                  content: unlockedData.content || p.content,
                  cover_image: unlockedData.cover_image || p.cover_image
                };
              }
              return p;
            }));

            const targetIdx = photos.findIndex(p => p.id === unlockedId || p.slug === unlockedId);
            if (targetIdx !== -1) {
              setSelectedPhotoIndex(targetIdx);
            }
            setPasscodeModalPhoto(null);
          }}
          onClose={() => setPasscodeModalPhoto(null)}
        />
      )}
    </div>
  );
}
