import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useLocation } from 'react-router-dom';

let lockCount = 0;
let savedOverflow = '';
let savedPaddingRight = '';

export default function Modal({
  isOpen,
  onClose,
  children,
  title,
  maxWidthClass,
  ariaLabel
}) {
  const modalRef = useRef(null);
  const previousActiveElement = useRef(null);
  const location = useLocation();

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Route change cleanup: close modal only when location.pathname actually changes
  const prevPathname = useRef(location.pathname);
  useEffect(() => {
    if (prevPathname.current !== location.pathname) {
      prevPathname.current = location.pathname;
      if (isOpen && onCloseRef.current) {
        onCloseRef.current();
      }
    }
  }, [location.pathname, isOpen]);

  // Scroll lock & Focus trap management
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElement.current = document.activeElement;

    // Apply scroll lock
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow;
      savedPaddingRight = document.body.style.paddingRight;
      
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      document.body.style.overflow = 'hidden';
    }
    lockCount++;

    // Focus modal container directly (prevents initial button focus flashing)
    if (modalRef.current) {
      modalRef.current.focus({ preventScroll: true });
    }

    // Escape key listener
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter(el => !el.hasAttribute('disabled'));

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl || document.activeElement === modalRef.current) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.style.overflow = savedOverflow;
        document.body.style.paddingRight = savedPaddingRight;
      }

      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title || ariaLabel || 'Dialog'}
        className={`modal-card ${maxWidthClass || ''}`}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
