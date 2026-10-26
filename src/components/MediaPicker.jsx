import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Upload, X, Image as ImageIcon, AlignLeft, AlignCenter, AlignRight, FileVideo } from 'lucide-react';
import { supabase, safeApiFetch } from '../supabase';

import Modal from './Modal';
import FeedSkeleton from './FeedSkeleton';
import ProgressiveImage from './ProgressiveImage';

function getNumericPercent(val) {
  if (!val) return 100;
  if (val === 'small') return 30;
  if (val === 'medium') return 50;
  if (val === 'large') return 75;
  if (val === 'full') return 100;
  const match = String(val).match(/^(\d{1,3})%?$/);
  return match ? Math.min(100, Math.max(15, parseInt(match[1], 10))) : 50;
}

// Video thumbnail with an error state: a dead signed URL renders a clear
// "Video unavailable" tile instead of a black box. preload="metadata" lets
// the browser show the first frame as a poster when the URL is alive.
function VideoPreview({ src, className }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`${className} flex flex-col items-center justify-center gap-1 bg-black/10 text-[var(--text-muted)]`}>
        <FileVideo className="w-5 h-5 opacity-60" />
        <span className="text-[10px] font-sans">Video unavailable</span>
      </div>
    );
  }
  return <video src={src} className={className} preload="metadata" onError={() => setFailed(true)} />;
}

export default function MediaPicker({ isOpen, onClose, onSelectMedia }) {
  const { token } = useAuth();
  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedSize, setSelectedSize] = useState('100%');
  const [selectedAlign, setSelectedAlign] = useState('center'); // 'center' | 'left' | 'right'
  const [error, setError] = useState(null);

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    setError(null);

    let list = [];

    // Try API server first
    const data = await safeApiFetch('/api/media', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (Array.isArray(data)) {
      list = data;
    } else {
      // Direct Supabase fallback — build proxy URLs from raw storage keys
      try {
        const { data: supaMedia, error: supaErr } = await supabase
          .from('media')
          .select('*')
          .order('created_at', { ascending: false });

        if (!supaErr && Array.isArray(supaMedia)) {
          list = supaMedia.map(item => {
            const key = item.url || '';
            const proxyUrl = key && /^(?:images|videos|audio|files)\//.test(key)
              ? `/api/media/file/${key}`
              : key;
            return { ...item, proxy_url: proxyUrl, url: proxyUrl };
          });
        }
      } catch (_e) {}
    }

    setMediaList(list);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (isOpen) {
      fetchMedia();
    }
  }, [isOpen, fetchMedia]);

  const uploadViaServerFallback = async (file) => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Server upload fallback failed.');
      }

      fetchMedia();
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const effectiveMime = file.type || 'application/octet-stream';
    const isSmallFile = file.size < 4 * 1024 * 1024; // <4MB

    try {
      // PRIMARY PATH: Direct-to-B2 presigned upload (Bypasses Vercel 4.5MB serverless limit)
      let presignRes;
      try {
        presignRes = await fetch('/api/b2-upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            filename: file.name,
            mimeType: effectiveMime,
            sizeBytes: file.size
          })
        });
      } catch (presignErr) {
        if (isSmallFile) {
          return await uploadViaServerFallback(file);
        }
        throw new Error(`Failed to authorize upload: ${presignErr.message}`, { cause: presignErr });
      }

      if (!presignRes.ok) {
        if (isSmallFile) {
          return await uploadViaServerFallback(file);
        }
        const errData = await presignRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to authorize upload.');
      }

      const presignData = await presignRes.json();

      // Step 2: Direct PUT to B2 S3 storage with exact matching Content-Type
      try {
        const b2Res = await fetch(presignData.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': effectiveMime
          },
          body: file
        });

        if (!b2Res.ok) {
          const errText = await b2Res.text().catch(() => '');
          throw new Error(`B2 storage returned HTTP ${b2Res.status} ${b2Res.statusText}${errText ? `: ${errText.slice(0, 150)}` : ''}`);
        }
      } catch (b2Err) {
        console.error('[Direct B2 Upload Detailed Error]:', b2Err);
        if (isSmallFile) {
          return await uploadViaServerFallback(file);
        }
        const failureDetails = (b2Err instanceof TypeError || b2Err.message?.includes('fetch'))
          ? `Network/CORS rejection (${b2Err.message}). Check CORS configuration on B2 bucket.`
          : b2Err.message;
        throw new Error(`Direct B2 upload failed for large file (${(file.size / 1024 / 1024).toFixed(1)}MB): ${failureDetails}`, { cause: b2Err });
      }


      // Step 3: Confirm upload & record database row
      const confirmRes = await fetch('/api/media/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          storageKey: presignData.storageKey,
          originalName: file.name,
          mimeType: effectiveMime,
          sizeBytes: file.size,
          publicUrl: presignData.publicUrl
        })
      });

      if (!confirmRes.ok) {
        if (isSmallFile) {
          return await uploadViaServerFallback(file);
        }
        const confirmData = await confirmRes.json().catch(() => ({}));
        throw new Error(confirmData.error || 'Media confirmation failed magic byte check.');
      }

      fetchMedia();
    } catch (err) {
      console.error('[MediaPicker handleFileUpload error]:', err);
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };



  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Insert Media from Library" maxWidthClass="max-w-2xl">
      <div className="flex flex-col space-y-3">
        {/* Modal Header */}
        <div className="pb-3 border-b border-[var(--border-subtle)] flex justify-between items-center">
          <h2 className="text-sm sm:text-base font-sans font-medium flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-[var(--accent-warm)] shrink-0" />
            <span>Insert Media from Library</span>
          </h2>
          <button onClick={onClose} className="p-1 hover:text-[var(--text-primary)] text-[var(--text-muted)] rounded transition-colors" aria-label="Close dialog">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload bar */}
        <div className="p-2.5 sm:p-3 border border-[var(--border-subtle)] rounded bg-[var(--code-bg)] flex items-center justify-between gap-2">
          <div className="text-xs font-sans text-[var(--text-secondary)] truncate">
            Upload new photo, GIF, or video clip
          </div>
          <label className="relative overflow-hidden quiet-button text-xs flex items-center gap-1.5 cursor-pointer shrink-0 py-1.5 px-3">
            <Upload className="w-3.5 h-3.5" />
            <span>{uploading ? 'Uploading...' : 'Choose File'}</span>
            <input
              type="file"
              accept="image/*,video/*,.gif,.heic,.heif,.jpg,.jpeg,.png,.webp"
              onChange={handleFileUpload}
              disabled={uploading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
          </label>
        </div>

        {/* Image Layout & Size Controls */}
        <div className="p-2.5 sm:p-3 border border-[var(--border-subtle)] rounded bg-[var(--code-bg)] flex flex-col gap-2.5 text-xs font-sans">
          {/* Layout & Text Wrapping Mode */}
          <div className="flex flex-col gap-1.5 border-b border-[var(--border-subtle)]/60 pb-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)] font-medium">Text Layout & Wrapping:</span>
              <span className="text-[11px] font-mono text-[var(--accent-warm)] capitalize">{selectedAlign}</span>
            </div>
            <div className="flex w-full rounded border border-[var(--border-subtle)] p-0.5 bg-[var(--bg-main)]">
              <button
                type="button"
                onClick={() => {
                  setSelectedAlign('left');
                  if (selectedSize === '100%') setSelectedSize('45%');
                }}
                className={`flex-1 py-1 rounded text-[11px] flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                  selectedAlign === 'left'
                    ? 'bg-[var(--accent-warm)] text-white font-medium'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Image floats on left, text flows around it on the right"
              >
                <AlignLeft className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Wrap Left</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedAlign('center')}
                className={`flex-1 py-1 rounded text-[11px] flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                  selectedAlign === 'center'
                    ? 'bg-[var(--accent-warm)] text-white font-medium'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Standalone centered block"
              >
                <AlignCenter className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Center</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedAlign('right');
                  if (selectedSize === '100%') setSelectedSize('45%');
                }}
                className={`flex-1 py-1 rounded text-[11px] flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                  selectedAlign === 'right'
                    ? 'bg-[var(--accent-warm)] text-white font-medium'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Image floats on right, text flows around it on the left"
              >
                <AlignRight className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Wrap Right</span>
              </button>
            </div>
          </div>

          {/* Width adjustment */}
          <div className="flex flex-col gap-1.5 pt-0.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="media-picker-width" className="text-[var(--text-secondary)] font-medium">Image Width:</label>
              <input
                id="media-picker-width"
                type="text"
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value.trim())}
                placeholder="100% or 400px"
                style={{ width: '72px', minWidth: '72px' }}
                className="quiet-input text-xs px-2 py-0.5 text-center font-mono border border-[var(--border-subtle)] rounded bg-[var(--bg-main)]"
                title="Enter percentage (e.g. 45%) or pixels (e.g. 400px)"
              />
            </div>

            {/* Horizontal segmented 5-button bar */}
            <div className="flex w-full rounded border border-[var(--border-subtle)] p-0.5 bg-[var(--bg-main)]">
              {['25%', '33%', '45%', '60%', '100%'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setSelectedSize(preset)}
                  className={`flex-1 py-1 rounded text-[11px] font-mono text-center transition-colors cursor-pointer ${
                    selectedSize === preset
                      ? 'bg-[var(--accent-warm)] text-white font-medium'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Live Range Slider */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">15%</span>
              <input
                type="range"
                min="15"
                max="100"
                step="1"
                value={getNumericPercent(selectedSize)}
                onChange={(e) => setSelectedSize(`${e.target.value}%`)}
                aria-label="Image width"
                className="w-full accent-[var(--accent-warm)] cursor-pointer h-1.5 bg-[var(--border-subtle)] rounded-lg"
              />
              <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">100%</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-[var(--code-bg)] text-[var(--text-primary)] text-xs font-sans border border-[var(--border-subtle)] rounded">
            {error}
          </div>
        )}

        {/* Media Grid - Using vanilla CSS responsive-media-grid */}
        <div className="responsive-media-grid max-h-[50dvh] overflow-y-auto p-1">
          {loading ? (
            <FeedSkeleton type="media" count={6} />
          ) : mediaList.length === 0 ? (
            <div className="text-center py-8 text-xs font-sans text-[var(--text-muted)]">
              No media uploaded yet. Use the upload button above.
            </div>
          ) : (
            mediaList.map((item, index) => (
              <div
                key={item.id}
                onClick={() => {
                  onSelectMedia({
                    ...item,
                    url: item.proxy_url || item.url,
                    proxy_url: item.proxy_url || item.url,
                    size: selectedSize,
                    align: selectedAlign
                  });
                  onClose();
                }}
                className="group relative border border-[var(--border-subtle)] rounded overflow-hidden cursor-pointer hover:border-[var(--accent-warm)] transition-colors aspect-square bg-black/5"
              >
                {item.mime_type && item.mime_type.startsWith('video/') ? (
                  <VideoPreview src={item.signed_url || item.url || item.proxy_url} className="w-full h-full object-cover" />
                ) : (
                  <ProgressiveImage
                    src={item.signed_url || item.url || item.proxy_url}
                    alt={item.original_name || 'Media'}
                    aspectRatio="aspect-square"
                    loading={index < 8 ? 'eager' : 'lazy'}
                  />
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-sans font-medium text-center p-2 pointer-events-none">
                  <span>Tap to insert</span>
                  <span className="text-[10px] opacity-90 font-mono mt-0.5">
                    {selectedAlign === 'left' ? 'Wrap Left' : selectedAlign === 'right' ? 'Wrap Right' : 'Centered'}
                    {selectedSize && selectedSize !== '100%' ? ` (${selectedSize})` : ''}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-[var(--border-subtle)] text-right">
          <button onClick={onClose} className="quiet-button-secondary text-xs">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
