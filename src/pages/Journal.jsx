import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { fetchPublishedEntries, subscribeToEntries } from '../supabase';
import { stripMarkdown } from '../utils/excerpt';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export default function Journal() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadJournalEntries = async () => {
      const data = await fetchPublishedEntries({ type: 'journal' });
      if (isMounted) {
        const journalOnly = (Array.isArray(data) ? data : []).filter(item => 
          item.type !== 'photo' && 
          (!item.category || item.category.toLowerCase() !== 'photos')
        );
        setEntries(journalOnly);
        setLoading(false);
      }
    };

    loadJournalEntries();
    const unsubscribe = subscribeToEntries(() => {
      loadJournalEntries();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="notebook-container">
      <header className="mb-12">
        <h1 className="text-3xl font-serif font-medium tracking-tight mb-2">Journal</h1>
        <p className="text-sm font-sans text-[var(--text-secondary)]">
          Personal thoughts, daily notebook entries, and life logs.
        </p>
      </header>

      {loading ? (
        <div className="py-12 text-center text-sm font-sans text-[var(--text-muted)] italic">
          Loading journal entries...
        </div>
      ) : entries.length === 0 ? (
        <div className="py-12 text-center text-sm font-sans text-[var(--text-muted)]">
          No journal entries published yet.
        </div>
      ) : (
        <div className="space-y-12">
          {entries.map((item) => (
            <article key={item.id} className="pb-8 border-b border-[var(--border-subtle)] last:border-0">
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

              <h2 className="text-2xl font-serif font-medium tracking-tight mb-2">
                <Link to={`/entry/${item.slug}`} className="hover:text-[var(--accent-warm)] transition-colors">
                  {item.title}
                </Link>
              </h2>

              <p className="text-[var(--text-secondary)] font-serif text-lg leading-relaxed mb-4">
                {stripMarkdown(item.excerpt || (item.content.length > 200 ? item.content.substring(0, 200) + '...' : item.content))}
              </p>

              {item.tags && (
                <div className="flex flex-wrap gap-2 text-xs font-sans text-[var(--text-muted)] mb-3 min-w-0 max-w-full">
                  {item.tags.split(',').map((tag, idx) => (
                    <span key={`${tag.trim()}-${idx}`} className="hover:text-[var(--text-primary)] inline-block max-w-full truncate">
                      #{tag.trim()}
                    </span>
                  ))}
                </div>
              )}

              <Link
                to={`/entry/${item.slug}`}
                className="text-xs font-sans tracking-wider text-[var(--text-primary)] uppercase underline underline-offset-4 decoration-[var(--border-subtle)] hover:decoration-[var(--accent-warm)] transition-colors"
              >
                Read entry →
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
