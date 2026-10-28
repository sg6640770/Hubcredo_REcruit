import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import {
  Megaphone, Send, Reply, Calendar, BellRing, Plus, Search, FileText, Mail,
  Linkedin, Inbox, Sparkles, ArrowUpRight, CheckCircle2, Circle, TrendingUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { EmptyState, LoadingSkeleton } from '@/components/ui';
import type {
  JpFunnelCount, JpDailySendCount, JpReplyStat, JpReminder,
} from '@/types/db';
import './dashboard-premium.css';

const STAGE_ORDER = ['identified', 'outreach_sent', 'reply_received', 'interview', 'offer'] as const;
const STAGE_LABELS: Record<string, string> = {
  identified: 'Jobs Identified',
  outreach_sent: 'Outreach Sent',
  reply_received: 'Replies',
  interview: 'Interviews',
  offer: 'Offers',
};
const STAGE_SHORT: Record<string, string> = {
  identified: 'Identified',
  outreach_sent: 'Outreach',
  reply_received: 'Replies',
  interview: 'Interviews',
  offer: 'Offers',
};

const stageColors: Record<string, string> = {
  identified: '#5B4FE8',
  outreach_sent: '#7B6FF0',
  reply_received: '#9B8FF8',
  interview: '#3b82f6',
  offer: '#22c55e',
};

// Candidate-side tools. Adjust the `to` paths if your routes differ.
const TOOLKIT = [
  { to: '/trigger-space', title: 'Find new jobs', desc: 'Run a fresh job search in Trigger Space', icon: Search },
  { to: '/resume-builder', title: 'Resume Builder', desc: 'Tailor your resume for every role', icon: FileText },
  { to: '/cover-letters', title: 'Cover Letters', desc: 'Generate personalised letters in seconds', icon: Mail },
  { to: '/linkedin', title: 'LinkedIn Outreach', desc: 'Reach recruiters and hiring managers', icon: Linkedin },
  { to: '/inbox', title: 'Inbox', desc: 'Follow up on replies and interview invites', icon: Inbox },
];

function ProgressRing({ percent }: { percent: number }) {
  const size = 132;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="pd-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="pdRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#c7c0ff" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#pdRingGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * percent) / 100}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="pd-ring-center">
        <strong>{percent}%</strong>
        <span>Journey</span>
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: { label: string; value: number } }[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="pd-tooltip">
      <span>{item.label}</span>
      <strong>{item.value}</strong>
    </div>
  );
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [funnel, setFunnel] = useState<JpFunnelCount[]>([]);
  const [jobsIdentified, setJobsIdentified] = useState(0);
  const [dailySent, setDailySent] = useState(0);
  const [replyStats, setReplyStats] = useState<JpReplyStat[]>([]);
  const [reminders, setReminders] = useState<JpReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasRunning, setHasRunning] = useState(false);

  const loadData = useCallback(async () => {
    if (!profile) return;
    const today = new Date().toISOString().slice(0, 10);
    const recentRunSince = Date.now() - 15 * 60 * 1000;

    const [f, d, r, rem, runsResult] = await Promise.all([
      supabase.from('jp_funnel_counts').select('*').eq('user_id', profile.id),
      supabase.from('jp_daily_send_counts').select('*').eq('user_id', profile.id).eq('day', today),
      supabase.from('jp_reply_stats').select('*').eq('user_id', profile.id),
      supabase
        .from('jp_reminders')
        .select('*')
        .eq('user_id', profile.id)
        .eq('done', false)
        .gte('due_at', new Date().toISOString())
        .lte('due_at', new Date(Date.now() + 7 * 86400000).toISOString())
        .order('due_at', { ascending: true }),
      // Trigger Space searches: same table and visibility as the "Your recent jobs" chips,
      // so the dashboard total always equals the sum of those chips (deleting a search lowers it)
      supabase.from('job_search_runs').select('jobs_found, status, created_at'),
    ]);

    if (runsResult.error) {
      console.error('Dashboard: could not load Trigger Space searches:', runsResult.error.message);
    }

    const runs = (runsResult.data as { jobs_found: number | null; status: string; created_at: string }[] | null) ?? [];
    const identified = runs.reduce((sum, run) => sum + (run.jobs_found ?? 0), 0);
    // A search started in the last 15 minutes that is still running → keep refreshing
    const running = runs.some((run) => run.status === 'running' && new Date(run.created_at).getTime() > recentRunSince);

    setFunnel((f.data as JpFunnelCount[]) ?? []);
    setJobsIdentified(identified);
    setDailySent((d.data as JpDailySendCount[])?.reduce((s, x) => s + x.sent, 0) ?? 0);
    setReplyStats((r.data as JpReplyStat[]) ?? []);
    setReminders((rem.data as JpReminder[]) ?? []);
    setHasRunning(running);
    setLoading(false);
  }, [profile]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Refresh when the user comes back to this tab (e.g. after deleting a search in Trigger Space)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadData();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadData]);

  // While a search is running, refresh every 5 s so the number climbs as jobs arrive
  useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => { void loadData(); }, 5000);
    return () => window.clearInterval(timer);
  }, [hasRunning, loadData]);

  const funnelMap = new Map(funnel.map((f) => [f.stage, f.total]));
  const chartData = STAGE_ORDER.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    short: STAGE_SHORT[stage],
    value: stage === 'identified' ? jobsIdentified : funnelMap.get(stage) ?? 0,
    fill: stageColors[stage],
  }));

  const outreachSent = funnelMap.get('outreach_sent') ?? 0;
  const replies = funnelMap.get('reply_received') ?? 0;
  const interviews = funnelMap.get('interview') ?? 0;
  const offers = funnelMap.get('offer') ?? 0;
  const replyRate = outreachSent > 0 ? Math.round((replies / outreachSent) * 100) : 0;

  const kpis = [
    { label: 'Jobs Identified', value: jobsIdentified, icon: Megaphone, hint: hasRunning ? 'Search running…' : 'From Trigger Space', tone: 'violet' },
    { label: 'Outreach Sent', value: outreachSent, icon: Send, hint: 'Emails & LinkedIn', tone: 'indigo' },
    { label: 'Replies', value: replies, icon: Reply, hint: `${replyRate}% reply rate`, tone: 'blue' },
    { label: 'Interviews', value: interviews, icon: Calendar, hint: offers > 0 ? `${offers} offer${offers > 1 ? 's' : ''} 🎉` : 'Keep going', tone: 'green' },
  ];

  // Candidate journey: 4 milestones → progress ring
  const milestones = [
    { label: 'Discover jobs', done: jobsIdentified > 0 },
    { label: 'Send outreach', done: outreachSent > 0 },
    { label: 'Get a reply', done: replies > 0 },
    { label: 'Land an interview', done: interviews > 0 },
  ];
  const journeyPercent = Math.round((milestones.filter((m) => m.done).length / milestones.length) * 100);

  const dailyCap = profile?.daily_send_cap ?? 15;
  const remaining = Math.max(0, dailyCap - dailySent);
  const sendPercent = dailyCap > 0 ? Math.min(100, (dailySent / dailyCap) * 100) : 0;

  const fullName = (profile as unknown as { full_name?: string } | null)?.full_name;
  const firstName = fullName?.split(' ')[0] ?? 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const toggleReminder = async (id: string, done: boolean) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    await supabase
      .from('jp_reminders')
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .eq('id', id);
  };

  if (loading) {
    return (
      <div className="pd-page">
        <div className="pd-hero pd-hero-skel" />
        <div className="pd-kpi-grid">
          {[0, 1, 2, 3].map((i) => (
            <LoadingSkeleton key={i} className="jp-kpi-card-skel" />
          ))}
        </div>
      </div>
    );
  }

  const hasData = chartData.some((d) => d.value > 0);

  return (
    <div className="pd-page">
      {/* ───────── Hero ───────── */}
      <section className="pd-hero">
        <div className="pd-hero-glow pd-hero-glow-1" />
        <div className="pd-hero-glow pd-hero-glow-2" />

        <div className="pd-hero-main">
          <span className="pd-hero-badge"><Sparkles size={14} /> Your job search command centre</span>
          <h1>{greeting}, {firstName}</h1>
          <p>
            {journeyPercent === 100
              ? "You've hit every milestone — keep the momentum going."
              : 'Track your progress, automate outreach and land interviews faster.'}
          </p>

          <ul className="pd-milestones">
            {milestones.map((m) => (
              <li key={m.label} className={m.done ? 'is-done' : ''}>
                {m.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                {m.label}
              </li>
            ))}
          </ul>

          <div className="pd-hero-actions">
            <Link to="/campaigns" className="pd-btn pd-btn-light"><Plus size={18} /> Create campaign</Link>
            <Link to="/trigger-space" className="pd-btn pd-btn-glass">Find new jobs <ArrowUpRight size={16} /></Link>
          </div>
        </div>

        <div className="pd-hero-side">
          <ProgressRing percent={journeyPercent} />
          <p>{milestones.filter((m) => m.done).length} of {milestones.length} milestones</p>
        </div>
      </section>

      {/* ───────── KPIs ───────── */}
      <div className="pd-kpi-grid">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`pd-kpi pd-tone-${kpi.tone}`}>
            <div className="pd-kpi-icon"><kpi.icon size={20} /></div>
            <div className="pd-kpi-body">
              <span className="pd-kpi-label">{kpi.label}</span>
              <span className="pd-kpi-value">{kpi.value}</span>
              <span className="pd-kpi-hint"><TrendingUp size={12} /> {kpi.hint}</span>
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

      {/* ───────── Chart + Sending ───────── */}
      {hasData && (
        <div className="pd-grid-2">
          <div className="pd-card">
            <div className="pd-card-head">
              <div>
                <h2>Application Progress</h2>
                <p>How your search moves through each stage</p>
              </div>
              <span className="pd-chip">{jobsIdentified > 0 ? `${replyRate}% reply rate` : 'Getting started'}</span>
            </div>

            <div className="pd-chart">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 24, right: 8, left: -18, bottom: 0 }} barCategoryGap="22%">
                  <defs>
                    {chartData.map((d) => (
                      <linearGradient key={d.stage} id={`pd-grad-${d.stage}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={d.fill} stopOpacity={1} />
                        <stop offset="100%" stopColor={d.fill} stopOpacity={0.55} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#e9e8f5" />
                  <XAxis dataKey="short" axisLine={false} tickLine={false} tick={{ fill: '#8a8aa3', fontSize: 12 }} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#8a8aa3', fontSize: 12 }} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(91,79,232,0.06)', radius: 8 }} />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]} maxBarSize={64} isAnimationActive>
                    {chartData.map((d) => (
                      <Cell key={d.stage} fill={`url(#pd-grad-${d.stage})`} />
                    ))}
                    <LabelList dataKey="value" position="top" fill="#1a1a2e" fontSize={13} fontWeight={700} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pd-card">
            <div className="pd-card-head">
              <div>
                <h2>Today's Sending</h2>
                <p>Daily cap keeps outreach safe</p>
              </div>
            </div>

            <div className="pd-send-stat">
              <strong>{dailySent}</strong>
              <span>/ {dailyCap} sent today</span>
            </div>
            <div className="pd-bar">
              <div className="pd-bar-fill" style={{ width: `${sendPercent}%` }} />
            </div>
            <div className="pd-send-meta">
              <span>{remaining} remaining</span>
              <Link to="/settings">Adjust in Settings</Link>
            </div>

            <h3 className="pd-subhead">Reply Rate by Channel</h3>
            <div className="pd-reply-list">
              {replyStats.length === 0 && <p className="pd-muted">No outreach sent yet.</p>}
              {replyStats.map((stat) => {
                const rate = stat.sent > 0 ? Math.round((stat.replied / stat.sent) * 100) : 0;
                return (
                  <div key={`${stat.channel}-${stat.recipient_type}`} className="pd-reply-row">
                    <div className="pd-reply-top">
                      <span>{stat.channel} · {stat.recipient_type.replace('_', ' ')}</span>
                      <strong>{rate}% <em>({stat.replied}/{stat.sent})</em></strong>
                    </div>
                    <div className="pd-bar pd-bar-sm">
                      <div className="pd-bar-fill" style={{ width: `${rate}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ───────── Candidate toolkit + Reminders ───────── */}
      <div className="pd-grid-2 pd-grid-2-rev">
        <div className="pd-card">
          <div className="pd-card-head">
            <div>
              <h2>Candidate Toolkit</h2>
              <p>Everything you need to stand out, one click away</p>
            </div>
          </div>
          <div className="pd-toolkit">
            {TOOLKIT.map((t) => (
              <Link key={t.to} to={t.to} className="pd-tool">
                <div className="pd-tool-icon"><t.icon size={20} /></div>
                <div className="pd-tool-body">
                  <strong>{t.title}</strong>
                  <span>{t.desc}</span>
                </div>
                <ArrowUpRight size={16} className="pd-tool-arrow" />
              </Link>
            ))}
          </div>
        </div>

        <div className="pd-card">
          <div className="pd-card-head">
            <div>
              <h2><BellRing size={18} /> Upcoming Reminders</h2>
              <p>Next 7 days</p>
            </div>
            {reminders.length > 0 && <span className="pd-chip">{reminders.length}</span>}
          </div>
          {reminders.length === 0 ? (
            <div className="pd-empty-mini">
              <BellRing size={28} />
              <p>No reminders in the next 7 days.</p>
            </div>
          ) : (
            <div className="pd-reminders">
              {reminders.map((r) => (
                <div key={r.id} className="pd-reminder">
                  <label className="jp-checkbox">
                    <input type="checkbox" onChange={(e) => toggleReminder(r.id, e.target.checked)} />
                    <span />
                  </label>
                  <div className="pd-reminder-body">
                    <strong>{r.title}</strong>
                    <span>{new Date(r.due_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  </div>
                  <span className="pd-chip pd-chip-soft">{r.kind.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
