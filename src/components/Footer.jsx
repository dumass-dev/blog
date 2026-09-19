import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, LayoutDashboard } from 'lucide-react';

export default function Footer() {
  const { isAdmin } = useAuth();

  return (
    <footer className="mt-20 pt-8 pb-12 border-t border-[var(--border-subtle)] text-xs font-sans text-[var(--text-muted)]">
      <div className="notebook-container flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          © {new Date().getFullYear()} q04ti. Built for quiet reading.
        </div>

        <div className="flex items-center space-x-6">
          {/* Admin link */}
          {isAdmin ? (
            <Link
              to="/admin"
              className="flex items-center space-x-1.5 text-[var(--text-primary)] hover:underline py-2 px-1 text-xs font-medium"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Admin Studio</span>
            </Link>
          ) : (
            <Link
              to="/admin/login"
              className="hover:text-[var(--text-secondary)] transition-colors flex items-center space-x-1 py-2 px-1 text-xs"
              title="Owner access"
            >
              <Lock className="w-3 h-3 opacity-60" />
              <span>Admin Login</span>
            </Link>
          )}
        </div>
      </div>
    </footer>
  );
}
