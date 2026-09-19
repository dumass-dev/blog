import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Upload, X, Check, Image as ImageIcon } from 'lucide-react';

import Modal from './Modal';

export default function MediaPicker({ isOpen, onClose, onSelectMedia }) {
  const { token } = useAuth();
  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMedia = () => {
    setLoading(true);
    fetch('/api/media', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setMediaList(Array.isArray(data) ? data : []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      fetchMedia();
    }
  }, [isOpen]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed.');
      }

      fetchMedia();
    } catch (err) {
      setError(err.message);
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
          <label className="quiet-button text-xs flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>{uploading ? 'Uploading...' : 'Choose File'}</span>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
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
