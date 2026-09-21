import React, { Suspense, lazy } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';

// Public pages (eager loaded for instant feel)
import Home from './pages/Home';
import Journal from './pages/Journal';
import Writing from './pages/Writing';
import Updates from './pages/Updates';
import Photos from './pages/Photos';
import EntryDetail from './pages/EntryDetail';
import Archive from './pages/Archive';
import About from './pages/About';
import NotFound from './pages/NotFound';

// Admin pages (lazy loaded for zero initial bundle bloat)
const Login = lazy(() => import('./pages/admin/Login'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Editor = lazy(() => import('./pages/admin/Editor'));
const Media = lazy(() => import('./pages/admin/Media'));
const AboutEdit = lazy(() => import('./pages/admin/AboutEdit'));

const PageFallback = () => (
  <div className="notebook-container py-12 text-center text-xs font-sans text-[var(--text-muted)] italic">
    Loading view...
  </div>
);

export default function App() {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');

  return (
    <div className="min-h-screen flex flex-col justify-between">
      <div>
        {/* Render minimalist public header on public pages */}
        {!isAdminPath && <Header />}

        <main className={isAdminPath ? 'pt-8' : ''}>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              {/* Public Read-Only Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/writing" element={<Writing />} />
              <Route path="/photos" element={<Photos />} />
              <Route path="/updates" element={<Updates />} />
              <Route path="/entry/:slug" element={<EntryDetail />} />
              <Route path="/archive" element={<Archive />} />
              <Route path="/about" element={<About />} />

              {/* Admin Authentication & Protected Workspace */}
              <Route path="/admin/login" element={<Login />} />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/new"
                element={
                  <ProtectedRoute>
                    <Editor />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/edit/:id"
                element={
                  <ProtectedRoute>
                    <Editor />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/media"
                element={
                  <ProtectedRoute>
                    <Media />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/about"
                element={
                  <ProtectedRoute>
                    <AboutEdit />
                  </ProtectedRoute>
                }
              />

              {/* Fallback 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      {/* Render quiet footer */}
      {!isAdminPath && <Footer />}
    </div>
  );
}
