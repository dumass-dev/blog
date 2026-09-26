import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, MapPin, Calendar, Image as ImageIcon, Send, Heart } from 'lucide-react';
import { formatDate } from '../utils/date';
import ProtectedEntryModal from '../components/ProtectedEntryModal';
import { shouldShowCommentsAndReactions } from '../utils/entry';
import { supabase } from '../supabase';

import useDocumentMeta from '../hooks/useDocumentMeta';
import { useFeedData } from '../hooks/useFeedData';
import FeedSkeleton from '../components/FeedSkeleton';
import ProgressiveImage from '../components/ProgressiveImage';

export default function Photos() {
  useDocumentMeta({
    title: 'Photos',
    description: 'Visual journal, moments & Backblaze film archives.'
  });

  const { displayedEntries: photos, loading, refetch } = useFeedData({
    type: 'photo',
    pageSize: 12
  });

  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
  
  // Interactions for active lightbox photo
  const [reactions, setReactions] = useState({ hearts: 0, userLiked: false });
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState({ name: '', text: '' });
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState(null);
  
  // Passcode modal state
  const [passcodeModalPhoto, setPasscodeModalPhoto] = useState(null);

  const activePhoto = selectedPhotoIndex !== null ? photos[selectedPhotoIndex] : null;

  // Load interactions when a lightbox photo is selected
  useEffect(() => {
    if (!activePhoto) return;

    const loadInteractions = () => {
      // Fetch reactions
      fetch(`/api/posts/${activePhoto.id}/reactions`)
        .then(res => res.json())
        .then(data => {
          setReactions(prev => ({ ...prev, hearts: data.hearts || 0 }));
        })
        .catch(() => {});

      // Fetch comments
      fetch(`/api/posts/${activePhoto.id}/comments`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setComments(data);
        })
        .catch(() => {});
    };

    loadInteractions();

    const handleComments = (e) => {
      if (!e.detail?.postId || e.detail.postId === activePhoto.id) {
        loadInteractions();
      }
    };

    const handleReactions = (e) => {
      if (!e.detail?.postId || e.detail.postId === activePhoto.id) {
        loadInteractions();
      }
    };

    window.addEventListener('comments-updated', handleComments);
    window.addEventListener('reactions-updated', handleReactions);
    return () => {
      window.removeEventListener('comments-updated', handleComments);
      window.removeEventListener('reactions-updated', handleReactions);
    };
  }, [activePhoto]);

  const navigatePhoto = useCallback((direction) => {
    if (selectedPhotoIndex === null) return;
    const newIdx = selectedPhotoIndex + direction;
    if (newIdx >= 0 && newIdx < photos.length) {
      setSelectedPhotoIndex(newIdx);
    }
  }, [selectedPhotoIndex, photos.length]);

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
  }, [selectedPhotoIndex, photos.length, navigatePhoto]);

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

    setCommentError(null);
    setSubmittingComment(true);

    const name = newComment.name.trim() || 'Anonymous Reader';
    const content = newComment.text.trim();
    const tempId = `temp-${Date.now()}`;
    const optimisticComment = {
      id: tempId,
      post_id: activePhoto.id,
      author_name: name,
      content,
      created_at: new Date().toISOString()
    };

    setComments(prev => [...prev, optimisticComment]);
    setNewComment({ name: '', text: '' });

    let realComment = null;
    let apiErrorMsg = null;

    try {
      const res = await fetch(`/api/posts/${activePhoto.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author_name: name,
          content
        })
      });

      if (res.ok) {
        realComment = await res.json();
      } else {
        const errJson = await res.json().catch(() => ({}));
        apiErrorMsg = errJson.error || 'Failed to post comment.';
      }
    } catch {
      // API call failed, fallback to direct Supabase client
    }

    if (!realComment) {
      try {
        const { data: supaInserted, error: supaErr } = await supabase
          .from('comments')
          .insert([{ post_id: activePhoto.id, author_name: name, content }])
          .select('*')
          .single();

        if (supaErr) throw supaErr;
        realComment = supaInserted;
      } catch (err) {
        setComments(prev => prev.filter(c => c.id !== tempId));
        setCommentError(apiErrorMsg || err.message || 'Failed posting comment.');
        setSubmittingComment(false);
        return;
      }
    }

    if (realComment) {
      setComments(prev => prev.map(c => (c.id === tempId ? realComment : c)));
    }
    setSubmittingComment(false);
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
    let src = item.cover_image && item.cover_image.trim();
    if (src && /q04ti-quote|quote-/i.test(src)) {
      src = null;
    }
    if (!src && item.content) {
      const matches = [...item.content.matchAll(/!\[.*?\]\((.*?)\)/g)].map(m => m[1])
        .concat([...item.content.matchAll(/https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\\s?#]+\.[a-z0-9]+[^\s)"]*/gi)].map(m => m[0]));
      src = matches.find(url => !/q04ti-quote|quote-/i.test(url)) || matches[0] || null;
    }
    return src;
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
      <div className="border-b border-[var(--border-subtle)] pb-6 mb-8">
        <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-[var(--text-primary)] font-normal">
          Photos
        </h1>
        <p className="font-sans text-xs sm:text-sm text-[var(--text-muted)] mt-1">
          Visual journal, moments & Backblaze film archives ({photos.length} captures)
        </p>
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <FeedSkeleton type="photo" count={6} />
      ) : photos.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[var(--border-subtle)] rounded-lg">
          <ImageIcon className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3 opacity-50" />
          <p className="font-serif text-lg text-[var(--text-primary)]">No photos published yet</p>
          <p className="font-sans text-xs text-[var(--text-muted)] mt-1">
            Check back soon for new visual captures.
          </p>
        </div>
      ) : (
        /* GRID VIEW (3-column Instagram style) */
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
          {photos.map((item, idx) => {
            const imgSrc = getPhotoSrc(item);
            const isProtected = item.has_passcode && item.content && item.content.includes('🔒');

            return (
              <div
                key={item.id || idx}
                onClick={() => openPhoto(item, idx)}
                className={`group relative aspect-square bg-[var(--code-bg)] rounded-md overflow-hidden border border-[var(--border-subtle)] cursor-pointer select-none animate-content-fade stagger-${Math.min(idx + 1, 6)}`}
              >
                {imgSrc ? (
                  <ProgressiveImage
                    src={imgSrc}
                    alt={item.title || 'Photo'}
                    aspectRatio="aspect-square"
                    imgClassName="transition-transform duration-300 group-hover:scale-105"
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
          <div className="relative w-full max-w-4xl max-h-[85vh] bg-[var(--bg-main)] rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row border border-[var(--border-subtle)]">
            {/* Image Viewport Column */}
            <div className="md:w-7/12 lg:w-7/12 bg-black flex items-center justify-center relative min-h-[260px] max-h-[50vh] md:max-h-[85vh] p-4 select-none">
              {/* High-visibility Close Button strictly on Photo Container Top-Left */}
              <button
                onClick={() => setSelectedPhotoIndex(null)}
                className="lightbox-close-btn w-11 h-11 min-w-[44px] min-h-[44px] shrink-0"
                style={{ width: '44px', height: '44px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', backgroundColor: 'transparent', boxShadow: 'none' }}
                aria-label="Close photo view"
                title="Close photo"
              >
                <X className="w-5 h-5 text-white" />
              </button>

              {getPhotoSrc(activePhoto) ? (
                <ProgressiveImage
                  src={getPhotoSrc(activePhoto)}
                  alt={activePhoto.title || 'Photo'}
                  objectFit="object-contain"
                  className="max-w-full max-h-[48vh] md:max-h-[75vh] rounded shadow-lg"
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
                  <div className="pb-3 text-[var(--text-primary)] leading-relaxed break-words">
                    {getCleanCaption(activePhoto)}
                  </div>
                )}

                {shouldShowCommentsAndReactions(activePhoto) && (
                  <>
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
                  </>
                )}
              </div>

              {/* Add Comment Input Form */}
              {shouldShowCommentsAndReactions(activePhoto) && (
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
                  {commentError && (
                    <p className="text-red-500 text-[11px] font-sans px-1 pt-0.5">{commentError}</p>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Protected Entry Modal for Passcode-Locked Photos */}
      {passcodeModalPhoto && (
        <ProtectedEntryModal
          entry={passcodeModalPhoto}
          onUnlock={(_unlockedData) => {
            refetch();
            setPasscodeModalPhoto(null);
          }}
          onClose={() => setPasscodeModalPhoto(null)}
        />
      )}
    </div>
  );
}
