import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export default function Archive() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeYear = searchParams.get('year');
  const activeMonth = searchParams.get('month');
  const initialQuery = searchParams.get('q') || searchParams.get('tag') || '';

  const [archiveTree, setArchiveTree] = useState({});
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(true);

  // Load Archive Tree (Years & Months)
  useEffect(() => {
    fetch('/api/archive')
      .then(res => res.json())
      .then(data => setArchiveTree(data))
      .catch(err => console.error(err));
  }, []);

  // Fetch entries if month or search query is active
  useEffect(() => {
    setLoading(true);
    let url = '/api/posts?status=published';

    if (searchQuery) {
      url += `&search=${encodeURIComponent(searchQuery)}`;
    } else if (activeYear && activeMonth) {
      url += `&year=${activeYear}&month=${activeMonth}`;
    }

    fetch(url)
      .then(res => res.json())
      .then(data => setSearchResults(data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [searchQuery, activeYear, activeMonth]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSearchParams({ q: searchQuery.trim() });
    } else {
      setSearchParams({});
    }
  };

  const clearFilter = () => {
    setSearchQuery('');
    setSearchParams({});
  };

  return (
    <div className="notebook-container">
      <header className="mb-10">
        <h1 className="text-3xl font-serif font-medium tracking-tight mb-2">Archive</h1>
        <p className="text-sm font-sans text-[var(--text-secondary)] mb-6">
          A full chronological index of everything written and logged.
        </p>

        {/* Minimal Search Bar */}
        <form onSubmit={handleSearchSubmit} className="relative max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entries, topics, or tags..."
            className="quiet-input pl-10 text-sm"
          />
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-3" />
          {searchQuery && (
            <button
              type="button"
              onClick={clearFilter}
              className="absolute right-3 top-2.5 text-xs font-sans text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Clear
            </button>
          )}
        </form>
      </header>

      {/* Active Filter Title */}
      {(searchQuery || (activeYear && activeMonth)) && (
        <div className="mb-8 p-3 rounded border border-[var(--border-subtle)] text-xs font-sans flex justify-between items-center">
          <div>
            Showing results for:{' '}
            <span className="font-medium text-[var(--text-primary)]">
              {searchQuery ? `"${searchQuery}"` : `${activeYear} / Month ${activeMonth}`}
            </span>{' '}
            ({searchResults.length} entries found)
          </div>
          <button onClick={clearFilter} className="underline text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            Reset view
          </button>
        </div>
      )}

      {/* Results View when filtered */}
      {(searchQuery || (activeYear && activeMonth)) ? (
        <div className="space-y-6">
          {loading ? (
            <div className="py-8 text-center text-sm font-sans text-[var(--text-muted)] italic">
              Searching archive...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-8 text-center text-sm font-sans text-[var(--text-muted)]">
              No entries found matching your criteria.
            </div>
          ) : (
            searchResults.map(item => (
              <article key={item.id} className="pb-4 border-b border-[var(--border-subtle)]">
                <div className="text-xs font-sans text-[var(--text-muted)] mb-1">
                  {formatDate(item.date)} · <span className="uppercase">{item.type}</span>
                </div>
                <h3 className="text-xl font-serif font-medium mb-1">
                  <Link to={`/entry/${item.slug}`} className="hover:text-[var(--accent-warm)] transition-colors">
                    {item.title}
                  </Link>
                </h3>
                <p className="text-sm font-serif text-[var(--text-secondary)] line-clamp-2">
                  {item.excerpt || item.content}
                </p>
              </article>
            ))
          )}
        </div>
      ) : (
        /* Standard Archive Year/Month Tree */
        <div className="space-y-10">
          {Object.keys(archiveTree).length === 0 ? (
            <div className="py-8 text-center text-sm font-sans text-[var(--text-muted)]">
              Archive is empty.
            </div>
          ) : (
            Object.keys(archiveTree).map(year => (
              <div key={year} className="border-b border-[var(--border-subtle)] pb-8">
                <h2 className="text-2xl font-serif font-medium mb-4 text-[var(--text-primary)]">
                  {year}
                </h2>
                <ul className="space-y-2 text-sm font-sans">
                  {archiveTree[year].map(monthItem => (
                    <li key={monthItem.monthNum} className="flex items-center space-x-3">
                      <Link
                        to={`/archive?year=${year}&month=${monthItem.monthNum}`}
                        className="hover:text-[var(--accent-warm)] underline underline-offset-4 text-[var(--text-primary)]"
                      >
                        {monthItem.monthName}
                      </Link>
                      <span className="text-xs text-[var(--text-muted)]">
                        — {monthItem.count} {monthItem.count === 1 ? 'entry' : 'entries'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
