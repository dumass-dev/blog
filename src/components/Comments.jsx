import React, { useEffect, useState } from 'react';
import { MessageSquare, Send, User, Trash2 } from 'lucide-react';
import { supabase, safeApiFetch, subscribeToComments } from '../supabase';
import { useAuth } from '../context/AuthContext';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Comments({ postId }) {
  const { isAdmin, token } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authorName, setAuthorName] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!postId) return;
    let isMounted = true;

    const loadComments = async () => {
      try {
        let realPostId = postId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(postId);
        if (!isUuid) {
          const { data: posts } = await supabase.from('entries').select('id').eq('slug', postId);
          if (posts && posts[0]) realPostId = posts[0].id;
        }

        const { data: supaComments } = await supabase
          .from('comments')
          .select('*')
          .eq('post_id', realPostId)
          .order('created_at', { ascending: true });

        if (isMounted) {
          setComments(supaComments || []);
          setLoading(false);
        }
      } catch {
        if (isMounted) {
          setComments([]);
          setLoading(false);
        }
      }
    };

    loadComments();
    const unsubscribe = subscribeToComments(postId, () => {
      loadComments();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [postId]);

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;
    setDeletingId(commentId);
    setError(null);

    let deleted = false;
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) deleted = true;
    } catch {
      // Fallback
    }

    if (!deleted) {
      try {
        const { error: supaErr } = await supabase.from('comments').delete().eq('id', commentId);
        if (supaErr) throw supaErr;
        deleted = true;
      } catch (err) {
        setError(err.message || 'Failed deleting comment.');
      }
    }

    if (deleted) {
      setComments(prev => prev.filter(c => c.id !== commentId));
    }
    setDeletingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    setSubmitting(true);
    setError(null);
    setMessage(null);

    const name = authorName && authorName.trim() ? authorName.trim() : 'Anonymous Reader';
    let newComment = null;

    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author_name: name, content: content.trim() })
      });

      if (res.ok) {
        newComment = await res.json();
      }
    } catch {
      // API call failed, fallback to direct Supabase
    }

    if (!newComment) {
      try {
        let realPostId = postId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(postId);
        if (!isUuid) {
          const { data: posts } = await supabase.from('entries').select('id').eq('slug', postId);
          if (!posts || !posts[0]) throw new Error('Entry not found.');
          realPostId = posts[0].id;
        }

        const { data: supaInserted, error: supaErr } = await supabase
          .from('comments')
          .insert([{ post_id: realPostId, author_name: name, content: content.trim() }])
          .select('*')
          .single();

        if (supaErr) throw supaErr;
        newComment = supaInserted;
      } catch (err) {
        setError(err.message || 'Failed posting comment.');
        setSubmitting(false);
        return;
      }
    }

    setComments(prev => [...prev, newComment]);
    setContent('');
    setMessage('Your comment has been posted.');
    setTimeout(() => setMessage(null), 3000);
    setSubmitting(false);
  };

  return (
    <section className="py-8 border-t border-[var(--border-subtle)] my-10">
      <div className="flex items-center gap-2 text-base font-sans font-medium text-[var(--text-primary)] mb-6">
        <MessageSquare className="w-4 h-4 text-[var(--accent-warm)]" />
        <span>Reader Comments ({comments.length})</span>
      </div>

      {/* Existing Comments List */}
      <div className="space-y-4 mb-8">
        {loading ? (
          <div className="text-xs font-sans text-[var(--text-muted)] italic py-4">
            Loading comments...
          </div>
        ) : comments.length === 0 ? (
          <div className="text-xs font-sans text-[var(--text-muted)] py-4 italic">
            No comments yet. Be the first to leave a thought below.
          </div>
        ) : (
          comments.map(item => (
            <div
              key={item.id}
              className="p-4 rounded border border-[var(--border-subtle)] bg-[var(--card-bg)] text-xs font-sans space-y-1.5"
            >
              <div className="flex justify-between items-center text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                  <User className="w-3 h-3 text-[var(--accent-warm)] opacity-80" />
                  <span>{item.author_name}</span>
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-[var(--text-muted)]">{formatDate(item.created_at)}</span>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteComment(item.id)}
                      disabled={deletingId === item.id}
                      className="text-red-500/80 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-500/10 inline-flex items-center gap-1 text-[11px] font-sans border border-transparent hover:border-red-500/20"
                      title="Delete Comment"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{deletingId === item.id ? 'Deleting...' : 'Delete'}</span>
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[var(--text-primary)] font-serif text-sm leading-relaxed whitespace-pre-wrap pt-1">
                {item.content}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Add Comment Form */}
      <form onSubmit={handleSubmit} className="p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--code-bg)] space-y-3">
        <div className="text-xs font-sans font-medium uppercase tracking-wider text-[var(--text-secondary)]">
          Leave a Thought
        </div>

        {message && (
          <div className="p-2 bg-[var(--card-bg)] text-[var(--text-primary)] text-xs font-sans rounded border border-[var(--border-subtle)]">
            {message}
          </div>
        )}

        {error && (
          <div className="p-2 bg-[var(--card-bg)] text-[var(--text-primary)] text-xs font-sans rounded border border-[var(--border-subtle)]">
            {error}
          </div>
        )}

        <div>
          <input
            type="text"
            value={authorName}
            onChange={e => setAuthorName(e.target.value)}
            placeholder="Name (optional)"
            className="quiet-input text-xs"
          />
        </div>

        <div>
          <textarea
            rows={3}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Share your reflection or response..."
            className="quiet-input text-xs font-serif leading-relaxed"
            required
          />
        </div>

        <div className="text-right">
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            className="quiet-button text-xs py-1.5 px-4 inline-flex items-center gap-1.5"
          >
            <Send className="w-3 h-3" />
            <span>{submitting ? 'Posting...' : 'Post Comment'}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
