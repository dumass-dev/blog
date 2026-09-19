import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase, safeApiFetch } from '../../supabase';
import { Upload, ArrowLeft, Copy, Trash2, Check, FileVideo, FileImage } from 'lucide-react';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function Media() {
  const { token } = useAuth();
  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [error, setError] = useState(null);

  const fetchMedia = async () => {
    setLoading(true);
    setError(null);

    // Try API server first
    const data = await safeApiFetch('/api/media', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (Array.isArray(data)) {
      setMediaList(data);
      setLoading(false);
      return;
    }

    // Direct Supabase fallback
    try {
      const { data: supaMedia, error: supaErr } = await supabase
        .from('media')
        .select('*')
        .order('created_at', { ascending: false });

      if (!supaErr && Array.isArray(supaMedia)) {
        setMediaList(supaMedia);
      } else {
        setMediaList([]);
      }
    } catch (e) {
      setMediaList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, [token]);

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

  const handleCopy = (url, id) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this media file permanently?')) return;

    try {
      const res = await fetch(`/api/media/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchMedia();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="wide-container pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 border-b border-[var(--border-subtle)] mb-8 gap-4">
        <div className="flex items-center space-x-3">
          <Link
            to="/admin"
            className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-serif font-medium">Media Library</h1>
        </div>

        <label className="quiet-button text-xs flex items-center gap-1.5 cursor-pointer">
          <Upload className="w-3.5 h-3.5" />
          <span>{uploading ? 'Uploading...' : 'Upload Photo or Video'}</span>
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
        <div className="mb-6 p-3 bg-[var(--code-bg)] text-[var(--text-primary)] text-xs font-sans rounded border border-[var(--border-subtle)]">
          {error}
        </div>
      )}

      {/* Media Grid */}
      {loading ? (
        <div className="py-16 text-center text-xs font-sans text-[var(--text-muted)] italic">
          Loading media library...
        </div>
      ) : mediaList.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-[var(--border-subtle)] rounded p-12">
          <p className="text-sm font-serif text-[var(--text-secondary)] mb-4">
            Your media library is currently empty.
          </p>
          <label className="quiet-button text-xs inline-flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload first image or video</span>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {mediaList.map(item => (
            <div
              key={item.id}
              className="border border-[var(--border-subtle)] rounded overflow-hidden bg-[var(--card-bg)] flex flex-col justify-between"
            >
              {/* Preview */}
              <div className="aspect-video bg-black/10 relative flex items-center justify-center overflow-hidden">
                {item.mime_type && item.mime_type.startsWith('video/') ? (
                  <video src={item.signed_url || item.url} className="w-full h-full object-cover" controls />
                ) : (
                  <img src={item.signed_url || item.url} alt={item.original_name} className="w-full h-full object-cover" />
                )}
                <span className="absolute top-2 left-2 p-1 rounded bg-black/60 text-white text-[10px]">
                  {item.mime_type && item.mime_type.startsWith('video/') ? <FileVideo className="w-3 h-3" /> : <FileImage className="w-3 h-3" />}
                </span>
              </div>

              {/* Info */}
              <div className="p-3 text-xs font-sans border-t border-[var(--border-subtle)]">
                <div className="font-medium text-[var(--text-primary)] truncate" title={item.original_name}>
                  {item.original_name}
                </div>
                <div className="text-[var(--text-muted)] mt-0.5 flex justify-between">
                  <span>{formatBytes(item.size)}</span>
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="p-2 bg-[var(--code-bg)] border-t border-[var(--border-subtle)] flex justify-between items-center text-xs font-sans">
                <button
                  onClick={() => handleCopy(item.signed_url || item.url, item.id)}
                  className="flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {copiedId === item.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[var(--text-primary)]" />
                      <span className="text-[var(--text-primary)] font-medium">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleDelete(item.id)}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer p-1"
                  title="Delete media"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
