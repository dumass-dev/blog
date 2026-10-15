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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <TypewriterProvider>
          <ViewCountProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ViewCountProvider>
        </TypewriterProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
