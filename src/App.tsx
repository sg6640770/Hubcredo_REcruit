import { useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/components/Toast';
import { CandidateRoute } from '@/components/CandidateRoute';

/* ── JobPilot (candidate) ── */
import DashboardLayout from '@/components/DashboardLayout';
import LandingPage from '@/pages/jp/LandingPage';
import EntryPage from '@/pages/jp/EntryPage';
import AuthPage from '@/pages/jp/AuthPage';
import TriggerSpacePage from '@/pages/jp/TriggerSpacePage';
import { ForgotPasswordPage, ResetPasswordPage } from '@/pages/jp/PasswordPages';
import OnboardingPage from '@/pages/jp/OnboardingPage';
import DashboardPage from '@/pages/jp/DashboardPage';
import CampaignDetailPage from '@/pages/jp/CampaignDetailPage';
import ApplicationsPage from '@/pages/jp/ApplicationsPage';
import ResumeBuilderPage from '@/pages/jp/ResumeBuilderPage';
import CoverLettersPage from '@/pages/jp/CoverLettersPage';
import ConnectedAccountsPage from '@/pages/jp/ConnectedAccountsPage';

/* ── HubCredo (recruiter) — original files, untouched ── */
import RecruiterAuthPage from '@/pages/AuthPage';
import RecruiterDashboardLayout, { type DashboardPage as RecruiterPageKey } from '@/pages/DashboardLayout';
import OverviewPage from '@/pages/OverviewPage';
import ClientsPage from '@/pages/ClientsPage';
import CandidatesPage from '@/pages/CandidatesPage';
import OutreachPage from '@/pages/OutreachPage';
import RolesPage from '@/pages/RolesPage';
import LeadsPage from '@/pages/LeadsPage';
import LinkedInPage from '@/pages/LinkedInPage';
import InboxKitPage from '@/pages/InboxkitPage';
import ReplyioPage from '@/pages/ReplyioPage';
import RecruiterCampaignsPage from '@/pages/CampaignsPage';
import RecruiterInboxPage from '@/pages/InboxPage';
import RecruiterSettingsPage from '@/pages/SettingsPage';

/* ═══════════════════════════════════════════════════════════════════════
   Candidate helpers
   ═══════════════════════════════════════════════════════════════════════ */

function OnboardingGate({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) {
    return (
      <div className="jp-boot">
        <span className="jp-entry-logo-mark">JP</span>
        <p>Loading JobPilot…</p>
      </div>
    );
  }
  if (profile && !profile.onboarding_complete) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

/* Wraps a candidate page with auth guard + onboarding gate + JobPilot shell */
function CandidatePage({ children }: { children: ReactNode }) {
  return (
    <CandidateRoute>
      <OnboardingGate>
        <DashboardLayout>{children}</DashboardLayout>
      </OnboardingGate>
    </CandidateRoute>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Recruiter helpers
   A user is a JobPilot candidate only if a jp_profiles row exists
   (`profile` from useAuth). Any signed-in user WITHOUT that row is a
   recruiter and is sent to the recruiter workspace.
   ═══════════════════════════════════════════════════════════════════════ */

function RecruiterBoot() {
  return (
    <div className="jp-boot">
      <img
        src="/images/favicon.svg"
        alt="HubCredo"
        style={{ height: 40, width: 'auto', objectFit: 'contain', display: 'block' }}
      />
      <p>Loading HubCredo…</p>
    </div>
  );
}

/* /recruiter/login — shows the original recruiter AuthPage, or forwards if already signed in */
function RecruiterLoginRoute() {
  const { session, profile, loading } = useAuth();
  if (loading) return <RecruiterBoot />;
  if (session && profile) return <Navigate to="/dashboard" replace />;      // candidate account
  if (session) return <Navigate to="/recruiter/app" replace />;             // recruiter account
  return <RecruiterAuthPage />;
}

/* /recruiter/app — recruiter-only guard */
function RecruiterRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <RecruiterBoot />;
  if (!session) return <Navigate to="/recruiter/login" replace />;
  if (profile) return <Navigate to="/dashboard" replace />;                 // candidates can't enter
  return <>{children}</>;
}

/* The original recruiter dashboard (state-based page switching, exactly as before) */
function RecruiterWorkspace() {
  const [dashPage, setDashPage] = useState<RecruiterPageKey>('overview');

  return (
    <RecruiterDashboardLayout activePage={dashPage} onNavigate={(page: string) => setDashPage(page as RecruiterPageKey)}>
      {dashPage === 'overview' && <OverviewPage onNavigate={(page: string) => setDashPage(page as RecruiterPageKey)} />}
      {dashPage === 'clients' && <ClientsPage />}
      {dashPage === 'candidates' && <CandidatesPage />}
      {dashPage === 'leads' && <LeadsPage />}
      {dashPage === 'linkedin' && <LinkedInPage />}
      {dashPage === 'campaigns' && <RecruiterCampaignsPage />}
      {dashPage === 'outreach' && <OutreachPage />}
      {dashPage === 'roles' && <RolesPage />}
      {dashPage === 'inbox' && <RecruiterInboxPage />}
      {dashPage === 'inboxkit' && <InboxKitPage />}
      {dashPage === 'replyio' && <ReplyioPage />}
      {dashPage === 'settings' && <RecruiterSettingsPage />}
    </RecruiterDashboardLayout>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   App
   ═══════════════════════════════════════════════════════════════════════ */

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/choose" element={<EntryPage />} />

            {/* Candidate auth */}
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/signup" element={<AuthPage mode="signup" />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Recruiter */}
            <Route path="/recruiter" element={<Navigate to="/recruiter/app" replace />} />
            <Route path="/recruiter/login" element={<RecruiterLoginRoute />} />
            <Route
              path="/recruiter/app"
              element={
                <RecruiterRoute>
                  <RecruiterWorkspace />
                </RecruiterRoute>
              }
            />

            {/* Candidate (JobPilot) */}
            <Route
              path="/onboarding"
              element={
                <CandidateRoute>
                  <OnboardingPage />
                </CandidateRoute>
              }
            />
            <Route path="/dashboard" element={<CandidatePage><DashboardPage /></CandidatePage>} />
            <Route path="/campaigns" element={<CandidatePage><RecruiterCampaignsPage /></CandidatePage>} />
            <Route path="/campaigns/:id" element={<CandidatePage><CampaignDetailPage /></CandidatePage>} />
            <Route
  path="/trigger-space"
  element={
    <CandidatePage>
      <TriggerSpacePage />
    </CandidatePage>
  }
/>
            <Route path="/applications" element={<CandidatePage><ApplicationsPage /></CandidatePage>} />
            <Route path="/outreach" element={<CandidatePage><OutreachPage /></CandidatePage>} />
            <Route path="/linkedin" element={<CandidatePage><LinkedInPage /></CandidatePage>} />
            <Route path="/inbox" element={<CandidatePage><RecruiterInboxPage /></CandidatePage>} />
            <Route path="/resume-builder" element={<CandidatePage><ResumeBuilderPage /></CandidatePage>} />
            <Route path="/cover-letters" element={<CandidatePage><CoverLettersPage /></CandidatePage>} />
            <Route path="/connected-accounts" element={<CandidatePage><ConnectedAccountsPage /></CandidatePage>} />
            <Route path="/settings" element={<CandidatePage><RecruiterSettingsPage /></CandidatePage>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
