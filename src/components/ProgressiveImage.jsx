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
  // One retry for the media proxy (/api/media/file/...): the browser may
  // hold a cached redirect whose signed URL has since expired. A ?retry=1
  // request skips that cache and gets a fresh signature — the same second
  // chance RichViewer gives images inside entries.
  const [retried, setRetried] = useState(false);
  const imgRef = React.useRef(null);

  React.useEffect(() => {
    setIsLoaded(false);
    setIsError(false);
    setRetried(false);
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setIsLoaded(true);
    }
  }, [src]);

  const canRetry = typeof src === 'string' && src.includes('/api/media/file/');
  const imgSrc = retried && canRetry ? `${src}${src.includes('?') ? '&' : '?'}retry=1` : src;

  const handleLoad = (e) => {
    setIsLoaded(true);
    if (customOnLoad) customOnLoad(e);
  };

  const handleError = (e) => {
    if (canRetry && !retried) {
      setRetried(true);
      return;
    }
    setIsError(true);
    setIsLoaded(false);
    if (customOnError) customOnError(e);
  };

  // A failed image keeps a visible box (with the "Image unavailable" note)
  // even where its size only came from the image itself.
  const boxStyle = isError ? { minHeight: '120px', width: '100%', ...style } : style;

  return (
    <div
      className={`relative overflow-hidden bg-[var(--code-bg)] select-none ${aspectRatio || ''} ${className}`}
      style={boxStyle}
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

      {/* Actual Image Element (hidden until loaded) */}
      {src && !isError && (
        <img
          ref={imgRef}
          src={imgSrc}
          alt={alt}
          loading={loading}
          decoding="async"
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
