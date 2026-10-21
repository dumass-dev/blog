import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase, invalidateFeedCache } from '../../supabase';
import { publishRealtimeUpdate } from '../../utils/realtime';
import RichViewer from '../../components/RichViewer';
import MediaPicker from '../../components/MediaPicker';
import ThemeToggle from '../../components/ThemeToggle';
import { stripMarkdown } from '../../utils/excerpt';
import { toLocalDatetimeInputString, fromLocalDatetimeInputString } from '../../utils/date';
import { resolveMediaUrl } from '../../utils/media';
import { slugify } from '../../utils/slug';
import { checkFidelity } from '../../utils/editorFidelity';
import { normalizeEntryMarkdown } from '../../utils/entryMarkdown';
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
  Lock,
  Columns,
  RefreshCw,
  Copy,
  EyeOff,
  ExternalLink,
  AlignLeft,
  AlignRight,
  AlertTriangle
} from 'lucide-react';

const VisualEditor = React.lazy(() => import('../../components/editor/VisualEditor'));

export { slugify };

export default function Editor() {
  const { id } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || 'journal';
  const initialCoverImage = searchParams.get('cover_image') || '';

  const { token } = useAuth();
  const navigate = useNavigate();

  // Instant state pre-fill from navigation state or dashboard cache to eliminate editor open delay
  const entryFromLocation = location.state?.entry;
  const entryFromCache = React.useMemo(() => {
    if (entryFromLocation || !id) return null;
    try {
      const raw = localStorage.getItem('cached_admin_dashboard_v2');
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?.entries?.find(e => e.id === id || e.slug === id) || null;
      }
    } catch {}
    return null;
  }, [entryFromLocation, id]);

  const initialEntry = entryFromLocation || entryFromCache;

  const [formData, setFormData] = useState(() => {
    if (initialEntry) {
      const isPhoto = Boolean(
        initialEntry.type === 'photo' ||
        (initialEntry.category && initialEntry.category.toLowerCase() === 'photos')
      );
      return {
        title: initialEntry.title || '',
        slug: initialEntry.slug || '',
        content: normalizeEntryMarkdown(initialEntry.content || ''),
        type: isPhoto ? 'photo' : (initialEntry.type || 'journal'),
        status: initialEntry.status || 'published',
        category: initialEntry.category || '',
        tags: initialEntry.tags || '',
        cover_image: initialEntry.cover_image || '',
        excerpt: initialEntry.excerpt || '',
        location: initialEntry.location || '',
        weather: initialEntry.weather || '',
        mood: initialEntry.mood || '',
        passcode: '',
        show_in_feed: initialEntry.show_in_feed !== undefined ? Boolean(initialEntry.show_in_feed) : !isPhoto,
        date: toLocalDatetimeInputString(initialEntry.date)
      };
    }
    return {
      title: '',
      slug: '',
      content: '',
      type: initialType,
      status: 'published',
      category: initialType === 'photo' ? 'Photos' : '',
      tags: '',
      cover_image: initialCoverImage,
      excerpt: '',
      location: '',
      weather: '',
      mood: '',
      passcode: '',
      show_in_feed: initialType !== 'photo',
      date: toLocalDatetimeInputString(new Date())
    };
  });

  const [mode, setMode] = useState('visual'); // 'visual' | 'markdown' | 'split' | 'preview'
  const [gateWarning, setGateWarning] = useState(null);
  const visualEditorRef = React.useRef(null);
  const originalContentRef = React.useRef(initialEntry?.content || '');
  const dirtyRef = React.useRef(false);
  const [loading, setLoading] = useState(() => Boolean(id && !initialEntry));
  const [saving, setSaving] = useState(false);
  const { success: toastSuccess, error: toastError } = useToast();
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [hasExistingPasscode, setHasExistingPasscode] = useState(false);
  const [removePasscodeFlag, setRemovePasscodeFlag] = useState(false);
  const [isCustomSlug, setIsCustomSlug] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const recognitionRef = React.useRef(null);
  const isSavingRef = React.useRef(false);
  const cursorPosRef = React.useRef({ start: null, end: null });
  const loadedEntryIdRef = React.useRef(null);

  const getShareableUrl = () => {
    const activeSlug = (formData.slug && formData.slug.trim()) || id || '';
    if (!activeSlug) return '';
    return `${window.location.origin}/entry/${activeSlug}`;
  };

  const handleCopyShareLink = () => {
    const url = getShareableUrl();
    if (!url) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedShareLink(true);
        setTimeout(() => setCopiedShareLink(false), 2500);
      }).catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
  };

  const fallbackCopy = (url) => {
    try {
      const temp = document.createElement('textarea');
      temp.value = url;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2500);
    } catch {}
  };

  const updateCursorPos = (e) => {
    if (e && e.target) {
      cursorPosRef.current = {
        start: e.target.selectionStart,
        end: e.target.selectionEnd
      };
    }
  };

  // Speech Recognition Setup
  const toggleDictation = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toastError('Voice dictation is not supported by your browser.');
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
        toastError('Voice recording error: ' + e.error);
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
      toastError('Could not start microphone: ' + err.message);
    }
  };

  // Fetch existing entry if editing
  useEffect(() => {
    if (!id || loadedEntryIdRef.current === id) return;
    let isMounted = true;
    if (!initialEntry) {
      setLoading(true);
    }

    const loadExistingEntry = async () => {
      let entryData = null;

      // 1. Try API fetch
      try {
        const res = await fetch(`/api/posts/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          entryData = data.entry || (data.id || data.title || data.content ? data : null);
        }
      } catch (_e) {}

      // 2. Direct Supabase fallback if API fetch didn't return entry
      if (!entryData) {
        try {
          const { data: supaPost } = await supabase
            .from('entries')
            .select('*')
            .eq('id', id)
            .single();
          if (supaPost) entryData = supaPost;
        } catch (_e) {}
      }

      if (isMounted) {
        loadedEntryIdRef.current = id;
        if (entryData) {
          const formattedDate = toLocalDatetimeInputString(entryData.date);

          const passcodeExists = Boolean(entryData.has_passcode || (entryData.passcode && entryData.passcode.trim() !== ''));
          setHasExistingPasscode(passcodeExists);

          const isPhotoEntry = Boolean(
            entryData.type === 'photo' ||
            (entryData.category && entryData.category.toLowerCase() === 'photos')
          );

          setFormData(prev => ({
            ...prev,
            title: entryData.title || prev.title,
            slug: entryData.slug || prev.slug,
            content: normalizeEntryMarkdown(entryData.content || prev.content),
            type: isPhotoEntry ? 'photo' : (entryData.type || prev.type),
            status: entryData.status || prev.status,
            category: entryData.category || prev.category,
            tags: entryData.tags || prev.tags,
            cover_image: entryData.cover_image || prev.cover_image,
            excerpt: entryData.excerpt || prev.excerpt,
            location: entryData.location || prev.location,
            weather: entryData.weather || prev.weather,
            mood: entryData.mood || prev.mood,
            show_in_feed: entryData.show_in_feed !== undefined ? Boolean(entryData.show_in_feed) : prev.show_in_feed,
            date: formattedDate || prev.date
          }));

          const rawContent = entryData.content || '';
          originalContentRef.current = rawContent;
          dirtyRef.current = false;
          const gate = checkFidelity(rawContent);
          if (!gate.ok) {
            setMode('markdown');
            setGateWarning(gate.reason);
          } else {
            // Preserve user's explicitly chosen mode if already set, otherwise default to visual
            setMode(prev => (prev === 'markdown' || prev === 'split' || prev === 'preview') ? prev : 'visual');
            setGateWarning(null);
          }
        } else if (!initialEntry) {
          toastError('Failed loading entry details.');
        }
        setLoading(false);
      }
    };

    loadExistingEntry();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  const handleVisualChange = (newMd) => {
    if (mode !== 'visual' && mode !== 'split') return;
    dirtyRef.current = true;
    setFormData(prev => ({ ...prev, content: newMd }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'content') {
      dirtyRef.current = true;
    }
    if (name === 'title') {
      setFormData(prev => ({
        ...prev,
        title: value,
        slug: !isCustomSlug ? slugify(value) : prev.slug
      }));
    } else if (name === 'slug') {
      const trimmed = value.trim();
      if (!trimmed) {
        setIsCustomSlug(false);
        setFormData(prev => ({
          ...prev,
          slug: ''
        }));
      } else {
        setIsCustomSlug(true);
        setFormData(prev => ({
          ...prev,
          slug: value
        }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Insert markdown snippet into content without jumping or scrolling to the bottom
  const insertFormatting = (prefix, suffix = '') => {
    const textarea = document.getElementById('content-textarea');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const scrollPos = textarea.scrollTop;
    const windowScrollY = window.scrollY;

    const selectedText = text.substring(start, end) || 'text';
    const replacement = prefix + selectedText + suffix;

    const newText = text.substring(0, start) + replacement + text.substring(end);
    setFormData(prev => ({ ...prev, content: newText }));

    // Reset cursor after update without jumping or scrolling the editor/page
    setTimeout(() => {
      const el = document.getElementById('content-textarea');
      if (el) {
        el.focus({ preventScroll: true });
        el.setSelectionRange(start + prefix.length, end + prefix.length);
        el.scrollTop = scrollPos;
      }
      window.scrollTo({ top: windowScrollY, behavior: 'instant' });
    }, 50);
  };

  const applyImageWrap = (align) => {
    const textarea = document.getElementById('content-textarea');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end).trim();

    // If an image tag is selected: ![alt](url)
    const imgRegex = /^!\[(.*?)\]\((.*?)\)$/;
    if (selected && imgRegex.test(selected)) {
      const match = selected.match(imgRegex);
      const rawAlt = match[1];
      const url = match[2];
      const parts = rawAlt.split('|').map(p => p.trim());
      const baseAlt = parts[0] || 'image';
      const existingWidth = parts.find(p => /^\d{1,3}%$/.test(p) || /^\d+(?:px|rem)$/.test(p)) || (align === 'center' ? '60%' : '45%');
      const newAlt = align === 'center' ? `${baseAlt}|${existingWidth}` : `${baseAlt}|${align}|${existingWidth}`;
      const replacement = `![${newAlt}](${url})`;
      const newText = text.substring(0, start) + replacement + text.substring(end);
      setFormData(prev => ({ ...prev, content: newText }));
      return;
    }

    if (align === 'left') {
      insertFormatting('![image|left|45%](', ')');
    } else if (align === 'right') {
      insertFormatting('![image|right|45%](', ')');
    } else {
      insertFormatting('![image|60%](', ')');
    }
  };

  const handleSelectMedia = (media) => {
    // Use proxy_url if available — this is a permanent /api/media/file/... URL
    // with no X-Amz-* credentials embedded
    const insertUrl = media.proxy_url || media.url;
    const parts = [media.original_name || 'image'];
    if (media.align && media.align !== 'center') {
      parts.push(media.align); // 'left' or 'right'
    }
    if (media.size && media.size !== 'full' && media.size !== '100%') {
      parts.push(media.size);
    }
    const altText = parts.join('|');
    const mediaSnippet = media.mime_type && media.mime_type.startsWith('video/')
      ? insertUrl
      : `![${altText}](${insertUrl})`;

    const textarea = document.getElementById('content-textarea');
    const scrollPos = textarea ? textarea.scrollTop : 0;
    const windowScrollY = window.scrollY;
    const currentContent = formData.content || '';

    let start = (cursorPosRef.current.start !== null && cursorPosRef.current.start !== undefined)
      ? cursorPosRef.current.start
      : (textarea ? textarea.selectionStart : currentContent.length);
    let end = (cursorPosRef.current.end !== null && cursorPosRef.current.end !== undefined)
      ? cursorPosRef.current.end
      : (textarea ? textarea.selectionEnd : currentContent.length);

    if (start < 0) start = 0;
    if (start > currentContent.length) start = currentContent.length;
    if (end < 0) end = 0;
    if (end > currentContent.length) end = currentContent.length;
    if (start > end) {
      const tmp = start;
      start = end;
      end = tmp;
    }

    // Determine clean leading and trailing newlines so no accidental blank lines are created
    const before = currentContent.substring(0, start);
    const after = currentContent.substring(end);

    const leadingNewline = (before.length > 0 && !before.endsWith('\n')) ? '\n' : '';
    const trailingNewline = (after.length > 0 && !after.startsWith('\n')) ? '\n' : '';

    const textToInsert = leadingNewline + mediaSnippet + trailingNewline;
    const newContent = currentContent.substring(0, start) + textToInsert + currentContent.substring(end);
    const newCursorPos = start + textToInsert.length;

    dirtyRef.current = true;
    if (mode === 'visual' && visualEditorRef.current) {
      if (media.mime_type && media.mime_type.startsWith('video/')) {
        visualEditorRef.current.insertVideoEmbed(insertUrl);
      } else {
        visualEditorRef.current.insertMediaImage({
          src: insertUrl,
          alt: media.original_name || 'image',
          size: (media.size && media.size !== 'full' && media.size !== '100%') ? media.size : '',
          align: (media.align && media.align !== 'center') ? media.align : ''
        });
      }
      const rawUrl = media.url || media.storageKey || media.signed_url || '';
      const keyMatch = typeof rawUrl === 'string' && rawUrl.match(/(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+/i);
      const canonicalKey = keyMatch ? keyMatch[0] : (rawUrl && !rawUrl.includes('?') ? rawUrl : '');
      if (canonicalKey) {
        setFormData(prev => ({
          ...prev,
          cover_image: prev.type === 'photo' && (!prev.cover_image || !prev.cover_image.trim()) ? canonicalKey : prev.cover_image
        }));
      }
      return;
    }

    const rawUrl = media.url || media.storageKey || media.signed_url || '';
    const keyMatch = typeof rawUrl === 'string' && rawUrl.match(/(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+/i);
    const canonicalKey = keyMatch ? keyMatch[0] : (rawUrl && !rawUrl.includes('?') ? rawUrl : '');

    setFormData(prev => ({
      ...prev,
      content: newContent,
      // Only set cover_image for photo posts; never create an unwanted banner on journals/writings
      cover_image: prev.type === 'photo' && (!prev.cover_image || !prev.cover_image.trim()) && canonicalKey
        ? canonicalKey
        : prev.cover_image
    }));
    cursorPosRef.current = { start: newCursorPos, end: newCursorPos };

    // Restore cursor and scroll position cleanly without jumping to the bottom
    setTimeout(() => {
      const el = document.getElementById('content-textarea');
      if (el) {
        el.focus({ preventScroll: true });
        el.setSelectionRange(newCursorPos, newCursorPos);
        el.scrollTop = scrollPos;
      }
      window.scrollTo({ top: windowScrollY, behavior: 'instant' });
    }, 50);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isSavingRef.current || saving) return;

    // Layer A: Dirty Tracking & Byte-for-byte Unmodified Saves
    let contentToSave = formData.content;
    if (id && !dirtyRef.current && originalContentRef.current !== undefined) {
      // Unedited existing post: guarantee 100% byte-for-byte identity by using original
      contentToSave = originalContentRef.current;
    } else if (visualEditorRef.current?.getMarkdown && (mode === 'visual' || mode === 'preview')) {
      const liveMd = visualEditorRef.current.getMarkdown();
      if (liveMd) contentToSave = liveMd;
    }

    if (!formData.title && formData.type !== 'update' && formData.type !== 'photo') {
      toastError('Title is required for Journal and Writing entries.');
      return;
    }
    if (!contentToSave) {
      toastError('Content is required.');
      return;
    }

    isSavingRef.current = true;
    setSaving(true);

    const isPhotoPost = formData.type === 'photo';
    const fallbackTitle = isPhotoPost 
      ? `Photo — ${new Date(formData.date).toLocaleDateString()}` 
      : (formData.type === 'update' ? `Update — ${new Date(formData.date).toLocaleDateString()}` : 'Untitled Entry');

    const payloadSlug = (formData.slug && formData.slug.trim())
      ? slugify(formData.slug.trim())
      : (slugify(formData.title || fallbackTitle) || (isPhotoPost ? `photo-${Date.now()}` : `entry-${Date.now()}`));

    // Normalize markdown on save: collapse accidental blank-line runs, drop
    // <br>-only lines, trim trailing whitespace (deliberate &nbsp; spacer
    // marker lines are preserved as a single marker)
    const normalizedContent = normalizeEntryMarkdown(contentToSave);

    const payload = {
      ...formData,
      content: normalizedContent,
      title: formData.title || fallbackTitle,
      slug: payloadSlug,
      type: isPhotoPost ? 'journal' : formData.type,
      category: isPhotoPost ? (formData.category || 'Photos') : formData.category,
      show_in_feed: formData.show_in_feed !== undefined ? Boolean(formData.show_in_feed) : !isPhotoPost,
      excerpt: stripMarkdown(normalizedContent, 150),
      date: fromLocalDatetimeInputString(formData.date)
    };

    if (removePasscodeFlag) {
      payload.passcode = null;
    } else if (formData.passcode && formData.passcode.trim() !== '') {
      payload.passcode = formData.passcode.trim();
    } else if (id && hasExistingPasscode) {
      // Protected entry published with a blank passcode field = remove
      // protection. The passcode UI warns about this state before publish.
      payload.passcode = null;
    } else if (id) {
      delete payload.passcode;
    } else {
      payload.passcode = null;
    }

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
          type: isPhotoPost ? 'journal' : (payload.type || 'journal'),
          status: payload.status || 'published',
          category: isPhotoPost ? 'Photos' : (payload.category || 'General'),
          tags: payload.tags || '',
          cover_image: payload.cover_image || '',
          excerpt: stripMarkdown(payload.content, 150),
          date: payload.date || new Date().toISOString(),
          location: payload.location || null,
          weather: payload.weather || null,
          mood: payload.mood || null,
          show_in_feed: payload.show_in_feed !== undefined ? Boolean(payload.show_in_feed) : !isPhotoPost
        };
        if (payload.passcode !== undefined) {
          supaPayload.passcode = payload.passcode;
        }

        if (id) {
          let { data: supaUpdated, error: supaErr } = await supabase
            .from('entries')
            .update(supaPayload)
            .eq('id', id)
            .select('*')
            .single();

          if (supaErr && (supaErr.message.includes('show_in_feed') || supaErr.message.includes('schema cache'))) {
            delete supaPayload.show_in_feed;
            const retry = await supabase.from('entries').update(supaPayload).eq('id', id).select('*').single();
            supaUpdated = retry.data;
            supaErr = retry.error;
          }

          if (supaErr) throw supaErr;
          savedData = supaUpdated;
        } else {
          let { data: supaInserted, error: supaErr } = await supabase
            .from('entries')
            .insert([supaPayload])
            .select('*')
            .single();

          if (supaErr && (supaErr.message.includes('show_in_feed') || supaErr.message.includes('schema cache'))) {
            delete supaPayload.show_in_feed;
            const retry = await supabase.from('entries').insert([supaPayload]).select('*').single();
            supaInserted = retry.data;
            supaErr = retry.error;
          }

          if (supaErr && (supaErr.message.includes('entries_slug_key') || supaErr.message.includes('duplicate key'))) {
            supaPayload.slug = `${supaPayload.slug}-${Math.random().toString(36).slice(2, 6)}`;
            const retry = await supabase.from('entries').insert([supaPayload]).select('*').single();
            supaInserted = retry.data;
            supaErr = retry.error;
          }

          if (supaErr) throw supaErr;
          savedData = supaInserted;
        }
      } catch (err) {
        toastError(err.message || 'Failed saving entry.');
        setSaving(false);
        isSavingRef.current = false;
        return;
      }
    }

    if (!savedData) {
      toastError('Failed saving entry.');
      setSaving(false);
      isSavingRef.current = false;
      return;
    }

    invalidateFeedCache();
    publishRealtimeUpdate({
      type: 'entry',
      op: id ? 'UPDATE' : 'INSERT',
      id: savedData.id,
      slug: savedData.slug,
      status: savedData.status || formData.status,
      title: savedData.title || formData.title,
      data: savedData
    });
    toastSuccess(id ? 'Entry updated successfully.' : 'Entry published successfully.');
    if (payload.passcode === null) {
      setHasExistingPasscode(false);
      setRemovePasscodeFlag(false);
    } else if (typeof payload.passcode === 'string') {
      setHasExistingPasscode(true);
    }
    originalContentRef.current = contentToSave;
    dirtyRef.current = false;
    setSaving(false);
    isSavingRef.current = false;

    if (!id && savedData?.id) {
      // Smoothly transition new entry into edit route so the author remains in the editor
      navigate(`/admin/edit/${savedData.id}`, { replace: true });
    }
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
      <div className="sticky top-0 z-40 bg-[var(--bg-main)] flex flex-col sm:flex-row justify-between items-stretch sm:items-center py-4 border-b border-[var(--border-subtle)] mb-8 gap-3 sm:gap-4">
        {/* Row 1: Back + Title on left, ThemeToggle + Publish on right for mobile */}
        <div className="flex items-center justify-between w-full sm:w-auto gap-2">
          <div className="flex items-center space-x-2.5 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0 cursor-pointer"
              title="Back to Admin"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-lg sm:text-xl font-serif font-medium truncate">
                {id ? 'Edit Entry' : 'New Entry'}
              </h1>
              {formData.type === 'photo' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-sans font-medium rounded bg-[var(--code-bg)] text-[var(--accent-warm)] border border-[var(--border-subtle)] shrink-0">
                  <ImageIcon className="w-3 h-3 text-[var(--accent-warm)]" />
                  <span>Photo</span>
                </span>
              )}
              {Boolean(formData.passcode && formData.passcode.trim() !== '') && (
                <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-sans font-medium rounded bg-[var(--code-bg)] text-[var(--accent-warm)] border border-[var(--border-subtle)] whitespace-nowrap shrink-0" title="Passcode protected for public readers">
                  <span>Protected</span>
                </span>
              )}
            </div>
          </div>

          {/* On mobile, place ThemeToggle + Publish directly in top row so it NEVER overflows or cuts off */}
          <div className="flex sm:hidden items-center gap-1.5 shrink-0">
            <div className="p-1 border border-[var(--border-subtle)] rounded bg-[var(--card-bg)] flex items-center justify-center shrink-0">
              <ThemeToggle />
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="quiet-button text-xs flex items-center gap-1 shrink-0 px-2.5 py-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 shrink-0" />
              <span>{saving ? 'Saving...' : 'Publish'}</span>
            </button>
          </div>
        </div>

        {/* Mode switcher tabs (and on desktop: ThemeToggle + Publish) */}
        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          {/* Visual / Markdown / Split / Preview Toggle */}
          <div className="flex border border-[var(--border-subtle)] rounded p-0.5 text-xs font-sans bg-[var(--card-bg)] w-full sm:w-auto justify-between sm:justify-start">
            <button
              type="button"
              onClick={() => {
                const currentScrollY = window.scrollY;
                if (mode === 'markdown') {
                  const gate = checkFidelity(formData.content);
                  if (!gate.ok) {
                    setGateWarning(gate.reason);
                  } else {
                    setGateWarning(null);
                  }
                  if (visualEditorRef.current?.setContent) {
                    visualEditorRef.current.setContent(formData.content || '');
                  }
                }
                setMode('visual');
                requestAnimationFrame(() => {
                  window.scrollTo({ top: currentScrollY, behavior: 'instant' });
                });
              }}
              className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1 rounded flex items-center justify-center gap-1 sm:gap-1.5 transition-all cursor-pointer text-xs whitespace-nowrap ${
                mode === 'visual'
                  ? 'font-medium shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              style={
                mode === 'visual'
                  ? { backgroundColor: 'var(--text-primary)', color: 'var(--bg-main)' }
                  : {}
              }
              title="TipTap Visual Block Editor"
            >
              <Edit3 className="w-3.5 h-3.5 shrink-0" />
              <span>Visual</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const currentScrollY = window.scrollY;
                let activeImgSrc = null;
                if (visualEditorRef.current?.getSelectedImageInfo) {
                  activeImgSrc = visualEditorRef.current.getSelectedImageInfo()?.attrs?.src;
                }
                let nextContent = formData.content;
                if (mode === 'visual' && visualEditorRef.current?.getMarkdown) {
                  nextContent = visualEditorRef.current.getMarkdown();
                  setFormData(prev => ({ ...prev, content: nextContent }));
                }
                setMode('markdown');
                requestAnimationFrame(() => {
                  window.scrollTo({ top: currentScrollY, behavior: 'instant' });
                  // Do NOT focus the textarea here: switching tabs must never
                  // pop the mobile keyboard. The user focuses it by tapping.
                  // Only preserve the scroll position near a selected image.
                  const textarea = document.getElementById('content-textarea');
                  if (textarea && activeImgSrc && nextContent) {
                    const idx = nextContent.indexOf(activeImgSrc);
                    if (idx >= 0) {
                      const lineStart = nextContent.lastIndexOf('\n', idx);
                      const pos = lineStart >= 0 ? lineStart + 1 : idx;
                      const textBefore = nextContent.substring(0, pos);
                      const lineCount = textBefore.split('\n').length;
                      textarea.scrollTop = Math.max(0, (lineCount - 2) * 26);
                    }
                  }
                  window.scrollTo({ top: currentScrollY, behavior: 'instant' });
                });
              }}
              className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1 rounded flex items-center justify-center gap-1 sm:gap-1.5 transition-all cursor-pointer text-xs whitespace-nowrap ${
                mode === 'markdown'
                  ? 'font-medium shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              style={
                mode === 'markdown'
                  ? { backgroundColor: 'var(--text-primary)', color: 'var(--bg-main)' }
                  : {}
              }
              title="Raw Markdown Editor"
            >
              <Code className="w-3.5 h-3.5 shrink-0" />
              <span>Markdown</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const currentScrollY = window.scrollY;
                if (mode === 'visual' && visualEditorRef.current?.getMarkdown) {
                  const md = visualEditorRef.current.getMarkdown();
                  setFormData(prev => ({ ...prev, content: md }));
                }
                setMode('split');
                requestAnimationFrame(() => {
                  window.scrollTo({ top: currentScrollY, behavior: 'instant' });
                });
              }}
              className={`hidden md:flex px-3 py-1 rounded items-center gap-1.5 transition-all cursor-pointer text-xs ${
                mode === 'split'
                  ? 'font-medium shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              style={
                mode === 'split'
                  ? { backgroundColor: 'var(--text-primary)', color: 'var(--bg-main)' }
                  : {}
              }
              title="Side-by-side live editor & visual preview"
            >
              <Columns className="w-3.5 h-3.5 shrink-0" />
              <span>Split</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const currentScrollY = window.scrollY;
                if (mode === 'visual' && visualEditorRef.current?.getMarkdown) {
                  const md = visualEditorRef.current.getMarkdown();
                  setFormData(prev => ({ ...prev, content: md }));
                }
                setMode('preview');
                requestAnimationFrame(() => {
                  window.scrollTo({ top: currentScrollY, behavior: 'instant' });
                });
              }}
              className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1 rounded flex items-center justify-center gap-1 sm:gap-1.5 transition-all cursor-pointer text-xs whitespace-nowrap ${
                mode === 'preview'
                  ? 'font-medium shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              style={
                mode === 'preview'
                  ? { backgroundColor: 'var(--text-primary)', color: 'var(--bg-main)' }
                  : {}
              }
              title="Visual Reading Preview"
            >
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span>Preview</span>
            </button>
          </div>

          {/* Desktop-only ThemeToggle + Publish button */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <div className="p-1 border border-[var(--border-subtle)] rounded bg-[var(--card-bg)] flex items-center justify-center shrink-0">
              <ThemeToggle />
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="quiet-button text-xs flex items-center gap-1.5 shrink-0 px-3 py-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 shrink-0" />
              <span>{saving ? 'Publishing...' : 'Publish'}</span>
            </button>
          </div>
        </div>
      </div>

      {mode === 'preview' && (
        /* Reading Preview Mode */
        <div className="notebook-container py-6 sm:py-8 border border-[var(--border-subtle)] rounded p-4 sm:p-8 bg-[var(--card-bg)]">
          <div className="text-xs font-sans text-[var(--text-muted)] uppercase mb-2">
            Visual Reading Preview
          </div>
          <h1 className="text-3xl font-serif font-medium mb-4">{formData.title || 'Untitled'}</h1>
          {(() => {
            const contentHasImage = Boolean(
              formData.content && (
                (formData.cover_image && formData.content.includes(formData.cover_image)) ||
                /!\[.*?\]\((.*?)\)/.test(formData.content) ||
                /https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+/i.test(formData.content)
              )
            );
            return formData.cover_image && !contentHasImage ? (
              <img src={resolveMediaUrl(formData.cover_image)} alt="" className="w-full h-auto rounded mb-6 max-h-[400px] object-cover" />
            ) : null;
          })()}
          <RichViewer content={formData.content} />
        </div>
      )}

      {/* Edit & Split Mode */}
      <form
        onSubmit={handleSave}
        className={`${mode === 'preview' ? 'hidden' : ''} ${
          mode === 'split' ? "grid grid-cols-1 lg:grid-cols-2 gap-8" : "grid grid-cols-1 lg:grid-cols-3 gap-8"
        }`}
      >
          {/* Main Content Area */}
          <div className={mode === 'split' ? "space-y-6" : "lg:col-span-2 space-y-6"}>
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

            {/* Gate Fallback Notice */}
            {gateWarning && mode === 'markdown' && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--code-bg)] border border-[var(--border-subtle)] text-xs font-sans text-[var(--accent-warm)]">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>This entry contains formatting that requires raw Markdown mode to preserve 100% fidelity ({gateWarning}).</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMode('visual')}
                  className="text-xs underline hover:opacity-80 shrink-0 ml-2"
                >
                  Switch to Visual
                </button>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex items-center gap-1 p-2 bg-[var(--code-bg)] border border-[var(--border-subtle)] rounded text-xs font-sans overflow-x-touch flex-nowrap shrink-0">
              <button
                type="button"
                onClick={() => {
                  dirtyRef.current = true;
                  if (mode === 'visual' && visualEditorRef.current) {
                    visualEditorRef.current.commands?.toggleHeading({ level: 1 }).run();
                  } else {
                    insertFormatting('## ');
                  }
                }}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                title="Heading 2"
              >
                <Heading1 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  dirtyRef.current = true;
                  if (mode === 'visual' && visualEditorRef.current) {
                    visualEditorRef.current.commands?.toggleHeading({ level: 2 }).run();
                  } else {
                    insertFormatting('### ');
                  }
                }}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                title="Heading 3"
              >
                <Heading2 className="w-4 h-4" />
              </button>

              <span className="h-4 w-[1px] bg-[var(--border-subtle)] mx-1" />

              <button
                type="button"
                onClick={() => {
                  dirtyRef.current = true;
                  if (mode === 'visual' && visualEditorRef.current) {
                    visualEditorRef.current.commands?.toggleBold().run();
                  } else {
                    insertFormatting('**', '**');
                  }
                }}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                title="Bold"
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  dirtyRef.current = true;
                  if (mode === 'visual' && visualEditorRef.current) {
                    visualEditorRef.current.commands?.toggleItalic().run();
                  } else {
                    insertFormatting('*', '*');
                  }
                }}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                title="Italic"
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  dirtyRef.current = true;
                  if (mode === 'visual' && visualEditorRef.current) {
                    visualEditorRef.current.commands?.toggleBlockquote().run();
                  } else {
                    insertFormatting('> ');
                  }
                }}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                title="Blockquote"
              >
                <Quote className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  dirtyRef.current = true;
                  if (mode === 'visual' && visualEditorRef.current) {
                    visualEditorRef.current.commands?.toggleCodeBlock().run();
                  } else {
                    insertFormatting('```javascript\n', '\n```');
                  }
                }}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                title="Code Block"
              >
                <Code className="w-4 h-4" />
              </button>

              <span className="h-4 w-[1px] bg-[var(--border-subtle)] mx-1" />

              <button
                type="button"
                onClick={() => {
                  dirtyRef.current = true;
                  if (mode === 'visual' && visualEditorRef.current) {
                    const url = typeof window !== 'undefined' ? window.prompt('Enter link URL (https://...):') : null;
                    if (url) {
                      visualEditorRef.current.commands?.setLink({ href: url }).run();
                    }
                  } else {
                    insertFormatting('[', '](https://example.com)');
                  }
                }}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                title="Link"
              >
                <LinkIcon className="w-4 h-4" />
              </button>

              <button
                type="button"
                onMouseDown={() => {
                  const textarea = document.getElementById('content-textarea');
                  if (textarea) {
                    cursorPosRef.current = {
                      start: textarea.selectionStart,
                      end: textarea.selectionEnd
                    };
                  }
                }}
                onClick={() => {
                  const textarea = document.getElementById('content-textarea');
                  if (textarea && (cursorPosRef.current.start === null || cursorPosRef.current.start === undefined)) {
                    cursorPosRef.current = {
                      start: textarea.selectionStart,
                      end: textarea.selectionEnd
                    };
                  }
                  setShowMediaPicker(true);
                }}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded text-[var(--accent-warm)] font-medium flex items-center gap-1 shrink-0 whitespace-nowrap"
                title="Insert Photo/GIF/Video"
              >
                <ImageIcon className="w-4 h-4" />
                <span className="text-[11px] whitespace-nowrap">Add Media</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  dirtyRef.current = true;
                  if (mode === 'visual' && visualEditorRef.current) {
                    if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
                      window.dispatchEvent(new window.CustomEvent('editor-open-video-dialog'));
                    }
                  } else {
                    insertFormatting('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
                  }
                }}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded shrink-0 whitespace-nowrap"
                title="Embed YouTube Video"
              >
                <Video className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  dirtyRef.current = true;
                  if (mode === 'visual' && visualEditorRef.current) {
                    visualEditorRef.current.commands?.insertContent({
                      type: 'mediaGrid',
                      content: [{ type: 'paragraph' }]
                    }).run();
                  } else {
                    insertFormatting('\n[grid]\n', '\n[/grid]\n');
                  }
                }}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded text-[var(--accent-warm)] font-medium flex items-center gap-1 shrink-0 whitespace-nowrap"
                title="Insert 2-column Media Grid for side-by-side images"
              >
                <Columns className="w-4 h-4" />
                <span className="hidden xl:inline text-[11px] whitespace-nowrap">Grid</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  dirtyRef.current = true;
                  if (mode === 'visual' && visualEditorRef.current) {
                    visualEditorRef.current.commands?.insertContent({
                      type: 'editorialWrap',
                      attrs: { align: 'left', width: '45%' },
                      content: [{ type: 'paragraph' }]
                    }).run();
                  } else {
                    applyImageWrap('left');
                  }
                }}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded flex items-center gap-1 font-medium cursor-pointer shrink-0 whitespace-nowrap"
                title="Float image on the left and wrap text around it"
              >
                <AlignLeft className="w-4 h-4 text-[var(--accent-warm)]" />
                <span className="hidden xl:inline text-[11px] whitespace-nowrap">Wrap Left</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  dirtyRef.current = true;
                  if (mode === 'visual' && visualEditorRef.current) {
                    visualEditorRef.current.commands?.insertContent({
                      type: 'editorialWrap',
                      attrs: { align: 'right', width: '45%' },
                      content: [{ type: 'paragraph' }]
                    }).run();
                  } else {
                    applyImageWrap('right');
                  }
                }}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded flex items-center gap-1 font-medium cursor-pointer shrink-0 whitespace-nowrap"
                title="Float image on the right and wrap text around it"
              >
                <AlignRight className="w-4 h-4 text-[var(--accent-warm)]" />
                <span className="hidden xl:inline text-[11px] whitespace-nowrap">Wrap Right</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  dirtyRef.current = true;
                  if (mode === 'visual' && visualEditorRef.current) {
                    visualEditorRef.current.commands?.insertContent({ type: 'editorialClear' }).run();
                  } else {
                    insertFormatting('\n[clear]\n');
                  }
                }}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0 whitespace-nowrap"
                title="End floating wrap and resume full-width text"
              >
                <span className="text-[11px] font-sans px-2 py-0.5 rounded bg-black/5 dark:bg-white/5 whitespace-nowrap font-medium">Clear Float</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  dirtyRef.current = true;
                  if (mode === 'visual' && visualEditorRef.current) {
                    visualEditorRef.current.commands?.setHorizontalRule().run();
                  } else {
                    insertFormatting('\n---\n');
                  }
                }}
                className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded shrink-0 whitespace-nowrap"
                title="Horizontal Rule"
              >
                <Minus className="w-4 h-4" />
              </button>

              <span className="h-4 w-[1px] bg-[var(--border-subtle)] mx-1 shrink-0" />

              {/* Voice Dictation Button */}
              <button
                type="button"
                onClick={toggleDictation}
                className={`p-1.5 rounded flex items-center gap-1 font-medium transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                  isListening
                    ? 'bg-[var(--text-primary)] text-[var(--bg-main)] animate-pulse'
                    : 'hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-primary)]'
                }`}
                title={isListening ? "Stop Voice Dictation" : "Start Speech-to-Text Voice Dictation"}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span className="text-[11px] whitespace-nowrap">{isListening ? 'Listening...' : 'Dictate'}</span>
              </button>
            </div>

            {/* Content Body */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-sans uppercase text-[var(--text-muted)]">
                  Body Content ({mode === 'visual' ? 'Visual Block Editor' : 'Markdown'})
                </label>
                {mode === 'visual' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (visualEditorRef.current?.openSlashMenu) {
                        visualEditorRef.current.openSlashMenu();
                      }
                    }}
                    className="text-[11px] font-sans text-[var(--text-muted)] hover:text-[var(--text-primary)] italic transition-colors flex items-center gap-1 cursor-pointer"
                    title="Click or type / in editor to insert quick blocks"
                  >
                    <span>Type</span>
                    <kbd className="px-1 py-0.5 rounded bg-[var(--code-bg)] text-[10px] font-mono border border-[var(--border-subtle)] font-bold">/</kbd>
                    <span>for quick blocks</span>
                  </button>
                )}
              </div>

              <div className={(mode === 'visual' || mode === 'preview') ? '' : 'hidden'}>
                <React.Suspense fallback={<div className="p-8 text-center text-xs text-[var(--text-muted)] italic">Loading visual editor...</div>}>
                  <VisualEditor
                    ref={visualEditorRef}
                    initialContent={formData.content}
                    onChange={handleVisualChange}
                    onOpenMediaPicker={() => setShowMediaPicker(true)}
                    mode={mode}
                  />
                </React.Suspense>
              </div>

              <textarea
                id="content-textarea"
                name="content"
                rows={16}
                value={formData.content}
                onChange={(e) => {
                  handleChange(e);
                  updateCursorPos(e);
                }}
                onSelect={updateCursorPos}
                onClick={updateCursorPos}
                onKeyUp={updateCursorPos}
                onBlur={updateCursorPos}
                placeholder="Write your story, diary entry, or update here..."
                className={
                  (mode === 'visual' || mode === 'preview')
                    ? 'hidden'
                    : 'quiet-input font-serif text-lg leading-relaxed p-4'
                }
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
                <option value="photo">Photo Post</option>
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

              {formData.status === 'unlisted' && (
                <div className="mt-3 p-3 rounded bg-[var(--code-bg)] border border-[var(--border-subtle)] text-xs font-sans space-y-2">
                  <div className="flex items-center gap-1.5 text-[var(--accent-warm)] font-medium">
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Unlisted Entry</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    This post won&apos;t appear in any public feeds, archives, or search engines. Only people with the direct link can read it.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      readOnly
                      value={getShareableUrl()}
                      className="quiet-input text-[11px] font-mono py-1 px-2 flex-1 select-all bg-[var(--bg-main)]"
                    />
                    <button
                      type="button"
                      onClick={handleCopyShareLink}
                      className="quiet-button text-xs py-1 px-2.5 flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedShareLink ? 'Copied!' : 'Copy'}</span>
                    </button>
                    {formData.slug && (
                      <a
                        href={`/entry/${formData.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="quiet-button-secondary text-xs py-1 px-2 flex items-center cursor-pointer shrink-0"
                        title="Open direct link"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Show in Chronological Feed Toggle */}
            <div className="py-2 border-y border-[var(--border-subtle)]">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-sans text-[var(--text-primary)] font-medium">
                <input
                  type="checkbox"
                  name="show_in_feed"
                  checked={Boolean(formData.show_in_feed)}
                  onChange={(e) => setFormData(prev => ({ ...prev, show_in_feed: e.target.checked }))}
                  className="w-4 h-4 rounded border-[var(--border-subtle)] text-[var(--accent-warm)] focus:ring-0 cursor-pointer"
                />
                <span>Show in Main Chronological Feed</span>
              </label>
              <p className="text-[11px] font-sans text-[var(--text-muted)] mt-1 ml-6 leading-snug">
                Uncheck to hide from home feed (photo posts are kept in Photos gallery only by default).
              </p>
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
              <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Lock className="w-3 h-3 text-[var(--accent-warm)]" />
                  <span>Passcode Lock (Optional)</span>
                </span>
                {hasExistingPasscode && !removePasscodeFlag && (
                  <span className="text-[10px] text-[var(--accent-warm)] font-medium font-mono lowercase">passcode set</span>
                )}
              </label>
              <input
                type="password"
                name="passcode"
                value={formData.passcode}
                onChange={(e) => {
                  handleChange(e);
                  if (removePasscodeFlag) setRemovePasscodeFlag(false);
                }}
                placeholder={hasExistingPasscode && !removePasscodeFlag ? "•••• (passcode set — type to change)" : "Leave blank for public"}
                className="quiet-input text-xs font-mono"
              />
              {hasExistingPasscode && !removePasscodeFlag && (
                <button
                  type="button"
                  onClick={() => {
                    setHasExistingPasscode(false);
                    setRemovePasscodeFlag(true);
                    setFormData(prev => ({ ...prev, passcode: '' }));
                  }}
                  className="text-[11px] text-red-500 hover:underline mt-1 block font-sans"
                >
                  Remove passcode protection
                </button>
              )}
              {hasExistingPasscode && !removePasscodeFlag && !(formData.passcode && formData.passcode.trim() !== '') && (
                <p className="text-[11px] font-sans text-red-500 mt-1 leading-snug">
                  This entry is protected. Publishing with an empty passcode field will remove the passcode and make it public. Type a new passcode to change it instead.
                </p>
              )}
              {removePasscodeFlag && (
                <p className="text-[11px] font-sans text-red-500 mt-1 leading-snug">
                  Passcode protection will be removed when you publish.
                </p>
              )}
              <p className="text-[11px] font-sans text-[var(--text-muted)] mt-1 leading-snug">
                Public readers must enter passcode to read. Passcodes are hashed securely by the database.
              </p>
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
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-sans uppercase text-[var(--text-muted)]">
                  URL Slug
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomSlug(false);
                    const synced = slugify(formData.title);
                    setFormData(prev => ({ ...prev, slug: synced }));
                  }}
                  className="text-[11px] font-sans text-[var(--accent-warm)] hover:underline flex items-center gap-1 cursor-pointer"
                  title="Auto-generate slug from current title"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>Sync with title</span>
                </button>
              </div>
              <input
                type="text"
                name="slug"
                value={formData.slug}
                onChange={handleChange}
                placeholder="auto-generated-if-empty"
                className="quiet-input text-xs font-mono"
              />
              <p className="text-[11px] font-sans text-[var(--text-muted)] mt-1">
                {isCustomSlug
                  ? 'Custom slug active. Clear input or click "Sync with title" to auto-sync.'
                  : 'Auto-syncs when you edit the title. Type here to customize slug.'}
              </p>
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

            {/* Cover Image URL - Only for Photo entries */}
            {formData.type === 'photo' && (
              <div>
                <label className="block text-xs font-sans uppercase text-[var(--text-muted)] mb-1">
                  Photo / Cover Image URL
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
            )}

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

          {/* Live Preview Column in Split View Mode */}
          {mode === 'split' && (
            <div className="hidden lg:block space-y-6 sticky top-6 h-fit max-h-[calc(100vh-4rem)] overflow-y-auto border border-[var(--border-subtle)] rounded-lg p-6 bg-[var(--card-bg)] shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] text-xs font-sans text-[var(--text-muted)] uppercase tracking-wider">
                <span>Live Editorial Preview</span>
                <span className="font-mono text-[10px] text-[var(--accent-warm)]">Interactive</span>
              </div>
              <h1 className="text-2xl font-serif font-medium mb-3">{formData.title || 'Untitled Entry'}</h1>
              {(() => {
                const contentHasImage = Boolean(
                  formData.content && (
                    (formData.cover_image && formData.content.includes(formData.cover_image)) ||
                    /!\[.*?\]\((.*?)\)/.test(formData.content) ||
                    /https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\s?#]+\.[a-z0-9]+/i.test(formData.content)
                  )
                );
                return formData.cover_image && !contentHasImage ? (
                  <img src={resolveMediaUrl(formData.cover_image)} alt="" className="w-full h-auto rounded mb-4 max-h-[300px] object-cover" />
                ) : null;
              })()}
              <RichViewer content={formData.content} />
            </div>
          )}
        </form>
    </div>
  );
}
