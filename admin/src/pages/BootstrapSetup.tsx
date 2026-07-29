import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function BootstrapSetup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bootstrapSecret, setBootstrapSecret] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const token = searchParams.get('token');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      setError('This setup URL is missing its token. Request a new setup URL.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const response = await fetch('/api/admin/bootstrap/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Bootstrap-Secret': bootstrapSecret,
        },
        body: JSON.stringify({ token, email, password, displayName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Initial setup failed');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Initial setup failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-page p-6">
      <form onSubmit={submit} className="card w-full max-w-md p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Create initial super admin</h1>
          <p className="text-text-secondary mt-2">This setup URL can be used once.</p>
        </div>
        {error && <p className="text-danger-text">{error}</p>}
        <input className="input w-full" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input w-full" type="text" placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        <input className="input w-full" type="password" placeholder="Choose a password (12+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} required />
        <input className="input w-full" type="password" placeholder="Deployment bootstrap secret" value={bootstrapSecret} onChange={(e) => setBootstrapSecret(e.target.value)} required />
        <button className="btn btn-primary w-full" disabled={submitting}>{submitting ? 'Creating…' : 'Create super admin'}</button>
      </form>
    </div>
  );
}
