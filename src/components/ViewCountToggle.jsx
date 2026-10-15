import React from 'react';
import { useViewCount } from '../context/ViewCountContext';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';

export default function ViewCountToggle({ className = '' }) {
  const { showViewCount, toggleViewCount } = useViewCount();
  const { isAdmin } = useAuth();

  if (!isAdmin) return null;

  return (
    <button
      type="button"
      onClick={toggleViewCount}
      className={`min-w-[44px] min-h-[44px] w-11 h-11 p-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer border-0 bg-transparent flex items-center justify-center select-none outline-none touch-target relative ${className}`}
      title={showViewCount ? 'Admin: View Count Visible on Website (Click to hide for visitors)' : 'Admin: View Count Hidden on Website (Click to unhide for visitors)'}
      aria-label="Toggle website view count visibility"
      aria-pressed={showViewCount}
    >
      {showViewCount ? (
        <Eye className="w-4 h-4 text-[var(--text-primary)] transition-colors" />
      ) : (
        <EyeOff className="w-4 h-4 text-[var(--text-secondary)] opacity-60 transition-colors" />
      )}
      {showViewCount && (
        <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-[var(--text-primary)] animate-pulse" />
      )}
    </button>
  );
}

