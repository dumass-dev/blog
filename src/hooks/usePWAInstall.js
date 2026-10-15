import { useState, useEffect } from 'react';

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);

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

    // 2. Check if iOS device
    const userAgent = window.navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
    setIsIOS(iOS);

    // 3. Listen for browser beforeinstallprompt event (Android / Chromium)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    // 4. Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstallable(false);
        setDeferredPrompt(null);
      }
      return choiceResult.outcome;
    }
    return null;
  };

  return {
    isInstallable,
    isStandalone,
    isIOS,
    promptInstall,
    hasNativePrompt: Boolean(deferredPrompt)
  };
}
