import React, { useState } from 'react';
import { Lock, KeyRound, ArrowRight } from 'lucide-react';
import { supabase } from '../supabase';

export default function ProtectedEntryModal({ postId, onUnlock }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!passcode.trim()) return;

    setVerifying(true);
    setError(null);

    // Verify passcode via RPC call or backend API server
    try {
      // 1. Try server API endpoint
      const res = await fetch(`/api/posts/${postId}/verify-passcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim() })
      });

      if (res.ok) {
        const data = await res.json();
        onUnlock(data);
        setVerifying(false);
        return;
      }
    } catch {}

    // 2. Direct Supabase RPC fallback
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('verify_entry_passcode', {
        p_slug: String(postId),
        p_passcode: passcode.trim()
      });

      if (rpcErr) throw rpcErr;

      if (rpcRes && rpcRes.success) {
        onUnlock({
          unlocked: true,
          content: rpcRes.content,
          cover_image: rpcRes.cover_image,
          excerpt: rpcRes.excerpt
        });
        return;
      }

      throw new Error(rpcRes?.error || 'Incorrect passcode.');
    } catch (err) {
      setError(err.message || 'Incorrect passcode.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="my-12 p-8 border border-[var(--border-subtle)] rounded-lg bg-[var(--card-bg)] text-center max-w-md mx-auto shadow-md">
      <div className="w-12 h-12 rounded-full bg-[var(--code-bg)] border border-[var(--border-subtle)] flex items-center justify-center mx-auto mb-4 text-[var(--accent-warm)]">
        <Lock className="w-5 h-5" />
      </div>

      <h2 className="text-xl font-serif font-medium mb-2">Protected Entry</h2>
      <p className="text-xs font-sans text-[var(--text-secondary)] mb-6 leading-relaxed">
        This journal entry is private and locked with a personal passcode.
      </p>

      {error && (
        <div className="mb-4 p-2 bg-[var(--code-bg)] text-[var(--text-primary)] text-xs font-sans rounded border border-[var(--border-subtle)]">
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
            className="quiet-input text-center text-sm tracking-widest font-mono"
            autoFocus
          />
          <KeyRound className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-3" />
        </div>

        <button
          type="submit"
          disabled={verifying}
          className="quiet-button w-full text-xs py-2.5 flex items-center justify-center gap-2"
        >
          <span>{verifying ? 'Verifying...' : 'Unlock & Read Entry'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
