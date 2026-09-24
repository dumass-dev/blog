import React, { useEffect, useState } from 'react';
import { Lightbulb, Coffee, Heart, Sparkles } from 'lucide-react';
import { supabase, subscribeToReactions } from '../supabase';

export default function Reactions({ postId }) {
  const [counts, setCounts] = useState({ thoughtful: 0, cozy: 0, loved: 0, inspiring: 0 });
  const [userReacted, setUserReacted] = useState({});

  useEffect(() => {
    if (!postId) return;
    let isMounted = true;

    const loadReactions = async () => {
      try {
        let realPostId = postId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(postId);
        if (!isUuid) {
          const { data: posts } = await supabase.from('public_published_entries').select('id').eq('slug', postId);
          if (posts && posts[0]) realPostId = posts[0].id;
        }

        const { data: reactions } = await supabase
          .from('reactions')
          .select('reaction_type')
          .eq('post_id', realPostId);

        const newCounts = { thoughtful: 0, cozy: 0, loved: 0, inspiring: 0 };
        (reactions || []).forEach(r => {
          if (newCounts[r.reaction_type] !== undefined) {
            newCounts[r.reaction_type]++;
          }
        });

        if (isMounted) {
          setCounts(newCounts);
        }
      } catch {
        // Keep default counts
      }

      try {
        const stored = localStorage.getItem(`reacted_${postId}`);
        if (stored && isMounted) {
          setUserReacted(JSON.parse(stored));
        }
      } catch (_e) {}
    };

    loadReactions();
    const unsubscribe = subscribeToReactions(postId, () => {
      loadReactions();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [postId]);

  const handleReact = async (type) => {
    if (userReacted[type]) return; // Prevent spamming same reaction

    // Optimistic UI update
    setCounts(prev => ({ ...prev, [type]: (prev[type] || 0) + 1 }));
    const newReacted = { ...userReacted, [type]: true };
    setUserReacted(newReacted);

    try {
      localStorage.setItem(`reacted_${postId}`, JSON.stringify(newReacted));
    } catch (_e) {}

    let updatedCounts = null;

    try {
      const res = await fetch(`/api/posts/${postId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction_type: type })
      });

      if (res.ok) {
        updatedCounts = await res.json();
      }
    } catch {
      // API call failed, fallback to direct Supabase insert
    }

    if (updatedCounts && typeof updatedCounts === 'object') {
      setCounts(updatedCounts);
    } else {
      // Direct Supabase fallback
      try {
        let realPostId = postId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(postId);
        if (!isUuid) {
          const { data: posts } = await supabase.from('entries').select('id').eq('slug', postId);
          if (posts && posts[0]) realPostId = posts[0].id;
        }

        await supabase.from('reactions').insert([{ post_id: realPostId, reaction_type: type }]);
      } catch (e) {
        console.error('Failed to post reaction to Supabase:', e);
      }
    }
  };

  const reactionButtons = [
    { key: 'thoughtful', icon: Lightbulb, label: 'Thoughtful' },
    { key: 'cozy', icon: Coffee, label: 'Cozy' },
    { key: 'loved', icon: Heart, label: 'Loved' },
    { key: 'inspiring', icon: Sparkles, label: 'Inspiring' }
  ];

  return (
    <div className="py-6 border-t border-b border-[var(--border-subtle)] my-10">
      <div className="text-xs font-sans uppercase tracking-widest text-[var(--text-muted)] font-medium text-center mb-3">
        Leave a quiet reaction
      </div>

      <div className="reaction-pills-container">
        {reactionButtons.map(item => {
          const Icon = item.icon;
          const count = counts[item.key] || 0;
          const hasReacted = !!userReacted[item.key];
          return (
            <button
              key={item.key}
              onClick={() => handleReact(item.key)}
              disabled={hasReacted}
              className={`reaction-pill flex items-center gap-1.5 px-3.5 py-2.5 rounded-full border text-xs font-sans transition-all cursor-pointer ${
                hasReacted
                  ? 'font-medium scale-105 shadow-sm'
                  : 'border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-warm)] hover:text-[var(--accent-warm)] bg-[var(--code-bg)]'
              }`}
              style={hasReacted ? { backgroundColor: 'var(--text-primary)', color: 'var(--bg-main)', borderColor: 'var(--text-primary)' } : {}}
              title={`Mark as ${item.label}`}
            >
              <Icon className="w-3.5 h-3.5" style={hasReacted ? { color: 'var(--bg-main)' } : { color: 'var(--accent-warm)' }} />
              <span style={hasReacted ? { color: 'var(--bg-main)' } : {}} className={hasReacted ? 'font-medium' : ''}>{item.label}</span>
              <span style={hasReacted ? { color: 'var(--bg-main)', opacity: 0.9 } : { opacity: 0.75 }} className="text-[10px] font-mono ml-0.5">
                ({count})
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
