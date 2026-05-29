import { useState, FormEvent } from 'react';
import { api } from '../lib/api';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.login(email, password);
      // Store current user info
      if (response.data) {
        if (response.data.admin) {
          localStorage.setItem(
            "admin_user",
            JSON.stringify(response.data.admin),
          );
        }
        if (response.data.requiresSetup) {
          localStorage.setItem("admin_requires_setup", "true");
        } else {
          localStorage.removeItem("admin_requires_setup");
        }
      }
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-page">
      <div className="card max-w-md w-full p-8">
        <div className="text-center mb-8 flex flex-col items-center">
          <img src="/logo.svg" alt="Auth Service" className="h-24 w-auto mb-6 dark:hidden" />
          <img src="/logo_dark.svg" alt="Auth Service" className="h-24 w-auto mb-6 hidden dark:block" />
          <h1 className="text-3xl font-bold text-text-primary mb-2">Auth Service Admin</h1>
          <p className="text-text-secondary">Sign in to manage your authentication service</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-danger-bg border border-danger/20 text-danger-text px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-2">
              Email
            </label>
            <input
              id="email"
              data-testid="email-input"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input w-full"
              placeholder="admin@example.com"
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-2">
              Password
            </label>
            <input
              id="password"
              data-testid="password-input"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            id="login-submit"
            data-testid="login-submit"
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}