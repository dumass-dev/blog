import React from 'react';
import {
  parseEmbeddedImages,
  updateImageInContent,
  moveImageInContent,
  removeImageFromContent
} from '../utils/imageMarkdown';
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  Image as ImageIcon,
  Sliders,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export default function EditorMediaManager({ content = '', onChangeContent }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const images = parseEmbeddedImages(content);

  if (images.length === 0) {
    return null;
  }

  const handleSizeChange = (index, newSize) => {
    const updated = updateImageInContent(content, index, newSize, undefined);
    onChangeContent(updated);
  };

  const handleAlignChange = (index, newAlign) => {
    const updated = updateImageInContent(content, index, undefined, newAlign);
    onChangeContent(updated);
  };

  const handleMove = (index, direction) => {
    const updated = moveImageInContent(content, index, direction);
    onChangeContent(updated);
  };

  const handleRemove = (index) => {
    const updated = removeImageFromContent(content, index);
    onChangeContent(updated);
  };

  const getNumericPercent = (size) => {
    const match = String(size || '').match(/^(\d+)%$/);
    return match ? parseInt(match[1], 10) : 100;
  };

  return (
    <div className="border border-[var(--border-subtle)] rounded-lg bg-[var(--code-bg)] p-3 text-xs font-sans transition-all">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-[var(--accent-warm)]" />
          <span className="font-medium text-[var(--text-primary)]">
            Embedded Photos & GIFs in Entry ({images.length})
          </span>
          <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline">
            · Adjust size, text wrapping, and position freely
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-muted)]"
          title={collapsed ? 'Expand media controls' : 'Collapse media controls'}
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-3 pt-1">
          {images.map((img, idx) => {
            const numericPercent = getNumericPercent(img.size);

            return (
              <div
                key={`${img.url}-${idx}`}
                className="p-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-md flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs"
              >
                {/* Thumbnail & Info */}
                <div className="flex items-center gap-3 min-w-0 max-w-full md:max-w-[280px]">
                  <div className="w-14 h-14 rounded border border-[var(--border-subtle)] overflow-hidden shrink-0 bg-black/5 relative group">
                    <img
                      src={img.url}
                      alt={img.cleanAlt}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-[var(--text-primary)] truncate font-mono text-xs">
                      {img.cleanAlt || 'Image'}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-[var(--accent-warm)] font-medium">{img.size}</span>
                      <span>·</span>
                      <span className="capitalize">{img.align === 'center' ? 'Center Block' : `Wrap ${img.align}`}</span>
                    </div>
                  </div>
                </div>

                {/* Size Controls: Slider & Presets */}
                <div className="flex-1 w-full md:w-auto px-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase font-mono text-[var(--text-muted)] flex items-center gap-1">
                      <Sliders className="w-3 h-3 text-[var(--accent-warm)]" />
                      Size
                    </span>
                    <div className="inline-flex rounded border border-[var(--border-subtle)] p-0.5 bg-[var(--code-bg)]">
                      {['25%', '33%', '50%', '75%', '100%'].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleSizeChange(idx, preset)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                            img.size === preset
                              ? 'bg-[var(--accent-warm)] text-white font-medium'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">15%</span>
                    <input
                      type="range"
                      min="15"
                      max="100"
                      step="1"
                      value={numericPercent}
                      onChange={(e) => handleSizeChange(idx, `${e.target.value}%`)}
                      className="w-full accent-[var(--accent-warm)] cursor-pointer h-1.5 bg-[var(--border-subtle)] rounded-lg"
                      title={`Adjust width: ${img.size}`}
                    />
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">100%</span>
                  </div>
                </div>

                {/* Alignment & Text Wrapping */}
                <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-between md:justify-start border-t md:border-t-0 pt-2 md:pt-0 border-[var(--border-subtle)]">
                  <div className="inline-flex rounded border border-[var(--border-subtle)] p-0.5 bg-[var(--code-bg)]">
                    <button
                      type="button"
                      onClick={() => handleAlignChange(idx, 'left')}
                      className={`p-1.5 rounded transition-colors cursor-pointer ${
                        img.align === 'left'
                          ? 'bg-[var(--accent-warm)] text-white'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                      title="Wrap Left (text wraps on right)"
                    >
                      <AlignLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAlignChange(idx, 'center')}
                      className={`p-1.5 rounded transition-colors cursor-pointer ${
                        img.align === 'center'
                          ? 'bg-[var(--accent-warm)] text-white'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                      title="Center Block (standalone)"
                    >
                      <AlignCenter className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAlignChange(idx, 'right')}
                      className={`p-1.5 rounded transition-colors cursor-pointer ${
                        img.align === 'right'
                          ? 'bg-[var(--accent-warm)] text-white'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                      title="Wrap Right (text wraps on left)"
                    >
                      <AlignRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Position: Move Up / Down */}
                  <div className="inline-flex rounded border border-[var(--border-subtle)] p-0.5 bg-[var(--code-bg)]">
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title="Move Image Up in Document"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 'down')}
                      disabled={idx === images.length - 1}
                      className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title="Move Image Down in Document"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Delete Image */}
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    className="p-1.5 rounded border border-[var(--border-subtle)] text-red-500 hover:bg-red-500/10 cursor-pointer"
                    title="Remove Image from Entry"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
