import React, { useEffect, useState } from 'react';
import { Lightbulb, Coffee, Heart, Sparkles } from 'lucide-react';

export default function Reactions({ postId }) {
  const [counts, setCounts] = useState({ thoughtful: 0, cozy: 0, loved: 0, inspiring: 0 });
  const [userReacted, setUserReacted] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!postId) return;
    fetch(`/api/posts/${postId}/reactions`)
      .then(res => res.json())
      .then(data => setCounts(data))
      .catch(() => {})
      .finally(() => setLoading(false));

    try {
      const stored = localStorage.getItem(`reacted_${postId}`);
      if (stored) {
        setUserReacted(JSON.parse(stored));
      }
    } catch (e) {}
  }, [postId]);

  const handleReact = (type) => {
    if (userReacted[type]) return; // Prevent spamming same reaction

    // Optimistic UI update
    setCounts(prev => ({ ...prev, [type]: (prev[type] || 0) + 1 }));
    const newReacted = { ...userReacted, [type]: true };
    setUserReacted(newReacted);

    try {
      localStorage.setItem(`reacted_${postId}`, JSON.stringify(newReacted));
    } catch (e) {}

    fetch(`/api/posts/${postId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction_type: type })
    })
      .then(res => res.json())
      .then(data => setCounts(data))
      .catch(() => {});
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

      <div className="flex flex-wrap justify-center items-center gap-3">
        {reactionButtons.map(item => {
          const Icon = item.icon;
          const count = counts[item.key] || 0;
          const hasReacted = !!userReacted[item.key];
          return (
            <button
              key={item.key}
              onClick={() => handleReact(item.key)}
              disabled={hasReacted}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-sans transition-all cursor-pointer ${
                hasReacted
                  ? 'font-medium scale-105 shadow-sm'
                  : 'border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-warm)] hover:text-[var(--accent-warm)] bg-[var(--code-bg)]'
              }`}
              style={hasReacted ? { backgroundColor: 'var(--accent-warm)', color: '#ffffff', borderColor: 'var(--accent-warm)' } : {}}
              title={`Mark as ${item.label}`}
            >
              <Icon className="w-3.5 h-3.5" style={hasReacted ? { color: '#ffffff' } : { color: 'var(--accent-warm)' }} />
              <span style={hasReacted ? { color: '#ffffff' } : {}} className={hasReacted ? 'font-medium' : ''}>{item.label}</span>
              <span style={hasReacted ? { color: '#ffffff', opacity: 0.9 } : { opacity: 0.75 }} className="text-[10px] font-mono ml-0.5">
                ({count})
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
