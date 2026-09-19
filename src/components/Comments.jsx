import React, { useEffect, useState } from 'react';
import { MessageSquare, Send, User } from 'lucide-react';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Comments({ postId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authorName, setAuthorName] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    fetch(`/api/posts/${postId}/comments`)
      .then(res => res.json())
      .then(data => setComments(Array.isArray(data) ? data : []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [postId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author_name: authorName, content: content.trim() })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed posting comment.');

      setComments(prev => [...prev, data]);
      setContent('');
      setMessage('Your comment has been posted.');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
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
                <span className="text-[10px] text-[var(--text-muted)]">{formatDate(item.created_at)}</span>
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
            placeholder="Your Name (optional, defaults to Anonymous Reader)"
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
