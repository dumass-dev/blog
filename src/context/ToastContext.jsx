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

      {/* Floating Toast Notification Container (Never displaces underlying UI) */}
      <div
        className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-[999999] flex flex-col gap-2 pointer-events-none max-w-[92vw] sm:max-w-sm w-full"
        aria-live="polite"
        role="region"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)]/95 backdrop-blur-md shadow-lg text-xs font-sans text-[var(--text-primary)] transition-all duration-200 animate-content-fade"
            style={{
              boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12), 0 2px 6px -1px rgba(0,0,0,0.06)'
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {t.type === 'success' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              )}
              {t.type === 'error' && (
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              )}
              {t.type === 'info' && (
                <Info className="w-4 h-4 text-sky-500 shrink-0" />
              )}
              <span className="truncate break-words leading-relaxed">{t.message}</span>
            </div>

            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-sm shrink-0 cursor-pointer transition-colors"
              aria-label="Close notification"
            >
              <X className="w-3.5 h-3.5" />
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
