import React from 'react';
import { Link } from 'react-router-dom';
import useDocumentMeta from '../hooks/useDocumentMeta';

export default function NotFound() {
  useDocumentMeta({ title: '404 Page Not Found' });
  return (
    <div className="notebook-container py-24 text-center">
      <h1 className="text-4xl font-serif font-medium mb-3">404</h1>
      <p className="text-sm font-sans text-[var(--text-secondary)] mb-8">
        The page or entry you were looking for does not exist in this archive.
      </p>
      <Link
        to="/"
        className="text-xs font-sans uppercase tracking-wider underline text-[var(--text-primary)] hover:text-[var(--accent-warm)]"
      >
        ← Back to Homepage
      </Link>
    </div>
  );
}
