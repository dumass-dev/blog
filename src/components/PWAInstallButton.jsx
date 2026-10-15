import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Smartphone, Share, PlusSquare, Check } from 'lucide-react';
import Modal from './Modal';

export default function PWAInstallButton({ className = '' }) {
  const { isStandalone, isIOS, hasNativePrompt, promptInstall } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  // If already running as installed native standalone app, no need to show install button
  if (isStandalone) {
    return (
      <div className={`text-[11px] font-sans text-[var(--accent-warm)] flex items-center gap-1 px-2 py-1 rounded bg-[var(--code-bg)] border border-[var(--border-subtle)] shrink-0 select-none ${className}`}>
        <Check className="w-3 h-3 text-[var(--accent-warm)]" />
        <span>App Installed</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    if (hasNativePrompt) {
      await promptInstall();
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={`quiet-button-secondary text-xs flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${className}`}
        title="Install Admin Panel as an app on your home screen"
        aria-label="Install Admin Panel as an app"
      >
        <Smartphone className="w-3.5 h-3.5 text-[var(--accent-warm)]" />
        <span>Add to Screen</span>
      </button>

      {/* Guide Modal for iOS or manual install */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Journal to Home Screen">
        <div className="space-y-4 text-xs font-sans text-[var(--text-secondary)]">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--code-bg)] border border-[var(--border-subtle)]">
            <img src="/icon-192.png" alt="Journal App Icon" className="w-12 h-12 rounded-xl border border-[var(--border-subtle)] shadow-sm shrink-0" />
            <div>
              <div className="font-serif text-sm font-medium text-[var(--text-primary)]">Journal & Diary Admin</div>
              <div className="text-[11px] text-[var(--text-muted)]">Opens directly into your admin writing dashboard in full-screen.</div>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div className="font-medium text-[var(--text-primary)]">
              {isIOS ? 'Install in 2 simple taps on iPhone/iPad:' : 'How to install:'}
            </div>

            <div className="flex items-start gap-3 p-2.5 rounded bg-[var(--card-bg)] border border-[var(--border-subtle)]">
              <div className="w-6 h-6 rounded-full bg-[var(--code-bg)] text-[var(--text-primary)] font-mono text-xs flex items-center justify-center shrink-0">
                1
              </div>
              <div className="flex-1 leading-relaxed">
                Tap the <strong className="text-[var(--text-primary)] inline-flex items-center gap-1"><Share className="w-3 h-3 text-[var(--accent-warm)]" /> Share</strong> button in the Safari navigation bar.
              </div>
            </div>

            <div className="flex items-start gap-3 p-2.5 rounded bg-[var(--card-bg)] border border-[var(--border-subtle)]">
              <div className="w-6 h-6 rounded-full bg-[var(--code-bg)] text-[var(--text-primary)] font-mono text-xs flex items-center justify-center shrink-0">
                2
              </div>
              <div className="flex-1 leading-relaxed">
                Scroll down and tap <strong className="text-[var(--text-primary)] inline-flex items-center gap-1"><PlusSquare className="w-3.5 h-3.5 text-[var(--accent-warm)]" /> Add to Home Screen</strong>, then tap <strong>Add</strong>.
              </div>
            </div>
          </div>

          <div className="pt-2 text-[11px] text-[var(--text-muted)] italic">
            Once added, tapping the Journal icon on your home screen will launch your private diary full-screen with no browser address bar!
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="quiet-button py-1.5 px-4 text-xs cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
