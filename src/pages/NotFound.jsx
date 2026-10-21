import React from 'react';
import { Link } from 'react-router-dom';
import useDocumentMeta from '../hooks/useDocumentMeta';
import TypewriterText from '../components/TypewriterText';

export default function NotFound() {
  useDocumentMeta({ title: '404 Page Not Found' });
  return (
    <div className="notebook-container py-24 text-center">
      <TypewriterText
        text="404"
        as="h1"
        className="text-4xl font-serif font-medium mb-3"
      />
      <TypewriterText
        text="The page or entry you were looking for does not exist in this archive."
        as="p"
        className="text-sm font-sans text-[var(--text-secondary)] mb-8"
      />
      <Link
        to="/"
        className="text-xs font-sans uppercase tracking-wider underline text-[var(--text-primary)] hover:text-[var(--accent-warm)]"
      >
        ← Back to Homepage
      </Link>
    </div>
  );
}
