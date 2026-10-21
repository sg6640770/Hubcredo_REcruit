import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, User, ArrowRight } from 'lucide-react';
import { RECRUITER_APP_URL } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

export default function EntryPage() {
  const navigate = useNavigate();
  const { session, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && session && profile) {
      navigate(profile.onboarding_complete ? '/dashboard' : '/onboarding', { replace: true });
    }
  }, [session, profile, loading, navigate]);

  const savedChoice = localStorage.getItem('jp_role_choice');

  const goRecruiter = () => {
    localStorage.setItem('jp_role_choice', 'recruiter');
    const recruiterBaseUrl = RECRUITER_APP_URL.replace(/\/+$/, '');
    window.location.assign(`${recruiterBaseUrl}/login`);
  };

  const goCandidate = () => {
    localStorage.setItem('jp_role_choice', 'candidate');
    navigate('/login');
  };

  return (
    <div className="jp-entry">
      <div className="jp-entry-card">
        <div className="jp-entry-logo">
          <span className="jp-entry-logo-mark">JP</span>
          <h1>JobPilot</h1>
        </div>
        <h2>Are you a recruiter or a candidate?</h2>

        <div className="jp-entry-choices">
          <button
            className={`jp-entry-choice ${savedChoice === 'recruiter' ? 'preselected' : ''}`}
            onClick={goRecruiter}
          >
            <div className="jp-entry-choice-icon recruiter">
              <Briefcase size={28} />
            </div>
            <div className="jp-entry-choice-body">
              <h3>I'm a Recruiter</h3>
              <p>Manage clients, candidates and campaigns</p>
            </div>
            <ArrowRight size={20} className="jp-entry-choice-arrow" />
          </button>

          <button
            className={`jp-entry-choice ${savedChoice === 'candidate' ? 'preselected' : ''}`}
            onClick={goCandidate}
          >
            <div className="jp-entry-choice-icon candidate">
              <User size={28} />
            </div>
            <div className="jp-entry-choice-body">
              <h3>I'm a Candidate</h3>
              <p>Build your resume and land interviews on autopilot</p>
            </div>
            <ArrowRight size={20} className="jp-entry-choice-arrow" />
          </button>
        </div>

        <div className="jp-entry-secondary">
          <button onClick={goRecruiter}>New recruiter? Create account</button>
          <span>·</span>
          <button onClick={goCandidate}>New candidate? Sign up</button>
        </div>
      </div>
    </div>
  );
}
