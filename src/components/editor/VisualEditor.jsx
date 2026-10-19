import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Placeholder } from '@tiptap/extension-placeholder';
import { computePosition, offset, flip, shift } from '@floating-ui/dom';
import { customEditorialExtensions } from './extensions/index.js';
import { SlashCommands } from './slashCommands.js';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link as LinkIcon,
  Heading2,
  Heading3,
  Quote,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
  X
} from 'lucide-react';

const VisualEditor = forwardRef(function VisualEditor(
  {
    initialContent = '',
    onChange,
    onOpenMediaPicker,
    placeholder = "Write with clarity... (Type '/' for commands)"
  },
  ref
) {
  const containerRef = useRef(null);
  const bubbleMenuRef = useRef(null);
  const slashMenuRef = useRef(null);
  const imageToolbarRef = useRef(null);

  const [slashState, setSlashState] = useState(null);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [showLinkPrompt, setShowLinkPrompt] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [selectedImageNode, setSelectedImageNode] = useState(null);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionInput, setCaptionInput] = useState('');
  const [showVideoPrompt, setShowVideoPrompt] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState('');

  // Configure TipTap Editor
  const editor = useEditor({
    contentType: 'markdown',
    extensions: [
      StarterKit.configure({
        underline: false,
        trailingNode: false,
        link: {
          openOnClick: false,
          protocols: ['http', 'https', 'mailto', 'tel']
        }
      }),
      Markdown.configure({
        markedOptions: {
          gfm: true,
          breaks: true
        }
      }),
      Placeholder.configure({
        placeholder
      }),
      ...customEditorialExtensions,
      SlashCommands.configure({
        suggestion: {
          render: () => {
            return {
              onStart: (props) => {
                setSlashState(props);
                setSelectedSlashIndex(0);
              },
              onUpdate: (props) => {
                setSlashState(props);
              },
              onKeyDown: (props) => {
                if (props.event.key === 'ArrowUp') {
                  setSelectedSlashIndex((prev) => (prev <= 0 ? 0 : prev - 1));
                  return true;
                }
                if (props.event.key === 'ArrowDown') {
                  setSelectedSlashIndex((prev) => prev + 1);
                  return true;
                }
                if (props.event.key === 'Enter') {
                  const items = slashState?.items || [];
                  const activeItem = items[selectedSlashIndex] || items[0];
                  if (activeItem && slashState) {
                    slashState.command(activeItem);
                    return true;
                  }
                }
                if (props.event.key === 'Escape') {
                  setSlashState(null);
                  return true;
                }
                return false;
              },
              onExit: () => {
                setSlashState(null);
                setSelectedSlashIndex(0);
              }
            };
          }
        }
      })
    ],
    content: initialContent || '',
    editorProps: {
      attributes: {
        class:
          'prose-editorial font-serif text-lg leading-relaxed focus:outline-none min-h-[420px] max-w-none text-[var(--text-primary)] cursor-text select-text p-4 sm:p-6'
      }
    },
    onUpdate: ({ editor: ed }) => {
      if (onChange) {
        const md = ed.storage.markdown?.getMarkdown?.() ?? ed.getMarkdown?.() ?? '';
        onChange(md);
      }
    }
  });

  // Sync initialContent if it changes from external sources (e.g. entry load or mode toggle)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (initialContent !== undefined) {
      const currentMd = editor.storage.markdown?.getMarkdown?.() ?? editor.getMarkdown?.() ?? '';
      if (initialContent !== currentMd) {
        editor.commands.setContent(initialContent || '', { contentType: 'markdown' });
      }
    }
  }, [editor, initialContent]);

  // Expose imperative methods to parent (e.g. Editor.jsx)
  useImperativeHandle(ref, () => ({
    getMarkdown: () => {
      if (!editor) return '';
      return editor.storage.markdown?.getMarkdown?.() ?? editor.getMarkdown?.() ?? '';
    },
    setContent: (md) => {
      if (editor && !editor.isDestroyed) {
        editor.commands.setContent(md || '', { contentType: 'markdown' });
      }
    },
    insertMediaImage: ({ src, alt, size, align, caption }) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'mediaImage',
          attrs: {
            src,
            alt: alt || '',
            size: size || '',
            align: align || '',
            caption: caption || ''
          }
        })
        .run();
    },
    insertVideoEmbed: (src) => {
      if (!editor || !src) return;
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'videoEmbed',
          attrs: { src: src.trim() }
        })
        .run();
    },
    insertText: (text) => {
      if (!editor || !text) return;
      editor.chain().focus().insertContent(text).run();
    },
    openSlashMenu: () => {
      if (!editor || editor.isDestroyed) return;
      editor.chain().focus().insertContent('/').run();
    },
    get commands() {
      try {
        return (editor && !editor.isDestroyed) ? editor.commands : {};
      } catch {
        return {};
      }
    },
    get editor() {
      return editor;
    }
  }));

  // Listen for custom trigger events from slash commands or external buttons
  useEffect(() => {
    const handleMediaPickerOpen = () => {
      if (onOpenMediaPicker) onOpenMediaPicker();
    };
    const handleVideoDialogOpen = () => {
      setShowVideoPrompt(true);
    };

    window.addEventListener('editor-open-media-picker', handleMediaPickerOpen);
    window.addEventListener('editor-open-video-dialog', handleVideoDialogOpen);
    return () => {
      window.removeEventListener('editor-open-media-picker', handleMediaPickerOpen);
      window.removeEventListener('editor-open-video-dialog', handleVideoDialogOpen);
    };
  }, [onOpenMediaPicker]);

  // Update selection-dependent UI: Bubble Menu and Image Selection Toolbar
  const updatePopups = useCallback(() => {
    if (!editor) return;

    const { state } = editor;
    const { selection } = state;
    const isTextSelected = !selection.empty;

    // Check if a mediaImage node is selected
    let activeMediaImage = null;
    state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
      if (node.type.name === 'mediaImage') {
        activeMediaImage = { node, pos, attrs: node.attrs };
      }
    });
    setSelectedImageNode(activeMediaImage);

    // Position Bubble Menu if text is selected
    if (isTextSelected && !activeMediaImage && bubbleMenuRef.current) {
      const virtualElement = {
        getBoundingClientRect: () => {
          const domSelection = window.getSelection();
          if (domSelection && domSelection.rangeCount > 0) {
            return domSelection.getRangeAt(0).getBoundingClientRect();
          }
          return { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0 };
        }
      };

      computePosition(virtualElement, bubbleMenuRef.current, {
        placement: 'top',
        middleware: [offset(8), flip(), shift({ padding: 8 })]
      }).then(({ x, y }) => {
        if (bubbleMenuRef.current) {
          bubbleMenuRef.current.style.left = `${x}px`;
          bubbleMenuRef.current.style.top = `${y}px`;
          bubbleMenuRef.current.style.display = 'flex';
        }
      });
    } else if (bubbleMenuRef.current) {
      bubbleMenuRef.current.style.display = 'none';
      if (!isTextSelected) setShowLinkPrompt(false);
    }

    // Position Image Toolbar if image is selected
    if (activeMediaImage && imageToolbarRef.current) {
      const domNode = editor.view.nodeDOM(activeMediaImage.pos);
      if (domNode && domNode.getBoundingClientRect) {
        computePosition(domNode, imageToolbarRef.current, {
          placement: 'top',
          middleware: [offset(10), flip(), shift({ padding: 8 })]
        }).then(({ x, y }) => {
          if (imageToolbarRef.current) {
            imageToolbarRef.current.style.left = `${x}px`;
            imageToolbarRef.current.style.top = `${y}px`;
            imageToolbarRef.current.style.display = 'flex';
          }
        });
      }
    } else if (imageToolbarRef.current) {
      imageToolbarRef.current.style.display = 'none';
      setEditingCaption(false);
    }

    // Position Slash Menu if active
    if (slashState && slashMenuRef.current && slashState.clientRect) {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
      if (isMobile) {
        slashMenuRef.current.style.position = 'fixed';
        slashMenuRef.current.style.left = '12px';
        slashMenuRef.current.style.right = '12px';
        slashMenuRef.current.style.bottom = '12px';
        slashMenuRef.current.style.top = 'auto';
        slashMenuRef.current.style.width = 'auto';
        slashMenuRef.current.style.maxWidth = 'calc(100vw - 24px)';
        slashMenuRef.current.style.maxHeight = '42vh';
        slashMenuRef.current.style.display = 'block';
      } else {
        const virtualElement = {
          getBoundingClientRect: slashState.clientRect
        };
        computePosition(virtualElement, slashMenuRef.current, {
          placement: 'bottom-start',
          middleware: [offset(6), flip(), shift({ padding: 8 })]
        }).then(({ x, y }) => {
          if (slashMenuRef.current) {
            slashMenuRef.current.style.position = 'fixed';
            slashMenuRef.current.style.left = `${x}px`;
            slashMenuRef.current.style.top = `${y}px`;
            slashMenuRef.current.style.right = 'auto';
            slashMenuRef.current.style.bottom = 'auto';
            slashMenuRef.current.style.width = '';
            slashMenuRef.current.style.maxWidth = '';
            slashMenuRef.current.style.maxHeight = '20rem';
            slashMenuRef.current.style.display = 'block';
          }
        });
      }
    } else if (slashMenuRef.current) {
      slashMenuRef.current.style.display = 'none';
    }
  }, [editor, slashState]);

  useEffect(() => {
    if (!editor) return;
    editor.on('selectionUpdate', updatePopups);
    editor.on('transaction', updatePopups);
    return () => {
      editor.off('selectionUpdate', updatePopups);
      editor.off('transaction', updatePopups);
    };
  }, [editor, updatePopups]);

  // Image actions
  const setImageAttribute = (key, value) => {
    if (!editor || !selectedImageNode) return;
    const newAttrs = { ...selectedImageNode.attrs, [key]: value };
    editor
      .chain()
      .focus()
      .setNodeSelection(selectedImageNode.pos)
      .updateAttributes('mediaImage', newAttrs)
      .run();
  };

  const deleteSelectedImage = () => {
    if (!editor || !selectedImageNode) return;
    editor
      .chain()
      .focus()
      .setNodeSelection(selectedImageNode.pos)
      .deleteSelection()
      .run();
    setSelectedImageNode(null);
  };

  // Link actions
  const handleApplyLink = () => {
    if (!editor) return;
    if (!linkUrl.trim()) {
      editor.chain().focus().unsetLink().run();
      setShowLinkPrompt(false);
      return;
    }
    let href = linkUrl.trim();
    if (!/^(https?:\/\/|mailto:|tel:|\/)/i.test(href)) {
      href = `https://${href}`;
    }
    editor.chain().focus().setLink({ href }).run();
    setShowLinkPrompt(false);
    setLinkUrl('');
  };

  // Video embed action
  const handleInsertVideo = () => {
    if (!videoUrlInput.trim() || !editor) {
      setShowVideoPrompt(false);
      return;
    }
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'videoEmbed',
        attrs: { src: videoUrlInput.trim() }
      })
      .run();
    setVideoUrlInput('');
    setShowVideoPrompt(false);
  };

  if (!editor) {
    return (
      <div className="py-12 text-center text-xs font-sans text-[var(--text-muted)] italic">
        Initializing visual block editor...
      </div>
    );
  }

  const slashItems = slashState?.items || [];

  return (
    <div ref={containerRef} className="relative visual-editor-root">
      {/* TipTap Document Viewport */}
      <div className="border border-[var(--border-subtle)] rounded-lg bg-[var(--card-bg)] shadow-xs transition-colors focus-within:border-[var(--accent-warm)]">
        <EditorContent editor={editor} />
      </div>

      {/* Floating Bubble Menu for Text Formatting */}
      <div
        ref={bubbleMenuRef}
        style={{ display: 'none', position: 'fixed', zIndex: 100 }}
        className="flex items-center gap-0.5 p-1 rounded-lg bg-[var(--card-bg)] border border-[var(--border-subtle)] shadow-xl text-xs backdrop-blur-md"
      >
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 ${
            editor.isActive('bold') ? 'text-[var(--accent-warm)] font-bold' : 'text-[var(--text-primary)]'
          }`}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 ${
            editor.isActive('italic') ? 'text-[var(--accent-warm)] italic' : 'text-[var(--text-primary)]'
          }`}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 ${
            editor.isActive('strike') ? 'text-[var(--accent-warm)] line-through' : 'text-[var(--text-primary)]'
          }`}
          title="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={`p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 ${
            editor.isActive('code') ? 'text-[var(--accent-warm)] font-mono' : 'text-[var(--text-primary)]'
          }`}
          title="Inline Code"
        >
          <Code className="w-4 h-4" />
        </button>

        <span className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 ${
            editor.isActive('heading', { level: 2 }) ? 'text-[var(--accent-warm)] font-semibold' : 'text-[var(--text-primary)]'
          }`}
          title="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 ${
            editor.isActive('heading', { level: 3 }) ? 'text-[var(--accent-warm)] font-semibold' : 'text-[var(--text-primary)]'
          }`}
          title="Heading 3"
        >
          <Heading3 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 ${
            editor.isActive('blockquote') ? 'text-[var(--accent-warm)]' : 'text-[var(--text-primary)]'
          }`}
          title="Blockquote"
        >
          <Quote className="w-4 h-4" />
        </button>

        <span className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1" />

        <button
          type="button"
          onClick={() => {
            const previousUrl = editor.getAttributes('link').href || '';
            setLinkUrl(previousUrl);
            setShowLinkPrompt(true);
          }}
          className={`p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 ${
            editor.isActive('link') ? 'text-[var(--accent-warm)]' : 'text-[var(--text-primary)]'
          }`}
          title="Link"
        >
          <LinkIcon className="w-4 h-4" />
        </button>

        {showLinkPrompt && (
          <div className="absolute top-full left-0 mt-2 p-2 rounded-lg bg-[var(--card-bg)] border border-[var(--border-subtle)] shadow-2xl flex items-center gap-1.5 min-w-[280px]">
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleApplyLink();
                } else if (e.key === 'Escape') {
                  setShowLinkPrompt(false);
                }
              }}
              placeholder="Paste URL (https://...)"
              autoFocus
              className="quiet-input text-xs py-1 px-2 flex-1 font-sans"
            />
            <button
              type="button"
              onClick={handleApplyLink}
              className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[var(--accent-warm)]"
              title="Save Link"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowLinkPrompt(false)}
              className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-muted)]"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Floating Toolbar for Selected Image */}
      {selectedImageNode && (
        <div
          ref={imageToolbarRef}
          style={{ display: 'none', position: 'fixed', zIndex: 110 }}
          className="flex flex-col gap-2 p-2 rounded-lg bg-[var(--card-bg)] border border-[var(--border-subtle)] shadow-2xl backdrop-blur-md min-w-[280px]"
        >
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5 gap-2">
            <span className="text-[11px] font-sans font-medium text-[var(--text-muted)] uppercase tracking-wider">
              Photo Settings
            </span>
            <button
              type="button"
              onClick={deleteSelectedImage}
              className="p-1 rounded text-red-500 hover:bg-red-500/10 flex items-center gap-1 text-[11px] font-sans"
              title="Delete Photo"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove</span>
            </button>
          </div>

          {/* Size choices */}
          <div className="flex items-center gap-1 text-xs font-sans">
            <span className="text-[11px] text-[var(--text-muted)] w-10">Size:</span>
            {[
              { label: 'S', value: 'small' },
              { label: 'M', value: 'medium' },
              { label: 'L', value: 'large' },
              { label: 'Full', value: 'full' }
            ].map(({ label, value }) => (
              <button
                key={value}
                type="button"
                onClick={() => setImageAttribute('size', selectedImageNode.attrs.size === value ? '' : value)}
                className={`px-2 py-1 min-h-[32px] rounded text-xs font-medium cursor-pointer transition-colors ${
                  selectedImageNode.attrs.size === value
                    ? 'bg-[var(--text-primary)] text-[var(--bg-main)]'
                    : 'hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-secondary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Align choices */}
          <div className="flex items-center gap-1 text-xs font-sans">
            <span className="text-[11px] text-[var(--text-muted)] w-10">Align:</span>
            {[
              { label: 'Left', value: 'left', icon: AlignLeft },
              { label: 'Center', value: 'center', icon: AlignCenter },
              { label: 'Right', value: 'right', icon: AlignRight }
            ].map(({ label, value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setImageAttribute('align', selectedImageNode.attrs.align === value ? '' : value)}
                className={`p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded cursor-pointer transition-colors ${
                  selectedImageNode.attrs.align === value
                    ? 'bg-[var(--text-primary)] text-[var(--bg-main)]'
                    : 'hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-secondary)]'
                }`}
                title={`Align ${label}`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          {/* Caption editor */}
          <div className="pt-1 border-t border-[var(--border-subtle)]">
            {editingCaption ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={captionInput}
                  onChange={(e) => setCaptionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setImageAttribute('caption', captionInput);
                      setEditingCaption(false);
                    } else if (e.key === 'Escape') {
                      setEditingCaption(false);
                    }
                  }}
                  placeholder="Type caption..."
                  autoFocus
                  className="quiet-input text-xs py-1 px-2 flex-1 font-sans"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImageAttribute('caption', captionInput);
                    setEditingCaption(false);
                  }}
                  className="p-1 rounded text-[var(--accent-warm)]"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCaptionInput(selectedImageNode.attrs.caption || '');
                  setEditingCaption(true);
                }}
                className="text-[11px] text-[var(--accent-warm)] hover:underline font-sans"
              >
                {selectedImageNode.attrs.caption ? `Caption: "${selectedImageNode.attrs.caption}"` : '+ Add Caption'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Slash Command Palette */}
      {slashState && (
        <div
          ref={slashMenuRef}
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.stopPropagation()}
          style={{ display: 'none', position: 'fixed', zIndex: 120 }}
          className="w-full sm:w-72 max-h-80 overflow-y-auto p-1.5 rounded-xl bg-[var(--card-bg)] border border-[var(--border-subtle)] shadow-2xl backdrop-blur-lg font-sans"
        >
          <div className="flex items-center justify-between text-[10px] font-sans font-medium uppercase tracking-wider text-[var(--text-muted)] px-3 py-1.5 border-b border-[var(--border-subtle)] mb-1">
            <span>Insert Block</span>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setSlashState(null);
              }}
              onClick={(e) => {
                e.preventDefault();
                setSlashState(null);
              }}
              className="sm:hidden text-xs text-[var(--text-muted)] p-1 hover:text-[var(--text-primary)]"
            >
              ✕
            </button>
          </div>
          {slashItems.length === 0 ? (
            <div className="px-3 py-4 text-xs text-[var(--text-muted)] text-center italic">
              No matching commands
            </div>
          ) : (
            slashItems.map((item, idx) => (
              <button
                key={item.title}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  slashState.command(item);
                }}
                onClick={(e) => {
                  e.preventDefault();
                  slashState.command(item);
                }}
                className={`w-full min-h-[44px] px-3 py-2 rounded-lg flex items-center gap-3 text-left transition-colors cursor-pointer ${
                  idx === selectedSlashIndex
                    ? 'bg-black/10 dark:bg-white/10 text-[var(--text-primary)] font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <div className="w-7 h-7 rounded flex items-center justify-center bg-black/5 dark:bg-white/5 text-[var(--accent-warm)] shrink-0">
                  <span className="text-xs font-mono">{idx + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-[var(--text-primary)] leading-tight">
                    {item.title}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] truncate leading-tight mt-0.5">
                    {item.description}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Video URL Prompt Modal */}
      {showVideoPrompt && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[200] p-4">
          <div className="w-full max-w-md p-6 rounded-xl bg-[var(--card-bg)] border border-[var(--border-subtle)] shadow-2xl">
            <h3 className="text-sm font-sans font-medium mb-1">Embed Video</h3>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Enter a YouTube link (e.g. https://www.youtube.com/watch?v=...) or a direct MP4/WebM video URL.
            </p>
            <input
              type="url"
              value={videoUrlInput}
              onChange={(e) => setVideoUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleInsertVideo();
                if (e.key === 'Escape') setShowVideoPrompt(false);
              }}
              placeholder="https://..."
              autoFocus
              className="quiet-input text-xs w-full py-2 px-3 font-sans mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowVideoPrompt(false)}
                className="px-3 py-1.5 rounded text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInsertVideo}
                className="quiet-button text-xs px-4 py-1.5 font-medium"
              >
                Embed Video
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default VisualEditor;
