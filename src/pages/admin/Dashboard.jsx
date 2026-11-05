import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase, safeApiFetch, invalidateFeedCache } from '../../supabase';
import { publishRealtimeUpdate } from '../../utils/realtime';
import Modal from '../../components/Modal';
import { useConfirm } from '../../components/ConfirmModal';
import ThemeToggle from '../../components/ThemeToggle';
import FeedSkeleton from '../../components/FeedSkeleton';
import PWAInstallButton from '../../components/PWAInstallButton';
import {
  Plus,
  FileText,
  MessageSquare,
  Image as ImageIcon,
  Edit,
  Trash2,
  ExternalLink,
  Search,
  UserCheck,
  LogOut,
  Eye,
  RotateCw,
  BarChart2,
  Copy,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

import { stripMarkdown } from '../../utils/excerpt';
import StorageUsageCard from '../../components/StorageUsageCard';
import { useToast } from '../../context/ToastContext';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getPersistedCache() {
  try {
    const raw = localStorage.getItem('cached_admin_dashboard_v2');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { entries: null, stats: null, comments: null, storage: null };
}

function setPersistedCache(data) {
  try {
    localStorage.setItem('cached_admin_dashboard_v2', JSON.stringify(data));
  } catch {}
}

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();
  const [confirm, confirmDialog] = useConfirm();

  const [cachedData] = useState(() => getPersistedCache());

  const [stats, setStats] = useState(() => cachedData.stats || { total: 0, published: 0, drafts: 0, updates: 0, mediaCount: 0, totalViews: 0, topPosts: [] });
  const [storageData, setStorageData] = useState(() => cachedData.storage || null);
  const [entries, setEntries] = useState(() => cachedData.entries || []);
  // The overview counts follow the live list: deleting/publishing a post
  // updated the table instantly but left "N entries" stale until a reload.
  useEffect(() => {
    if (!Array.isArray(entries) || entries.length === 0) return;
    const total = entries.length;
    const published = entries.filter(e => e.status === 'published').length;
    const drafts = entries.filter(e => e.status === 'draft').length;
    setStats(prev => (prev.total === total && prev.published === published && prev.drafts === drafts)
      ? prev
      : { ...prev, total, published, drafts });
  }, [entries]);
  const [comments, setComments] = useState(() => cachedData.comments || []);
  const [loading, setLoading] = useState(() => !cachedData.entries);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'views' | 'title'
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showStats, setShowStats] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [showOnHome, setShowOnHome] = useState(false);
  const [npLoaded, setNpLoaded] = useState(false);
  const [npFailed, setNpFailed] = useState(false);
  const [analyticsTarget, setAnalyticsTarget] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const handleCopyLink = (item) => {
    const slug = item.slug || item.id;
    const url = `${window.location.origin}/entry/${slug}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedId(item.id);
        setTimeout(() => setCopiedId(null), 2000);
      }).catch(() => fallbackCopy(url, item.id));
    } else {
      fallbackCopy(url, item.id);
    }
  };

  const fallbackCopy = (url, id) => {
    try {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const commentsRef = useRef(comments);
  commentsRef.current = comments;

  const loadData = useCallback(async (isManual = false) => {
    if (isManual) {
      setRefreshing(true);
    } else if (!entriesRef.current.length) {
      setLoading(true);
    }

    // Fetch all data sources in parallel to eliminate waterfall latency
    const [postsRes, statsRes, commentsRes, npRes, storageRes] = await Promise.allSettled([
      safeApiFetch('/api/posts?status=all', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      }),
      safeApiFetch('/api/stats', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      }),
      supabase.from('comments').select('*, entries(title, slug)').order('created_at', { ascending: false }),
      safeApiFetch(`/api/now-playing?t=${Date.now()}`),
      safeApiFetch('/api/storage/stats', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
    ]);

    // 1. Process Posts
    let postsList = (postsRes.status === 'fulfilled' && Array.isArray(postsRes.value)) ? postsRes.value : [];
    let postsSourceOk = postsRes.status === 'fulfilled' && Array.isArray(postsRes.value);
    if (postsList.length === 0) {
      try {
        const { data: supaPosts, error: supaErr } = await supabase.from('entries').select('*').order('date', { ascending: false });
        if (!supaErr && Array.isArray(supaPosts)) {
          postsList = supaPosts;
          postsSourceOk = true;
        }
      } catch {}
    }

    const processedPosts = postsList.map(item => {
      const isPhoto = Boolean(
        item.type === 'photo' ||
        (item.category && item.category.toLowerCase() === 'photos')
      );
      return {
        ...item,
        type: isPhoto ? 'photo' : item.type
      };
    });

    // 2. Process Stats
    let currentStats = (statsRes.status === 'fulfilled' && statsRes.value && typeof statsRes.value === 'object' && !Array.isArray(statsRes.value))
      ? statsRes.value
      : null;

    if (!currentStats) {
      const published = postsList.filter(e => e.status !== 'draft').length;
      const drafts = postsList.filter(e => e.status === 'draft').length;
      const updates = postsList.filter(e => e.type === 'update').length;
      const totalViews = postsList.reduce((acc, curr) => acc + (curr.views || 0), 0);

      currentStats = {
        total: postsList.length,
        published,
        drafts,
        updates,
        mediaCount: 0,
        totalViews,
        topPosts: []
      };
    }

    // 3. Process Reader Comments
    const commentsOk = commentsRes.status === 'fulfilled' && Array.isArray(commentsRes.value?.data);
    const fetchedComments = commentsOk ? commentsRes.value.data : commentsRef.current;

    // 4. Process Now Playing Settings
    const npOk = npRes.status === 'fulfilled' && npRes.value && npRes.value.showOnHome !== undefined;

    // 5. Process Storage Allocation Stats
    let resolvedStorage = (storageRes.status === 'fulfilled' && storageRes.value?.b2)
      ? storageRes.value
      : null;

    if (!resolvedStorage) {
      try {
        const { data: mediaRows, error: mediaErr } = await supabase.from('media').select('size, url');
        if (!mediaErr && Array.isArray(mediaRows)) {
          const mRows = mediaRows;
          const totalMediaBytes = mRows.reduce((sum, r) => sum + (Number(r.size) || 0), 0);
          const B2_TOTAL = 30 * 1024 * 1024 * 1024;
          const VAULT_CAP = 10 * 1024 * 1024 * 1024;
          const SUPA_TOTAL = 500 * 1024 * 1024;

          let entriesTextBytes = 0;
          for (const e of postsList) {
            entriesTextBytes += (e.title || '').length + (e.content || '').length + (e.excerpt || '').length;
          }
          const commentsTextBytes = (fetchedComments || []).reduce((sum, c) => sum + (c.content || '').length + (c.author_name || '').length, 0);
          const dbBytes = entriesTextBytes + commentsTextBytes + (mRows.length * 160) + (postsList.length * 240);

          resolvedStorage = {
            b2: {
              totalAllocatedBytes: B2_TOTAL,
              usedBytes: totalMediaBytes,
              percentUsed: Number(((totalMediaBytes / B2_TOTAL) * 100).toFixed(2)),
              fileCount: mRows.length,
              vaults: [
                { id: 'media1', name: 'Pool 1 (q04ti-media-1)', bucket: 'q04ti-media-1', allocatedBytes: VAULT_CAP, usedBytes: Math.min(totalMediaBytes, VAULT_CAP) },
                { id: 'media2', name: 'Pool 2 (q04ti-media-2)', bucket: 'q04ti-media-2', allocatedBytes: VAULT_CAP, usedBytes: Math.min(Math.max(0, totalMediaBytes - VAULT_CAP), VAULT_CAP) },
                { id: 'journal', name: 'Vault 3 (q04ti-blog)', bucket: 'q04ti-blog', allocatedBytes: VAULT_CAP, usedBytes: Math.max(0, totalMediaBytes - (VAULT_CAP * 2)) }
              ]
            },
            supabase: {
              totalAllocatedBytes: SUPA_TOTAL,
              usedBytes: dbBytes,
              percentUsed: Number(((dbBytes / SUPA_TOTAL) * 100).toFixed(2)),
              breakdown: {
                entriesCount: postsList.length,
                entriesBytes: entriesTextBytes,
                commentsCount: (fetchedComments || []).length,
                commentsBytes: commentsTextBytes,
                mediaRowsCount: mRows.length
              }
            }
          };
        }
      } catch {}
    }

    // Apply: on total failure (every source down) the last-good state and
    // persisted cache are left untouched, so a failed refresh never wipes
    // the dashboard to an empty list. A manual refresh that fails outright
    // gets an error toast instead of the success toast.
    const statsOk = statsRes.status === 'fulfilled' && statsRes.value && typeof statsRes.value === 'object' && !Array.isArray(statsRes.value);
    const storageOk = storageRes.status === 'fulfilled' && Boolean(storageRes.value?.b2);
    const anySourceOk = postsSourceOk || statsOk || commentsOk || npOk || storageOk || Boolean(resolvedStorage);

    if (!anySourceOk) {
      setLoadError(true);
      setLoading(false);
      setRefreshing(false);
      if (isManual) {
        toastError('Could not refresh — showing the last saved data.');
      }
      return;
    }

    setLoadError(false);

    if (postsSourceOk) {
      setEntries(processedPosts);
    }

    if (statsOk || postsSourceOk) {
      setStats(currentStats);
    }

    if (commentsOk) {
      setComments(fetchedComments);
    }

    if (npOk) {
      setShowOnHome(npRes.value.showOnHome);
      setNpLoaded(true);
      setNpFailed(false);
    } else {
      // Stay disabled (the real setting is unknown) but say so instead of
      // showing "…" forever; Refresh tries again.
      setNpFailed(true);
    }

    if (resolvedStorage) {
      setStorageData(resolvedStorage);
    }

    // Persist per source: a failed source keeps its last-good cached value
    // instead of being overwritten with an empty/zeroed one.
    const prevCache = getPersistedCache();
    setPersistedCache({
      entries: postsSourceOk ? postsList : (prevCache.entries ?? entriesRef.current),
      stats: (statsOk || postsSourceOk) ? currentStats : (prevCache.stats ?? null),
      comments: commentsOk ? fetchedComments : (prevCache.comments ?? commentsRef.current),
      storage: resolvedStorage || prevCache.storage || null
    });

    setLoading(false);
    setRefreshing(false);

    if (isManual) {
      toastSuccess('Refreshed just now');
    }
  }, [token, toastSuccess, toastError]);

  useEffect(() => {
    loadData();
  }, [token, loadData]);

  // Realtime live sync: refresh dashboard data silently when changes occur
  useEffect(() => {
    const handleFeedChange = () => {
      loadData(false);
    };
    const handleCommentChange = () => {
      loadData(false);
    };
    const handleViewsChange = (e) => {
      const detail = e.detail;
      if (!detail || typeof detail.views !== 'number') return;
      setEntries(prev => prev.map(entry => {
        if ((detail.id && entry.id === detail.id) || (detail.slug && entry.slug === detail.slug)) {
          return { ...entry, views: detail.views };
        }
        return entry;
      }));
      setAnalyticsTarget(prev => {
        if (!prev) return prev;
        if ((detail.id && prev.id === detail.id) || (detail.slug && prev.slug === detail.slug)) {
          return { ...prev, views: detail.views };
        }
        return prev;
      });
    };

    window.addEventListener('feed-data-invalidated', handleFeedChange);
    window.addEventListener('comments-updated', handleCommentChange);
    window.addEventListener('entry-views-updated', handleViewsChange);
    return () => {
      window.removeEventListener('feed-data-invalidated', handleFeedChange);
      window.removeEventListener('comments-updated', handleCommentChange);
      window.removeEventListener('entry-views-updated', handleViewsChange);
    };
  }, [loadData]);


  const handleDelete = async (id) => {
    let deleted = false;
    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) deleted = true;
    } catch {}

    if (!deleted && token) {
      try {
        const { error } = await supabase.from('entries').delete().eq('id', id);
        if (!error) deleted = true;
      } catch {}
    }

    if (deleted) {
      invalidateFeedCache();
      publishRealtimeUpdate({
        type: 'entry',
        op: 'DELETE',
        id
      });
      setDeleteTarget(null);
      setEntries(prev => {
        const updated = prev.filter(e => e.id !== id);
        setPersistedCache({ entries: updated, stats, comments });
        return updated;
      });
    } else {
      toastError('Failed to delete entry.');
    }
  };

  const handleDeleteComment = async (commentId) => {
    const ok = await confirm({
      title: 'Delete Comment',
      message: 'Permanently delete this reader comment?',
      confirmLabel: 'Delete'
    });
    if (!ok) return;
    setDeletingCommentId(commentId);
    let deleted = false;

    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) deleted = true;
    } catch {}

    if (!deleted && token) {
      try {
        const { error } = await supabase.from('comments').delete().eq('id', commentId);
        if (!error) deleted = true;
      } catch {}
    }

    if (deleted) {
      publishRealtimeUpdate({
        type: 'comment',
        op: 'DELETE',
        commentId
      });
      setComments(prev => {
        const updated = prev.filter(c => c.id !== commentId);
        setPersistedCache({ entries, stats, comments: updated });
        return updated;
      });
    } else {
      toastError('Failed deleting comment.');
    }
    setDeletingCommentId(null);
  };

  const toggleShowOnHome = async () => {
    const newValue = !showOnHome;
    // Optimistic UI update
    setShowOnHome(newValue);

    try {
      const res = await safeApiFetch('/api/now-playing/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ showOnHome: newValue })
      });
      if (!res || !res.success) {
        // Revert if API fails
        setShowOnHome(!newValue);
      } else {
        publishRealtimeUpdate({
          type: 'now_playing',
          op: 'TOGGLE_HOME',
          showOnHome: newValue
        });
        if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
          window.dispatchEvent(new window.CustomEvent('now-playing-updated', { detail: { showOnHome: newValue } }));
        }
      }
    } catch {
      // Revert if fetch throws
      setShowOnHome(!newValue);
    }
  };

  // Filtering & Sorting Logic
  const filteredAndSortedEntries = React.useMemo(() => {
    const list = entries.filter(item => {
      const matchesSearch =
        !search.trim() ||
        (item.title && item.title.toLowerCase().includes(search.toLowerCase())) ||
        (item.content && item.content.toLowerCase().includes(search.toLowerCase())) ||
        (item.tags && item.tags.toLowerCase().includes(search.toLowerCase()));

      if (!matchesSearch) return false;

      if (filter === 'all') return true;
      if (filter === 'published') return item.status !== 'draft';
      if (filter === 'draft') return item.status === 'draft';
      if (filter === 'photo') return item.type === 'photo';
      if (filter === 'journal') return item.type === 'journal';
      if (filter === 'writing') return item.type === 'writing';
      if (filter === 'update') return item.type === 'update';

      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.date || a.created_at) - new Date(b.date || b.created_at);
      }
      if (sortBy === 'views') {
        return (b.views || 0) - (a.views || 0);
      }
      if (sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      // Default: newest
      return new Date(b.date || b.created_at) - new Date(a.date || a.created_at);
    });
  }, [entries, search, filter, sortBy]);

  // Reset page when filter, search, sort, or pageSize changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search, sortBy, pageSize]);

  const totalEntriesCount = filteredAndSortedEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalEntriesCount / pageSize));
  const paginatedEntries = filteredAndSortedEntries.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="wide-container py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 mb-8 border-b border-[var(--border-subtle)] gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif font-medium tracking-tight">
            Author Studio
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <p className="text-xs font-sans text-[var(--text-secondary)]">
              Logged in as <span className="font-mono font-medium text-[var(--text-primary)]">{user?.email || user?.username || 'Admin'}</span>
            </p>
          </div>
        </div>

        <div 
          className="w-full sm:w-auto admin-header-actions-scroll no-scrollbar max-w-full pb-1 pt-0.5"
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-max">
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="quiet-button-secondary text-xs flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
              title="Force update latest admin data"
            >
              <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Syncing...' : 'Refresh'}</span>
            </button>

            <Link to="/" className="quiet-button-secondary text-xs flex items-center gap-1.5 shrink-0 whitespace-nowrap" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" />
              <span>View Public Site</span>
            </Link>

            <PWAInstallButton />

            <div className="p-1 border border-[var(--border-subtle)] rounded bg-[var(--card-bg)] flex items-center justify-center shrink-0">
              <ThemeToggle />
            </div>

            <button onClick={logout} className="quiet-button-secondary text-xs flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Studio Overview Accordion - Available on both Desktop and Mobile */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setShowStats(prev => !prev)}
          className="w-full flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--card-bg)] hover:bg-[var(--code-bg)]/40 text-xs font-sans text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer select-none transition-colors"
        >
          <div className="flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--accent-warm)] shrink-0" />
            <span className="font-medium text-xs text-[var(--text-primary)] whitespace-nowrap">Studio Overview</span>
            <span className="text-[10px] sm:text-[11px] font-mono text-[var(--text-muted)]">({stats.total} entries · {stats.totalViews || 0} views)</span>
          </div>
          {showStats ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
        </button>
      </div>

      {/* Metrics Row - Appears when expanded on both Desktop and Mobile */}
      {showStats && (
        <div className="responsive-card-grid mb-6 animate-fadeIn">
          <div className="border border-[var(--border-subtle)] p-4 rounded bg-[var(--card-bg)]">
            <div className="text-xs font-sans text-[var(--text-muted)] uppercase">Total Entries</div>
            <div className="text-2xl font-serif font-medium mt-1">{stats.total}</div>
          </div>

          <div className="border border-[var(--border-subtle)] p-4 rounded bg-[var(--card-bg)]">
            <div className="text-xs font-sans text-[var(--text-muted)] uppercase">Published</div>
            <div className="text-2xl font-serif font-medium mt-1 text-[var(--text-primary)]">{stats.published}</div>
          </div>

          <div className="border border-[var(--border-subtle)] p-4 rounded bg-[var(--card-bg)]">
            <div className="text-xs font-sans text-[var(--text-muted)] uppercase">Drafts</div>
            <div className="text-2xl font-serif font-medium mt-1 text-[var(--text-primary)]">{stats.drafts}</div>
          </div>

          <div className="border border-[var(--border-subtle)] p-4 rounded bg-[var(--card-bg)]">
            <div className="text-xs font-sans text-[var(--text-muted)] uppercase">Updates</div>
            <div className="text-2xl font-serif font-medium mt-1">{stats.updates}</div>
          </div>

          <div className="border border-[var(--border-subtle)] p-4 rounded bg-[var(--card-bg)]">
            <div className="text-xs font-sans text-[var(--text-muted)] uppercase">Total Views</div>
            <div className="text-2xl font-serif font-medium mt-1 text-[var(--accent-warm)] flex items-center gap-1">
              <Eye className="w-4 h-4 opacity-75" />
              <span>{stats.totalViews || 0}</span>
            </div>
          </div>

          <div className="border border-[var(--border-subtle)] p-4 rounded bg-[var(--card-bg)]">
            <div className="text-xs font-sans text-[var(--text-muted)] uppercase">Media Files</div>
            <div className="text-2xl font-serif font-medium mt-1">{stats.mediaCount}</div>
          </div>
        </div>
      )}

      {/* Storage & Cloud Allocation Meter */}
      <StorageUsageCard
        storageData={storageData}
        refreshing={refreshing}
        onRefresh={() => loadData(true)}
      />

      {/* Action Bar */}
      <div className="admin-quick-actions-container">
        <Link to="/admin/new?type=journal" className="quiet-button admin-quick-action text-xs flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span>New Journal Entry</span>
        </Link>

        <Link to="/admin/new?type=photo" className="quiet-button admin-quick-action text-xs flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 shrink-0" />
          <span>Post Photo</span>
        </Link>

        <Link to="/admin/new?type=writing" className="quiet-button-secondary admin-quick-action text-xs flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          <span>New Essay</span>
        </Link>

        <Link to="/admin/new?type=update" className="quiet-button-secondary admin-quick-action text-xs flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Quick Update</span>
        </Link>

        <Link to="/admin/media" className="quiet-button-secondary admin-quick-action text-xs flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Media Manager</span>
        </Link>

        <Link to="/admin/about" className="quiet-button-secondary admin-quick-action text-xs flex items-center gap-1.5">
          <UserCheck className="w-3.5 h-3.5" />
          <span>Edit About Page</span>
        </Link>

        <button
          onClick={toggleShowOnHome}
          disabled={!npLoaded}
          className="quiet-button-secondary admin-quick-action text-xs flex items-center justify-center gap-2 border border-[var(--border-subtle)] bg-[var(--card-bg)] rounded px-3 py-2 cursor-pointer hover:opacity-80 disabled:opacity-50 disabled:cursor-wait"
          title={npLoaded ? 'Toggle music card on homepage' : (npFailed ? 'Could not load this setting. Press Refresh to try again.' : 'Loading music card state…')}
        >
          <div className={`w-2 h-2 rounded-full shrink-0 ${showOnHome ? 'bg-[var(--accent-warm)] animate-pulse' : 'bg-gray-400 dark:bg-gray-600'}`} />
          <span>Show on Home: {npLoaded ? (showOnHome ? 'ON' : 'OFF') : (npFailed ? '—' : '…')}</span>
        </button>
      </div>

      {/* Filter, Sort, and Search Controls */}
      <div className="flex flex-col md:flex-row gap-3 justify-between items-start md:items-center mb-6">
        <div className="admin-filter-tabs">
          {[
            { id: 'all', label: `All (${entries.length})` },
            // Counted from the same list the tabs filter, so the number always
            // matches what the tab shows (unlisted entries included).
            { id: 'published', label: `Published (${entries.filter(e => e.status !== 'draft').length})` },
            { id: 'draft', label: `Drafts (${entries.filter(e => e.status === 'draft').length})` },
            { id: 'photo', label: 'Photos' },
            { id: 'journal', label: 'Journal' },
            { id: 'writing', label: 'Essays' },
            { id: 'update', label: 'Updates' },
            { id: 'comments', label: `Comments (${comments.length})` }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`admin-filter-tab ${
                filter === f.id
                  ? 'active'
                  : 'inactive'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          {/* Search Bar (Left) */}
          <div className="relative flex-1 md:w-64 min-w-0 flex items-center">
            <Search
              className="w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none"
              style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}
            />
            <label htmlFor="dashboard-search" className="sr-only">Search entries or comments</label>
            <input
              id="dashboard-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search entries or comments..."
              style={{ paddingLeft: '2.25rem', paddingRight: '0.75rem' }}
              className="w-full text-xs py-2 font-sans border border-[var(--border-subtle)] rounded bg-[var(--bg-main)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--text-secondary)] transition-colors"
            />
          </div>

          {/* Sort Dropdown (Right) */}
          {filter !== 'comments' && (
            <div className="relative w-36 sm:w-40 shrink-0">
              <label htmlFor="dashboard-sort" className="sr-only">Sort entries</label>
              <select
                id="dashboard-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.65rem center',
                  paddingLeft: '0.85rem',
                  paddingRight: '1.75rem'
                }}
                className="w-full text-xs py-2 pl-3.5 pr-6 font-sans cursor-pointer bg-[var(--bg-main)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded focus:outline-none focus:border-[var(--text-secondary)] transition-colors"
                title="Sort entries"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="views">Most Views</option>
                <option value="title">Title (A–Z)</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Entries & Comments Container */}
      <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden bg-[var(--card-bg)]">
        {!loading && loadError && (
          <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--code-bg)] text-xs font-sans text-[var(--text-primary)]">
            Couldn&apos;t load the latest data — showing the last saved entries. Try Refresh.
          </div>
        )}
        {loading ? (
          <div className="p-4">
            <FeedSkeleton type="table" count={5} />
          </div>
        ) : filter === 'comments' ? (
          /* Reader Comments Moderation View */
          comments.length === 0 ? (
            <div className="p-8 text-center text-xs font-sans text-[var(--text-muted)] italic animate-content-fade">
              No reader comments found.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {comments
                .filter(c => !search.trim() || (c.author_name || '').toLowerCase().includes(search.toLowerCase()) || (c.content || '').toLowerCase().includes(search.toLowerCase()))
                .map(item => (
                  <div key={item.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs font-sans w-full min-w-0">
                    <div className="space-y-1.5 w-full min-w-0 max-w-2xl">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] text-[var(--text-muted)] min-w-0">
                        <span className="font-medium text-[var(--text-primary)] truncate max-w-[150px] sm:max-w-none">{item.author_name}</span>
                        <span>·</span>
                        <span className="shrink-0">{formatDate(item.created_at)}</span>
                        {item.entries?.slug && (
                          <>
                            <span>·</span>
                            <Link to={`/entry/${item.entries.slug}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-[var(--accent-warm)] truncate max-w-[160px] sm:max-w-xs inline-block align-bottom" title={item.entries.title}>
                              {item.entries.title || 'View Post'}
                            </Link>
                          </>
                        )}
                      </div>
                      <p className="font-serif text-sm text-[var(--text-primary)] leading-relaxed break-words whitespace-pre-wrap">
                        {item.content}
                      </p>
                    </div>

                    <div className="w-full sm:w-auto flex justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border-subtle)]/40 shrink-0">
                      <button
                        onClick={() => handleDeleteComment(item.id)}
                        disabled={deletingCommentId === item.id}
                        className="quiet-button-secondary text-xs text-red-500 hover:text-red-600 flex items-center gap-1.5 py-1 px-2.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{deletingCommentId === item.id ? 'Deleting...' : 'Delete Comment'}</span>
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )
        ) : filteredAndSortedEntries.length === 0 ? (
          <div className="p-8 text-center text-xs font-sans text-[var(--text-muted)]">
            {loadError ? 'Could not load entries — showing the last saved data. Try Refresh.' : 'No entries found.'}
          </div>
        ) : (
          <>
            {/* Mobile Card List View (< 640px) */}
            <div className="block sm:hidden divide-y divide-[var(--border-subtle)]">
              {paginatedEntries.map(item => (
                <div key={item.id} className="p-4 space-y-3 bg-[var(--card-bg)]">
                  {/* Top Header: Date & Badges */}
                  <div className="flex items-center justify-between text-xs font-sans">
                    <span className="text-[var(--text-muted)] font-mono text-[11px]">
                      {formatDate(item.date)}
                    </span>
                    <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
                      {Boolean(item.has_passcode || (item.passcode && item.passcode.trim() !== '')) && (
                        <span className="text-[10px] uppercase font-medium px-2 py-0.5 rounded bg-[var(--code-bg)] text-[var(--accent-warm)] border border-[var(--border-subtle)] whitespace-nowrap" title="Passcode Protected">
                          Protected
                        </span>
                      )}
                      <span className="uppercase text-[10px] font-medium px-2 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-secondary)] whitespace-nowrap">
                        {item.type}
                      </span>
                      <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded border border-[var(--border-subtle)] whitespace-nowrap ${
                        item.status === 'draft' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-[var(--code-bg)] text-[var(--text-primary)]'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                  </div>

                  {/* Title & Preview (plain text — only the Edit button opens the editor) */}
                  <div>
                    <div className="font-serif text-base font-medium text-[var(--text-primary)] line-clamp-2 block">
                      {item.title || item.content}
                    </div>
                    {item.excerpt && (
                      <p className="text-[var(--text-muted)] text-xs line-clamp-2 mt-1 font-serif">
                        {stripMarkdown(item.excerpt)}
                      </p>
                    )}
                  </div>

                  {/* Actions & Metrics Row */}
                  <div className="entry-card-actions pt-2.5 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)]/60 text-xs font-sans">
                    <button
                      type="button"
                      onClick={() => setAnalyticsTarget(item)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--code-bg)] text-[var(--accent-warm)] border border-[var(--border-subtle)] text-[11px] font-medium cursor-pointer hover:opacity-80"
                      title="View Traffic & Device Analytics"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{item.views || 0} {(item.views || 0) === 1 ? 'view' : 'views'}</span>
                    </button>

                    <div className="entry-card-actions-buttons flex items-center gap-1 flex-wrap">
                      <Link
                        to={`/admin/edit/${item.id}`}
                        state={{ entry: item }}
                        className="quiet-button py-1 px-2.5 text-xs flex items-center gap-1"
                        title="Edit Entry"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </Link>

                      <Link
                        to={`/entry/${item.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="quiet-button-secondary py-1 px-2 text-xs flex items-center justify-center"
                        title="View Public Entry"
                        aria-label="View Public Entry"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>

                      <button
                        type="button"
                        onClick={() => handleCopyLink(item)}
                        className="quiet-button-secondary py-1 px-2 text-xs flex items-center justify-center cursor-pointer"
                        title="Copy Shareable Link"
                        aria-label="Copy Shareable Link"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="quiet-button-secondary py-1 px-2 text-xs flex items-center justify-center text-red-500 hover:text-red-600 cursor-pointer"
                        title="Delete Entry"
                        aria-label="Delete Entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View (>= 640px) */}
            <div className="hidden sm:block table-responsive">
              <table className="w-full text-left border-collapse text-xs font-sans min-w-[640px]">
                <thead>
                  <tr className="bg-[var(--code-bg)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-wider">
                    <th className="py-3 px-4 font-normal whitespace-nowrap w-28">Date</th>
                    <th className="py-3 px-4 font-normal min-w-[200px]">Title / Content</th>
                    <th className="py-3 px-4 font-normal whitespace-nowrap w-24">Type</th>
                    <th className="py-3 px-4 font-normal whitespace-nowrap w-36">Status</th>
                    <th className="py-3 px-4 font-normal text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {paginatedEntries.map(item => (
                    <tr key={item.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-[var(--text-secondary)] font-mono">
                        {formatDate(item.date)}
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        <div className="font-serif text-base font-medium text-[var(--text-primary)] break-words whitespace-normal leading-snug">
                          {stripMarkdown(item.title || item.content)}
                        </div>
                        {item.excerpt && (
                          <div className="text-[var(--text-muted)] text-xs line-clamp-1">
                            {stripMarkdown(item.excerpt)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="uppercase text-[10px] font-medium px-2 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-secondary)] whitespace-nowrap inline-block">
                          {item.type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded border border-[var(--border-subtle)] whitespace-nowrap shrink-0 ${
                              item.status === 'draft'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                : 'bg-[var(--code-bg)] text-[var(--text-primary)]'
                            }`}
                          >
                            {item.status}
                          </span>
                          {Boolean(item.has_passcode || (item.passcode && item.passcode.trim() !== '')) && (
                            <span className="text-[10px] uppercase font-medium px-2 py-0.5 rounded bg-[var(--code-bg)] text-[var(--accent-warm)] border border-[var(--border-subtle)] whitespace-nowrap shrink-0" title="Passcode Protected for public readers">
                              Protected
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {/* inline-flex + no shrinking: the row is exactly as wide as its
                            buttons, so the table gives this column that much room (and
                            scrolls sideways when needed) instead of the buttons spilling
                            left over the Status badge at mid widths. */}
                        <div className="inline-flex items-center gap-1.5 whitespace-nowrap min-w-max [&>*]:shrink-0">
                          <button
                            type="button"
                            onClick={() => setAnalyticsTarget(item)}
                            className="quiet-button py-1 px-2.5 text-xs inline-flex items-center gap-1.5 text-[var(--accent-warm)] font-medium"
                            title="View Traffic & Device Analytics"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{item.views || 0}</span>
                          </button>

                          <Link
                            to={`/admin/edit/${item.id}`}
                            state={{ entry: item }}
                            className="quiet-button py-1 px-2.5 text-xs inline-flex items-center gap-1.5 font-medium"
                            title="Edit Entry"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </Link>

                          <Link
                            to={`/entry/${item.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="quiet-button py-1 px-2 text-xs inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            title="View Entry"
                            aria-label="View Entry"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>

                          <button
                            type="button"
                            onClick={() => handleCopyLink(item)}
                            className="quiet-button py-1 px-2 text-xs inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                            title={copiedId === item.id ? "Link copied to clipboard!" : "Copy Shareable Link"}
                            aria-label={copiedId === item.id ? "Link copied to clipboard!" : "Copy Shareable Link"}
                          >
                            {copiedId === item.id ? (
                              <span className="text-[10px] text-green-500 font-medium">Copied!</span>
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            className="quiet-button py-1 px-2 text-xs inline-flex items-center text-red-500 hover:text-red-600 hover:bg-red-500/10 cursor-pointer transition-colors"
                            title="Delete Entry"
                            aria-label="Delete Entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalEntriesCount > pageSize && (
              <div className="p-3.5 border-t border-[var(--border-subtle)] bg-[var(--code-bg)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-sans text-[var(--text-secondary)]">
                <div className="flex items-center gap-2">
                  <span>
                    Showing <span className="font-mono font-medium text-[var(--text-primary)]">{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalEntriesCount)}</span> of <span className="font-mono font-medium text-[var(--text-primary)]">{totalEntriesCount}</span> entries
                  </span>
                  <span className="text-[var(--text-muted)]">·</span>
                  <label htmlFor="dashboard-page-size" className="sr-only">Entries per page</label>
                  <select
                    id="dashboard-page-size"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="quiet-input text-[11px] py-0.5 px-1.5 font-mono cursor-pointer bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded"
                    title="Entries per page"
                  >
                    <option value={10}>10 / page</option>
                    <option value={20}>20 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="quiet-button-secondary text-xs px-2.5 py-1 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>

                  <span className="px-2 font-mono text-[11px] text-[var(--text-primary)]">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="quiet-button-secondary text-xs px-2.5 py-1 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    title="Next Page"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete Confirmation Modal using Portal */}
      {confirmDialog}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Deletion">
        <div className="flex flex-col space-y-4">
          <h3 className="text-lg font-serif font-medium text-[var(--text-primary)]">Confirm Deletion</h3>
          <p className="text-xs font-sans text-[var(--text-secondary)] leading-relaxed">
            Are you sure you want to permanently delete <strong className="text-[var(--text-primary)]">"{deleteTarget?.title || 'this entry'}"</strong>? This action cannot be undone.
          </p>
          <div className="flex justify-end space-x-3 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="quiet-button-secondary text-xs cursor-pointer select-none"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
              className="quiet-button text-xs bg-[var(--text-primary)] text-[var(--bg-main)] cursor-pointer select-none"
            >
              Delete Entry
            </button>
          </div>
        </div>
      </Modal>

      {/* Analytics Modal */}
      <Modal isOpen={!!analyticsTarget} onClose={() => setAnalyticsTarget(null)} title="Post Analytics">
        <div className="flex flex-col space-y-6">
          <div>
            <h3 className="text-lg font-serif font-medium text-[var(--text-primary)] mb-1">
              {analyticsTarget?.title || 'Analytics'}
            </h3>
            <p className="text-xs font-sans text-[var(--text-muted)]">
              Real-time stats. Viewing this does not count as a page view.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="border border-[var(--border-subtle)] p-4 rounded bg-[var(--card-bg)] text-center flex flex-col items-center justify-center">
              <Eye className="w-5 h-5 text-[var(--accent-warm)] mb-2" />
              <div className="text-3xl font-serif font-medium text-[var(--text-primary)]">{analyticsTarget?.views || 0}</div>
              <div className="text-xs font-sans text-[var(--text-muted)] uppercase mt-1">Total Views</div>
            </div>
            
            <div className="border border-[var(--border-subtle)] p-4 rounded bg-[var(--card-bg)] text-center flex flex-col items-center justify-center">
              <MessageSquare className="w-5 h-5 text-[var(--text-secondary)] mb-2" />
              <div className="text-3xl font-serif font-medium text-[var(--text-primary)]">
                {comments.filter(c => c.post_id === analyticsTarget?.id).length}
              </div>
              <div className="text-xs font-sans text-[var(--text-muted)] uppercase mt-1">Comments</div>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setAnalyticsTarget(null)}
              className="quiet-button text-xs bg-[var(--text-primary)] text-[var(--bg-main)] cursor-pointer select-none"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
