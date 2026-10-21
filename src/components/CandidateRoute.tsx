import { Navigate } from 'react-router-dom';
import { type ReactNode } from 'react';
import { Briefcase } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { RECRUITER_APP_URL } from '@/lib/supabase';

export function CandidateRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="jp-boot">
        <span className="jp-entry-logo-mark">JP</span>
        <p>Loading JobPilot…</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    return (
      <div className="jp-recruiter-notice">
        <div className="jp-recruiter-notice-card">
          <Briefcase size={40} />
          <h2>This is a HubCredo recruiter account</h2>
          <p>Please sign in to the recruiter app.</p>
          <button
            onClick={async () => {
              await signOut();
              window.location.href = `${RECRUITER_APP_URL}/login`;
            }}
          >
            Go to recruiter app
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
