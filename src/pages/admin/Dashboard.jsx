import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase, safeApiFetch, invalidateFeedCache } from '../../supabase';
import { publishRealtimeUpdate } from '../../utils/realtime';
import Modal from '../../components/Modal';
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
  BarChart2
} from 'lucide-react';

import { stripMarkdown } from '../../utils/excerpt';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getPersistedCache() {
  try {
    const raw = localStorage.getItem('cached_admin_dashboard_v2');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { entries: null, stats: null, comments: null };
}

function setPersistedCache(data) {
  try {
    localStorage.setItem('cached_admin_dashboard_v2', JSON.stringify(data));
  } catch {}
}

export default function Dashboard() {
  const { user, token, logout } = useAuth();

  const [cachedData] = useState(() => getPersistedCache());

  const [stats, setStats] = useState(() => cachedData.stats || { total: 0, published: 0, drafts: 0, updates: 0, mediaCount: 0, totalViews: 0, topPosts: [] });
  const [entries, setEntries] = useState(() => cachedData.entries || []);
  const [comments, setComments] = useState(() => cachedData.comments || []);
  const [loading, setLoading] = useState(() => !cachedData.entries);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [showOnHome, setShowOnHome] = useState(false);
  const [analyticsTarget, setAnalyticsTarget] = useState(null);

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

    // 1. Fetch Posts
    let postsList = [];
    try {
      const apiPosts = await safeApiFetch('/api/posts?status=all', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (Array.isArray(apiPosts)) {
        postsList = apiPosts;
      }
    } catch {}

    if (postsList.length === 0) {
      try {
        const { data: supaPosts } = await supabase.from('entries').select('*').order('date', { ascending: false });
        postsList = supaPosts || [];
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

    setEntries(processedPosts);

    // 2. Fetch Stats
    let currentStats = null;
    try {
      const apiStats = await safeApiFetch('/api/stats', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (apiStats && typeof apiStats === 'object' && !Array.isArray(apiStats)) {
        currentStats = apiStats;
      }
    } catch {}

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
    setStats(currentStats);

    // 3. Fetch Reader Comments for Admin Moderation
    let fetchedComments = commentsRef.current;
    try {
      const { data: supaComments } = await supabase
        .from('comments')
        .select('*, entries(title, slug)')
        .order('created_at', { ascending: false });
      if (supaComments) {
        fetchedComments = supaComments;
        setComments(supaComments);
      }
    } catch {}

    // 4. Fetch Now Playing Settings
    try {
      const npData = await safeApiFetch(`/api/now-playing?t=${Date.now()}`);
      if (npData && npData.showOnHome !== undefined) {
        setShowOnHome(npData.showOnHome);
      }
    } catch {}

    setPersistedCache({
      entries: postsList,
      stats: currentStats,
      comments: fetchedComments
    });

    setLoading(false);
    setRefreshing(false);

    if (isManual) {
      setStatusMessage('Refreshed just now');
      setTimeout(() => setStatusMessage(null), 3000);
    }
  }, [token]);

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
      alert('Failed to delete entry.');
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Permanently delete this reader comment?')) return;
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
      alert('Failed deleting comment.');
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
      }
    } catch {
      // Revert if fetch throws
      setShowOnHome(!newValue);
    }
  };

  // Filtering Logic
  const filteredEntries = entries.filter(item => {
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
            {statusMessage && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--code-bg)] text-[var(--accent-warm)] font-medium border border-[var(--border-subtle)] whitespace-nowrap">
                {statusMessage}
              </span>
            )}
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

      {/* Metrics Row - Using vanilla CSS responsive-card-grid */}
      <div className="responsive-card-grid mb-8">
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

      {/* Action Bar */}
      <div className="admin-quick-actions-container">
        <Link to="/admin/new?type=journal" className="quiet-button admin-quick-action text-xs flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          <span>New Journal Entry</span>
        </Link>

        <Link to="/admin/new?type=photo" className="quiet-button admin-quick-action text-xs flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-[var(--accent-warm)]" />
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
          className="quiet-button-secondary admin-quick-action text-xs flex items-center justify-center gap-2 border border-[var(--border-subtle)] bg-[var(--card-bg)] rounded px-3 py-2 cursor-pointer hover:opacity-80"
          title="Toggle music card on homepage"
        >
          <div className={`w-2 h-2 rounded-full shrink-0 ${showOnHome ? 'bg-[var(--accent-warm)] animate-pulse' : 'bg-gray-400 dark:bg-gray-600'}`} />
          <span>Show on Home: {showOnHome ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center mb-6">
        <div className="admin-filter-tabs">
          {[
            { id: 'all', label: 'All Entries' },
            { id: 'published', label: 'Published' },
            { id: 'draft', label: 'Drafts' },
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

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entries or comments..."
            className="quiet-input pl-10 text-xs py-1.5"
          />
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-2.5 pointer-events-none" />
        </div>
      </div>

      {/* Entries & Comments Container */}
      <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden bg-[var(--card-bg)]">
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
                .filter(c => !search.trim() || c.author_name.toLowerCase().includes(search.toLowerCase()) || c.content.toLowerCase().includes(search.toLowerCase()))
                .map(item => (
                  <div key={item.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs font-sans">
                    <div className="space-y-1 max-w-2xl">
                      <div className="flex items-center gap-2 text-[var(--text-muted)]">
                        <span className="font-medium text-[var(--text-primary)]">{item.author_name}</span>
                        <span>·</span>
                        <span>{formatDate(item.created_at)}</span>
                        {item.entries?.slug && (
                          <>
                            <span>·</span>
                            <Link to={`/entry/${item.entries.slug}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-[var(--accent-warm)]">
                              {item.entries.title || 'View Post'}
                            </Link>
                          </>
                        )}
                      </div>
                      <p className="font-serif text-sm text-[var(--text-primary)] leading-relaxed">
                        {item.content}
                      </p>
                    </div>

                    <button
                      onClick={() => handleDeleteComment(item.id)}
                      disabled={deletingCommentId === item.id}
                      className="quiet-button-secondary text-xs text-red-500 hover:text-red-600 flex items-center gap-1.5 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{deletingCommentId === item.id ? 'Deleting...' : 'Delete Comment'}</span>
                    </button>
                  </div>
                ))}
            </div>
          )
        ) : filteredEntries.length === 0 ? (
          <div className="p-8 text-center text-xs font-sans text-[var(--text-muted)]">
            No entries found.
          </div>
        ) : (
          <>
            {/* Mobile Card List View (< 640px) */}
            <div className="block sm:hidden divide-y divide-[var(--border-subtle)]">
              {filteredEntries.map(item => (
                <div key={item.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs font-sans">
                    <span className="text-[var(--text-muted)] font-mono">
                      {formatDate(item.date)}
                    </span>
                    <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
                      {Boolean(item.has_passcode || (item.passcode && item.passcode.trim() !== '')) && (
                        <span className="text-[10px] uppercase font-medium px-2 py-0.5 rounded bg-[var(--code-bg)] text-[var(--accent-warm)] border border-[var(--border-subtle)] whitespace-nowrap shrink-0" title="Passcode Protected for public readers">
                          Protected
                        </span>
                      )}
                      <span className="uppercase text-[10px] font-medium px-2 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-secondary)] whitespace-nowrap shrink-0">
                        {item.type}
                      </span>
                      <span
                        className="text-[10px] uppercase font-medium px-2 py-0.5 rounded bg-[var(--code-bg)] text-[var(--text-primary)] border border-[var(--border-subtle)] whitespace-nowrap shrink-0"
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-serif text-base font-medium text-[var(--text-primary)] line-clamp-2">
                      {item.title || item.content}
                    </h3>
                    {item.excerpt && (
                      <p className="text-[var(--text-muted)] text-xs line-clamp-2 mt-1 font-serif">
                        {stripMarkdown(item.excerpt)}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 mt-2 grid grid-cols-4 gap-2 border-t border-[var(--border-subtle)]/50">
                      <button
                        onClick={() => setAnalyticsTarget(item)}
                        className="quiet-button-secondary py-1.5 px-1 text-xs flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer overflow-hidden"
                      >
                        <BarChart2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Stats</span>
                      </button>

                      <Link
                        to={`/admin/edit/${item.id}`}
                        className="quiet-button-secondary py-1.5 px-1 text-xs flex items-center justify-center gap-1 sm:gap-1.5 overflow-hidden"
                      >
                        <Edit className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Edit</span>
                      </Link>

                      <Link
                        to={`/entry/${item.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="quiet-button-secondary py-1.5 px-1 text-xs flex items-center justify-center gap-1 sm:gap-1.5 overflow-hidden"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Preview</span>
                      </Link>
                      
                      <button
                        onClick={() => setDeleteTarget(item)}
                        className="quiet-button-secondary py-1.5 px-1 text-xs flex items-center justify-center text-red-500 hover:text-red-600 overflow-hidden"
                        title="Delete Entry"
                        aria-label="Delete Entry"
                      >
                        <Trash2 className="w-4 h-4 shrink-0" />
                      </button>
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
                    <th className="py-3 px-4 font-normal text-right whitespace-nowrap w-32">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredEntries.map(item => (
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
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 flex-nowrap whitespace-nowrap">
                          <span
                            className="text-[10px] uppercase font-medium px-2 py-0.5 rounded bg-[var(--code-bg)] text-[var(--text-primary)] border border-[var(--border-subtle)] whitespace-nowrap shrink-0"
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
                      <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => setAnalyticsTarget(item)}
                          className="p-1.5 inline-block text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                          title="View Analytics"
                        >
                          <BarChart2 className="w-3.5 h-3.5" />
                        </button>

                        <Link
                          to={`/admin/edit/${item.id}`}
                          className="p-1.5 inline-block text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          title="Edit"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Link>

                        <Link
                          to={`/entry/${item.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 inline-block text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          title="Preview"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>

                        <button
                          onClick={() => setDeleteTarget(item)}
                          className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Modal using Portal */}
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
