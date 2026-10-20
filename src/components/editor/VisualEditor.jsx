import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Placeholder } from '@tiptap/extension-placeholder';
import { computePosition, offset, flip, shift } from '@floating-ui/dom';
import { customEditorialExtensions } from './extensions/index.js';
import { SlashCommands } from './slashCommands.js';
import { NodeSelection } from '@tiptap/pm/state';
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
  X,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  GripHorizontal
} from 'lucide-react';

const VisualEditor = forwardRef(function VisualEditor(
  {
    initialContent = '',
    onChange,
    onOpenMediaPicker,
    placeholder = "Write with clarity... (Type '/' for commands)",
    mode = 'visual'
  },
  ref
) {
  const containerRef = useRef(null);
  const bubbleMenuRef = useRef(null);
  const slashMenuRef = useRef(null);
  const imageToolbarRef = useRef(null);
  const replacingImagePosRef = useRef(null);

  // Dragging and positioning state for image floating toolbar
  const isUserDraggedRef = useRef(false);
  const lastSelectedPosRef = useRef(null);
  const dragStartRef = useRef({ startX: 0, startY: 0, initialLeft: 0, initialTop: 0 });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [slashState, setSlashState] = useState(null);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [showLinkPrompt, setShowLinkPrompt] = useState(false);
  const showLinkPromptRef = useRef(false);
  showLinkPromptRef.current = showLinkPrompt;
  const savedLinkRangeRef = useRef(null);
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
      },
      handleClick: (view, pos, event) => {
        const target = event?.target;
        if (!target) return false;

        const imgEl = target.tagName === 'IMG'
          ? target
          : (target.querySelector?.('img') ||
             target.closest?.('figure, [data-node-type="mediaImage"], .media-image-block, .media-figure')?.querySelector?.('img'));
        const containerEl = target.closest?.('[data-node-type="mediaImage"], .media-image-block, .media-figure, figure');
        if (!imgEl && !containerEl) return false;

        const src = imgEl?.getAttribute('src');
        // Helper: any image node type
        const isImgNode = (n) => n?.type?.name === 'mediaImage' || n?.type?.name === 'inlineImage';
        let targetPos = null;

        // Method 0: Use ProseMirror's pos parameter directly — most accurate for atom nodes
        if (typeof pos === 'number' && pos >= 0) {
          try {
            for (const p of [pos, Math.max(0, pos - 1)]) {
              const n = view.state.doc.nodeAt(p);
              if (n && isImgNode(n)) { targetPos = p; break; }
            }
            if (targetPos === null) {
              const $p = view.state.doc.resolve(pos);
              if (isImgNode($p.nodeAfter)) { targetPos = pos; }
              else {
                for (let d = $p.depth; d >= 0; d--) {
                  if (isImgNode($p.node(d))) { targetPos = $p.before(d); break; }
                }
              }
            }
          } catch (_e) {}
        }

        // Method 1: Find by matching src in document
        if (targetPos === null && src) {
          const candidates = [];
          view.state.doc.descendants((node, p) => {
            if (isImgNode(node) && node.attrs.src === src) candidates.push(p);
          });
          if (candidates.length === 1) {
            targetPos = candidates[0];
          } else if (candidates.length > 1) {
            const res = view.posAtCoords({ left: event.clientX, top: event.clientY });
            const clickPos = res ? (res.inside >= 0 ? res.inside : res.pos) : pos;
            candidates.sort((a, b) => Math.abs(a - clickPos) - Math.abs(b - clickPos));
            targetPos = candidates[0];
          }
        }

        // Method 2: Coordinate resolution
        if (targetPos === null) {
          try {
            const res = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (res) {
              const resolved = res.inside >= 0 ? res.inside : res.pos;
              const $pos = view.state.doc.resolve(resolved);
              for (let d = $pos.depth; d >= 0; d--) {
                if (isImgNode($pos.node(d))) { targetPos = $pos.before(d); break; }
              }
              if (targetPos === null && isImgNode($pos.nodeAfter)) targetPos = $pos.pos;
            }
          } catch (_e) {}
        }

        // Method 3: DOM position resolution
        if (targetPos === null && (containerEl || imgEl)) {
          try {
            const domTarget = containerEl || imgEl;
            const p = view.posAtDOM(domTarget, 0);
            if (typeof p === 'number' && p >= 0) {
              const $pos = view.state.doc.resolve(p);
              for (let d = $pos.depth; d >= 0; d--) {
                if (isImgNode($pos.node(d))) { targetPos = $pos.before(d); break; }
              }
              if (targetPos === null && isImgNode($pos.nodeAfter)) targetPos = p;
            }
          } catch (_e) {}
        }

        if (typeof targetPos === 'number' && targetPos >= 0) {
          try {
            const nodeAtPos = view.state.doc.nodeAt(targetPos);
            if (nodeAtPos && isImgNode(nodeAtPos)) {
              const sel = NodeSelection.create(view.state.doc, targetPos);
              view.dom.setAttribute('inputmode', 'none');
              view.dispatch(view.state.tr.setSelection(sel));
              view.focus();
              return true;
            }
          } catch (err) {
            console.warn('Failed to set NodeSelection on image:', err);
          }
        }
        return false;
      }
    },
    onUpdate: ({ editor: ed }) => {
      if (onChangeRef.current && (modeRef.current === 'visual' || modeRef.current === 'split')) {
        const md = ed.storage.markdown?.getMarkdown?.() ?? ed.getMarkdown?.() ?? '';
        onChangeRef.current(md);
      }
    }
  });

  // Sync initialContent if it changes from external sources (e.g. entry load or mode toggle)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    // CRITICAL: When in markdown mode, do not sync or overwrite content on every keystroke
    if (mode !== 'visual' && mode !== 'split') return;
    if (initialContent !== undefined) {
      const currentMd = editor.storage.markdown?.getMarkdown?.() ?? editor.getMarkdown?.() ?? '';
      if (initialContent !== currentMd) {
        editor.commands.setContent(initialContent || '', { contentType: 'markdown' });
      }
    }
  }, [editor, initialContent, mode]);

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
    getSelectedImageInfo: () => {
      return selectedImageNode;
    },
    insertMediaImage: ({ src, alt, size, align, caption }) => {
      if (!editor) return;
      if (replacingImagePosRef.current !== null && replacingImagePosRef.current !== undefined) {
        const pos = replacingImagePosRef.current;
        replacingImagePosRef.current = null;
        const existingNode = editor.state.doc.nodeAt(pos);
        if (existingNode && (existingNode.type.name === 'mediaImage' || existingNode.type.name === 'inlineImage')) {
          if (existingNode.type.name === 'mediaImage') {
            editor
              .chain()
              .focus()
              .setNodeSelection(pos)
              .updateAttributes('mediaImage', {
                src,
                alt: alt !== undefined && alt !== '' ? alt : (existingNode.attrs.alt || ''),
                size: size !== undefined && size !== '' ? size : (existingNode.attrs.size || ''),
                align: align !== undefined && align !== '' ? align : (existingNode.attrs.align || ''),
                caption: caption !== undefined ? caption : (existingNode.attrs.caption || '')
              })
              .run();
          } else {
            // inlineImage: upgrade to a full mediaImage block when replacing
            editor
              .chain()
              .focus()
              .setNodeSelection(pos)
              .insertContent({ type: 'mediaImage', attrs: { src, alt: alt || existingNode.attrs.alt || '', size: size || '', align: align || '', caption: caption || '' } })
              .run();
          }
          return;
        }
      }
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

  // Helper to accurately position the Image Toolbar above the selected photo
  const positionImageToolbar = useCallback((imageInfo) => {
    // If user has explicitly dragged the toolbar with hand/mouse, do not auto-reposition!
    if (isUserDraggedRef.current) return;

    const targetImage = imageInfo || selectedImageNode;
    if (!editor || !targetImage || !imageToolbarRef.current) {
      if (imageToolbarRef.current && !selectedImageNode) {
        imageToolbarRef.current.style.display = 'none';
      }
      return;
    }

    let domNode = editor.view.nodeDOM(targetImage.pos);
    if (!domNode || !domNode.getBoundingClientRect) {
      const imgEl = editor.view.dom.querySelector(`img[src="${targetImage.attrs.src}"]`);
      domNode = imgEl?.closest?.('[data-node-type="mediaImage"], .media-figure, .media-image-block') || imgEl;
    }

    if (domNode && domNode.getBoundingClientRect) {
      computePosition(domNode, imageToolbarRef.current, {
        strategy: 'fixed', // toolbar is position:fixed — must use fixed strategy for correct coords at any scroll depth
        placement: 'top',
        middleware: [offset(10), flip(), shift({ padding: 8 })]
      }).then(({ x, y }) => {
        if (imageToolbarRef.current && !isUserDraggedRef.current) {
          imageToolbarRef.current.style.left = `${Math.round(x)}px`;
          imageToolbarRef.current.style.top = `${Math.round(y)}px`;
          imageToolbarRef.current.style.display = 'flex';
        }
      });
    }
  }, [editor, selectedImageNode]);

  // Position image toolbar immediately when selectedImageNode changes
  useEffect(() => {
    if (selectedImageNode) {
      // If user selected a new or different image, reset drag so toolbar auto-anchors to it
      if (lastSelectedPosRef.current !== selectedImageNode.pos) {
        isUserDraggedRef.current = false;
        lastSelectedPosRef.current = selectedImageNode.pos;
      }
      if (!isUserDraggedRef.current) {
        requestAnimationFrame(() => {
          positionImageToolbar(selectedImageNode);
        });
      } else if (imageToolbarRef.current) {
        imageToolbarRef.current.style.display = 'flex';
      }
    } else {
      lastSelectedPosRef.current = null;
      isUserDraggedRef.current = false;
      if (imageToolbarRef.current) {
        imageToolbarRef.current.style.display = 'none';
        setEditingCaption(false);
      }
    }
  }, [selectedImageNode, positionImageToolbar]);

  // Combined mobile touch handler:
  //   touchstart  → detect image target early → set inputmode=none to suppress keyboard
  //   touchend    → if image was touched, create NodeSelection (more reliable than handleClick on mobile)
  //   effect body → sync inputmode from React state each time selectedImageNode changes
  useEffect(() => {
    // TipTap v3: before the view mounts, editor.view is a proxy that THROWS
    // when .dom is accessed — optional chaining does not protect against it.
    let dom = null;
    try {
      dom = editor?.view?.dom ?? null;
    } catch {
      dom = null;
    }
    if (!dom) return;

    // Sync inputmode from current state
    if (selectedImageNode) {
      dom.setAttribute('inputmode', 'none');
    } else {
      dom.removeAttribute('inputmode');
    }

    let imageTouchSrc = null; // src captured on touchstart

    const onTouchStart = (e) => {
      const t = e.target;
      const imgEl = t.tagName === 'IMG' ? t
        : t.closest?.('[data-node-type="mediaImage"], .media-image-block, .media-figure, figure')?.querySelector?.('img');
      if (imgEl) {
        imageTouchSrc = imgEl.getAttribute('src') || null;
        dom.setAttribute('inputmode', 'none'); // suppress keyboard before focus fires
      } else {
        imageTouchSrc = null;
        if (!selectedImageNode) dom.removeAttribute('inputmode');
      }
    };

    const onTouchEnd = () => {
      const src = imageTouchSrc;
      imageTouchSrc = null;
      if (!src || !editor) return;
      // Find node by src (handles both mediaImage and inlineImage)
      let targetPos = null;
      editor.state.doc.descendants((node, p) => {
        if (targetPos !== null) return false;
        if ((node.type.name === 'mediaImage' || node.type.name === 'inlineImage') && node.attrs.src === src) {
          targetPos = p;
        }
      });
      if (typeof targetPos === 'number' && targetPos >= 0) {
        try {
          const nodeAtPos = editor.state.doc.nodeAt(targetPos);
          if (nodeAtPos && (nodeAtPos.type.name === 'mediaImage' || nodeAtPos.type.name === 'inlineImage')) {
            const sel = NodeSelection.create(editor.state.doc, targetPos);
            dom.setAttribute('inputmode', 'none');
            editor.view.dispatch(editor.state.tr.setSelection(sel));
            editor.view.focus();
          }
        } catch (_e) {}
      }
    };

    dom.addEventListener('touchstart', onTouchStart, { passive: true });
    dom.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      dom.removeEventListener('touchstart', onTouchStart);
      dom.removeEventListener('touchend', onTouchEnd);
    };
  }, [editor, selectedImageNode]);

  // Keep image toolbar positioned when scrolling or resizing (without flickering or vanishing!)
  useEffect(() => {
    if (!selectedImageNode) return;
    let ticking = false;
    const handleReposition = () => {
      if (isUserDraggedRef.current) return;
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (!isUserDraggedRef.current && selectedImageNode) {
            positionImageToolbar(selectedImageNode);
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleReposition, { passive: true, capture: true });
    window.addEventListener('resize', handleReposition, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [selectedImageNode, positionImageToolbar]);

  // Pointer drag handlers for freely moving the toolbar via touch or mouse
  const handleToolbarPointerDown = (e) => {
    if (e.target.closest('button, input, textarea, a')) return;
    const el = imageToolbarRef.current;
    if (!el) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = el.getBoundingClientRect();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialLeft: rect.left,
      initialTop: rect.top
    };

    setIsDraggingToolbar(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_err) {}
  };

  const handleToolbarPointerMove = (e) => {
    if (!isDraggingToolbar || !imageToolbarRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;

    const el = imageToolbarRef.current;
    const rect = el.getBoundingClientRect();
    const width = rect.width || 280;
    const height = rect.height || 140;

    let newLeft = dragStartRef.current.initialLeft + deltaX;
    let newTop = dragStartRef.current.initialTop + deltaY;

    // Clamp strictly within viewport margins
    newLeft = Math.max(8, Math.min(window.innerWidth - width - 8, newLeft));
    newTop = Math.max(8, Math.min(window.innerHeight - height - 8, newTop));

    el.style.left = `${Math.round(newLeft)}px`;
    el.style.top = `${Math.round(newTop)}px`;
    el.style.display = 'flex';
    isUserDraggedRef.current = true;
  };

  const handleToolbarPointerUp = (e) => {
    if (isDraggingToolbar) {
      setIsDraggingToolbar(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_err) {}
    }
  };

  // Touch drag handlers specifically optimized for mobile touchscreens
  const handleTouchStart = (e) => {
    if (e.target.closest('button, input, textarea, a')) return;
    const touch = e.touches[0];
    if (!touch) return;
    const el = imageToolbarRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    dragStartRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      initialLeft: rect.left,
      initialTop: rect.top
    };

    setIsDraggingToolbar(true);
    e.stopPropagation();
  };

  const handleTouchMove = (e) => {
    if (!isDraggingToolbar || !imageToolbarRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();

    const deltaX = touch.clientX - dragStartRef.current.startX;
    const deltaY = touch.clientY - dragStartRef.current.startY;

    const el = imageToolbarRef.current;
    const rect = el.getBoundingClientRect();
    const width = rect.width || 280;
    const height = rect.height || 140;

    let newLeft = dragStartRef.current.initialLeft + deltaX;
    let newTop = dragStartRef.current.initialTop + deltaY;

    newLeft = Math.max(8, Math.min(window.innerWidth - width - 8, newLeft));
    newTop = Math.max(8, Math.min(window.innerHeight - height - 8, newTop));

    el.style.left = `${Math.round(newLeft)}px`;
    el.style.top = `${Math.round(newTop)}px`;
    el.style.display = 'flex';
    isUserDraggedRef.current = true;
  };

  const handleTouchEnd = () => {
    setIsDraggingToolbar(false);
  };

  // Update selection-dependent UI: Bubble Menu and Image Selection Toolbar
  const updatePopups = useCallback(() => {
    if (!editor) return;

    const { state } = editor;
    const { selection } = state;
    const isTextSelected = !selection.empty;

    // Check if any image node is selected (mediaImage block or inlineImage inline atom)
    let activeMediaImage = null;
    if (selection instanceof NodeSelection &&
        (selection.node?.type?.name === 'mediaImage' || selection.node?.type?.name === 'inlineImage')) {
      activeMediaImage = { node: selection.node, pos: selection.from, attrs: selection.node.attrs };
    }
    setSelectedImageNode(activeMediaImage);

    // Position Bubble Menu if text is selected
    if ((isTextSelected || showLinkPromptRef.current) && !activeMediaImage && bubbleMenuRef.current) {
      if (!showLinkPromptRef.current) {
        const virtualElement = {
          getBoundingClientRect: () => {
            const domSelection = window.getSelection();
            if (domSelection && domSelection.rangeCount > 0) {
              const rect = domSelection.getRangeAt(0).getBoundingClientRect();
              if (rect.width > 0 || rect.height > 0) return rect;
            }
            if (bubbleMenuRef.current) {
              return bubbleMenuRef.current.getBoundingClientRect();
            }
            return { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0 };
          }
        };

        computePosition(virtualElement, bubbleMenuRef.current, {
          strategy: 'fixed', // menu is position:fixed — must use fixed strategy for correct coords at any scroll depth
          placement: 'top',
          middleware: [offset(8), flip(), shift({ padding: 12 })]
        }).then(({ x, y }) => {
          if (bubbleMenuRef.current && !showLinkPromptRef.current) {
            const menuWidth = bubbleMenuRef.current.offsetWidth || 280;
            const menuH = bubbleMenuRef.current.offsetHeight || 50;
            const viewportWidth = window.innerWidth;
            const clampedX = Math.max(8, Math.min(x, viewportWidth - menuWidth - 8));
            const clampedY = Math.max(8, Math.min(y, window.innerHeight - menuH - 8));
            bubbleMenuRef.current.style.left = `${clampedX}px`;
            bubbleMenuRef.current.style.top = `${clampedY}px`;
            bubbleMenuRef.current.style.display = 'flex';
          }
        });
      }
    } else if (bubbleMenuRef.current && !showLinkPromptRef.current) {
      bubbleMenuRef.current.style.display = 'none';
      setShowLinkPrompt(false);
    }

    // Position Image Toolbar if image is selected
    if (activeMediaImage) {
      positionImageToolbar(activeMediaImage);
    } else if (imageToolbarRef.current) {
      imageToolbarRef.current.style.display = 'none';
      setEditingCaption(false);
    }

    // Position Slash Menu if active
    if (slashState && slashMenuRef.current && slashState.clientRect) {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
      if (isMobile) {
        const vp = typeof window !== 'undefined' ? window.visualViewport : null;
        const vpHeight = vp ? vp.height : window.innerHeight;
        const vpTop = vp ? vp.offsetTop : 0;
        const maxMenuH = Math.max(180, Math.min(280, vpHeight - 48));

        slashMenuRef.current.style.position = 'fixed';
        slashMenuRef.current.style.left = '16px';
        slashMenuRef.current.style.right = '16px';
        slashMenuRef.current.style.top = `${Math.round(vpTop + 16)}px`;
        slashMenuRef.current.style.bottom = 'auto';
        slashMenuRef.current.style.width = 'auto';
        slashMenuRef.current.style.maxWidth = 'calc(100vw - 32px)';
        slashMenuRef.current.style.maxHeight = `${maxMenuH}px`;
        slashMenuRef.current.style.display = 'flex';
        slashMenuRef.current.style.flexDirection = 'column';
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
            slashMenuRef.current.style.display = 'flex';
            slashMenuRef.current.style.flexDirection = 'column';
          }
        });
      }
    } else if (slashMenuRef.current) {
      slashMenuRef.current.style.display = 'none';
    }
  }, [editor, slashState, positionImageToolbar]);

  useEffect(() => {
    if (!editor) return;
    editor.on('selectionUpdate', updatePopups);
    editor.on('transaction', updatePopups);
    return () => {
      editor.off('selectionUpdate', updatePopups);
      editor.off('transaction', updatePopups);
    };
  }, [editor, updatePopups]);

  // Close link prompt if user clicks/taps outside the bubble menu
  useEffect(() => {
    if (!showLinkPrompt) return;
    const handleOutsidePointer = (e) => {
      if (bubbleMenuRef.current && !bubbleMenuRef.current.contains(e.target)) {
        savedLinkRangeRef.current = null;
        showLinkPromptRef.current = false;
        setShowLinkPrompt(false);
        setLinkUrl('');
        if (bubbleMenuRef.current) {
          bubbleMenuRef.current.style.display = 'none';
        }
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
    };
  }, [showLinkPrompt]);

  // Image actions
  const setImageAttribute = (key, value) => {
    if (!editor || !selectedImageNode) return;
    const typeName = selectedImageNode.node.type.name; // use actual type, not hardcoded 'mediaImage'
    const newAttrs = { ...selectedImageNode.attrs, [key]: value };
    editor
      .chain()
      .focus()
      .setNodeSelection(selectedImageNode.pos)
      .updateAttributes(typeName, newAttrs)
      .run();
  };

  const handleReplaceImage = () => {
    if (!selectedImageNode) return;
    replacingImagePosRef.current = selectedImageNode.pos;
    if (onOpenMediaPicker) onOpenMediaPicker();
  };

  const moveSelectedImage = (direction) => {
    if (!editor || !selectedImageNode) return;
    // Only block images (mediaImage) can be repositioned; inlineImage lives inside text
    if (selectedImageNode.node.type.name !== 'mediaImage') return;
    const { state } = editor;
    const { doc } = state;
    const pos = selectedImageNode.pos;
    const node = doc.nodeAt(pos);
    if (!node) return;

    const $pos = doc.resolve(pos);
    const index = $pos.index();
    const parent = $pos.parent;

    if (direction === 'up') {
      if (index === 0) return;
      const prevNode = parent.child(index - 1);
      const prevPos = pos - prevNode.nodeSize;
      const tr = state.tr
        .delete(pos, pos + node.nodeSize)
        .insert(prevPos, node);
      tr.setSelection(NodeSelection.create(tr.doc, prevPos));
      editor.view.dispatch(tr);
    } else if (direction === 'down') {
      if (index >= parent.childCount - 1) return;
      const nextNode = parent.child(index + 1);
      const targetPos = pos + nextNode.nodeSize;
      const tr = state.tr
        .delete(pos, pos + node.nodeSize)
        .insert(targetPos, node);
      tr.setSelection(NodeSelection.create(tr.doc, targetPos));
      editor.view.dispatch(tr);
    }
  };

  const deleteSelectedImage = () => {
    if (!editor || !selectedImageNode) return;
    if (!window.confirm('Remove this photo from the post?')) return;
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
    const range = savedLinkRangeRef.current;
    if (range && typeof range.from === 'number' && typeof range.to === 'number' && range.from !== range.to) {
      editor.commands.setTextSelection({ from: range.from, to: range.to });
    }

    if (!linkUrl.trim()) {
      editor.chain().focus().unsetLink().run();
      savedLinkRangeRef.current = null;
      showLinkPromptRef.current = false;
      setShowLinkPrompt(false);
      return;
    }
    let href = linkUrl.trim();
    if (!/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href)) {
      href = `https://${href}`;
    }
    editor.chain().focus().setLink({ href }).run();
    savedLinkRangeRef.current = null;
    showLinkPromptRef.current = false;
    setShowLinkPrompt(false);
    setLinkUrl('');
  };

  const handleCancelLink = () => {
    const range = savedLinkRangeRef.current;
    if (editor && range && typeof range.from === 'number' && typeof range.to === 'number') {
      editor.commands.setTextSelection({ from: range.from, to: range.to });
      editor.commands.focus();
    }
    savedLinkRangeRef.current = null;
    showLinkPromptRef.current = false;
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
        className="items-center gap-0.5 p-1 rounded-lg bg-[var(--card-bg)] border border-[var(--border-subtle)] shadow-xl text-xs backdrop-blur-md max-w-[calc(100vw-16px)]"
      >
        {showLinkPrompt ? (
          <div className="flex items-center gap-1.5 w-full py-0.5 px-1 min-w-[220px] sm:min-w-[280px] max-w-[calc(100vw-24px)]">
            <LinkIcon className="w-3.5 h-3.5 text-[var(--accent-warm)] shrink-0 ml-1" />
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleApplyLink();
                } else if (e.key === 'Escape') {
                  handleCancelLink();
                }
              }}
              placeholder="Paste or type URL (https://...)"
              autoFocus
              className="quiet-input text-xs py-1 px-2 flex-1 font-sans bg-transparent min-w-0"
            />
            <button
              type="button"
              onClick={handleApplyLink}
              className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[var(--accent-warm)] shrink-0"
              title="Apply Link"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleCancelLink}
              className="p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-muted)] shrink-0"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`p-1.5 sm:p-2 min-w-[30px] sm:min-w-[36px] min-h-[32px] sm:min-h-[36px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 ${
                editor.isActive('bold') ? 'text-[var(--accent-warm)] font-bold' : 'text-[var(--text-primary)]'
              }`}
              title="Bold"
            >
              <Bold className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={`p-1.5 sm:p-2 min-w-[30px] sm:min-w-[36px] min-h-[32px] sm:min-h-[36px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 ${
                editor.isActive('italic') ? 'text-[var(--accent-warm)] italic' : 'text-[var(--text-primary)]'
              }`}
              title="Italic"
            >
              <Italic className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleStrike().run()}
              className={`p-1.5 sm:p-2 min-w-[30px] sm:min-w-[36px] min-h-[32px] sm:min-h-[36px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 ${
                editor.isActive('strike') ? 'text-[var(--accent-warm)] line-through' : 'text-[var(--text-primary)]'
              }`}
              title="Strikethrough"
            >
              <Strikethrough className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleCode().run()}
              className={`p-1.5 sm:p-2 min-w-[30px] sm:min-w-[36px] min-h-[32px] sm:min-h-[36px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 ${
                editor.isActive('code') ? 'text-[var(--accent-warm)] font-mono' : 'text-[var(--text-primary)]'
              }`}
              title="Inline Code"
            >
              <Code className="w-4 h-4" />
            </button>

            <span className="w-[1px] h-4 bg-[var(--border-subtle)] mx-0.5 sm:mx-1 shrink-0" />

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={`p-1.5 sm:p-2 min-w-[30px] sm:min-w-[36px] min-h-[32px] sm:min-h-[36px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 ${
                editor.isActive('heading', { level: 2 }) ? 'text-[var(--accent-warm)] font-semibold' : 'text-[var(--text-primary)]'
              }`}
              title="Heading 2"
            >
              <Heading2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              className={`p-1.5 sm:p-2 min-w-[30px] sm:min-w-[36px] min-h-[32px] sm:min-h-[36px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 ${
                editor.isActive('heading', { level: 3 }) ? 'text-[var(--accent-warm)] font-semibold' : 'text-[var(--text-primary)]'
              }`}
              title="Heading 3"
            >
              <Heading3 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              className={`p-1.5 sm:p-2 min-w-[30px] sm:min-w-[36px] min-h-[32px] sm:min-h-[36px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 ${
                editor.isActive('blockquote') ? 'text-[var(--accent-warm)]' : 'text-[var(--text-primary)]'
              }`}
              title="Blockquote"
            >
              <Quote className="w-4 h-4" />
            </button>

            <span className="w-[1px] h-4 bg-[var(--border-subtle)] mx-0.5 sm:mx-1 shrink-0" />

            <button
              type="button"
              onClick={() => {
                const previousUrl = editor.getAttributes('link').href || '';
                const { from, to } = editor.state.selection;
                savedLinkRangeRef.current = { from, to };
                showLinkPromptRef.current = true;
                setLinkUrl(previousUrl);
                setShowLinkPrompt(true);
              }}
              className={`p-1.5 sm:p-2 min-w-[30px] sm:min-w-[36px] min-h-[32px] sm:min-h-[36px] flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 ${
                editor.isActive('link') ? 'text-[var(--accent-warm)]' : 'text-[var(--text-primary)]'
              }`}
              title="Link"
            >
              <LinkIcon className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Floating Toolbar for Selected Image */}
      <div
        ref={imageToolbarRef}
        onMouseDown={(e) => {
          if (e.target.closest('button, input, textarea')) return;
          e.preventDefault();
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{ display: 'none', position: 'fixed', zIndex: 110, touchAction: 'none' }}
        className="flex flex-col gap-2 p-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--border-subtle)] shadow-2xl backdrop-blur-md min-w-[280px] max-w-[95vw] font-sans select-none"
      >
        {selectedImageNode && (
          <>
          <div
            onPointerDown={handleToolbarPointerDown}
            onPointerMove={handleToolbarPointerMove}
            onPointerUp={handleToolbarPointerUp}
            onPointerCancel={handleToolbarPointerUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            style={{ touchAction: 'none' }}
            className={`flex flex-col border-b border-[var(--border-subtle)] pb-2 gap-1.5 select-none touch-none ${
              isDraggingToolbar ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            title="Drag with finger or mouse to move anywhere"
          >
            {/* Obvious tactile drag pill for mobile fingers */}
            <div className="w-12 h-1 rounded-full bg-[var(--text-muted)] opacity-40 mx-auto cursor-grab" />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-sans font-medium text-[var(--text-muted)] uppercase tracking-wider">
                <GripHorizontal className="w-4 h-4 text-[var(--text-muted)] opacity-70" />
                <span>Photo</span>
              </div>
              <div className="flex items-center gap-1">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  moveSelectedImage('up');
                }}
                className="p-1 px-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 flex items-center gap-1 text-[11px] font-sans text-[var(--text-primary)] cursor-pointer"
                title="Move Photo Up"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Up</span>
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  moveSelectedImage('down');
                }}
                className="p-1 px-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 flex items-center gap-1 text-[11px] font-sans text-[var(--text-primary)] cursor-pointer"
                title="Move Photo Down"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Down</span>
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleReplaceImage();
                }}
                className="p-1 px-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[var(--accent-warm)] flex items-center gap-1 text-[11px] font-sans font-medium cursor-pointer"
                title="Replace with another photo from library"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Change</span>
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  deleteSelectedImage();
                }}
                className="p-1 px-1.5 rounded text-red-500 hover:bg-red-500/10 flex items-center gap-1 text-[11px] font-sans cursor-pointer"
                title="Delete Photo"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Remove</span>
              </button>
            </div>
          </div>
          </div>

          {/* Size choices — block images only */}
          {selectedImageNode.node.type.name === 'mediaImage' && (
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
                onMouseDown={(e) => {
                  e.preventDefault();
                  setImageAttribute('size', selectedImageNode.attrs.size === value ? '' : value);
                }}
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
          )}

          {/* Align choices — block images only */}
          {selectedImageNode.node.type.name === 'mediaImage' && (
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
                onMouseDown={(e) => {
                  e.preventDefault();
                  setImageAttribute('align', selectedImageNode.attrs.align === value ? '' : value);
                }}
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
          )}

          {/* Caption editor — block images only */}
          {selectedImageNode.node.type.name === 'mediaImage' && (
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
          )}
        </>
      )}
    </div>

      {/* Floating Slash Command Palette */}
      {slashState && (
        <div
          ref={slashMenuRef}
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.stopPropagation()}
          style={{ display: 'none', position: 'fixed', zIndex: 120 }}
          className="w-full sm:w-72 max-h-80 flex flex-col p-1.5 rounded-xl bg-[var(--card-bg)] border border-[var(--border-subtle)] shadow-2xl backdrop-blur-lg font-sans"
        >
          <div className="flex items-center justify-between text-[10px] font-sans font-medium uppercase tracking-wider text-[var(--text-muted)] px-3 py-1.5 border-b border-[var(--border-subtle)] mb-1 shrink-0">
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
              className="text-xs text-[var(--text-muted)] p-1 hover:text-[var(--text-primary)] cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="overflow-y-auto flex-1 overscroll-contain pr-1">
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
