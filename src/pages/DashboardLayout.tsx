import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard, Building2, BriefcaseBusiness, Users, Send, Inbox, Settings, Menu, X, Zap, ChevronRight,Linkedin
} from 'lucide-react';
import { useAuth } from '@/lib/auth';

export type DashboardPage = 'overview' | 'clients' | 'candidates' | 'leads' |'linkedin' | 'outreach' | 'settings' | 'roles' | 'inbox';

const navItems: { id: DashboardPage; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'clients', label: 'Clients', icon: Building2 },
  { id: 'roles', label: 'Roles', icon: BriefcaseBusiness },
  { id: 'candidates', label: 'Candidates', icon: Users },
  { id: 'leads', label: 'Leads', icon: Users },
  { id: 'outreach', label: 'Outreach', icon: Send },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function DashboardLayout({
  activePage,
  onNavigate,
  children,
}: {
  activePage: DashboardPage;
  onNavigate: (page: DashboardPage) => void;
  children: ReactNode;
}) {
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = (profile?.full_name || 'U').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="dashboard-shell recruit-shell">
      <aside className={`dash-sidebar recruit-sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="recruit-brand-row">
          <div className="dash-brand recruit-brand">
            <span className="brand-mark"><span /></span>
            <div><strong>HubCredo</strong><small>RECRUIT</small></div>
          </div>
          <button className="recruit-close" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>

        <button className="credits-card"><Zap size={16} /><strong>{profile?.credits ?? 90} credits</strong><span>Top up <ChevronRight size={14} /></span></button>

        <nav className="dash-nav recruit-nav">
          <p>NAVIGATION</p>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`dash-nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => { onNavigate(item.id); setMobileOpen(false); }}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {activePage === item.id && item.id === 'clients' && <i />}
            </button>
          ))}
        </nav>

        <div className="dash-sidebar-footer recruit-sidebar-footer">
          <button className="dash-signout" onClick={signOut}>Sign out</button>
        </div>
      </aside>

      <div className="dash-main recruit-main">
        <header className="dash-topbar recruit-topbar">
          <button className="dash-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X size={22} /> : <Menu size={22} />}</button>
          <div className="dash-user"><span className="dash-user-avatar">{initials}</span><span className="dash-user-name">{profile?.full_name || 'User'}</span></div>
        </header>
        <div className="dash-content recruit-content">{children}</div>
      </div>
      {mobileOpen && <div className="dash-overlay" onClick={() => setMobileOpen(false)} />}
    </div>
  );
}
