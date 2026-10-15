import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Check } from 'lucide-react';
import Modal from './Modal';

export default function PWAInstallButton({ className = '' }) {
  const { isStandalone, hasNativePrompt, promptInstall } = usePWAInstall();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If already running as installed native standalone app, show subtle status badge
  if (isStandalone) {
    return (
      <div className={`text-[11px] font-sans text-[var(--accent-warm)] flex items-center gap-1 px-2 py-1 rounded bg-[var(--code-bg)] border border-[var(--border-subtle)] shrink-0 select-none ${className}`}>
        <Check className="w-3 h-3 text-[var(--accent-warm)]" />
        <span>App Installed</span>
      </div>
    );
  }

  const triggerInstall = async () => {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
      setShowConfirmModal(false);
    }
  };

  const handleButtonClick = async () => {
    // If native browser prompt is ready, trigger it directly so browser shows confirmation popup immediately
    if (hasNativePrompt || (typeof window !== 'undefined' && window.deferredInstallPrompt)) {
      await triggerInstall();
    } else {
      // Otherwise open the 1-click install confirmation modal
      setShowConfirmModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleButtonClick}
        disabled={installing}
        className={`quiet-button-secondary text-xs flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${className}`}
        title="Install Admin Panel as an app on your device"
        aria-label="Install Admin Panel as an app"
      >
        <Download className="w-3.5 h-3.5 text-[var(--accent-warm)]" />
        <span>{installing ? 'Installing...' : 'Install App'}</span>
      </button>

      {/* 1-Click Direct Installation Confirmation Modal (No manual guide/tutorial) */}
      <Modal isOpen={showConfirmModal} onClose={() => setShowConfirmModal(false)} title="Install Journal App">
        <div className="space-y-4 text-xs font-sans text-[var(--text-secondary)]">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--code-bg)] border border-[var(--border-subtle)]">
            <img
              src="/icon-192.png"
              alt="Journal App Icon"
              className="w-12 h-12 rounded-2xl border border-[var(--border-subtle)] shadow-sm shrink-0 object-cover"
            />
            <div>
              <div className="font-serif text-sm font-medium text-[var(--text-primary)]">Journal &amp; Diary Admin</div>
              <div className="text-[11px] text-[var(--text-muted)]">Personal writing space for q04ti &bull; Standalone full-screen.</div>
            </div>
          </div>

          <p className="text-[var(--text-secondary)] leading-relaxed">
            Install the Journal web app to your device for instant offline access and standalone writing.
          </p>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowConfirmModal(false)}
              className="quiet-button py-1.5 px-3 text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={triggerInstall}
              disabled={installing}
              className="quiet-button-primary py-1.5 px-4 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{installing ? 'Installing...' : 'Install'}</span>
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
