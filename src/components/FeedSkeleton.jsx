import React from 'react';

export default function FeedSkeleton({ count = 3, type = 'default' }) {
  if (type === 'photo' || type === 'media') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 animate-pulse">
        {Array.from({ length: count || 6 }).map((_, i) => (
          <div key={i} className="aspect-square bg-[var(--code-bg)] rounded-md border border-[var(--border-subtle)] opacity-75" />
        ))}
      </div>
    );
  }

  if (type === 'update') {
    return (
      <div className="space-y-8 animate-pulse pl-6 border-l border-[var(--border-subtle)]">
        {Array.from({ length: count || 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-28 bg-[var(--code-bg)] rounded opacity-75" />
            <div className="h-5 w-full bg-[var(--code-bg)] rounded opacity-75" />
            <div className="h-4 w-3/4 bg-[var(--code-bg)] rounded opacity-60" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'detail') {
    return (
      <div className="reading-container animate-pulse space-y-6 py-6">
        {/* Meta Header */}
        <div className="space-y-3 pb-6 border-b border-[var(--border-subtle)]">
          <div className="h-3 w-36 bg-[var(--code-bg)] rounded opacity-75" />
          <div className="h-8 w-4/5 bg-[var(--code-bg)] rounded opacity-90" />
          <div className="h-4 w-1/2 bg-[var(--code-bg)] rounded opacity-60" />
        </div>
        {/* Cover Image Skeleton */}
        <div className="aspect-[16/9] w-full bg-[var(--code-bg)] rounded-lg border border-[var(--border-subtle)] opacity-75" />
        {/* Body Text Lines */}
        <div className="space-y-3 pt-4">
          <div className="h-4 w-full bg-[var(--code-bg)] rounded opacity-80" />
          <div className="h-4 w-11/12 bg-[var(--code-bg)] rounded opacity-80" />
          <div className="h-4 w-4/5 bg-[var(--code-bg)] rounded opacity-80" />
          <div className="h-4 w-full bg-[var(--code-bg)] rounded opacity-80" />
          <div className="h-4 w-3/4 bg-[var(--code-bg)] rounded opacity-80" />
        </div>
      </div>
    );
  }

  if (type === 'about') {
    return (
      <div className="animate-pulse space-y-10">
        {/* Header / Avatar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 pb-8 border-b border-[var(--border-subtle)]">
          <div className="w-24 h-24 rounded-full bg-[var(--code-bg)] border border-[var(--border-subtle)] shrink-0 opacity-80" />
          <div className="space-y-3 flex-1 w-full">
            <div className="h-7 w-48 bg-[var(--code-bg)] rounded opacity-90" />
            <div className="h-4 w-64 bg-[var(--code-bg)] rounded opacity-75" />
            <div className="h-4 w-full max-w-md bg-[var(--code-bg)] rounded opacity-60" />
          </div>
        </div>
        {/* Bio Sections */}
        <div className="space-y-4">
          <div className="h-5 w-32 bg-[var(--code-bg)] rounded opacity-80" />
          <div className="h-4 w-full bg-[var(--code-bg)] rounded opacity-70" />
          <div className="h-4 w-11/12 bg-[var(--code-bg)] rounded opacity-70" />
          <div className="h-4 w-4/5 bg-[var(--code-bg)] rounded opacity-70" />
        </div>
        {/* Projects Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
          <div className="h-28 bg-[var(--code-bg)] rounded-lg border border-[var(--border-subtle)] opacity-75" />
          <div className="h-28 bg-[var(--code-bg)] rounded-lg border border-[var(--border-subtle)] opacity-75" />
        </div>
      </div>
    );
  }

  if (type === 'archive') {
    return (
      <div className="animate-pulse space-y-6">
        {Array.from({ length: count || 4 }).map((_, i) => (
          <div key={i} className="pb-4 border-b border-[var(--border-subtle)] space-y-2">
            <div className="h-3 w-28 bg-[var(--code-bg)] rounded opacity-75" />
            <div className="h-5 w-2/3 bg-[var(--code-bg)] rounded opacity-90" />
            <div className="h-4 w-full bg-[var(--code-bg)] rounded opacity-60" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'table') {
    return (
      <div className="animate-pulse divide-y divide-[var(--border-subtle)]">
        {Array.from({ length: count || 5 }).map((_, i) => (
          <div key={i} className="p-4 flex items-center justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="h-4 w-1/3 bg-[var(--code-bg)] rounded opacity-80" />
              <div className="h-3 w-1/2 bg-[var(--code-bg)] rounded opacity-60" />
            </div>
            <div className="h-6 w-16 bg-[var(--code-bg)] rounded opacity-75 shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  // Default / Article feed list skeleton
  return (
    <div className="space-y-10 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="pb-8 border-b border-[var(--border-subtle)] space-y-3">
          <div className="h-3 w-32 bg-[var(--code-bg)] rounded opacity-75" />
          <div className="h-7 w-3/4 bg-[var(--code-bg)] rounded opacity-90" />
          <div className="h-4 w-full bg-[var(--code-bg)] rounded opacity-70" />
          <div className="h-4 w-5/6 bg-[var(--code-bg)] rounded opacity-70" />
        </div>
      ))}
    </div>
  );
}
