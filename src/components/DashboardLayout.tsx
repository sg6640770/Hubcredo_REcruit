import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Megaphone,
  Send,
  Linkedin,
  KanbanSquare,
  Inbox,
  FileText,
  Mail,
  Plug,
  Settings as SettingsIcon,
  Menu,
  X,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/linkedin', label: 'LinkedIn', icon: Linkedin },
  { to: '/trigger-space', label: 'Trigger Space', icon: Plug },
  { to: '/applications', label: 'Applications', icon: KanbanSquare },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/resume-builder', label: 'Resume Builder', icon: FileText },
  { to: '/cover-letters', label: 'Cover Letters', icon: Mail },
  { to: '/settings', label: 'Settings & Billing', icon: SettingsIcon },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const initials = (profile?.full_name || 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="jp-shell">
      {sidebarOpen && <div className="jp-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={`jp-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="jp-sidebar-brand">
          <span className="jp-entry-logo-mark">JP</span>
          <span>JobPilot</span>
          <button className="jp-sidebar-close" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <nav className="jp-sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`jp-nav-item ${active ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="jp-sidebar-footer">
          <button onClick={signOut} className="jp-nav-item">
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="jp-main">
        <header className="jp-topbar">
          <button className="jp-mobile-toggle" onClick={() => setSidebarOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="jp-topbar-credits">
            <Sparkles size={16} />
            <span>{profile?.credit_balance ?? 0} credits</span>
          </div>
          <Link to="/settings" className="jp-topbar-user">
            {profile?.photo_url ? (
              <img src={profile.photo_url} alt="" />
            ) : (
              <span className="jp-topbar-avatar">{initials}</span>
            )}
            <span className="jp-topbar-name">{profile?.full_name || 'User'}</span>
          </Link>
        </header>
        <main className="jp-content">{children}</main>
      </div>
    </div>
  );
}
