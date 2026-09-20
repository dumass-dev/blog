import React, { useEffect, useRef, useState } from 'react';
import { Download, X, Share2, Copy, Check, Palette } from 'lucide-react';

import Modal from './Modal';

export default function QuoteCardModal({ quoteText, postTitle, isOpen, onClose }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [cardTheme, setCardTheme] = useState('warm'); // 'warm' | 'dark' | 'mono'

  useEffect(() => {
    if (!isOpen || !quoteText || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // High resolution canvas HD Card (1200 x 675)
    canvas.width = 1200;
    canvas.height = 675;

    let bgColor = '#FFFFFF';
    let textColor = '#000000';
    let accentColor = '#000000';
    let borderColor = '#E0E0E0';
    let subTextColor = '#555555';

    if (cardTheme === 'dark') {
      bgColor = '#000000';
      textColor = '#FFFFFF';
      accentColor = '#FFFFFF';
      borderColor = '#222222';
      subTextColor = '#A0A0A0';
    } else if (cardTheme === 'mono') {
      bgColor = '#FFFFFF';
      textColor = '#000000';
      accentColor = '#000000';
      borderColor = '#000000';
      subTextColor = '#444444';
    }

    // Fill background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle inner border frame
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 8;
    ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);

    // Site Author Header Branding
    ctx.fillStyle = accentColor;
    ctx.font = '600 24px Inter, sans-serif';
    ctx.fillText('q04ti — Personal Archive', 80, 100);

    // Large background decorative quote mark
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 160px Georgia, serif';
    ctx.globalAlpha = 0.12;
    ctx.fillText('“', 75, 240);
    ctx.globalAlpha = 1.0;

    // Quote text wrapping
    ctx.fillStyle = textColor;
    ctx.font = 'italic 34px Newsreader, Georgia, serif';

    const words = quoteText.split(' ');
    let line = '';
    let y = 220;
    const maxWidth = 1040;
    const lineHeight = 52;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText('“' + line.trim(), 80, y);
        line = words[n] + ' ';
        y += lineHeight;
        if (y > 500) break;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim() + '”', 80, y);

    // Post Title & Date Footer
    ctx.fillStyle = subTextColor;
    ctx.font = '400 22px Inter, sans-serif';
    ctx.fillText(`— excerpt from "${postTitle || 'Journal Entry'}"`, 80, canvas.height - 90);
  }, [isOpen, quoteText, postTitle, cardTheme]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `q04ti-quote-${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const handleCopyText = () => {
    if (!quoteText) return;
    navigator.clipboard.writeText(`"${quoteText}" — via q04ti`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Generate Social Quote Card">
      <div className="flex flex-col space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h3 className="text-base font-sans font-medium flex items-center gap-2 text-[var(--text-primary)]">
            <Share2 className="w-4 h-4 text-[var(--accent-warm)]" />
            <span>Generate Social Quote Card</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:text-[var(--text-primary)] text-[var(--text-muted)] transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Theme Selector Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-sans border-b border-[var(--border-subtle)]/60 pb-3 pt-1">
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Palette className="w-3.5 h-3.5 opacity-70" />
            <span>Card Theme:</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'warm', label: 'Warm Parchment' },
              { id: 'dark', label: 'Midnight Dark' },
              { id: 'mono', label: 'Minimal Mono' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setCardTheme(t.id)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                  cardTheme === t.id
                    ? 'bg-[var(--text-primary)] text-[var(--bg-main)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent hover:border-[var(--border-subtle)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Canvas Preview Container */}
        <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden shadow-inner bg-black/5 max-w-full">
          <canvas ref={canvasRef} className="w-full h-auto block max-w-full" />
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs font-sans text-[var(--text-muted)] pt-1">
          <span className="text-[11px]">HD 1200x675 formatted for social cards & export.</span>
          <div className="flex space-x-2.5 w-full sm:w-auto justify-end flex-wrap gap-y-2">
            <button
              onClick={handleCopyText}
              className="quiet-button-secondary text-xs flex items-center gap-1.5 py-1.5 px-3"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[var(--text-primary)]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied Text' : 'Copy Quote Text'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="quiet-button text-xs flex items-center gap-1.5 py-1.5 px-3.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Image</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
