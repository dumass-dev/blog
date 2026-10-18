import React, { useEffect, useState } from 'react';

export default function Footer() {
  const [authorName, setAuthorName] = useState(() => {
    try {
      const stored = localStorage.getItem('site_author_name');
      if (stored && stored.trim()) return stored.trim();
      const cached = localStorage.getItem('cached_about_data');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.author_name && parsed.author_name.trim()) return parsed.author_name.trim();
      }
    } catch {}
    return 'q04ti';
  });

  useEffect(() => {
    const handleUpdate = (e) => {
      const author = e.detail?.data?.author_name || e.detail?.payload?.author_name || e.detail?.author_name;
      if (author && author.trim()) {
        setAuthorName(author.trim());
      }
    };
    window.addEventListener('about-data-updated', handleUpdate);
    window.addEventListener('site-settings-updated', handleUpdate);
    return () => {
      window.removeEventListener('about-data-updated', handleUpdate);
      window.removeEventListener('site-settings-updated', handleUpdate);
    };
  }, []);

  return (
    <footer className="mt-20 pt-8 pb-12 border-t border-[var(--border-subtle)] text-xs font-sans text-[var(--text-muted)] text-center sm:text-left">
      <div className="notebook-container flex justify-center sm:justify-between items-center">
        <div>
          © {new Date().getFullYear()} {authorName}. Built for quiet reading.
        </div>
      </div>
    </footer>
  );
}
