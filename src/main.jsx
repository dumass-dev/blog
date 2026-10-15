import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { TypewriterProvider } from './context/TypewriterContext';
import { ViewCountProvider } from './context/ViewCountContext';
import { initRealtimeSync } from './utils/realtime';
import App from './App';
import './index.css';

// Initialize multi-transport realtime sync engine (SSE, Supabase Realtime, BroadcastChannel)
initRealtimeSync();

// Register PWA service worker strictly for Admin App
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV !== 'test') {
  if (window.location.pathname.startsWith('/admin')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  } else {
    // Ensure public site is never controlled or cached by service worker
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister().catch(() => {});
      }
    }).catch(() => {});
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <TypewriterProvider>
            <ViewCountProvider>
              <App />
            </ViewCountProvider>
          </TypewriterProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
