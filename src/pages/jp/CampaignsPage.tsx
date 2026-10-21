import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pause, Play, Square, Megaphone, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { Badge, EmptyState, LoadingSkeleton, Modal, TagInput } from '@/components/ui';
import { api, InsufficientCreditsError } from '@/lib/api';
import type { JpCampaign, JpResume, CampaignStatus } from '@/types/db';

const STATUS_VARIANT: Record<CampaignStatus, 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  draft: 'neutral',
  discovering: 'info',
  active: 'success',
  paused: 'warning',
  completed: 'primary',
  stopped: 'neutral',
  failed: 'error',
};

export default function CampaignsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [campaigns, setCampaigns] = useState<JpCampaign[]>([]);
  const [resumes, setResumes] = useState<JpResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);

  const load = async () => {
    if (!profile) return;
    const [c, r] = await Promise.all([
      supabase.from('jp_campaigns').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('jp_resumes').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
    ]);
    setCampaigns((c.data as JpCampaign[]) ?? []);
    setResumes((r.data as JpResume[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile]);

  const updateStatus = async (id: string, status: CampaignStatus) => {
    await supabase.from('jp_campaigns').update({ status }).eq('id', id);
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    toast.show(`Campaign ${status}`, 'success');
  };

  const launch = async (id: string) => {
    setLaunching(id);
    try {
      await api.launchCampaign(id);
      await supabase.from('jp_campaigns').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', id);
      setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'active', started_at: new Date().toISOString() } : c)));
      toast.show('Campaign launched! Jobs are being discovered.', 'success');
    } catch (e) {
      if (e instanceof InsufficientCreditsError) toast.show('Out of credits. Top up in Settings to launch.', 'error');
      else toast.show('Launch failed. Try again.', 'error');
    }
    setLaunching(null);
  };

  if (loading) return <div className="jp-page-header"><h1>Campaigns</h1><LoadingSkeleton className="jp-card-skel" /></div>;

  return (
    <div>
      <div className="jp-page-header">
        <div><h1>Campaigns</h1><p>Manage your job discovery and outreach campaigns</p></div>
        <button className="jp-btn-primary" onClick={() => setShowNew(true)}>
          <Plus size={18} /> New campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={36} />}
          title="No campaigns yet"
          description="Create a campaign to automatically discover matching jobs and send personalized outreach."
          action={<button className="jp-btn-primary" onClick={() => setShowNew(true)}><Plus size={18} /> Create your first campaign</button>}
        />
      ) : (
        <div className="jp-campaign-list">
          {campaigns.map((c) => (
            <div key={c.id} className="jp-campaign-card">
              <Link to={`/campaigns/${c.id}`} className="jp-campaign-info">
                <h3>{c.name}</h3>
                <p>{c.target_role} {c.industry ? `· ${c.industry}` : ''}</p>
                <div className="jp-campaign-meta">
                  <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
                  <span>Daily cap: {c.daily_cap}</span>
                  {c.channel_linkedin && <span>LinkedIn (soon)</span>}
                </div>
              </Link>
              <div className="jp-campaign-actions">
                {c.status === 'draft' && (
                  <button className="jp-btn-primary jp-btn-sm" disabled={launching === c.id} onClick={() => launch(c.id)}>
                    {launching === c.id ? 'Launching…' : 'Launch'}
                  </button>
                )}
                {c.status === 'active' && <button className="jp-btn-ghost jp-btn-sm" onClick={() => updateStatus(c.id, 'paused')}><Pause size={14} /> Pause</button>}
                {c.status === 'paused' && <button className="jp-btn-ghost jp-btn-sm" onClick={() => updateStatus(c.id, 'active')}><Play size={14} /> Resume</button>}
                {(c.status === 'active' || c.status === 'paused' || c.status === 'discovering') && (
                  <button className="jp-btn-danger jp-btn-sm" onClick={() => updateStatus(c.id, 'stopped')}><Square size={14} /> Stop</button>
                )}
                <Link to={`/campaigns/${c.id}`} className="jp-btn-ghost jp-btn-sm">Details <ArrowRight size={14} /></Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewCampaignModal open={showNew} onClose={() => setShowNew(false)} resumes={resumes} onCreated={load} />
    </div>
  );
}

function NewCampaignModal({ open, onClose, resumes, onCreated }: { open: boolean; onClose: () => void; resumes: JpResume[]; onCreated: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [currentRole, setCurrentRole] = useState(profile?.current_job_title ?? '');
  const [targetRole, setTargetRole] = useState(profile?.target_role ?? '');
  const [industry, setIndustry] = useState(profile?.target_industry ?? '');
  const [locations, setLocations] = useState<string[]>(profile?.target_locations ?? []);
  const [dealbreakers, setDealbreakers] = useState<string[]>(profile?.dealbreakers ?? []);
  const [resumeId, setResumeId] = useState(resumes.find((r) => r.is_primary)?.id ?? resumes[0]?.id ?? '');
  const [dailyCap, setDailyCap] = useState(profile?.daily_send_cap ?? 15);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    const { data, error } = await supabase.from('jp_campaigns').insert({
      user_id: profile.id,
      resume_id: resumeId || null,
      name: name || `${targetRole} campaign`,
      current_job_title: currentRole,
      target_role: targetRole,
      industry: industry || null,
      locations,
      dealbreakers,
      channel_email: true,
      channel_linkedin: false,
      daily_cap: dailyCap,
      status: 'draft',
    }).select().single();
    setBusy(false);
    if (error) { toast.show('Could not create campaign.', 'error'); return; }
    toast.show('Campaign created! Launch it to start discovery.', 'success');
    onCreated();
    onClose();
    setName(''); setLocations([]); setDealbreakers([]);
  };

  return (
    <Modal open={open} onClose={onClose} title="New campaign" size="lg">
      <form onSubmit={submit} className="jp-form">
        <label><span>Campaign name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior PM roles, Q4 2026" /></label>
        <div className="jp-form-row">
          <label><span>Current role</span><input value={currentRole} onChange={(e) => setCurrentRole(e.target.value)} required /></label>
          <label><span>Target role</span><input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} required /></label>
        </div>
        <div className="jp-form-row">
          <label><span>Industry (optional)</span><input value={industry} onChange={(e) => setIndustry(e.target.value)} /></label>
          <label><span>Resume to use</span>
            <select value={resumeId} onChange={(e) => setResumeId(e.target.value)}>
              {resumes.length === 0 && <option value="">No resumes yet</option>}
              {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.is_primary ? ' (primary)' : ''}</option>)}
            </select>
          </label>
        </div>
        <label><span>Preferred locations</span><TagInput values={locations} onChange={setLocations} placeholder="e.g. Remote, New York" /></label>
        <label><span>Dealbreakers</span><TagInput values={dealbreakers} onChange={setDealbreakers} placeholder="e.g. no agencies, no relocation" /></label>
        <label>
          <span>Daily send cap: {dailyCap}</span>
          <input type="range" min={5} max={30} value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))} />
          <small>Recommended: 15. Higher caps risk email deliverability issues.</small>
        </label>
        <div className="jp-form-actions">
          <button type="button" className="jp-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="jp-btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create campaign'}</button>
        </div>
      </form>
    </Modal>
  );
}
