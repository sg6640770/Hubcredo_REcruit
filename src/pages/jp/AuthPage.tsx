import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, ArrowLeft, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { RECRUITER_APP_URL } from '@/lib/supabase';

type Mode = 'login' | 'signup';

export default function AuthPage({ mode }: { mode: Mode }) {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    if (mode === 'signup') {
      const { error } = await signUp(email, password, fullName);
      setBusy(false);
      if (error) return setError(error);
      toast.show('Account created! Welcome to JobPilot.', 'success');
      navigate('/onboarding', { replace: true });
    } else {
      const { error } = await signIn(email, password);
      setBusy(false);
      if (error) return setError(error);
      toast.show('Welcome back!', 'success');
      navigate('/dashboard', { replace: true });
    }
  };

  return (
    <div className="jp-auth-page">
      <div className="jp-auth-card">
        <Link to="/" className="jp-auth-back">
          <ArrowLeft size={16} /> Back
        </Link>
        <div className="jp-auth-brand">
          <span className="jp-entry-logo-mark">JP</span>
          <span>JobPilot</span>
        </div>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p>
          {mode === 'login'
            ? 'Sign in to your JobPilot account'
            : 'Start landing interviews on autopilot'}
        </p>

        {error && (
          <div className="jp-auth-error">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={submit} className="jp-auth-form">
          {mode === 'signup' && (
            <div className="jp-auth-field">
              <User size={18} />
              <input
                type="text"
                required
                placeholder="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
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
          <div className="jp-auth-field">
            <Lock size={18} />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="jp-auth-submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="jp-auth-toggle">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <Link to="/signup">Sign up</Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link to="/login">Sign in</Link>
            </>
          )}
        </p>

        <p className="jp-auth-recruiter-link">
          Not a candidate?{' '}
          <a href={`${RECRUITER_APP_URL}/login`}>I'm a recruiter</a>
        </p>
      </div>
    </div>
  );
}
