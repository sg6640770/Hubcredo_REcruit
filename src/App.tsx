import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/components/Toast';
import { CandidateRoute } from '@/components/CandidateRoute';
import DashboardLayout from '@/components/DashboardLayout';
import LandingPage from '@/pages/jp/LandingPage';
import EntryPage from '@/pages/jp/EntryPage';
import AuthPage from '@/pages/jp/AuthPage';
import { ForgotPasswordPage, ResetPasswordPage } from '@/pages/jp/PasswordPages';
import OnboardingPage from '@/pages/jp/OnboardingPage';
import DashboardPage from '@/pages/jp/DashboardPage';
import CampaignsPage from '@/pages/jp/CampaignsPage';
import CampaignDetailPage from '@/pages/jp/CampaignDetailPage';
import ApplicationsPage from '@/pages/jp/ApplicationsPage';
import InboxPage from '@/pages/jp/InboxPage';
import ResumeBuilderPage from '@/pages/jp/ResumeBuilderPage';
import CoverLettersPage from '@/pages/jp/CoverLettersPage';
import ConnectedAccountsPage from '@/pages/jp/ConnectedAccountsPage';
import SettingsPage from '@/pages/jp/SettingsPage';

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) return <div className="jp-boot"><span className="jp-entry-logo-mark">JP</span><p>Loading JobPilot…</p></div>;
  if (profile && !profile.onboarding_complete) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}


const [showAuth, setShowAuth] = useState(
  () => new URLSearchParams(window.location.search).has('auth')
);

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/choose" element={<EntryPage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/signup" element={<AuthPage mode="signup" />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/onboarding" element={
              <CandidateRoute><OnboardingPage /></CandidateRoute>
            } />
            <Route path="/dashboard" element={
              <CandidateRoute><OnboardingGate><DashboardLayout><DashboardPage /></DashboardLayout></OnboardingGate></CandidateRoute>
            } />
            <Route path="/campaigns" element={
              <CandidateRoute><OnboardingGate><DashboardLayout><CampaignsPage /></DashboardLayout></OnboardingGate></CandidateRoute>
            } />
            <Route path="/campaigns/:id" element={
              <CandidateRoute><OnboardingGate><DashboardLayout><CampaignDetailPage /></DashboardLayout></OnboardingGate></CandidateRoute>
            } />
            <Route path="/applications" element={
              <CandidateRoute><OnboardingGate><DashboardLayout><ApplicationsPage /></DashboardLayout></OnboardingGate></CandidateRoute>
            } />
            <Route path="/inbox" element={
              <CandidateRoute><OnboardingGate><DashboardLayout><InboxPage /></DashboardLayout></OnboardingGate></CandidateRoute>
            } />
            <Route path="/resume-builder" element={
              <CandidateRoute><OnboardingGate><DashboardLayout><ResumeBuilderPage /></DashboardLayout></OnboardingGate></CandidateRoute>
            } />
            <Route path="/cover-letters" element={
              <CandidateRoute><OnboardingGate><DashboardLayout><CoverLettersPage /></DashboardLayout></OnboardingGate></CandidateRoute>
            } />
            <Route path="/connected-accounts" element={
              <CandidateRoute><OnboardingGate><DashboardLayout><ConnectedAccountsPage /></DashboardLayout></OnboardingGate></CandidateRoute>
            } />
            <Route path="/settings" element={
              <CandidateRoute><OnboardingGate><DashboardLayout><SettingsPage /></DashboardLayout></OnboardingGate></CandidateRoute>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
