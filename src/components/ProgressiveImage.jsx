import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

/**
 * Reusable Progressive Image Component
 * - Displays a skeleton pulse placeholder reserving aspect ratio and layout space.
 * - Only reveals the image with a smooth fade-in transition ONCE fully loaded (onLoad).
 * - Displays a clean fallback state on error (onError).
 * - Respects prefers-reduced-motion.
 */
export default function ProgressiveImage({
  src,
  alt = '',
  className = '',
  imgClassName = '',
  aspectRatio,
  loading = 'lazy',
  onClick,
  onError: customOnError,
  onLoad: customOnLoad,
  style = {},
  objectFit = 'object-cover',
  ...props
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);

  const handleLoad = (e) => {
    setIsLoaded(true);
    if (customOnLoad) customOnLoad(e);
  };

  const handleError = (e) => {
    setIsError(true);
    setIsLoaded(false);
    if (customOnError) customOnError(e);
  };

  return (
    <div
      className={`relative overflow-hidden bg-[var(--code-bg)] select-none ${aspectRatio || ''} ${className}`}
      style={style}
      onClick={onClick}
    >
      {/* Skeleton loader shown while loading */}
      {!isLoaded && !isError && (
        <div className="absolute inset-0 bg-[var(--code-bg)] animate-pulse border border-[var(--border-subtle)]/40 rounded-sm z-0 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--accent-warm)] animate-spin opacity-40" />
        </div>
      )}

      {/* Clean error state if image fails to load */}
      {isError && (
        <div className="absolute inset-0 bg-[var(--card-bg)] text-[var(--text-muted)] flex flex-col items-center justify-center p-4 text-center border border-[var(--border-subtle)] rounded-sm space-y-1.5 z-10">
          <ImageOff className="w-5 h-5 text-[var(--text-muted)] opacity-60" />
          <span className="font-sans text-[11px]">Image unavailable</span>
        </div>
      )}

      {/* Actual Image Element (hidden until fully loaded) */}
      {src && !isError && (
        <img
          src={src}
          alt={alt}
          loading={loading}
          onLoad={handleLoad}
          onError={handleError}
          className={`w-full h-full ${objectFit} transition-opacity duration-300 ease-out motion-reduce:transition-none ${
            isLoaded ? 'opacity-100' : 'opacity-0 pointer-events-none'
          } ${imgClassName}`}
          {...props}
        />
      )}
    </div>
  );
}
