import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Lock } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/admin';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="notebook-container py-16">
      <div className="max-w-sm mx-auto border border-[var(--border-subtle)] p-8 rounded-lg shadow-sm">
        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded-full bg-[var(--code-bg)] text-[var(--text-primary)] flex items-center justify-center mx-auto mb-3">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-serif font-medium">Owner Login</h1>
          <p className="text-xs font-sans text-[var(--text-secondary)] mt-1">
            Private authoring space access via Supabase Auth.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[var(--code-bg)] text-[var(--text-primary)] text-xs font-sans rounded border border-[var(--border-subtle)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-sans text-[var(--text-muted)] uppercase mb-1">
              Admin Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="quiet-input text-sm"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-sans text-[var(--text-muted)] uppercase mb-1">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="quiet-input text-sm"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="quiet-button w-full text-sm mt-2"
          >
            {submitting ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs font-sans text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-4">
          Log in with your administrator email & password created in Supabase.
        </div>
      </div>
    </div>
  );
}
