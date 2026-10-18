import React, { useEffect, useState } from 'react';
import useDocumentMeta from '../hooks/useDocumentMeta';
import GitHubContributions from '../components/GitHubContributions';
import { ExternalLink, Code2 } from 'lucide-react';

export default function Activity() {
  useDocumentMeta({
    title: 'Activity',
    description: 'GitHub contribution graph, open-source activity, and software commits.'
  });

  const [githubUrl, setGithubUrl] = useState(() => {
    try {
      const cached = localStorage.getItem('cached_about_data');
      if (cached) {
        const data = JSON.parse(cached);
        const ghLink = (data?.links || []).find(l => (l.url && l.url.includes('github.com')) || (l.label && l.label.toLowerCase().includes('github')));
        if (ghLink && ghLink.url) return ghLink.url;
      }
    } catch {}
    return 'https://github.com/shuaib-mk';
  });

  useEffect(() => {
    fetch('/api/about')
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.links)) {
          const ghLink = data.links.find(l => (l.url && l.url.includes('github.com')) || (l.label && l.label.toLowerCase().includes('github')));
          if (ghLink && ghLink.url) {
            setGithubUrl(ghLink.url);
          }
        }
      })
      .catch(() => {});
  }, []);

  const extractedUser = (() => {
    try {
      const match = githubUrl.match(/github\.com\/([^/?#]+)/i);
      return match ? match[1] : 'shuaib-mk,q04ti';
    } catch {
      return 'shuaib-mk,q04ti';
    }
  })();

  return (
    <div className="notebook-container py-4 sm:py-8 animate-content-fade">
      {/* Page Header */}
      <div className="mb-8 pb-6 border-b border-[var(--border-subtle)]">
        <div className="text-xs font-sans font-medium text-[var(--text-muted)] tracking-wider uppercase mb-2">
          Open Source & Code Log
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-normal text-[var(--text-primary)] tracking-tight mb-3">
          Activity
        </h1>
        <p className="text-sm sm:text-base font-serif italic text-[var(--text-secondary)] max-w-xl">
          Real-time record of GitHub commits, repositories, and ongoing coding work.
        </p>
      </div>

      {/* GitHub Contributions Component */}
      <section className="mb-10" aria-label="GitHub Contribution Heatmap">
        <GitHubContributions username={extractedUser} showHeader={true} compact={false} />
      </section>

      {/* Info Card / External Link */}
      <div className="p-4 sm:p-5 rounded-xl border border-[var(--border-subtle)] bg-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-sans text-[var(--text-secondary)]">
        <div className="flex items-center gap-3">
          <Code2 className="w-4 h-4 text-[var(--accent-warm)]" />
          <span>
            Explore public repositories and source code on GitHub.
          </span>
        </div>
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-subtle)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)] transition-all font-medium self-start sm:self-auto"
        >
          <span>Follow on GitHub</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
