import React, { useState } from 'react';
import { Lock, KeyRound, ArrowRight, X } from 'lucide-react';
import { supabase } from '../supabase';

export default function ProtectedEntryModal({ postId, entry, onUnlock, onSuccess, onClose }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const targetId = postId || (entry && (entry.id || entry.slug));
  const isModal = Boolean(onClose || entry);

  const handleSuccess = (unlockedData) => {
    if (onUnlock) onUnlock(unlockedData);
    if (onSuccess) onSuccess(unlockedData);
    if (onClose) onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!passcode.trim()) return;

    setVerifying(true);
    setError(null);

    if (!targetId) {
      setError('Entry reference missing.');
      setVerifying(false);
      return;
    }

    try {
      const res = await fetch(`/api/posts/${targetId}/verify-passcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim() })
      });

      if (res.ok) {
        const data = await res.json();
        handleSuccess(data);
        setVerifying(false);
        return;
      }
    } catch {
      // API call failed, continue to Supabase fallback
    }

    // Direct Supabase fallback
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
      let query = supabase.from('entries').select('*');
      if (isUuid) {
        query = query.eq('id', targetId);
      } else {
        query = query.eq('slug', targetId);
      }

      const { data: posts } = await query;
      const post = posts && posts[0];

      if (!post) throw new Error('Entry not found.');

      if (post.passcode && post.passcode.trim() === passcode.trim()) {
        handleSuccess({
          unlocked: true,
          content: post.content,
          cover_image: post.cover_image,
          excerpt: post.excerpt
        });
        return;
      }

      throw new Error('Incorrect passcode.');
    } catch (err) {
      setError(err.message || 'Incorrect passcode.');
    } finally {
      setVerifying(false);
    }
  };

  const modalBody = (
    <div className="relative p-8 border border-[var(--border-subtle)] rounded-xl bg-[var(--card-bg)] text-center max-w-md w-full mx-auto shadow-2xl">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="w-12 h-12 rounded-full bg-[var(--code-bg)] border border-[var(--border-subtle)] flex items-center justify-center mx-auto mb-4 text-[var(--accent-warm)]">
        <Lock className="w-5 h-5" />
      </div>

      <h2 className="text-xl font-serif font-medium mb-2 text-[var(--text-primary)]">Protected Photo / Entry</h2>
      <p className="text-xs font-sans text-[var(--text-secondary)] mb-6 leading-relaxed">
        This entry is private and locked with a passcode.
      </p>

      {error && (
        <div className="mb-4 p-2 bg.red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs font-sans rounded border border-red-200 dark:border-red-900/50">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <input
            type="password"
            value={passcode}
            onChange={e => setPasscode(e.target.value)}
            placeholder="Enter passcode..."
            className="quiet-input text-center text-sm tracking-widest font-mono w-full"
            autoFocus
          />
          <KeyRound className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-3" />
        </div>

        <button
          type="submit"
          disabled={verifying}
          className="quiet-button w-full text-xs py-2.5 flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>{verifying ? 'Verifying...' : 'Unlock & View Content'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );

  if (isModal) {
    return (
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
        onClick={(e) => {
          if (e.target === e.currentTarget && onClose) onClose();
        }}
      >
        {modalBody}
      </div>
    );
  }

  return <div className="my-12">{modalBody}</div>;
}
