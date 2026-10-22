import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FunnelChart, Funnel, FunnelChart as FunnelIcon, LabelList,
} from 'recharts';
import { Megaphone, Send, Reply, Calendar, Award, TrendingUp, BellRing, Plus, Play } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { EmptyState, LoadingSkeleton } from '@/components/ui';
import type {
  JpFunnelCount, JpDailySendCount, JpReplyStat, JpReminder,
} from '@/types/db';
import CandidateTriggerModal from '@/components/CandidateTriggerModal';

const STAGE_ORDER = ['identified', 'outreach_sent', 'reply_received', 'interview', 'offer', 'rejected'] as const;
const STAGE_LABELS: Record<string, string> = {
  identified: 'Jobs Identified',
  outreach_sent: 'Outreach Sent',
  reply_received: 'Replies',
  interview: 'Interviews',
  offer: 'Offers',
  rejected: 'Rejected',
};

export default function DashboardPage() {
  const { profile } = useAuth();
  const [funnel, setFunnel] = useState<JpFunnelCount[]>([]);
  const [dailySent, setDailySent] = useState(0);
  const [replyStats, setReplyStats] = useState<JpReplyStat[]>([]);
  const [reminders, setReminders] = useState<JpReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggerOpen, setTriggerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [f, d, r, rem] = await Promise.all([
        supabase.from('jp_funnel_counts').select('*').eq('user_id', profile!.id),
        supabase.from('jp_daily_send_counts').select('*').eq('user_id', profile!.id).eq('day', today),
        supabase.from('jp_reply_stats').select('*').eq('user_id', profile!.id),
        supabase
          .from('jp_reminders')
          .select('*')
          .eq('user_id', profile!.id)
          .eq('done', false)
          .gte('due_at', new Date().toISOString())
          .lte('due_at', new Date(Date.now() + 7 * 86400000).toISOString())
          .order('due_at', { ascending: true }),
      ]);
      setFunnel((f.data as JpFunnelCount[]) ?? []);
      setDailySent((d.data as JpDailySendCount[])?.reduce((s, x) => s + x.sent, 0) ?? 0);
      setReplyStats((r.data as JpReplyStat[]) ?? []);
      setReminders((rem.data as JpReminder[]) ?? []);
      setLoading(false);
    })();
  }, [profile]);

  const funnelMap = new Map(funnel.map((f) => [f.stage, f.total]));
  const funnelData = STAGE_ORDER.filter((s) => s !== 'rejected').map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    value: funnelMap.get(stage) ?? 0,
    fill: stageColors[stage],
  }));

  const kpis = [
    { label: 'Jobs Identified', value: funnelMap.get('identified') ?? 0, icon: Megaphone },
    { label: 'Outreach Sent', value: funnelMap.get('outreach_sent') ?? 0, icon: Send },
    { label: 'Replies', value: funnelMap.get('reply_received') ?? 0, icon: Reply },
    { label: 'Interviews', value: funnelMap.get('interview') ?? 0, icon: Calendar },
  ];

  const dailyCap = profile?.daily_send_cap ?? 15;
  const remaining = Math.max(0, dailyCap - dailySent);

  const toggleReminder = async (id: string, done: boolean) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    await supabase
      .from('jp_reminders')
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .eq('id', id);
  };

  if (loading) {
    return (
      <div>
        <div className="jp-page-header">
          <h1>Dashboard</h1>
        </div>
        <div className="jp-kpi-grid">
          {[0, 1, 2, 3].map((i) => (
            <LoadingSkeleton key={i} className="jp-kpi-card-skel" />
          ))}
        </div>
      </div>
    );
  }

  const hasData = funnelData.some((d) => d.value > 0);

  return (
    <div>
      <div className="jp-page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Track your job search progress at a glance</p>
        </div>
        <div className="jp-dashboard-header-actions">
          <button className="jp-btn-ghost" onClick={() => setTriggerOpen(true)}><Play size={16} /> Trigger scrape</button>
          <Link to="/campaigns" className="jp-btn-primary"><Plus size={18} /> Create campaign</Link>
        </div>
      </div>

      <CandidateTriggerModal open={triggerOpen} onClose={() => setTriggerOpen(false)} />

      <div className="jp-kpi-grid">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="jp-kpi-card">
            <div className="jp-kpi-icon">
              <kpi.icon size={20} />
            </div>
            <div>
              <span className="jp-kpi-value">{kpi.value}</span>
              <span className="jp-kpi-label">{kpi.label}</span>
            </div>
          </div>
        ))}
      </div>

      {!hasData && (
        <EmptyState
          icon={<Megaphone size={36} />}
          title="No activity yet"
          description="Create your first campaign to start discovering jobs and sending outreach automatically."
          action={
            <Link to="/campaigns" className="jp-btn-primary">
              <Plus size={18} /> Create your first campaign
            </Link>
          }
        />
      )}

      {hasData && (
        <div className="jp-dashboard-grid">
          <div className="jp-dashboard-card">
            <h2>Application Funnel</h2>
            <div className="jp-funnel-wrapper">
              <FunnelChart width={400} height={280}>
                <Funnel
                  dataKey="value"
                  data={funnelData}
                  isAnimationActive
                >
                  <LabelList position="right" fill="#1a1a2e" fontSize={12} dataKey="label" />
                </Funnel>
              </FunnelChart>
            </div>
          </div>

          <div className="jp-dashboard-card">
            <h2>Today's Sending</h2>
            <div className="jp-send-progress">
              <div className="jp-send-progress-bar">
                <div
                  className="jp-send-progress-fill"
                  style={{ width: `${Math.min(100, (dailySent / dailyCap) * 100)}%` }}
                />
              </div>
              <div className="jp-send-progress-text">
                <span>{dailySent} sent today</span>
                <span>{remaining} remaining of {dailyCap}</span>
              </div>
            </div>
            <p className="jp-send-note">
              Your daily cap keeps outreach safe. You can adjust it in Settings.
            </p>

            <h3 className="jp-subhead">Reply Rate by Channel</h3>
            <div className="jp-reply-stats">
              {replyStats.length === 0 && <p className="jp-muted">No outreach sent yet.</p>}
              {replyStats.map((stat) => {
                const rate = stat.sent > 0 ? Math.round((stat.replied / stat.sent) * 100) : 0;
                return (
                  <div key={`${stat.channel}-${stat.recipient_type}`} className="jp-reply-stat-row">
                    <span className="jp-reply-stat-label">
                      {stat.channel} · {stat.recipient_type.replace('_', ' ')}
                    </span>
                    <div className="jp-reply-stat-bar">
                      <div className="jp-reply-stat-fill" style={{ width: `${rate}%` }} />
                    </div>
                    <span className="jp-reply-stat-value">{rate}% ({stat.replied}/{stat.sent})</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="jp-dashboard-card jp-reminders-card">
        <h2><BellRing size={18} /> Upcoming Reminders</h2>
        {reminders.length === 0 ? (
          <p className="jp-muted">No reminders in the next 7 days.</p>
        ) : (
          <div className="jp-reminder-list">
            {reminders.map((r) => (
              <div key={r.id} className="jp-reminder-item">
                <label className="jp-checkbox">
                  <input
                    type="checkbox"
                    onChange={(e) => toggleReminder(r.id, e.target.checked)}
                  />
                  <span />
                </label>
                <div className="jp-reminder-body">
                  <strong>{r.title}</strong>
                  <span>{new Date(r.due_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                </div>
                <span className="jp-reminder-kind">{r.kind.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const stageColors: Record<string, string> = {
  identified: '#5B4FE8',
  outreach_sent: '#7B6FF0',
  reply_received: '#9B8FF8',
  interview: '#3b82f6',
  offer: '#22c55e',
};
