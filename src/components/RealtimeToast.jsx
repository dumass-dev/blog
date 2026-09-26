import React, { useEffect, useState, useRef } from 'react';
import { X } from 'lucide-react';

export default function RealtimeToast() {
  const [notification, setNotification] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const handleToast = (e) => {
      const detail = e.detail;
      if (!detail || !detail.message) return;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      setNotification({
        id: Date.now(),
        message: detail.message,
        type: detail.type || 'entry',
        op: detail.op || ''
      });

      timerRef.current = setTimeout(() => {
        setNotification(null);
      }, 4000);
    };

    window.addEventListener('realtime-toast', handleToast);
    return () => {
      window.removeEventListener('realtime-toast', handleToast);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!notification) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 max-w-sm w-auto animate-content-fade"
    >
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-full bg-[var(--card-bg)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-lg backdrop-blur-md transition-all duration-300 hover:border-[var(--accent-warm)]">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>

        <span className="text-xs font-sans font-medium tracking-tight truncate max-w-[240px]">
          {notification.message}
        </span>

        <button
          onClick={() => setNotification(null)}
          aria-label="Dismiss notification"
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 ml-1 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
