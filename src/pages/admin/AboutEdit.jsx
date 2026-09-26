/* global CustomEvent */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTypewriter } from '../../context/TypewriterContext';
import ThemeToggle from '../../components/ThemeToggle';
import { Save, ArrowLeft, Plus, Trash2 } from 'lucide-react';

export default function AboutEdit() {
  const { token } = useAuth();
  const { updateSiteDefault } = useTypewriter();

  const [formData, setFormData] = useState({
    author_name: '',
    tagline: '',
    bio: '',
    default_typewriter_enabled: false,
    projects: [],
    links: []
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/about')
      .then(res => res.json())
      .then(data => {
        const defaultEnabled = Boolean(data.default_typewriter_enabled);
        setFormData({
          author_name: data.author_name || 'q04ti',
          tagline: data.tagline || '',
          bio: data.bio || '',
          default_typewriter_enabled: defaultEnabled,
          projects: Array.isArray(data.projects) ? data.projects : [],
          links: Array.isArray(data.links) ? data.links : []
        });
      })
      .catch(_err => setError('Failed loading settings.'))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleProjectChange = (idx, field, val) => {
    const updated = [...formData.projects];
    updated[idx][field] = val;
    setFormData(prev => ({ ...prev, projects: updated }));
  };

  const addProject = () => {
    setFormData(prev => ({
      ...prev,
      projects: [...prev.projects, { title: '', description: '', link: '' }]
    }));
  };

  const removeProject = (idx) => {
    setFormData(prev => ({
      ...prev,
      projects: prev.projects.filter((_, i) => i !== idx)
    }));
  };

  const handleLinkChange = (idx, field, val) => {
    const updated = [...formData.links];
    updated[idx][field] = val;
    setFormData(prev => ({ ...prev, links: updated }));
  };

  const addLink = () => {
    setFormData(prev => ({
      ...prev,
      links: [...prev.links, { label: '', url: '' }]
    }));
  };

  const removeLink = (idx) => {
    setFormData(prev => ({
      ...prev,
      links: prev.links.filter((_, i) => i !== idx)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/about', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed saving about info.');
      }

      updateSiteDefault(formData.default_typewriter_enabled);
      // Bust the About page localStorage cache so public site reflects changes immediately
      try {
        localStorage.removeItem('cached_about_data');
        window.dispatchEvent(new CustomEvent('about-data-updated'));
      } catch {}
      setMessage('About page and site settings updated successfully!');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="notebook-container py-16 text-center text-sm font-sans text-[var(--text-muted)] italic">
        Loading about settings...
      </div>
    );
  }

  return (
    <div className="notebook-container pb-24">
      <div className="flex justify-between items-center py-4 border-b border-[var(--border-subtle)] mb-8">
        <div className="flex items-center space-x-3">
          <Link
            to="/admin"
            className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-serif font-medium">Edit About Page</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-1 border border-[var(--border-subtle)] rounded bg-[var(--card-bg)] flex items-center justify-center">
            <ThemeToggle />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="quiet-button text-xs flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-6 p-3 bg-[var(--code-bg)] text-[var(--text-primary)] text-xs font-sans rounded border border-[var(--border-subtle)]">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 bg-[var(--code-bg)] text-[var(--text-primary)] text-xs font-sans rounded border border-[var(--border-subtle)]">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Author Name */}
        <div>
          <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1">
            Author / Site Owner Name
          </label>
          <input
            type="text"
            name="author_name"
            value={formData.author_name}
            onChange={handleChange}
            className="quiet-input text-base font-serif"
            required
          />
        </div>

        {/* Tagline */}
        <div>
          <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1">
            Header Subtitle Tagline
          </label>
          <input
            type="text"
            name="tagline"
            value={formData.tagline}
            onChange={handleChange}
            placeholder="thoughts, things I make, places I go..."
            className="quiet-input text-sm italic font-serif"
          />
        </div>

        {/* Site Default Typewriter Setting */}
        <div className="p-4 rounded border border-[var(--border-subtle)] bg-[var(--card-bg)] flex justify-between items-center">
          <div>
            <div className="text-xs font-sans uppercase font-medium text-[var(--text-primary)]">
              Site Default Typewriter Effect
            </div>
            <div className="text-xs font-sans text-[var(--text-muted)] mt-0.5">
              Default state for new visitors who have not set a custom preference.
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const nextVal = !formData.default_typewriter_enabled;
              setFormData(prev => ({ ...prev, default_typewriter_enabled: nextVal }));
              updateSiteDefault(nextVal);
            }}
            className={`px-3 py-1.5 rounded text-xs font-sans font-medium transition-colors border cursor-pointer ${
              formData.default_typewriter_enabled
                ? 'bg-[var(--text-primary)] text-[var(--bg-main)] border-[var(--text-primary)]'
                : 'bg-[var(--code-bg)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
            }`}
          >
            {formData.default_typewriter_enabled ? 'ON by Default' : 'OFF by Default'}
          </button>
        </div>

        {/* Bio */}
        <div>
          <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1">
            Bio Text (Markdown & Rich Text supported)
          </label>
          <textarea
            name="bio"
            rows={8}
            value={formData.bio}
            onChange={handleChange}
            placeholder="Write your short introduction here..."
            className="quiet-input font-serif text-lg p-4"
          />
        </div>

        {/* Projects Section */}
        <div className="pt-6 border-t border-[var(--border-subtle)]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-sans uppercase tracking-widest text-[var(--text-muted)] font-medium">
              Projects List
            </h2>
            <button
              type="button"
              onClick={addProject}
              className="quiet-button-secondary text-xs flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Project</span>
            </button>
          </div>

          <div className="space-y-4">
            {formData.projects.map((proj, idx) => (
              <div key={idx} className="border border-[var(--border-subtle)] p-4 rounded bg-[var(--card-bg)] space-y-3 relative group">
                <button
                  type="button"
                  onClick={() => removeProject(idx)}
                  className="absolute top-3 right-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1"
                  title="Remove project"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <div className="responsive-form-grid">
                  <div>
                    <label className="block text-[11px] font-sans text-[var(--text-muted)] uppercase mb-1">
                      Project Title
                    </label>
                    <input
                      type="text"
                      value={proj.title}
                      onChange={(e) => handleProjectChange(idx, 'title', e.target.value)}
                      className="quiet-input text-xs"
                      placeholder="My Cool App"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-sans text-[var(--text-muted)] uppercase mb-1">
                      Project Link / URL
                    </label>
                    <input
                      type="text"
                      value={proj.link}
                      onChange={(e) => handleProjectChange(idx, 'link', e.target.value)}
                      className="quiet-input text-xs font-mono"
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-sans text-[var(--text-muted)] uppercase mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={proj.description}
                    onChange={(e) => handleProjectChange(idx, 'description', e.target.value)}
                    className="quiet-input text-xs"
                    placeholder="Short summary of project..."
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Links Section */}
        <div className="pt-6 border-t border-[var(--border-subtle)]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-sans uppercase tracking-widest text-[var(--text-muted)] font-medium">
              Links & Social Contacts
            </h2>
            <button
              type="button"
              onClick={addLink}
              className="quiet-button-secondary text-xs flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Link</span>
            </button>
          </div>

          <div className="space-y-3">
            {formData.links.map((link, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center">
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) => handleLinkChange(idx, 'label', e.target.value)}
                  placeholder="Label (e.g. GitHub)"
                  className="quiet-input text-xs w-full sm:w-1/3"
                />
                <input
                  type="text"
                  value={link.url}
                  onChange={(e) => handleLinkChange(idx, 'url', e.target.value)}
                  placeholder="URL (e.g. https://github.com/...)"
                  className="quiet-input text-xs font-mono w-full sm:w-2/3"
                />
                <button
                  type="button"
                  onClick={() => removeLink(idx)}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}
