import React, { useEffect, useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import { Menu, X } from 'lucide-react';

export default function Header() {
  const [siteMeta, setSiteMeta] = useState({ author_name: 'q04ti' });
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const dropdownRef = useRef(null);

  useEffect(() => {
    fetch('/api/about')
      .then(res => res.json())
      .then(data => {
        if (data.author_name) setSiteMeta({ author_name: data.author_name });
      })
      .catch(() => {});
  }, []);

  // Close menu on location change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [menuOpen]);

  const navItems = [
    { label: 'writing', path: '/writing' },
    { label: 'journal', path: '/journal' },
    { label: 'updates', path: '/updates' },
    { label: 'archive', path: '/archive' },
    { label: 'about', path: '/about' }
  ];

  return (
    <header className="notebook-container pt-8 pb-4 mb-10 border-b border-[var(--border-subtle)] relative">
      <div className="flex justify-between items-baseline">
        {/* Left: Serif Wordmark & Inline Text Links */}
        <div className="flex items-baseline space-x-6 sm:space-x-8">
          <Link
            to="/"
            className="font-serif text-2xl sm:text-3xl tracking-tight text-[var(--text-primary)] hover:opacity-80 transition-opacity font-normal"
          >
            {siteMeta.author_name}
          </Link>

          {/* Inline Text Links */}
          <nav className="flex items-center space-x-4 sm:space-x-6 text-xs sm:text-sm font-sans">
            <Link
              to="/"
              className={`transition-colors lowercase ${
                location.pathname === '/'
                  ? 'text-[var(--text-primary)] font-medium underline underline-offset-4 decoration-[1px]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              home
            </Link>

            <Link
              to="/journal"
              className={`transition-colors lowercase ${
                location.pathname.startsWith('/journal')
                  ? 'text-[var(--text-primary)] font-medium underline underline-offset-4 decoration-[1px]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              journal
            </Link>

            <Link
              to="/about"
              className={`transition-colors lowercase ${
                location.pathname.startsWith('/about')
                  ? 'text-[var(--text-primary)] font-medium underline underline-offset-4 decoration-[1px]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              about
            </Link>
          </nav>
        </div>

        {/* Right: Burger Icon Trigger & Renovated Dropdown Card */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setMenuOpen(prev => !prev)}
            className="p-1 text-[var(--text-primary)] hover:opacity-75 transition-opacity cursor-pointer bg-transparent border-0 flex items-center justify-center select-none outline-none"
            aria-expanded={menuOpen}
            aria-label="Toggle navigation menu"
          >
            {menuOpen ? (
              <X className="w-5 h-5 text-[var(--text-primary)]" />
            ) : (
              <Menu className="w-5 h-5 text-[var(--text-primary)]" />
            )}
          </button>

          {/* Renovated Dropdown Card (Positioned fully inside screen bounds) */}
          {menuOpen && (
            <div className="absolute right-0 left-auto top-full mt-3 z-50 w-52 max-w-[calc(100vw-2rem)] bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-lg shadow-2xl p-2.5 flex flex-col space-y-0.5 text-sm font-sans animate-in fade-in duration-100">
              <Link
                to="/"
                className={`py-2 px-3 rounded-md transition-colors lowercase flex justify-between items-center ${
                  location.pathname === '/'
                    ? 'bg-[var(--code-bg)] text-[var(--text-primary)] font-medium'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--code-bg)]/80'
                }`}
              >
                <span>home</span>
                {location.pathname === '/' && <span className="text-xs opacity-60">•</span>}
              </Link>

              {navItems.map((item) => {
                const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`py-2 px-3 rounded-md transition-colors lowercase flex justify-between items-center ${
                      isActive
                        ? 'bg-[var(--code-bg)] text-[var(--text-primary)] font-medium'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--code-bg)]/80'
                    }`}
                  >
                    <span>{item.label}</span>
                    {isActive && <span className="text-xs opacity-60">•</span>}
                  </Link>
                );
              })}

              {/* Theme Toggle Icon Only - Centered */}
              <div className="pt-2 mt-1.5 border-t border-[var(--border-subtle)] flex items-center justify-center py-0.5">
                <ThemeToggle />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
