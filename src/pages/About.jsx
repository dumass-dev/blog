import React, { useEffect, useState } from 'react';
import RichViewer from '../components/RichViewer';
import TypewriterText from '../components/TypewriterText';
import useDocumentMeta from '../hooks/useDocumentMeta';
import FeedSkeleton from '../components/FeedSkeleton';

const defaultAbout = {
  author_name: 'q04ti',
  tagline: 'thoughts, things I make, places I go, and everything in between.',
  bio: 'Welcome to my digital diary and visual archive. I write about software, life, photography, and building minimalist web applications.',
  projects: [
    {
      title: 'Digital Diary & Journal',
      description: 'Minimalist personal digital diary, journal, blog, life archive and private admin space.',
      link: 'https://github.com/shuaib-mk/blog'
    }
  ],
  links: [
    { label: 'GitHub', url: 'https://github.com/shuaib-mk' }
  ]
};

export default function About() {
  useDocumentMeta({
    title: 'About',
    description: 'Thoughts, things I make, places I go, and everything in between.'
  });

  const [aboutData, setAboutData] = useState(() => {
    try {
      const cached = localStorage.getItem('cached_about_data');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && (parsed.bio || (parsed.projects && parsed.projects.length > 0))) {
          return parsed;
        }
      }
    } catch {}
    return defaultAbout;
  });
  const [loading, setLoading] = useState(() => {
    try {
      return !localStorage.getItem('cached_about_data');
    } catch {
      return true;
    }
  });

  useEffect(() => {
    fetch('/api/about')
      .then(async res => {
        if (!res.ok) return null;
        const text = await res.text();
        if (!text || text.trim().startsWith('<')) return null;
        return JSON.parse(text);
      })
      .then(data => {
        if (!data) return;
        const updated = {
          author_name: data.author_name || defaultAbout.author_name,
          tagline: data.tagline !== undefined ? data.tagline : defaultAbout.tagline,
          bio: data.bio || defaultAbout.bio,
          projects: (Array.isArray(data.projects) && data.projects.length > 0) ? data.projects : defaultAbout.projects,
          links: (Array.isArray(data.links) && data.links.length > 0) ? data.links : defaultAbout.links
        };
        setAboutData(updated);
        try {
          localStorage.setItem('cached_about_data', JSON.stringify(updated));
        } catch {}
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="notebook-container">
      {loading ? (
        <FeedSkeleton type="about" />
      ) : (
        <div className="space-y-12">
          {/* Header section */}
          <header>
            <TypewriterText
              text={aboutData.author_name}
              as="h1"
              className="text-3xl font-serif font-medium tracking-tight mb-2"
            />
            {aboutData.tagline && (
              <TypewriterText
                text={aboutData.tagline}
                as="p"
                className="text-sm font-serif italic text-[var(--text-secondary)]"
              />
            )}
          </header>

          {/* Short Bio */}
          {aboutData.bio && (
            <section className="prose-editorial">
              <RichViewer content={aboutData.bio} />
            </section>
          )}

          {/* Projects */}
          {aboutData.projects && aboutData.projects.length > 0 && (
            <section className="pt-6 border-t border-[var(--border-subtle)]">
              <h2 className="text-xs font-sans uppercase tracking-widest text-[var(--text-muted)] font-medium mb-6">
                Projects & Work
              </h2>
              <div className="space-y-6">
                {aboutData.projects.map((proj, idx) => (
                  <div key={idx} className="group">
                    <h3 className="text-lg font-serif font-medium">
                      {proj.link ? (
                        <a
                          href={proj.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-[var(--accent-warm)] transition-colors underline underline-offset-4 decoration-[var(--border-subtle)]"
                        >
                          {proj.title}
                        </a>
                      ) : (
                        proj.title
                      )}
                    </h3>
                    {proj.description && (
                      <p className="text-sm font-serif text-[var(--text-secondary)] mt-1">
                        {proj.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Links */}
          {aboutData.links && aboutData.links.length > 0 && (
            <section className="pt-6 border-t border-[var(--border-subtle)]">
              <h2 className="text-xs font-sans uppercase tracking-widest text-[var(--text-muted)] font-medium mb-4">
                Links & Contact
              </h2>
              <ul className="flex flex-wrap gap-6 text-sm font-sans">
                {aboutData.links.map((link, idx) => (
                  <li key={idx}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--text-primary)] hover:text-[var(--accent-warm)] underline underline-offset-4"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
