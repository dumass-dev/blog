import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { supabase, safeApiFetch } from '../supabase';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export default function Writing() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWritingEntries = async () => {
      setLoading(true);
      const data = await safeApiFetch('/api/posts?type=writing&status=published');
      if (Array.isArray(data)) {
        setEntries(data);
        setLoading(false);
        return;
      }

      // Direct Supabase fallback
      try {
        const { data: supaPosts } = await supabase
          .from('entries')
          .select('*')
          .eq('type', 'writing')
          .neq('status', 'draft')
          .order('date', { ascending: false });

        setEntries(supaPosts || []);
      } catch (e) {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };

    loadWritingEntries();
  }, []);

  return (
    <div className="notebook-container">
      <header className="mb-12">
        <h1 className="text-3xl font-serif font-medium tracking-tight mb-2">Writing</h1>
        <p className="text-sm font-sans text-[var(--text-secondary)]">
          Essays, technical notes, software reflections, and long-form articles.
        </p>
      </header>

      {loading ? (
        <div className="py-12 text-center text-sm font-sans text-[var(--text-muted)] italic">
          Loading essays & writing...
        </div>
      ) : entries.length === 0 ? (
        <div className="py-12 text-center text-sm font-sans text-[var(--text-muted)]">
          No writing published yet.
        </div>
      ) : (
        <div className="space-y-12">
          {entries.map((item) => (
            <article key={item.id} className="pb-10 border-b border-[var(--border-subtle)] last:border-0">
              <div className="flex items-center gap-3 mb-1">
                <time className="text-xs font-sans text-[var(--text-muted)] tracking-wide">
                  {formatDate(item.date)}
                </time>
                {item.has_passcode && (
                  <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-[var(--code-bg)] text-[var(--text-primary)] border border-[var(--border-subtle)] flex items-center gap-1 font-medium font-sans">
                    <Lock className="w-2.5 h-2.5" />
                    <span>Protected</span>
                  </span>
                )}
              </div>

              <h2 className="text-2xl font-serif font-medium tracking-tight mb-3">
                <Link to={`/entry/${item.slug}`} className="hover:text-[var(--accent-warm)] transition-colors">
                  {item.title}
                </Link>
              </h2>

              <p className="text-[var(--text-secondary)] font-serif text-lg leading-relaxed mb-4">
                {item.excerpt || (item.content.length > 220 ? item.content.substring(0, 220) + '...' : item.content)}
              </p>

              <Link
                to={`/entry/${item.slug}`}
                className="text-xs font-sans tracking-wider text-[var(--text-primary)] uppercase underline underline-offset-4 decoration-[var(--border-subtle)] hover:decoration-[var(--accent-warm)] transition-colors"
              >
                Read essay →
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
