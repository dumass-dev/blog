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

    // 1. Fetch Posts (API first, then Supabase fallback)
    const apiPosts = await safeApiFetch('/api/posts?status=all', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (Array.isArray(apiPosts)) {
      setEntries(apiPosts);
    } else {
      try {
        const { data: supaPosts } = await supabase.from('entries').select('*').order('date', { ascending: false });
        setEntries(supaPosts || []);
      } catch {
        setEntries([]);
      }
    }

    // 2. Fetch Stats (API first, then calculate from Supabase fallback)
    const apiStats = await safeApiFetch('/api/stats', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (apiStats && typeof apiStats === 'object' && !Array.isArray(apiStats)) {
      setStats(apiStats);
    } else {
      try {
        const { data: allPosts } = await supabase.from('entries').select('id, type, status, views');
        const { count: mediaCount } = await supabase.from('media').select('*', { count: 'exact', head: true });

        const postsList = allPosts || [];
        setStats({
          total: postsList.length,
          published: postsList.filter(p => p.status === 'published').length,
          drafts: postsList.filter(p => p.status === 'draft').length,
          updates: postsList.filter(p => p.type === 'update').length,
          mediaCount: mediaCount || 0,
          totalViews: postsList.reduce((acc, p) => acc + (p.views || 0), 0)
        });
      } catch {
        setStats({ total: 0, published: 0, drafts: 0, updates: 0, mediaCount: 0, totalViews: 0 });
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        // Direct Supabase fallback deletion
        await supabase.from('entries').delete().eq('id', id);
      }
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      try {
        await supabase.from('entries').delete().eq('id', id);
      } catch {}
      setDeleteTarget(null);
      loadData();
    }
  };

  const filteredEntries = entries.filter(e => {
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    if (filterType !== 'all' && e.type !== filterType) return false;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return (
        e.title.toLowerCase().includes(query) ||
        e.content.toLowerCase().includes(query) ||
        (e.tags && e.tags.toLowerCase().includes(query))
      );
    }
    return true;
  });

  return (
    <div className="wide-container pb-20">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-6 border-b border-[var(--border-subtle)] mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-serif font-medium flex items-center gap-2">
            <span>Author Studio</span>
            <span className="text-xs font-sans px-2 py-0.5 rounded bg-[var(--code-bg)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
              Admin
            </span>
          </h1>
          <p className="text-xs font-sans text-[var(--text-muted)] mt-0.5">
            Manage your personal diary, blog, micro updates, media & settings.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link to="/" className="quiet-button-secondary text-xs flex items-center gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" />
            <span>View Public Site</span>
          </Link>

          <button onClick={logout} className="quiet-button-secondary text-xs flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 mb-8">
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

        <div className="border border-[var(--border-subtle)] p-4 rounded bg-[var(--card-bg)] col-span-2 sm:col-span-1">
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
          <span className="text-[var(--text-muted)] mr-1">Status:</span>
          {['all', 'published', 'draft', 'unlisted'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-2.5 py-1 rounded capitalize border transition-all cursor-pointer ${
                filterStatus === status
                  ? 'font-medium shadow-xs'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] bg-[var(--card-bg)]'
              }`}
              style={
                filterStatus === status
                  ? { backgroundColor: 'var(--text-primary)', color: 'var(--bg-main)', borderColor: 'var(--text-primary)' }
                  : {}
              }
            >
              {status}
            </button>
          ))}

          <span className="text-[var(--text-muted)] ml-3 mr-1">Type:</span>
          {['all', 'journal', 'writing', 'update'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-2.5 py-1 rounded capitalize border transition-all cursor-pointer ${
                filterType === type
                  ? 'font-medium shadow-xs'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] bg-[var(--card-bg)]'
              }`}
              style={
                filterType === type
                  ? { backgroundColor: 'var(--text-primary)', color: 'var(--bg-main)', borderColor: 'var(--text-primary)' }
                  : {}
              }
            >
              {type}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entries..."
            className="quiet-input pl-8 py-1 text-xs"
          />
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2" />
        </div>
      </div>

      {/* Entries List Container */}
      <div className="border border-[var(--border-subtle)] rounded overflow-hidden bg-[var(--card-bg)]">
        {loading ? (
          <div className="p-8 text-center text-xs font-sans text-[var(--text-muted)] italic">
            Loading database entries...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-8 text-center text-xs font-sans text-[var(--text-muted)]">
            No entries found matching filters.
          </div>
        ) : (
          <>
            {/* Mobile Card List View (< 640px) */}
            <div className="block sm:hidden divide-y divide-[var(--border-subtle)]">
              {filteredEntries.map(item => (
                <div key={item.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs font-sans">
                    <span className="text-[var(--text-secondary)] font-mono">
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

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-serif font-medium mb-2 text-[var(--text-primary)]">Confirm Deletion</h3>
            <p className="text-xs font-sans text-[var(--text-secondary)] mb-6 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-[var(--text-primary)]">"{deleteTarget.title || 'this entry'}"</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="quiet-button-secondary text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget.id)}
                className="quiet-button text-xs bg-[var(--text-primary)] text-[var(--bg-main)]"
              >
                Delete Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
