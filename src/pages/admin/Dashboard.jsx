import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase, safeApiFetch } from '../../supabase';
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
  FolderArchive,
  Eye,
  TrendingUp
} from 'lucide-react';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Dashboard() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({ total: 0, published: 0, drafts: 0, updates: 0, mediaCount: 0, totalViews: 0, topPosts: [] });
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadData = async () => {
    setLoading(true);

    // 1. Fetch Posts
    const apiPosts = await safeApiFetch('/api/posts?status=all', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    let postsList = [];
    if (Array.isArray(apiPosts)) {
      postsList = apiPosts;
      setEntries(apiPosts);
    } else {
      try {
        const { data: supaPosts } = await supabase.from('entries').select('*').order('date', { ascending: false });
        postsList = supaPosts || [];
        setEntries(postsList);
      } catch {
        setEntries([]);
      }
    }

    // 2. Fetch Stats
    const apiStats = await safeApiFetch('/api/stats', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (apiStats && typeof apiStats === 'object' && !Array.isArray(apiStats)) {
      setStats(apiStats);
    } else {
      const published = postsList.filter(e => e.status !== 'draft').length;
      const drafts = postsList.filter(e => e.status === 'draft').length;
      const updates = postsList.filter(e => e.type === 'update').length;
      const totalViews = postsList.reduce((acc, curr) => acc + (curr.views || 0), 0);

      setStats({
        total: postsList.length,
        published,
        drafts,
        updates,
        mediaCount: 0,
        totalViews,
        topPosts: []
      });
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api/admin/entries/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error('Failed to delete entry');
      }

      setDeleteTarget(null);
      fetchEntries();
    } catch (err) {
      alert(err.message);
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
          <p className="text-xs font-sans text-[var(--text-secondary)] mt-1">
            Logged in as <span className="font-mono font-medium text-[var(--text-primary)]">{user?.username}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/" className="quiet-button-secondary text-xs flex items-center gap-1.5" target="_blank">
            <ExternalLink className="w-3.5 h-3.5" />
            <span>View Public Site</span>
          </Link>

          <button onClick={logout} className="quiet-button-secondary text-xs flex items-center gap-1.5">
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
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
      <div className="flex flex-wrap gap-3 mb-8">
        <Link to="/admin/new?type=journal" className="quiet-button text-xs flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          <span>New Journal Entry</span>
        </Link>

        <Link to="/admin/new?type=writing" className="quiet-button-secondary text-xs flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          <span>New Essay</span>
        </Link>

        <Link to="/admin/new?type=update" className="quiet-button-secondary text-xs flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Quick Update</span>
        </Link>

        <Link to="/admin/media" className="quiet-button-secondary text-xs flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Media Manager</span>
        </Link>

        <Link to="/admin/about" className="quiet-button-secondary text-xs flex items-center gap-1.5">
          <UserCheck className="w-3.5 h-3.5" />
          <span>Edit About Page</span>
        </Link>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center mb-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-sans">
          {[
            { id: 'all', label: 'All Entries' },
            { id: 'published', label: 'Published' },
            { id: 'draft', label: 'Drafts' },
            { id: 'journal', label: 'Journal' },
            { id: 'writing', label: 'Essays' },
            { id: 'update', label: 'Updates' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded transition-colors ${
                filter === f.id
                  ? 'bg-[var(--text-primary)] text-[var(--bg-main)] font-medium'
                  : 'bg-[var(--code-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
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
            placeholder="Search entries..."
            className="quiet-input pl-9 text-xs py-1.5"
          />
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-2.5" />
        </div>
      </div>

      {/* Entries List Container */}
      <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden bg-[var(--card-bg)]">
        {loading ? (
          <div className="p-8 text-center text-xs font-sans text-[var(--text-muted)] italic">
            Loading entries...
          </div>
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
                    <div className="flex items-center gap-1.5">
                      <span className="uppercase text-[10px] font-medium px-2 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                        {item.type}
                      </span>
                      <span
                        className="text-[10px] uppercase font-medium px-2 py-0.5 rounded bg-[var(--code-bg)] text-[var(--text-primary)] border border-[var(--border-subtle)]"
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
                        {item.excerpt}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-[var(--border-subtle)]/50 text-xs font-sans">
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/admin/edit/${item.id}`}
                        className="quiet-button-secondary py-1 px-3 text-xs flex items-center gap-1.5"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </Link>

                      <Link
                        to={`/entry/${item.slug}`}
                        target="_blank"
                        className="quiet-button-secondary py-1 px-3 text-xs flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </Link>
                    </div>

                    <button
                      onClick={() => setDeleteTarget(item)}
                      className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded hover:bg-black/10 transition-colors"
                      title="Delete Entry"
                      aria-label="Delete Entry"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View (>= 640px) */}
            <div className="hidden sm:block table-responsive">
              <table className="w-full text-left border-collapse text-xs font-sans">
                <thead>
                  <tr className="bg-[var(--code-bg)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-wider">
                    <th className="py-3 px-4 font-normal">Date</th>
                    <th className="py-3 px-4 font-normal">Title / Content</th>
                    <th className="py-3 px-4 font-normal">Type</th>
                    <th className="py-3 px-4 font-normal">Status</th>
                    <th className="py-3 px-4 font-normal text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredEntries.map(item => (
                    <tr key={item.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-[var(--text-secondary)] font-mono">
                        {formatDate(item.date)}
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        <div className="font-serif text-base font-medium text-[var(--text-primary)] truncate">
                          {item.title || item.content}
                        </div>
                        {item.excerpt && (
                          <div className="text-[var(--text-muted)] text-xs line-clamp-1">
                            {item.excerpt}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="uppercase text-[10px] font-medium px-2 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                          {item.type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="text-[10px] uppercase font-medium px-2 py-0.5 rounded bg-[var(--code-bg)] text-[var(--text-primary)] border border-[var(--border-subtle)]"
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
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
              onClick={() => setDeleteTarget(null)}
              className="quiet-button-secondary text-xs"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
              className="quiet-button text-xs bg-[var(--text-primary)] text-[var(--bg-main)]"
            >
              Delete Entry
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
