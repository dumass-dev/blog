import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, Camera, Sliders } from 'lucide-react';
import Modal from './Modal';

export default function ImageLightbox({ src, alt, caption, isOpen, onClose }) {
  const [zoom, setZoom] = useState(1);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Editorial Photo Lightbox" maxWidthClass="max-w-4xl w-full">
      <div className="flex flex-col space-y-4 select-none touch-action-none">
        {/* Top Header */}
        <div className="flex justify-between items-center text-[var(--text-primary)]">
          <div className="flex items-center gap-2 text-xs font-sans font-medium">
            <Camera className="w-4 h-4 text-[var(--accent-warm)]" />
            <span>Editorial Photo Lightbox</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setZoom(prev => Math.min(prev + 0.25, 2.5))}
              className="p-1.5 rounded hover:bg-black/10 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom(prev => Math.max(prev - 0.25, 0.75))}
              className="p-1.5 rounded hover:bg-black/10 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-black/10 transition-colors"
              title="Close Lightbox"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Image Stage Container - strict overflow containment */}
        <div className="flex-1 flex items-center justify-center overflow-hidden my-2 max-w-full relative min-h-[220px] bg-black/5 rounded-lg p-2">
          <div className="w-full h-full flex items-center justify-center overflow-hidden">
            <img
              src={src}
              alt={alt || caption || ''}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
              className="max-h-[60dvh] max-w-full object-contain rounded shadow-lg transition-transform duration-200 ease-out"
            />
          </div>
        </div>

        {/* Bottom Info */}
        {caption && (
          <div className="text-center text-xs font-sans text-[var(--text-secondary)] pt-1">
            <p className="font-serif italic text-sm text-[var(--text-primary)]">
              "{caption}"
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
