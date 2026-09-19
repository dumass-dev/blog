import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, Camera, Sliders } from 'lucide-react';

export default function ImageLightbox({ src, alt, caption, isOpen, onClose }) {
  const [zoom, setZoom] = useState(1);

  if (!isOpen || !src) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex flex-col justify-between p-4 sm:p-8 animate-in fade-in duration-200 select-none">
      {/* Top Header */}
      <div className="flex justify-between items-center text-white/80 z-10">
        <div className="flex items-center gap-2 text-xs font-sans font-medium">
          <Camera className="w-4 h-4 text-[var(--accent-warm)]" />
          <span>Editorial Photo Lightbox</span>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setZoom(prev => Math.min(prev + 0.25, 2.5))}
            className="p-2 rounded hover:bg-white/10 text-white/80 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(prev => Math.max(prev - 0.25, 0.75))}
            className="p-2 rounded hover:bg-white/10 text-white/80 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-white/10 text-white transition-colors"
            title="Close Lightbox"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div className="flex-1 flex items-center justify-center overflow-hidden my-4">
        <img
          src={src}
          alt={alt || caption || ''}
          style={{ transform: `scale(${zoom})` }}
          className="max-h-[80vh] max-w-full object-contain rounded shadow-2xl transition-transform duration-200 ease-out"
        />
      </div>

      {/* Bottom Info & Simulated EXIF */}
      <div className="max-w-2xl mx-auto w-full bg-black/60 backdrop-blur-md border border-white/10 rounded-lg p-4 text-center text-xs font-sans text-white/90">
        {caption && (
          <p className="font-serif italic text-sm text-white mb-2">
            "{caption}"
          </p>
        )}
        <div className="flex flex-wrap justify-center items-center gap-4 text-[11px] text-white/60">
          <span className="flex items-center gap-1">
            <Sliders className="w-3 h-3 text-[var(--accent-warm)]" />
            <span>35mm Format</span>
          </span>
          <span>·</span>
          <span>f/2.8</span>
          <span>·</span>
          <span>1/500s</span>
          <span>·</span>
          <span>ISO 100</span>
          <span>·</span>
          <span>Kodak Tri-X Film Grain</span>
        </div>
      </div>
    </div>
  );
}
