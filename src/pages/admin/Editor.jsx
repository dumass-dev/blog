import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabase';
import RichViewer from '../../components/RichViewer';
import MediaPicker from '../../components/MediaPicker';
import {
  Save,
  ArrowLeft,
  Eye,
  Edit3,
  Heading1,
  Heading2,
  Bold,
  Italic,
  Quote,
  Code,
  Link as LinkIcon,
  Image as ImageIcon,
  Video,
  Minus,
  Mic,
  MicOff,
  MapPin,
  Cloud,
  Smile,
  Lock
} from 'lucide-react';

export default function Editor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || 'journal';

  const { token } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    content: '',
    type: initialType,
    status: 'published',
    category: '',
    tags: '',
    cover_image: '',
    excerpt: '',
    location: '',
    weather: '',
    mood: '',
    passcode: '',
    date: new Date().toISOString().slice(0, 16) // YYYY-MM-THH:mm
  });

  const [mode, setMode] = useState('edit'); // 'edit' | 'preview'
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = React.useRef(null);

  // Speech Recognition Setup
  const toggleDictation = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice dictation is not supported by your browser.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onerror = (e) => {
        setError('Voice recording error: ' + e.error);
        setIsListening(false);
      };
      recognition.onend = () => setIsListening(false);

      recognition.onresult = (e) => {
        let transcript = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          transcript += e.results[i][0].transcript;
        }
        if (transcript) {
          setFormData(prev => ({
            ...prev,
            content: prev.content ? prev.content + ' ' + transcript : transcript
          }));
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      setError('Could not start microphone: ' + err.message);
    }
  };

  // Fetch existing entry if editing
  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    setLoading(true);

    fetch(`/api/posts/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (isMounted && data.entry) {
          const e = data.entry;
          let formattedDate = e.date;
          try {
            formattedDate = new Date(e.date).toISOString().slice(0, 16);
          } catch {}

          setFormData({
            title: e.title || '',
            slug: e.slug || '',
            content: e.content || '',
            type: e.type || 'journal',
            status: e.status || 'published',
            category: e.category || '',
            tags: e.tags || '',
            cover_image: e.cover_image || '',
            excerpt: e.excerpt || '',
            location: e.location || '',
            weather: e.weather || '',
            mood: e.mood || '',
            passcode: e.passcode || '',
            date: formattedDate
          });
        }
      })
      .catch(err => {
        if (isMounted) setError('Failed loading entry.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id, token]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Insert markdown snippet into content
  const insertFormatting = (prefix, suffix = '') => {
    const textarea = document.getElementById('content-textarea');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    const selectedText = text.substring(start, end) || 'text';
    const replacement = prefix + selectedText + suffix;

    const newText = text.substring(0, start) + replacement + text.substring(end);
    setFormData(prev => ({ ...prev, content: newText }));

    // Reset cursor after update
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 50);
  };

  const handleSelectMedia = (media) => {
    if (media.mime_type.startsWith('video/')) {
      const videoTag = `\n${media.url}\n`;
      setFormData(prev => ({ ...prev, content: prev.content + videoTag }));
    } else {
      const imageMd = `\n![${media.original_name}](${media.url})\n`;
      setFormData(prev => ({ ...prev, content: prev.content + imageMd }));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.title && formData.type !== 'update') {
      setError('Title is required for Journal and Writing entries.');
      return;
    }
    if (!formData.content) {
      setError('Content is required.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const payload = {
      ...formData,
      title: formData.title || (formData.content.length > 30 ? formData.content.slice(0, 30) + '...' : 'Update'),
      date: new Date(formData.date).toISOString()
    };

    const url = id ? `/api/posts/${id}` : '/api/posts';
    const method = id ? 'PUT' : 'POST';

    let savedData = null;

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        savedData = await res.json();
      }
    } catch {
      // API request failed, fallback to Supabase directly
    }

    if (!savedData) {
      try {
        const finalTitle = payload.title || (payload.content.length > 30 ? payload.content.slice(0, 30) + '...' : 'Update');
        const finalSlug = payload.slug || finalTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

        const supaPayload = {
          title: finalTitle,
          slug: finalSlug,
          content: payload.content,
          type: payload.type || 'journal',
          status: payload.status || 'published',
          category: payload.category || 'General',
          tags: payload.tags || '',
          cover_image: payload.cover_image || '',
          excerpt: payload.excerpt || payload.content.substring(0, 150),
          date: payload.date || new Date().toISOString(),
          location: payload.location || null,
          weather: payload.weather || null,
          mood: payload.mood || null,
          passcode: payload.passcode || null
        };

        if (id) {
          const { data: supaUpdated, error: supaErr } = await supabase
            .from('entries')
            .update(supaPayload)
            .eq('id', id)
            .select('*')
            .single();
          if (supaErr) throw supaErr;
          savedData = supaUpdated;
        } else {
          const { data: supaInserted, error: supaErr } = await supabase
            .from('entries')
            .insert([supaPayload])
            .select('*')
            .single();
          if (supaErr) throw supaErr;
          savedData = supaInserted;
        }
      } catch (err) {
        setError(err.message || 'Failed saving entry.');
        setSaving(false);
        return;
      }
    }

    setMessage(id ? 'Entry updated successfully.' : 'Entry created successfully.');

    if (!id && savedData && savedData.id) {
      setTimeout(() => {
        navigate(`/admin/edit/${savedData.id}`);
      }, 600);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="notebook-container py-16 text-center text-sm font-sans text-[var(--text-muted)] italic">
        Loading editor...
      </div>
    );
  }

  return (
    <div className="wide-container pb-24">
      {/* Media Picker Modal */}
      <MediaPicker
        isOpen={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        onSelectMedia={handleSelectMedia}
      />

      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 border-b border-[var(--border-subtle)] mb-8 gap-4">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-serif font-medium">
            {id ? 'Edit Entry' : 'New Entry'}
          </h1>
        </div>

        <div className="flex items-center space-x-3">
          {/* Edit / Preview Toggle */}
          <div className="flex border border-[var(--border-subtle)] rounded p-0.5 text-xs font-sans bg-[var(--card-bg)]">
            <button
              type="button"
              onClick={() => setMode('edit')}
              className={`px-3 py-1 rounded flex items-center gap-1.5 transition-all cursor-pointer ${
                mode === 'edit'
                  ? 'font-medium shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              style={
                mode === 'edit'
                  ? { backgroundColor: 'var(--text-primary)', color: 'var(--bg-main)' }
                  : {}
              }
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={`px-3 py-1 rounded flex items-center gap-1.5 transition-all cursor-pointer ${
                mode === 'preview'
                  ? 'font-medium shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              style={
                mode === 'preview'
                  ? { backgroundColor: 'var(--text-primary)', color: 'var(--bg-main)' }
                  : {}
              }
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="quiet-button text-xs flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Post'}</span>
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

      {mode === 'preview' ? (
        /* Reading Preview Mode */
        <div className="notebook-container py-6 sm:py-8 border border-[var(--border-subtle)] rounded p-4 sm:p-8 bg-[var(--card-bg)]">
          <div className="text-xs font-sans text-[var(--text-muted)] uppercase mb-2">
            Visual Reading Preview
          </div>
          <h1 className="text-3xl font-serif font-medium mb-4">{formData.title || 'Untitled'}</h1>
          {formData.cover_image && (
            <img src={formData.cover_image} alt="" className="w-full h-auto rounded mb-6 max-h-[400px] object-cover" />
          )}
          <RichViewer content={formData.content} />
        </div>
      ) : (
        /* Edit Mode */
        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Title */}
            <div>
              <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1">
                Title {formData.type === 'update' && '(Optional for Updates)'}
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder={formData.type === 'update' ? 'Short title (optional)' : 'Entry Title...'}
                className="quiet-input text-xl font-serif py-2 font-medium"
              />
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-1 p-2 bg-[var(--code-bg)] border border-[var(--border-subtle)] rounded text-xs font-sans overflow-x-touch flex-nowrap shrink-0">
              <button
                type="button"
                onClick={() => insertFormatting('## ')}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                title="Heading 2"
              >
                <Heading1 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('### ')}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                title="Heading 3"
              >
                <Heading2 className="w-4 h-4" />
              </button>

              <span className="h-4 w-[1px] bg-[var(--border-subtle)] mx-1" />

              <button
                type="button"
                onClick={() => insertFormatting('**', '**')}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                title="Bold"
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('*', '*')}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                title="Italic"
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('> ')}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                title="Blockquote"
              >
                <Quote className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('```javascript\n', '\n```')}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                title="Code Block"
              >
                <Code className="w-4 h-4" />
              </button>

              <span className="h-4 w-[1px] bg-[var(--border-subtle)] mx-1" />

              <button
                type="button"
                onClick={() => insertFormatting('[', '](https://example.com)')}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                title="Link"
              >
                <LinkIcon className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setShowMediaPicker(true)}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded text-[var(--accent-warm)] font-medium flex items-center gap-1"
                title="Insert Photo/Video"
              >
                <ImageIcon className="w-4 h-4" />
                <span className="text-[11px]">Add Media</span>
              </button>

              <button
                type="button"
                onClick={() => insertFormatting('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                title="Embed YouTube Video"
              >
                <Video className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => insertFormatting('\n---\n')}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                title="Horizontal Rule"
              >
                <Minus className="w-4 h-4" />
              </button>

              <span className="h-4 w-[1px] bg-[var(--border-subtle)] mx-1" />

              {/* Voice Dictation Button */}
              <button
                type="button"
                onClick={toggleDictation}
                className={`p-1.5 rounded flex items-center gap-1 font-medium transition-colors cursor-pointer ${
                  isListening
                    ? 'bg-[var(--text-primary)] text-[var(--bg-main)] animate-pulse'
                    : 'hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-primary)]'
                }`}
                title={isListening ? "Stop Voice Dictation" : "Start Speech-to-Text Voice Dictation"}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span className="text-[11px]">{isListening ? 'Recording Voice...' : 'Voice Dictate'}</span>
              </button>
            </div>

            {/* Content Body */}
            <div>
              <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1">
                Body Content (Markdown & Rich Text)
              </label>
              <textarea
                id="content-textarea"
                name="content"
                rows={16}
                value={formData.content}
                onChange={handleChange}
                placeholder="Write your story, diary entry, or update here..."
                className="quiet-input font-serif text-lg leading-relaxed p-4"
              />
            </div>
          </div>

          {/* Sidebar Settings */}
          <div className="space-y-6 border border-[var(--border-subtle)] p-6 rounded bg-[var(--card-bg)] h-fit">
            <h2 className="text-xs font-sans uppercase tracking-widest text-[var(--text-muted)] font-medium border-b border-[var(--border-subtle)] pb-3">
              Entry Metadata
            </h2>

            {/* Type */}
            <div>
              <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1">
                Entry Type
              </label>
              <select
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="quiet-input text-xs"
              >
                <option value="journal">Journal (Personal Diary)</option>
                <option value="writing">Writing (Blog / Essay)</option>
                <option value="update">Update (Micro stream)</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1">
                Publishing Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="quiet-input text-xs"
              >
                <option value="published">Published (Publicly visible)</option>
                <option value="draft">Draft (Private admin only)</option>
                <option value="unlisted">Unlisted (Visible only via direct link)</option>
              </select>
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-[var(--accent-warm)]" />
                <span>Location</span>
              </label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                placeholder="e.g. Edinburgh, Scotland"
                className="quiet-input text-xs"
              />
            </div>

            {/* Weather */}
            <div>
              <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1 flex items-center gap-1">
                <Cloud className="w-3 h-3 text-[var(--accent-warm)]" />
                <span>Weather</span>
              </label>
              <input
                type="text"
                name="weather"
                value={formData.weather}
                onChange={handleChange}
                placeholder="e.g. Rainy 14°C"
                className="quiet-input text-xs"
              />
            </div>

            {/* Mood */}
            <div>
              <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1 flex items-center gap-1">
                <Smile className="w-3 h-3 text-[var(--accent-warm)]" />
                <span>Mood</span>
              </label>
              <input
                type="text"
                name="mood"
                value={formData.mood}
                onChange={handleChange}
                placeholder="e.g. Quiet, Reflective, Inspired"
                className="quiet-input text-xs"
              />
            </div>

            {/* Passcode Protection */}
            <div>
              <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1 flex items-center gap-1">
                <Lock className="w-3 h-3 text-[var(--accent-warm)]" />
                <span>Passcode Lock (Optional)</span>
              </label>
              <input
                type="password"
                name="passcode"
                value={formData.passcode}
                onChange={handleChange}
                placeholder="Leave blank for public"
                className="quiet-input text-xs font-mono"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1">
                Entry Date
              </label>
              <input
                type="datetime-local"
                name="date"
                value={formData.date}
                onChange={handleChange}
                className="quiet-input text-xs"
              />
            </div>

            {/* Slug */}
            <div>
              <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1">
                URL Slug
              </label>
              <input
                type="text"
                name="slug"
                value={formData.slug}
                onChange={handleChange}
                placeholder="auto-generated-if-empty"
                className="quiet-input text-xs font-mono"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1">
                Category
              </label>
              <input
                type="text"
                name="category"
                value={formData.category}
                onChange={handleChange}
                placeholder="e.g. Projects, Travel, Tech"
                className="quiet-input text-xs"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1">
                Tags (comma separated)
              </label>
              <input
                type="text"
                name="tags"
                value={formData.tags}
                onChange={handleChange}
                placeholder="design, photography, quiet"
                className="quiet-input text-xs"
              />
            </div>

            {/* Cover Image URL */}
            <div>
              <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1">
                Cover Image URL
              </label>
              <input
                type="text"
                name="cover_image"
                value={formData.cover_image}
                onChange={handleChange}
                placeholder="https://... or /uploads/..."
                className="quiet-input text-xs"
              />
            </div>

            {/* Excerpt */}
            <div>
              <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1">
                Short Excerpt
              </label>
              <textarea
                name="excerpt"
                rows={3}
                value={formData.excerpt}
                onChange={handleChange}
                placeholder="Short summary for feed preview..."
                className="quiet-input text-xs"
              />
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
