import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { TypewriterProvider } from './context/TypewriterContext';
import { ViewCountProvider } from './context/ViewCountContext';
import { ToastProvider } from './context/ToastContext';
import { initRealtimeSync } from './utils/realtime';
import App from './App';
import './index.css';

// Initialize multi-transport realtime sync engine (SSE, Supabase Realtime, BroadcastChannel)
initRealtimeSync();

// Register PWA service worker cleanly for installability and offline support
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV !== 'test') {
  const registerSW = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    registerSW();
  } else {
    window.addEventListener('load', registerSW);
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <TypewriterProvider>
            <ViewCountProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </ViewCountProvider>
          </TypewriterProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
