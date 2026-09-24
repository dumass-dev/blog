import React from 'react';
import { useTypewriter } from '../context/TypewriterContext';
import { Type } from 'lucide-react';

export default function TypewriterToggle({ className = '' }) {
  const { typewriterEnabled, toggleTypewriter } = useTypewriter();

  return (
    <button
      type="button"
      onClick={toggleTypewriter}
      className={`min-w-[44px] min-h-[44px] w-11 h-11 p-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer border-0 bg-transparent flex items-center justify-center select-none outline-none touch-target relative ${className}`}
      title={typewriterEnabled ? 'Typewriter Effect: ON (Click to disable)' : 'Typewriter Effect: OFF (Click to enable)'}
      aria-label="Toggle typewriter text reveal"
      aria-pressed={typewriterEnabled}
    >
      <Type className={`w-4 h-4 transition-colors ${typewriterEnabled ? 'text-[var(--text-primary)] font-bold' : 'text-[var(--text-secondary)] opacity-60'}`} />
      {typewriterEnabled && (
        <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-[var(--text-primary)] animate-pulse" />
      )}
    </button>
  );
}
