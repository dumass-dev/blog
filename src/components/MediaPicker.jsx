import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { supabase, safeApiFetch } from '../supabase';

import Modal from './Modal';

export default function MediaPicker({ isOpen, onClose, onSelectMedia }) {
  const { token } = useAuth();
  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
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
      // Direct Supabase fallback
      try {
        const { data: supaMedia, error: supaErr } = await supabase
          .from('media')
          .select('*')
          .order('created_at', { ascending: false });

        if (!supaErr && Array.isArray(supaMedia)) {
          list = supaMedia;
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
          throw new Error(`Direct B2 upload returned status ${b2Res.status}`);
        }
      } catch (b2Err) {
        if (isSmallFile) {
          return await uploadViaServerFallback(file);
        }
        throw new Error(`Direct B2 upload failed for large file (${(file.size / 1024 / 1024).toFixed(1)}MB): ${b2Err.message}. Check CORS config on B2 bucket.`, { cause: b2Err });
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
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };



  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Insert Media from Library">
      <div className="flex flex-col space-y-3">
        {/* Modal Header */}
        <div className="pb-3 border-b border-[var(--border-subtle)] flex justify-between items-center">
          <h2 className="text-base font-sans font-medium flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-[var(--accent-warm)]" />
            <span>Insert Media from Library</span>
          </h2>
          <button onClick={onClose} className="p-1 hover:text-[var(--text-primary)] text-[var(--text-muted)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload bar */}
        <div className="p-3 border border-[var(--border-subtle)] rounded bg-[var(--code-bg)] flex flex-wrap justify-between items-center gap-2">
          <div className="text-xs font-sans text-[var(--text-secondary)]">
            Upload new photo or video clip
          </div>
          <label className="relative overflow-hidden quiet-button text-xs flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>{uploading ? 'Uploading...' : 'Choose File'}</span>
            <input
              type="file"
              accept="image/*,video/*,.heic,.heif,.jpg,.jpeg,.png,.webp"
              onChange={handleFileUpload}
              disabled={uploading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
          </label>
        </div>

        {error && (
          <div className="p-3 bg-[var(--code-bg)] text-[var(--text-primary)] text-xs font-sans border border-[var(--border-subtle)] rounded">
            {error}
          </div>
        )}

        {/* Media Grid - Using vanilla CSS responsive-media-grid */}
        <div className="responsive-media-grid max-h-[50dvh] overflow-y-auto p-1">
          {loading ? (
            <div className="text-center py-8 text-xs font-sans text-[var(--text-muted)]">
              Loading media files...
            </div>
          ) : mediaList.length === 0 ? (
            <div className="text-center py-8 text-xs font-sans text-[var(--text-muted)]">
              No media uploaded yet. Use the upload button above.
            </div>
          ) : (
            mediaList.map(item => (
              <div
                key={item.id}
                onClick={() => {
                  onSelectMedia({ ...item, url: item.signed_url || item.url });
                  onClose();
                }}
                className="group relative border border-[var(--border-subtle)] rounded overflow-hidden cursor-pointer hover:border-[var(--accent-warm)] transition-colors aspect-square bg-black/5"
              >
                {item.mime_type && item.mime_type.startsWith('video/') ? (
                  <video src={item.signed_url || item.url} className="w-full h-full object-cover" />
                ) : (
                  <img src={item.signed_url || item.url} alt={item.original_name} className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-black/40 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-sans font-medium text-center p-2">
                  Tap to insert
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
