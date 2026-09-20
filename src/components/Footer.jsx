import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, LayoutDashboard } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="mt-20 pt-8 pb-12 border-t border-[var(--border-subtle)] text-xs font-sans text-[var(--text-muted)] text-center sm:text-left">
      <div className="notebook-container flex justify-center sm:justify-between items-center">
        <div>
          © {new Date().getFullYear()} q04ti. Built for quiet reading.
        </div>
      </div>
    </footer>
  );
}
