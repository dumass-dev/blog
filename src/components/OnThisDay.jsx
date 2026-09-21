import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Calendar, ArrowRight } from 'lucide-react';

import { supabase, safeApiFetch } from '../supabase';
import { stripMarkdown } from '../utils/excerpt';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function OnThisDay() {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    const loadOnThisDay = async () => {
      const data = await safeApiFetch('/api/posts/on-this-day');
      if (Array.isArray(data) && data.length > 0) {
        setEntries(data);
        return;
      }

      // Direct Supabase fallback
      try {
        const today = new Date();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');

        const { data: supaPosts } = await supabase
          .from('public_published_entries')
          .select('*')
          .order('date', { ascending: false });

        const matched = (supaPosts || []).filter(post => {
          if (!post.date) return false;
          const d = new Date(post.date);
          const postMonth = String(d.getMonth() + 1).padStart(2, '0');
          const postDay = String(d.getDate()).padStart(2, '0');
          return postMonth === month && postDay === day && d.getFullYear() < today.getFullYear();
        });

        setEntries(matched);
      } catch {
        setEntries([]);
      }
    };

    loadOnThisDay();
  }, []);

  if (!entries || entries.length === 0) return null;

  const firstEntry = entries[0];

  return (
    <div className="mb-10 p-4 sm:p-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--code-bg)] relative overflow-hidden group">
      <div className="flex items-center gap-2 text-xs font-sans text-[var(--accent-warm)] uppercase tracking-widest font-medium mb-2">
        <Sparkles className="w-3.5 h-3.5" />
        <span>On This Day — Throwback Memory</span>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="text-xs font-sans text-[var(--text-muted)] mb-1 flex items-center gap-2">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(firstEntry.date)}</span>
          </div>
          <h3 className="text-lg font-serif font-medium text-[var(--text-primary)]">
            <Link to={`/entry/${firstEntry.slug}`} className="hover:text-[var(--accent-warm)] transition-colors">
              {firstEntry.title}
            </Link>
          </h3>
          {firstEntry.excerpt && (
            <p className="text-xs font-serif italic text-[var(--text-secondary)] mt-1 line-clamp-2">
              "{stripMarkdown(firstEntry.excerpt)}"
            </p>
          )}
        </div>

        <Link
          to={`/entry/${firstEntry.slug}`}
          className="quiet-button-secondary text-xs shrink-0 flex items-center gap-1.5"
        >
          <span>Revisit memory</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
