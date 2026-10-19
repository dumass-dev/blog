import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase, safeApiFetch } from '../../supabase';
import ThemeToggle from '../../components/ThemeToggle';
import FeedSkeleton from '../../components/FeedSkeleton';
import ProgressiveImage from '../../components/ProgressiveImage';
import StorageUsageCard from '../../components/StorageUsageCard';
import { Upload, ArrowLeft, Copy, Trash2, Check, FileVideo, FileImage, RotateCw } from 'lucide-react';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getPersistedMediaCache() {
  try {
    const raw = localStorage.getItem('cached_admin_media_list');
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export default function Media() {
  const { token } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();
  const cachedInitial = getPersistedMediaCache();
  const [mediaList, setMediaList] = useState(cachedInitial);
  const [storageData, setStorageData] = useState(null);
  const [loading, setLoading] = useState(() => !cachedInitial.length);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const mediaListRef = useRef(mediaList);
  mediaListRef.current = mediaList;

  const fetchMedia = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else if (!mediaListRef.current.length) setLoading(true);

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
    try {
      localStorage.setItem('cached_admin_media_list', JSON.stringify(list));
    } catch {}

    // Fetch live storage statistics
    const storageRes = await safeApiFetch('/api/storage/stats', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (storageRes?.b2) {
      setStorageData(storageRes);
    } else {
      const totalBytes = list.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
      const B2_TOTAL = 30 * 1024 * 1024 * 1024;
      const VAULT_CAP = 10 * 1024 * 1024 * 1024;
      setStorageData({
        b2: {
          totalAllocatedBytes: B2_TOTAL,
          usedBytes: totalBytes,
          percentUsed: Number(((totalBytes / B2_TOTAL) * 100).toFixed(2)),
          fileCount: list.length,
          vaults: [
            { id: 'media1', name: 'Pool 1 (q04ti-media-1)', bucket: 'q04ti-media-1', allocatedBytes: VAULT_CAP, usedBytes: Math.min(totalBytes, VAULT_CAP) },
            { id: 'media2', name: 'Pool 2 (q04ti-media-2)', bucket: 'q04ti-media-2', allocatedBytes: VAULT_CAP, usedBytes: Math.min(Math.max(0, totalBytes - VAULT_CAP), VAULT_CAP) },
            { id: 'journal', name: 'Vault 3 (q04ti-blog)', bucket: 'q04ti-blog', allocatedBytes: VAULT_CAP, usedBytes: Math.max(0, totalBytes - (VAULT_CAP * 2)) }
          ]
        },
        supabase: {
          totalAllocatedBytes: 500 * 1024 * 1024,
          usedBytes: list.length * 200,
          percentUsed: 0.01,
          breakdown: {
            entriesCount: 0,
            entriesBytes: 0,
            commentsCount: 0,
            commentsBytes: 0,
            mediaRowsCount: list.length
          }
        }
      });
    }

    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => {
    fetchMedia();
  }, [token, fetchMedia]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);

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

      toastSuccess('Media uploaded to Backblaze pool successfully.');
      fetchMedia();
    } catch (err) {
      toastError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleCopy = (url, id) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toastSuccess('Asset URL copied to clipboard.');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id) => {
    if (deletingId) return;
    if (!window.confirm('Delete this media file permanently?')) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/media/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toastSuccess('Media file removed.');
        fetchMedia();
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Delete failed.');
      }
    } catch (err) {
      toastError(err.message || 'Delete failed.');
    } finally {
      setDeletingId(null);
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

        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          <button
            onClick={() => fetchMedia(true)}
            disabled={refreshing}
            className="quiet-button-secondary text-xs flex items-center gap-1.5 cursor-pointer"
            title="Refresh media library"
          >
            <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>

          <div className="p-1 border border-[var(--border-subtle)] rounded bg-[var(--card-bg)] flex items-center justify-center">
            <ThemeToggle />
          </div>

          <label className="relative overflow-hidden quiet-button text-xs flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>{uploading ? 'Uploading...' : 'Upload'}</span>
            {!uploading && <span className="hidden sm:inline">&nbsp;Photo, GIF, or Video</span>}
            <input
              type="file"
              accept="image/*,video/*,.gif,.heic,.heif,.jpg,.jpeg,.png,.webp"
              onChange={handleFileUpload}
              disabled={uploading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
          </label>
        </div>
      </div>

      {/* Unified Storage Allocation Meter */}
      <StorageUsageCard
        storageData={storageData}
        refreshing={refreshing}
        onRefresh={() => fetchMedia(true)}
      />

      {/* Media Grid */}
      {loading ? (
        <FeedSkeleton type="media" count={6} />
      ) : mediaList.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-[var(--border-subtle)] rounded p-12">
          <p className="text-sm font-serif text-[var(--text-secondary)] mb-4">
            Your media library is currently empty.
          </p>
          <label className="relative overflow-hidden quiet-button text-xs inline-flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload first image, GIF, or video</span>
            <input
              type="file"
              accept="image/*,video/*,.gif,.heic,.heif,.jpg,.jpeg,.png,.webp"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
          </label>
        </div>
      ) : (
        <div className="responsive-card-grid">
          {mediaList.map((item, index) => (
            <div
              key={item.id}
              className="border border-[var(--border-subtle)] rounded overflow-hidden bg-[var(--card-bg)] flex flex-col justify-between"
            >
              {/* Preview */}
              <div className="aspect-video bg-black/10 relative flex items-center justify-center overflow-hidden">
                {item.mime_type && item.mime_type.startsWith('video/') ? (
                  <video src={item.signed_url || item.url} className="w-full h-full object-cover" controls />
                ) : (
                  <ProgressiveImage
                    src={item.signed_url || item.url}
                    alt={item.original_name || 'Media'}
                    aspectRatio="aspect-video"
                    loading={index < 8 ? 'eager' : 'lazy'}
                  />
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

                <div className="flex items-center gap-2">
                  {(!item.mime_type || item.mime_type.startsWith('image/')) && (
                    <Link
                      to={`/admin/new?type=photo&cover_image=${encodeURIComponent(item.signed_url || item.url)}`}
                      className="flex items-center gap-1 text-[var(--text-primary)] hover:underline font-medium text-[11px]"
                      title="Publish to Photos Feed"
                    >
                      <span>Publish Photo</span>
                    </Link>
                  )}
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer p-1 disabled:opacity-40"
                    title="Delete media"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
