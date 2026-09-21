import React from 'react';

export default function FeedSkeleton({ count = 3, type = 'default' }) {
  if (type === 'photo') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 animate-pulse">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="aspect-square bg-[var(--code-bg)] rounded-md border border-[var(--border-subtle)]" />
        ))}
      </div>
    );
  }

  if (type === 'update') {
    return (
      <div className="space-y-8 animate-pulse pl-6 border-l border-[var(--border-subtle)]">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-28 bg-[var(--code-bg)] rounded" />
            <div className="h-5 w-full bg-[var(--code-bg)] rounded" />
            <div className="h-4 w-3/4 bg-[var(--code-bg)] rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="pb-8 border-b border-[var(--border-subtle)] space-y-3">
          <div className="h-3 w-32 bg-[var(--code-bg)] rounded" />
          <div className="h-7 w-3/4 bg-[var(--code-bg)] rounded" />
          <div className="h-4 w-full bg-[var(--code-bg)] rounded" />
          <div className="h-4 w-5/6 bg-[var(--code-bg)] rounded" />
        </div>
      ))}
    </div>
  );
}
