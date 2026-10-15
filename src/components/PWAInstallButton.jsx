import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, MoreVertical, Share, PlusSquare, Check } from 'lucide-react';
import Modal from './Modal';

export default function PWAInstallButton({ className = '' }) {
  const { isStandalone, isIOS, isAndroid, isBrave, hasNativePrompt, promptInstall } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  // If already running as installed native standalone app, show subtle status badge
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

  const getModalTitle = () => {
    if (isAndroid) return 'Install Journal App on Android';
    if (isIOS) return 'Add Journal to Home Screen';
    return 'Install Journal Admin App';
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={`quiet-button-secondary text-xs flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${className}`}
        title="Install Admin Panel as an app on your device"
        aria-label="Install Admin Panel as an app"
      >
        <Download className="w-3.5 h-3.5 text-[var(--accent-warm)]" />
        <span>Install App</span>
      </button>

      {/* Guide Modal tailored for Android (Brave/Chrome), iOS, or Desktop */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={getModalTitle()}>
        <div className="space-y-4 text-xs font-sans text-[var(--text-secondary)]">
          {/* App Preview Card with new sleek monogram icon */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--code-bg)] border border-[var(--border-subtle)]">
            <img
              src="/icon-192.png"
              alt="Journal App Icon"
              className="w-12 h-12 rounded-2xl border border-[var(--border-subtle)] shadow-sm shrink-0"
            />
            <div>
              <div className="font-serif text-sm font-medium text-[var(--text-primary)]">Journal &amp; Diary Admin</div>
              <div className="text-[11px] text-[var(--text-muted)]">Personal writing space for q04ti &bull; Standalone full-screen.</div>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div className="font-medium text-[var(--text-primary)]">
              {isAndroid
                ? `Install in 2 simple taps in ${isBrave ? 'Brave' : 'your browser'}:`
                : isIOS
                ? 'Install in 2 simple taps on iPhone/iPad:'
                : 'How to install on your computer:'}
            </div>

            {/* Android / Brave Instructions */}
            {isAndroid || (!isIOS && !isAndroid) ? (
              <>
                <div className="flex items-start gap-3 p-2.5 rounded bg-[var(--card-bg)] border border-[var(--border-subtle)]">
                  <div className="w-6 h-6 rounded-full bg-[var(--code-bg)] text-[var(--text-primary)] font-mono text-xs flex items-center justify-center shrink-0">
                    1
                  </div>
                  <div className="flex-1 leading-relaxed">
                    Tap the <strong className="text-[var(--text-primary)] inline-flex items-center gap-1"><MoreVertical className="w-3 h-3 text-[var(--accent-warm)]" /> three dots menu (⋮)</strong> in {isBrave ? 'Brave' : 'the browser'} bar (at the top-right or bottom-right of your screen).
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded bg-[var(--card-bg)] border border-[var(--border-subtle)]">
                  <div className="w-6 h-6 rounded-full bg-[var(--code-bg)] text-[var(--text-primary)] font-mono text-xs flex items-center justify-center shrink-0">
                    2
                  </div>
                  <div className="flex-1 leading-relaxed">
                    Tap <strong className="text-[var(--text-primary)] inline-flex items-center gap-1"><Download className="w-3 h-3 text-[var(--accent-warm)]" /> Install app</strong> (or <strong>Add to Home screen</strong>), then tap <strong>Install</strong>.
                  </div>
                </div>
              </>
            ) : (
              /* iOS Safari Instructions */
              <>
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
              </>
            )}
          </div>

          <div className="pt-2 text-[11px] text-[var(--text-muted)] italic">
            Once installed, opening the Journal icon from your home screen or app drawer launches your private admin dashboard full-screen with no browser address bar!
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
