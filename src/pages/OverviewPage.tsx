import { useEffect, useState } from 'react';
import { Users, Send, TrendingUp, Building2, Activity as ActivityIcon, ArrowUpRight } from 'lucide-react';
import { supabase, type Client, type Candidate, type OutreachSequence, type Activity } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

export default function OverviewPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [sequences, setSequences] = useState<OutreachSequence[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: c }, { data: cand }, { data: seq }, { data: act }] = await Promise.all([
        supabase.from('clients').select('*').order('created_at', { ascending: false }),
        supabase.from('candidates').select('*').order('created_at', { ascending: false }),
        supabase.from('outreach_sequences').select('*').order('created_at', { ascending: false }),
        supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(10),
      ]);
      setClients((c as Client[]) ?? []);
      setCandidates((cand as Candidate[]) ?? []);
      setSequences((seq as OutreachSequence[]) ?? []);
      setActivities((act as Activity[]) ?? []);
      setLoading(false);
    })();
  }, [user]);

  const repliedCount = sequences.filter((s) => s.status === 'replied').length;
  const contactedCount = sequences.filter((s) => s.status === 'active' || s.status === 'completed').length;

  const stats = [
    { label: 'Active Clients', value: clients.filter((c) => c.status === 'active').length, icon: Building2, color: 'teal' },
    { label: 'Candidates', value: candidates.length, icon: Users, color: 'blue' },
    { label: 'Outreach Sent', value: contactedCount, icon: Send, color: 'amber' },
    { label: 'Replies', value: repliedCount, icon: TrendingUp, color: 'green' },
  ];

  if (loading) return <div className="dash-loading">Loading your dashboard…</div>;

  return (
    <div className="overview-page">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back — here's what's happening in your workspace.</p>
        </div>
      </div>

      <div className="stat-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className={`stat-icon stat-${stat.color}`}><stat.icon size={20} /></div>
            <div className="stat-info">
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="overview-grid">
        <div className="overview-panel">
          <div className="panel-header">
            <h2><ActivityIcon size={18} /> Recent Activity</h2>
          </div>
          {activities.length === 0 ? (
            <div className="empty-state">No activity yet. Start by adding a client.</div>
          ) : (
            <div className="activity-list">
              {activities.map((a) => (
                <div key={a.id} className="activity-item">
                  <span className="activity-dot" />
                  <div>
                    <strong>{a.title}</strong>
                    {a.detail && <p>{a.detail}</p>}
                    <small>{new Date(a.created_at).toLocaleDateString()}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overview-panel">
          <div className="panel-header">
            <h2><Users size={18} /> Recent Candidates</h2>
          </div>
          {candidates.length === 0 ? (
            <div className="empty-state">No candidates yet.</div>
          ) : (
            <div className="recent-candidates">
              {candidates.slice(0, 5).map((c) => (
                <div key={c.id} className="recent-candidate-row">
                  <span className="candidate-avatar">{c.full_name.slice(0, 2)}</span>
                  <div>
                    <b>{c.full_name}</b>
                    <small>{c.role || '—'}</small>
                  </div>
                  <span className={`status-badge status-${c.status}`}>{c.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
