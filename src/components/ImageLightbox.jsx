import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, Camera } from 'lucide-react';
import Modal from './Modal';
import ProgressiveImage from './ProgressiveImage';

export default function ImageLightbox({ src, alt, caption, isOpen, onClose }) {
  const [zoom, setZoom] = useState(1);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Editorial Photo Lightbox" maxWidthClass="max-w-4xl w-full">
      <div className="flex flex-col space-y-4 select-none touch-action-none">
        {/* Top Header with Top-Left Close Button */}
        <div className="flex justify-between items-center text-[var(--text-primary)] relative">
          <div className="flex items-center gap-2 text-xs font-sans font-medium">
            <button
              onClick={onClose}
              className="lightbox-close-btn w-11 h-11 min-w-[44px] min-h-[44px] shrink-0"
              style={{ width: '44px', height: '44px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', backgroundColor: 'transparent', boxShadow: 'none' }}
              aria-label="Close photo view"
              title="Close photo"
            >
              <X className="w-5 h-5 text-white" />
            </button>
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
          </div>
        </div>

        {/* Main Image Stage Container - strict overflow containment */}
        <div className="flex-1 flex items-center justify-center overflow-hidden my-2 max-w-full relative min-h-[220px] bg-black/5 rounded-lg p-2">
          <div className="w-full h-full flex items-center justify-center overflow-hidden">
            <ProgressiveImage
              src={src}
              alt={alt || caption || ''}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
              objectFit="object-contain"
              className="max-h-[60dvh] max-w-full rounded shadow-lg transition-transform duration-200 ease-out"
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
