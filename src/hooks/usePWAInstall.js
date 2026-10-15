import { useState, useEffect, useCallback } from 'react';

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(() => {
    return typeof window !== 'undefined' ? window.deferredInstallPrompt : null;
  });
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isBrave, setIsBrave] = useState(false);
  const [isInstallable, setIsInstallable] = useState(() => {
    return typeof window !== 'undefined' ? Boolean(window.deferredInstallPrompt) : false;
  });

  useEffect(() => {
    // 1. Check if running in standalone PWA mode
    const checkStandalone = () => {
      const isStandaloneMode = 
        Boolean(window.navigator.standalone) || 
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches;
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    // 2. Platform & Browser Detection
    const userAgent = window.navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
    const android = /Android/i.test(userAgent);
    setIsIOS(iOS);
    setIsAndroid(android);

    // Detect Brave Browser
    if (window.navigator.brave && typeof window.navigator.brave.isBrave === 'function') {
      window.navigator.brave.isBrave().then(brave => {
        if (brave) setIsBrave(true);
      }).catch(() => {});
    } else if (/Brave/i.test(userAgent)) {
      setIsBrave(true);
    }

    // Check if globally captured before React mount
    if (window.deferredInstallPrompt) {
      setDeferredPrompt(window.deferredInstallPrompt);
      setIsInstallable(true);
    }

    // 3. Listen for browser beforeinstallprompt event (Android / Chromium)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      window.deferredInstallPrompt = e;
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handlePromptReady = () => {
      if (window.deferredInstallPrompt) {
        setDeferredPrompt(window.deferredInstallPrompt);
        setIsInstallable(true);
      }
    };

    // 4. Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      window.deferredInstallPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-prompt-ready', handlePromptReady);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-prompt-ready', handlePromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const promptEvent = deferredPrompt || (typeof window !== 'undefined' ? window.deferredInstallPrompt : null);
    if (promptEvent && typeof promptEvent.prompt === 'function') {
      try {
        await promptEvent.prompt();
        const choiceResult = await promptEvent.userChoice;
        if (choiceResult && choiceResult.outcome === 'accepted') {
          setIsInstallable(false);
          setDeferredPrompt(null);
          if (typeof window !== 'undefined') {
            window.deferredInstallPrompt = null;
          }
        }
        return choiceResult ? choiceResult.outcome : null;
      } catch (err) {
        console.error('PWA install prompt error:', err);
      }
    }
    return null;
  }, [deferredPrompt]);

  return {
    isInstallable,
    isStandalone,
    isIOS,
    isAndroid,
    isBrave,
    promptInstall,
    hasNativePrompt: Boolean(deferredPrompt || (typeof window !== 'undefined' && window.deferredInstallPrompt))
  };
}
