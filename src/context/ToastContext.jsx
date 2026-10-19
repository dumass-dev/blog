import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 3500) => {
    if (!message) return;
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newToast = { id, message, type, duration };

    setToasts((prev) => [...prev.slice(-3), newToast]); // Keep max 4 visible

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  // Global event listener so non-context code can trigger toasts via window.dispatchEvent
  useEffect(() => {
    const handleGlobalToast = (e) => {
      const { message, type, duration } = e.detail || {};
      if (message) {
        addToast(message, type, duration);
      }
    };
    window.addEventListener('app-toast', handleGlobalToast);
    return () => window.removeEventListener('app-toast', handleGlobalToast);
  }, [addToast]);

  const success = useCallback((msg, duration) => addToast(msg, 'success', duration), [addToast]);
  const error = useCallback((msg, duration) => addToast(msg, 'error', duration), [addToast]);
  const info = useCallback((msg, duration) => addToast(msg, 'info', duration), [addToast]);

  return (
    <ToastContext.Provider value={{ toast: addToast, success, error, info, removeToast }}>
      {children}

      {/* Floating Top Toast Notification Container (Zero layout shift, compact & minimal) */}
      <div
        className="fixed top-3 sm:top-4 left-1/2 -translate-x-1/2 z-[999999] flex flex-col items-center gap-1.5 pointer-events-none max-w-[92vw] sm:max-w-md w-auto"
        aria-live="polite"
        role="region"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)]/95 backdrop-blur-md shadow-md text-xs font-sans text-[var(--text-primary)] transition-all duration-200 animate-slide-down shrink-0 select-none"
            style={{
              boxShadow: '0 4px 16px -2px rgba(0,0,0,0.12), 0 2px 4px -1px rgba(0,0,0,0.06)'
            }}
          >
            {t.type === 'success' && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            )}
            {t.type === 'error' && (
              <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            )}
            {t.type === 'info' && (
              <Info className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            )}
            <span className="truncate max-w-[260px] sm:max-w-xs leading-none">{t.message}</span>

            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 ml-0.5 rounded-full cursor-pointer transition-colors"
              aria-label="Close notification"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Graceful fallback helper if used outside provider
    return {
      toast: (msg, type) => showGlobalToast(msg, type),
      success: (msg) => showGlobalToast(msg, 'success'),
      error: (msg) => showGlobalToast(msg, 'error'),
      info: (msg) => showGlobalToast(msg, 'info'),
      removeToast: () => {}
    };
  }
  return context;
}

export function showGlobalToast(message, type = 'info', duration = 3500) {
  if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
    window.dispatchEvent(
      new window.CustomEvent('app-toast', {
        detail: { message, type, duration }
      })
    );
  }
}
