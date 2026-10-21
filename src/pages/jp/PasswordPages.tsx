import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setSent(true);
  };

  return (
    <div className="jp-auth-page">
      <div className="jp-auth-card">
        <Link to="/login" className="jp-auth-back">
          <ArrowLeft size={16} /> Back to sign in
        </Link>
        <div className="jp-auth-brand">
          <span className="jp-entry-logo-mark">JP</span>
          <span>JobPilot</span>
        </div>
        <h1>Reset your password</h1>
        <p>Enter your email and we'll send you a reset link.</p>
        {sent ? (
          <div className="jp-auth-success">
            <CheckCircle2 size={18} /> Check your inbox for a reset link.
          </div>
        ) : (
          <form onSubmit={submit} className="jp-auth-form">
            {error && (
              <div className="jp-auth-error">
                <AlertCircle size={16} /> {error}
              </div>
            )}
            <div className="jp-auth-field">
              <Mail size={18} />
              <input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" className="jp-auth-submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(true);
  };

  return (
    <div className="jp-auth-page">
      <div className="jp-auth-card">
        <Link to="/login" className="jp-auth-back">
          <ArrowLeft size={16} /> Back to sign in
        </Link>
        <div className="jp-auth-brand">
          <span className="jp-entry-logo-mark">JP</span>
          <span>JobPilot</span>
        </div>
        <h1>Set a new password</h1>
        {done ? (
          <div className="jp-auth-success">
            <CheckCircle2 size={18} /> Password updated. You can now sign in.
          </div>
        ) : (
          <form onSubmit={submit} className="jp-auth-form">
            {error && (
              <div className="jp-auth-error">
                <AlertCircle size={16} /> {error}
              </div>
            )}
            <div className="jp-auth-field">
              <input
                type="password"
                required
                minLength={6}
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="jp-auth-submit" disabled={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
